import * as THREE from 'three';

/** Draws into a fresh canvas with `draw(ctx, width, height)` and wraps it as an sRGB texture. */
export function canvasTexture(width, height, draw, { repeat } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
  }
  return texture;
}

/** A sign or poster: background colour plus centred lines of text ([text, fontSize, colour?]). */
export function signTexture(width, height, { background, color = '#fff', lines, font = 'Inter, Helvetica, Arial, sans-serif', border }) {
  return canvasTexture(width, height, (ctx, w, h) => {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = Math.max(4, h * 0.03);
      ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const total = lines.reduce((sum, [, size]) => sum + size * 1.25, 0);
    let y = h / 2 - total / 2;
    for (const [text, size, lineColor, weight = 700] of lines) {
      y += (size * 1.25) / 2;
      ctx.fillStyle = lineColor ?? color;
      ctx.font = `${weight} ${size}px ${font}`;
      ctx.fillText(text, w / 2, y);
      y += (size * 1.25) / 2;
    }
  });
}
