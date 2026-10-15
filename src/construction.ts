import { exteriorSides } from './facade';
import { add, clampOpeningOffset, dot, mul, near, projectOnSegment, sub, wallFrame } from './geometry';
import { store } from './store';
import type { Construction, Design, Facade, Vec, Wall } from './types';

/** Outside wall build-ups (Australian typical). Layers listed from the outside in, in mm. */
export const CONSTRUCTIONS: Record<Construction, { name: string; layers: [string, number][]; facade?: Facade['finish'] }> = {
  brick_veneer: {
    name: 'Brick veneer',
    layers: [['Brick', 110], ['Cavity', 40], ['Timber frame', 90], ['Plasterboard', 10]],
    facade: 'brick',
  },
  double_brick: {
    name: 'Double brick',
    layers: [['Brick', 110], ['Cavity', 50], ['Brick', 110], ['Render / plaster', 10]],
    facade: 'brick',
  },
  clad_frame: {
    name: 'Clad timber frame',
    layers: [['Cladding & battens', 30], ['Timber frame', 90], ['Plasterboard', 10]],
    facade: 'weatherboard',
  },
  block: { name: 'Concrete block', layers: [['Block (core filled)', 190], ['Render / plaster', 20]], facade: 'block' },
};

export const constructionThickness = (c: Construction) => CONSTRUCTIONS[c].layers.reduce((s, [, t]) => s + t, 0);

type Line = { p: Vec; u: Vec };
function intersect(a: Line, b: Line): Vec | null {
  const den = a.u.x * b.u.y - a.u.y * b.u.x;
  if (Math.abs(den) < 1e-6) return null;
  const w = sub(b.p, a.p);
  const t = (w.x * b.u.y - w.y * b.u.x) / den;
  return { x: Math.round((a.p.x + a.u.x * t) * 10) / 10, y: Math.round((a.p.y + a.u.y * t) * 10) / 10 };
}

/**
 * Rebuild every outside wall with this construction. Walls get thicker (or thinner) on the OUTSIDE only, so
 * rooms keep their internal size: each outside wall's centreline moves out by half the change, corners are
 * re-joined, inside walls that meet it stretch to reach it, and doors/windows/floors follow.
 */
export function applyConstruction(type: Construction): number {
  const d = splitPartlyOutside(store.state.design);
  const sides = exteriorSides(d.walls);
  if (!sides.enclosed) return 0;
  const t = constructionThickness(type);
  const shift = new Map<string, Vec>(); // wall id -> how its centreline moves
  for (const w of d.walls) {
    const sd = sides.map.get(w.id);
    if (!sd) continue;
    // Only walls that are outside along (nearly) their whole length, on exactly one face. Walls that are only
    // partly outside, inside walls and free-standing walls are left alone.
    const pos = (sd.posFrac ?? 0) >= 0.8;
    const neg = (sd.negFrac ?? 0) >= 0.8;
    if (pos === neg) continue;
    const f = wallFrame(w);
    shift.set(w.id, mul(f.n, (pos ? 1 : -1) * ((t - w.thickness) / 2)));
  }
  if (!shift.size) return 0;
  const lineOf = (w: Wall): Line => ({ p: add(w.start, shift.get(w.id) ?? { x: 0, y: 0 }), u: wallFrame(w).u });

  const touches = (w: Wall, p: Vec) => near(p, w.start) || near(p, w.end) || projectOnSegment(p, w.start, w.end).dist < 1;
  const parallel = (a: Wall, b: Wall) => {
    const fa = wallFrame(a).u;
    const fb = wallFrame(b).u;
    return Math.abs(fa.x * fb.y - fa.y * fb.x) < 0.02;
  };

  /** New position of `w`'s endpoint `p`. */
  const moveEnd = (w: Wall, p: Vec): Vec => {
    const moving = d.walls.filter((o) => o.id !== w.id && shift.has(o.id) && touches(o, p) && !parallel(o, w));
    if (shift.has(w.id)) {
      // An outside wall: meet the neighbouring moved outside wall at the new corner,
      // or (at a T with an unmoved wall) slide along that wall; otherwise just shift.
      for (const o of moving) {
        const x = intersect(lineOf(w), lineOf(o));
        if (x) return x;
      }
      const other = d.walls.find((o) => o.id !== w.id && !shift.has(o.id) && (near(p, o.start) || near(p, o.end)) && !parallel(o, w));
      if (other) {
        const x = intersect(lineOf(w), { p, u: wallFrame(other).u });
        if (x) return x;
      }
      return add(p, shift.get(w.id)!);
    }
    // An inside wall meeting a moved outside wall: stretch along its own line only (stays square).
    for (const o of moving) {
      const x = intersect({ p: w.start, u: wallFrame(w).u }, lineOf(o));
      if (x) return x;
    }
    return p;
  };

  // Room corners follow the outside corners.
  const movePoint = (p: Vec): Vec => {
    const moving = d.walls.filter((w) => shift.has(w.id) && touches(w, p));
    if (!moving.length) return p;
    for (let i = 0; i < moving.length; i++)
      for (let j = i + 1; j < moving.length; j++) {
        const x = intersect(lineOf(moving[i]), lineOf(moving[j]));
        if (x) return x;
      }
    return add(p, shift.get(moving[0].id)!);
  };
  const cache = new Map<string, Vec>();
  const mp = (p: Vec) => {
    const key = `${Math.round(p.x)},${Math.round(p.y)}`;
    if (!cache.has(key)) cache.set(key, movePoint(p));
    return cache.get(key)!;
  };

  const walls = d.walls.map((w) => {
    const next = { ...w, start: moveEnd(w, w.start), end: moveEnd(w, w.end) };
    if (shift.has(w.id)) Object.assign(next, { thickness: t, construction: type });
    return next;
  });
  const byId = new Map(walls.map((w) => [w.id, w]));
  // Keep doors and windows where they were (their wall's start point may have moved along the wall).
  const openings = d.openings.map((o) => {
    const ow = d.walls.find((w) => w.id === o.wallId);
    const nw = byId.get(o.wallId);
    if (!ow || !nw) return o;
    const of = wallFrame(ow);
    const centre = add(add(ow.start, mul(of.u, clampOpeningOffset(o, of.length))), shift.get(ow.id) ?? { x: 0, y: 0 });
    const nf = wallFrame(nw);
    return { ...o, offset: clampOpeningOffset({ ...o, offset: dot(sub(centre, nw.start), nf.u) }, nf.length) };
  });
  const rooms = d.rooms.map((r) => ({ ...r, points: r.points.map(mp) }));
  const finish = CONSTRUCTIONS[type].facade;
  const facade =
    finish && d.facade.finish !== finish && !(finish === 'brick' && d.facade.finish === 'painted_brick')
      ? { ...d.facade, finish, color: finish === 'brick' ? '#9c4f3a' : finish === 'weatherboard' ? '#e9eae4' : '#b9b5ad' }
      : d.facade;
  store.update((dd) => ({ ...dd, walls, openings, rooms, facade, settings: { ...dd.settings, construction: type } }));
  void d;
  return shift.size;
}

