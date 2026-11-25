import * as THREE from 'three';

// Procedural textures and shared materials for the cabinet, so the project has
// no image assets to manage. Swap any of these for real textures later.

const TEXTURE_WORLD_SIZE = 0.6; // metres of wood covered by one texture tile

function makeWoodCanvas({ base, dark, light }) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Long horizontal grain lines with a slow wobble.
  for (let i = 0; i < 160; i++) {
    const y0 = Math.random() * size;
    const amp = 2 + Math.random() * 6;
    const freq = 1 + Math.floor(Math.random() * 4);
    const phase = Math.random() * Math.PI * 2;
    ctx.strokeStyle = Math.random() < 0.7 ? dark : light;
    ctx.globalAlpha = 0.05 + Math.random() * 0.18;
    ctx.lineWidth = 0.5 + Math.random() * 2.5;
    // Draw each line a tile above and below too, so the texture repeats without seams.
    for (const shift of [-size, 0, size]) {
      ctx.beginPath();
      for (let x = 0; x <= size; x += 8) {
        // Whole-number cycles across the tile keep the left and right edges matching.
        const y = y0 + shift + Math.sin((x / size) * Math.PI * 2 * freq + phase) * amp
          + Math.sin((x / size) * Math.PI * 2 * freq * 3 + phase) * amp * 0.3;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  return canvas;
}

function woodTexture(colors) {
  const texture = new THREE.CanvasTexture(makeWoodCanvas(colors));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

export function createCabinetMaterials() {
  const walnut = woodTexture({ base: '#4a2c1a', dark: '#211008', light: '#6b4228' });
  return {
    wood: new THREE.MeshStandardMaterial({ map: walnut, roughness: 0.55, metalness: 0 }),
    woodDark: new THREE.MeshStandardMaterial({ map: walnut, color: 0x7a6a60, roughness: 0.6 }),
    // Futurist accent: brushed titanium hardware and trim.
    metal: new THREE.MeshStandardMaterial({ color: 0x7d858e, metalness: 1, roughness: 0.3 }),
    felt: new THREE.MeshStandardMaterial({ color: 0x1e3a2a, roughness: 1 }),
    interior: new THREE.MeshStandardMaterial({ color: 0x5e412b, roughness: 0.85 }),
  };
}

/**
 * A BoxGeometry whose UVs are scaled to its real size, so a shared wood texture
 * keeps the same grain scale on every board regardless of its dimensions.
 */
export function boardGeometry(w, h, d) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const uv = geometry.attributes.uv;
  // BoxGeometry faces, 4 verts each: +x, -x, +y, -y, +z, -z
  const faceDims = [
    [d, h], [d, h],
    [w, d], [w, d],
    [w, h], [w, h],
  ];
  const offset = Math.random();
  for (let face = 0; face < 6; face++) {
    const [fu, fv] = faceDims[face];
    for (let i = 0; i < 4; i++) {
      const idx = face * 4 + i;
      uv.setXY(idx, (uv.getX(idx) * fu) / TEXTURE_WORLD_SIZE + offset, (uv.getY(idx) * fv) / TEXTURE_WORLD_SIZE + offset);
    }
  }
  return geometry;
}

export function board(w, h, d, material, { x = 0, y = 0, z = 0 } = {}) {
  const mesh = new THREE.Mesh(boardGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Engraved text on a brushed-metal plate, for the drawer labels. */
export function labelTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#b9c0c7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Horizontal brushing.
  for (let i = 0; i < 400; i++) {
    const shade = 150 + Math.floor(Math.random() * 80);
    ctx.fillStyle = `rgba(${shade}, ${shade + 4}, ${shade + 8}, 0.25)`;
    ctx.fillRect(0, Math.random() * canvas.height, canvas.width, 1);
  }
  // Engraved border and lettering.
  ctx.strokeStyle = '#3c4248';
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
  ctx.fillStyle = '#2a2f34';
  ctx.font = 'italic 700 84px "Cormorant Garamond", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
