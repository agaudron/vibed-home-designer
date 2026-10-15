import { add, clampOpeningOffset, dot, effectiveOpenings, sidelights, mul, polygonArea, polygonCentroid, rad, rot, sub, v, wallExtensions, wallFrame, wallSpans } from '../geometry';
import { exteriorSides } from '../facade';
import type { Design, Item, Vec } from '../types';

/**
 * First-person walk-through physics: what you bump into, what you can stand on, and where you start.
 * Plan coordinates (mm): x, y. Height is separate. `yaw` follows the camera: facing (-sin yaw, -cos yaw).
 */

/** The walker is 170 cm tall; eyes sit about 115 mm below the top of the head. */
export const PERSON_HEIGHT = 1700;
export const EYE_HEIGHT = PERSON_HEIGHT - 115;
const RADIUS = 220; // body radius
const STEP = 450; // highest step you can walk up
const PASSABLE = new Set(['door', 'double_door', 'sliding_door', 'stacker_door', 'cavity_door', 'garage_door', 'opening']);
/** Outdoor structures you walk on/under rather than bump into. */
const WALK_ON = new Set(['deck', 'patio', 'veranda', 'porch', 'pergola', 'rug', 'stairs']);

export interface Box {
  c: Vec; // centre
  u: Vec; // unit axis along length
  hl: number; // half length
  hw: number; // half width
}

interface Surface {
  c: Vec;
  rot: number;
  hw: number;
  hd: number;
  height: (local: Vec) => number;
}

export interface WalkWorld {
  boxes: Box[];
  surfaces: Surface[];
}

const worldCache = new WeakMap<Design, WalkWorld>();

export function walkWorld(d: Design): WalkWorld {
  const hit = worldCache.get(d);
  if (hit) return hit;
  const boxes: Box[] = [];
  for (const w of d.walls) {
    const f = wallFrame(w);
    if (f.length < 1) continue;
    const { e0, e1 } = wallExtensions(w, d.walls);
    const { solid, ops } = wallSpans(w, effectiveOpenings(d.walls, d.openings), e0, e1);
    // Doorways are open; windows (and anything with a high sill) are solid to walk into.
    const spans = [
      ...solid,
      ...ops.filter(({ o }) => !(PASSABLE.has(o.kind) && o.sill < 300)).map(({ a, b }) => [a, b] as [number, number]),
      // Door sidelights are fixed glass.
      ...ops.flatMap(({ o, a, b }) => {
        const sl = sidelights(o);
        return [
          ...(sl.left > 0 ? [[a, a + sl.left] as [number, number]] : []),
          ...(sl.right > 0 ? [[b - sl.right, b] as [number, number]] : []),
        ];
      }),
    ];
    for (const [a, b] of spans) {
      if (b - a < 1) continue;
      boxes.push({ c: add(w.start, mul(f.u, (a + b) / 2)), u: f.u, hl: (b - a) / 2, hw: w.thickness / 2 });
    }
  }
  const surfaces: Surface[] = [];
  for (const it of d.items) {
    if (WALK_ON.has(it.type)) {
      const s = surfaceOf(it);
      if (s) surfaces.push(s);
      continue;
    }
    // Furniture you'd bump into: anything at body height (not wall cabinets above your head).
    if (it.height < 250 || it.elevation > 1500) continue;
    const r = rad(it.rotation);
    boxes.push({ c: v(it.x, it.y), u: v(Math.cos(r), Math.sin(r)), hl: it.width / 2, hw: it.depth / 2 });
  }
  const world = { boxes, surfaces };
  worldCache.set(d, world);
  return world;
}

function surfaceOf(it: Item): Surface | null {
  const base = { c: v(it.x, it.y), rot: rad(it.rotation), hw: it.width / 2, hd: it.depth / 2 };
  switch (it.type) {
    case 'deck':
      return { ...base, height: () => Math.max(22, it.height) };
    case 'patio':
      return { ...base, height: () => it.height };
    case 'veranda':
      return { ...base, height: () => 100 };
    case 'porch':
      return { ...base, height: () => 150 };
    case 'stairs':
      // Rises from the front (+depth side) to the back.
      return { ...base, height: (l) => Math.max(0, Math.min(it.height, (it.height * (it.depth / 2 - l.y)) / it.depth)) };
    default:
      return null;
  }
}

