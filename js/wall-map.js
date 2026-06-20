/** Perspective-correct texture mapping onto wall/door quads (two-triangle affine). */

function affineFromTriangles(s0, s1, s2, d0, d1, d2) {
  const dx1 = d1.x - d0.x;
  const dy1 = d1.y - d0.y;
  const dx2 = d2.x - d0.x;
  const dy2 = d2.y - d0.y;
  const sx1 = s1.x - s0.x;
  const sy1 = s1.y - s0.y;
  const sx2 = s2.x - s0.x;
  const sy2 = s2.y - s0.y;
  const det = sx1 * sy2 - sx2 * sy1;
  if (Math.abs(det) < 1e-8) return null;
  const a = (dx1 * sy2 - dx2 * sy1) / det;
  const b = (dy1 * sy2 - dy2 * sy1) / det;
  const c = (dx2 * sx1 - dx1 * sx2) / det;
  const d = (dy2 * sx1 - dy1 * sx2) / det;
  const e = d0.x - a * s0.x - c * s0.y;
  const f = d0.y - b * s0.x - d * s0.y;
  return { a, b, c, d, e, f };
}

function drawTexturedTriangle(ctx, img, dst0, dst1, dst2, src0, src1, src2) {
  const m = affineFromTriangles(src0, src1, src2, dst0, dst1, dst2);
  if (!m) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dst0.x, dst0.y);
  ctx.lineTo(dst1.x, dst1.y);
  ctx.lineTo(dst2.x, dst2.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

export function orderWallQuad(points) {
  if (points.length !== 4) return points;
  const byY = [...points].sort((a, b) => a.y - b.y);
  const top = byY.slice(0, 2).sort((a, b) => a.x - b.x);
  const bot = byY.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bot[1], bot[0]];
}

export function drawTexturedTriangleSurface(ctx, img, points) {
  if (points.length < 3) return;
  const [p0, p1, p2] = points;
  const iw = img.width;
  const ih = img.height;
  drawTexturedTriangle(
    ctx, img, p0, p1, p2,
    { x: 0, y: 0 }, { x: iw, y: 0 }, { x: iw, y: ih },
  );
}

function lerpWallPoint(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function quadScreenSize(points) {
  const [tl, tr, br, bl] = orderWallQuad(points);
  const avgW = (
    Math.hypot(tr.x - tl.x, tr.y - tl.y)
    + Math.hypot(br.x - bl.x, br.y - bl.y)
  ) * 0.5;
  const avgH = (
    Math.hypot(bl.x - tl.x, bl.y - tl.y)
    + Math.hypot(br.x - tr.x, br.y - tr.y)
  ) * 0.5;
  return { avgW, avgH, aspect: avgW / Math.max(avgH, 1) };
}

/** Width/height of a perpendicular side-wall face — one texture tile spans this aspect. */
const SIDE_WALL_ASPECT = 0.55;

const FULL_UV = { u0: 0, v0: 0, u1: 1, v1: 1 };

/** How many horizontal texture tiles a wide wall face needs to match side-wall brick scale. */
export function computeWallTileCount(points, texW, texH) {
  const { aspect } = quadScreenSize(points);
  const texAspect = texW / texH;
  if (aspect <= texAspect * 1.05) return 1;
  return Math.max(1, Math.round(aspect / SIDE_WALL_ASPECT));
}

/** Map one texture across a quad using horizontal strips (no diagonal seam). */
function drawTexturedQuadSlice(ctx, img, points, map) {
  const [tl, tr, br, bl] = orderWallQuad(points);
  const rows = 10;
  const iw = img.width;
  const ih = img.height;
  const { u0, v0, u1, v1 } = map;

  for (let r = 0; r < rows; r++) {
    const t0 = r / rows;
    const t1 = (r + 1) / rows;
    const rowTL = lerpWallPoint(tl, bl, t0);
    const rowTR = lerpWallPoint(tr, br, t0);
    const rowBR = lerpWallPoint(tr, br, t1);
    const rowBL = lerpWallPoint(tl, bl, t1);
    const rv0 = v0 + (v1 - v0) * t0;
    const rv1 = v0 + (v1 - v0) * t1;
    const sTL = { x: u0 * iw, y: rv0 * ih };
    const sTR = { x: u1 * iw, y: rv0 * ih };
    const sBR = { x: u1 * iw, y: rv1 * ih };
    const sBL = { x: u0 * iw, y: rv1 * ih };
    drawTexturedTriangle(ctx, img, rowTL, rowTR, rowBR, sTL, sTR, sBR);
    drawTexturedTriangle(ctx, img, rowTL, rowBR, rowBL, sTL, sBR, sBL);
  }
}

/**
 * Wide front walls tile horizontally so each brick matches side-wall scale.
 * Pass explicit `uv` (e.g. doors) to map a single 0–1 tile without repeating.
 */
export function drawTexturedQuad(ctx, img, points, uv = null) {
  if (uv) {
    drawTexturedQuadSlice(ctx, img, points, uv);
    return;
  }

  const tiles = computeWallTileCount(points, img.width, img.height);
  if (tiles <= 1) {
    drawTexturedQuadSlice(ctx, img, points, FULL_UV);
    return;
  }

  const [tl, tr, br, bl] = orderWallQuad(points);
  for (let i = 0; i < tiles; i++) {
    const t0 = i / tiles;
    const t1 = (i + 1) / tiles;
    const slice = [
      lerpWallPoint(tl, tr, t0),
      lerpWallPoint(tl, tr, t1),
      lerpWallPoint(bl, br, t1),
      lerpWallPoint(bl, br, t0),
    ];
    drawTexturedQuadSlice(ctx, img, slice, FULL_UV);
  }
}

export function drawWallShading(ctx, points, alpha, range) {
  if (points.length < 3) return;
  const depth = Math.min(1, 0.22 + range * 0.07);
  const top = points.reduce((a, p) => (p.y < a.y ? p : a), points[0]);
  const bot = points.reduce((a, p) => (p.y > a.y ? p : a), points[0]);
  const g = ctx.createLinearGradient(top.x, top.y, bot.x, bot.y);
  g.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.06})`);
  g.addColorStop(1, `rgba(0, 0, 0, ${alpha * (0.28 + depth)})`);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  minX = maxX = points[0].x;
  minY = maxY = points[0].y;
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
    minX = Math.min(minX, points[i].x);
    minY = Math.min(minY, points[i].y);
    maxX = Math.max(maxX, points[i].x);
    maxY = Math.max(maxY, points[i].y);
  }
  ctx.closePath();
  ctx.clip();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = g;
  ctx.fillRect(minX - 2, minY - 2, maxX - minX + 4, maxY - minY + 4);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}