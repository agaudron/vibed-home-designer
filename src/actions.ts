import { DOOR_DESIGNS, ITEM_MAP, OPENING_MAP } from './catalog';
import { add, clampOpeningOffset, mul, near, normAngle, projectOnSegment, uid, uncoveredParts, v, wallFrame } from './geometry';
import { defaultRoof, store } from './store';
import type { Design, Item, Opening, Room, Vec, Wall } from './types';

export function newWall(d: Design, a: Vec, b: Vec): Wall {
  return {
    id: uid('w'),
    start: { ...a },
    end: { ...b },
    thickness: d.settings.wallThickness,
    height: d.settings.wallHeight,
    color: d.settings.wallColor,
  };
}

export function addWalls(walls: Wall[], rooms: Room[] = []) {
  store.update((d) => ({ ...d, walls: [...d.walls, ...walls], rooms: [...d.rooms, ...rooms] }));
}

export function newItem(type: string, x: number, y: number, rotation: number): Item {
  const def = ITEM_MAP[type] ?? ITEM_MAP.box;
  return {
    id: uid('i'),
    type: def.type,
    name: def.name,
    x,
    y,
    rotation,
    width: def.width,
    depth: def.depth,
    height: def.height,
    elevation: def.elevation ?? 0,
    color: def.color,
  };
}

export function newOpening(catalogId: string, wall: Wall, offset: number): Opening {
  const def = OPENING_MAP[catalogId];
  const o: Opening = {
    id: uid('o'),
    wallId: wall.id,
    kind: def.kind,
    offset,
    width: def.width,
    height: Math.min(DOOR_KINDS.has(def.kind) ? store.state.design.settings.doorHeight : def.height, wall.height - def.sill),
    sill: def.sill,
    hingeEnd: false,
    flip: false,
    color: def.color,
    ...(def.style ? { style: def.style } : {}),
    ...(def.panels ? { panels: def.panels, panelWidth: def.panelWidth } : {}),
    ...(def.design ? { design: def.design, glass: (DOOR_DESIGNS[def.design]?.glassTypes?.[0] as Opening['glass']) ?? 'translucent' } : {}),
  };
  o.offset = clampOpeningOffset(o, wallFrame(wall).length);
  return o;
}

export function nextRoomName(d: Design) {
  let n = d.rooms.length + 1;
  while (d.rooms.some((r) => r.name === `Room ${n}`)) n++;
  return `Room ${n}`;
}

export function newRoom(d: Design, points: Vec[]): Room {
  return { id: uid('r'), name: nextRoomName(d), points: points.map((p) => ({ ...p })), floor: null, color: null };
}

export function deleteSelection() {
  const s = store.state.selection;
  if (!s) return;
  store.update((d) => {
    switch (s.kind) {
      case 'wall':
        return {
          ...d,
          walls: d.walls.filter((w) => w.id !== s.id),
          openings: d.openings.filter((o) => o.wallId !== s.id),
        };
      case 'opening':
        return { ...d, openings: d.openings.filter((o) => o.id !== s.id) };
      case 'item':
        return { ...d, items: d.items.filter((i) => i.id !== s.id) };
      case 'room':
        return { ...d, rooms: d.rooms.filter((r) => r.id !== s.id) };
      case 'dimension':
        return { ...d, dimensions: d.dimensions.filter((m) => m.id !== s.id) };
      case 'roof':
        return { ...d, roof: null };
      case 'facade':
        return d;
    }
  });
  store.select(null);
}

