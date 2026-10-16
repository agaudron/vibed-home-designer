import { add, clamp, dot, mul, rad, rot, sub, v, wallExtensions, wallFrame } from './geometry';
import { exteriorSides } from './facade';
import type { Design, Item, Roof, RoofExtension, Vec } from './types';

/**
 * Automatic roof generation.
 *
 * 1. The building footprint is whatever the walls enclose (plus the walls themselves). It is found by
 *    rasterising the walls onto a grid built from the wall edge coordinates and flood-filling from outside,
 *    so door/window gaps don't matter and any rectilinear shape works (L, T, U, courtyards...).
 * 2. The footprint is split into its maximal rectangles. For rectilinear shapes, a single-pitch hip roof is
 *    exactly the union of the hip roofs of those rectangles (the roof height at a point is the largest
 *    square that fits around it), so overlapping the pieces gives correct hips and valleys.
 * 3. Gable/skillion ends get wall infill up to the underside of the roof.
 *
 * The footprint can be pulled out over patios with roof extensions (plan rectangles), and a column standing
 * outside the house pulls the roof out over itself.
 *
 * If the walls aren't all at right angles, the roof is built over the convex hull of the walls instead.
 *
 * Coordinates: plan x/y in mm; 3D points use y for height and z for plan y.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface RoofFace {
  pts: Vec3[]; // planar polygon, or triangle strip when strip=true
  mat: 'roof' | 'infill';
  /** Upper surface of the roof (doesn't cast shadows, so it can't shadow itself). */
  top?: boolean;
}

export interface RoofResult {
  faces: RoofFace[];
  /** Plan outlines of the roof coverage (including eaves), world coordinates. */
  eaves: Vec[][];
  plate: number; // top of the walls
  ridge: number; // highest point
  mode: 'rectilinear' | 'hull';
  note?: string;
  /** Walls that are slightly (but not exactly) square — "Square up walls" would fix them. */
  offSquare: number;
  /** Outline of the area under the roof (before the eaves), world coordinates, with each edge's outward normal. */
  outline: { a: Vec; b: Vec; n: Vec }[];
  /** Angle of the roof's grid (degrees): extensions line up with it. */
  angle: number;
  /** Columns holding the roof up (they rise to the top of the walls). */
  supports: string[];
  /**
   * Roofed area outside the house walls (patios, verandas, column extensions), world rectangles. It gets eave
   * lining right back to the walls; the eaves' own overhang strip is lined separately.
   */
  outside: Vec[][];
}

export type RoofOutcome = RoofResult | { error: string };

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Gable only: ridge runs along x (otherwise along the longer side). */
  ridgeX?: boolean;
  /** Gable only: this end was cut back to meet another wing, so it gets no verge overhang. */
  trimStart?: boolean;
  trimEnd?: boolean;
}

type Piece =
  | { kind: 'hip'; poly: Vec[]; k?: number; base?: number }
  | { kind: 'gable'; rect: Rect; alongX: boolean; k?: number; base?: number }
  | { kind: 'flat'; poly: Vec[] }
  | { kind: 'skillion'; poly: Vec[] };

const MIN_RECT = 500;
/** Walls within this many degrees of square are treated as square. */
export const SQUARE_TOLERANCE_DEG = 3; // ignore thin slivers such as garden walls sticking out of the house

