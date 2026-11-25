import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CityView } from './room/CityView.js';
import {
  chandelier, curtain, curtainRod, damaskTextures, door, parquetTexture, sconce, trackSpot,
} from './room/props.js';

const ROOM = { minX: -3.5, maxX: 3.5, minZ: -3.2, maxZ: 3.2, height: 3.0, wall: 0.25 };
// The window in the left-hand (x = minX) wall, in room coordinates.
const WINDOW = { zMin: -1.7, zMax: 0.9, yMin: 0.85, yMax: 2.45 };
const WAINSCOT = 0.85; // panelling height; matches the window sill
const WALLPAPER_TILE = 0.55; // metres of wall per wallpaper repeat

/**
 * A curator's study on the third floor of a city building, with a window onto
 * the street: dark damask walls, walnut panelling, a coffered ceiling, and warm
 * pools of lamplight. Same interface as StudioEnvironment, plus what a walkable space needs:
 *
 *   walkable    true: main.js uses the first-person rig here
 *   bounds      { minX, maxX, minZ, maxZ } the player stays inside
 *   colliders   [{ minX, maxX, minZ, maxZ }] footprints to walk around (main.js adds the cabinet)
 *   occluders   objects that block the interaction ray (walls, furniture)
 */
export class MuseumRoomEnvironment {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'MuseumRoomEnvironment';
    this.interior = new THREE.Group();
    this.root.add(this.interior);

    this.walkable = true;
    this.bounds = { minX: ROOM.minX, maxX: ROOM.maxX, minZ: ROOM.minZ, maxZ: ROOM.maxZ };
    this.colliders = [];
    this.occluders = [this.interior];

