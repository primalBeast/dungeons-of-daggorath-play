/**
 * Procedural dark-grey mountain-carved tunnel wall tiles with baked 3D relief.
 * Run: node scripts/compose-nightmare-walls.mjs
 */
import { createCanvas } from 'canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'assets/textures/nightmare/walls');
const SPRITE_DIR = join(ROOT, 'assets/textures/nightmare/sprites');
const EMBED_OUT = join(ROOT, 'js/nightmare-wall-tiles.js');

const TILE = 256;
const RENDER = 640;

const LIGHT = { x: -0.55, y: -0.62, z: 0.58 };
const LIGHT_LEN = Math.hypot(LIGHT.x, LIGHT.y, LIGHT.z);
LIGHT.x /= LIGHT_LEN;
LIGHT.y /= LIGHT_LEN;
LIGHT.z /= LIGHT_LEN;

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function fract(v) {
  return v - Math.floor(v);
}

function valueNoiseGrid(size, rng) {
  const g = new Float32Array((size + 1) * (size + 1));
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return g;
}

function sampleValueNoise(grid, size, u, v) {
  const fx = fract(u) * size;
  const fy = fract(v) * size;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smoothstep(fx - ix);
  const ty = smoothstep(fy - iy);
  const idx = (a, b) => b * (size + 1) + a;
  return lerp(
    lerp(grid[idx(ix, iy)], grid[idx(ix + 1, iy)], tx),
    lerp(grid[idx(ix, iy + 1)], grid[idx(ix + 1, iy + 1)], tx),
    ty,
  );
}

function fbm(u, v, octaves, grids, sizes) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const gi = Math.min(i, grids.length - 1);
    sum += sampleValueNoise(grids[gi], sizes[gi], u * freq, v * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}

function buildNoiseLayers(rng) {
  return [6, 12, 24, 48, 96].map((size) => valueNoiseGrid(size, rng));
}

function stampLine(mask, w, h, x0, y0, x1, y1, radius, strength) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    const ix = Math.round(x);
    const iy = Math.round(y);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const px = ix + dx;
        const py = iy + dy;
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) continue;
        const falloff = 1 - dist / (radius + 0.01);
        const i = py * w + px;
        const v = strength * falloff;
        if (v > mask[i]) mask[i] = v;
      }
    }
  }
}

function stampGroove(height, w, h, x0, y0, x1, y1, depth, lip) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const lx = LIGHT.x;
  const ly = LIGHT.y;
  const px = -(y1 - y0);
  const py = x1 - x0;
  const plen = Math.hypot(px, py) || 1;
  const nx = px / plen;
  const ny = py / plen;
  const litSide = lx * nx + ly * ny > 0 ? 1 : -1;

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = x0 + (x1 - x0) * t;
    const cy = y0 + (y1 - y0) * t;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const pxX = Math.round(cx + dx);
        const pyY = Math.round(cy + dy);
        if (pxX < 0 || pyY < 0 || pxX >= w || pyY >= h) continue;
        const dist = Math.hypot(dx, dy);
        const i = pyY * w + pxX;
        if (dist < 0.9) {
          height[i] -= depth;
        } else if (dist < 1.8) {
          const edge = (dx * nx + dy * ny) * litSide;
          if (edge > 0.2) height[i] += lip;
          else if (edge < -0.2) height[i] -= lip * 0.45;
        }
      }
    }
  }
}

function meanderCrack(height, w, h, rng, startX, startY) {
  let x = startX;
  let y = startY;
  let angle = rng() * Math.PI * 2;
  const steps = 35 + Math.floor(rng() * 90);
  for (let i = 0; i < steps; i++) {
    angle += (rng() - 0.5) * 0.95;
    const step = 1.5 + rng() * 2.5;
    const nx = x + Math.cos(angle) * step;
    const ny = y + Math.sin(angle) * step;
    stampGroove(height, w, h, x, y, nx, ny, 0.22 + rng() * 0.18, 0.08);
    x = nx;
    y = ny;
    if (x < 3 || y < 3 || x >= w - 3 || y >= h - 3) break;
    if (rng() < 0.12) {
      let bx = x;
      let by = y;
      let bAngle = angle + (rng() - 0.5) * 1.5;
      for (let b = 0; b < 4 + rng() * 10; b++) {
        bAngle += (rng() - 0.5) * 0.75;
        const bnx = bx + Math.cos(bAngle) * 1.8;
        const bny = by + Math.sin(bAngle) * 1.8;
        stampGroove(height, w, h, bx, by, bnx, bny, 0.14, 0.05);
        bx = bnx;
        by = bny;
      }
    }
  }
}

function chiselCluster(height, w, h, rng, cx, cy) {
  const count = 5 + Math.floor(rng() * 8);
  const baseAngle = rng() * Math.PI;
  const spread = 14 + rng() * 28;
  for (let i = 0; i < count; i++) {
    const off = (i - count / 2) * (1.6 + rng() * 1.4);
    const ang = baseAngle + (rng() - 0.5) * 0.12;
    const len = spread * (0.65 + rng() * 0.55);
    const x0 = cx + Math.cos(ang + Math.PI / 2) * off;
    const y0 = cy + Math.sin(ang + Math.PI / 2) * off;
    const x1 = x0 + Math.cos(ang) * len;
    const y1 = y0 + Math.sin(ang) * len;
    stampGroove(height, w, h, x0, y0, x1, y1, 0.1 + rng() * 0.08, 0.06);
  }
}

