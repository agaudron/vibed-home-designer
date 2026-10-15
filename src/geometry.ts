import type { Design, Opening, Vec, Wall } from './types';

export const v = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const len = (a: Vec) => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Vec): Vec => {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 };
};
/** Rotate by an angle in radians (clockwise on screen, since y points down). */
export const rot = (a: Vec, r: number): Vec => {
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};
export const near = (a: Vec, b: Vec, tol = 1) => dist(a, b) <= tol;
export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;
export const roundTo = (n: number, step: number) => (step > 0 ? Math.round(n / step) * step : n);
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function normAngle(d: number) {
  let a = d % 360;
  if (a < 0) a += 360;
  return Math.round(a * 100) / 100;
}

export interface WallFrame {
  u: Vec; // unit vector along the wall
  n: Vec; // unit normal (left of u in maths terms)
  length: number;
  angle: number; // radians
}

export function wallFrame(w: Wall): WallFrame {
  const d = sub(w.end, w.start);
  const length = len(d);
  const u = norm(d);
  return { u, n: { x: -u.y, y: u.x }, length, angle: Math.atan2(u.y, u.x) };
}

export interface Projection {
  point: Vec;
  t: number; // 0..1 along the segment
  along: number; // mm from start
  dist: number; // distance from the segment
  side: number; // +1 if p is on the +n side, -1 otherwise
}

export function projectOnSegment(p: Vec, a: Vec, b: Vec): Projection {
  const d = sub(b, a);
  const l2 = dot(d, d);
  const t = l2 > 0 ? clamp(dot(sub(p, a), d) / l2, 0, 1) : 0;
  const point = add(a, mul(d, t));
  const n = { x: -d.y, y: d.x };
  const side = dot(sub(p, point), n) >= 0 ? 1 : -1;
  return { point, t, along: t * Math.sqrt(l2), dist: dist(p, point), side };
}

/** How far each end of a wall should be extended so it overlaps neighbouring walls at corners/T-junctions. */
export function wallExtensions(w: Wall, walls: Wall[]): { e0: number; e1: number } {
  let e0 = 0;
  let e1 = 0;
  for (const o of walls) {
    if (o.id === w.id) continue;
    const half = o.thickness / 2;
    for (const [end, which] of [
      [w.start, 0],
      [w.end, 1],
    ] as const) {
      const touches =
        near(end, o.start, 1) || near(end, o.end, 1) || projectOnSegment(end, o.start, o.end).dist < 1;
      if (!touches) continue;
      // Don't extend collinear continuations (they already meet flush).
      const fw = wallFrame(w);
      const fo = wallFrame(o);
      if (Math.abs(fw.u.x * fo.u.y - fw.u.y * fo.u.x) < 0.02 && (near(end, o.start, 1) || near(end, o.end, 1))) continue;
      if (which === 0) e0 = Math.max(e0, half);
      else e1 = Math.max(e1, half);
    }
  }
  return { e0, e1 };
}

export function clampOpeningOffset(o: Pick<Opening, 'offset' | 'width'>, wallLength: number) {
  const half = o.width / 2;
  if (wallLength <= o.width) return wallLength / 2;
  return clamp(o.offset, half, wallLength - half);
}

/** Solid intervals [a, b] along a wall's length, excluding the openings. Also returns the opening spans. */
export function wallSpans(w: Wall, openings: Opening[], e0 = 0, e1 = 0) {
  const { length } = wallFrame(w);
  const ops = openings
    .filter((o) => o.wallId === w.id)
    .map((o) => {
      const c = clampOpeningOffset(o, length);
      return { o, a: c - o.width / 2, b: c + o.width / 2 };
    })
    .sort((p, q) => p.a - q.a);
  const solid: [number, number][] = [];
  let cur = -e0;
  for (const op of ops) {
    if (op.a > cur) solid.push([cur, op.a]);
    cur = Math.max(cur, op.b);
  }
  if (length + e1 > cur) solid.push([cur, length + e1]);
  return { solid, ops };
}

export function polygonArea(pts: Vec[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2);
}

