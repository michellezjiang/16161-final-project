import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Humanoid } from '../../characters/Humanoid.js';
import { canvasTexture, signTexture } from '../../core/canvasTexture.js';
import { asphaltTexture, cloudTexture, facadeTextures, pavingTexture } from './cityTextures.js';

// The street seen from the window: a city that looks like today's, except that
// humanoid robots are an ordinary part of the workforce.
//
// Coordinates are in the room's space. The street runs along z, outside the
// wall at x = facadeX, with the ground `groundY` below the room's floor.

const rand = mulberry(42);
const WRAP = 90; // movers loop between -WRAP and +WRAP along the street

export class CityView {
  constructor({ renderer, facadeX = -3.75, groundY = -7.2, windowRect, sunDirection }) {
    this.root = new THREE.Group();
    this.root.name = 'CityView';
    this.movers = [];
    this.animated = [];

    this.facadeX = facadeX;
    this.g = groundY;
    // Cross-street layout, measured outward from our facade (x decreasing).
    this.nearWalk = [facadeX, facadeX - 4.2];
    this.road = [facadeX - 4.2, facadeX - 14.2];
    this.farWalk = [facadeX - 14.2, facadeX - 18.4];
    this.farFacade = facadeX - 18.4;

    this.#sky(sunDirection);
    this.#ownFacade(windowRect);
    this.#streets();
    this.#buildings();
    this.#construction();
    this.#skyline();
    this.#streetFurniture();
    this.#traffic();
    this.#people();
    this.#drones();
    this.#finish(renderer);
  }

  update(dt) {
    for (const mover of this.movers) {
      const { object, axis, speed } = mover;
      object.position[axis] += speed * dt;
      if (object.position[axis] > mover.max) object.position[axis] = mover.min;
      if (object.position[axis] < mover.min) object.position[axis] = mover.max;
      mover.humanoid?.update(dt);
      mover.update?.(dt, object);
    }
    for (const fn of this.animated) fn(dt);
  }

  // ---------------------------------------------------------------- helpers