function sampleHeight(height, w, h, x, y) {
  const ix = clamp(Math.round(x), 0, w - 1);
  const iy = clamp(Math.round(y), 0, h - 1);
  return height[iy * w + ix];
}

function ambientOcclusion(height, w, h, x, y, radius = 2) {
  const cx = sampleHeight(height, w, h, x, y);
  let occ = 0;
  let n = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      occ += Math.max(0, sampleHeight(height, w, h, x + dx, y + dy) - cx);
      n++;
    }
  }
  return occ / n;
}

function paintMountainRock(ctx, w, h, seed) {
  const rng = mulberry32(seed);
  const grids = buildNoiseLayers(rng);
  const sizes = [6, 12, 24, 48, 96];
  const height = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const i = y * w + x;
      const warpU = fbm(u + 1.7, v + 2.3, 3, grids, sizes) * 0.85;
      const warpV = fbm(u + 4.1, v + 0.6, 3, grids, sizes) * 0.85;
      const wu = u + (warpU - 0.5) * 0.35;
      const wv = v + (warpV - 0.5) * 0.35;
      const macro = fbm(wu, wv, 5, grids, sizes);
      const meso = fbm(wu * 3.6, wv * 3.6, 4, grids, sizes);
      const micro = sampleValueNoise(grids[4], sizes[4], wu * 38, wv * 38);
      const ridge = Math.pow(Math.abs(meso - 0.5) * 2, 1.8) * 0.16;
      height[i] = macro * 0.48 + meso * 0.32 + micro * 0.2 + ridge;
    }
  }

  const crackCount = 7 + Math.floor(rng() * 5);
  for (let c = 0; c < crackCount; c++) {
    const edge = Math.floor(rng() * 4);
    let sx;
    let sy;
    if (edge === 0) { sx = rng() * w; sy = 2; }
    else if (edge === 1) { sx = w - 3; sy = rng() * h; }
    else if (edge === 2) { sx = rng() * w; sy = h - 3; }
    else { sx = 2; sy = rng() * h; }
    meanderCrack(height, w, h, mulberry32(seed + c * 991), sx, sy);
  }

  const clusterCount = 8 + Math.floor(rng() * 6);
  for (let c = 0; c < clusterCount; c++) {
    chiselCluster(height, w, h, mulberry32(seed + c * 431), rng() * w, rng() * h);
  }

  for (let i = 0; i < 22; i++) {
    const cx = rng() * w;
    const cy = rng() * h;
    const r = 5 + rng() * 16;
    const deep = rng() > 0.45;
    for (let y = Math.floor(cy - r); y <= Math.floor(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.floor(cx + r); x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d > 1) continue;
        const q = 1 - d * d;
        if (deep) height[y * w + x] -= q * (0.14 + rng() * 0.12);
        else height[y * w + x] += q * (0.1 + rng() * 0.1);
      }
    }
  }

  for (let i = 0; i < 120; i++) {
    const cx = rng() * w;
    const cy = rng() * h;
    const r = 1.2 + rng() * 3.5;
    const lift = 0.04 + rng() * 0.07;
    for (let y = Math.floor(cy - r); y <= Math.floor(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.floor(cx + r); x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d > 1) continue;
        height[y * w + x] += (1 - d) * lift;
      }
    }
  }

  const img = ctx.createImageData(w, h);
  const d = img.data;
  const warmthRng = mulberry32(seed ^ 0xc0ffee);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const pi = i * 4;
      const hL = sampleHeight(height, w, h, x - 1, y);
      const hR = sampleHeight(height, w, h, x + 1, y);
      const hU = sampleHeight(height, w, h, x, y - 1);
      const hD = sampleHeight(height, w, h, x, y + 1);
      const dhdx = (hR - hL) * 5.5;
      const dhdy = (hD - hU) * 5.5;
      const nz = 0.85;
      const nlen = Math.hypot(dhdx, dhdy, nz);
      const nx = -dhdx / nlen;
      const ny = -dhdy / nlen;
      const nzN = nz / nlen;
      const ndotl = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nzN * LIGHT.z);
      const ao = ambientOcclusion(height, w, h, x, y, 4);
      const warmth = sampleValueNoise(grids[1], sizes[1], (x / w) * 2.3, (y / h) * 2.3) - 0.5;

      const ambient = 0.1;
      const diffuse = Math.pow(ndotl, 1.15) * 1.05;
      const spec = Math.pow(ndotl, 6) * 0.16;
      let shade = ambient + diffuse + spec;
      shade -= ao * 2.6;
      shade = clamp(shade, 0.04, 1);

      const base = 34 + height[i] * 78;
      let lum = base * shade;
      lum += warmth * 5;
      lum += (warmthRng() - 0.5) * 10;
      lum = (lum - 28) * 1.28 + 28;

      const [r, g, b] = [
        clamp(lum + warmth * 4, 0, 255),
        clamp(lum, 0, 255),
        clamp(lum - warmth * 2, 0, 255),
      ];
      d[pi] = r;
      d[pi + 1] = g;
      d[pi + 2] = b;
      d[pi + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
}

