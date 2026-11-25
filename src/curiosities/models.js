import * as THREE from 'three';

// Procedural stand-ins for each curiosity. Every builder returns an Object3D
// resting on y = 0 at the size it should appear in the drawer (metres).
// A model may set `userData.update(dt)` for its own animation.
// To use a scanned or modelled asset instead, give the catalog entry a `model` URL.

function castShadows(root) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return root;
}

// ---------------------------------------------------------------- Ammonite

export function buildAmmonite() {
  const turns = 4;
  const outerRadius = 0.072;
  const growth = Math.log(2.4) / (Math.PI * 2); // whorl expansion per turn
  const thetaMax = turns * Math.PI * 2;
  const thetaMin = 0.6 * Math.PI * 2;
  const a = outerRadius / Math.exp(growth * thetaMax);
  const segments = 520;
  const radial = 28;
  const ribsPerTurn = 30;

  const positions = [];
  const colors = [];
  const indices = [];
  const stone = new THREE.Color(0x8f7048);
  const groove = new THREE.Color(0x4a3420);
  const core = new THREE.Color(0x6a4c30);
  const c = new THREE.Color();

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const theta = thetaMin + (thetaMax - thetaMin) * t;
    const r = a * Math.exp(growth * theta);
    const cx = Math.cos(theta) * r;
    const cy = Math.sin(theta) * r;
    const rib = Math.pow(0.5 + 0.5 * Math.cos(theta * ribsPerTurn), 3);
    for (let j = 0; j <= radial; j++) {
      const phi = (j / radial) * Math.PI * 2;
      const outerSide = 0.5 + 0.5 * Math.cos(phi); // 1 on the outside of the whorl
      const ribScale = 1 + 0.09 * rib * outerSide;
      const radialR = 0.36 * r * ribScale;
      const axialR = 0.27 * r * ribScale;
      const offR = Math.cos(phi) * radialR;
      positions.push(cx + Math.cos(theta) * offR, cy + Math.sin(theta) * offR, Math.sin(phi) * axialR);

      c.copy(core).lerp(stone, Math.min(1, t * 1.6));
      c.lerp(groove, (1 - rib) * 0.35 * outerSide);
      const mottle = 0.9 + 0.2 * Math.sin(theta * 7.3 + phi * 3.1) * Math.sin(theta * 2.1);
      colors.push(c.r * mottle, c.g * mottle, c.b * mottle);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const p = i * (radial + 1) + j;
      const q = p + radial + 1;
      indices.push(p, q, p + 1, q, q + 1, p + 1);
    }
  }
  // Close the aperture with a darker matrix-filled cap.
  const last = segments * (radial + 1);
  const centre = positions.length / 3;
  const rEnd = a * Math.exp(growth * thetaMax);
  positions.push(Math.cos(thetaMax) * rEnd, Math.sin(thetaMax) * rEnd, 0);
  colors.push(0.3, 0.22, 0.15);
  for (let j = 0; j < radial; j++) indices.push(last + j, last + j + 1, centre);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide })
  );
  // Coil axis is z; lay it flat so it rests on the felt.
  mesh.rotation.x = -Math.PI / 2;
  const root = new THREE.Group();
  root.add(mesh);
  return castShadows(root);
}

// ---------------------------------------------------------------- Amethyst cluster

function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export function buildAmethyst() {
  const rand = seeded(7);
  const root = new THREE.Group();

  // Matrix rock: a lumpy, flattened icosphere.
  const rockGeometry = new THREE.IcosahedronGeometry(0.06, 2);
  const p = rockGeometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + 0.18 * Math.sin(v.x * 70) * Math.sin(v.y * 60 + 1) * Math.sin(v.z * 80 + 2);
    v.multiplyScalar(n);
    p.setXYZ(i, v.x * 1.2, v.y * 0.4, v.z);
  }
  rockGeometry.computeVertexNormals();
  const rock = new THREE.Mesh(
    rockGeometry,
    new THREE.MeshStandardMaterial({ color: 0x6a5f58, roughness: 0.95, flatShading: true })
  );
  rock.position.y = 0.02;
  root.add(rock);

  const crystalMaterials = [0x8a4fc8, 0x6a2fa0, 0xb07ee0].map(
    (color) =>
      new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.12,
        metalness: 0,
        transmission: 0.55,
        thickness: 0.03,
        ior: 1.54,
        flatShading: true,
        attenuationColor: new THREE.Color(color),
        attenuationDistance: 0.05,
      })
  );

  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 18; i++) {
    const angle = rand() * Math.PI * 2;
    const tilt = rand() * 0.95;
    const dir = new THREE.Vector3(Math.sin(tilt) * Math.cos(angle), Math.cos(tilt), Math.sin(tilt) * Math.sin(angle));
    const length = 0.022 + rand() * 0.04 * (1 - tilt * 0.5);
    const radius = 0.006 + rand() * 0.007;

    const crystal = new THREE.Group();
    const material = crystalMaterials[i % crystalMaterials.length];
    const prism = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.05, length, 6), material);
    prism.position.y = length / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(radius, radius * 1.8, 6), material);
    tip.position.y = length + radius * 0.9;
    crystal.add(prism, tip);

    crystal.quaternion.setFromUnitVectors(up, dir);
    crystal.rotateY(rand() * Math.PI);
    const spread = 0.035 * Math.sin(tilt) + rand() * 0.01;
    crystal.position.set(Math.cos(angle) * spread, 0.026, Math.sin(angle) * spread);
    root.add(crystal);
  }
  return castShadows(root);
}

// ---------------------------------------------------------------- Pocket watch

function watchFaceTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;

  const gradient = ctx.createRadialGradient(cx, cx * 0.8, 20, cx, cx, cx);
  gradient.addColorStop(0, '#f8f0dc');
  gradient.addColorStop(1, '#e2d2ae');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#2a1c10';
  ctx.fillStyle = '#2a1c10';
  ctx.translate(cx, cx);
  for (let i = 0; i < 60; i++) {
    const angle = (i / 60) * Math.PI * 2;
    const major = i % 5 === 0;
    ctx.lineWidth = major ? 4 : 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.sin(angle) * 236, -Math.cos(angle) * 236);
    ctx.lineTo(Math.sin(angle) * (major ? 214 : 224), -Math.cos(angle) * (major ? 214 : 224));
    ctx.stroke();
  }
  const numerals = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  ctx.font = '600 40px "Cormorant Garamond", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  numerals.forEach((numeral, i) => {
    const angle = (i / 12) * Math.PI * 2;
    ctx.save();
    ctx.translate(Math.sin(angle) * 180, -Math.cos(angle) * 180);
    ctx.rotate(angle);
    ctx.fillText(numeral, 0, 0);
    ctx.restore();
  });
  ctx.font = 'italic 26px "Cormorant Garamond", Georgia, serif';
  ctx.fillText('Londini', 0, -78);

  // Small seconds sub-dial.
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 92, 44, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.sin(angle) * 44, 92 - Math.cos(angle) * 44);
    ctx.lineTo(Math.sin(angle) * 36, 92 - Math.cos(angle) * 36);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function hand(length, width, material) {
  const geometry = new THREE.BoxGeometry(width, 0.0008, length);
  geometry.translate(0, 0, -length / 2 + width); // pivot near one end, pointing toward -z (12 o'clock)
  return new THREE.Mesh(geometry, material);
}

export function buildPocketWatch() {
  const root = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8aa52, metalness: 1, roughness: 0.22 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x1a2440, metalness: 0.8, roughness: 0.3 });

  const R = 0.042;
  const caseProfile = [
    [0, 0], [R * 0.7, 0], [R * 0.92, 0.002], [R, 0.006], [R * 1.02, 0.01], [R, 0.014],
    [R * 0.97, 0.017], [R * 0.9, 0.0175], [R * 0.9, 0.0145], [0, 0.0145],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  root.add(new THREE.Mesh(new THREE.LatheGeometry(caseProfile, 64), gold));

  const face = new THREE.Mesh(
    new THREE.CircleGeometry(R * 0.9, 64),
    new THREE.MeshStandardMaterial({ map: watchFaceTexture(), roughness: 0.45 })
  );
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.0146;
  root.add(face);

  const hands = new THREE.Group();
  hands.position.y = 0.0152;
  const hourHand = hand(R * 0.5, 0.0024, steel);
  const minuteHand = hand(R * 0.75, 0.0016, steel);
  minuteHand.position.y = 0.0009;
  const secondHand = hand(R * 0.18, 0.0007, steel);
  secondHand.position.set(0, 0.0005, R * 0.9 * (92 / 256));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.002, 16), gold);
  hands.add(hourHand, minuteHand, secondHand, cap);
  root.add(hands);

  const crystal = new THREE.Mesh(
    new THREE.SphereGeometry(R * 2.2, 48, 12, 0, Math.PI * 2, 0, Math.asin(0.9 / 2.2)),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.12, clearcoat: 1, depthWrite: false,
    })
  );
  crystal.position.y = 0.0175 - R * 2.2 * Math.cos(Math.asin(0.9 / 2.2));
  crystal.renderOrder = 1;
  root.add(crystal);

  // Pendant, crown and bow at 12 o'clock (-z).
  const pendant = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.008, 16), gold);
  pendant.rotation.x = Math.PI / 2;
  pendant.position.set(0, 0.0085, -R - 0.003);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 20), gold);
  crown.rotation.x = Math.PI / 2;
  crown.position.set(0, 0.0085, -R - 0.009);
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0016, 10, 32), gold);
  bow.rotation.x = Math.PI / 2;
  bow.position.set(0, 0.0085, -R - 0.019);
  root.add(pendant, crown, bow);

  // A short length of chain trailing across the felt.
  const chainPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, -R - 0.026),
    new THREE.Vector3(0.012, 0, -R - 0.05),
    new THREE.Vector3(0.04, 0, -R - 0.06),
    new THREE.Vector3(0.062, 0, -R - 0.045),
  ]);
  const linkGeometry = new THREE.TorusGeometry(0.0042, 0.0011, 8, 16);
  const linkCount = 13;
  for (let i = 0; i < linkCount; i++) {
    const t = i / (linkCount - 1);
    const point = chainPath.getPointAt(t);
    const tangent = chainPath.getTangentAt(t);
    const holder = new THREE.Group();
    holder.position.copy(point);
    holder.rotation.y = Math.atan2(-tangent.z, tangent.x);
    const link = new THREE.Mesh(linkGeometry, gold);
    link.scale.set(1.5, 1, 1);
    // Alternate links lie flat and stand upright, like a real curb chain.
    const flat = i % 2 === 0;
    link.rotation.x = flat ? Math.PI / 2 : 0;
    link.position.y = flat ? 0.0011 : 0.0042;
    holder.add(link);
    root.add(holder);
  }

  // Hands show the viewer's local time.
  root.userData.update = () => {
    const now = new Date();
    const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
    const minutes = now.getMinutes() + seconds / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    hourHand.rotation.y = -(hours / 12) * Math.PI * 2;
    minuteHand.rotation.y = -(minutes / 60) * Math.PI * 2;
    secondHand.rotation.y = -(Math.floor(seconds) / 60) * Math.PI * 2;
  };
  root.userData.update();

  return castShadows(root);
}
