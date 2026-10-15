import { add, clampOpeningOffset, dot, mul, rad, sidelights, sub, v, wallExtensions, wallFrame } from './geometry';
import type { Design, Opening, Vec, Wall } from './types';

/**
 * Door handles, and whether a hinged door can open without its leaf or handles hitting a wall or furniture.
 *
 * The leaf is swung from closed (0°) open in 3° steps; at each angle we test points along both faces of the
 * leaf and the tips of both handles against the walls (other than the one the door is in) and furniture.
 * A door should open to at least 90°: "Fix" finds the smallest slide along its wall that allows that.
 */

export type HandleType = 'lever' | 'knob' | 'pull' | 'flush' | 'none';

export const HANDLES: Record<HandleType, { name: string; projection: number }> = {
  lever: { name: 'Lever', projection: 65 },
  knob: { name: 'Knob', projection: 60 },
  pull: { name: 'Pull handle (D pull)', projection: 75 },
  flush: { name: 'Flush pull', projection: 8 },
  none: { name: 'None', projection: 0 },
};

export const HANDLE_FINISHES: { hex: string; name: string }[] = [
  { hex: '#b8bcc0', name: 'Satin chrome' },
  { hex: '#a7a59f', name: 'Brushed nickel' },
  { hex: '#222222', name: 'Matte black' },
  { hex: '#b59a5a', name: 'Brushed brass' },
  { hex: '#f2f2ef', name: 'White' },
];

export const HANDLE_DEFAULT = { type: 'lever' as HandleType, height: 1000, finish: '#b8bcc0' };

/** The handle on this door (with defaults filled in). */
export function doorHandle(o: Opening) {
  return { ...HANDLE_DEFAULT, ...(o.handle ?? {}) };
}

/** Distance from the latch edge of the leaf to the handle's centre. */
export const BACKSET = 60;
const LEAF_T = 40;
/** Doors should open at least this far. */
export const MIN_OPEN = 90;

interface Obstacle {
  name: string;
  c: Vec;
  u: Vec;
  hl: number;
  hw: number;
}

/** Things you walk on or that are overhead: a door swings over or under them. */
const NOT_IN_THE_WAY = new Set(['rug', 'deck', 'patio', 'veranda', 'porch', 'pergola', 'stairs', 'skylight', 'sun_tunnel']);

const obstacleCache = new WeakMap<Design, Obstacle[]>();
/** Walls and furniture as rectangles (walls include the bits that run into joints). */
function obstacles(d: Design): Obstacle[] {
  const hit = obstacleCache.get(d);
  if (hit) return hit;
  const out: Obstacle[] = [];
  for (const w of d.walls) {
    const f = wallFrame(w);
    if (f.length < 1) continue;
    const { e0, e1 } = wallExtensions(w, d.walls);
    out.push({ name: `wall:${w.id}`, c: add(w.start, mul(f.u, (f.length + e1 - e0) / 2)), u: f.u, hl: (f.length + e0 + e1) / 2, hw: w.thickness / 2 });
  }
  for (const it of d.items) {
    // Things a door would actually knock: floor-standing, more than a rug, and below the top of the door.
    if (it.height < 60 || it.elevation > 1900 || NOT_IN_THE_WAY.has(it.type)) continue;
    const r = rad(it.rotation);
    out.push({ name: it.name, c: v(it.x, it.y), u: v(Math.cos(r), Math.sin(r)), hl: it.width / 2, hw: it.depth / 2 });
  }
  obstacleCache.set(d, out);
  return out;
}

function inside(ob: Obstacle, p: Vec) {
  const q = sub(p, ob.c);
  return Math.abs(dot(q, ob.u)) < ob.hl && Math.abs(q.x * -ob.u.y + q.y * ob.u.x) < ob.hw;
}

export interface LeafCheck {
  /** How far it opens (degrees) before something is hit; 180 if nothing. */
  maxAngle: number;
  /** What it hits first, and with which part. */
  hit: { what: string; part: 'leaf' | 'handle'; at: Vec } | null;
}

/** The hinged leaves of a door: hinge position along the opening (from its centre), direction to the latch, width. */
export function doorLeaves(o: Opening): { hx: number; dir: number; lw: number }[] {
  const hw = o.width / 2;
  if (o.kind === 'double_door')
    return [
      { hx: -hw, dir: 1, lw: hw },
      { hx: hw, dir: -1, lw: hw },
    ];
  if (o.kind !== 'door') return [];
  const sl = sidelights(o);
  const x0 = -hw + sl.left;
  const x1 = hw - sl.right;
  return [{ hx: o.hingeEnd ? x1 : x0, dir: o.hingeEnd ? -1 : 1, lw: x1 - x0 }];
}

/** Check each leaf of a hinged door at a given offset along its wall. */
export function checkDoor(d: Design, o: Opening, w: Wall, offset = o.offset, upTo = 180): LeafCheck[] {
  const f = wallFrame(w);
  const c = clampOpeningOffset({ ...o, offset }, f.length);
  const s = o.flip ? -1 : 1; // the side it swings to
  const ht = w.thickness / 2;
  const p = HANDLES[doorHandle(o).type].projection;
  const obs = obstacles(d).filter((ob) => ob.name !== `wall:${w.id}`);
  const world = (x: number, y: number) => add(add(w.start, mul(f.u, c + x)), mul(f.n, y));
  return doorLeaves(o).map(({ hx, dir, lw }) => {
    for (let deg = 3; deg <= upTo; deg += 3) {
      const a = (deg * Math.PI) / 180;
      const dx = dir * Math.cos(a);
      const dy = s * Math.sin(a);
      const nx = -dy;
      const ny = dx;
      const pts: { p: Vec; part: 'leaf' | 'handle' }[] = [];
      const add = (along: number, off: number, part: 'leaf' | 'handle') => {
        const ly = s * ht + dy * along + ny * off;
        // Only what's in front of the face it swings to: anything in the doorway or behind the wall can't be hit.
        if (s * ly <= ht + 1) return;
        pts.push({ p: world(hx + dx * along + nx * off, ly), part });
      };
      for (let along = 30; along <= lw; along += 40) for (const off of [-LEAF_T / 2, LEAF_T / 2]) add(along, off, 'leaf');
      if (p > 0) for (const side of [-1, 1]) add(lw - BACKSET, side * (LEAF_T / 2 + p), 'handle');
      for (const { p: q, part } of pts) {
        const ob = obs.find((x) => inside(x, q));
        if (ob) return { maxAngle: deg - 3, hit: { what: ob.name.startsWith('wall:') ? 'a wall' : ob.name, part, at: q } };
      }
    }
    return { maxAngle: 180, hit: null };
  });
}

/** True if every leaf can open to at least 90°. */
export function opensFully(d: Design, o: Opening, w: Wall, offset = o.offset) {
  return checkDoor(d, o, w, offset, MIN_OPEN).every((l) => l.maxAngle >= MIN_OPEN);
}

/**
 * The nearest offset along the wall (within `range` mm) where the door opens to 90°, or null if it already does
 * or no nearby position works.
 */
export function clearOffset(d: Design, o: Opening, w: Wall, range = 600): number | null {
  if (o.kind !== 'door' && o.kind !== 'double_door') return null;
  if (opensFully(d, o, w)) return null;
  const L = wallFrame(w).length;
  const base = clampOpeningOffset(o, L);
  for (let k = 10; k <= range; k += 10)
    for (const sign of [1, -1]) {
      const off = base + sign * k;
      if (clampOpeningOffset({ ...o, offset: off }, L) !== off) continue;
      if (opensFully(d, o, w, off)) return off;
    }
  return null;
}
