import {
  add,
  deg,
  dist,
  dot,
  itemCorners,
  mul,
  projectOnSegment,
  rad,
  roundTo,
  sub,
  v,
  wallFrame,
} from '../geometry';
import type { Design, Item, Vec } from '../types';

export type SnapKind = 'free' | 'grid' | 'endpoint' | 'wall' | 'angle';

export interface SnapResult {
  p: Vec;
  kind: SnapKind;
}

export interface SnapOptions {
  tol: number; // world-space tolerance in mm
  grid: number;
  free?: boolean;
  anchor?: Vec | null;
  extraPoints?: Vec[];
  excludeWalls?: Set<string>;
}

export function snapPoint(design: Design, raw: Vec, o: SnapOptions): SnapResult {
  if (o.free) return { p: raw, kind: 'free' };

  // 1. Existing wall endpoints and extra points (e.g. start of the current chain).
  let best: Vec | null = null;
  let bestD = o.tol;
  const consider = (p: Vec) => {
    const d = dist(p, raw);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  };
  for (const w of design.walls) {
    if (o.excludeWalls?.has(w.id)) continue;
    consider(w.start);
    consider(w.end);
  }
  o.extraPoints?.forEach(consider);
  if (best) return { p: { ...(best as Vec) }, kind: 'endpoint' };

  // 2. Angle snapping relative to the anchor (0/45/90...), with lengths rounded to the grid.
  if (o.anchor) {
    const d = sub(raw, o.anchor);
    const ang = deg(Math.atan2(d.y, d.x));
    const snapped = Math.round(ang / 45) * 45;
    if (Math.abs(ang - snapped) < 6) {
      const dir = v(Math.cos(rad(snapped)), Math.sin(rad(snapped)));
      const l = roundTo(dot(d, dir), o.grid);
      const p = add(o.anchor, mul(dir, l));
      // Prefer landing on an existing wall line if the angled ray crosses one nearby.
      const onWall = nearestWallPoint(design, p, o.tol, o.excludeWalls);
      if (onWall) {
        const hit = rayWallIntersection(design, o.anchor, dir, p, o.tol, o.excludeWalls);
        if (hit) return { p: hit, kind: 'wall' };
      }
      return { p: { x: Math.round(p.x), y: Math.round(p.y) }, kind: 'angle' };
    }
  }

  // 3. A point on an existing wall's centreline.
  const onWall = nearestWallPoint(design, raw, o.tol, o.excludeWalls);
  if (onWall) return { p: onWall, kind: 'wall' };

  // 4. Grid.
  return { p: { x: roundTo(raw.x, o.grid), y: roundTo(raw.y, o.grid) }, kind: 'grid' };
}

function nearestWallPoint(design: Design, raw: Vec, tol: number, exclude?: Set<string>): Vec | null {
  let best: Vec | null = null;
  let bestD = tol;
  for (const w of design.walls) {
    if (exclude?.has(w.id)) continue;
    const pr = projectOnSegment(raw, w.start, w.end);
    if (pr.dist < bestD && pr.t > 0 && pr.t < 1) {
      bestD = pr.dist;
      best = { x: Math.round(pr.point.x), y: Math.round(pr.point.y) };
    }
  }
  return best;
}

function rayWallIntersection(design: Design, o: Vec, dir: Vec, near: Vec, tol: number, exclude?: Set<string>): Vec | null {
  let best: Vec | null = null;
  let bestD = tol;
  for (const w of design.walls) {
    if (exclude?.has(w.id)) continue;
    const e = sub(w.end, w.start);
    const den = dir.x * e.y - dir.y * e.x;
    if (Math.abs(den) < 1e-9) continue;
    const q = sub(w.start, o);
    const t = (q.x * e.y - q.y * e.x) / den;
    const s = (q.x * dir.y - q.y * dir.x) / den;
    if (s < 0 || s > 1 || t <= 0) continue;
    const p = add(o, mul(dir, t));
    const d = dist(p, near);
    if (d < bestD) {
      bestD = d;
      best = { x: Math.round(p.x), y: Math.round(p.y) };
    }
  }
  return best;
}