/**
 * Walls that are outside for only part of their length (e.g. one that runs past a porch or entry nook) are
 * split where other walls meet them, so the outside part can be thickened on its own.
 */
function splitPartlyOutside(d: Design): Design {
  const sides = exteriorSides(d.walls).map;
  let walls = d.walls;
  let openings = d.openings;
  let n = 0;
  for (const w of d.walls) {
    const sd = sides.get(w.id);
    const frac = Math.max(sd?.posFrac ?? 0, sd?.negFrac ?? 0);
    if (frac < 0.15 || frac >= 0.8) continue;
    const f = wallFrame(w);
    // Split points: other walls' ends that land on this wall part-way along.
    const cuts = [
      ...new Set(
        d.walls
          .filter((o) => o.id !== w.id)
          .flatMap((o) => [o.start, o.end])
          .map((p) => ({ p, pr: projectOnSegment(p, w.start, w.end) }))
          .filter(({ pr }) => pr.dist < 1 && pr.along > 50 && pr.along < f.length - 50)
          .map(({ pr }) => Math.round(pr.along)),
      ),
    ].sort((a, b) => a - b);
    if (!cuts.length) continue;
    const bounds = [0, ...cuts, f.length];
    const pieces: Wall[] = [];
    for (let i = 0; i + 1 < bounds.length; i++) {
      const a = add(w.start, mul(f.u, bounds[i]));
      const b = add(w.start, mul(f.u, bounds[i + 1]));
      pieces.push({ ...w, id: i === 0 ? w.id : `${w.id}_${i}_${++n}`, start: { x: Math.round(a.x), y: Math.round(a.y) }, end: { x: Math.round(b.x), y: Math.round(b.y) } });
    }
    walls = walls.flatMap((x) => (x.id === w.id ? pieces : [x]));
    openings = openings.map((o) => {
      if (o.wallId !== w.id) return o;
      const c = clampOpeningOffset(o, f.length);
      const i = Math.max(0, bounds.findIndex((bnd, k) => k + 1 < bounds.length && c >= bnd && c <= bounds[k + 1]));
      return { ...o, wallId: pieces[i].id, offset: c - bounds[i] };
    });
  }
  return walls === d.walls ? d : { ...d, walls, openings };
}

export function applyConstructionWithMessage(type: Construction) {
  const n = applyConstruction(type);
  store.flash(
    n
      ? `${CONSTRUCTIONS[type].name}: ${n} outside wall${n === 1 ? '' : 's'} now ${constructionThickness(type)} mm — rooms kept their size`
      : 'Join the outside walls into a closed outline first',
  );
}