export function duplicateSelection() {
  const s = store.state.selection;
  if (!s) return;
  const d = store.state.design;
  const off = v(300, 300);
  if (s.kind === 'item') {
    const it = d.items.find((i) => i.id === s.id);
    if (!it) return;
    const copy = { ...it, id: uid('i'), x: it.x + off.x, y: it.y + off.y };
    store.update((dd) => ({ ...dd, items: [...dd.items, copy] }));
    store.select({ kind: 'item', id: copy.id });
  } else if (s.kind === 'wall') {
    const w = d.walls.find((x) => x.id === s.id);
    if (!w) return;
    const copy = { ...w, id: uid('w'), start: add(w.start, off), end: add(w.end, off) };
    store.update((dd) => ({ ...dd, walls: [...dd.walls, copy] }));
    store.select({ kind: 'wall', id: copy.id });
  } else if (s.kind === 'opening') {
    const o = d.openings.find((x) => x.id === s.id);
    const w = o && d.walls.find((x) => x.id === o.wallId);
    if (!o || !w) return;
    const copy = { ...o, id: uid('o'), offset: clampOpeningOffset({ ...o, offset: o.offset + o.width + 200 }, wallFrame(w).length) };
    store.update((dd) => ({ ...dd, openings: [...dd.openings, copy] }));
    store.select({ kind: 'opening', id: copy.id });
  } else if (s.kind === 'room') {
    const r = d.rooms.find((x) => x.id === s.id);
    if (!r) return;
    const copy = { ...r, id: uid('r'), name: `${r.name} copy`, points: r.points.map((p) => add(p, off)) };
    store.update((dd) => ({ ...dd, rooms: [...dd.rooms, copy] }));
    store.select({ kind: 'room', id: copy.id });
  }
}

export function rotateSelection(by: number) {
  const s = store.state.selection;
  if (!s || s.kind !== 'item') return;
  store.update((d) => ({
    ...d,
    items: d.items.map((i) => (i.id === s.id ? { ...i, rotation: normAngle(i.rotation + by) } : i)),
  }));
}

export function nudgeSelection(dx: number, dy: number) {
  const s = store.state.selection;
  if (!s) return;
  const dv = v(dx, dy);
  store.update((d) => {
    if (s.kind === 'item') return { ...d, items: d.items.map((i) => (i.id === s.id ? { ...i, x: i.x + dx, y: i.y + dy } : i)) };
    if (s.kind === 'room') return { ...d, rooms: d.rooms.map((r) => (r.id === s.id ? { ...r, points: r.points.map((p) => add(p, dv)) } : r)) };
    if (s.kind === 'dimension')
      return { ...d, dimensions: d.dimensions.map((m) => (m.id === s.id ? { ...m, a: add(m.a, dv), b: add(m.b, dv) } : m)) };
    if (s.kind === 'wall') {
      const w = d.walls.find((x) => x.id === s.id);
      if (!w) return d;
      return moveWallPoints(d, wallMovePoints(d, w), dv);
    }
    if (s.kind === 'opening') {
      // Doors and windows slide along their wall (the arrow pointing most along the wall moves them).
      const o = d.openings.find((x) => x.id === s.id);
      const w = o && d.walls.find((x) => x.id === o.wallId);
      if (!o || !w) return d;
      const f = wallFrame(w);
      const along = dx * f.u.x + dy * f.u.y;
      if (Math.abs(along) < 0.3 * Math.hypot(dx, dy)) return d; // arrow across the wall: nothing to do
      const step = Math.sign(along) * Math.hypot(dx, dy);
      return { ...d, openings: d.openings.map((x) => (x.id === o.id ? { ...x, offset: clampOpeningOffset({ ...x, offset: x.offset + step }, f.length) } : x)) };
    }
    return d;
  });
}

/** Points that should travel with a wall when it moves: its ends plus other walls' ends that meet it mid-span (T-junctions). */
export function wallMovePoints(d: Design, w: Wall): Vec[] {
  const pts = [w.start, w.end];
  for (const o of d.walls) {
    if (o.id === w.id) continue;
    for (const p of [o.start, o.end]) {
      if (near(p, w.start) || near(p, w.end)) continue;
      const pr = projectOnSegment(p, w.start, w.end);
      if (pr.dist < 1 && pr.t > 0 && pr.t < 1) pts.push(p);
    }
  }
  return pts;
}

/**
 * Move the given points (and anything joined to them: wall endpoints, room vertices) by delta.
 * The wall with id `wallId` has both ends moved when they match.
 */
export function moveWallPoints(d: Design, pts: Vec[], delta: Vec, _wallId?: string): Design {
  const shift = (p: Vec) => (pts.some((q) => near(p, q, 1)) ? add(p, delta) : p);
  return {
    ...d,
    walls: d.walls.map((w) => {
      const s = shift(w.start);
      const e = shift(w.end);
      return s === w.start && e === w.end ? w : { ...w, start: s, end: e };
    }),
    rooms: d.rooms.map((r) => {
      const points = r.points.map(shift);
      return points.some((p, i) => p !== r.points[i]) ? { ...r, points } : r;
    }),
  };
}