    this.anchors = {
      // Scaled up so the cabinet holds its own in a full-size room, on shorter legs so the
      // top drawer sits about waist height and you can see into it from a normal distance.
      cabinet: { position: new THREE.Vector3(0, 0, -2.82), rotationY: 0, scale: 1.35, options: { footHeight: 0.15 } },
    };
    this.viewpoints = {
      start: { position: new THREE.Vector3(0.3, 1.6, 0.8), target: new THREE.Vector3(0, 1.0, -2.8) },
      // Orbit view used on touch devices.
      cabinet: { position: new THREE.Vector3(0.6, 2.0, -0.4), target: new THREE.Vector3(0, 0.8, -2.6) },
    };
    this.sunDirection = new THREE.Vector3(-0.78, 0.5, 0.36).normalize();
  }

  build(app) {
    const { scene, renderer } = app;
    this.scene = scene;
    this.camera = app.camera;

    scene.background = new THREE.Color(0xcfd8e0);
    scene.fog = new THREE.Fog(0xd9d6cf, 70, 480); // afternoon haze, close to the sky's horizon colour
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.12; // low fill keeps the room moody; lamps and sun do the work

    this.materials = this.#materials();
    this.#shell();
    this.#window();
    this.#lighting();
    this.#furnish();

    this.city = new CityView({ renderer, facadeX: ROOM.minX - ROOM.wall, windowRect: WINDOW, sunDirection: this.sunDirection });
    this.root.add(this.city.root);

    scene.add(this.root);
    return this;
  }

  update(dt) {
    this.city.update(dt);
  }

  dispose() {
    this.scene.remove(this.root);
    this.scene.environment = null;
    this.scene.background = null;
    this.scene.fog = null;
    this.envMap?.dispose();
  }

  // ---------------------------------------------------------------- materials

  #materials() {
    const damask = damaskTextures();
    return {
      wallpaper: new THREE.MeshStandardMaterial({ ...damask, roughness: 1 }),
      ceiling: new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.9 }),
      floor: new THREE.MeshStandardMaterial({ map: parquetTexture(7.5 / 3.4, 6.9 / 3.4), roughness: 0.38 }),
      panel: new THREE.MeshStandardMaterial({ color: 0x2c190e, roughness: 0.5 }),
      trim: new THREE.MeshStandardMaterial({ color: 0x22130a, roughness: 0.45 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.5 }),
      gilt: new THREE.MeshStandardMaterial({ color: 0xa8823e, metalness: 1, roughness: 0.4 }),
      metal: new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 1, roughness: 0.35 }),
      bronze: new THREE.MeshStandardMaterial({ color: 0x2e2822, metalness: 0.8, roughness: 0.5 }),
    };
  }

  #box(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.interior.add(mesh);
    return mesh;
  }

  /** A box whose UVs are world coordinates, so wallpaper lines up across separate wall pieces. */
  #wallBox(w, h, d, x, y, z) {
    const geometry = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const pos = geometry.attributes.position;
    const nrm = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    for (let k = 0; k < pos.count; k++) {
      const [px, py, pz] = [pos.getX(k), pos.getY(k), pos.getZ(k)];
      const ax = Math.abs(nrm.getX(k));
      const ay = Math.abs(nrm.getY(k));
      const u = ax > 0.5 ? pz : px;
      const v = ay > 0.5 ? pz : py;
      uv.setXY(k, u / WALLPAPER_TILE, v / WALLPAPER_TILE);
    }
    const mesh = new THREE.Mesh(geometry, this.materials.wallpaper);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.interior.add(mesh);
    return mesh;
  }

  // ---------------------------------------------------------------- walls, floor, ceiling

  #shell() {
    const { minX, maxX, minZ, maxZ, height: H, wall: t } = ROOM;
    const m = this.materials;
    const W = maxX - minX;
    const D = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    // Floor: parquet on the top face only.
    const floor = this.#box(W + 2 * t, 0.2, D + 2 * t, m.trim, cx, -0.1, cz);
    floor.material = [m.trim, m.trim, m.floor, m.trim, m.trim, m.trim];
    floor.castShadow = false;

    // Coffered ceiling: a dark field crossed by deep beams.
    this.#box(W + 2 * t, 0.2, D + 2 * t, m.ceiling, cx, H + 0.1, cz);
    const beamDepth = 0.14;
    const beamW = 0.12;
    for (let k = 1; k < 5; k++) this.#box(beamW, beamDepth, D, m.trim, minX + (W / 5) * k, H - beamDepth / 2, cz);
    for (let k = 1; k < 5; k++) this.#box(W, beamDepth - 0.01, beamW, m.trim, cx, H - beamDepth / 2 + 0.005, minZ + (D / 5) * k);

    // Back, front and right walls are solid.
    this.#wallBox(W + 2 * t, H, t, cx, H / 2, minZ - t / 2);
    this.#wallBox(W + 2 * t, H, t, cx, H / 2, maxZ + t / 2);
    this.#wallBox(t, H, D, maxX + t / 2, H / 2, cz);

    // Left wall, built around the window opening.
    const lx = minX - t / 2;
    const { zMin, zMax, yMin, yMax } = WINDOW;
    this.#wallBox(t, yMin, D, lx, yMin / 2, cz);
    this.#wallBox(t, H - yMax, D, lx, (H + yMax) / 2, cz);
    this.#wallBox(t, yMax - yMin, zMin - minZ, lx, (yMin + yMax) / 2, (minZ + zMin) / 2);
    this.#wallBox(t, yMax - yMin, maxZ - zMax, lx, (yMin + yMax) / 2, (zMax + maxZ) / 2);

    // Panelling, rails and mouldings on each wall. `gaps` keeps rails clear of the window sill.
    const windowGap = [zMin - 0.12, zMax + 0.12];
    const walls = [
      { axis: 'z', at: minZ, from: minX, to: maxX, normal: 1, gaps: [] },
      { axis: 'z', at: maxZ, from: minX, to: maxX, normal: -1, gaps: [] },
      { axis: 'x', at: maxX, from: minZ, to: maxZ, normal: -1, gaps: [[1.7, 2.9]] }, // door
      { axis: 'x', at: minX, from: minZ, to: maxZ, normal: 1, gaps: [windowGap] },
    ];
    for (const w of walls) {
      // Place a strip along this wall: `out` is distance from the wall face to the strip's centre.
      const strip = (a, b, thick, h, y, out, material) => {
        const len = b - a;
        const mid = (a + b) / 2;
        const off = w.at + w.normal * out;
        return w.axis === 'z' ? this.#box(len, h, thick, material, mid, y, off) : this.#box(thick, h, len, material, off, y, mid);
      };
      const runs = [];
      let start = w.from;
      for (const [g0, g1] of w.gaps) {
        runs.push([start, g0]);
        start = g1;
      }
      runs.push([start, w.to]);
      const doorGap = w.gaps.length && w.axis === 'x' && w.normal === -1;

      for (const [a, b] of runs) {
        // Under the window the panelling continues (the sill sits on top); elsewhere a gap means "skip".
        strip(a, b, 0.02, WAINSCOT, WAINSCOT / 2, 0.01, m.panel);
        // Raised-panel frames, one per bay.
        const bays = Math.max(1, Math.round((b - a) / 0.75));
        const bay = (b - a) / bays;
        for (let k = 0; k < bays; k++) {
          const b0 = a + k * bay + 0.09;
          const b1 = a + (k + 1) * bay - 0.09;
          if (b1 - b0 < 0.15) continue;
          const y0 = 0.32;
          const y1 = WAINSCOT - 0.1;
          strip(b0, b1, 0.012, 0.025, y0, 0.026, m.trim);
          strip(b0, b1, 0.012, 0.025, y1, 0.026, m.trim);
          strip(b0, b0 + 0.025, 0.012, y1 - y0, (y0 + y1) / 2, 0.026, m.trim);
          strip(b1 - 0.025, b1, 0.012, y1 - y0, (y0 + y1) / 2, 0.026, m.trim);
        }
        // Chair rail with a gilt bead, tall skirting with a cap.
        strip(a, b, 0.045, 0.06, WAINSCOT, 0.0225, m.trim);
        strip(a, b, 0.012, 0.012, WAINSCOT - 0.04, 0.046, m.gilt).castShadow = false;
        strip(a, b, 0.03, 0.2, 0.1, 0.015, m.trim);
        strip(a, b, 0.04, 0.025, 0.21, 0.02, m.trim);
      }
      if (!doorGap && w.gaps.length) {
        // Panelling under the window sill.
        const [g0, g1] = w.gaps[0];
        strip(g0, g1, 0.02, WAINSCOT, WAINSCOT / 2, 0.01, m.panel);
        strip(g0, g1, 0.03, 0.2, 0.1, 0.015, m.trim);
      }
      // Stepped crown moulding with a gilt bead along its foot.
      strip(w.from, w.to, 0.03, 0.07, H - 0.035, 0.015, m.trim);
      strip(w.from, w.to, 0.06, 0.05, H - 0.095, 0.03, m.trim);
      strip(w.from, w.to, 0.09, 0.035, H - 0.137, 0.045, m.trim);
      strip(w.from, w.to, 0.012, 0.012, H - 0.16, 0.08, m.gilt).castShadow = false;
    }
  }

  #window() {
    const { zMin, zMax, yMin, yMax } = WINDOW;
    const { minX, wall: t } = ROOM;
    const m = this.materials;
    const zc = (zMin + zMax) / 2;
    const w = zMax - zMin;
    // Every part is offset by at least a few millimetres from the wall and from each
    // other, so no two faces are coplanar (coplanar faces flicker as they z-fight).

    // Wooden linings inside the opening.
    const lin = 0.025;
    const xMid = minX - t / 2;
    this.#box(t, lin, w, m.wood, xMid, yMin + lin / 2, zc);
    this.#box(t, lin, w, m.wood, xMid, yMax - lin / 2, zc);
    this.#box(t, yMax - yMin - 2 * lin, lin, m.wood, xMid, (yMin + yMax) / 2, zMin + lin / 2);
    this.#box(t, yMax - yMin - 2 * lin, lin, m.wood, xMid, (yMin + yMax) / 2, zMax - lin / 2);

    // Interior sill (stool) standing proud of the wall and wider than the opening.
    this.#box(0.2, 0.045, w + 0.2, m.wood, minX + 0.06, yMin + 0.012, zc);

    // Architrave around the opening on the room side.
    const arch = 0.09;
    this.#box(0.03, arch, w + 2 * arch, m.trim, minX + 0.015, yMax + arch / 2, zc);
    // Side pieces stop under the head piece so the two never overlap.
    const sideH = yMax - (yMin + 0.034);
    this.#box(0.03, sideH, arch, m.trim, minX + 0.015, yMax - sideH / 2, zMin - arch / 2);
    this.#box(0.03, sideH, arch, m.trim, minX + 0.015, yMax - sideH / 2, zMax + arch / 2);

    // Slim steel frame inside the linings, with mullion and transom at different depths.
    const ix0 = zMin + lin;
    const ix1 = zMax - lin;
    const iy0 = yMin + lin;
    const iy1 = yMax - lin;
    const f = 0.045;
    const fx = xMid;
    this.#box(0.07, f, ix1 - ix0, m.bronze, fx, iy1 - f / 2, (ix0 + ix1) / 2);
    this.#box(0.07, f, ix1 - ix0, m.bronze, fx, iy0 + f / 2, (ix0 + ix1) / 2);
    this.#box(0.07, iy1 - iy0 - 2 * f, f, m.bronze, fx, (iy0 + iy1) / 2, ix0 + f / 2);
    this.#box(0.07, iy1 - iy0 - 2 * f, f, m.bronze, fx, (iy0 + iy1) / 2, ix1 - f / 2);
    this.#box(0.05, iy1 - iy0 - 2 * f, 0.032, m.bronze, fx, (iy0 + iy1) / 2, zc);
    this.#box(0.04, 0.03, ix1 - ix0 - 2 * f, m.bronze, fx, iy0 + (iy1 - iy0) * 0.72, (ix0 + ix1) / 2);

    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(ix1 - ix0, iy1 - iy0),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.08, depthWrite: false,
        // Keep grazing-angle reflections faint so looking down at the street doesn't wash out.
        specularIntensity: 0.2,
        envMapIntensity: 0.25,
      })
    );
    glass.rotation.y = Math.PI / 2;
    glass.position.set(fx - 0.012, (iy0 + iy1) / 2, (ix0 + ix1) / 2);
    this.interior.add(glass);

    // Heavy velvet curtains on a brass rod, drawn back to frame the view. They hang
    // clear of the sill (which stands 0.16 m proud of the wall).
    const rodY = yMax + 0.28;
    const hang = 0.24;
    const rod = curtainRod(w + 1.3, hang);
    rod.rotation.y = Math.PI / 2;
    rod.position.set(minX + hang, rodY, zc);
    this.interior.add(rod);
    for (const side of [-1, 1]) {
      const drape = curtain({ width: 0.8, height: rodY - 0.02 });
      drape.rotation.y = Math.PI / 2;
      const edge = side < 0 ? zMin : zMax;
      drape.position.set(minX + hang - 0.03, 0.02, edge + side * 0.22);
      this.interior.add(drape);
    }
  }

  // ---------------------------------------------------------------- lights

  #lighting() {
    const { minX, maxX, minZ, maxZ, height: H } = ROOM;
    // Very low fill so the room sits in shadow between pools of warm light.
    this.root.add(new THREE.HemisphereLight(0xc8b8a0, 0x24180f, 0.14));

    // Late-afternoon sun, low enough to pour through the window and across the floor.
    // Its shadow covers the room and the street outside, so the city has shadows too.
    const sun = new THREE.DirectionalLight(0xffd29a, 3.2);
    const shadowCentre = new THREE.Vector3(-14, -3, 0);
    sun.position.copy(shadowCentre).addScaledVector(this.sunDirection, 90);
    sun.target.position.copy(shadowCentre);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 20, far: 200 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    this.root.add(sun, sun.target);

    // Gallery spot on the cabinet from the ceiling.
    const { position: cab } = this.anchors.cabinet;
    const spot = new THREE.SpotLight(0xffdcae, 26, 6, 0.5, 0.65, 1.5);
    spot.position.set(cab.x + 0.2, H - 0.15, cab.z + 1.5);
    spot.target.position.set(cab.x, 0.8, cab.z);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.02;
    this.root.add(spot, spot.target);
    const track = trackSpot({ metal: this.materials.metal });
    track.position.set(cab.x + 0.2, H - 0.02, cab.z + 1.5);
    this.interior.add(track);

    // Chandelier in the centre coffer.
    const lamp = chandelier({ drop: 0.8 });
    lamp.position.set((minX + maxX) / 2, H, (minZ + maxZ) / 2);
    this.interior.add(lamp);

    // Wall sconces: a pair flanking the cabinet, and pairs on the right and front walls.
    const placements = [
      [cab.x - 1.3, minZ, 0], [cab.x + 1.3, minZ, 0],
      [maxX, -1.4, -Math.PI / 2], [maxX, 0.7, -Math.PI / 2],
      [-1.5, maxZ, Math.PI], [1.5, maxZ, Math.PI],
    ];
    for (const [x, z, rotationY] of placements) {
      const light = sconce();
      light.position.set(x, 1.72, z);
      light.rotation.y = rotationY;
      this.interior.add(light);
    }
  }

  // ---------------------------------------------------------------- fixtures

  #furnish() {
    const m = this.materials;
    const doorway = door({ wood: m.wood, casing: m.trim, metal: m.metal });
    doorway.position.set(ROOM.maxX - 0.005, 0, 2.3);
    this.interior.add(doorway);
  }
}