export function generateRoof(d: Design, roof: Roof): RoofOutcome {
  const walls = d.walls.filter((w) => wallFrame(w).length > 1);
  if (!walls.length) return { error: 'Draw some walls first — the roof is worked out from them.' };

  const plate = roof.eaveHeight ?? Math.max(...walls.map((w) => w.height));
  const k = Math.tan(rad(clamp(roof.pitch, 0, 70)));
  const f = Math.max(20, roof.fascia);
  const o = Math.max(0, roof.overhang);

  // Work in a frame aligned with the longest wall so rotated houses still count as rectilinear.
  const longest = walls.reduce((a, b) => (wallFrame(b).length > wallFrame(a).length ? b : a));
  const quarter = Math.PI / 2;
  const la = wallFrame(longest).angle;
  const th = la - Math.floor(la / quarter) * quarter;
  const toLocal = (p: Vec) => rot(p, -th);
  const toWorld = (p: Vec) => rot(p, th);

  // How far each wall is from square. Walls drawn a few mm out (e.g. snapped to a slightly misaligned
  // corner) still count as square; the roof covers their full footprint.
  const offSquareBy = walls.map((w) => {
    const a = wallFrame(w).angle - th;
    const m = ((a % quarter) + quarter) % quarter;
    return Math.min(m, quarter - m);
  });
  // Only walls on the outside of the house shape the roof; a crooked inside wall doesn't matter.
  const sides = exteriorSides(d.walls);
  const isOuter = (w: (typeof walls)[number]) => {
    const sd = sides.map.get(w.id);
    return !sides.enclosed || !!(sd && (sd.pos || sd.neg));
  };
  const rectilinear = walls.every((w, i) => !isOuter(w) || offSquareBy[i] < rad(SQUARE_TOLERANCE_DEG));
  const offSquare = offSquareBy.filter((m) => m > rad(0.01) && m < rad(SQUARE_TOLERANCE_DEG)).length;

  // Footprint as rectangles (local frame) + its boundary edges (for infill).
  let footprint: Rect[];
  let boundary: [Vec, Vec][];
  let mode: RoofResult['mode'];
  let note: string | undefined;
  let hull: Vec[] | null = null;
  let outside: Vec[][] = [];

  const columns = supportColumns(d);
  const supports: string[] = [];
  if (rectilinear) {
    // Porches/verandas set to sit under the main roof, and roof extensions, count as part of the footprint.
    const bbox = (c: Vec[]): Rect => ({
      x0: Math.min(...c.map((p) => p.x)),
      x1: Math.max(...c.map((p) => p.x)),
      y0: Math.min(...c.map((p) => p.y)),
      y1: Math.max(...c.map((p) => p.y)),
    });
    const covered = [...coveredItems(d), ...(roof.extensions ?? [])].map((it) => bbox(itemFootprint(it).map(toLocal)));
    const wallRects = walls.map((w) => wallRect(w, walls, toLocal));
    const base = [...wallRects, ...covered];
    let r = rectilinearFootprint(base);
    if ('error' in r) return r;
    // Columns outside the house: pull the roof out from the nearest wing to cover them.
    const reach: Rect[] = [];
    for (const col of columns) {
      const c = bbox(itemFootprint(col).map(toLocal));
      const gap = (q: Rect) => Math.hypot(Math.max(0, q.x0 - c.x1, c.x0 - q.x1), Math.max(0, q.y0 - c.y1, c.y0 - q.y1));
      const near = r.rects.reduce((a, b) => (gap(b) < gap(a) ? b : a));
      const dd = gap(near);
      if (dd > MAX_SUPPORT_REACH) continue;
      supports.push(col.id);
      // Already inside the footprint or under its eaves.
      const under = Math.max(near.x0 - c.x0, c.x1 - near.x1, near.y0 - c.y0, c.y1 - near.y1);
      if (under <= o) continue;
      // Span the wing's whole side out to the column's outer face (like a patio roof). Off a corner, it runs
      // along the side the column is furthest out from and stretches past the corner to reach it.
      const e = { x0: Math.min(near.x0, c.x0), x1: Math.max(near.x1, c.x1), y0: Math.min(near.y0, c.y0), y1: Math.max(near.y1, c.y1) };
      const outX = Math.max(c.x0 - near.x1, near.x0 - c.x1);
      const outY = Math.max(c.y0 - near.y1, near.y0 - c.y1);
      if (outX > 0 && outX >= outY) {
        if (c.x0 > near.x1) e.x0 = near.x1;
        else e.x1 = near.x0;
      } else if (outY > 0) {
        if (c.y0 > near.y1) e.y0 = near.y1;
        else e.y1 = near.y0;
      }
      reach.push(e);
    }
    if (reach.length) {
      r = rectilinearFootprint([...base, ...reach]);
      if ('error' in r) return r;
    }
    footprint = r.rects;
    boundary = r.boundary;
    mode = 'rectilinear';
    // What the walls alone enclose: anything else under the roof is outside the house.
    if (covered.length || reach.length) {
      const house = rectilinearFootprint(wallRects);
      if (!('error' in house)) outside = rectDifference(footprint, house.rects).map(rectPoly);
    }
  } else {
    const pts: Vec[] = [];
    for (const w of walls) {
      const fr = wallFrame(w);
      const { e0, e1 } = wallExtensions(w, walls);
      const a = add(w.start, mul(fr.u, -e0));
      const b = add(w.end, mul(fr.u, e1));
      const h = mul(fr.n, w.thickness / 2);
      pts.push(add(a, h), sub(a, h), add(b, h), sub(b, h));
    }
    for (const it of [...coveredItems(d), ...(roof.extensions ?? [])]) pts.push(...itemFootprint(it));
    for (const col of columns) {
      pts.push(...itemFootprint(col));
      supports.push(col.id);
    }
    hull = convexHull(pts.map(toLocal));
    if (hull.length < 3) return { error: 'The walls don’t enclose an area yet.' };
    footprint = [];
    boundary = hull.map((p, i) => [p, hull![(i + 1) % hull!.length]] as [Vec, Vec]);
    mode = 'hull';
    note = 'Some walls are at an angle, so the roof covers the overall outline of the walls rather than following every corner.';
  }

  // Roof pieces (expanded by the overhang) and the height of the roof's top surface for each.
  const topBase = plate + f - o * k; // top surface height at the eaves line
  const pieces: Piece[] = [];
  if (mode === 'rectilinear') {
    const gableRects = roof.style === 'gable' ? trimCrossGables(footprint) : null;
    for (const r of gableRects ?? footprint) {
      if (roof.style === 'gable') {
        const alongX = r.ridgeX ?? r.x1 - r.x0 >= r.y1 - r.y0;
        const verge = Math.min(o, 300);
        pieces.push({
          kind: 'gable',
          alongX,
          rect: alongX
            ? { x0: r.x0 - (r.trimStart ? 0 : verge), x1: r.x1 + (r.trimEnd ? 0 : verge), y0: r.y0 - o, y1: r.y1 + o }
            : { x0: r.x0 - o, x1: r.x1 + o, y0: r.y0 - (r.trimStart ? 0 : verge), y1: r.y1 + (r.trimEnd ? 0 : verge) },
        });
      } else {
        const e = { x0: r.x0 - o, y0: r.y0 - o, x1: r.x1 + o, y1: r.y1 + o };
        const poly = [v(e.x0, e.y0), v(e.x1, e.y0), v(e.x1, e.y1), v(e.x0, e.y1)];
        pieces.push({ kind: roof.style === 'flat' ? 'flat' : roof.style === 'skillion' ? 'skillion' : 'hip', poly });
      }
    }
  } else {
    const poly = offsetConvex(hull!, o);
    pieces.push({ kind: roof.style === 'flat' ? 'flat' : roof.style === 'skillion' ? 'skillion' : 'hip', poly });
    if (roof.style === 'gable') note += ' Gable isn’t available for this shape, so a hip roof is used.';
  }

  // Level ridges: give each main wing the pitch that brings its ridge up to the highest ridge (what builders
  // do on L / T shaped houses). Narrow bits (porches, bays) keep the normal pitch rather than becoming spires.
  const halfOf = (p: Piece) => {
    if (p.kind === 'gable') return (p.alongX ? p.rect.y1 - p.rect.y0 : p.rect.x1 - p.rect.x0) / 2 - o;
    if (p.kind === 'hip' && mode === 'rectilinear') {
      const xs = p.poly.map((q) => q.x);
      const ys = p.poly.map((q) => q.y);
      return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 - o;
    }
    return 0;
  };
  if (roof.levelRidges !== false && (roof.style === 'hip' || roof.style === 'gable') && mode === 'rectilinear' && pieces.length > 1) {
    const maxHalf = Math.max(...pieces.map(halfOf));
    for (const p of pieces) {
      if (p.kind !== 'hip' && p.kind !== 'gable') continue;
      const half = halfOf(p);
      if (half <= 0 || half >= maxHalf - 1 || half < maxHalf * 0.55) continue;
      const kp = (k * maxHalf) / half;
      if (Math.atan(kp) > rad(55)) continue;
      p.k = kp;
      p.base = plate + f - o * kp; // same wall top, steeper slope: eave line a little lower
    }
  }
  const kOf = (p: Piece) => ('k' in p && p.k !== undefined ? p.k : k);
  const baseOf = (p: Piece) => ('base' in p && p.base !== undefined ? p.base : topBase);

  // Skillion plane: rises along `dir` from the lowest eave.
  const dir = rot(v(1, 0), rad(roof.skillionDir));
  const allPts = pieces.flatMap((p) => (p.kind === 'gable' ? rectPoly(p.rect) : p.poly));
  const minDot = Math.min(...allPts.map((p) => dot(p, dir)));
  const flatTop = plate + Math.max(f, 150);

  const pieceTop = (p: Piece, q: Vec): number | null => {
    switch (p.kind) {
      case 'hip': {
        const dd = insetDistance(p.poly, q);
        return dd < -1 ? null : baseOf(p) + kOf(p) * Math.max(0, dd);
      }
      case 'gable': {
        const r = p.rect;
        if (q.x < r.x0 - 1 || q.x > r.x1 + 1 || q.y < r.y0 - 1 || q.y > r.y1 + 1) return null;
        const half = p.alongX ? (r.y1 - r.y0) / 2 : (r.x1 - r.x0) / 2;
        const off = p.alongX ? Math.abs(q.y - (r.y0 + r.y1) / 2) : Math.abs(q.x - (r.x0 + r.x1) / 2);
        return baseOf(p) + kOf(p) * Math.max(0, half - off);
      }
      case 'skillion':
        return insetDistance(p.poly, q) < -1 ? null : topBase + k * (dot(q, dir) - minDot);
      case 'flat':
        return insetDistance(p.poly, q) < -1 ? null : flatTop;
    }
  };
  const roofTop = (q: Vec) => {
    let best: number | null = null;
    for (const p of pieces) {
      const t = pieceTop(p, q);
      if (t !== null && (best === null || t > best)) best = t;
    }
    return best;
  };

  // Build the faces (local frame), then convert to world.
  const faces: RoofFace[] = [];
  const lift = (q: Vec, y: number): Vec3 => ({ x: q.x, y, z: q.y });
  const slab = (poly: Vec[], top: (q: Vec) => number) => {
    faces.push({ mat: 'roof', top: true, pts: poly.map((q) => lift(q, top(q))) });
    faces.push({ mat: 'roof', pts: poly.map((q) => lift(q, top(q) - f)) });
  };
  const edgeBand = (a: Vec, b: Vec, top: (q: Vec) => number, mat: RoofFace['mat'] = 'roof') => {
    faces.push({ mat, pts: [lift(a, top(a)), lift(b, top(b)), lift(b, top(b) - f), lift(a, top(a) - f)] });
  };

  for (const p of pieces) {
    if (p.kind === 'hip') {
      const n = p.poly.length;
      for (let i = 0; i < n; i++) {
        // Region of the polygon where edge i is the nearest edge, lifted at the pitch.
        let region = p.poly;
        for (let j = 0; j < n && region.length >= 3; j++) {
          if (j === i) continue;
          region = clipPoly(region, (q) => edgeDistance(p.poly, i, q) - edgeDistance(p.poly, j, q));
        }
        if (region.length >= 3) slab(region, (q) => baseOf(p) + kOf(p) * edgeDistance(p.poly, i, q));
        edgeBand(p.poly[i], p.poly[(i + 1) % n], () => baseOf(p));
      }
    } else if (p.kind === 'gable') {
      const r = p.rect;
      const top = (q: Vec) => pieceTop(p, q)!;
      const halves: Vec[][] = p.alongX
        ? [
            [v(r.x0, r.y0), v(r.x1, r.y0), v(r.x1, (r.y0 + r.y1) / 2), v(r.x0, (r.y0 + r.y1) / 2)],
            [v(r.x0, (r.y0 + r.y1) / 2), v(r.x1, (r.y0 + r.y1) / 2), v(r.x1, r.y1), v(r.x0, r.y1)],
          ]
        : [
            [v(r.x0, r.y0), v((r.x0 + r.x1) / 2, r.y0), v((r.x0 + r.x1) / 2, r.y1), v(r.x0, r.y1)],
            [v((r.x0 + r.x1) / 2, r.y0), v(r.x1, r.y0), v(r.x1, r.y1), v((r.x0 + r.x1) / 2, r.y1)],
          ];
      halves.forEach((h) => slab(h, top));
      for (const h of halves) for (let i = 0; i < 4; i++) {
        const a = h[i];
        const b = h[(i + 1) % 4];
        const onRidge = p.alongX ? Math.abs(a.y - b.y) < 1 && Math.abs(a.y - (r.y0 + r.y1) / 2) < 1 : Math.abs(a.x - b.x) < 1 && Math.abs(a.x - (r.x0 + r.x1) / 2) < 1;
        if (!onRidge) edgeBand(a, b, top);
      }
    } else {
      const top = (q: Vec) => pieceTop(p, q) ?? topBase;
      slab(p.poly, top);
      p.poly.forEach((a, i) => edgeBand(a, p.poly[(i + 1) % p.poly.length], top));
    }
  }

  // Wall infill under gable ends / the high side of a skillion: from the wall top up to the roof underside.
  for (const [a, b] of boundary) {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(L / 50));
    const strip: Vec3[] = [];
    let any = false;
    for (let i = 0; i <= n; i++) {
      const q = add(a, mul(sub(b, a), i / n));
      const under = Math.max(plate, (roofTop(q) ?? plate + f) - f);
      if (under > plate + 2) any = true;
      strip.push(lift(q, plate), lift(q, under));
    }
    if (any) faces.push({ mat: 'infill', pts: strip });
  }

  let ridge = plate;
  for (const fc of faces) for (const q of fc.pts) ridge = Math.max(ridge, q.y);

  const world = (q: Vec3): Vec3 => {
    const w = toWorld(v(q.x, q.z));
    return { x: w.x, y: q.y, z: w.y };
  };
  // Outline edges with their outward side (rectilinear footprints only).
  const inFoot = (q: Vec) => footprint.some((r) => q.x > r.x0 && q.x < r.x1 && q.y > r.y0 && q.y < r.y1);
  const outline: RoofResult['outline'] = [];
  if (mode === 'rectilinear')
    for (const [a, b] of boundary) {
      const m = mul(add(a, b), 0.5);
      const n = Math.abs(a.y - b.y) < 0.5 ? v(0, 1) : v(1, 0);
      const out = !inFoot(add(m, mul(n, 5))) && inFoot(sub(m, mul(n, 5))) ? n : !inFoot(sub(m, mul(n, 5))) && inFoot(add(m, mul(n, 5))) ? mul(n, -1) : null;
      if (out) outline.push({ a: toWorld(a), b: toWorld(b), n: toWorld(out) });
    }

  return {
    faces: faces.map((fc) => ({ ...fc, pts: fc.pts.map(world) })),
    eaves: pieces.map((p) => (p.kind === 'gable' ? rectPoly(p.rect) : p.poly).map(toWorld)),
    plate,
    ridge,
    mode,
    note,
    offSquare,
    outline,
    angle: (th * 180) / Math.PI,
    supports,
    outside: outside.map((poly) => poly.map(toWorld)),
  };
}