function paintCarvedDoor(ctx, w, h, seed) {
  const rng = mulberry32(seed);
  paintMountainRock(ctx, w, h, seed + 1);

  const margin = 18 + rng() * 8;
  const frame = 16 + rng() * 6;
  const inner = {
    x: margin + frame,
    y: margin + frame * 0.55,
    w: w - (margin + frame) * 2,
    h: h - margin - frame * 1.2,
  };

  ctx.save();
  const recess = ctx.createLinearGradient(inner.x, inner.y, inner.x + inner.w * 0.3, inner.y + inner.h);
  recess.addColorStop(0, '#3a3a44');
  recess.addColorStop(0.35, '#18181e');
  recess.addColorStop(1, '#08080c');
  ctx.fillStyle = recess;
  ctx.beginPath();
  ctx.moveTo(inner.x, inner.y);
  ctx.lineTo(inner.x + inner.w, inner.y + 2);
  ctx.lineTo(inner.x + inner.w - 2, inner.y + inner.h);
  ctx.lineTo(inner.x + 3, inner.y + inner.h - 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#6a6a76';
  ctx.lineWidth = frame;
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 4;
  const fx = margin;
  const fy = margin;
  const fw = w - margin * 2;
  const fh = h - margin * 2;
  ctx.beginPath();
  ctx.moveTo(fx + rng() * 4, fy + rng() * 3);
  ctx.lineTo(fx + fw - rng() * 3, fy + rng() * 2);
  ctx.lineTo(fx + fw - rng() * 2, fy + fh - rng() * 3);
  ctx.lineTo(fx + rng() * 3, fy + fh - rng() * 2);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#1a1a20';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4 + Math.floor(rng() * 3); i++) {
    const px = inner.x + 8 + rng() * (inner.w - 16);
    const wobble = (rng() - 0.5) * 5;
    ctx.beginPath();
    ctx.moveTo(px + wobble, inner.y + 6);
    ctx.lineTo(px - wobble * 0.3, inner.y + inner.h - 6);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  const kx = inner.x + inner.w * 0.76;
  const ky = inner.y + inner.h * 0.5;
  const kg = ctx.createRadialGradient(kx - 1, ky - 1, 0, kx, ky, 6);
  kg.addColorStop(0, '#8a8a96');
  kg.addColorStop(0.5, '#3e3e48');
  kg.addColorStop(1, '#141418');
  ctx.fillStyle = kg;
  ctx.beginPath();
  ctx.arc(kx, ky, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function sharpen(ctx, w, h, amount = 0.35) {
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const s = src.data;
  const d = out.data;
  const k = [
    0, -amount, 0,
    -amount, 1 + 4 * amount, -amount,
    0, -amount, 0,
  ];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let v = 0;
        let ki = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            v += s[((y + dy) * w + (x + dx)) * 4 + c] * k[ki++];
          }
        }
        d[(y * w + x) * 4 + c] = clamp(v, 0, 255);
      }
      d[(y * w + x) * 4 + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

function composeTile(slug, seed) {
  const hi = createCanvas(RENDER, RENDER);
  const hiCtx = hi.getContext('2d');
  if (slug === 'door') {
    paintCarvedDoor(hiCtx, RENDER, RENDER, seed);
  } else {
    paintMountainRock(hiCtx, RENDER, RENDER, seed);
  }
  sharpen(hiCtx, RENDER, RENDER, 0.38);

  const out = createCanvas(TILE, TILE);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(hi, 0, 0, TILE, TILE);
  return out;
}

const WALLS = [
  { slug: 'stone', seed: 0xc41e3a },
  { slug: 'door', seed: 0x7f2d18 },
];

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(SPRITE_DIR, { recursive: true });

for (const { slug, seed } of WALLS) {
  const outPath = join(OUT_DIR, `${slug}.png`);
  const tile = composeTile(slug, seed);
  writeFileSync(outPath, tile.toBuffer('image/png'));
  console.log('wall tile', outPath);

  const spriteName = slug === 'stone' ? 'wall-stone.png' : 'wall-door.png';
  writeFileSync(join(SPRITE_DIR, spriteName), readFileSync(outPath));
  console.log('sprite copy', join(SPRITE_DIR, spriteName));
}

const embedded = {};
for (const { slug } of WALLS) {
  const buf = readFileSync(join(OUT_DIR, `${slug}.png`));
  embedded[slug] = `data:image/png;base64,${buf.toString('base64')}`;
}

writeFileSync(
  EMBED_OUT,
  `/** Auto-generated by scripts/compose-nightmare-walls.mjs — do not edit. */\n`
  + `export const NIGHTMARE_WALL_TILES = ${JSON.stringify(embedded)};\n`,
);
console.log('embedded', EMBED_OUT);