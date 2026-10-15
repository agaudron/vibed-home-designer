import { exteriorSides } from './facade';
import { dot, polygonArea, polygonCentroid, pointInPolygon, projectOnSegment, sub, v, wallFrame } from './geometry';
import type { Design, Vec } from './types';

/**
 * Find the rooms the walls enclose: each separate space inside the walls (doorways don't count as gaps)
 * becomes a room outline, with its edges snapped onto the centrelines of the walls around it — the same
 * as rooms drawn by hand, so internal measurements come out exact.
 */
export function detectRoomOutlines(d: Design): Vec[][] {
  const g = exteriorSides(d.walls).grid;
  if (!g) return [];
  const { cell, minX, minY, nx, ny, wall, outside } = g;
  const free = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && !outside[j * nx + i] && !wall[j * nx + i];
  const comp = new Int32Array(nx * ny).fill(-1);
  const outlines: Vec[][] = [];
  let id = 0;
  const stack = new Int32Array(nx * ny);
  for (let start = 0; start < nx * ny; start++) {
    const si = start % nx;
    const sj = (start - si) / nx;
    if (comp[start] >= 0 || !free(si, sj)) continue;
    // Flood this space.
    const cells: number[] = [];
    let sp = 0;
    stack[sp++] = start;
    comp[start] = id;
    while (sp) {
      const c = stack[--sp];
      cells.push(c);
      const i = c % nx;
      const j = (c - i) / nx;
      for (const [a, b] of [
        [i + 1, j],
        [i - 1, j],
        [i, j + 1],
        [i, j - 1],
      ]) {
        if (free(a, b) && comp[b * nx + a] < 0) {
          comp[b * nx + a] = id;
          stack[sp++] = b * nx + a;
        }
      }
    }
    const thisId = id++;
    if (cells.length * cell * cell < 1.0e6) continue; // ignore slivers under 1 m²
    const loop = traceOutline(cells, thisId, comp, nx, ny);
    if (loop.length < 4) continue;
    const world = simplify(loop.map(([i, j]) => v(minX + i * cell, minY + j * cell)), cell * 1.5);
    if (world.length < 3) continue;
    outlines.push(snapToWalls(world, d, cell));
  }
  return outlines;
}

/** Boundary of a set of grid cells as a loop of grid-corner points (largest loop = outer edge). */
function traceOutline(cells: number[], id: number, comp: Int32Array, nx: number, ny: number): [number, number][] {
  const inComp = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && comp[j * nx + i] === id;
  const W = nx + 1;
  const next = new Map<number, number[]>();
  const addEdge = (a: number, b: number) => {
    const l = next.get(a);
    if (l) l.push(b);
    else next.set(a, [b]);
  };
  for (const c of cells) {
    const i = c % nx;
    const j = (c - i) / nx;
    const tl = j * W + i;
    const tr = j * W + i + 1;
    const br = (j + 1) * W + i + 1;
    const bl = (j + 1) * W + i;
    if (!inComp(i, j - 1)) addEdge(tl, tr);
    if (!inComp(i + 1, j)) addEdge(tr, br);
    if (!inComp(i, j + 1)) addEdge(br, bl);
    if (!inComp(i - 1, j)) addEdge(bl, tl);
  }
  let best: [number, number][] = [];
  let bestArea = 0;
  for (const startKey of [...next.keys()]) {
    while ((next.get(startKey)?.length ?? 0) > 0) {
      const loop: [number, number][] = [];
      let k = startKey;
      for (let guard = 0; guard < 1e6; guard++) {
        loop.push([k % W, Math.floor(k / W)]);
        const outs = next.get(k);
        if (!outs || !outs.length) break;
        const n = outs.pop()!;
        k = n;
        if (k === startKey) break;
      }
      const area = Math.abs(polygonArea(loop.map(([x, y]) => v(x, y))));
      if (area > bestArea) {
        bestArea = area;
        best = loop;
      }
    }
  }
  return best;
}

/** Drop collinear points, then Douglas–Peucker to smooth raster steps on angled walls. */
function simplify(pts: Vec[], tol: number): Vec[] {
  const n = pts.length;
  // Start from the point furthest from the first, so the closed loop splits sensibly.
  let far = 0;
  for (let i = 1; i < n; i++) if (Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y) > Math.hypot(pts[far].x - pts[0].x, pts[far].y - pts[0].y)) far = i;
  const dp = (a: number, b: number, chain: Vec[]): Vec[] => {
    let idx = -1;
    let dmax = 0;
    for (let i = a + 1; i < b; i++) {
      const dd = projectOnSegment(chain[i], chain[a], chain[b]).dist;
      if (dd > dmax) {
        dmax = dd;
        idx = i;
      }
    }
    if (dmax > tol && idx > 0) return [...dp(a, idx, chain).slice(0, -1), ...dp(idx, b, chain)];
    return [chain[a], chain[b]];
  };
  const half1 = pts.slice(0, far + 1);
  const half2 = [...pts.slice(far), pts[0]];
  return [...dp(0, half1.length - 1, half1).slice(0, -1), ...dp(0, half2.length - 1, half2).slice(0, -1)];
}

/** Move each outline edge onto the centreline of the wall it runs along. */
function snapToWalls(poly: Vec[], d: Design, cell: number): Vec[] {
  const n = poly.length;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const dir = sub(b, a);
    const len = Math.hypot(dir.x, dir.y) || 1;
    const u = v(dir.x / len, dir.y / len);
    const mid = v((a.x + b.x) / 2, (a.y + b.y) / 2);
    let best: { p: Vec; u: Vec } | null = null;
    let bestErr = Infinity;
    for (const w of d.walls) {
      const f = wallFrame(w);
      if (f.length < 1 || Math.abs(u.x * f.u.y - u.y * f.u.x) > 0.06) continue;
      const off = Math.abs(dot(sub(mid, w.start), f.n)); // distance from the wall centreline
      const err = Math.abs(off - w.thickness / 2);
      const along = dot(sub(mid, w.start), f.u);
      if (err > cell * 2.5 || along < -w.thickness || along > f.length + w.thickness) continue;
      if (err < bestErr) {
        bestErr = err;
        best = { p: v(w.start.x, w.start.y), u: dot(u, f.u) >= 0 ? f.u : v(-f.u.x, -f.u.y) };
      }
    }
    return best ?? { p: mid, u };
  });
  return lines.map((l1, i) => {
    const l0 = lines[(i - 1 + n) % n];
    const den = l0.u.x * l1.u.y - l0.u.y * l1.u.x;
    if (Math.abs(den) < 1e-6) return poly[i];
    const w = sub(l1.p, l0.p);
    const t = (w.x * l1.u.y - w.y * l1.u.x) / den;
    return v(Math.round(l0.p.x + l0.u.x * t), Math.round(l0.p.y + l0.u.y * t));
  });
}

/** Outlines of spaces that don't already have a room drawn in them. */
export function newRoomOutlines(d: Design): Vec[][] {
  return detectRoomOutlines(d).filter((pts) => {
    const c = polygonCentroid(pts);
    return !d.rooms.some((r) => r.points.length >= 3 && pointInPolygon(c, r.points));
  });
}