export function polygonCentroid(pts: Vec[]): Vec {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-6) {
    const s = pts.reduce((acc, p) => add(acc, p), v(0, 0));
    return mul(s, 1 / Math.max(1, pts.length));
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Corners of an item footprint in plan coordinates. */
export function itemCorners(it: { x: number; y: number; width: number; depth: number; rotation: number }): Vec[] {
  const r = rad(it.rotation);
  const hw = it.width / 2;
  const hd = it.depth / 2;
  return [v(-hw, -hd), v(hw, -hd), v(hw, hd), v(-hw, hd)].map((p) => add(v(it.x, it.y), rot(p, r)));
}

export function formatMm(n: number) {
  return `${Math.round(n)}`;
}

export function formatArea(mm2: number) {
  return `${(mm2 / 1e6).toFixed(2)} m²`;
}

/** Evaluate a simple arithmetic expression such as "2400 + 90*2". Returns NaN if invalid. */
export function evalExpr(src: string): number {
  const s = src.replace(/\s+/g, '').replace(/mm$/i, '');
  let i = 0;
  const peek = () => s[i];
  function num(): number {
    if (peek() === '(') {
      i++;
      const r = expr();
      if (peek() !== ')') return NaN;
      i++;
      return r;
    }
    if (peek() === '-') {
      i++;
      return -num();
    }
    const m = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(s.slice(i));
    if (!m) return NaN;
    i += m[0].length;
    let val = parseFloat(m[0]);
    if (s.slice(i, i + 1).toLowerCase() === 'm' && s.slice(i, i + 2).toLowerCase() !== 'mm') {
      i++;
      val *= 1000; // "2.4m" -> 2400
    }
    return val;
  }
  function term(): number {
    let r = num();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      const b = num();
      r = op === '*' ? r * b : r / b;
    }
    return r;
  }
  function expr(): number {
    let r = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const b = term();
      r = op === '+' ? r + b : r - b;
    }
    return r;
  }
  const r = expr();
  return i === s.length ? r : NaN;
}

