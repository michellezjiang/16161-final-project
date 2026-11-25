import * as THREE from 'three';

// Procedural textures for the street. Facades come as matching colour,
// roughness, bump and emissive maps drawn from one layout, so windows are
// glossy and recessed while the wall around them is matte.

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

function toTexture(canvas, { srgb = true, repeat } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  if (repeat) texture.repeat.set(...repeat);
  return texture;
}

/** Speckles a rectangle with light/dark noise so flat colours read as material. */
function grain(ctx, x, y, w, h, amount, count, size = 2) {
  for (let k = 0; k < count; k++) {
    const v = Math.random() < 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${amount * Math.random()})`;
    ctx.fillRect(x + Math.random() * w, y + Math.random() * h, size, size);
  }
}

const shade = (hex, f) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
};

/**
 * One tile covers `bays` window bays by `floors` storeys.
 * style: { wall, trim, frame, kind: 'brick' | 'stone' | 'concrete' | 'glass', lit }
 */
export function facadeTextures(style, { bays = 4, floors = 4, size = 512 } = {}) {
  const [colorC, color] = makeCanvas(size, size);
  const [roughC, rough] = makeCanvas(size, size);
  const [bumpC, bump] = makeCanvas(size, size);
  const [emitC, emit] = makeCanvas(size, size);
  const cw = size / bays;
  const ch = size / floors;
  const glassy = style.kind === 'glass';

  // Wall.
  color.fillStyle = style.wall;
  color.fillRect(0, 0, size, size);
  rough.fillStyle = '#e6e6e6';
  rough.fillRect(0, 0, size, size);
  bump.fillStyle = '#b4b4b4';
  bump.fillRect(0, 0, size, size);
  emit.fillStyle = '#000';
  emit.fillRect(0, 0, size, size);

  if (style.kind === 'brick') {
    const bh = 5;
    const bw = 13;
    for (let y = 0; y < size; y += bh) {
      const offset = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = -bw; x < size; x += bw) {
        color.fillStyle = shade(style.wall, 0.85 + Math.random() * 0.3);
        color.fillRect(x + offset, y, bw - 1, bh - 1);
      }
      color.fillStyle = 'rgba(210,200,185,0.55)';
      color.fillRect(0, y + bh - 1, size, 1);
      bump.fillStyle = '#9a9a9a';
      bump.fillRect(0, y + bh - 1, size, 1);
    }
  } else if (style.kind === 'stone' || style.kind === 'concrete') {
    grain(color, 0, 0, size, size, 0.08, 9000);
    // Coursing joints / panel lines.
    const step = style.kind === 'stone' ? ch / 4 : ch;
    color.fillStyle = 'rgba(0,0,0,0.18)';
    bump.fillStyle = '#909090';
    for (let y = 0; y < size; y += step) {
      color.fillRect(0, y, size, 1.5);
      bump.fillRect(0, y, size, 1.5);
    }
    if (style.kind === 'concrete') {
      for (let x = 0; x < size; x += cw) {
        color.fillRect(x, 0, 1.5, size);
        bump.fillRect(x, 0, 1.5, size);
      }
    }
  } else {
    grain(color, 0, 0, size, size, 0.05, 3000);
  }
  // Weathering: soft darker streaks running down from the windows.
  for (let k = 0; k < 40; k++) {
    const x = Math.random() * size;
    const g = color.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.06)');
    color.fillStyle = g;
    color.fillRect(x, 0, 2 + Math.random() * 5, size);
  }

  for (let r = 0; r < floors; r++) {
    for (let c = 0; c < bays; c++) {
      const x0 = c * cw;
      const y0 = r * ch;
      const wx = x0 + cw * (glassy ? 0.04 : 0.2);
      const wy = y0 + ch * (glassy ? 0.08 : 0.2);
      const ww = cw * (glassy ? 0.92 : 0.6);
      const wh = ch * (glassy ? 0.8 : 0.58);

      if (!glassy) {
        // Lintel above, protruding sill below.
        color.fillStyle = style.trim;
        color.fillRect(wx - 4, wy - 8, ww + 8, 7);
        color.fillRect(wx - 6, wy + wh + 1, ww + 12, 6);
        color.fillStyle = 'rgba(0,0,0,0.25)';
        color.fillRect(wx - 6, wy + wh + 7, ww + 12, 3); // shadow under the sill
        bump.fillStyle = '#d8d8d8';
        bump.fillRect(wx - 4, wy - 8, ww + 8, 7);
        bump.fillStyle = '#ffffff';
        bump.fillRect(wx - 6, wy + wh + 1, ww + 12, 6);
        rough.fillStyle = '#c8c8c8';
        rough.fillRect(wx - 6, wy + wh + 1, ww + 12, 6);
      }

      // Reveal: the darker inner edge of a recessed opening.
      color.fillStyle = shade(style.wall, 0.55);
      color.fillRect(wx, wy, ww, wh);

      // Glass: a sky reflection gradient over a dim interior, with curtains or blinds in some.
      const lit = Math.random() < (style.lit ?? 0.2);
      const g = color.createLinearGradient(0, wy, 0, wy + wh);
      if (lit) {
        g.addColorStop(0, '#b9a98a');
        g.addColorStop(1, '#8a7356');
      } else {
        g.addColorStop(0, '#7f93a6');
        g.addColorStop(0.45, '#4a5966');
        g.addColorStop(1, '#2a323a');
      }
      const inset = 3;
      color.fillStyle = g;
      color.fillRect(wx + inset, wy + inset, ww - inset * 2, wh - inset * 2);
      const dressing = Math.random();
      if (dressing < 0.3) {
        color.fillStyle = ['rgba(220,210,190,0.75)', 'rgba(170,60,50,0.6)', 'rgba(200,200,205,0.7)'][Math.floor(Math.random() * 3)];
        const side = Math.random() < 0.5;
        color.fillRect(side ? wx + inset : wx + ww * 0.6, wy + inset, ww * 0.4 - inset, wh - inset * 2);
      } else if (dressing < 0.5) {
        color.fillStyle = 'rgba(225,222,215,0.55)';
        const drop = wh * (0.2 + Math.random() * 0.6);
        for (let y = wy + inset; y < wy + drop; y += 3) color.fillRect(wx + inset, y, ww - inset * 2, 1.5);
      }
      // Diagonal glint.
      color.fillStyle = 'rgba(255,255,255,0.07)';
      color.beginPath();
      color.moveTo(wx + ww * 0.15, wy + inset);
      color.lineTo(wx + ww * 0.45, wy + inset);
      color.lineTo(wx + ww * 0.2, wy + wh - inset);
      color.lineTo(wx + inset, wy + wh - inset);
      color.fill();

      // Frame, mullion, transom.
      color.strokeStyle = style.frame;
      color.lineWidth = 3;
      color.strokeRect(wx + inset, wy + inset, ww - inset * 2, wh - inset * 2);
      color.fillStyle = style.frame;
      color.fillRect(wx + ww / 2 - 1.5, wy + inset, 3, wh - inset * 2);
      if (!glassy) color.fillRect(wx + inset, wy + wh * 0.3, ww - inset * 2, 2.5);

      rough.fillStyle = '#1a1a1a';
      rough.fillRect(wx + inset, wy + inset, ww - inset * 2, wh - inset * 2);
      bump.fillStyle = '#404040';
      bump.fillRect(wx, wy, ww, wh);
      bump.fillStyle = '#6a6a6a';
      bump.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
      if (lit) {
        emit.fillStyle = '#4a3a22';
        emit.fillRect(wx + inset, wy + inset, ww - inset * 2, wh - inset * 2);
      }
    }
    if (glassy) {
      // Spandrel band between storeys.
      color.fillStyle = shade(style.wall, 0.8);
      color.fillRect(0, r * ch + ch * 0.92 - 2, size, 4);
    }
  }

  return {
    map: toTexture(colorC),
    roughnessMap: toTexture(roughC, { srgb: false }),
    bumpMap: toTexture(bumpC, { srgb: false }),
    emissiveMap: toTexture(emitC),
  };
}

/** Weathered asphalt with patches and fine aggregate. */
export function asphaltTexture(repeat) {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#3b3d40';
  ctx.fillRect(0, 0, 512, 512);
  grain(ctx, 0, 0, 512, 512, 0.18, 30000, 1.5);
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '20,20,22' : '80,80,82'},0.18)`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 60 + Math.random() * 120, 40 + Math.random() * 90);
  }
  ctx.strokeStyle = 'rgba(15,15,15,0.4)';
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 5; k++) {
    let x = Math.random() * 512;
    let y = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += (Math.random() - 0.5) * 40;
      y += Math.random() * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return toTexture(c, { repeat });
}

