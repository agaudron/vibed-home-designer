import { frontDirection, gardenOf, housePoints, outwardNormal } from './garden';
import { dot, pointInPolygon, uid, v } from './geometry';
import type { Block, Design, Garden, SpotLevel, Vec } from './types';

/**
 * The lie of the land. Spot levels (heights relative to the ground at the house, 0) shape the natural ground: a
 * best-fit plane through them gives the overall slope, and the differences from it are blended in between the
 * levels, so three corner levels make an even slope and extra levels add humps and hollows. The house sits on a
 * flat pad at 0 that blends back into the natural ground a few metres out (the cut and fill).
 */

export interface Ground {
  /** Finished ground level at p (mm): the natural ground, levelled round the house. */
  at(p: Vec): number;
  /** Natural ground level at p, before any levelling. */
  natural(p: Vec): number;
  /** Lowest and highest finished ground over the block (or round the house with no block). */
  min: number;
  max: number;
}

/** How far the pad blends back into the natural ground (mm). */
const PAD_BLEND = 3000;
export const padMarginOf = (g: Garden) => Math.max(0, g.terrain?.padMargin ?? 1000);
export const padOn = (g: Garden) => g.terrain?.pad !== false;

/** Best-fit plane (or line, or constant) through the levels. */
function trend(levels: SpotLevel[]): (p: Vec) => number {
  const n = levels.length;
  const mx = levels.reduce((s, l) => s + l.x, 0) / n;
  const my = levels.reduce((s, l) => s + l.y, 0) / n;
  const mz = levels.reduce((s, l) => s + l.z, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let sxz = 0;
  let syz = 0;
  for (const l of levels) {
    const x = l.x - mx;
    const y = l.y - my;
    const z = l.z - mz;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
    sxz += x * z;
    syz += y * z;
  }
  const det = sxx * syy - sxy * sxy;
  if (n >= 3 && det > 1e-6 * (sxx + syy) ** 2) {
    const b = (sxz * syy - syz * sxy) / det;
    const c = (syz * sxx - sxz * sxy) / det;
    return (p) => mz + b * (p.x - mx) + c * (p.y - my);
  }
  if (sxx + syy > 1) {
    // All in a line: slope along it, level across it.
    const a = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const u = v(Math.cos(a), Math.sin(a));
    let num = 0;
    let den = 0;
    for (const l of levels) {
      const t = (l.x - mx) * u.x + (l.y - my) * u.y;
      num += t * (l.z - mz);
      den += t * t;
    }
    const k = den > 0 ? num / den : 0;
    return (p) => mz + k * ((p.x - mx) * u.x + (p.y - my) * u.y);
  }
  return () => mz;
}

/** The natural ground through the levels: the trend plus the levels' differences from it, blended by distance. */
export function naturalGround(levels: SpotLevel[]): (p: Vec) => number {
  if (!levels.length) return () => 0;
  const plane = trend(levels);
  const res = levels.map((l) => ({ x: l.x, y: l.y, r: l.z - plane(l) }));
  const bumpy = res.some((r) => Math.abs(r.r) > 1);
  return (p) => {
    const base = plane(p);
    if (!bumpy) return base;
    let sw = 0;
    let sr = 0;
    for (const r of res) {
      const d2 = (p.x - r.x) ** 2 + (p.y - r.y) ** 2;
      if (d2 < 1) return base + r.r;
      const w = 1 / d2;
      sw += w;
      sr += w * r.r;
    }
    return base + sr / sw;
  };
}

/** The house footprint as a rectangle in the frame of its front (what the pad is levelled round). */
function houseFrame(d: Design) {
  const hp = housePoints(d);
  if (!hp.length) return null;
  const n = frontDirection(d);
  const t = v(-n.y, n.x);
  const a = hp.map((p) => dot(p, t));
  const b = hp.map((p) => dot(p, n));
  const a0 = Math.min(...a);
  const a1 = Math.max(...a);
  const b0 = Math.min(...b);
  const b1 = Math.max(...b);
  return { n, t, ac: (a0 + a1) / 2, bc: (b0 + b1) / 2, ha: (a1 - a0) / 2, hb: (b1 - b0) / 2 };
}

const smooth = (x: number) => x * x * (3 - 2 * x);

const cache = new WeakMap<Garden, { walls: unknown; rooms: unknown; front: unknown; ground: Ground | null }>();

/** The ground for a design, or null when it's flat (no levels). */
export function groundOf(d: Design): Ground | null {
  const g = gardenOf(d);
  const hit = cache.get(g);
  if (hit && hit.walls === d.walls && hit.rooms === d.rooms && hit.front === d.settings.frontWallId) return hit.ground;
  const ground = makeGround(d, g);
  cache.set(g, { walls: d.walls, rooms: d.rooms, front: d.settings.frontWallId, ground });
  return ground;
}

function makeGround(d: Design, g: Garden): Ground | null {
  const levels = g.terrain?.levels ?? [];
  if (!levels.length) return null;
  const natural = naturalGround(levels);
  const hf = padOn(g) ? houseFrame(d) : null;
  const margin = padMarginOf(g);
  const at = (p: Vec) => {
    const z = natural(p);
    if (!hf) return z;
    const da = Math.max(0, Math.abs(dot(p, hf.t) - hf.ac) - hf.ha);
    const db = Math.max(0, Math.abs(dot(p, hf.n) - hf.bc) - hf.hb);
    const dist = Math.hypot(da, db);
    if (dist <= margin) return 0;
    if (dist >= margin + PAD_BLEND) return z;
    return z * smooth((dist - margin) / PAD_BLEND);
  };
  const b = boundsOf(d, g);
  let min = Infinity;
  let max = -Infinity;
  const N = 24;
  for (let j = 0; j <= N; j++)
    for (let i = 0; i <= N; i++) {
      const z = at(v(b.x0 + ((b.x1 - b.x0) * i) / N, b.y0 + ((b.y1 - b.y0) * j) / N));
      min = Math.min(min, z);
      max = Math.max(max, z);
    }
  for (const l of levels) {
    min = Math.min(min, l.z);
    max = Math.max(max, l.z);
  }
  return { at, natural, min, max };
}

/** The area the ground matters over: the block, or round the house (and the levels) with no block. */
export function boundsOf(d: Design, g: Garden) {
  const pts = g.block?.points ?? [...housePoints(d), ...(g.terrain?.levels ?? [])];
  if (!pts.length) return { x0: -10000, y0: -10000, x1: 10000, y1: 10000 };
  const pad = g.block ? 0 : 10000;
  return {
    x0: Math.min(...pts.map((p) => p.x)) - pad,
    y0: Math.min(...pts.map((p) => p.y)) - pad,
    x1: Math.max(...pts.map((p) => p.x)) + pad,
    y1: Math.max(...pts.map((p) => p.y)) + pad,
  };
}

/** A contour interval that gives a readable number of lines for this much fall. */
export function autoInterval(fall: number): number {
  for (const i of [100, 200, 250, 500, 1000, 2000]) if (fall / i <= 14) return i;
  return 5000;
}

/** Contour lines (marching squares) over the bounds: one set of segments per level. */
export function contourLines(ground: Ground, b: { x0: number; y0: number; x1: number; y1: number }, interval: number): { z: number; segs: [Vec, Vec][] }[] {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const step = Math.max(150, Math.max(w, h) / 110);
  const nx = Math.ceil(w / step) + 1;
  const ny = Math.ceil(h / step) + 1;
  const H = new Float64Array(nx * ny);
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const z = ground.at(v(b.x0 + i * step, b.y0 + j * step));
      H[j * nx + i] = z;
      lo = Math.min(lo, z);
      hi = Math.max(hi, z);
    }
  const out: { z: number; segs: [Vec, Vec][] }[] = [];
  for (let z = Math.ceil(lo / interval) * interval; z <= hi; z += interval) {
    // Nudge off exact grid values (e.g. the flat pad at 0) so lines don't run along it.
    const c = z + 0.01;
    const segs: [Vec, Vec][] = [];
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = H[j * nx + i];
        const bb = H[j * nx + i + 1];
        const cc = H[(j + 1) * nx + i + 1];
        const dd = H[(j + 1) * nx + i];
        const idx = (a > c ? 8 : 0) | (bb > c ? 4 : 0) | (cc > c ? 2 : 0) | (dd > c ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x = b.x0 + i * step;
        const y = b.y0 + j * step;
        const f = (v1: number, v2: number) => (c - v1) / (v2 - v1);
        const top = () => v(x + f(a, bb) * step, y);
        const right = () => v(x + step, y + f(bb, cc) * step);
        const bottom = () => v(x + f(dd, cc) * step, y + step);
        const left = () => v(x, y + f(a, dd) * step);
        const add = (p: Vec, q: Vec) => segs.push([p, q]);
        switch (idx) {
          case 1:
          case 14:
            add(left(), bottom());
            break;
          case 2:
          case 13:
            add(bottom(), right());
            break;
          case 3:
          case 12:
            add(left(), right());
            break;
          case 4:
          case 11:
            add(top(), right());
            break;
          case 5:
            add(left(), bottom());
            add(top(), right());
            break;
          case 6:
          case 9:
            add(top(), bottom());
            break;
          case 7:
          case 8:
            add(top(), left());
            break;
          case 10:
            add(top(), left());
            add(bottom(), right());
            break;
        }
      }
    if (segs.length) out.push({ z, segs });
  }
  return out;
}

