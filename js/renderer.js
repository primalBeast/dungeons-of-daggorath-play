import {
  HF, VF, STPTAB, DIR_DX, DIR_DY, CREATURE_MAP_COLORS, CREATURE_SPRITE_SCALE,
} from './data.js';
import { V, WALL_VEC, CREATURE_VEC, SCALEF, CX, CY } from './vectors.js';
import { wireframeTheme } from './themes/wireframe.js';
import {
  clearCreatureTextureCache, creatureTexturePattern, creatureTextureUsesImages,
  getCreatureSprite, getWallTile, preloadCreatureTextures,
} from './creature-textures.js';
import {
  drawTexturedQuad, drawTexturedTriangleSurface, drawWallShading,
} from './wall-map.js';

const MAX_RANGE = 9;

const GRID = 32;

export class Renderer {
  constructor(canvas, mapCanvas, heartCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mapCanvas = mapCanvas ?? null;
    this.mctx = mapCanvas ? mapCanvas.getContext('2d') : null;
    this.heartCanvas = heartCanvas;
    this.hctx = heartCanvas.getContext('2d');
    this.inverted = false;
    this.attackFlash = null;
    this.theme = wireframeTheme;
    this.snapA = document.createElement('canvas');
    this.snapB = document.createElement('canvas');
  }

  withTargetCtx(targetCtx, w, h, fn) {
    const prevCtx = this.ctx;
    const prevCanvas = this.canvas;
    this.ctx = targetCtx;
    this.canvas = { width: w, height: h };
    try {
      fn();
    } finally {
      this.ctx = prevCtx;
      this.canvas = prevCanvas;
    }
  }

  ensureSnapshotSize(w, h) {
    for (const snap of [this.snapA, this.snapB]) {
      if (snap.width !== w || snap.height !== h) {
        snap.width = w;
        snap.height = h;
      }
    }
  }

  turnEase(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
  }

  setTheme(theme) {
    this.theme = theme;
    clearCreatureTextureCache();
    preloadCreatureTextures(theme.renderer ?? {});
  }

  themeRenderer() {
    return this.theme?.renderer ?? wireframeTheme.renderer;
  }

  creatureDepthEnabled() {
    return this.themeRenderer().creatureDepth === true;
  }

  creatureTextureEnabled() {
    return this.themeRenderer().creatureTexture === true;
  }

  wallTextureEnabled() {
    return !!this.themeRenderer().wallTextureSource;
  }

  triggerAttackFlash(game, cidx, durationMs = 300) {
    const c = game.creatures.list[cidx];
    if (!c?.active) return;
    const origin = this.attackOrigin(game, c);
    this.attackFlash = {
      startMs: performance.now(),
      durationMs,
      originX: origin.x,
      originY: origin.y,
    };
  }

  attackOrigin(game, creature) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h * 0.46;
    const dr = creature.row - game.player.row;
    const dc = creature.col - game.player.col;
    if (dr === 0 && dc === 0) {
      const rel = (creature.facing - game.player.dir + 4) & 3;
      const spread = Math.min(w, h) * 0.07;
      if (rel === 0) return { x: cx, y: cy - spread };
      if (rel === 2) return { x: cx, y: cy + spread };
      if (rel === 3) return { x: cx - spread, y: cy };
      return { x: cx + spread, y: cy };
    }