/** The area covered by `a` but not `b`, as rectangles (cells merged along rows, then matching rows merged). */
function rectDifference(a: Rect[], b: Rect[]): Rect[] {
  const xs = uniqSorted([...a, ...b].flatMap((r) => [r.x0, r.x1]));
  const ys = uniqSorted([...a, ...b].flatMap((r) => [r.y0, r.y1]));
  const inAny = (rs: Rect[], x: number, y: number) => rs.some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1);
  const out: Rect[] = [];
  let open: Rect[] = []; // runs from the previous row, still growing downwards
  for (let j = 0; j + 1 < ys.length; j++) {
    const cy = (ys[j] + ys[j + 1]) / 2;
    const runs: Rect[] = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      if (!inAny(a, cx, cy) || inAny(b, cx, cy)) continue;
      const last = runs[runs.length - 1];
      if (last && Math.abs(last.x1 - xs[i]) < 0.5) last.x1 = xs[i + 1];
      else runs.push({ x0: xs[i], x1: xs[i + 1], y0: ys[j], y1: ys[j + 1] });
    }
    const next: Rect[] = [];
    for (const r of runs) {
      const above = open.find((o) => Math.abs(o.x0 - r.x0) < 0.5 && Math.abs(o.x1 - r.x1) < 0.5 && Math.abs(o.y1 - r.y0) < 0.5);
      if (above) {
        above.y1 = r.y1;
        next.push(above);
      } else next.push(r);
    }
    for (const o of open) if (!next.includes(o)) out.push(o);
    open = next;
  }
  return [...out, ...open].filter((r) => r.x1 - r.x0 > 1 && r.y1 - r.y0 > 1);
}