/** Earthworks for the pad: soil dug out (cut) and brought in (fill) inside the block, m³. */
export function cutAndFill(d: Design, ground: Ground): { cut: number; fill: number } {
  const g = gardenOf(d);
  const b = boundsOf(d, g);
  const step = 500;
  let cut = 0;
  let fill = 0;
  for (let y = b.y0 + step / 2; y < b.y1; y += step)
    for (let x = b.x0 + step / 2; x < b.x1; x += step) {
      const p = v(x, y);
      if (g.block && !pointInPolygon(p, g.block.points)) continue;
      const diff = ground.natural(p) - ground.at(p);
      if (diff > 0) cut += diff * step * step;
      else fill -= diff * step * step;
    }
  return { cut: cut / 1e9, fill: fill / 1e9 };
}

export type SlopeDir = 'up' | 'down' | 'left' | 'right';
export const SLOPES: { id: SlopeDir; name: string; hint: string }[] = [
  { id: 'up', name: 'Rises from street', hint: 'The back of the block is higher than the street (an upslope block)' },
  { id: 'down', name: 'Falls from street', hint: 'The back of the block is lower than the street (a downslope block)' },
  { id: 'left', name: 'Falls to the left', hint: 'Cross-fall: lower on the left, as seen from the street' },
  { id: 'right', name: 'Falls to the right', hint: 'Cross-fall: lower on the right, as seen from the street' },
];