    const fwd = [
      [-1, 0], [0, 1], [1, 0], [0, -1],
    ][game.player.dir & 3];
    const right = [
      [0, 1], [1, 0], [0, -1], [-1, 0],
    ][game.player.dir & 3];
    const ahead = dr * fwd[0] + dc * fwd[1];
    const side = dr * right[0] + dc * right[1];
    const scale = Math.min(w, h) * 0.24;
    return {
      x: cx + side * scale,
      y: cy - ahead * scale * 0.85,
    };
  }

  drawAttackFlash(now) {
    const flash = this.attackFlash;
    if (!flash) return;
    const t = (now - flash.startMs) / flash.durationMs;
    if (t >= 1) {
      this.attackFlash = null;
      return;
    }

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const fade = (1 - t) * (1 - t);
    const expand = 0.25 + t * 0.85;
    const { originX, originY } = flash;

    ctx.save();
    ctx.fillStyle = this.inverted
      ? `rgba(255, 90, 70, ${0.18 * fade})`
      : `rgba(255, 50, 30, ${0.28 * fade})`;
    ctx.fillRect(0, 0, w, h);

    const lineCount = 14;
    const maxLen = Math.max(w, h) * 0.58 * expand;
    ctx.lineCap = 'round';
    ctx.strokeStyle = this.inverted
      ? `rgba(200, 30, 20, ${0.85 * fade})`
      : `rgba(255, 140, 90, ${0.95 * fade})`;
    ctx.lineWidth = 1.5 + fade * 2.5;

    for (let i = 0; i < lineCount; i++) {
      const angle = (i / lineCount) * Math.PI * 2 + t * 0.4;
      const len = maxLen * (0.65 + (i % 4) * 0.08);
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(
        originX + Math.cos(angle) * len,
        originY + Math.sin(angle) * len,
      );
      ctx.stroke();
    }

    ctx.fillStyle = `rgba(255, 220, 160, ${0.7 * fade})`;
    ctx.beginPath();
    ctx.arc(originX, originY, 3 + t * 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  setInverted(on) {
    this.inverted = on;
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('inverted', on);
    }
  }

  fg() {
    return this.strokeFor('wall');
  }

  strokeFor(kind = 'wall') {
    const r = this.themeRenderer();
    if (this.inverted) return r.strokeDark;
    if (kind === 'creature' && r.strokeCreature) return r.strokeCreature;
    if (kind === 'ceiling' && r.strokeCeiling) return r.strokeCeiling;
    if (kind === 'object' && r.strokeObject) return r.strokeObject;
    return r.strokeLight;
  }

  minimapPalette() {
    const r = this.themeRenderer();
    const m = r.minimap;
    if (m) {
      return {
        void: this.inverted ? '#ccc' : m.void,
        floor: this.inverted ? '#666' : m.floor,
        wall: this.inverted ? '#222' : m.wall,
        door: m.door,
        player: m.player,
        playerStroke: m.playerStroke,
        label: this.inverted ? '#000' : m.label,
        creatureStroke: m.creatureStroke ?? '#1a1a1a',
      };
    }
    return {
      void: this.inverted ? '#ccc' : '#181818',
      floor: this.inverted ? '#666' : '#4d8a4d',
      wall: this.inverted ? '#222' : '#b8e8b8',
      door: '#e8c040',
      player: '#ff4444',
      playerStroke: '#ffffff',
      label: this.inverted ? '#000' : '#fff',
      creatureStroke: '#1a1a1a',
    };
  }

  clear() {
    const r = this.themeRenderer();
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    if (!this.inverted && r.viewportGradient) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, r.viewportGradient.top);
      g.addColorStop(1, r.viewportGradient.bottom);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = this.inverted ? r.viewportBgInverted : r.viewportBg;
    }
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = this.fg();
    ctx.fillStyle = this.fg();
  }

  drawVignette() {
    const strength = this.themeRenderer().vignette;
    if (!strength || this.inverted) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h * 0.46;
    const radius = Math.max(w, h) * 0.72;
    const g = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius);
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, `rgba(4, 2, 12, ${strength})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  scaleX(x, range, w) {
    return ((x - CX) * SCALEF[range]) / 127 * (w / 256) + w / 2;
  }

  scaleY(y, range, h) {
    return ((y - CY) * SCALEF[range]) / 127 * (h / 220) + h * 0.46;
  }

  fadeAlpha(range, player) {
    const torch = Math.max(player.rLight, player.mLight);
    if (torch <= 0) return range <= 1 ? 0.12 : 0;
    let a = torch - 7 - range;
    if (a < 0) {
      const skip = Math.min(8, 1 << Math.min(7, -1 - a));
      return Math.max(0, 1 - (range / (torch + 1)) - skip * 0.04);
    }
    return Math.max(0.15, 1 - range * (0.85 / (torch + 3)));
  }

  lineWidthFor(range, kind = 'wall') {
    const tr = this.themeRenderer();
    if (kind === 'creature') {
      if (range < 2) return tr.creatureLineNear;
      if (range < 4) return tr.creatureLineMid;
      return tr.creatureLineFar;
    }
    return range < 2 ? tr.wallLineNear : tr.wallLineFar;
  }

  paintVectorList(vla, range, w, h, alpha, kind, glowPass = false, widthScale = 1, opts = {}) {
    const ctx = this.ctx;
    const tr = this.themeRenderer();
    const numLists = vla[0];
    let ctr = 1;
    const lineScale = opts.lineScale ?? 1;
    const lineW = this.lineWidthFor(range, kind) * (glowPass ? 1.45 : 1) * widthScale * lineScale;
    const stroke = this.strokeFor(kind);

    ctx.globalAlpha = alpha * (glowPass ? 0.55 : 1);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.lineCap = opts.portrait ? 'round' : (tr.lineCap ?? 'butt');
    ctx.lineJoin = opts.portrait ? 'round' : 'miter';
    if (glowPass && tr.glow) {
      ctx.shadowBlur = tr.glow.blur;
      ctx.shadowColor = tr.glow.color;
    }

    for (let list = 0; list < numLists; list++) {
      const verts = vla[ctr++];
      for (let seg = 0; seg < verts - 1; seg++) {
        const x0 = this.scaleX(vla[ctr], range, w);
        const y0 = this.scaleY(vla[ctr + 1], range, h);
        const x1 = this.scaleX(vla[ctr + 2], range, w);
        const y1 = this.scaleY(vla[ctr + 3], range, h);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctr += 2;
      }
      ctr += 2;
    }
  }

  forEachWallPolygon(vla, range, w, h, wallType, fn) {
    if (!vla || vla[0] === 0) return;

    let ctr = 1;
    const lists = [];
    for (let list = 0; list < vla[0]; list++) {
      const n = vla[ctr++];
      const points = [];
      for (let i = 0; i < n; i++) {
        points.push({
          x: this.scaleX(vla[ctr], range, w),
          y: this.scaleY(vla[ctr + 1], range, h),
        });
        ctr += 2;
      }
      lists.push({ n, points });
    }

    const textureKind = (index) => {
      if (wallType === HF.SDR) return 'stone';
      if (index === 1) return 'door';
      return 'stone';
    };

    if (lists.length >= 2 && lists[0].n === 2 && lists[1].n === 2) {
      const top = lists[0].points;
      const bot = lists[1].points;
      fn([top[0], top[1], bot[1], bot[0]], 'stone');
      for (let i = 2; i < lists.length; i++) {
        if (lists[i].n >= 3) fn(lists[i].points, 'door');
      }
      return;
    }

    if (wallType === HF.DOR && lists.length >= 2 && lists[0].n >= 3 && lists[1].n >= 3) {
      fn(lists[0].points, 'stone');
      fn(lists[1].points, 'door');
      return;
    }

    for (let i = 0; i < lists.length; i++) {
      if (lists[i].n < 3) continue;
      fn(lists[i].points, textureKind(i));
    }
  }

  fillWallTexture(wallType, vla, range, w, h, alpha) {
    const tr = this.themeRenderer();
    const source = tr.wallTextureSource;
    if (!source) return false;

    const ctx = this.ctx;
    let filled = false;
    const doorPanels = [];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    this.forEachWallPolygon(vla, range, w, h, wallType, (points, kind) => {
      if (points.length < 3) return;
      const tile = getWallTile(source, kind);
      if (!tile) return;

      const isDoor = kind === 'door';
      if (points.length === 3) {
        drawTexturedTriangleSurface(ctx, tile, points);
      } else if (isDoor) {
        ctx.filter = 'brightness(1.3) contrast(1.15) saturate(1.1)';
        drawTexturedQuad(ctx, tile, points, { u0: 0, v0: 0, u1: 1, v1: 1 });
        doorPanels.push(points);
      } else {
        if (source === 'nightmare') ctx.filter = 'contrast(1.18) brightness(1.04)';
        drawTexturedQuad(ctx, tile, points);
      }
      ctx.filter = 'none';
      drawWallShading(ctx, points, alpha, range);
      filled = true;
    });

    if (doorPanels.length > 0) {
      this.drawDoorAccents(doorPanels, range, alpha);
    }

    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    return filled;
  }

  drawDoorAccents(panels, range, alpha) {
    const ctx = this.ctx;
    const tr = this.themeRenderer();
    const stroke = tr.doorAccent ?? '#e8a040';
    const glow = tr.doorGlow ?? 'rgba(232, 160, 64, 0.45)';
    const lineW = range < 2 ? 2.8 : range < 4 ? 2.2 : 1.6;

    for (const points of panels) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();

      ctx.globalAlpha = alpha * 0.22;
      ctx.fillStyle = glow;
      ctx.fill();

      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineW;
      ctx.lineJoin = 'round';
      ctx.shadowBlur = range < 3 ? 6 : 3;
      ctx.shadowColor = glow;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawWallVectorList(wallType, vla, range, w, h, alpha) {
    if (!vla || vla[0] === 0 || alpha <= 0) return;
    if (this.wallTextureEnabled()) {
      const filled = this.fillWallTexture(wallType, vla, range, w, h, alpha);
      if (filled) {
        if (wallType === HF.DOR) {
          this.drawVectorList(vla, range, w, h, alpha * 0.95, 'wall');
        }
        return;
      }
    }
    this.drawVectorList(vla, range, w, h, alpha);
  }

  drawVectorList(vla, range, w, h, alpha, kind = 'wall', opts = {}) {
    if (!vla || vla[0] === 0 || alpha <= 0) return;
    const tr = this.themeRenderer();
    const ctx = this.ctx;
    ctx.save();
    if (tr.glow && !this.inverted && !opts.portrait) {
      this.paintVectorList(vla, range, w, h, alpha, kind, true, 1, opts);
      ctx.shadowBlur = 0;
    }
    this.paintVectorList(vla, range, w, h, alpha, kind, false, 1, opts);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  cellNeighbors(dungeon, row, col) {
    const v = dungeon.maze[dungeon.rc2idx(row, col)];
    return [v & 3, (v >> 2) & 3, (v >> 4) & 3, (v >> 6) & 3];
  }

  drawDarkness(w, h) {
    const r = this.themeRenderer();
    if (!this.inverted && r.viewportGradient) {
      const g = this.ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, r.viewportGradient.top);
      g.addColorStop(1, r.viewportGradient.bottom);
      this.ctx.fillStyle = g;
    } else {
      this.ctx.fillStyle = this.inverted ? r.viewportBgInverted : r.viewportBg;
    }
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.fillStyle = this.inverted ? '#333' : (r.strokeCeiling ?? '#888');
    this.ctx.font = '14px monospace';
    this.ctx.fillText('DARKNESS', w / 2 - 40, h / 2);
    this.drawVignette();
  }

  collectViewportSlices(game, pdir) {
    const { player, dungeon } = game;
    const slices = [];
    let row = player.row;
    let col = player.col;

    for (let range = 0; range <= MAX_RANGE; range++) {
      const alpha = this.fadeAlpha(range, player);
      if (alpha <= 0.02) break;

      const nb = this.cellNeighbors(dungeon, row, col);
      slices.push({ range, row, col, alpha, nb });

      if (nb[pdir] !== HF.PAS) break;
      row += STPTAB[pdir * 2];
      col += STPTAB[pdir * 2 + 1];
      if (!dungeon.isPassable(row, col)) break;
    }
    return slices;
  }

  collectPeekWedgeVerts(side, range, w, h) {
    const vla = side === 'left' ? V.LPEEK : V.RPEEK;
    const verts = [];
    let ctr = 2;
    const n = vla[1];
    for (let i = 0; i < n; i++) {
      verts.push({
        x: this.scaleX(vla[ctr], range, w),
        y: this.scaleY(vla[ctr + 1], range, h),
      });
      ctr += 2;
    }
    return verts;
  }

  sideOpeningVerts(side, range, w, h) {
    const vla = side === 'left' ? V.LPAS : V.RPAS;
    const verts = [];
    let ctr = 2;
    const n = vla[1];
    for (let i = 0; i < n; i++) {
      verts.push({
        x: this.scaleX(vla[ctr], range, w),
        y: this.scaleY(vla[ctr + 1], range, h),
      });
      ctr += 2;
    }
    return verts;
  }

  sideOpeningAnchor(side, range, w, h) {
    const verts = this.sideOpeningVerts(side, range, w, h);
    if (verts.length < 4) return { x: w * 0.2, y: h * 0.5 };
    // Inner edge of the portal (the side that faces the corridor we're looking down).
    if (side === 'left') {
      return {
        x: (verts[1].x + verts[2].x) * 0.5,
        y: (verts[1].y + verts[2].y) * 0.5,
      };
    }
    return {
      x: (verts[1].x + verts[2].x) * 0.5,
      y: (verts[1].y + verts[2].y) * 0.5,
    };
  }

  sideOpeningBounds(verts) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const v of verts) {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  clipSideOpening(side, range, w, h) {
    const verts = this.sideOpeningVerts(side, range, w, h);
    if (verts.length < 3) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    ctx.clip();
  }

  clipPeekWedge(side, range, w, h) {
    const verts = this.collectPeekWedgeVerts(side, range, w, h);
    if (verts.length < 3) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    ctx.clip();
  }

  drawViewportSliceWalls(game, slice, pdir, w, h, wallMask = 'all') {
    const { dungeon } = game;
    const { range, row, col, alpha, nb } = slice;
    const sides = [
      nb[(pdir + 3) & 3],
      nb[pdir],
      nb[(pdir + 1) & 3],
    ];

    for (let i = 0; i < 3; i++) {
      if (wallMask === 'noForward' && i === 1) continue;
      if (wallMask === 'forwardOnly' && i !== 1) continue;
      const wt = sides[i];
      const drawType = wt === HF.SDR ? HF.WAL : wt;
      const vecs = WALL_VEC[drawType];
      const key = i === 0 ? 'L' : i === 1 ? 'F' : 'R';
      this.drawWallVectorList(wt, vecs[key], range, w, h, alpha);
    }

    if (wallMask === 'forwardOnly') return;

    const vfi = dungeon.vfind(row, col);
    if (vfi !== null) {
      if (vfi === VF.LADDER_UP || vfi === VF.HOLE_UP) {
        this.drawVectorList(V.LAD, range, w, h, alpha);
        this.drawVectorList(V.HUP, range, w, h, alpha);
      } else if (vfi === VF.LADDER_DOWN || vfi === VF.HOLE_DOWN) {
        this.drawVectorList(V.LAD, range, w, h, alpha);
        this.drawVectorList(V.HDN, range, w, h, alpha);
      }
    } else {
      this.drawVectorList(V.CEIL, range, w, h, alpha * 0.7, 'ceiling');
    }
  }

  drawViewportSlice(game, slice, pdir, w, h, drawnCreatures) {
    const { level } = game;
    const { range, row, col, alpha } = slice;

    // Peeks behind this slice's walls — nearer walls paint over them next.
    this.drawCreaturePeeks(game, row, col, pdir, range, w, h, alpha, drawnCreatures, 'behind');

    const cidx = game.creatures.atCell(row, col);
    const sameCell = cidx >= 0
      && range < 1
      && row === game.player.row
      && col === game.player.col;

    if (sameCell) {
      // One step ahead the forward wall masks the creature's lower body. Draw
      // same-cell creatures behind that wall too so they do not pop downward.
      this.drawViewportSliceWalls(game, slice, pdir, w, h, 'noForward');
      const c = game.creatures.list[cidx];
      this.drawCreatureSprite(c.type, 1, w, h, alpha, 0, { sameCell: true });
      drawnCreatures.add(cidx);
      this.drawViewportSliceWalls(game, slice, pdir, w, h, 'forwardOnly');
    } else {
      this.drawViewportSliceWalls(game, slice, pdir, w, h);
      if (cidx >= 0) {
        this.drawCreatureSprite(
          game.creatures.list[cidx].type, range, w, h, alpha,
        );
        drawnCreatures.add(cidx);
      }
    }

    this.drawCreaturePeeks(game, row, col, pdir, range, w, h, alpha, drawnCreatures, 'front');

    const obj = game.objects.findAt(level, row, col);
    if (obj && alpha > 0.2) {
      this.drawObjectSprite(range, w, h, alpha * 0.9);
    }
  }

  drawViewportScene(game, pdir, w, h) {
    const slices = this.collectViewportSlices(game, pdir);
    const drawnCreatures = new Set();

    // Far slices first; within each slice: behind-peeks → walls → creatures.
    for (let i = slices.length - 1; i >= 0; i--) {
      this.drawViewportSlice(game, slices[i], pdir, w, h, drawnCreatures);
    }
    this.ctx.globalAlpha = 1;
  }

  drawViewportTo(targetCtx, game, pdir, w, h) {
    this.withTargetCtx(targetCtx, w, h, () => {
      this.clear();
      const torch = Math.max(game.player.rLight, game.player.mLight);
      if (torch <= 0 && game.player.mLight <= 0) {
        this.drawDarkness(w, h);
        return;
      }
      this.drawViewportScene(game, pdir, w, h);
    });
  }

  drawTurnSweepLines(w, h, edgeX, kind) {
    const ctx = this.ctx;
    const spacing = Math.max(14, w * 0.018);
    const count = kind === 'around' ? 7 : 5;
    ctx.save();
    ctx.strokeStyle = this.fg();
    ctx.lineCap = 'round';
    ctx.lineWidth = kind === 'around' ? 2.2 : 1.8;
    for (let i = -Math.floor(count / 2); i <= Math.floor(count / 2); i++) {
      const x = edgeX + i * spacing;
      const fade = 1 - Math.min(1, Math.abs(i) / (count * 0.55));
      ctx.globalAlpha = 0.15 + fade * 0.35;
      ctx.beginPath();
      ctx.moveTo(x, h * 0.07);
      ctx.lineTo(x, h * 0.93);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawTurnTransition(game, turn, now, w, h) {
    const t = Math.min(1, (now - turn.startMs) / turn.durationMs);
    const eased = this.turnEase(t);
    this.ensureSnapshotSize(w, h);

    const aCtx = this.snapA.getContext('2d');
    const bCtx = this.snapB.getContext('2d');
    this.drawViewportTo(aCtx, game, turn.fromDir, w, h);
    this.drawViewportTo(bCtx, game, turn.toDir, w, h);

    const ctx = this.ctx;
    this.clear();
    ctx.drawImage(this.snapA, 0, 0);

    let edgeX = 0;
    if (turn.kind === 'left') {
      edgeX = eased * w;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, edgeX, h);
      ctx.clip();
      ctx.drawImage(this.snapB, 0, 0);
      ctx.restore();
    } else if (turn.kind === 'right') {
      edgeX = (1 - eased) * w;
      ctx.save();
      ctx.beginPath();
      ctx.rect(edgeX, 0, w - edgeX, h);
      ctx.clip();
      ctx.drawImage(this.snapB, 0, 0);
      ctx.restore();
    } else {
      edgeX = eased * w;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, edgeX, h);
      ctx.clip();
      ctx.drawImage(this.snapB, 0, 0);
      ctx.restore();
    }

    this.drawTurnSweepLines(w, h, edgeX, turn.kind);

    if (turn.kind === 'around' && t > 0.42 && t < 0.58) {
      const flash = 1 - Math.abs(t - 0.5) / 0.08;
      ctx.save();
      ctx.globalAlpha = flash * 0.18;
      ctx.fillStyle = this.fg();
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    this.drawVignette();
    this.drawAttackFlash(now);

    if (t >= 1) game.turnAnim = null;
  }

  draw(game, now = performance.now()) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const turn = game.turnAnim;

    if (turn) {
      this.drawTurnTransition(game, turn, now, w, h);
      return;
    }

    this.clear();
    const torch = Math.max(game.player.rLight, game.player.mLight);
    if (torch <= 0 && game.player.mLight <= 0) {
      this.drawDarkness(w, h);
      return;
    }

    this.drawViewportScene(game, game.player.dir, w, h);
    this.drawVignette();
    this.drawAttackFlash(now);
  }

  tryPeekCreature(game, row, col, range, w, h, alpha, side, mode, drawn) {
    if (!game.dungeon.isPassable(row, col)) return;
    const cidx = game.creatures.atCell(row, col);
    if (cidx < 0 || drawn.has(cidx)) return;
    this.drawCreaturePeek(
      game.creatures.list[cidx].type,
      range,
      w,
      h,
      alpha,
      side,
      mode,
    );
    drawn.add(cidx);
  }

  drawCreaturePeeks(game, row, col, pdir, range, w, h, alpha, drawn, layer) {
    const dungeon = game.dungeon;
    const nb = this.cellNeighbors(dungeon, row, col);
    const fwdOpen = nb[pdir] === HF.PAS;

    for (const sideOff of [3, 1]) {
      const sideDir = (pdir + sideOff) & 3;
      const side = sideOff === 3 ? 'left' : 'right';
      const sideOpen = nb[sideDir] === HF.PAS;

      const sr = row + STPTAB[sideDir * 2];
      const sc = col + STPTAB[sideDir * 2 + 1];
      // Side passage peek: sprite first, then walls paint over the hidden flank.
      if (sideOpen && layer === 'behind') {
        this.tryPeekCreature(
          game, sr, sc, range, w, h, alpha * 0.9, side, 'opening', drawn,
        );
      }
    }

    if (!fwdOpen && layer === 'behind') {
      for (const sideOff of [3, 1]) {
        const sideDir = (pdir + sideOff) & 3;
        const side = sideOff === 3 ? 'left' : 'right';
        const dr = row + STPTAB[pdir * 2] + STPTAB[sideDir * 2];
        const dc = col + STPTAB[pdir * 2 + 1] + STPTAB[sideDir * 2 + 1];
        this.tryPeekCreature(
          game, dr, dc, range, w, h, alpha * 0.88, side, 'edge', drawn,
        );
      }

      const fr = row + STPTAB[pdir * 2];
      const fc = col + STPTAB[pdir * 2 + 1];
      const aheadRange = Math.min(range + 1, MAX_RANGE);
      const aheadAlpha = this.fadeAlpha(aheadRange, game.player);
      if (aheadAlpha > 0.02) {
        this.tryPeekCreature(
          game, fr, fc, aheadRange, w, h, aheadAlpha * 0.8, 'forward', 'forward', drawn,
        );
      }
    }
  }

  usesCreatureImages() {
    return !!this.themeRenderer().creatureSpriteSource && !this.inverted;
  }

  clipForwardCorridor(range, w, h, forImages = false) {
    const t = Math.min(1, range / 4);
    const topInset = w * (0.2 + t * 0.07);
    const botInset = w * (0.14 + t * 0.05);
    const ctx = this.ctx;
    ctx.beginPath();
    if (forImages) {
      // Photoreal sprites extend above wireframe heads (e.g. viper hood) — keep side walls, open the top.
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w - botInset, h);
      ctx.lineTo(botInset, h);
    } else {
      ctx.moveTo(topInset, h * 0.34);
      ctx.lineTo(w - topInset, h * 0.34);
      ctx.lineTo(w - botInset, h);
      ctx.lineTo(botInset, h);
    }
    ctx.closePath();
    ctx.clip();
  }

  // Left hall → right half of sprite; right hall → left half of sprite.
  peekVisibleImageHalf(passageSide) {
    return passageSide === 'left' ? 'right' : 'left';
  }

  peekSpriteSourceCrop(passageSide, sprite) {
    const sw = sprite.width;
    const sh = sprite.height;
    const half = Math.floor(sw * 0.5);
    if (this.peekVisibleImageHalf(passageSide) === 'right') {
      return { sx: half, sy: 0, sW: sw - half, sH: sh };
    }
    return { sx: 0, sy: 0, sW: half, sH: sh };
  }

  peekOpeningDestRect(passageSide, bounds, crop, sizeScale) {
    const destH = bounds.h * 1.1 * sizeScale;
    const destW = destH * (crop.sW / crop.sH);
    const destY = bounds.maxY - destH;
    const bleed = destW * 0.06;
    const destX = passageSide === 'left'
      ? bounds.minX - bleed
      : bounds.maxX + bleed - destW;
    return { destX, destY, destW, destH };
  }

  drawCreaturePeekSpriteHalf(type, range, w, h, alpha, side, destX, destY, destW, destH) {
    const tr = this.themeRenderer();
    const sprite = getCreatureSprite(tr.creatureSpriteSource, type);
    if (!sprite) return false;

    const { sx, sy, sW, sH } = this.peekSpriteSourceCrop(side, sprite);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sprite, sx, sy, sW, sH, destX, destY, destW, destH);
    ctx.restore();
    return true;
  }

  drawCreaturePeekImage(type, range, w, h, alpha, side, mode) {
    const tr = this.themeRenderer();
    const sprite = getCreatureSprite(tr.creatureSpriteSource, type);
    if (!sprite) return;

    const ctx = this.ctx;
    const sizeScale = CREATURE_SPRITE_SCALE[type] ?? 1;
    const crop = this.peekSpriteSourceCrop(side, sprite);

    ctx.save();

    if (mode === 'forward') {
      ctx.beginPath();
      ctx.rect(w * 0.28, 0, w * 0.44, h * 0.62);
      ctx.clip();
      this.drawCreatureSpriteImage(type, range, w, h, alpha, 0.85, { peek: true });
      ctx.restore();
      return;
    }

    if (mode === 'opening') {
      const bounds = this.sideOpeningBounds(this.sideOpeningVerts(side, range, w, h));
      const { destX, destY, destW, destH } = this.peekOpeningDestRect(side, bounds, crop, sizeScale);
      this.drawCreaturePeekSpriteHalf(type, range, w, h, alpha, side, destX, destY, destW, destH);
      ctx.restore();
      return;
    }

    // Dead-end corner: wedge clip, corridor-facing half only.
    this.clipPeekWedge(side, range, w, h);
    const wedge = this.collectPeekWedgeVerts(side, range, w, h);
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const v of wedge) {
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    }
    const wedgeH = Math.max(maxY - wedge[0].y, h * 0.08);
    const destH = wedgeH * 1.35 * sizeScale;
    const destW = destH * (crop.sW / crop.sH);
    const destY = maxY - destH;
    const bleed = destW * 0.06;
    const destX = side === 'left' ? minX - bleed : maxX + bleed - destW;
    this.drawCreaturePeekSpriteHalf(type, range, w, h, alpha, side, destX, destY, destW, destH);
    ctx.restore();
  }

  drawCreaturePeek(type, range, w, h, alpha, side, mode = 'edge') {
    if (this.usesCreatureImages()) {
      this.drawCreaturePeekImage(type, range, w, h, alpha, side, mode);
      return;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';

    if (mode === 'opening') {
      const xOff = side === 'left' ? -0.24 : 0.24;
      const band = w * 0.44;
      ctx.beginPath();
      if (side === 'left') ctx.rect(0, 0, band, h);
      else ctx.rect(w - band, 0, band, h);
      ctx.clip();
      this.drawCreatureSprite(type, range, w, h, alpha, xOff);
      ctx.restore();
      return;
    }

    if (mode === 'forward') {
      ctx.beginPath();
      ctx.rect(w * 0.28, 0, w * 0.44, h * 0.62);
      ctx.clip();
      this.drawCreatureSprite(type, range, w, h, alpha, 0);
      ctx.restore();
      return;
    }

    const wedge = side === 'left' ? V.LPEEK : V.RPEEK;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = this.fg();
    ctx.lineWidth = range <= 1 ? 2.2 : 1.6;
    this.drawVectorList(wedge, range, w, h, alpha, 'creature');

    const peekW = w * (range <= 1 ? 0.34 : 0.26);
    const shift = side === 'left' ? -0.28 : 0.28;
    ctx.beginPath();
    if (side === 'left') ctx.rect(0, 0, peekW, h);
    else ctx.rect(w - peekW, 0, peekW, h);
    ctx.clip();
    this.drawCreatureSprite(type, range, w, h, alpha * 0.75, shift);
    ctx.restore();
  }

  collectCreatureVerts(vla, range, w, h) {
    const verts = [];
    let ctr = 1;
    for (let list = 0; list < vla[0]; list++) {
      const n = vla[ctr++];
      for (let seg = 0; seg < n - 1; seg++) {
        verts.push({
          x: this.scaleX(vla[ctr], range, w),
          y: this.scaleY(vla[ctr + 1], range, h),
        });
        ctr += 2;
      }
      ctr += 2;
    }
    return verts;
  }

  pickDepthAnchorVerts(verts, max = 10) {
    if (verts.length === 0) return [];
    let cx = 0;
    let cy = 0;
    for (const v of verts) {
      cx += v.x;
      cy += v.y;
    }
    cx /= verts.length;
    cy /= verts.length;

    const scored = verts.map((v, i) => ({
      i,
      dist: (v.x - cx) ** 2 + (v.y - cy) ** 2,
      bucket: Math.floor((Math.atan2(v.y - cy, v.x - cx) + Math.PI) / (Math.PI / 4)),
    }));
    scored.sort((a, b) => b.dist - a.dist);

    const seen = new Set();
    const out = [];
    for (const s of scored) {
      if (out.length >= max) break;
      if (seen.has(s.bucket)) continue;
      seen.add(s.bucket);
      out.push(s.i);
    }
    return out;
  }

  creatureWireFootY(type, range, w, h) {
    const vla = CREATURE_VEC[type];
    if (!vla || vla[0] === 0) return h * 0.72;
    const verts = this.collectCreatureVerts(vla, range, w, h);
    if (verts.length === 0) return h * 0.72;
    return Math.max(...verts.map((v) => v.y));
  }

  creatureDepthParams(range, w, h) {
    const s = SCALEF[range] / 200;
    const near = range <= 1;
    const mid = range <= 3;
    return {
      offsetY: s * (near ? 22 : mid ? 13 : 8),
      scaleX: near ? 0.8 : mid ? 0.86 : 0.91,
      scaleY: near ? 0.7 : mid ? 0.78 : 0.85,
      pivotY: h * 0.56,
      groundDrop: s * (near ? 10 : 5),
    };
  }

  projectDepthPoint(x, y, depth, cx) {
    const dx = x - cx;
    const dy = y - depth.pivotY;
    return {
      x: cx + dx * depth.scaleX,
      y: depth.pivotY + dy * depth.scaleY + depth.offsetY,
    };
  }

  forEachCreaturePolygon(vla, range, w, h, fn) {
    let ctr = 1;
    for (let list = 0; list < vla[0]; list++) {
      const n = vla[ctr++];
      if (n < 3) {
        ctr += n * 2;
        continue;
      }
      const points = [];
      for (let i = 0; i < n; i++) {
        points.push({
          x: this.scaleX(vla[ctr], range, w),
          y: this.scaleY(vla[ctr + 1], range, h),
        });
        ctr += 2;
      }
      fn(points);
    }
  }

  drawCreatureSpriteImage(type, range, w, h, alpha, scaleMul = 1, opts = {}) {
    const tr = this.themeRenderer();
    const sprite = getCreatureSprite(tr.creatureSpriteSource, type);
    if (!sprite) return false;

    const ctx = this.ctx;
    const sizeScale = CREATURE_SPRITE_SCALE[type] ?? 1;
    const scale = (SCALEF[range] / SCALEF[1]) * sizeScale * scaleMul;
    const cx = w / 2;
    const cy = h * 0.46;
    const footY = this.creatureWireFootY(type, range, w, h);
    const footAtScale = cy + (this.creatureWireFootY(type, 1, w, h) - cy) * scale;
    const yAdjust = footY - footAtScale;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(cx, cy + yAdjust);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    // Sprites authored at 256×220 (or 512×440 for hi-res); same space as wireframe vectors.
    ctx.drawImage(sprite, 0, 0, w, h);
    ctx.restore();
    return true;
  }

  fillCreatureTexture(type, vla, range, w, h, alpha) {
    const ctx = this.ctx;
    const tr = this.themeRenderer();
    const pattern = creatureTexturePattern(ctx, type, tr);
    if (!pattern) return;

    const imageTex = creatureTextureUsesImages(tr);

    ctx.save();
    ctx.globalAlpha = alpha * (imageTex ? 0.96 : 0.92);

    this.forEachCreaturePolygon(vla, range, w, h, (points) => {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = pattern;
      ctx.fill();
    });

    if (!imageTex) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = 'rgba(40, 8, 8, 0.55)';
      this.forEachCreaturePolygon(vla, range, w, h, (points) => {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.fill();
      });
    }

    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  drawCreatureSpriteFlat(type, range, w, h, alpha, xOff = 0, opts = {}) {
    const vla = CREATURE_VEC[type];
    if (!vla || vla[0] === 0) return;
    const ctx = this.ctx;
    const tr = this.themeRenderer();
    const xShift = xOff !== 0 ? xOff * SCALEF[range] * (w / 256) : 0;

    ctx.save();
    if (xShift) ctx.translate(xShift, 0);

    if (tr.creatureSpriteSource && !this.inverted) {
      if (!opts.peek && xOff === 0) {
        // Keep the open top clip (matches one-step-ahead). A closed clip crops the
        // head and makes the body look like it dropped when entering the player's cell.
        this.clipForwardCorridor(range, w, h, true);
      }
      const drew = this.drawCreatureSpriteImage(type, range, w, h, alpha, opts.peek ? 0.92 : 1, opts);
      if (drew) {
        ctx.globalAlpha = 1;
        ctx.restore();
        return;
      }
    }

    if (this.creatureTextureEnabled() && !this.inverted) {
      const texAlpha = opts.portrait ? alpha * 0.8 : alpha;
      this.fillCreatureTexture(type, vla, range, w, h, texAlpha);
    }

    this.drawVectorList(vla, range, w, h, alpha, 'creature', opts);

    if (tr.creatureHighlight && range <= 2 && alpha > 0.25 && !opts.portrait) {
      ctx.save();
      this.paintVectorList(
        vla, range, w, h, alpha * 0.45, 'creature', false, range < 1 ? 1.45 : 1.18, opts,
      );
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawCreatureSpriteDepth(type, range, w, h, alpha, xOff = 0, opts = {}) {
    const vla = CREATURE_VEC[type];
    if (!vla || vla[0] === 0) return;
    const ctx = this.ctx;
    const tr = this.themeRenderer();
    const depth = this.creatureDepthParams(range, w, h);
    const xShift = xOff !== 0 ? xOff * SCALEF[range] * (w / 256) : 0;
    const cx = w / 2;

    ctx.save();
    if (xShift) ctx.translate(xShift, 0);

    const localVerts = this.collectCreatureVerts(vla, range, w, h);
    if (localVerts.length < 2) {
      ctx.restore();
      return;
    }

    const footY = Math.max(...localVerts.map((v) => v.y));
    const minX = Math.min(...localVerts.map((v) => v.x));
    const maxX = Math.max(...localVerts.map((v) => v.x));
    const span = maxX - minX;
    const groundY = footY + depth.groundDrop;

    ctx.strokeStyle = this.fg();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.globalAlpha = alpha * 0.32;
    ctx.lineWidth = range < 2 ? 1 : 0.75;
    ctx.beginPath();
    ctx.ellipse(
      (minX + maxX) / 2,
      groundY,
      span * 0.4,
      depth.groundDrop * 0.48,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();

    const backLeft = this.projectDepthPoint(minX, footY, depth, cx);
    const backRight = this.projectDepthPoint(maxX, footY, depth, cx);
    ctx.globalAlpha = alpha * 0.3;
    ctx.lineWidth = range < 2 ? 0.9 : 0.65;
    ctx.beginPath();
    ctx.moveTo(backLeft.x, backLeft.y);
    ctx.lineTo(backRight.x, backRight.y);
    ctx.lineTo(maxX, footY);
    ctx.lineTo(minX, footY);
    ctx.closePath();
    ctx.stroke();

    ctx.save();
    ctx.translate(0, depth.offsetY);
    ctx.translate(cx, depth.pivotY);
    ctx.scale(depth.scaleX, depth.scaleY);
    ctx.translate(-cx, -depth.pivotY);
    this.drawVectorList(vla, range, w, h, alpha * 0.22);
    ctx.restore();

    const anchorCount = range <= 1 ? 12 : range <= 3 ? 9 : 6;
    const anchors = this.pickDepthAnchorVerts(localVerts, anchorCount);
    if (anchors.length > 0) {
      ctx.globalAlpha = alpha * 0.55;
      ctx.lineWidth = range < 2 ? 1.2 : 0.85;
      for (const i of anchors) {
        const v = localVerts[i];
        const back = this.projectDepthPoint(v.x, v.y, depth, cx);
        ctx.beginPath();
        ctx.moveTo(back.x, back.y);
        ctx.lineTo(v.x, v.y);
        ctx.stroke();
      }
    }

    const footBand = Math.max(span * 0.08, 2);
    const footVerts = localVerts.filter((v) => v.y >= footY - footBand);
    if (footVerts.length > 0) {
      const footAnchors = this.pickDepthAnchorVerts(footVerts, 5);
      ctx.globalAlpha = alpha * 0.38;
      ctx.lineWidth = range < 2 ? 0.85 : 0.6;
      for (const i of footAnchors) {
        const v = footVerts[i];
        ctx.beginPath();
        ctx.moveTo(v.x, v.y);
        ctx.lineTo(v.x, groundY);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = alpha;
    ctx.lineWidth = range < 2
      ? tr.creatureLineNear
      : range < 4
        ? tr.creatureLineMid
        : tr.creatureLineFar;
    this.drawVectorList(vla, range, w, h, alpha);

    if (tr.creatureHighlight && range <= 2 && alpha > 0.25) {
      ctx.globalAlpha = alpha * 0.45;
      ctx.lineWidth = range < 1 ? 2.6 : 2.1;
      this.drawVectorList(vla, range, w, h, alpha);
    }

    ctx.globalAlpha = 1;
    ctx.lineJoin = 'miter';
    ctx.restore();
  }

  drawCreatureSprite(type, range, w, h, alpha, xOff = 0, opts = {}) {
    if (this.creatureDepthEnabled()) {
      this.drawCreatureSpriteDepth(type, range, w, h, alpha, xOff, opts);
    } else {
      this.drawCreatureSpriteFlat(type, range, w, h, alpha, xOff, opts);
    }
  }

  drawCreaturePortrait(targetCanvas, type) {
    const w = targetCanvas.width;
    const h = targetCanvas.height;
    const tctx = targetCanvas.getContext('2d');
    const vla = CREATURE_VEC[type];
    if (!vla || vla[0] === 0) return;

    this.withTargetCtx(tctx, w, h, () => {
      const r = this.themeRenderer();
      if (!this.inverted && r.viewportGradient) {
        const g = tctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, r.viewportGradient.top);
        g.addColorStop(1, r.viewportGradient.bottom);
        tctx.fillStyle = g;
      } else {
        tctx.fillStyle = this.inverted ? r.viewportBgInverted : r.viewportBg;
      }
      tctx.fillRect(0, 0, w, h);

      const range = 2;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      const track = (x, y) => {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      };

      this.forEachCreaturePolygon(vla, range, w, h, (points) => {
        for (const p of points) track(p.x, p.y);
      });
      for (const v of this.collectCreatureVerts(vla, range, w, h)) {
        track(v.x, v.y);
      }

      if (!Number.isFinite(minX)) return;

      const span = Math.max(maxX - minX, maxY - minY, 1);
      const scale = (Math.min(w, h) * 0.86) / span;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;

      const portraitOpts = {
        portrait: true,
        lineScale: Math.max(0.18, 0.72 / scale),
      };

      tctx.save();
      tctx.translate(w / 2, h / 2);
      tctx.scale(scale, scale);
      tctx.translate(-cx, -cy);
      this.drawCreatureSprite(type, range, w, h, 1, 0, portraitOpts);
      tctx.restore();
    });
  }

  drawMapEdge(ctx, wf, geom, cell, wallC, doorC) {
    const lw = Math.max(1, cell * 0.08);
    ctx.lineWidth = lw;
    ctx.setLineDash([]);
    if (wf === HF.WAL || wf === HF.SDR) {
      ctx.strokeStyle = wallC;
      ctx.beginPath();
      ctx.moveTo(geom.x1, geom.y1);
      ctx.lineTo(geom.x2, geom.y2);
      ctx.stroke();
      return;
    }
    ctx.strokeStyle = doorC;
    const mx = (geom.x1 + geom.x2) / 2;
    const my = (geom.y1 + geom.y2) / 2;
    const gap = cell * 0.44;
    const horiz = Math.abs(geom.y2 - geom.y1) < 0.5;
    if (horiz) {
      ctx.beginPath();
      ctx.moveTo(geom.x1, geom.y1);
      ctx.lineTo(mx - gap / 2, geom.y1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx + gap / 2, geom.y1);
      ctx.lineTo(geom.x2, geom.y2);
      ctx.stroke();
      const dw = gap * 0.58;
      const dh = cell * 0.24;
      ctx.strokeRect(mx - dw / 2, geom.y1 - dh / 2, dw, dh);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(geom.x1, geom.y1);
    ctx.lineTo(geom.x1, my - gap / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(geom.x2, geom.y2);
    ctx.lineTo(geom.x2, my + gap / 2);
    ctx.stroke();
    const dw = cell * 0.24;
    const dh = gap * 0.58;
    ctx.strokeRect(geom.x1 - dw / 2, my - dh / 2, dw, dh);
  }

  drawObjectSprite(range, w, h, alpha) {
    const ctx = this.ctx;
    const cx = w / 2;
    const y = this.scaleY(120, range, h);
    const s = (SCALEF[range] / 200) * 10;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = this.strokeFor('object');
    ctx.strokeRect(cx - s, y - s, s * 2, s);
    ctx.globalAlpha = 1;
  }

  drawHeart(player, now) {
    const ctx = this.hctx;
    const cw = this.heartCanvas.width;
    const ch = this.heartCanvas.height;
    ctx.clearRect(0, 0, cw, ch);
    const ep = player.effectivePower();
    const max = player.power || 160;
    const ratio = Math.max(0, Math.min(1, ep / max));
    const beat = Math.sin((now / player.heartbeatInterval()) * Math.PI * 2);
    const scale = 1 + beat * 0.08 * (1 - ratio);

    const heart = this.themeRenderer().heart;
    ctx.fillStyle = ratio < 0.25
      ? (heart?.low ?? '#c44')
      : (heart?.healthy ?? '#c66');
    const hw = (cw - 8) * ratio;
    const hh = (ch - 6) * scale;
    const y = (ch - hh) / 2;
    ctx.beginPath();
    ctx.moveTo(4, y + hh * 0.3);
    ctx.bezierCurveTo(4, y, hw * 0.3, y, hw * 0.5, y + hh * 0.35);
    ctx.bezierCurveTo(hw * 0.7, y, hw + 4, y, hw + 4, y + hh * 0.3);
    ctx.bezierCurveTo(hw + 4, y + hh, hw * 0.5, y + hh, 4, y + hh * 0.7);
    ctx.closePath();
    ctx.fill();
  }

  drawMinimap(game, now = 0) {
    if (!this.mapCanvas || !this.mctx) return;

    const { dungeon, player, level } = game;
    const ctx = this.mctx;
    const w = this.mapCanvas.width;
    const h = this.mapCanvas.height;
    const mapSize = Math.min(w, h);
    const cell = mapSize / GRID;
    const ox = (w - mapSize) / 2;
    const oy = (h - mapSize) / 2;
    const pal = this.minimapPalette();
    const {
      void: voidC, floor, wall: wallC, door: doorC,
      player: playerC, playerStroke: playerStrokeC, label: labelC,
      creatureStroke: creatureStrokeC,
    } = pal;

    ctx.fillStyle = voidC;
    ctx.fillRect(0, 0, w, h);

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (!dungeon.isPassable(r, c)) continue;
        const x = ox + c * cell;
        const y = oy + r * cell;
        ctx.fillStyle = floor;
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);

        const v = dungeon.maze[dungeon.rc2idx(r, c)];
        const edges = [
          { mask: 0x03, shift: 0, x1: x, y1: y, x2: x + cell, y2: y },
          { mask: 0x0c, shift: 2, x1: x + cell, y1: y, x2: x + cell, y2: y + cell },
          { mask: 0x30, shift: 4, x1: x, y1: y + cell, x2: x + cell, y2: y + cell },
          { mask: 0xc0, shift: 6, x1: x, y1: y, x2: x, y2: y + cell },
        ];
        for (const e of edges) {
          const wf = (v & e.mask) >> e.shift;
          if (wf === HF.PAS) continue;
          this.drawMapEdge(ctx, wf, e, cell, wallC, doorC);
        }
      }
    }
    ctx.setLineDash([]);

    dungeon.forEachTransitionCell((row, col) => {
      if (!dungeon.isPassable(row, col)) return;
      const vfi = dungeon.vfind(row, col);
      if (vfi === null) return;
      const cx = ox + (col + 0.5) * cell;
      const cy = oy + (row + 0.5) * cell;
      const down = vfi === VF.LADDER_DOWN || vfi === VF.HOLE_DOWN;
      const size = Math.max(2.5, cell * 0.22);
      ctx.fillStyle = down ? (pal.stairDown ?? '#5ad4ff') : (pal.stairUp ?? '#ffe066');
      ctx.fillRect(cx - size, cy - size, size * 2, size * 2);
    });

    for (const c of game.creatures.list) {
      if (!c.active || !dungeon.isPassable(c.row, c.col)) continue;
      const cx = ox + (c.col + 0.5) * cell;
      const cy = oy + (c.row + 0.5) * cell;
      const r = Math.max(3, cell * 0.17);
      ctx.fillStyle = CREATURE_MAP_COLORS[c.type];
      ctx.strokeStyle = creatureStrokeC;
      ctx.lineWidth = Math.max(1, cell * 0.06);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    const px = ox + (player.col + 0.5) * cell;
    const py = oy + (player.row + 0.5) * cell;
    this.drawPlayerMarker(
      ctx, px, py, cell, player.dir, playerC, playerStrokeC, now, 1,
    );

    if (game.findFlash) {
      this.drawPlayerFindFlash(
        game, ctx, px, py, cell, ox, oy, mapSize, player, now,
      );
    }

    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = labelC;
    ctx.fillText(`LEVEL ${level + 1}`, ox + 6, oy + 14);
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`R${player.row} C${player.col}`, ox + mapSize - 6, oy + 14);
    ctx.textAlign = 'left';

    if (game.ui.updateMapLegend) {
      game.ui.updateMapLegend(level);
    }
  }

  drawPlayerMarker(ctx, px, py, cell, dir, fill, stroke, now, scale = 1) {
    const facing = dir & 3;
    const dx = DIR_DX[facing];
    const dy = DIR_DY[facing];
    const perpX = -dy;
    const perpY = dx;
    const shaft = cell * 0.34 * scale;
    const head = cell * 0.24 * scale;
    const tipX = px + dx * shaft;
    const tipY = py + dy * shaft;
    const tailX = px - dx * shaft * 0.45;
    const tailY = py - dy * shaft * 0.45;
    const pulse = 0.9 + Math.sin(now * 0.006) * 0.1;

    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(2, cell * 0.1 * scale);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tailX + perpX * head * pulse, tailY + perpY * head * pulse);
    ctx.lineTo(tailX - perpX * head * 0.55, tailY - perpY * head * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.lineJoin = 'miter';
  }

  drawPlayerFindFlash(game, ctx, px, py, cell, ox, oy, mapSize, player, now) {
    const flash = game.findFlash;
    if (!flash) return;
    const t = (now - flash.startMs) / flash.durationMs;
    if (t >= 1) {
      game.findFlash = null;
      return;
    }

    const fade = (1 - t) ** 1.4;
    const pal = this.minimapPalette();
    const ping = pal.player;
    const accent = this.themeRenderer().minimap?.door ?? '#ffe066';

    ctx.save();

    const beamAlpha = fade * 0.22;
    ctx.strokeStyle = accent;
    ctx.globalAlpha = beamAlpha;
    ctx.lineWidth = 1;
    ctx.setLineDash([cell * 0.2, cell * 0.35]);
    ctx.beginPath();
    ctx.moveTo(ox, py);
    ctx.lineTo(ox + mapSize, py);
    ctx.moveTo(px, oy);
    ctx.lineTo(px, oy + mapSize);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < 4; i++) {
      const phase = (t * 2.4 - i * 0.22 + 1) % 1;
      const radius = cell * (0.35 + phase * 3.2);
      ctx.globalAlpha = (1 - phase) * fade * 0.75;
      ctx.strokeStyle = ping;
      ctx.lineWidth = 1.5 + (1 - phase) * 2.5;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    const bx = ox + player.col * cell;
    const by = oy + player.row * cell;
    const boxPad = 1 + Math.sin(now * 0.03) * 1.5;
    ctx.globalAlpha = fade * 0.95;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -now * 0.12;
    ctx.strokeRect(
      bx + boxPad,
      by + boxPad,
      cell - 2 * boxPad,
      cell - 2 * boxPad,
    );
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    if (t < 0.75) {
      const pop = t < 0.12 ? t / 0.12 : 1;
      ctx.globalAlpha = fade * pop;
      ctx.font = `bold ${Math.max(10, cell * 0.42)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = accent;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      const labelY = py - cell * 0.62 - Math.sin(now * 0.018) * 2;
      ctx.strokeText('▼ YOU', px, labelY);
      ctx.fillText('▼ YOU', px, labelY);
      ctx.textAlign = 'left';
    }

    const glow = 0.55 + Math.sin(now * 0.035) * 0.45;
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 8 + glow * 14;
    ctx.shadowColor = accent;
    this.drawPlayerMarker(
      ctx, px, py, cell, player.dir, '#ffffff', accent, now, 1.12 + glow * 0.18,
    );
    ctx.shadowBlur = 0;

    ctx.restore();
  }
}