import { add, rad, rot, uid, v } from './geometry';
import type { Item } from './types';

/**
 * Raised patios and single steps. Both stand on the ground (see levels.ts) and are solid: a raised patio is fill
 * held in by retaining sides under the paving, and each step is a block from the ground up to its tread. Corner
 * steps are L-shaped, wrapping round the front and one side, so a stack of them steps down round a corner.
 */

export interface EdgeFinish {
  name: string;
  color: string;
  /** Course height (mm) for the joint lines on the face; 0 = smooth. */
  course: number;
}

export const EDGES: Record<string, EdgeFinish> = {
  render: { name: 'Rendered block', color: '#d9d4ca', course: 0 },
  brick: { name: 'Brick', color: '#9c4f3a', course: 86 },
  block: { name: 'Besser block', color: '#bdbab3', course: 200 },
  stone: { name: 'Stone', color: '#b3ab9c', course: 150 },
  sleeper: { name: 'Timber sleepers', color: '#6b5a48', course: 200 },
  concrete_sleeper: { name: 'Concrete sleepers', color: '#9a9893', course: 200 },
};

/** Paving on top of a raised patio or step (mm). */
export const PAVE = 40;
/** Paving overhang past the sides (nosing). */
export const NOSE = 20;

export const PATIO_DEFAULTS = { edge: 'render' } as Record<string, string | number>;
export const STEP_DEFAULTS = { shape: 'straight', side: 'right', tread: 300, rise: 170, edge: 'render' } as Record<string, string | number>;

export function outdoorOpts(it: Pick<Item, 'type' | 'options'>) {
  const base = it.type === 'step' ? STEP_DEFAULTS : PATIO_DEFAULTS;
  const o = { ...base, ...(it.options ?? {}) };
  const edge = EDGES[String(o.edge)] ?? EDGES.render;
  return {
    shape: o.shape === 'corner' ? ('corner' as const) : ('straight' as const),
    /** Corner steps: which side the L wraps round (+x = right, as seen from the front). */
    sx: o.side === 'left' ? -1 : 1,
    tread: Math.max(150, Number(o.tread) || 300),
    rise: Math.max(50, Number(o.rise) || 170),
    edge,
    edgeColor: typeof o.edgeColor === 'string' ? o.edgeColor : edge.color,
  };
}

/** A corner step's two legs, as rectangles in item-local plan mm (front = +y): [x0, y0, x1, y1]. */
export function cornerLegs(it: Pick<Item, 'width' | 'depth' | 'type' | 'options'>): [number, number, number, number][] {
  const { sx, tread } = outdoorOpts(it);
  const hw = it.width / 2;
  const hd = it.depth / 2;
  const t = Math.min(tread, it.width, it.depth);
  const front: [number, number, number, number] = [-hw, hd - t, hw, hd];
  const side: [number, number, number, number] = sx > 0 ? [hw - t, -hd, hw, hd - t] : [-hw, -hd, -hw + t, hd - t];
  return [front, side];
}

/**
 * The next step down (dir 1) or up (dir −1) from this one: one tread further out (or in) and one riser lower (or
 * higher). Corner steps grow (or shrink) on both legs, so they keep wrapping the same corner. Null when it would
 * go below the ground or a corner step would be too small.
 */
export function nextStep(it: Item, dir: 1 | -1): Item | null {
  const o = outdoorOpts(it);
  const top = it.height - dir * o.rise;
  if (top < 20) return null;
  let local = v(0, dir * o.tread);
  let width = it.width;
  let depth = it.depth;
  if (o.shape === 'corner') {
    width += dir * o.tread;
    depth += dir * o.tread;
    if (width < 2 * o.tread || depth < 2 * o.tread) return null;
    local = v((o.sx * dir * o.tread) / 2, (dir * o.tread) / 2);
  }
  const c = add(v(it.x, it.y), rot(local, rad(it.rotation)));
  return { ...it, id: uid('i'), x: Math.round(c.x), y: Math.round(c.y), width, depth, height: Math.round(top) };
}

/**
 * A veranda's floor: the top of its slab relative to the house floor. Unset = 100 mm above it (a slab on the
 * ground beside a slab-on-ground house, as verandas were before they had a level).
 */
export const verandaFloor = (it: Pick<Item, 'options'>) => {
  const f = Number(it.options?.floor);
  return Number.isFinite(f) && it.options?.floor !== '' && it.options?.floor !== undefined ? f : 100;
};