/** Height of the floor you'd stand on at p (0 = ground / house floor). */
export function floorAt(world: WalkWorld, p: Vec): number {
  let h = 0;
  for (const s of world.surfaces) {
    const l = rot(sub(p, s.c), -s.rot);
    if (Math.abs(l.x) <= s.hw && Math.abs(l.y) <= s.hd) h = Math.max(h, s.height(l));
  }
  return h;
}

export function blocked(world: WalkWorld, p: Vec, extra: Box[] = []): boolean {
  for (const b of [...world.boxes, ...extra]) {
    const d = sub(p, b.c);
    const along = dot(d, b.u);
    const across = dot(d, v(-b.u.y, b.u.x));
    const cx = Math.max(-b.hl, Math.min(b.hl, along));
    const cy = Math.max(-b.hw, Math.min(b.hw, across));
    if ((along - cx) ** 2 + (across - cy) ** 2 < RADIUS * RADIUS) return true;
  }
  return false;
}

/**
 * Move from `p` by `delta`, sliding along walls, refusing steps that are too high.
 * Returns the new position.
 */
export function moveWithCollisions(world: WalkWorld, p: Vec, delta: Vec, feet: number, extra: Box[] = []): Vec {
  const ok = (q: Vec) => !blocked(world, q, extra) && floorAt(world, q) - feet <= STEP;
  // Sub-step so fast movement can't tunnel through thin walls.
  const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y) / 60));
  let cur = p;
  const dd = mul(delta, 1 / steps);
  for (let i = 0; i < steps; i++) {
    const both = add(cur, dd);
    if (ok(both)) cur = both;
    else {
      const xOnly = add(cur, v(dd.x, 0));
      const yOnly = add(cur, v(0, dd.y));
      if (dd.x && ok(xOnly)) cur = xOnly;
      else if (dd.y && ok(yOnly)) cur = yOnly;
    }
  }
  return cur;
}

/** Where to start walking: just outside the front door, looking at it; else the middle of the biggest room. */
export function startPose(d: Design): { p: Vec; yaw: number } {
  const sides = exteriorSides(d.walls).map;
  const doors = d.openings
    .filter((o) => PASSABLE.has(o.kind) && o.kind !== 'garage_door')
    .map((o) => ({ o, w: d.walls.find((w) => w.id === o.wallId)! }))
    .filter(({ w }) => w && (sides.get(w.id)?.pos || sides.get(w.id)?.neg))
    // Prefer a proper front door (hinged) over sliding doors, then the widest.
    .sort((a, b) => Number(b.o.kind === 'door' || b.o.kind === 'double_door') - Number(a.o.kind === 'door' || a.o.kind === 'double_door') || b.o.width - a.o.width);
  if (doors.length) {
    const { o, w } = doors[0];
    const f = wallFrame(w);
    const sd = sides.get(w.id)!;
    const out = sd.pos ? 1 : -1;
    const centre = add(w.start, mul(f.u, clampOpeningOffset(o, f.length)));
    const world = walkWorld(d);
    // Stand a couple of metres out, but not inside a pergola post / bin / bush.
    const dist = [1800, 2600, 3500, 1200].find((k) => !blocked(world, add(centre, mul(f.n, out * (w.thickness / 2 + k))))) ?? 1800;
    const p = add(centre, mul(f.n, out * (w.thickness / 2 + dist)));
    const face = mul(f.n, -out);
    return { p, yaw: Math.atan2(-face.x, -face.y) };
  }
  const rooms = [...d.rooms].filter((r) => r.points.length >= 3).sort((a, b) => polygonArea(b.points) - polygonArea(a.points));
  if (rooms.length) return { p: polygonCentroid(rooms[0].points), yaw: 0 };
  const pts = d.walls.flatMap((w) => [w.start, w.end]);
  if (!pts.length) return { p: v(0, 0), yaw: 0 };
  return { p: mul(pts.reduce((a, b) => add(a, b), v(0, 0)), 1 / pts.length), yaw: 0 };
}

/** A doorway as a solid box (for a closed door). */
export function doorwayBox(d: Design, openingId: string): Box | null {
  const o = d.openings.find((x) => x.id === openingId);
  const w = o && d.walls.find((x) => x.id === o.wallId);
  if (!o || !w) return null;
  const f = wallFrame(w);
  const c = clampOpeningOffset(o, f.length);
  return { c: add(w.start, mul(f.u, c)), u: f.u, hl: o.width / 2, hw: w.thickness / 2 };
}