  #add(object, x = 0, y = 0, z = 0) {
    object.position.set(x, y, z);
    this.root.add(object);
    return object;
  }

  #box(w, h, d, material, x, y, z) {
    return this.#add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material), x, y, z);
  }

  /** Something that travels along z (or x) and wraps around at the ends of the street. */
  #mover(object, { speed, axis = 'z', min = -WRAP, max = WRAP, humanoid, update }) {
    if (humanoid) {
      humanoid.stepRate = Math.abs(speed) / 1.4;
      object.rotation.y = speed > 0 ? 0 : Math.PI;
    }
    this.movers.push({ object, speed, axis, min, max, humanoid, update });
    this.root.add(object);
    return object;
  }

  // ---------------------------------------------------------------- sky

  #sky(sunDirection) {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        sunDir: { value: sunDirection.clone().normalize() },
        zenith: { value: new THREE.Color(0x3d6fa8) },
        horizon: { value: new THREE.Color(0xf2c99a) },
        ground: { value: new THREE.Color(0x8a7a6a) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 sunDir, zenith, horizon, ground;
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.45));
          col = mix(col, ground, smoothstep(0.0, -0.08, h));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          col += vec3(1.0, 0.8, 0.55) * (pow(s, 8.0) * 0.35 + pow(s, 800.0) * 6.0);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.skyMaterial = material;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), material);
    sky.renderOrder = -1;
    sky.userData.noShadow = true;
    this.root.add(sky);

    // A high, broken cloud layer. Seen at a grazing angle it bunches up toward the horizon.
    const clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshBasicMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, fog: false, color: 0xfff4e6 })
    );
    clouds.rotation.x = Math.PI / 2;
    clouds.position.set(-600, 260, 0);
    clouds.renderOrder = -1;
    clouds.userData.noShadow = true;
    this.root.add(clouds);
  }

  // ---------------------------------------------------------------- our building

  /** The outside of our own wall, with a hole where the window is. Seen at grazing angles. */
  #ownFacade({ zMin, zMax, yMin, yMax }) {
    const style = { kind: 'stone', wall: '#b3a48f', trim: '#cdbfa8', frame: '#3b3630', lit: 0.15 };
    const x = this.facadeX - 0.03;
    const top = this.g + 26;
    const t = 0.06;
    // Each piece tiles the facade in world units (one tile = 4 bays of 3 m by 4 storeys of 3.4 m),
    // offset so windows line up across the pieces around our own window.
    const piece = (y0, y1, z0, z1) => {
      const material = this.#facadeMaterial(style, (z1 - z0) / 12, (y1 - y0) / 13.6);
      for (const key of ['map', 'roughnessMap', 'bumpMap', 'emissiveMap']) material[key].offset.set(z0 / 12, (y0 - this.g) / 13.6);
      this.#box(t, y1 - y0, z1 - z0, material, x, (y0 + y1) / 2, (z0 + z1) / 2);
    };
    piece(this.g, yMin, -WRAP, WRAP);
    piece(yMax, top, -WRAP, WRAP);
    piece(yMin, yMax, -WRAP, zMin);
    piece(yMin, yMax, zMax, WRAP);
    // Narrow stone ledge outside the window; its top sits 1 cm above the wall's so the two don't z-fight.
    const stone = new THREE.MeshStandardMaterial({ color: style.trim, roughness: 0.9 });
    this.#box(0.08, 0.06, zMax - zMin + 0.3, stone, x - 0.04, yMin - 0.02, (zMin + zMax) / 2);
  }

  // ---------------------------------------------------------------- ground

  #streets() {
    const g = this.g;
    const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture([160, 160]), roughness: 0.92 });
    const paving = new THREE.MeshStandardMaterial({ map: pavingTexture([4.2 / 3, (WRAP * 2) / 3]), roughness: 0.85 });
    const kerb = new THREE.MeshStandardMaterial({ color: 0x9c9890, roughness: 0.8 });
    const paint = new THREE.MeshStandardMaterial({ color: 0xdedbd0, roughness: 0.7 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xd2a636, roughness: 0.7 });

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), asphalt);
    ground.rotation.x = -Math.PI / 2;
    ground.userData.noShadow = true;
    this.#add(ground, -100, g, 0);

    const [r0, r1] = this.road;
    for (const [a, b] of [this.nearWalk, this.farWalk]) {
      const walk = this.#box(Math.abs(b - a), 0.15, WRAP * 2, [kerb, kerb, paving, kerb, kerb, kerb], (a + b) / 2, g + 0.075, 0);
      walk.userData.noShadow = true;
      // Granite kerbstone along the road edge.
      const edge = a === this.nearWalk[0] ? b : a;
      this.#box(0.2, 0.17, WRAP * 2, kerb, edge, g + 0.085, 0).userData.noShadow = true;
    }
    const mid = (r0 + r1) / 2;
    const marking = (w, d, m, x, z) => (this.#box(w, 0.012, d, m, x, g + 0.006, z).userData.noShadow = true);
    // Double yellow centre line, dashed white lane lines, crosswalk.
    marking(0.1, WRAP * 2, yellow, mid + 0.1, 0);
    marking(0.1, WRAP * 2, yellow, mid - 0.1, 0);
    for (let z = -WRAP; z < WRAP; z += 6) {
      marking(0.12, 3, paint, (r0 + mid) / 2, z);
      marking(0.12, 3, paint, (r1 + mid) / 2, z);
    }
    for (let x = r1 + 0.6; x < r0 - 0.3; x += 1.0) marking(0.5, 3, paint, x, -14);
  }

  // ---------------------------------------------------------------- buildings across the street

  /** Facade maps for a style, cloned with a repeat so each building tiles them to its own size. */
  #facadeMaterial(style, repeatX, repeatY) {
    this.facadeCache ??= new Map();
    if (!this.facadeCache.has(style)) this.facadeCache.set(style, facadeTextures(style));
    const maps = this.facadeCache.get(style);
    const tiled = {};
    for (const [key, texture] of Object.entries(maps)) {
      tiled[key] = texture.clone();
      tiled[key].repeat.set(repeatX, repeatY);
    }
    return new THREE.MeshStandardMaterial({
      ...tiled,
      roughness: 1,
      metalness: 0,
      bumpScale: 2.5,
      emissive: 0xffffff,
      emissiveIntensity: 0.6,
    });
  }

  #buildings() {
    const g = this.g;
    const styles = [
      { kind: 'brick', wall: '#7e4334', trim: '#d9cdb8', frame: '#ece4d4' },
      { kind: 'stone', wall: '#c7bba3', trim: '#ddd3bf', frame: '#4c443a' },
      { kind: 'concrete', wall: '#8a8c8e', trim: '#a5a7a8', frame: '#2f3439' },
      { kind: 'brick', wall: '#9a5e44', trim: '#e2d8c6', frame: '#2c2a28' },
      { kind: 'glass', wall: '#56626e', trim: '#7d8a96', frame: '#a9b6c2', lit: 0.3 },
      { kind: 'stone', wall: '#d6ccb8', trim: '#ebe3d2', frame: '#3a454d' },
    ];
    const shops = [
      ['SERVO & SONS', 'Robot repair · actuator tune-ups', '#1f3b4d'],
      ['CAFÉ ANALOG', 'Coffee made by human hands', '#5a3a24'],
      ['MERIDIAN LABOR EXCHANGE', 'Now hiring: humans & humanoids', '#2f4a2f'],
      ['BATTERY SWAP 24/7', 'All humanoid models · 4 min', '#7a1f1f'],
      ['PHARMACY', 'Open late', '#1d5c4f'],
      ['JOINTS & BEARINGS', 'Parts for every frame', '#3d3a6b'],
      ['CORNER GROCERY', 'Fresh produce daily', '#4d5a1f'],
      ['HALDEN ROBOTICS', 'Showroom · test a coworker today', '#222831'],
    ];
    const awningColors = ['#2f5a46', '#7a2a24', '#23384f', '#5a4a2a'];
    const roof = new THREE.MeshStandardMaterial({ color: 0x67635d, roughness: 0.95 });
    const shopFrame = new THREE.MeshStandardMaterial({ color: 0x24221f, roughness: 0.5, metalness: 0.4 });
    const shopGlass = new THREE.MeshStandardMaterial({ color: 0x1a2128, roughness: 0.04, metalness: 0.1 });
    const x0 = this.farFacade;
    const depth = 14;
    let z = -78;
    let i = 0;
    while (z < 78) {
      const width = 10 + rand() * 8;
      if (z + width > 4 && z < 22) {
        z = 22; // leave the construction site open
        continue;
      }
      const style = styles[i % styles.length];
      const height = 12 + rand() * 22;
      const floors = height / 3.4;
      const bays = Math.max(2, Math.round(width / 3));
      const facade = this.#facadeMaterial(style, bays / 4, floors / 4);
      const side = this.#facadeMaterial(style, depth / 3 / 4, floors / 4);
      const trim = new THREE.MeshStandardMaterial({ color: style.trim, roughness: 0.85 });
      const zc = z + width / 2;
      const building = new THREE.Mesh(new THREE.BoxGeometry(depth, height, width), [facade, side, roof, roof, side, side]);
      this.#add(building, x0 - depth / 2, g + height / 2, zc);

      // Cornice and parapet at the top, a stone band above the shops.
      this.#box(depth + 0.7, 0.45, width + 0.5, trim, x0 - depth / 2, g + height - 0.25, zc);
      this.#box(depth + 0.2, 0.9, width + 0.1, trim, x0 - depth / 2, g + height + 0.4, zc);
      this.#box(0.3, 0.45, width, trim, x0 + 0.1, g + 4.5, zc);

      // Shopfront: dark frame, big reflective glass, fascia sign, sometimes an awning.
      const [name, tagline, color] = shops[i % shops.length];
      this.#box(0.14, 4.2, width * 0.96, shopFrame, x0 + 0.07, g + 2.1, zc);
      this.#box(0.05, 2.7, width * 0.86, shopGlass, x0 + 0.16, g + 1.55, zc);
      const sign = new THREE.MeshStandardMaterial({
        map: signTexture(1024, 200, { background: color, lines: [[name, 92], [tagline, 40, '#f2ead8', 500]] }),
        roughness: 0.55,
      });
      // A box's +x face runs u toward -z, which is left-to-right for someone looking from the street.
      this.#box(0.08, 0.75, width * 0.86, sign, x0 + 0.18, g + 3.5, zc);
      if (i % 2 === 0) {
        const stripes = canvasTexture(256, 64, (ctx, w, h) => {
          for (let k = 0; k < 8; k++) {
            ctx.fillStyle = k % 2 ? '#e9e2d0' : awningColors[(i / 2) % awningColors.length];
            ctx.fillRect((k * w) / 8, 0, w / 8, h);
          }
        });
        stripes.wrapS = THREE.RepeatWrapping;
        stripes.repeat.set(width / 8, 1);
        const awning = this.#box(1.5, 0.04, width * 0.8, new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.9 }), x0 + 0.85, g + 2.85, zc);
        awning.rotation.z = -0.38;
      }

      // Rooftop clutter.
      const metal = new THREE.MeshStandardMaterial({ color: 0x9a9c9e, roughness: 0.5, metalness: 0.6 });
      for (let k = 0; k < 2 + Math.floor(rand() * 3); k++) {
        this.#box(1.4, 1, 1.1, metal, x0 - 3 - rand() * (depth - 6), g + height + 0.5, z + 2 + rand() * (width - 4));
      }
      if (rand() < 0.4) this.#waterTank(x0 - depth * 0.6, g + height, z + width * (0.3 + rand() * 0.4));

      if (i === 2) this.#billboard(x0 - depth / 2, g + height, zc);
      z += width + 0.4;
      i++;
    }
  }

  #waterTank(x, y, z) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b5340, roughness: 0.9 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.6, metalness: 0.5 });
    const tank = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 2.6, 20), wood);
    barrel.position.y = 3.1;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.9, 20), steel);
    cap.position.y = 4.85;
    tank.add(barrel, cap);
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 6), steel);
      leg.position.set(dx * 0.9, 0.9, dz * 0.9);
      tank.add(leg);
    }
    this.#add(tank, x, y, z);
  }

  #billboard(x, y, z) {
    const steel = new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.6, metalness: 0.6 });
    const ad = canvasTexture(1400, 560, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#0f2235');
      grad.addColorStop(1, '#24506e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // Simple robot silhouette.
      ctx.fillStyle = '#e8ecef';
      const cx = w * 0.2;
      ctx.beginPath();
      ctx.roundRect(cx - 55, 90, 110, 120, 30);
      ctx.roundRect(cx - 95, 225, 190, 200, 40);
      ctx.roundRect(cx - 135, 235, 34, 190, 16);
      ctx.roundRect(cx + 101, 235, 34, 190, 16);
      ctx.roundRect(cx - 70, 435, 55, 120, 18);
      ctx.roundRect(cx + 15, 435, 55, 120, 18);
      ctx.fill();
      ctx.fillStyle = '#0f2235';
      ctx.fillRect(cx - 42, 130, 84, 34);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.font = '800 92px Helvetica, Arial, sans-serif';
      ctx.fillText('HALDEN H-4', w * 0.38, h * 0.32);
      ctx.font = '500 52px Helvetica, Arial, sans-serif';
      ctx.fillText('The coworker who never', w * 0.38, h * 0.5);
      ctx.fillText('misses a shift.', w * 0.38, h * 0.61);
      ctx.fillStyle = '#9fd3f0';
      ctx.font = '600 44px Helvetica, Arial, sans-serif';
      ctx.fillText('Lease from $349/mo · Union-certified', w * 0.38, h * 0.8);
    });
    const board = new THREE.MeshStandardMaterial({ map: ad, roughness: 0.5, emissiveMap: ad, emissive: 0x404040 });
    this.#box(0.3, 5, 12.5, [board, steel, steel, steel, steel, steel], x + 4, y + 4.2, z);
    for (const dz of [-4, 4]) this.#box(0.25, 2, 0.25, steel, x + 4.2, y + 1, z + dz);
  }

  // ---------------------------------------------------------------- construction site

  #construction() {
    const g = this.g;
    const x0 = this.farFacade;
    const z0 = 4;
    const z1 = 22;
    const concrete = new THREE.MeshStandardMaterial({ color: 0xb4afa6, roughness: 0.95 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xc9562c, roughness: 0.6, metalness: 0.4 });
    const fence = new THREE.MeshStandardMaterial({ color: 0x2f4f6f, roughness: 0.8 });
    const levels = [0, 4, 8, 12];

    // Slabs and columns of a frame going up.
    levels.forEach((h, k) => {
      if (k > 0) this.#box(13, 0.3, z1 - z0 - 1, concrete, x0 - 7, g + h, (z0 + z1) / 2);
      if (k < levels.length - 1) {
        for (let cx = 0; cx < 3; cx++) {
          for (let cz = 0; cz < 4; cz++) {
            this.#box(0.35, 4, 0.35, steel, x0 - 1 - cx * 5.5, g + h + 2, z0 + 1 + cz * ((z1 - z0 - 2) / 3));
          }
        }
      }
    });
    // Top floor beams.
    for (let cz = 0; cz < 4; cz++) this.#box(12, 0.35, 0.3, steel, x0 - 6.5, g + 15.8, z0 + 1 + cz * ((z1 - z0 - 2) / 3));

    // Hoarding along the sidewalk.
    const hoardingTex = signTexture(2048, 256, {
      background: '#2f4f6f',
      lines: [['BUILT BY HALDEN CREWS · UNION LOCAL 7 (HUMAN & HUMANOID MEMBERS) · NO HARD HAT, NO SHIFT', 64, '#f4f1ea', 700]],
    });
    this.#box(0.08, 2.2, z1 - z0, [new THREE.MeshStandardMaterial({ map: hoardingTex, roughness: 0.8 }), fence, fence, fence, fence, fence], x0 + 0.4, g + 1.25, (z0 + z1) / 2);

    // Robots at work on the frame.
    const hammerer = new Humanoid({ kind: 'robot', palette: 'safety' });
    hammerer.pose = 'work';
    hammerer.root.rotation.y = Math.PI / 2;
    this.#add(hammerer.root, x0 - 3, g + 4.15, z0 + 4);
    this.animated.push((dt) => hammerer.update(dt));

    const welder = new Humanoid({ kind: 'robot', palette: 'graphite' });
    welder.pose = 'work';
    welder.root.rotation.y = -Math.PI / 2;
    this.#add(welder.root, x0 - 9, g + 8.15, z0 + 12);
    this.animated.push((dt) => welder.update(dt * 0.8));

    // A robot carrying a beam back and forth along the second floor.
    const carrier = new Humanoid({ kind: 'robot', palette: 'safety' });
    carrier.pose = 'carry';
    carrier.hold(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.14), steel));
    carrier.held.rotation.y = Math.PI / 2;
    carrier.held.position.set(0, -0.08, 0.35);
    carrier.root.position.set(x0 - 5, g + 8.15, z0 + 2);
    this.root.add(carrier.root);
    let dir = 1;
    carrier.stepRate = 0.8;
    this.animated.push((dt) => {
      carrier.root.position.z += dir * 1.1 * dt;
      if (carrier.root.position.z > z1 - 2) dir = -1;
      if (carrier.root.position.z < z0 + 2) dir = 1;
      carrier.root.rotation.y = dir > 0 ? 0 : Math.PI;
      carrier.update(dt);
    });

    // Tower crane with a slowly slewing jib.
    const crane = new THREE.MeshStandardMaterial({ color: 0xe0b52c, roughness: 0.6, metalness: 0.3 });
    const mast = 34;
    this.#box(1.4, mast, 1.4, crane, x0 - 15, g + mast / 2, z1 - 2);
    const jib = new THREE.Group();
    jib.position.set(x0 - 15, g + mast, z1 - 2);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(30, 1, 1), crane);
    arm.position.x = 9;
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 2), concrete);
    counter.position.x = -6;
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 16, 4), steel);
    cable.position.set(17, -8, 0);
    const load = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 0.3), steel);
    load.position.set(17, -16, 0);
    jib.add(arm, counter, cable, load);
    this.root.add(jib);
    let t = 0;
    this.animated.push((dt) => {
      t += dt;
      jib.rotation.y = 0.6 + Math.sin(t * 0.08) * 0.9;
    });
  }

  // ---------------------------------------------------------------- distant skyline

  #skyline() {
    const g = this.g;
    const styles = [
      { kind: 'glass', wall: '#3c4a57', trim: '#5c6b78', frame: '#8a9aa8', lit: 0.12 },
      { kind: 'glass', wall: '#4d5a52', trim: '#6c7a70', frame: '#a3b0a6', lit: 0.1 },
      { kind: 'concrete', wall: '#9a9590', trim: '#b2ada7', frame: '#3a3d40', lit: 0.1 },
      { kind: 'stone', wall: '#b9ae9a', trim: '#cfc5b2', frame: '#3e3a35', lit: 0.1 },
    ];
    for (let k = 0; k < 28; k++) {
      const x = -70 - rand() * 200;
      const z = -160 + rand() * 320;
      const h = 50 + rand() * 150;
      const w = 14 + rand() * 18;
      const material = this.#facadeMaterial(styles[k % styles.length], w / 12, h / 13.6);
      const round = rand() < 0.3;
      const geometry = round ? new THREE.CylinderGeometry(w / 2, (w / 2) * 1.1, h, 24) : new THREE.BoxGeometry(w, h, w * (0.7 + rand() * 0.6));
      const tower = this.#add(new THREE.Mesh(geometry, material), x, g + h / 2, z);
      tower.rotation.y = rand() * Math.PI;
      tower.userData.noShadow = true;
      if (rand() < 0.4) {
        // Slim spire or rooftop mast.
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 15, 6), new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.6, roughness: 0.4 }));
        spire.position.y = h / 2 + 7.5;
        tower.add(spire);
      }
    }
  }

  // ---------------------------------------------------------------- trees, lamps, bus stop

  /** A few lumpy, vertex-coloured canopy shapes shared by every tree. */
  #canopyGeometries() {
    if (this.canopies) return this.canopies;
    const greens = [0x3f5f2a, 0x4c6d30, 0x5b7a38, 0x355226].map((c) => new THREE.Color(c));
    this.canopies = [0, 1, 2].map((variant) => {
      // Welded so displacement keeps the surface closed and normals come out smooth.
      const geometry = mergeVertices(new THREE.IcosahedronGeometry(1, 3).deleteAttribute('normal').deleteAttribute('uv'));
      const p = geometry.attributes.position;
      const colors = [];
      const v = new THREE.Vector3();
      const c = new THREE.Color();
      for (let k = 0; k < p.count; k++) {
        v.fromBufferAttribute(p, k);
        const n = Math.sin(v.x * 5.1 + variant) * Math.sin(v.y * 4.3 + variant * 2) * Math.sin(v.z * 5.7 + variant * 3);
        const bump = 1 + 0.22 * n + 0.08 * Math.sin(v.x * 13 + v.z * 11);
        v.multiplyScalar(bump);
        v.y *= 0.8;
        p.setXYZ(k, v.x, v.y, v.z);
        // Darker and cooler underneath, lighter where the sun catches the top.
        c.copy(greens[(k + variant) % greens.length]).multiplyScalar(0.7 + 0.45 * (v.y + 1) / 2 + 0.1 * n);
        colors.push(c.r, c.g, c.b);
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      return geometry;
    });
    this.leafMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    this.barkMaterial = new THREE.MeshStandardMaterial({ color: 0x4e3d2e, roughness: 0.95 });
    return this.canopies;
  }

  #tree(x, z) {
    const canopies = this.#canopyGeometries();
    const tree = new THREE.Group();
    const height = 3 + rand() * 0.8;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, height, 8), this.barkMaterial);
    trunk.position.y = height / 2;
    tree.add(trunk);
    for (let k = 0; k < 3; k++) {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 1.4, 6), this.barkMaterial);
      const a = rand() * Math.PI * 2;
      branch.position.set(Math.cos(a) * 0.35, height - 0.3, Math.sin(a) * 0.35);
      branch.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
      tree.add(branch);
    }
    for (let k = 0; k < 5; k++) {
      const blob = new THREE.Mesh(canopies[Math.floor(rand() * canopies.length)], this.leafMaterial);
      const s = 1.1 + rand() * 0.7;
      blob.scale.set(s, s * (0.85 + rand() * 0.3), s);
      const a = (k / 5) * Math.PI * 2 + rand();
      const r = k === 0 ? 0 : 0.9 + rand() * 0.4;
      blob.position.set(Math.cos(a) * r, height + 0.9 + rand() * 0.8 - (k === 0 ? -0.5 : 0), Math.sin(a) * r);
      blob.rotation.y = rand() * Math.PI;
      tree.add(blob);
    }
    return this.#add(tree, x, this.g + 0.15, z);
  }

  #lamp(x, z, facing) {
    const metal = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.5, metalness: 0.6 });
    const lamp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 8), metal);
    pole.position.y = 3;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), metal);
    arm.position.set(0.7 * facing, 5.9, 0);
    const head = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.12, 0.3, 2, 0.04), metal);
    head.position.set(1.35 * facing, 5.85, 0);
    lamp.add(pole, arm, head);
    return this.#add(lamp, x, this.g + 0.15, z);
  }

  #streetFurniture() {
    const nearX = this.nearWalk[1] + 0.8;
    const farX = this.farWalk[0] - 0.8;
    for (let z = -60; z <= 60; z += 9) {
      this.#tree(nearX, z + 2);
      if (z < 2 || z > 22) this.#tree(farX, z - 2);
    }
    for (let z = -54; z <= 54; z += 18) {
      this.#lamp(nearX, z + 6.5, -1);
      this.#lamp(farX, z - 2.5, 1);
    }

    // Traffic lights at the crosswalk.
    const metal = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.5, metalness: 0.6 });
    const red = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 2 });
    const off = new THREE.MeshStandardMaterial({ color: 0x1a1d1a });
    for (const [x, rot] of [[nearX, 0], [farX, Math.PI]]) {
      const signal = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.6, 8), metal);
      pole.position.y = 1.8;
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1, 0.3), metal);
      housing.position.y = 3.6;
      signal.add(pole, housing);
      [red, off, off].forEach((m, k) => {
        const light = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), m);
        light.position.set(0, 3.9 - k * 0.3, 0.16);
        signal.add(light);
      });
      signal.rotation.y = rot + Math.PI / 2 * (x === nearX ? -1 : 1);
      this.#add(signal, x, this.g + 0.15, -16);
    }

    // Bus stop on the far side, with a robot commuter among the people.
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fb8c8, transparent: true, opacity: 0.3, roughness: 0.1 });
    const shelter = new THREE.Group();
    const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 4), metal);
    roofMesh.position.y = 2.5;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.2, 4), glass);
    back.position.set(-0.8, 1.2, 0);
    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.7),
      new THREE.MeshStandardMaterial({
        map: signTexture(400, 560, {
          background: '#f1ece2',
          color: '#1d2b36',
          lines: [['KNOW YOUR', 44], ['RIGHTS', 64], ['Human & Humanoid', 30, '#4a5a66', 500], ['Labor Board', 30, '#4a5a66', 500], ['Dial 311', 34, '#b33b2e']],
        }),
      })
    );
    poster.rotation.y = Math.PI / 2;
    poster.position.set(-0.76, 1.3, 1);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 2.4), metal);
    bench.position.set(-0.5, 0.48, -0.6);
    shelter.add(roofMesh, back, poster, bench);
    for (const dz of [-1.9, 1.9]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.5, 0.08), metal);
      post.position.set(-0.8, 1.25, dz);
      shelter.add(post);
    }
    shelter.rotation.y = Math.PI;
    const stopX = this.farWalk[0] - 2.2;
    this.#add(shelter, stopX, this.g + 0.15, -4);

    const waiting = [
      new Humanoid({ kind: 'robot', palette: 'white' }),
      new Humanoid({ kind: 'person', palette: 1 }),
      new Humanoid({ kind: 'person', palette: 3 }),
    ];
    waiting.forEach((h, k) => {
      h.root.rotation.y = Math.PI / 2;
      this.#add(h.root, stopX - 0.2, this.g + 0.15, -5.4 + k * 1.1);
      this.animated.push((dt) => h.update(dt));
    });
  }

  // ---------------------------------------------------------------- traffic

  #car(color, { length = 4.4, height = 1.45, width = 1.85, van = false, pod = false } = {}) {
    const body = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1a2128, roughness: 0.05, metalness: 0.8 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
    const car = new THREE.Group();
    if (pod) {
      // Driverless shuttle: one rounded capsule with a glass band, no driver's seat.
      const shell = new THREE.Mesh(new RoundedBoxGeometry(width, height, length, 4, 0.5), body);
      shell.position.y = height / 2 + 0.3;
      const band = new THREE.Mesh(new RoundedBoxGeometry(width + 0.02, height * 0.4, length - 0.6, 3, 0.2), glass);
      band.position.y = height * 0.7 + 0.3;
      car.add(shell, band);
    } else {
      const lower = new THREE.Mesh(new RoundedBoxGeometry(width, van ? height : height * 0.5, length, 3, 0.15), body);
      lower.position.y = (van ? height / 2 : height * 0.25) + 0.3;
      car.add(lower);
      if (!van) {
        const cabin = new THREE.Mesh(new RoundedBoxGeometry(width * 0.92, height * 0.45, length * 0.55, 3, 0.18), glass);
        cabin.position.set(0, height * 0.72 + 0.3, -length * 0.05);
        car.add(cabin);
      } else {
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, height * 0.35, 0.05), glass);
        windshield.position.set(0, height * 0.75 + 0.3, length / 2 + 0.01);
        car.add(windshield);
      }
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16), tire);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(sx * (width / 2 - 0.08), 0.34, sz * (length / 2 - 0.75));
        car.add(wheel);
      }
    }
    return car;
  }

  #traffic() {
    const [r0, r1] = this.road;
    const mid = (r0 + r1) / 2;
    const lanes = [
      { x: (r0 + mid) / 2, dir: -1 },
      { x: (r1 + mid) / 2, dir: 1 },
    ];
    const colors = [0xb8bcc0, 0x1d2a3a, 0x8a1e1e, 0xe8e8e6, 0x2f4a3a, 0x3a3a3e, 0x6a7f95];
    lanes.forEach(({ x, dir }, laneIndex) => {
      for (let k = 0; k < 5; k++) {
        const roll = rand();
        const vehicle =
          roll < 0.2 ? this.#car(0xf0f0ee, { pod: true, length: 5, height: 2.2, width: 2 })
          : roll < 0.35 ? this.#car(0xffffff, { van: true, length: 5.4, height: 2.3, width: 2 })
          : this.#car(colors[Math.floor(rand() * colors.length)]);
        vehicle.rotation.y = dir > 0 ? 0 : Math.PI;
        vehicle.position.set(x, this.g, -WRAP + ((k + laneIndex * 0.5) / 5) * WRAP * 2);
        this.#mover(vehicle, { speed: dir * (8 + rand() * 3) });
      }
    });
  }

  // ---------------------------------------------------------------- pedestrians

  #people() {
    const g = this.g + 0.15;
    const walks = [
      { x: this.nearWalk[0] - 1.6, dir: 1 },
      { x: this.nearWalk[1] + 1.8, dir: -1 },
      { x: this.farWalk[0] - 1.2, dir: 1 },
      { x: this.farWalk[1] + 1.4, dir: -1 },
    ];
    const cast = [
      { kind: 'robot', palette: 'courier', pose: 'carry', parcel: true },
      { kind: 'person', palette: 0, pose: 'walk' },
      { kind: 'robot', palette: 'white', pose: 'walk' },
      { kind: 'person', palette: 2, pose: 'walk' },
      { kind: 'robot', palette: 'graphite', pose: 'carry', parcel: true },
      { kind: 'person', palette: 4, pose: 'walk' },
      { kind: 'robot', palette: 'courier', pose: 'carry', parcel: true },
      { kind: 'person', palette: 3, pose: 'walk' },
      { kind: 'robot', palette: 'white', pose: 'walk' },
      { kind: 'person', palette: 1, pose: 'walk' },
      { kind: 'robot', palette: 'safety', pose: 'walk' },
      { kind: 'person', palette: 0, pose: 'walk' },
    ];
    const parcel = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.9 });
    cast.forEach((c, k) => {
      const lane = walks[k % walks.length];
      const h = new Humanoid({ kind: c.kind, palette: c.palette });
      h.pose = c.pose;
      if (c.parcel) h.hold(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.35), parcel));
      h.root.position.set(lane.x, g, -WRAP + rand() * WRAP * 2);
      const speed = lane.dir * (c.kind === 'robot' ? 1.25 : 1.35 + rand() * 0.25);
      this.#mover(h.root, { speed, humanoid: h });
    });

    // A street-cleaning robot working its way along our side, right under the window.
    const sweeper = new Humanoid({ kind: 'robot', palette: 'graphite' });
    sweeper.pose = 'sweep';
    const broom = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), new THREE.MeshStandardMaterial({ color: 0x6b5a40 }));
    handle.rotation.x = 0.9;
    handle.position.set(0, -0.35, 0.35);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.12), new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
    head.position.set(0, -0.78, 0.9);
    broom.add(handle, head);
    sweeper.chest.add(broom);
    sweeper.root.position.set(this.nearWalk[0] - 2.8, g, -10);
    this.#mover(sweeper.root, { speed: 0.45, humanoid: sweeper, min: -25, max: 25 });
  }

  // ---------------------------------------------------------------- delivery drones

  #drones() {
    const body = new THREE.MeshStandardMaterial({ color: 0xe9ebee, roughness: 0.4, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1e2124, roughness: 0.5 });
    const parcel = new THREE.MeshStandardMaterial({ color: 0xc49a62, roughness: 0.9 });
    for (let k = 0; k < 5; k++) {
      const drone = new THREE.Group();
      drone.add(new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.18, 0.6, 2, 0.06), body));
      for (const [ax, az] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.05), dark);
        arm.position.set(ax * 0.3, 0.02, az * 0.3);
        arm.rotation.y = ax * az > 0 ? -Math.PI / 4 : Math.PI / 4;
        const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.01, 16), dark);
        rotor.position.set(ax * 0.48, 0.08, az * 0.48);
        drone.add(arm, rotor);
      }
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.35), parcel);
      box.position.y = -0.35;
      drone.add(box);
      const altitude = this.g + 12 + rand() * 10;
      const x = this.road[1] + rand() * (this.road[0] - this.road[1]) - 4 * rand();
      drone.position.set(x, altitude, -WRAP + rand() * WRAP * 2);
      const offset = rand() * 10;
      this.#mover(drone, {
        speed: (rand() < 0.5 ? -1 : 1) * (5 + rand() * 3),
        update: (dt, o) => {
          o.position.y = altitude + Math.sin(performance.now() / 900 + offset) * 0.3;
        },
      });
    }
  }

  // ---------------------------------------------------------------- lighting finish

  /**
   * Gives everything outside reflections of the actual sky (rather than the room's
   * studio lighting) and turns on shadows, so cars, trees and people sit on the street.
   */
  #finish(renderer) {
    const capture = new THREE.Scene();
    capture.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.skyMaterial));
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromScene(capture, 0, 0.1, 100).texture;
    pmrem.dispose();

    this.root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (m.isMeshStandardMaterial && !m.envMap) m.envMap = this.envMap;
      }
      if (o.userData.noShadow) {
        o.receiveShadow = !o.material.isShaderMaterial && !o.material.isMeshBasicMaterial;
        return;
      }
      o.castShadow = true;
      o.receiveShadow = true;
    });
  }
}

function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