/** Change a wall's length by moving its end point (and anything attached to it). */
export function setWallLength(id: string, length: number) {
  const w = store.state.design.walls.find((x) => x.id === id);
  if (!w || !(length > 0)) return;
  const f = wallFrame(w);
  const target = add(w.start, { x: f.u.x * length, y: f.u.y * length });
  const delta = { x: target.x - w.end.x, y: target.y - w.end.y };
  store.update((d) => moveWallPoints(d, [w.end], delta));
}

/** Split a wall into two at its midpoint, keeping openings on the correct half. */
export function splitWall(id: string) {
  const d = store.state.design;
  const w = d.walls.find((x) => x.id === id);
  if (!w) return;
  const f = wallFrame(w);
  const half = f.length / 2;
  const mid = add(w.start, { x: f.u.x * half, y: f.u.y * half });
  const a: Wall = { ...w, id: uid('w'), end: { x: Math.round(mid.x), y: Math.round(mid.y) } };
  const b: Wall = { ...w, id: uid('w'), start: { ...a.end } };
  store.update((dd) => ({
    ...dd,
    walls: [...dd.walls.filter((x) => x.id !== id), a, b],
    openings: dd.openings.map((o) => {
      if (o.wallId !== id) return o;
      return o.offset < half ? { ...o, wallId: a.id } : { ...o, wallId: b.id, offset: o.offset - half };
    }),
  }));
  store.select({ kind: 'wall', id: a.id });
}

/** Move a wall (and anything joined to it) so the clear gap on one side becomes `newGap`. */
export function setWallGap(id: string, side: 1 | -1, currentGap: number, newGap: number) {
  const w = store.state.design.walls.find((x) => x.id === id);
  if (!w || !(newGap > 0)) return;
  const { n } = wallFrame(w);
  const k = side * (currentGap - newGap);
  const delta = { x: Math.round(n.x * k * 100) / 100, y: Math.round(n.y * k * 100) / 100 };
  store.update((d) => moveWallPoints(d, wallMovePoints(d, w), delta));
}

/** Add an automatically generated roof (or select the existing one) and make sure it's visible in 3D. */
export function addOrSelectRoof() {
  const added = !store.state.design.roof;
  if (added) store.update((d) => ({ ...d, roof: defaultRoof() }));
  store.set({ showRoof: true, cutaway: false, tool: { kind: 'select' } });
  store.select({ kind: 'roof', id: 'roof' });
  if (added) requestAnimationFrame(() => store.emit('fit3d'));
}

const DOOR_KINDS = new Set(['door', 'double_door', 'cavity_door']);

/**
 * Global settings. Walls/doors that still use the previous general value follow the change; ones you've set
 * to something different (e.g. a half-height wall) are left alone unless `all` is true.
 */
export function setGlobalWallHeight(height: number, all = false) {
  store.update((d) => {
    const prev = d.settings.wallHeight;
    const walls = d.walls.map((w) => (all || Math.abs(w.height - prev) < 0.5 ? { ...w, height } : w));
    // Keep doors and windows inside their walls.
    const byId = new Map(walls.map((w) => [w.id, w]));
    const openings = d.openings.map((o) => {
      const w = byId.get(o.wallId);
      return w && o.sill + o.height > w.height ? { ...o, height: Math.max(100, w.height - o.sill) } : o;
    });
    return { ...d, walls, openings, settings: { ...d.settings, wallHeight: height } };
  });
}

export function setGlobalWallColor(color: string, all = false) {
  store.update((d) => {
    const prev = d.settings.wallColor.toLowerCase();
    return {
      ...d,
      walls: d.walls.map((w) => {
        // Faces painted their own colour keep it, unless they used the old general colour (or it's "apply to all").
        const side = (c?: string) => (c === undefined ? undefined : all || c.toLowerCase() === prev ? color : c);
        const sideColor = w.sideColor ? { pos: side(w.sideColor.pos), neg: side(w.sideColor.neg) } : undefined;
        const next = all || w.color.toLowerCase() === prev ? { ...w, color } : w;
        return sideColor ? { ...next, sideColor } : next;
      }),
      settings: { ...d.settings, wallColor: color },
    };
  });
}

