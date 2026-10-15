import { add, itemCorners, mul, rad, sub, v, wallExtensions, wallFrame } from './geometry';
import type { Design, Item, Vec } from './types';

export interface Clearance {
  /** Unit direction out of the item. */
  dir: Vec;
  /** Middle of the item's side. */
  origin: Vec;
  /** Where the clearance ends (the wall face or other item). */
  end: Vec;
  dist: number;
  title: string;
}

/** Distance from `origin` along `dir` to the first wall face or other item in the way (at an overlapping height). */
function clearance(d: Design, self: Pick<Item, 'id'>, origin: Vec, dir: Vec, yRange: [number, number]): number | null {
  let best = Infinity;
  const hitPoly = (poly: Vec[]) => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const e = sub(b, a);
      const den = dir.x * e.y - dir.y * e.x;
      if (Math.abs(den) < 1e-9) continue;
      const q = sub(a, origin);
      const t = (q.x * e.y - q.y * e.x) / den;
      const s = (q.x * dir.y - q.y * dir.x) / den;
      if (s >= -1e-6 && s <= 1 + 1e-6 && t > -0.5 && t < best) best = Math.max(0, t);
    }
  };
  for (const w of d.walls) {
    const f = wallFrame(w);
    if (f.length < 1) continue;
    const { e0, e1 } = wallExtensions(w, d.walls);
    const a = add(w.start, mul(f.u, -e0));
    const b = add(w.end, mul(f.u, e1));
    const h = mul(f.n, w.thickness / 2);
    hitPoly([add(a, h), add(b, h), sub(b, h), sub(a, h)]);
  }
  for (const it of d.items) {
    if (it.id === self.id || it.type === 'rug') continue;
    // Only things at an overlapping height block it (a wall cabinet doesn't block a base cabinet).
    if (it.elevation >= yRange[1] || it.elevation + it.height <= yRange[0]) continue;
    hitPoly(itemCorners(it));
  }
  return best < 30000 ? best : null;
}

/** Clearances from each side of an item (right, left, front, back) to walls and other items. Gaps of 0 are left out. */
export function itemClearances(d: Design, it: Item): Clearance[] {
  const r = rad(it.rotation);
  const ax = v(Math.cos(r), Math.sin(r)); // width direction
  const bx = v(-Math.sin(r), Math.cos(r)); // depth direction (front)
  const c = v(it.x, it.y);
  const yRange: [number, number] = [it.elevation, it.elevation + it.height];
  const sides: [Vec, number, string][] = [
    [ax, it.width / 2, 'Clearance to the right'],
    [mul(ax, -1), it.width / 2, 'Clearance to the left'],
    [bx, it.depth / 2, 'Clearance in front'],
    [mul(bx, -1), it.depth / 2, 'Clearance behind'],
  ];
  const out: Clearance[] = [];
  for (const [dir, half, title] of sides) {
    const origin = add(c, mul(dir, half));
    const dist = clearance(d, it, origin, dir, yRange);
    if (dist === null || dist < 1) continue;
    out.push({ dir, origin, end: add(origin, mul(dir, dist)), dist, title });
  }
  return out;
}
