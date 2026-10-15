import { exteriorSides } from './facade';
import { add, dot, effectiveOpenings, mul, pointInPolygon, sub, wallExtensions, wallFrame, wallSpans } from './geometry';
import { FLOOR_COLORS } from './catalog';
import type { CorniceType, Design, FloorFinish, LiningType, Room, SkirtingType, Vec, Wall } from './types';

/**
 * Cornices and skirting boards: their profiles (cross-sections) and where they run.
 * Profiles are [out from the wall face, height] in mm. Skirting heights go up from the floor; cornice
 * heights go down from the ceiling.
 */

export interface TrimProfile {
  name: string;
  /** Cross-section polygon; empty = nothing drawn. */
  points: [number, number][];
  /** Draw as a dark recessed shadow line instead of a moulding. */
  shadow?: boolean;
}

const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 8): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

export const CORNICES: Record<CorniceType, TrimProfile> = {
  none: { name: 'None', points: [] },
  square_set: { name: 'Square set (shadow line)', points: [[0, 0], [1, 0], [1, 10], [0, 10]], shadow: true },
  cove55: { name: 'Cove 55 mm', points: [[0, 0], ...arc(55, 55, 55, 180, 270)] },
  cove90: { name: 'Cove 90 mm', points: [[0, 0], ...arc(90, 90, 90, 180, 270)] },
  shadowline: {
    name: 'Square-edge 50 mm',
    points: [[0, 0], [50, 0], [50, 12], [12, 12], [12, 50], [0, 50]],
  },
  classic: {
    name: 'Classic (ogee) 75 mm',
    points: [[0, 0], [75, 0], [75, 8], [62, 10], ...arc(48, 24, 14, 0, 90, 5), ...arc(26, 52, 14, 270, 180, 5), [10, 64], [8, 75], [0, 75]],
  },
  federation: {
    name: 'Federation 150 mm',
    points: [
      [0, 0], [150, 0], [150, 10], [132, 14], ...arc(112, 34, 20, 0, 90, 5), [92, 54], [80, 58], ...arc(56, 82, 24, 270, 180, 6), [32, 96],
      [24, 104], ...arc(14, 120, 10, 270, 180, 4), [4, 130], [6, 140], [0, 150],
    ],
  },
};

export const SKIRTINGS: Record<SkirtingType, TrimProfile> = {
  none: { name: 'None', points: [] },
  shadow: { name: 'Shadow line (flush)', points: [[0, 0], [1, 0], [1, 12], [0, 12]], shadow: true },
  square66: { name: 'Square edge 66 mm', points: [[0, 0], [12, 0], [12, 66], [0, 66]] },
  square90: { name: 'Square edge 90 mm', points: [[0, 0], [18, 0], [18, 90], [0, 90]] },
  square135: { name: 'Modern 135 mm', points: [[0, 0], [18, 0], [18, 135], [0, 135]] },
  pencil: { name: 'Pencil round 68 mm', points: [[0, 0], [12, 0], [12, 64], ...arc(8, 64, 4, 0, 90, 4), [0, 68]] },
  bullnose: { name: 'Bullnose 68 mm', points: [[0, 0], [12, 0], ...arc(6, 62, 6, 0, 180, 6).slice(0, -1), [0, 68]] },
  colonial: {
    name: 'Colonial 90 mm',
    points: [[0, 0], [18, 0], [18, 58], ...arc(12, 64, 6, 0, 90, 4), [10, 72], ...arc(6, 80, 4, 270, 450, 6), [3, 86], [0, 90]],
  },
  lambs_tongue: { name: "Lamb's tongue 90 mm", points: [[0, 0], [18, 0], [18, 62], ...arc(4, 62, 14, 0, 90, 6), [2, 84], [0, 90]] },
};

/** Dado rail on top of VJ wainscoting (profile from its base, 60 mm tall). */
export const DADO_RAIL: TrimProfile = { name: 'Dado rail', points: [[0, 0], [12, 0], [20, 10], [20, 26], [14, 32], [20, 38], [20, 50], [12, 60], [0, 60]] };

export const LININGS: Record<LiningType, string> = {
  plaster: 'Plaster',
  vj: 'VJ panelling (full height)',
  vj_dado: 'VJ wainscot + dado rail',
  shiplap: 'Shiplap (horizontal)',
  board_batten: 'Board & batten',
};