/** Item types that make sense to stand freely in the room rather than backing onto a wall. */
const FREE_STANDING = new Set([
  'solar_array',
  'skylight',
  'sun_tunnel',
  'rug',
  'coffee_table',
  'dining_table',
  'round_table',
  'island',
  'car',
  'column',
  'bar_stool',
  'chair',
  'office_chair',
  'armchair',
  'plant',
  'floor_lamp',
  'sofa_3',
  'sofa_2',
]);

type Placeable = Pick<Item, 'width' | 'depth' | 'rotation' | 'type'> & { id?: string };

export interface ItemSnap {
  x: number;
  y: number;
  rotation: number;
  wallId: string | null;
  /** Alignment lines to show (world coordinates): the edges it lined up with. */
  guides: [Vec, Vec][];
}

/** Rotation in [0, 360). */
const norm360 = (a: number) => ((a % 360) + 360) % 360;

/**
 * Snap an item being placed/moved: back it onto a nearby wall (facing into the room), square it up to a
 * neighbouring item when it's out in the room, then line its sides up with neighbours / perpendicular walls and
 * (away from walls) its front and back with neighbours'.
 */
export function snapItem(design: Design, it: Placeable, raw: Vec, opts: { tol: number; grid: number; free: boolean }): ItemSnap {
  if (opts.free) return { x: Math.round(raw.x), y: Math.round(raw.y), rotation: it.rotation, wallId: null, guides: [] };

  let pos = raw;
  let rotation = it.rotation;
  let wallId: string | null = null;
  const others = design.items.filter((o) => o.id !== it.id && o.type !== 'rug');

  if (!FREE_STANDING.has(it.type)) {
    let bestScore = Infinity;
    for (const w of design.walls) {
      const f = wallFrame(w);
      const pr = projectOnSegment(raw, w.start, w.end);
      if (pr.t <= 0 || pr.t >= 1) continue;
      const faceGap = pr.dist - w.thickness / 2 - it.depth / 2;
      const range = Math.max(opts.tol * 2, Math.min(400, it.depth * 0.6));
      if (faceGap > range || pr.dist < w.thickness / 2) continue;
      const score = Math.abs(faceGap);
      if (score < bestScore) {
        bestScore = score;
        const fdir = mul(f.n, pr.side);
        rotation = ((Math.round(deg(Math.atan2(-fdir.x, fdir.y))) % 360) + 360) % 360;
        pos = add(pr.point, mul(fdir, w.thickness / 2 + it.depth / 2));
        wallId = w.id;
      }
    }
    // Out in the room: square up to the nearest neighbour (keeping roughly the way it faces).
    if (!wallId) {
      const reach = Math.max(opts.tol * 3, 300);
      let near: Item | null = null;
      let nearD = reach;
      for (const o of others) {
        const dd = dist(raw, v(o.x, o.y)) - Math.hypot(o.width, o.depth) / 2 - Math.hypot(it.width, it.depth) / 2;
        if (dd < nearD) {
          nearD = dd;
          near = o;
        }
      }
      if (near) {
        const steps = [0, 90, 180, 270].map((k) => norm360(near!.rotation + k));
        const off = (a: number) => Math.abs(((a - rotation + 540) % 360) - 180);
        rotation = steps.reduce((a, b) => (off(b) < off(a) ? b : a));
      }
    }
  }

  if (!wallId) pos = { x: roundTo(pos.x, opts.grid), y: roundTo(pos.y, opts.grid) };

  // Line up edges. a = the item's width axis, b = its depth axis (front is +b).
  const r = rad(rotation);
  const a = v(Math.cos(r), Math.sin(r));
  const b = v(-Math.sin(r), Math.cos(r));
  const ca = dot(pos, a);
  const cb = dot(pos, b);
  const span = (corners: Vec[]) => {
    const pa = corners.map((c) => dot(c, a));
    const pb = corners.map((c) => dot(c, b));
    return { a0: Math.min(...pa), a1: Math.max(...pa), b0: Math.min(...pb), b1: Math.max(...pb) };
  };
  const rects = others.map((o) => span(itemCorners(o)));
  const wallRects: ReturnType<typeof span>[] = [];
  for (const w of design.walls) {
    const f = wallFrame(w);
    if (Math.abs(dot(f.u, a)) > 0.1) continue; // only walls perpendicular to the width axis
    const h = mul(f.n, w.thickness / 2);
    wallRects.push(span([add(w.start, h), sub(w.start, h), add(w.end, h), sub(w.end, h)]));
  }
  const near = (lo: number, hi: number, l2: number, h2: number, slack: number) => hi >= l2 - slack && lo <= h2 + slack;

  /** Best snap of our edges [lo, hi] to any stop, within tolerance. */
  const pick = (lo: number, hi: number, stops: { at: number; from: number; to: number }[]) => {
    let best: { delta: number; at: number; from: number; to: number } | null = null;
    for (const st of stops)
      for (const edge of [lo, hi]) {
        const dl = st.at - edge;
        if (Math.abs(dl) < opts.tol && (!best || Math.abs(dl) < Math.abs(best.delta))) best = { delta: dl, ...st };
      }
    return best;
  };

  // Sides: against neighbours beside it (overlapping in depth) or lined up with their sides.
  const bLo = cb - it.depth / 2;
  const bHi = cb + it.depth / 2;
  const sideStops = [...rects, ...wallRects]
    .filter((q) => near(bLo, bHi, q.b0, q.b1, Math.max(20, opts.tol)))
    .flatMap((q) => [q.a0, q.a1].map((at) => ({ at, from: q.b0, to: q.b1 })));
  const sa = pick(ca - it.width / 2, ca + it.width / 2, sideStops);
  const da = sa?.delta ?? 0;

  // Front / back: away from walls, line up with neighbours beside it (touching or overlapping along the width).
  let db = 0;
  let sb: ReturnType<typeof pick> = null;
  if (!wallId) {
    const aLo = ca + da - it.width / 2;
    const aHi = ca + da + it.width / 2;
    const fbStops = rects.filter((q) => near(aLo, aHi, q.a0, q.a1, Math.max(20, opts.tol))).flatMap((q) => [q.b0, q.b1].map((at) => ({ at, from: q.a0, to: q.a1 })));
    sb = pick(bLo, bHi, fbStops);
    db = sb?.delta ?? 0;
  }
  pos = add(pos, add(mul(a, da), mul(b, db)));

  // Guides along the edges it lined up with, spanning both items.
  const P = (pa: number, pb: number) => add(mul(a, pa), mul(b, pb));
  const guides: [Vec, Vec][] = [];
  if (sa) guides.push([P(sa.at, Math.min(sa.from, bLo + db) - 150), P(sa.at, Math.max(sa.to, bHi + db) + 150)]);
  if (sb) guides.push([P(Math.min(sb.from, ca + da - it.width / 2) - 150, sb.at), P(Math.max(sb.to, ca + da + it.width / 2) + 150, sb.at)]);

  return { x: Math.round(pos.x), y: Math.round(pos.y), rotation, wallId, guides };
}

/** Find the wall closest to a point (for placing doors/windows). */
export function nearestWall(design: Design, p: Vec, maxDist: number) {
  let best: { wallId: string; along: number; length: number; dist: number } | null = null;
  for (const w of design.walls) {
    const pr = projectOnSegment(p, w.start, w.end);
    const lim = Math.max(maxDist, w.thickness / 2 + maxDist / 2);
    if (pr.dist > lim) continue;
    if (!best || pr.dist < best.dist) best = { wallId: w.id, along: pr.along, length: wallFrame(w).length, dist: pr.dist };
  }
  return best;
}

