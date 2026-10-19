import type { ReactNode } from 'react';
import { exteriorSides } from '../facade';
import { add, deg, dot, formatMm, itemCorners, mul, pointInPolygon, projectOnSegment, rot, v, wallFrame } from '../geometry';
import type { Design, Vec } from '../types';

/**
 * Outside dimension strings, as on architectural plans: along each side of the house, a line broken at every wall
 * that meets that side, so it reads each room's internal size (with its name) and each wall's thickness, with the
 * overall size on a line further out. Wardrobes and linen cupboards built in against a room's side wall get their
 * own span, like a built-in robe on a drawing. Worked out in the building's own frame (lined up with its longest outside wall), from walls
 * that are square to it.
 */

export interface DimString {
  /** Outward direction of this side, along it, and the point on the outermost wall face where `along` = 0 (world). */
  n: Vec;
  u: Vec;
  o: Vec;
  /** Break points along the side (mm from `o`); what each span between them is, and its name (room, robe…). */
  marks: number[];
  kinds: SpanKind[];
  names: (string | null)[];
  /** How far in from `o`'s line each mark's wall face is (stepped sides), for the extension lines. */
  depth: number[];
}

export type SpanKind = 'wall' | 'room' | 'robe';

const SIDES = [v(0, -1), v(0, 1), v(-1, 0), v(1, 0)];
/** Built-in storage that gets its own span: wardrobes and linen cupboards. */
const STORAGE: Record<string, string> = { wardrobe: 'Robe', wardrobe_hinged: 'Robe', linen: 'Linen' };

export function outsideDimensions(d: Design): DimString[] {
  const sides = exteriorSides(d.walls).map;
  const ext = d.walls.filter((w) => {
    const s = sides.get(w.id);
    return wallFrame(w).length > 1 && (s?.pos || s?.neg) && !(s.pos && s.neg);
  });
  if (!ext.length) return [];
  // The building's frame: square to its longest outside wall.
  const longest = ext.reduce((a, b) => (wallFrame(b).length > wallFrame(a).length ? b : a));
  const q = Math.PI / 2;
  const la = wallFrame(longest).angle;
  const th = la - Math.floor(la / q) * q;
  const L = (p: Vec) => rot(p, -th);
  const local = d.walls
    .map((w) => {
      const a = L(w.start);
      const b = L(w.end);
      const along = Math.abs(a.y - b.y) < 1 ? 'x' : Math.abs(a.x - b.x) < 1 ? 'y' : null;
      const s = sides.get(w.id);
      const n = wallFrame(w).n;
      const out = s?.pos && !s.neg ? L(n) : s?.neg && !s.pos ? L(mul(n, -1)) : null;
      return { w, a, b, along, out, t: w.thickness };
    })
    .filter((x) => x.along && wallFrame(x.w).length > 1);

  const out: DimString[] = [];
  for (const s of SIDES) {
    const axis = s.x === 0 ? v(1, 0) : v(0, 1); // along this side
    const facing = local.filter((x) => x.out && dot(x.out, s) > 0.99);
    if (!facing.length) continue;
    const perp = local.filter((x) => x.along === (s.x === 0 ? 'y' : 'x'));
    const spans: [number, number][] = [];
    const faces: number[] = []; // outer face (along s) of the facing wall each span meets
    for (const p of perp) {
      // Walls that meet this side: an end on one of the walls facing this way.
      let face = -Infinity;
      for (const e of [p.a, p.b])
        for (const f of facing) {
          const pr = projectOnSegment(e, f.a, f.b);
          if (pr.dist <= f.t / 2 + 2 && pr.t > -0.02 && pr.t < 1.02) face = Math.max(face, dot(f.a, s) + f.t / 2);
        }
      if (face === -Infinity) continue;
      const c = dot(p.a, axis);
      spans.push([c - p.t / 2, c + p.t / 2]);
      faces.push(face);
    }
    if (spans.length < 2) continue;
    const base: number[] = [];
    for (const x of spans.flat().sort((a, b) => a - b)) if (!base.length || x - base[base.length - 1] > 2) base.push(x);
    const outer = Math.max(...facing.map((f) => dot(f.a, s) + f.t / 2));
    // The wall facing this way at a point along the side (its inner and outer faces, along s).
    const facingAt = (x: number) =>
      facing.find((f) => {
        const [lo, hi] = [dot(f.a, axis), dot(f.b, axis)].sort((p, q) => p - q);
        return x >= lo - f.t / 2 && x <= hi + f.t / 2;
      });
    const W = (p: Vec) => rot(p, th);
    const pieces: { a: number; b: number; kind: SpanKind; name: string | null }[] = [];
    base.slice(1).forEach((b, i) => {
      const a = base[i];
      const mid = (a + b) / 2;
      if (spans.some(([s0, s1]) => mid > s0 && mid < s1)) {
        pieces.push({ a, b, kind: 'wall', name: null });
        return;
      }
      // The room just inside the wall here, and any wardrobe / linen cupboard built in against one of its sides.
      const f = facingAt(mid);
      const inner = f ? dot(f.a, s) - f.t / 2 : outer;
      const room = d.rooms.find((r) => pointInPolygon(W(add(mul(axis, mid), mul(s, inner - 300))), r.points)) ?? null;
      let cuts: { a: number; b: number; name: string }[] = [];
      if (room)
        for (const it of d.items) {
          const name = STORAGE[it.type];
          if (!name || !pointInPolygon(v(it.x, it.y), room.points)) continue;
          const xs = itemCorners(it).map((c) => dot(L(c), axis));
          const r0 = Math.max(a, Math.min(...xs));
          const r1 = Math.min(b, Math.max(...xs));
          const flush = Math.abs(r0 - a) <= 40 || Math.abs(r1 - b) <= 40;
          if (flush && r1 - r0 > 100 && r1 - r0 < b - a - 100) cuts.push({ a: Math.abs(r0 - a) <= 40 ? a : r0, b: Math.abs(r1 - b) <= 40 ? b : r1, name });
        }
      cuts = cuts.sort((p, q) => p.a - q.a).filter((c, k, arr) => !k || c.a >= arr[k - 1].b - 1); // no overlaps
      let at = a;
      for (const c of cuts) {
        if (c.a - at > 1) pieces.push({ a: at, b: c.a, kind: 'room', name: room?.name ?? null });
        pieces.push({ a: c.a, b: c.b, kind: 'robe', name: c.name });
        at = c.b;
      }
      if (b - at > 1) pieces.push({ a: at, b, kind: 'room', name: room?.name ?? null });
    });
    const marks = [...pieces.map((p) => p.a), pieces[pieces.length - 1].b];
    const depth = marks.map((x) => {
      const wallFace = Math.max(...spans.map((sp, i) => (x >= sp[0] - 2 && x <= sp[1] + 2 ? faces[i] : -Infinity)));
      const f = facingAt(x);
      return outer - (wallFace > -Infinity ? wallFace : f ? dot(f.a, s) + f.t / 2 : outer);
    });
    out.push({ n: rot(s, th), u: rot(axis, th), o: rot(mul(s, outer), th), marks, kinds: pieces.map((p) => p.kind), names: pieces.map((p) => p.name), depth });
  }
  return out;
}