export function setGlobalDoorHeight(height: number, all = false) {
  store.update((d) => {
    const prev = d.settings.doorHeight;
    const walls = new Map(d.walls.map((w) => [w.id, w]));
    return {
      ...d,
      openings: d.openings.map((o) => {
        if (!DOOR_KINDS.has(o.kind) || !(all || Math.abs(o.height - prev) < 0.5)) return o;
        const w = walls.get(o.wallId);
        return { ...o, height: Math.min(height, (w?.height ?? height) - o.sill) };
      }),
      settings: { ...d.settings, doorHeight: height },
    };
  });
}

export function isDoorKind(kind: string) {
  return DOOR_KINDS.has(kind);
}

/**
 * Straighten walls that are slightly out of square (within a few degrees), by lining up the corners they
 * connect. Corners shared between walls, T-junctions and room corners all stay joined. Returns the number of
 * walls changed.
 */
export function squareUpWalls(toleranceDeg = 3): number {
  const d = store.state.design;
  const walls = d.walls.filter((w) => wallFrame(w).length > 1);
  if (!walls.length) return 0;
  const quarter = Math.PI / 2;
  const longest = walls.reduce((a, b) => (wallFrame(b).length > wallFrame(a).length ? b : a));
  const la = wallFrame(longest).angle;
  const th = la - Math.floor(la / quarter) * quarter; // the building's main axis
  const toL = (p: Vec) => rotate(p, -th);
  const toW = (p: Vec) => rotate(p, th);

  // Corner points (merged when within 2 mm), in the building's frame.
  const nodes: Vec[] = [];
  const find = (p: Vec) => {
    const l = toL(p);
    return nodes.findIndex((q) => Math.hypot(q.x - l.x, q.y - l.y) < 2);
  };
  const nodeOf = (p: Vec) => {
    let i = find(p);
    if (i < 0) {
      nodes.push(toL(p));
      i = nodes.length - 1;
    }
    return i;
  };
  const ends = walls.map((w) => [nodeOf(w.start), nodeOf(w.end)]);

  const uf = (n: number) => {
    const parent = Array.from({ length: n }, (_, i) => i);
    const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    return { root, union: (a: number, b: number) => void (parent[root(a)] = root(b)) };
  };
  const sameX = uf(nodes.length);
  const sameY = uf(nodes.length);
  const tol = (toleranceDeg * Math.PI) / 180;
  const axis = walls.map((w) => {
    const a = wallFrame(w).angle - th;
    const m = ((a % quarter) + quarter) % quarter;
    if (Math.min(m, quarter - m) >= tol) return null; // genuinely angled: leave it
    return Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? 'h' : 'v';
  });
  walls.forEach((w, i) => {
    if (axis[i] === 'h') sameY.union(ends[i][0], ends[i][1]);
    if (axis[i] === 'v') sameX.union(ends[i][0], ends[i][1]);
  });
  // T-junctions: a corner sitting on the middle of a wall stays on that wall's line.
  nodes.forEach((n, p) => {
    const wp = toW(n);
    walls.forEach((w, i) => {
      if (!axis[i] || ends[i].includes(p)) return;
      const pr = projectOnSegment(wp, w.start, w.end);
      if (pr.dist < w.thickness / 2 + 1 && pr.t > 0 && pr.t < 1) (axis[i] === 'h' ? sameY : sameX).union(p, ends[i][0]);
    });
  });

  const avg = (u: ReturnType<typeof uf>, key: 'x' | 'y') => {
    const sum = new Map<number, [number, number]>();
    nodes.forEach((n, i) => {
      const r = u.root(i);
      const s = sum.get(r) ?? [0, 0];
      sum.set(r, [s[0] + n[key], s[1] + 1]);
    });
    return (i: number) => {
      const [t, c] = sum.get(u.root(i))!;
      const val = t / c;
      return th === 0 ? Math.round(val) : val;
    };
  };
  const xOf = avg(sameX, 'x');
  const yOf = avg(sameY, 'y');
  const moved = nodes.map((_, i) => toW(v(xOf(i), yOf(i))));
  const at = (p: Vec) => {
    const i = find(p);
    return i < 0 ? p : { x: Math.round(moved[i].x * 100) / 100, y: Math.round(moved[i].y * 100) / 100 };
  };

  let changed = 0;
  const newWalls = d.walls.map((w) => {
    const s = at(w.start);
    const e = at(w.end);
    if (Math.hypot(s.x - w.start.x, s.y - w.start.y) < 0.01 && Math.hypot(e.x - w.end.x, e.y - w.end.y) < 0.01) return w;
    changed++;
    return { ...w, start: s, end: e };
  });
  if (!changed) return 0;
  store.update((dd) => ({
    ...dd,
    walls: newWalls,
    rooms: dd.rooms.map((r) => ({ ...r, points: r.points.map(at) })),
  }));
  return changed;
}