export interface TrimRun {
  wall: Wall;
  /** Which side of the wall (+1 = along the wall's normal). */
  side: number;
  a: number; // along the wall, mm from its start
  b: number;
  kind: 'cornice' | 'skirting' | 'dado';
  profile: TrimProfile;
  /**
   * Mitres at outside corners: how far each end reaches past a / b per mm out from the wall face
   * (tan of half the turn; 1 for a 90° corner, 0 for a square end).
   */
  mitre?: [number, number];
  /** The room this run is in, if any. */
  room?: Room;
}

const near = (p: Vec, q: Vec, tol: number) => Math.hypot(p.x - q.x, p.y - q.y) < tol;

/** Is p inside any wall (as drawn, including the bits that run into joints)? */
function inWall(d: Design, p: Vec): boolean {
  return d.walls.some((w) => {
    const f = wallFrame(w);
    if (f.length < 1) return false;
    const { e0, e1 } = wallExtensions(w, d.walls);
    const q = sub(p, w.start);
    const along = dot(q, f.u);
    return along > -e0 && along < f.length + e1 && Math.abs(dot(q, f.n)) < w.thickness / 2;
  });
}

interface Corner {
  /** tan(turn / 2): how much the trim reaches past the corner per mm out from the face. */
  k: number;
  /** A free wall end: the trim also wraps round its end face. */
  free: boolean;
}

/**
 * Is the end of this wall face an outside (convex) corner? It is if the space just past the end, behind the
 * face line, is empty: the face turns away there, round a free wall end or the outside of an L.
 */
function outsideCorner(d: Design, w: Wall, side: number, end: 0 | 1, e: number): Corner | null {
  const f = wallFrame(w);
  const dir = end === 1 ? f.u : mul(f.u, -1);
  const at = end === 1 ? f.length + e : -e;
  const face = add(add(w.start, mul(f.u, at)), mul(f.n, side * (w.thickness / 2)));
  const behind = add(add(face, mul(dir, 15)), mul(f.n, -side * 15));
  if (inWall(d, behind)) return null;
  const joint = end === 1 ? w.end : w.start;
  const others = d.walls.filter((o) => o.id !== w.id && (near(o.start, joint, 2) || near(o.end, joint, 2)));
  if (others.length === 0) return { k: 1, free: true };
  if (others.length > 1) return null;
  const o = others[0];
  const fo = wallFrame(o);
  const away = near(o.start, joint, 2) ? fo.u : mul(fo.u, -1);
  const turn = Math.acos(Math.max(-1, Math.min(1, dot(dir, away))));
  return { k: Math.tan(turn / 2), free: false };
}

/** The room on this side of the wall at this point along it (if any). */
function roomAt(rooms: Room[], p: Vec): Room | undefined {
  return rooms.find((r) => r.points.length >= 3 && pointInPolygon(p, r.points));
}

export function corniceFor(d: Design, room?: Room) {
  return CORNICES[room?.cornice ?? d.settings.cornice] ?? CORNICES.none;
}
export function skirtingFor(d: Design, room?: Room) {
  return SKIRTINGS[room?.skirting ?? d.settings.skirting] ?? SKIRTINGS.none;
}

/**
 * All cornice and skirting runs: along every inside face of every wall, split where other walls meet it
 * (so each room can have its own types), with skirting stopping at doorways.
 */
export interface InsideStretch {
  wall: Wall;
  side: number;
  a: number;
  b: number;
  room?: Room;
}

/**
 * Every stretch of inside wall face, split where other walls meet it on that side (so each room can have its
 * own finishes), with the room it faces.
 */
