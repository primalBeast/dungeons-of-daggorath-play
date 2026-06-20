/**
 * Composite Grok-generated creature art into 256×220 sprites with transparency.
 * Full creatures are chroma-keyed and scaled to the wireframe bounding box (no silhouette mask).
 * Run: node scripts/compose-nightmare-sprites.mjs
 */
import { createCanvas, loadImage } from 'canvas';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CREATURE_VEC, SCALEF, CX, CY } from '../js/vectors.js';
import { magentaKeyAlpha } from '../js/chroma-key.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const GEN_DIR = join(ROOT, 'assets/textures/nightmare/generated');
const OUT_DIR = join(ROOT, 'assets/textures/nightmare/sprites');

const BASE_W = 256;
const BASE_H = 220;
const RANGE = 1;
const BBOX_PAD = 1.12;
const FIT_INSET = 0.94;

/** Spider & viper use 2× canvas for sharper in-game scaling. */
const HI_RES_TYPES = new Set([0, 1]);

function spriteSize(type) {
  const scale = HI_RES_TYPES.has(type) ? 2 : 1;
  return { W: BASE_W * scale, H: BASE_H * scale, scale };
}

const GEN_SLUGS = [
  '00-spider', '01-viper', '02-giant', '03-blob',
  '04-knight', '05-giant', '06-scorpion', '07-knight',
  '08-wraith', '09-galdrog', '10-wizard', '11-wizard',
];

function scaleX(x, range, w) {
  return ((x - CX) * SCALEF[range]) / 127 * (w / 256) + w / 2;
}

function scaleY(y, range, h) {
  return ((y - CY) * SCALEF[range]) / 127 * (h / 220) + h * 0.46;
}

function wireframeAnchor(type) {
  const { W, H } = spriteSize(type);
  const MIN_TARGET_W = W * 0.55;
  const MIN_TARGET_H = H * 0.72;
  const vla = CREATURE_VEC[type];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let ctr = 1;
  for (let list = 0; list < vla[0]; list++) {
    const n = vla[ctr++];
    for (let i = 0; i < n; i++) {
      const x = scaleX(vla[ctr], RANGE, W);
      const y = scaleY(vla[ctr + 1], RANGE, H);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      ctr += 2;
    }
  }
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const width = Math.max((maxX - minX) * BBOX_PAD, MIN_TARGET_W);
  const height = Math.max((maxY - minY) * BBOX_PAD, MIN_TARGET_H);
  return { cx, cy, width, height, W, H };
}

/** Aggressive magenta/purple removal for offline compose (keeps dark creature pixels). */
function composeKeyAlpha(r, g, b) {
  const dr = r - 255;
  const dg = g;
  const db = b - 255;
  const dist = Math.sqrt(dr * dr + dg * dg + db * db);
  if (dist < 165) return 0;
  if (dist < 225) return Math.floor(((dist - 165) / 60) * 255);

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const purple = (r + b) * 0.5 - g;
  if (sat > 0.28 && r > 70 && b > 70 && g < Math.min(r, b) * 0.62) {
    if (purple > 45) return 0;
    if (purple > 25) return Math.floor(((purple - 25) / 20) * 128);
  }

  const lum = (r + g + b) / 3;
  if (lum > 130) {
    const fringe = magentaKeyAlpha(r, g, b);
    if (fringe < 255) return fringe;
  }
  return 255;
}

function defringeImageData(data, width, height) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a <= 0) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const purple = (r + b) * 0.5 - g;
      if (purple > 18 && r > 50 && b > 50 && g < Math.min(r, b) * 0.7) {
        data[i + 3] = 0;
        continue;
      }
      if (purple > 8 && a < 250) {
        const spill = Math.min(purple * 0.85, 48);
        data[i] = Math.max(0, r - spill);
        data[i + 2] = Math.max(0, b - spill);
      }
    }
  }
}

function chromaKeyCanvas(img) {
  const sw = img.width;
  const sh = img.height;
  const scratch = createCanvas(sw, sh);
  const sctx = scratch.getContext('2d');
  sctx.drawImage(img, 0, 0);
  const data = sctx.getImageData(0, 0, sw, sh);
  for (let i = 0; i < data.data.length; i += 4) {
    data.data[i + 3] = composeKeyAlpha(data.data[i], data.data[i + 1], data.data[i + 2]);
  }
  defringeImageData(data.data, sw, sh);
  defringeImageData(data.data, sw, sh);
  sctx.putImageData(data, 0, 0);
  return scratch;
}

function opaqueBounds(canvas) {
  const { width, height } = canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a <= 20) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function compose(type, genPath, outPath) {
  const target = wireframeAnchor(type);
  const { W, H } = target;

  return loadImage(genPath).then((gen) => {
    const keyed = chromaKeyCanvas(gen);
    const content = opaqueBounds(keyed);
    if (!content) {
      console.warn('no opaque pixels', genPath);
      return;
    }

    const tw = target.width * FIT_INSET;
    const th = target.height * FIT_INSET;
    const scale = Math.max(tw / content.width, th / content.height);
    const dw = content.width * scale;
    const dh = content.height * scale;
    const dx = target.cx - dw * 0.5;
    const dy = target.cy - dh * 0.5;

    const out = createCanvas(W, H);
    const octx = out.getContext('2d');
    octx.clearRect(0, 0, W, H);
    octx.drawImage(
      keyed,
      content.minX,
      content.minY,
      content.width,
      content.height,
      dx,
      dy,
      dw,
      dh,
    );

    const outData = octx.getImageData(0, 0, W, H);
    defringeImageData(outData.data, W, H);
    octx.putImageData(outData, 0, 0);

    writeFileSync(outPath, out.toBuffer('image/png'));
    console.log('sprite', outPath);
  });
}

mkdirSync(GEN_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const onlyTypes = process.argv.slice(2).map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
const types = onlyTypes.length ? onlyTypes : GEN_SLUGS.map((_, i) => i);

for (const type of types) {
  const slug = GEN_SLUGS[type];
  const genPath = [join(GEN_DIR, `${slug}.jpg`), join(GEN_DIR, `${slug}.png`)]
    .find((p) => existsSync(p));
  if (!genPath) {
    console.warn('missing source', slug);
    continue;
  }
  const spriteOut = join(OUT_DIR, `${slug}.png`);
  await compose(type, genPath, spriteOut);
}