let idCounter = 0;
export function uid(prefix = 'id') {
  idCounter++;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${idCounter}`;
}

export interface WallGap {
  side: 1 | -1; // which side of the wall (along its normal)
  gap: number; // clear distance between the wall faces, mm
  a: Vec; // point on this wall's face
  b: Vec; // point on the other wall's face
  otherId: string;
  rank: number; // 0 = nearest wall on this side, 1 = next, ...
}

/**
 * Clear face-to-face distances from a wall to every parallel wall that runs alongside it, on both sides,
 * nearest first. Each dimension line is placed at its own spot along the wall so they don't sit on top of
 * each other or run along a perpendicular wall.
 */
export function wallGaps(w: Wall, walls: Wall[]): WallGap[] {
  const f = wallFrame(w);
  if (f.length < 1) return [];
  const found: { side: 1 | -1; gap: number; d: number; lo: number; hi: number; o: Wall }[] = [];
  for (const o of walls) {
    if (o.id === w.id) continue;
    const fo = wallFrame(o);
    if (Math.abs(f.u.x * fo.u.y - f.u.y * fo.u.x) > 0.05) continue; // not parallel
    const a0 = dot(sub(o.start, w.start), f.u);
    const a1 = dot(sub(o.end, w.start), f.u);
    const lo = Math.max(0, Math.min(a0, a1));
    const hi = Math.min(f.length, Math.max(a0, a1));
    if (hi - lo < 1) continue; // no overlap along the wall
    const d = dot(sub(o.start, w.start), f.n);
    const side: 1 | -1 = d >= 0 ? 1 : -1;
    const gap = Math.abs(d) - w.thickness / 2 - o.thickness / 2;
    if (gap <= 0.5) continue;
    // Walls in line with each other (e.g. a wall split by a junction) count once.
    const same = found.find((x) => x.side === side && Math.abs(x.gap - gap) < 1);
    if (same) {
      if (hi - lo > same.hi - same.lo) Object.assign(same, { d, lo, hi, o });
      continue;
    }
    found.push({ side, gap, d, lo, hi, o });
  }
  found.sort((p, q) => p.gap - q.gap);

  const perpendicular = walls.filter((x) => x.id !== w.id && Math.abs(dot(wallFrame(x).u, f.u)) < 0.1);
  const used: Record<number, number[]> = { 1: [], [-1]: [] };
  const spacing = Math.max(350, f.length * 0.07);
  const tries = [0.5, 0.35, 0.65, 0.2, 0.8, 0.42, 0.58, 0.27, 0.73, 0.12, 0.88, 0.05, 0.95];
  const out: WallGap[] = [];
  const rank: Record<number, number> = { 1: 0, [-1]: 0 };
  for (const g of found) {
    const along = (t: number) => g.lo + (g.hi - g.lo) * t;
    const seg = (t: number) => {
      const base = add(w.start, mul(f.u, along(t)));
      return { a: add(base, mul(f.n, g.side * (w.thickness / 2))), b: add(base, mul(f.n, g.d - g.side * (g.o.thickness / 2))) };
    };
    // Avoid drawing the line along (on top of) a perpendicular wall.
    const onWall = (sg: { a: Vec; b: Vec }) =>
      perpendicular.some((x) =>
        [0.25, 0.5, 0.75].some((k) => projectOnSegment(add(sg.a, mul(sub(sg.b, sg.a), k)), x.start, x.end).dist < x.thickness / 2 + 100),
      );
    const crowded = (t: number) => used[g.side].some((u) => Math.abs(u - along(t)) < spacing);
    const t =
      tries.find((tt) => !crowded(tt) && !onWall(seg(tt))) ?? tries.find((tt) => !crowded(tt)) ?? tries.find((tt) => !onWall(seg(tt))) ?? 0.5;
    used[g.side].push(along(t));
    out.push({ side: g.side, gap: g.gap, ...seg(t), otherId: g.o.id, rank: rank[g.side]++ });
  }
  return out;
}

export interface RoomInterior {
  /** Room outline moved in to the inside faces of the walls along each side. */
  inner: Vec[];
  /** Each internal side: clear length between wall faces, and the inward normal. */
  edges: { a: Vec; b: Vec; length: number; n: Vec }[];
  /** Floor area inside the walls, mm². */
  area: number;
  /** Internal width × depth when the room is a rectangle. */
  rect: [number, number] | null;
}

/**
 * Internal (finished floor) dimensions of a room. Room outlines run along wall centrelines, so each side is
 * moved inwards by half the thickness of the wall lying on it (sides with no wall, e.g. open plan, stay put).
 */
export function roomInterior(points: Vec[], walls: Wall[]): RoomInterior | null {
  const n = points.length;
  if (n < 3) return null;
  const sign = polygonSignedArea(points) > 0 ? 1 : -1;
  const lines = points.map((a, i) => {
    const b = points[(i + 1) % n];
    const u = norm(sub(b, a));
    const inward = mul(v(-u.y, u.x), sign); // left of a->b for positive (maths) orientation
    const L = dist(a, b);
    let off = 0;
    for (const w of walls) {
      const f = wallFrame(w);
      if (Math.abs(u.x * f.u.y - u.y * f.u.x) > 0.02) continue; // not parallel
      if (Math.abs(dot(sub(a, w.start), f.n)) > 5) continue; // not on this wall's centreline
      const a0 = dot(sub(w.start, a), u);
      const a1 = dot(sub(w.end, a), u);
      if (Math.min(L, Math.max(a0, a1)) - Math.max(0, Math.min(a0, a1)) < 1) continue; // no overlap
      off = Math.max(off, w.thickness / 2);
    }
    return { p: add(a, mul(inward, off)), u, inward };
  });
  const inner = lines.map((l1, i) => {
    const l0 = lines[(i - 1 + n) % n];
    const den = l0.u.x * l1.u.y - l0.u.y * l1.u.x;
    if (Math.abs(den) < 1e-9) return l1.p;
    const w = sub(l1.p, l0.p);
    const t = (w.x * l1.u.y - w.y * l1.u.x) / den;
    return add(l0.p, mul(l0.u, t));
  });
  const edges = inner.map((a, i) => {
    const b = inner[(i + 1) % n];
    return { a, b, length: dist(a, b), n: lines[i].inward };
  });
  let rect: [number, number] | null = null;
  if (n === 4) {
    const right = edges.every((e, i) => Math.abs(dot(norm(sub(e.b, e.a)), norm(sub(edges[(i + 1) % 4].b, edges[(i + 1) % 4].a)))) < 0.01);
    if (right) {
      const horizontalFirst = Math.abs(edges[0].b.x - edges[0].a.x) >= Math.abs(edges[0].b.y - edges[0].a.y);
      rect = horizontalFirst ? [edges[0].length, edges[1].length] : [edges[1].length, edges[0].length];
    }
  }
  return { inner, edges, area: polygonArea(inner), rect };
}

function polygonSignedArea(pts: Vec[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function pointInPolygon(p: Vec, poly: Vec[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export interface OpeningSideGaps {
  /** Positions along the host wall (mm from its start). */
  a: number; // near edge of the opening
  b: number; // far edge
  leftFace: number; // nearest wall face before the opening
  rightFace: number; // nearest wall face after it
}

/**
 * Distances from a door/window's edges to the nearest wall faces on either side along its wall
 * (walls that meet or cross it, or the wall's ends).
 */
export function openingSideGaps(o: Pick<Opening, 'offset' | 'width'>, host: Wall, walls: Wall[]): OpeningSideGaps {
  const f = wallFrame(host);
  const c = clampOpeningOffset(o, f.length);
  const a = c - o.width / 2;
  const b = c + o.width / 2;
  let leftFace = 0;
  let rightFace = f.length;
  for (const x of walls) {
    if (x.id === host.id) continue;
    const fx = wallFrame(x);
    const sin = f.u.x * fx.u.y - f.u.y * fx.u.x;
    if (Math.abs(sin) < 0.05 || fx.length < 1) continue; // parallel
    // Where x's centreline crosses the host's centreline.
    const q = sub(x.start, host.start);
    const s = (q.x * fx.u.y - q.y * fx.u.x) / sin; // along host
    const t = (q.x * f.u.y - q.y * f.u.x) / sin; // along x
    const reach = host.thickness / 2 + 1;
    if (t < -reach || t > fx.length + reach) continue; // x doesn't reach this wall
    if (s < -x.thickness || s > f.length + x.thickness) continue;
    const half = x.thickness / 2 / Math.abs(sin);
    for (const face of [s - half, s + half]) {
      if (face <= a + 0.5 && face > leftFace) leftFace = face;
      if (face >= b - 0.5 && face < rightFace) rightFace = face;
    }
  }
  return { a, b, leftFace, rightFace };
}

/**
 * Openings as walls see them: each door/window also cuts any other wall lying on top of its wall
 * (e.g. a wall drawn twice), so the doorway isn't filled in by the duplicate. Copies have ids "<id>#<wall>".
 */
export function effectiveOpenings(walls: Wall[], openings: Opening[]): Opening[] {
  const out = [...openings];
  for (const o of openings) {
    const host = walls.find((w) => w.id === o.wallId);
    if (!host) continue;
    const fh = wallFrame(host);
    const centre = add(host.start, mul(fh.u, clampOpeningOffset(o, fh.length)));
    for (const w of walls) {
      if (w.id === host.id) continue;
      const f = wallFrame(w);
      if (f.length < 1 || Math.abs(fh.u.x * f.u.y - fh.u.y * f.u.x) > 0.01) continue; // not parallel
      if (Math.abs(dot(sub(centre, w.start), f.n)) > Math.max(5, Math.abs(w.thickness - host.thickness) / 2 + 1)) continue; // not on the same line
      const along = dot(sub(centre, w.start), f.u);
      if (along < -o.width / 2 || along > f.length + o.width / 2) continue;
      out.push({ ...o, id: `${o.id}#${w.id}`, wallId: w.id, offset: along });
    }
  }
  return out;
}