/** Columns this far (mm) from the house still get the roof pulled out over them. */
const MAX_SUPPORT_REACH = 10000;

/** Floor-standing, full-height columns: they hold up the roof. */
function supportColumns(d: Design) {
  return d.items.filter((i) => i.type === 'column' && i.elevation < 100 && i.height >= 1800);
}

/**
 * Cross gables: the biggest wing keeps its full ridge (and gable ends). A wing that runs into a perpendicular,
 * earlier wing is cut back to that wing's ridge line, so it meets the main roof with valleys instead of the two
 * ridges crossing at the outer corner.
 */
function trimCrossGables(rects: Rect[]): Rect[] {
  const alongX = (r: Rect) => r.x1 - r.x0 >= r.y1 - r.y0;
  const sorted = [...rects].sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0));
  const out: Rect[] = [];
  for (const orig of sorted) {
    const r = { ...orig };
    const ax = alongX(r);
    for (const p of out) {
      if (alongX(p) === ax) continue;
      if (ax) {
        if (p.y0 > r.y0 + 1 || p.y1 < r.y1 - 1) continue; // must span this wing's full width
        const mid = (p.x0 + p.x1) / 2;
        if (p.x0 <= r.x0 + 1 && p.x1 > r.x0 && mid < r.x1 && mid > r.x0) (r.x0 = mid), (r.trimStart = true);
        else if (p.x1 >= r.x1 - 1 && p.x0 < r.x1 && mid > r.x0 && mid < r.x1) (r.x1 = mid), (r.trimEnd = true);
      } else {
        if (p.x0 > r.x0 + 1 || p.x1 < r.x1 - 1) continue;
        const mid = (p.y0 + p.y1) / 2;
        if (p.y0 <= r.y0 + 1 && p.y1 > r.y0 && mid < r.y1 && mid > r.y0) (r.y0 = mid), (r.trimStart = true);
        else if (p.y1 >= r.y1 - 1 && p.y0 < r.y1 && mid > r.y0 && mid < r.y1) (r.y1 = mid), (r.trimEnd = true);
      }
    }
    // Keep the wing's ridge direction even if trimming made it shorter than it is wide.
    if ((ax ? r.x1 - r.x0 : r.y1 - r.y0) >= 1) out.push({ ...r, ridgeX: ax });
  }
  return out;
}