/** Draw the strings: room sizes (and wall thicknesses) on the inner line, the overall size outside it. */
export function OutsideDims({ strings, px, showWalls }: { strings: DimString[]; px: (n: number) => number; showWalls: boolean }) {
  const fs = px(10.5);
  const els: ReactNode[] = [];
  strings.forEach((st, si) => {
    const P = (along: number, off: number) => add(add(st.o, mul(st.u, along)), mul(st.n, off));
    let ang = deg(Math.atan2(st.u.y, st.u.x));
    if (ang > 90.01 || ang < -89.99) ang += 180;
    const line = (a: number, b: number, off: number, key: string) => {
      const p = P(a, off);
      const q = P(b, off);
      return <line key={key} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
    };
    // Architectural ticks: short slashes across the line at each break.
    const tick = (at: number, off: number, key: string) => {
      const c = P(at, off);
      const k = mul(add(st.u, st.n), px(4));
      return <line key={key} x1={c.x - k.x} y1={c.y - k.y} x2={c.x + k.x} y2={c.y + k.y} className="tick" />;
    };
    const text = (at: number, off: number, label: string, key: string, cls?: string) => {
      const c = P(at, off);
      return (
        <text key={key} x={c.x} y={c.y} fontSize={cls ? fs * 0.85 : fs} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${ang} ${c.x} ${c.y})`} className={cls}>
          {label}
        </text>
      );
    };
    const inner = px(34);
    const overall = px(60);
    const m = st.marks;
    const first = m[0];
    const last = m[m.length - 1];
    // Extension lines from the walls out to the overall line.
    m.forEach((x, i) => {
      const a = P(x, px(6) - st.depth[i]);
      const b = P(x, (i === 0 || i === m.length - 1 ? overall : inner) + px(4));
      els.push(<line key={`e${si}-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="ext" />);
    });
    els.push(line(first, last, inner, `l${si}`), line(first, last, overall, `o${si}`));
    m.forEach((x, i) => els.push(tick(x, inner, `t${si}-${i}`)));
    els.push(tick(first, overall, `to${si}a`), tick(last, overall, `to${si}b`));
    let stagger = 0;
    m.slice(1).forEach((b, i) => {
      const a = m[i];
      const len = b - a;
      const kind = st.kinds[i];
      if (kind === 'wall' && !showWalls) return;
      const label = formatMm(len);
      // Labels that don't fit their span alternate between two rows so neighbours don't collide.
      const fits = len > label.length * fs * 0.62 + px(6);
      const off = inner - px(8) - (!fits && stagger++ % 2 ? px(11) : 0);
      els.push(text((a + b) / 2, off, label, `s${si}-${i}`, kind === 'wall' ? 'wall-t' : kind === 'robe' ? 'robe-t' : undefined));
      // The room's (or robe's) name under its size, where it fits.
      const name = st.names[i];
      if (name && fits && len > name.length * fs * 0.85 * 0.58 + px(6)) els.push(text((a + b) / 2, inner - px(20), name, `n${si}-${i}`, 'name-t'));
    });
    els.push(text((first + last) / 2, overall - px(8), formatMm(last - first), `ov${si}`));
  });
  return <g className="outside-dims">{els}</g>;
}