/** Parts of segment a→b not already covered by an existing wall on the same line. */
export function uncoveredParts(walls: Wall[], a: Vec, b: Vec): [Vec, Vec][] {
  const L = dist(a, b);
  if (L < 1) return [];
  const u = norm(sub(b, a));
  const covered: [number, number][] = [];
  for (const w of walls) {
    const f = wallFrame(w);
    if (Math.abs(u.x * f.u.y - u.y * f.u.x) > 0.01) continue;
    if (Math.abs(dot(sub(w.start, a), v(-u.y, u.x))) > 5) continue;
    const s0 = dot(sub(w.start, a), u);
    const s1 = dot(sub(w.end, a), u);
    covered.push([Math.min(s0, s1), Math.max(s0, s1)]);
  }
  covered.sort((p, q) => p[0] - q[0]);
  const parts: [number, number][] = [];
  let cur = 0;
  for (const [x, y] of covered) {
    if (y <= cur) continue;
    if (x > cur + 1) parts.push([cur, Math.min(x, L)]);
    cur = Math.max(cur, y);
    if (cur >= L) break;
  }
  if (cur < L - 1) parts.push([cur, L]);
  return parts.filter(([x, y]) => y - x > 10).map(([x, y]) => [add(a, mul(u, x)), add(a, mul(u, y))]);
}