/** Porches and verandas the user has put under the main roof. */
export function coveredItems(d: Design) {
  return d.items.filter((i) => i.underRoof && (i.type === 'veranda' || i.type === 'porch'));
}

function itemFootprint(it: Pick<Item, 'x' | 'y' | 'width' | 'depth' | 'rotation'> | RoofExtension): Vec[] {
  const r = rad(it.rotation);
  const hw = it.width / 2;
  const hd = it.depth / 2;
  return [v(-hw, -hd), v(hw, -hd), v(hw, hd), v(-hw, hd)].map((p) => add(v(it.x, it.y), rot(p, r)));
}

/** Height the main roof sits at (top of the walls). */
export function roofPlate(d: Design, roof: Roof) {
  const walls = d.walls.filter((w) => wallFrame(w).length > 1);
  return roof.eaveHeight ?? Math.max(0, ...walls.map((w) => w.height));
}

// ---------- footprint ----------

function wallRect(w: Design['walls'][number], walls: Design['walls'], toLocal: (p: Vec) => Vec): Rect {
  const fr = wallFrame(w);
  const { e0, e1 } = wallExtensions(w, walls);
  const a = add(w.start, mul(fr.u, -e0));
  const b = add(w.end, mul(fr.u, e1));
  const h = mul(fr.n, w.thickness / 2);
  // Bounding box of the wall's outline, so a wall that's slightly out of square is still fully covered.
  const c = [add(a, h), sub(a, h), add(b, h), sub(b, h)].map(toLocal);
  return {
    x0: Math.min(...c.map((p) => p.x)),
    x1: Math.max(...c.map((p) => p.x)),
    y0: Math.min(...c.map((p) => p.y)),
    y1: Math.max(...c.map((p) => p.y)),
  };
}

