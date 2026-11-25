import * as THREE from 'three';
import { canvasTexture } from '../../core/canvasTexture.js';

// Fittings and finishes for the room. Each builder returns an Object3D with
// its origin where it mounts (floor, wall or ceiling); the environment places it.

const shadows = (root, cast = true) => {
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = true;
    }
  });
  return root;
};

const brass = () => new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 1, roughness: 0.35 });

/** Chevron oak parquet, dark and varnished. One tile is about 3.4 m across. */
export function parquetTexture(repeatX, repeatY) {
  return canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      const col = 128;
      const half = col / 2;
      const sp = 32;
      const plank = (pts, tone) => {
        ctx.fillStyle = `rgb(${tone}, ${Math.round(tone * 0.66)}, ${Math.round(tone * 0.42)})`;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
        // Grain running along the plank, and a dark joint.
        ctx.strokeStyle = 'rgba(20,10,4,0.16)';
        ctx.lineWidth = 0.8;
        for (let g = 0.2; g < 1; g += 0.2) {
          ctx.beginPath();
          ctx.moveTo(pts[0][0] + (pts[3][0] - pts[0][0]) * g, pts[0][1] + (pts[3][1] - pts[0][1]) * g);
          ctx.lineTo(pts[1][0] + (pts[2][0] - pts[1][0]) * g, pts[1][1] + (pts[2][1] - pts[1][1]) * g);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(12,6,2,0.6)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      };
      for (let c = 0; c < w / col; c++) {
        const x0 = c * col;
        for (let k = -6; k < h / sp + 6; k++) {
          const y = k * sp;
          // Left half rises to the right, right half falls: together they make a chevron.
          plank([[x0, y], [x0 + half, y + half], [x0 + half, y + half + sp], [x0, y + sp]], 72 + Math.floor(Math.random() * 30));
          plank([[x0 + half, y + half], [x0 + col, y], [x0 + col, y + sp], [x0 + half, y + half + sp]], 72 + Math.floor(Math.random() * 30));
        }
      }
    },
    { repeat: [repeatX, repeatY] }
  );
}

/** Dark brown damask wallpaper: the colour map and a roughness map that gives the motif a satin sheen. */
export function damaskTextures() {
  const draw = (ctx, w, h, { base, motif, line }) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const ornament = (cx, cy, s) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.fillStyle = motif;
      ctx.strokeStyle = line;
      ctx.lineWidth = 1.5;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, -60);
        ctx.bezierCurveTo(side * 30, -50, side * 42, -18, side * 18, 0);
        ctx.bezierCurveTo(side * 46, 6, side * 44, 40, side * 14, 46);
        ctx.bezierCurveTo(side * 22, 58, side * 8, 66, 0, 70);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Curling leaves.
        ctx.beginPath();
        ctx.moveTo(side * 18, -6);
        ctx.bezierCurveTo(side * 54, -30, side * 62, 10, side * 40, 18);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(0, 4, 8, 14, 0, 0, Math.PI * 2);
      ctx.fillStyle = line;
      ctx.fill();
      ctx.restore();
    };
    ornament(w / 2, h / 2, 0.9);
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) ornament(x, y, 0.9);
  };
  const colour = canvasTexture(256, 256, (ctx, w, h) => {
    draw(ctx, w, h, { base: '#2f1d12', motif: '#3c2617', line: 'rgba(120,88,52,0.35)' });
    for (let k = 0; k < 2500; k++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
  const roughness = canvasTexture(256, 256, (ctx, w, h) => draw(ctx, w, h, { base: '#e0e0e0', motif: '#707070', line: '#606060' }));
  roughness.colorSpace = THREE.NoColorSpace;
  for (const t of [colour, roughness]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return { map: colour, roughnessMap: roughness };
}

/** A brass chandelier with candle lamps; `drop` is how far it hangs below the ceiling. Includes its light. */
export function chandelier({ drop = 0.75, arms = 6 } = {}) {
  const root = new THREE.Group();
  const metal = brass();
  const candle = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.6 });
  const flame = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffb860, emissiveIntensity: 5 });
  const add = (mesh, x, y, z) => {
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 24), metal), 0, -0.015, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, drop - 0.2, 8), metal), 0, -(drop - 0.2) / 2, 0);
  const body = new THREE.LatheGeometry(
    [[0, 0], [0.05, 0.02], [0.09, 0.08], [0.07, 0.14], [0.03, 0.18], [0.04, 0.22], [0, 0.24]].map(([x, y]) => new THREE.Vector2(x, y)),
    24
  );
  add(new THREE.Mesh(body, metal), 0, -drop, 0);
  const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.008, 8, 48), metal), 0, -drop + 0.1, 0);
  ring.rotation.x = Math.PI / 2;
  for (let k = 0; k < arms; k++) {
    const a = (k / arms) * Math.PI * 2;
    const cx = Math.cos(a) * 0.32;
    const cz = Math.sin(a) * 0.32;
    const arm = add(new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.34, 6), metal), cx / 2, -drop + 0.08, cz / 2);
    arm.rotation.set(0, -a, -(Math.PI / 2 - 0.25)); // rises outward toward the candle cup
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.03, 16), metal), cx, -drop + 0.13, cz);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 10), candle), cx, -drop + 0.19, cz);
    const f = add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), flame), cx, -drop + 0.255, cz);
    f.scale.set(1, 1.7, 1);
  }
  const light = new THREE.PointLight(0xffb870, 5, 9, 2);
  light.position.y = -drop + 0.2;
  root.add(light);
  return shadows(root, false);
}