/**
 * A wall's visible length: its centreline length minus the bits that run into the walls it joins at each
 * end (corners and T-junctions). Returns the trims at each end too, so a typed clear length can be
 * turned back into a centreline length.
 */
export function wallClearLength(w: Wall, walls: Wall[]): { clear: number; e0: number; e1: number } {
  const { e0, e1 } = wallExtensions(w, walls);
  return { clear: Math.max(0, wallFrame(w).length - e0 - e1), e0, e1 };
}

/**
 * Widths of a door's sidelights on the wall's start side (left, along −x) and end side (right). The hinge is
 * on the start side unless `hingeEnd`.
 */
export function sidelights(o: Opening): { left: number; right: number } {
  const s = o.sidelight;
  if (!s || o.kind !== 'door') return { left: 0, right: 0 };
  const atHinge = s.hinge ? s.width : 0;
  const atLatch = s.latch ? s.width : 0;
  return o.hingeEnd ? { left: atLatch, right: atHinge } : { left: atHinge, right: atLatch };
}

export const DEFAULT_INTERIOR_DOOR = { design: 'flush', glass: 'translucent' as const, color: '#f4f1ea', jamb: 'single' as const };

/** Hinged / double doors that can take a leaf design. */
export const isLeafDoor = (o: Opening) => o.kind === 'door' || o.kind === 'double_door';

/**
 * The door as it should be drawn: a door on an inside wall with no design of its own follows the house
 * interior-door style (design, glass, colour, jamb).
 */
export function effectiveDoor(o: Opening, d: Design, onInsideWall: boolean): Opening {
  if (!isLeafDoor(o) || o.design || !onInsideWall) return o;
  const g = d.settings.interiorDoor ?? DEFAULT_INTERIOR_DOOR;
  return { ...o, design: g.design, glass: g.glass, color: g.color, jamb: o.jamb ?? g.jamb };
}

// ---------- Stacker doors ----------
/** Frame stiles each side and how much neighbouring panels overlap, in mm. */
export const STACKER_FRAME = 50;
export const STACKER_OVERLAP = 50;
export const STACKER_MAX_PANELS = 4;

/** Overall opening width for a stacker with n panels of the given width. */
export function stackerWidth(panels: number, panelWidth: number) {
  return Math.round(panels * panelWidth - (panels - 1) * STACKER_OVERLAP + 2 * STACKER_FRAME);
}

/**
 * Stacker panel layout across the opening (x from the centre). Panel 0 is the fixed one at the stacking end;
 * the others slide over it. `closed` and `open` are panel centres; `track` 0 is the outermost.
 */
export function stackerLayout(o: Pick<Opening, 'width' | 'panels' | 'hingeEnd'>) {
  const n = Math.max(2, Math.min(STACKER_MAX_PANELS, Math.round(o.panels ?? 3)));
  const inner = o.width - 2 * STACKER_FRAME;
  const pw = (inner + (n - 1) * STACKER_OVERLAP) / n;
  const dir = o.hingeEnd ? -1 : 1; // which end they stack at
  const end = dir * (inner / 2 - pw / 2);
  const panels = Array.from({ length: n }, (_, i) => ({
    closed: end - dir * i * (pw - STACKER_OVERLAP),
    open: end,
    track: i,
  }));
  return { n, pw, dir, panels };
}

/** Which face of the wall a window's curtains / blinds go on: the inside of the house (+1 = the wall's normal). */
export function dressingSide(o: Opening, outside: { pos?: boolean; neg?: boolean } | undefined): 1 | -1 {
  if (outside?.pos) return -1;
  if (outside?.neg) return 1;
  return o.dressing?.side ?? 1;
}

/** The paint colour on one face of a wall (+1 = the wall's normal side). */
export function faceColor(w: Wall, side: number): string {
  return (side > 0 ? w.sideColor?.pos : w.sideColor?.neg) ?? w.color;
}