function uniqSorted(vals: number[]) {
  const s = [...vals].sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of s) if (!out.length || x - out[out.length - 1] > 0.5) out.push(x);
  return out;
}

function rectilinearFootprint(wallRects: Rect[]): { rects: Rect[]; boundary: [Vec, Vec][] } | { error: string } {
  const xs = uniqSorted(wallRects.flatMap((r) => [r.x0, r.x1]));
  const ys = uniqSorted(wallRects.flatMap((r) => [r.y0, r.y1]));
  xs.unshift(xs[0] - 1000);
  xs.push(xs[xs.length - 1] + 1000);
  ys.unshift(ys[0] - 1000);
  ys.push(ys[ys.length - 1] + 1000);
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const idx = (i: number, j: number) => j * nx + i;

  const wall = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      if (wallRects.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1)) wall[idx(i, j)] = 1;
    }

  // Flood fill the outside.
  const outside = new Uint8Array(nx * ny);
  const stack = [0];
  outside[0] = 1;
  while (stack.length) {
    const c = stack.pop()!;
    const i = c % nx;
    const j = (c - i) / nx;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const n = idx(a, b);
      if (!outside[n] && !wall[n]) {
        outside[n] = 1;
        stack.push(n);
      }
    }
  }

  let enclosed = 0;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++)
      if (!outside[idx(i, j)] && !wall[idx(i, j)]) enclosed += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
  if (enclosed < 0.5e6)
    return { error: 'The walls don’t form a closed outline yet. Join the outside walls up so they enclose the house, then try again.' };

  const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && !outside[idx(i, j)];

  // Maximal rectangles of the inside cells.
  const rects: Rect[] = [];
  const colOK = new Uint8Array(nx);
  for (let j1 = 0; j1 < ny; j1++) {
    colOK.fill(1);
    for (let j2 = j1; j2 < ny; j2++) {
      let anyOK = false;
      for (let i = 0; i < nx; i++) {
        colOK[i] = colOK[i] && inside(i, j2) ? 1 : 0;
        anyOK ||= !!colOK[i];
      }
      if (!anyOK) break;
      for (let i = 0; i < nx; ) {
        if (!colOK[i]) {
          i++;
          continue;
        }
        let i2 = i;
        while (i2 + 1 < nx && colOK[i2 + 1]) i2++;
        const rowFull = (j: number) => {
          for (let c = i; c <= i2; c++) if (!inside(c, j)) return false;
          return true;
        };
        if (!rowFull(j1 - 1) && !rowFull(j2 + 1)) {
          const r = { x0: xs[i], x1: xs[i2 + 1], y0: ys[j1], y1: ys[j2 + 1] };
          if (Math.min(r.x1 - r.x0, r.y1 - r.y0) >= MIN_RECT) rects.push(r);
        }
        i = i2 + 1;
      }
    }
  }
  if (!rects.length) return { error: 'Couldn’t find an area big enough to roof.' };

  // Boundary of the covered area (union of the kept rectangles), merged into straight runs.
  const covered = new Uint8Array(nx * ny);
  for (const r of rects)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const cx = (xs[i] + xs[i + 1]) / 2;
        const cy = (ys[j] + ys[j + 1]) / 2;
        if (cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1) covered[idx(i, j)] = 1;
      }
  const cov = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && !!covered[idx(i, j)];
  const boundary: [Vec, Vec][] = [];
  for (let j = 0; j <= ny; j++) {
    let start = -1;
    for (let i = 0; i <= nx; i++) {
      const edge = i < nx && cov(i, j) !== cov(i, j - 1);
      if (edge && start < 0) start = i;
      if (!edge && start >= 0) {
        boundary.push([v(xs[start], ys[j]), v(xs[i], ys[j])]);
        start = -1;
      }
    }
  }
  for (let i = 0; i <= nx; i++) {
    let start = -1;
    for (let j = 0; j <= ny; j++) {
      const edge = j < ny && cov(i, j) !== cov(i - 1, j);
      if (edge && start < 0) start = j;
      if (!edge && start >= 0) {
        boundary.push([v(xs[i], ys[start]), v(xs[i], ys[j])]);
        start = -1;
      }
    }
  }
  return { rects, boundary };
}