function rotate(p: Vec, r: number): Vec {
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export function squareUpWallsWithMessage() {
  const n = squareUpWalls();
  store.flash(n ? `Squared up ${n} wall${n === 1 ? '' : 's'}` : 'All walls are already square');
}

/** Raise/lower the selected item (height off the floor) or window (sill height). */
export function raiseSelection(by: number) {
  const s = store.state.selection;
  if (!s) return;
  store.update((d) => {
    if (s.kind === 'item') return { ...d, items: d.items.map((i) => (i.id === s.id ? { ...i, elevation: Math.max(0, i.elevation + by) } : i)) };
    if (s.kind === 'opening') {
      return {
        ...d,
        openings: d.openings.map((o) => {
          if (o.id !== s.id || o.kind !== 'window') return o;
          const w = d.walls.find((x) => x.id === o.wallId);
          return { ...o, sill: Math.min(Math.max(0, o.sill + by), Math.max(0, (w?.height ?? Infinity) - o.height)) };
        }),
      };
    }
    return d;
  });
}

/** Create rooms for every enclosed space that doesn't have one yet. */
export function detectRoomsWithMessage() {
  // Imported lazily to keep the room detector out of the hot path of other actions.
  import('./rooms').then(({ newRoomOutlines }) => {
    const outlines = newRoomOutlines(store.state.design);
    if (!outlines.length) {
      store.flash(store.state.design.walls.length ? 'No new rooms found — every enclosed space already has a room' : 'Draw some walls first');
      return;
    }
    store.update((d) => {
      const rooms = [...d.rooms];
      for (const pts of outlines) rooms.push(newRoom({ ...d, rooms }, pts));
      return { ...d, rooms };
    });
    store.flash(`Added ${outlines.length} room${outlines.length === 1 ? '' : 's'} — select one to name it and set its finishes`);
  });
}

/** Walls lying entirely on top of another wall (e.g. drawn twice). */
export function duplicateWalls(d: Design): Wall[] {
  const dup: Wall[] = [];
  // Remove copies without doors/windows first, so the wall that has them is the one kept.
  const hasOpenings = (w: Wall) => d.openings.some((o) => o.wallId === w.id);
  const order = [...d.walls].sort((a, b) => Number(hasOpenings(a)) - Number(hasOpenings(b)));
  for (const w of order) {
    const others = d.walls.filter((o) => o.id !== w.id && !dup.some((x) => x.id === o.id));
    if (wallFrame(w).length > 1 && uncoveredParts(others, w.start, w.end).length === 0) dup.push(w);
  }
  return dup;
}

/** Remove doubled-up walls, moving their doors and windows onto the wall underneath. */
export function removeDuplicateWallsWithMessage() {
  const d = store.state.design;
  const dup = duplicateWalls(d);
  if (!dup.length) {
    store.flash('No doubled-up walls found');
    return;
  }
  const ids = new Set(dup.map((w) => w.id));
  const keep = d.walls.filter((w) => !ids.has(w.id));
  const openings = d.openings.map((o) => {
    if (!ids.has(o.wallId)) return o;
    const host = d.walls.find((w) => w.id === o.wallId)!;
    const fh = wallFrame(host);
    const centre = add(host.start, mul(fh.u, clampOpeningOffset(o, fh.length)));
    const target = keep.find((w) => projectOnSegment(centre, w.start, w.end).dist < Math.max(6, w.thickness / 2));
    if (!target) return o;
    return { ...o, wallId: target.id, offset: projectOnSegment(centre, target.start, target.end).along };
  });
  store.update((dd) => ({ ...dd, walls: keep, openings: openings.filter((o) => keep.some((w) => w.id === o.wallId)) }));
  store.flash(`Removed ${dup.length} doubled-up wall${dup.length === 1 ? '' : 's'}`);
}
