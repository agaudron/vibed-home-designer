import { blockAroundHouse, drivewayFromGarage, gardenOf, insertPoint, makeYards, newArea, pathFromFrontDoor, removePoint, toggleSharp, withBlockPoints } from './garden';
import { add, uid } from './geometry';
import { store } from './store';
import { groundOf, slopeLevels } from './terrain';
import type { SlopeDir } from './terrain';
import type { Block, Design, Garden, GardenArea, GardenAreaKind, GardenItem, SpotLevel, Terrain, Vec } from './types';

/** Garden designer actions (kept out of garden.ts, which the store uses to read saved files). */

const isGardenSel = (kind: string | undefined) => kind === 'block' || kind === 'garden-area' || kind === 'garden-item' || kind === 'garden-level';

export function openGarden() {
  store.set({ garden: true, electric: false, lightDemo: null, kitchen: null, hideCatalog: false, tool: { kind: 'select' }, selection: null });
  requestAnimationFrame(() => {
    store.emit('fit');
    store.emit('fit3d');
  });
}

export function closeGarden() {
  store.set({ garden: false, tool: { kind: 'select' }, ...(isGardenSel(store.state.selection?.kind) ? { selection: null } : {}) });
}

export function updateGarden(fn: (g: Garden, d: Design) => Garden, record = true) {
  store.update((d) => ({ ...d, garden: fn(gardenOf(d), d) }), record);
}

export function updateArea(id: string, fn: (a: GardenArea) => GardenArea) {
  updateGarden((g) => ({ ...g, areas: g.areas.map((a) => (a.id === id ? fn(a) : a)) }));
}

export function updateGardenItem(id: string, fn: (it: GardenItem) => GardenItem) {
  updateGarden((g) => ({ ...g, items: g.items.map((it) => (it.id === id ? fn(it) : it)) }));
}

export function updateBlock(fn: (b: Block) => Block) {
  updateGarden((g) => (g.block ? { ...g, block: fn(g.block) } : g));
}

/** Set out the block of land round the house. */
export function createBlock(shape: string, W: number, D: number) {
  const d = store.state.design;
  updateGarden((g) => ({ ...g, block: blockAroundHouse(d, shape, W, D) }));
  store.set({ selection: { kind: 'block', id: 'block' }, tool: { kind: 'select' } });
  requestAnimationFrame(() => store.emit('fit'));
}

/** Cut the block into front, back and side yards round the house (replacing any yards made before). */
export function generateYards() {
  const d = store.state.design;
  const g = gardenOf(d);
  if (!g.block) {
    store.flash('Set out the block of land first');
    return;
  }
  const yards = makeYards(d, g.block);
  // Keep the surface each yard had before.
  const old = new Map(g.areas.filter((a) => a.kind === 'yard').map((a) => [a.name, a]));
  const made: GardenArea[] = yards.map((y) => ({ ...y, id: uid('ga'), ...(old.get(y.name)?.surface ? { surface: old.get(y.name)!.surface } : {}) }));
  updateGarden((gg) => ({ ...gg, areas: [...made, ...gg.areas.filter((a) => a.kind !== 'yard')] }));
  store.flash(`Made ${made.length} yard${made.length === 1 ? '' : 's'}: ${made.map((y) => y.name.toLowerCase()).join(', ')}`);
}

export function addArea(kind: GardenAreaKind, points: Vec[], extra: Partial<GardenArea> = {}): string {
  const a = newArea(gardenOf(store.state.design), kind, points, extra);
  updateGarden((g) => ({ ...g, areas: [...g.areas, a] }));
  return a.id;
}

export function addDriveway() {
  const pts = drivewayFromGarage(store.state.design);
  if (!pts) {
    store.flash('Add a garage door to an outside wall first');
    return;
  }
  const id = addArea('driveway', pts);
  store.set({ selection: { kind: 'garden-area', id }, tool: { kind: 'select' } });
}

export function addFrontPath() {
  const pts = pathFromFrontDoor(store.state.design);
  if (!pts) {
    store.flash('Add a door to an outside wall first');
    return;
  }
  const id = addArea('path', pts);
  store.set({ selection: { kind: 'garden-area', id }, tool: { kind: 'select' } });
}

/** Ways of changing an outline (the block, or a garden area). */
export type OutlineEdit =
  | { op: 'move'; index: number; p: Vec }
  | { op: 'insert'; index: number; p: Vec }
  | { op: 'remove'; index: number }
  | { op: 'translate'; orig: Vec[]; delta: Vec }
  | { op: 'sharp'; index: number };

/** Change the outline of the block (id 'block') or a garden area. */
export function editOutline(d: Design, id: string, e: OutlineEdit): Design {
  const g = gardenOf(d);
  const round = (p: Vec) => ({ x: Math.round(p.x), y: Math.round(p.y) });
  if (id === 'block') {
    const b = g.block;
    if (!b) return d;
    let block = b;
    if (e.op === 'move') block = { ...b, points: b.points.map((q, i) => (i === e.index ? round(e.p) : q)) };
    else if (e.op === 'translate') block = { ...b, points: e.orig.map((q) => round(add(q, e.delta))) };
    else if (e.op === 'insert') block = withBlockPoints(b, insertPoint(b, e.index, e.p).points, e.index);
    else if (e.op === 'remove' && b.points.length > 3) block = withBlockPoints(b, removePoint(b, e.index).points, undefined, e.index);
    return { ...d, garden: { ...g, block } };
  }
  const areas = g.areas.map((a) => {
    if (a.id !== id) return a;
    switch (e.op) {
      case 'move':
        return { ...a, points: a.points.map((q, i) => (i === e.index ? round(e.p) : q)) };
      case 'translate':
        return { ...a, points: e.orig.map((q) => round(add(q, e.delta))) };
      case 'insert':
        return insertPoint(a, e.index, e.p);
      case 'remove':
        return removePoint(a, e.index);
      case 'sharp':
        return a.curved ? toggleSharp(a, e.index) : a;
    }
  });
  return { ...d, garden: { ...g, areas } };
}

/** Points of the block or an area (for snapping and dragging). */
export function outlinePointsOf(d: Design, id: string): Vec[] {
  const g = gardenOf(d);
  if (id === 'block') return g.block?.points ?? [];
  return g.areas.find((a) => a.id === id)?.points ?? [];
}

// ---------- land levels ----------

export function updateTerrain(fn: (t: Terrain) => Terrain, record = true) {
  updateGarden((g) => ({ ...g, terrain: fn(g.terrain ?? { levels: [] }) }), record);
}

export function updateLevel(id: string, fn: (l: SpotLevel) => SpotLevel) {
  updateTerrain((t) => ({ ...t, levels: t.levels.map((l) => (l.id === id ? fn(l) : l)) }));
}

/** A new spot level at p, at the height the ground already is there (so adding one doesn't change anything yet). */
export function newLevel(d: Design, p: Vec): SpotLevel {
  const z = groundOf(d)?.natural(p) ?? 0;
  return { id: uid('lv'), x: Math.round(p.x), y: Math.round(p.y), z: Math.round(z / 10) * 10 };
}

/** Replace the levels with an even slope across the block. */
export function applySlope(dir: SlopeDir, fall: number) {
  const d = store.state.design;
  const b = gardenOf(d).block;
  if (!b) {
    store.flash('Set out the block of land first');
    return;
  }
  updateTerrain((t) => ({ ...t, levels: slopeLevels(d, b, dir, fall) }));
  store.flash(`Levels set at the ${b.points.length} corners of the block: select one to change it`);
}

export function flattenLand() {
  updateTerrain((t) => ({ ...t, levels: [] }));
}