// ---------- convex polygon helpers ----------

function rectPoly(r: Rect): Vec[] {
  return [v(r.x0, r.y0), v(r.x1, r.y0), v(r.x1, r.y1), v(r.x0, r.y1)];
}

function signedArea(poly: Vec[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Signed distance from q to edge i's line, positive towards the inside of the (convex) polygon. */
function edgeDistance(poly: Vec[], i: number, q: Vec) {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const s = signedArea(poly) > 0 ? 1 : -1;
  return (s * ((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x))) / L;
}

/** Distance from q to the nearest edge line of a convex polygon (negative when outside). */
function insetDistance(poly: Vec[], q: Vec) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) m = Math.min(m, edgeDistance(poly, i, q));
  return m;
}

/** Keep the part of a convex polygon where g(q) <= 0 (g linear). */
function clipPoly(poly: Vec[], g: (q: Vec) => number): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const gp = g(p);
    const gq = g(q);
    if (gp <= 1e-6) out.push(p);
    if ((gp < -1e-6 && gq > 1e-6) || (gp > 1e-6 && gq < -1e-6)) {
      const t = gp / (gp - gq);
      out.push(add(p, mul(sub(q, p), t)));
    }
  }
  return out;
}

function convexHull(pts: Vec[]): Vec[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Vec[] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Grow a convex polygon outwards by d (mitred corners). */
function offsetConvex(poly: Vec[], d: number): Vec[] {
  if (d <= 0) return poly;
  const s = signedArea(poly) > 0 ? 1 : -1;
  const n = poly.length;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const out = v((s * (b.y - a.y)) / L, (-s * (b.x - a.x)) / L); // outward normal
    return { p: add(a, mul(out, d)), dir: sub(b, a) };
  });
  return lines.map((l1, i) => {
    const l0 = lines[(i - 1 + n) % n];
    const den = l0.dir.x * l1.dir.y - l0.dir.y * l1.dir.x;
    if (Math.abs(den) < 1e-9) return l1.p;
    const w = sub(l1.p, l0.p);
    const t = (w.x * l1.dir.y - w.y * l1.dir.x) / den;
    return add(l0.p, mul(l0.dir, t));
  });
}