/** A brass wall sconce with a small pleated shade. Faces +z; includes its light. */
export function sconce() {
  const root = new THREE.Group();
  const metal = brass();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 24), metal);
  plate.rotation.x = Math.PI / 2;
  plate.scale.set(0.8, 1, 1.5);
  plate.position.z = 0.008;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 8), metal);
  arm.rotation.x = Math.PI / 2 - 0.5;
  arm.position.set(0, 0.03, 0.08);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.018, 0.03, 16), metal);
  cup.position.set(0, 0.08, 0.15);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.08, 0.12, 20, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xe8d6b4, emissive: 0xffb870, emissiveIntensity: 0.9, roughness: 0.9, side: THREE.DoubleSide,
    })
  );
  shade.position.set(0, 0.16, 0.15);
  const light = new THREE.PointLight(0xffb06a, 1.3, 4.5, 2);
  light.position.set(0, 0.16, 0.2);
  root.add(plate, arm, cup, shade, light);
  return shadows(root, false);
}

/** A heavy velvet drape with vertical folds, hanging from y = height down to the floor. Faces +z. */
export function curtain({ width = 0.8, height = 2.7, folds = 7, color = 0x4a1219 } = {}) {
  const geometry = new THREE.PlaneGeometry(width, height, folds * 8, 12);
  const p = geometry.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const u = p.getX(k) / width + 0.5;
    const v = p.getY(k) / height + 0.5; // 1 at the top
    // Deeper folds lower down, where the fabric hangs free.
    const depth = 0.035 + 0.02 * (1 - v);
    p.setZ(k, Math.sin(u * folds * Math.PI * 2) * depth);
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0xc05060), sheenRoughness: 0.45, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = height / 2;
  const root = new THREE.Group();
  root.add(mesh);
  return shadows(root);
}

/** A brass curtain rod with ball finials, running along x, on brackets `standoff` from the wall (-z). */
export function curtainRod(length, standoff = 0.12) {
  const root = new THREE.Group();
  const metal = brass();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, length, 12), metal);
  rod.rotation.z = Math.PI / 2;
  root.add(rod);
  for (const side of [-1, 1]) {
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), metal);
    finial.position.x = side * (length / 2 + 0.03);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, standoff), metal);
    bracket.position.set(side * (length / 2 - 0.12), 0, -standoff / 2);
    root.add(finial, bracket);
  }
  return shadows(root, false);
}

export function door({ wood, casing, metal }) {
  // Faces -x, i.e. into the room when mounted on the right-hand wall.
  const root = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.2, 0.95), wood);
  slab.position.set(-0.025, 1.1, 0);
  // Raised panels with a moulded edge.
  for (const [y, h] of [[1.62, 0.78], [0.6, 0.86]]) {
    const field = new THREE.Mesh(new THREE.BoxGeometry(0.012, h, 0.32), wood);
    for (const z of [-0.2, 0.2]) {
      const panel = field.clone();
      panel.position.set(-0.056, y, z);
      root.add(panel);
    }
  }
  const casings = [
    [0.07, 2.32, 0.12, 0, 1.16, -0.535],
    [0.07, 2.32, 0.12, 0, 1.16, 0.535],
    [0.08, 0.16, 1.24, 0, 2.3, 0],
  ];
  for (const [w, h, d, x, y, z] of casings) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), casing);
    c.position.set(x - 0.035, y, z);
    root.add(c);
  }
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), metal);
  handle.position.set(-0.09, 1.0, -0.38);
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 16), metal);
  rose.rotation.z = Math.PI / 2;
  rose.position.set(-0.06, 1.0, -0.38);
  root.add(slab, handle, rose);
  return shadows(root);
}

export function trackSpot({ metal }) {
  const root = new THREE.Group();
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), metal);
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 16), metal);
  can.position.y = -0.1;
  can.rotation.x = 0.6;
  root.add(mount, can);
  return root;
}
