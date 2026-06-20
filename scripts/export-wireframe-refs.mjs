/**
 * Export wireframe creature reference PNGs for Grok image generation.
 * Run: node scripts/export-wireframe-refs.mjs
 */
import { createCanvas } from 'canvas';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CREATURE_VEC, SCALEF, CX, CY } from '../js/vectors.js';
import { CREATURE_NAMES } from '../js/data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../assets/textures/nightmare/refs');
const W = 256;
const H = 220;
const RANGE = 1;

function scaleX(x, range, w) {
  return ((x - CX) * SCALEF[range]) / 127 * (w / 256) + w / 2;
}

function scaleY(y, range, h) {
  return ((y - CY) * SCALEF[range]) / 127 * (h / 220) + h * 0.46;
}

function drawVectorList(ctx, vla, range, w, h) {
  let ctr = 1;
  for (let list = 0; list < vla[0]; list++) {
    const verts = vla[ctr++];
    for (let seg = 0; seg < verts - 1; seg++) {
      const x0 = scaleX(vla[ctr], range, w);
      const y0 = scaleY(vla[ctr + 1], range, h);
      const x1 = scaleX(vla[ctr + 2], range, w);
      const y1 = scaleY(vla[ctr + 3], range, h);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctr += 2;
    }
    ctr += 2;
  }
}

mkdirSync(OUT, { recursive: true });

for (let type = 0; type < CREATURE_VEC.length; type++) {
  const vla = CREATURE_VEC[type];
  if (!vla || vla[0] === 0) continue;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawVectorList(ctx, vla, RANGE, W, H);

  const slug = CREATURE_NAMES[type].toLowerCase().replace(/\s+/g, '-');
  const file = `${String(type).padStart(2, '0')}-${slug}-wireframe.png`;
  writeFileSync(join(OUT, file), canvas.toBuffer('image/png'));
  console.log('wrote', file);
}