export function insideStretches(d: Design): InsideStretch[] {
  const out: InsideStretch[] = [];
  const sides = exteriorSides(d.walls).map;
  for (const w of d.walls) {
    const f = wallFrame(w);
    if (f.length < 1) continue;
    const { e0, e1 } = wallExtensions(w, d.walls);
    for (const side of [1, -1]) {
      const sd = sides.get(w.id);
      if (sd && (side === 1 ? sd.pos : sd.neg)) continue; // outside face: facade, no trims
      // Where other walls meet this face, as [from, to] along the wall.
      const blocks: [number, number][] = [];
      for (const o of d.walls) {
        if (o.id === w.id) continue;
        const fo = wallFrame(o);
        const sin = f.u.x * fo.u.y - f.u.y * fo.u.x;
        if (Math.abs(sin) < 0.05 || fo.length < 1) continue;
        const q = sub(o.start, w.start);
        const s = (q.x * fo.u.y - q.y * fo.u.x) / sin; // along this wall
        // Only a wall that actually comes out on THIS side of the wall interrupts this face. (A wall meeting from
        // the other side is stretched to our far face internally to close the joint, so its line would
        // otherwise seem to reach this face too.) It must also reach our wall rather than stop short of it.
        const towards = (p: Vec) => dot(sub(p, w.start), f.n) * side;
        const near = Math.min(towards(o.start), towards(o.end));
        const far = Math.max(towards(o.start), towards(o.end));
        if (far <= w.thickness / 2 + 1 || near > w.thickness / 2 + 1) continue;
        if (s < -e0 - o.thickness || s > f.length + e1 + o.thickness) continue;
        const half = o.thickness / 2 / Math.abs(sin);
        blocks.push([s - half, s + half]);
      }
      // Split the face into stretches between those walls.
      const cuts = [-e0, f.length + e1, ...blocks.flat()].sort((x, y) => x - y);
      for (let i = 0; i + 1 < cuts.length; i++) {
        const a = Math.max(-e0, cuts[i]);
        const b = Math.min(f.length + e1, cuts[i + 1]);
        if (b - a < 20) continue;
        const mid = (a + b) / 2;
        if (blocks.some(([x, y]) => mid > x && mid < y)) continue; // inside another wall
        const probe = add(add(w.start, mul(f.u, mid)), mul(f.n, side * (w.thickness / 2 + 150)));
        out.push({ wall: w, side, a, b, room: roomAt(d.rooms, probe) });
      }
    }
  }
  return out;
}

export const DADO_HEIGHT = 1100;

export function liningFor(d: Design, room?: Room, wall?: Wall, side?: number): LiningType {
  const own = wall && side !== undefined ? wall.lining?.[side > 0 ? 'pos' : 'neg'] : null;
  return own ?? room?.wallLining ?? d.settings.wallLining ?? 'plaster';
}

/** All cornice, skirting and dado-rail runs. */
export function trimRuns(d: Design, ceiling: number): TrimRun[] {
  const out: TrimRun[] = [];
  // Free wall ends that need the trim wrapped round them, with the room they stick into.
  const caps = new Map<string, { w: Wall; end: 0 | 1; e: number; room?: Room; kinds: Set<TrimRun['kind']> }>();
  for (const { wall: w, side, a, b, room } of insideStretches(d)) {
    const f = wallFrame(w);
    const { e0, e1 } = wallExtensions(w, d.walls);
    const c0 = Math.abs(a + e0) < 1 ? outsideCorner(d, w, side, 0, e0) : null;
    const c1 = Math.abs(b - f.length - e1) < 1 ? outsideCorner(d, w, side, 1, e1) : null;
    // Mitre only the ends that are the stretch's own outside corners (not where it stops at a doorway).
    const push = (x: number, y: number, kind: TrimRun['kind'], profile: TrimProfile) => {
      const m0 = Math.abs(x - a) < 1 && c0 ? c0.k : 0;
      const m1 = Math.abs(y - b) < 1 && c1 ? c1.k : 0;
      out.push({ wall: w, side, a: x, b: y, kind, profile, mitre: [m0, m1], room });
      for (const [c, end, e, hit] of [
        [c0, 0, e0, m0],
        [c1, 1, e1, m1],
      ] as const)
        if (c?.free && hit) {
          const key = `${w.id}:${end}`;
          const cap = caps.get(key) ?? { w, end, e, room, kinds: new Set() };
          cap.kinds.add(kind);
          caps.set(key, cap);
        }
    };
    // Cornice: only where the wall reaches the ceiling, and not across openings that go up to it.
    const cornice = corniceFor(d, room);
    if (cornice.points.length && w.height >= ceiling - 1) {
      const height = Math.max(...cornice.points.map((p) => p[1]));
      for (const [x, y] of subtract([a, b], openingsAbove(d, w, ceiling - height))) push(x, y, 'cornice', cornice);
    }
    // Skirting: stops at doorways.
    const skirting = skirtingFor(d, room);
    if (skirting.points.length) for (const [x, y] of subtract([a, b], doorways(d, w))) push(x, y, 'skirting', skirting);
    // Dado rail on top of VJ wainscoting: stops at doors and windows that cross it.
    if (liningFor(d, room, w, side) === 'vj_dado' && w.height > DADO_HEIGHT)
      for (const [x, y] of subtract([a, b], openingsCrossing(d, w, DADO_HEIGHT))) push(x, y, 'dado', DADO_RAIL);
  }
  // Wrap round free wall ends: a short run across the end face, mitred both ends.
  for (const { w, end, e, room, kinds } of caps.values()) {
    const f = wallFrame(w);
    const out1 = end === 1 ? f.u : mul(f.u, -1);
    const c = add(w.start, mul(f.u, end === 1 ? f.length + e : -e));
    const capWall: Wall = { ...w, id: `${w.id}#cap${end}`, start: add(c, mul(f.n, -w.thickness / 2)), end: add(c, mul(f.n, w.thickness / 2)), thickness: 0 };
    const side = dot(wallFrame(capWall).n, out1) > 0 ? 1 : -1;
    const profiles: Record<TrimRun['kind'], TrimProfile> = { cornice: corniceFor(d, room), skirting: skirtingFor(d, room), dado: DADO_RAIL };
    for (const kind of kinds) out.push({ wall: capWall, side, a: 0, b: w.thickness, kind, profile: profiles[kind], mitre: [1, 1], room });
  }
  return out;
}