/**
 * Levels at the block's corners for an even slope with `fall` mm from one side of the block to the other, set so the
 * natural ground at the middle of the house is 0 (which keeps the cut and fill down).
 */
export function slopeLevels(d: Design, b: Block, dir: SlopeDir, fall: number): SpotLevel[] {
  const pts = b.points;
  const n = outwardNormal(pts, b.street);
  const t = v(-n.y, n.x);
  const out = pts.map((p) => dot(p, n));
  const along = pts.map((p) => dot(p, t));
  const o0 = Math.min(...out);
  const o1 = Math.max(...out);
  const a0 = Math.min(...along);
  const a1 = Math.max(...along);
  const hp = housePoints(d);
  const c = hp.length ? v(hp.reduce((s, p) => s + p.x, 0) / hp.length, hp.reduce((s, p) => s + p.y, 0) / hp.length) : v(pts.reduce((s, p) => s + p.x, 0) / pts.length, pts.reduce((s, p) => s + p.y, 0) / pts.length);
  // 0 at the street → 1 at the back; 0 on the right → 1 on the left (as seen from the street).
  const depth = (p: Vec) => (o1 - dot(p, n)) / Math.max(1, o1 - o0);
  const across = (p: Vec) => (dot(p, t) - a0) / Math.max(1, a1 - a0);
  const z = (p: Vec) => {
    switch (dir) {
      case 'up':
        return fall * (depth(p) - depth(c));
      case 'down':
        return -fall * (depth(p) - depth(c));
      case 'left':
        return -fall * (across(p) - across(c));
      case 'right':
        return fall * (across(p) - across(c));
    }
  };
  return pts.map((p) => ({ id: uid('lv'), x: p.x, y: p.y, z: Math.round(z(p) / 10) * 10 }));
}

/** "+1.25 m" / "−0.40 m": a level relative to the ground at the house. */
export function formatLevel(z: number): string {
  const m = Math.round(z / 10) / 100;
  return `${m > 0 ? '+' : m < 0 ? '−' : ''}${Math.abs(m).toFixed(2)} m`;
}
