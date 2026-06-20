/** Creature fills — procedural tiles or Grok-imagined wireframe-masked sprites. */

import { CTYPES } from './data.js';
import { stripMagentaFromImageData } from './chroma-key.js';

function spriteUrl(source, file) {
  const base = document.baseURI || window.location.href;
  return new URL(`assets/textures/${source}/sprites/${file}`, base).href;
}

const SCARY_TINTS = [
  { base: '#2a2818', vein: '#4a4020', speck: '#6a5830', pulse: '#8a7028' },
  { base: '#182818', vein: '#284028', speck: '#3a5838', pulse: '#508848' },
  { base: '#281810', vein: '#402820', speck: '#583830', pulse: '#704028' },
  { base: '#1a1028', vein: '#302048', speck: '#483060', pulse: '#604080' },
  { base: '#201818', vein: '#382828', speck: '#503838', pulse: '#684040' },
  { base: '#242018', vein: '#403828', speck: '#585038', pulse: '#706848' },
  { base: '#181420', vein: '#282838', speck: '#383850', pulse: '#484868' },
  { base: '#1c1818', vein: '#342c2c', speck: '#4c4040', pulse: '#645454' },
  { base: '#141820', vein: '#242c38', speck: '#344050', pulse: '#445468' },
  { base: '#281410', vein: '#482820', speck: '#603830', pulse: '#784840' },
  { base: '#201018', vein: '#382028', speck: '#503038', pulse: '#684048' },
  { base: '#180c18', vein: '#301830', speck: '#482448', pulse: '#603060' },
];

const SPRITE_FILES = [
  '00-spider.png', '01-viper.png', '02-giant.png', '03-blob.png',
  '04-knight.png', '05-giant.png', '06-scorpion.png', '07-knight.png',
  '08-wraith.png', '09-galdrog.png', '10-wizard.png', '11-wizard.png',
];

const WALL_KIND_FILES = {
  stone: 'wall-stone.png',
  door: 'wall-door.png',
};

const proceduralCache = new Map();
const spriteCache = new Map();
const spriteReady = new Map();
const wallCache = new Map();
const wallReady = new Map();

function hashNoise(x, y, seed) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.17) * 43758.5453;
  return n - Math.floor(n);
}

function proceduralPattern(ctx, type) {
  const key = type % SCARY_TINTS.length;
  if (proceduralCache.has(key)) return proceduralCache.get(key);

  const tint = SCARY_TINTS[key];
  const size = 56;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const tctx = c.getContext('2d');

  tctx.fillStyle = tint.base;
  tctx.fillRect(0, 0, size, size);

  const img = tctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = hashNoise(x, y, key);
      const n2 = hashNoise(x * 2.3, y * 1.7, key + 7);
      const grain = (n - 0.5) * 38 + (n2 - 0.5) * 22;
      const wet = n2 > 0.72 ? 18 : 0;
      d[i] = Math.min(255, Math.max(0, parseInt(tint.base.slice(1, 3), 16) + grain + wet));
      d[i + 1] = Math.min(255, Math.max(0, parseInt(tint.base.slice(3, 5), 16) + grain * 0.7));
      d[i + 2] = Math.min(255, Math.max(0, parseInt(tint.base.slice(5, 7), 16) + grain * 0.5 - wet));
      d[i + 3] = 255;
    }
  }
  tctx.putImageData(img, 0, 0);

  tctx.globalAlpha = 0.45;
  tctx.strokeStyle = tint.vein;
  tctx.lineWidth = 1.2;
  for (let v = 0; v < 6; v++) {
    const ox = hashNoise(v, key, 3) * size;
    const oy = hashNoise(v, key, 5) * size;
    tctx.beginPath();
    tctx.moveTo(ox, oy);
    for (let s = 1; s <= 5; s++) {
      tctx.lineTo(
        ox + Math.sin(v * 1.4 + s * 0.9) * s * 7,
        oy + Math.cos(v * 0.8 + s * 1.1) * s * 5,
      );
    }
    tctx.stroke();
  }

  tctx.globalAlpha = 0.35;
  tctx.fillStyle = tint.speck;
  for (let s = 0; s < 28; s++) {
    const px = hashNoise(s, key, 11) * size;
    const py = hashNoise(s, key, 13) * size;
    const r = 0.6 + hashNoise(s, key, 17) * 2.2;
    tctx.beginPath();
    tctx.arc(px, py, r, 0, Math.PI * 2);
    tctx.fill();
  }

  tctx.globalAlpha = 0.22;
  tctx.fillStyle = tint.pulse;
  const g = tctx.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.55);
  g.addColorStop(0, tint.pulse);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  tctx.fillRect(0, 0, size, size);

  const pattern = ctx.createPattern(c, 'repeat');
  proceduralCache.set(key, pattern);
  return pattern;
}