/** Wall linings other than plain plaster, per stretch of inside wall. */
export function liningRuns(d: Design): (InsideStretch & { lining: LiningType })[] {
  return insideStretches(d)
    .map((st) => ({ ...st, lining: liningFor(d, st.room, st.wall, st.side) }))
    .filter((st) => st.lining !== 'plaster');
}

function openingsCrossing(d: Design, w: Wall, y: number): [number, number][] {
  return wallSpans(w, effectiveOpenings(d.walls, d.openings)).ops.filter(({ o }) => o.sill < y && o.sill + o.height > y).map(({ a, b }) => [a, b]);
}

/** Wall openings on a wall as [along-from, along-to, sill, head]. */
export function openingRects(d: Design, w: Wall): [number, number, number, number][] {
  return wallSpans(w, effectiveOpenings(d.walls, d.openings)).ops.map(({ o, a, b }) => [a, b, o.sill, Math.min(w.height, o.sill + o.height)]);
}

function doorways(d: Design, w: Wall): [number, number][] {
  return wallSpans(w, effectiveOpenings(d.walls, d.openings)).ops.filter(({ o }) => o.sill < 150).map(({ a, b }) => [a, b]);
}

function openingsAbove(d: Design, w: Wall, y: number): [number, number][] {
  return wallSpans(w, effectiveOpenings(d.walls, d.openings)).ops.filter(({ o }) => o.sill + o.height > y).map(({ a, b }) => [a, b]);
}

/** [a, b] minus a set of intervals. */
function subtract([a, b]: [number, number], holes: [number, number][]): [number, number][] {
  let parts: [number, number][] = [[a, b]];
  for (const [x, y] of holes)
    parts = parts.flatMap(([p, q]): [number, number][] => (y <= p || x >= q ? [[p, q]] : ([[p, x], [y, q]] as [number, number][]).filter(([s, e]) => e - s > 5)));
  return parts;
}

/** The floor finish and colour a room actually uses (its own, or the house flooring). */
export function floorOf(d: Design, room?: Room | null): { finish: FloorFinish; color: string; direction: number } {
  const direction = room?.floorDirection ?? d.settings.flooring.direction ?? 0;
  if (room?.floor) return { finish: room.floor, color: room.color ?? FLOOR_COLORS[room.floor], direction };
  return { ...d.settings.flooring, direction };
}

/** Floors made of boards / planks, where the direction matters. */
export const DIRECTIONAL_FLOORS = new Set<FloorFinish>(['timber', 'hybrid', 'large_tile']);

/** The inside faces of a wall, with the room each faces and a plan direction, for the wall panel. */
export function wallFaces(d: Design, w: Wall): { side: 1 | -1; label: string; room?: Room }[] {
  const sides = exteriorSides(d.walls).map.get(w.id);
  const f = wallFrame(w);
  const out: { side: 1 | -1; label: string; room?: Room }[] = [];
  for (const side of [1, -1] as const) {
    if (sides && (side === 1 ? sides.pos : sides.neg)) continue; // outside face
    const n = mul(f.n, side);
    const dir = Math.abs(n.x) >= Math.abs(n.y) ? (n.x > 0 ? 'right' : 'left') : n.y > 0 ? 'bottom' : 'top';
    // Every room this face looks into (a long wall can face several).
    const rooms = [...new Set(insideStretches(d).filter((st) => st.wall.id === w.id && st.side === side && st.room).map((st) => st.room!))];
    const Dir = `${dir[0].toUpperCase()}${dir.slice(1)} side`;
    const label = rooms.length === 1 ? `${rooms[0].name} (${dir} side)` : rooms.length ? `${Dir} (${rooms.map((r) => r.name).join(', ')})` : Dir;
    out.push({ side, room: rooms.length === 1 ? rooms[0] : undefined, label });
  }
  return out;
}