/** Square concrete paving slabs with joints and staining. */
export function pavingTexture(repeat) {
  const [c, ctx] = makeCanvas(512, 512);
  const slabs = 4;
  const s = 512 / slabs;
  for (let i = 0; i < slabs; i++) {
    for (let j = 0; j < slabs; j++) {
      const v = 165 + Math.floor(Math.random() * 25);
      ctx.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
      ctx.fillRect(i * s, j * s, s, s);
    }
  }
  grain(ctx, 0, 0, 512, 512, 0.12, 20000, 1.5);
  ctx.fillStyle = 'rgba(60,55,50,0.6)';
  for (let k = 0; k <= slabs; k++) {
    ctx.fillRect(k * s - 1, 0, 2, 512);
    ctx.fillRect(0, k * s - 1, 512, 2);
  }
  for (let k = 0; k < 8; k++) {
    ctx.fillStyle = 'rgba(40,35,30,0.08)';
    ctx.beginPath();
    ctx.ellipse(Math.random() * 512, Math.random() * 512, 10 + Math.random() * 30, 8 + Math.random() * 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c, { repeat });
}

/** Soft cumulus-ish cloud cover as an alpha mask (fractal value noise). */
export function cloudTexture() {
  const w = 512;
  const h = 512;
  const [c, ctx] = makeCanvas(w, h);
  const grid = 64;
  const lattice = Array.from({ length: grid * grid }, () => Math.random());
  const at = (x, y) => lattice[((y % grid) + grid) % grid * grid + (((x % grid) + grid) % grid)];
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * xf;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * xf;
    return a + (b - a) * yf;
  };
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      let amp = 0.5;
      let f = 4 / w * grid / 8;
      for (let o = 0; o < 5; o++) {
        v += noise(x * f, y * f) * amp;
        amp *= 0.5;
        f *= 2;
      }
      const a = Math.max(0, Math.min(1, (v - 0.48) * 3.2));
      const i = (y * w + x) * 4;
      const light = 235 + 20 * a;
      img.data[i] = light;
      img.data[i + 1] = light;
      img.data[i + 2] = light + 5;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}
