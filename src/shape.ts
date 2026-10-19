import { add, rad, rot, sub, v } from './geometry';
import type { Item, Vec } from './types';

/**
 * Reshaped outdoor structures: decks, patios and open verandas can have their four corners moved independently
 * (an angled or irregular outline). The corners are kept in `item.corners`, in the item's own frame (centred,
 * unrotated: back-left, back-right, front-right, front-left); width and depth stay the outline's bounding box, so
 * snapping, clearances and selection keep working on it.
 */

export const isShapeable = (it: Pick<Item, 'type' | 'options'>) => it.type === 'deck' || it.type === 'patio' || (it.type === 'veranda' && it.options?.roof === 'none');

/** The outline's corners in the item's own frame (a rectangle unless reshaped). */
export function localCorners(it: Pick<Item, 'width' | 'depth' | 'corners'>): Vec[] {
  if (it.corners?.length === 4) return it.corners.map(([x, y]) => v(x, y));
  const hw = it.width / 2;
  const hd = it.depth / 2;
  return [v(-hw, -hd), v(hw, -hd), v(hw, hd), v(-hw, hd)];
}

/** The outline's corners on the plan. */
export function worldCorners(it: Pick<Item, 'x' | 'y' | 'rotation' | 'width' | 'depth' | 'corners'>): Vec[] {
  const r = rad(it.rotation);
  return localCorners(it).map((p) => add(v(it.x, it.y), rot(p, r)));
}

/** Re-centre a set of local corners on their bounding box, moving the item so the outline stays put. */
function fit(it: Item, pts: Vec[]): Item {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const c = add(v(it.x, it.y), rot(v(cx, cy), rad(it.rotation)));
  return {
    ...it,
    x: Math.round(c.x),
    y: Math.round(c.y),
    width: Math.round(Math.max(...xs) - Math.min(...xs)),
    depth: Math.round(Math.max(...ys) - Math.min(...ys)),
    corners: pts.map((p) => [Math.round(p.x - cx), Math.round(p.y - cy)] as [number, number]),
  };
}

/** Move one corner to a point on the plan. */
export function moveCorner(it: Item, index: number, to: Vec): Item {
  const pts = localCorners(it);
  pts[index] = rot(sub(to, v(it.x, it.y)), -rad(it.rotation));
  return fit(it, pts);
}

/** New width / depth for a reshaped item: stretch its corners to match. */
export function resizeShape(it: Item, width: number, depth: number): Item {
  if (!it.corners) return { ...it, width, depth };
  const sx = it.width > 0 ? width / it.width : 1;
  const sy = it.depth > 0 ? depth / it.depth : 1;
  return { ...it, width, depth, corners: it.corners.map(([x, y]) => [Math.round(x * sx), Math.round(y * sy)] as [number, number]) };
}

/** Back to a plain rectangle (its current bounding box). */
export function squareUp(it: Item): Item {
  const next = { ...it };
  delete next.corners;
  return next;
}

/**
 * Where a line across the outline is inside it: the line x = `at` (along 'x') gives spans of y; y = `at` (along
 * 'y') gives spans of x. In the outline's own frame.
 */
export function polyCuts(poly: Vec[], along: 'x' | 'y', at: number): [number, number][] {
  const hits: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const [pa, pb, qa, qb] = along === 'x' ? [a.x, b.x, a.y, b.y] : [a.y, b.y, a.x, b.x];
    if ((pa <= at && pb > at) || (pb <= at && pa > at)) hits.push(qa + ((at - pa) / (pb - pa)) * (qb - qa));
  }
  hits.sort((p, q) => p - q);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < hits.length; i += 2) out.push([hits[i], hits[i + 1]]);
  return out;
}