function spriteKey(source, type) {
  return `${source}:${type}`;
}

function processSpriteImage(img, key) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  stripMagentaFromImageData(data);
  ctx.putImageData(data, 0, 0);
  spriteCache.set(key, c);
  spriteReady.set(key, true);
}

function loadCreatureSprite(source, type) {
  const key = spriteKey(source, type);
  if (spriteCache.has(key)) return spriteCache.get(key);

  const file = SPRITE_FILES[type % SPRITE_FILES.length];
  const img = new Image();
  img.decoding = 'async';
  img.src = spriteUrl(source, file);
  spriteReady.set(key, false);
  img.onload = () => processSpriteImage(img, key);
  img.onerror = () => spriteReady.set(key, false);
  return img;
}

function wallKey(source, kind) {
  return `wall:${source}:${kind}`;
}

function processWallImage(img, key) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  wallCache.set(key, c);
  wallReady.set(key, true);
}

function loadWallTile(source, kind) {
  const key = wallKey(source, kind);
  if (wallCache.has(key)) return wallCache.get(key);

  const file = WALL_KIND_FILES[kind];
  const img = new Image();
  img.decoding = 'async';
  img.src = spriteUrl(source, file);
  wallReady.set(key, false);
  img.onload = () => processWallImage(img, key);
  img.onerror = () => {
    wallReady.set(key, false);
    console.warn('wall texture failed', spriteUrl(source, file));
  };
  return img;
}

export function clearCreatureTextureCache() {
  proceduralCache.clear();
  spriteCache.clear();
  spriteReady.clear();
  wallCache.clear();
  wallReady.clear();
}

export function preloadCreatureTextures(rendererOpts = {}) {
  const source = rendererOpts.creatureSpriteSource ?? rendererOpts.wallTextureSource;
  if (!source) return;
  if (rendererOpts.creatureSpriteSource) {
    for (let i = 0; i < CTYPES; i++) loadCreatureSprite(source, i);
  }
  if (rendererOpts.wallTextureSource) {
    loadWallTile(source, 'stone');
    loadWallTile(source, 'door');
  }
}

export function preloadWallTextures(rendererOpts = {}) {
  preloadCreatureTextures(rendererOpts);
}

export function getWallTile(source, kind = 'stone') {
  const key = wallKey(source, kind);
  const cached = wallCache.get(key);
  if (cached instanceof HTMLCanvasElement) return cached;
  if (!wallReady.get(key)) {
    loadWallTile(source, kind);
    return null;
  }
  return cached ?? null;
}

export function creatureUsesSprites(rendererOpts = {}) {
  return !!rendererOpts.creatureSpriteSource;
}

export function getCreatureSprite(source, type) {
  const key = spriteKey(source, type);
  const cached = spriteCache.get(key);
  if (cached instanceof HTMLCanvasElement) return cached;
  if (!spriteReady.get(key)) {
    loadCreatureSprite(source, type);
    return null;
  }
  return cached ?? null;
}

export function creatureTexturePattern(ctx, type, rendererOpts = {}) {
  if (rendererOpts.creatureSpriteSource) return null;
  return proceduralPattern(ctx, type);
}

export function creatureTextureUsesImages(rendererOpts = {}) {
  return false;
}