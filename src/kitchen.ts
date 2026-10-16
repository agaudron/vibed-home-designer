import { KABOODLE_BENCHTOPS, KABOODLE_DOORS, KABOODLE_HANDLES } from './kaboodle';
import type { KaboodleBenchtop, KaboodleClass, KaboodleDoor, KaboodleHandle, KaboodleProduct } from './kaboodle';
import { pointInPolygon, rad } from './geometry';
import { store } from './store';
import { KB_LEGS } from './three/builders';
import type { Design, Item, KitchenStyle, Room } from './types';

/**
 * Kitchen designer: a room's Kaboodle style (door colour, benchtop, handles) and the Kaboodle units in it.
 * Units are ordinary items of type 'kaboodle'; which product they are and how they're finished is kept in their
 * options, so they draw and save on their own. Changing the kitchen's style restyles every unit in the room.
 */

export const isKitchenRoom = (r: Room) => /kitchen/i.test(r.name);

/** Floor units that sit under the benchtop (their height includes the legs and benchtop). */
const UNDER_BENCH: KaboodleClass[] = ['base', 'drawer', 'sink', 'cooktop', 'corner', 'dishwasher'];
export const isUnderBench = (cls: string) => (UNDER_BENCH as string[]).includes(cls);

export const CLASS_NAMES: Record<KaboodleClass, string> = {
  base: 'Base cabinets',
  drawer: 'Drawer units',
  sink: 'Sink cabinets',
  cooktop: 'Cooktop & oven',
  corner: 'Corner cabinets',
  dishwasher: 'Dishwasher',
  wall: 'Wall cabinets',
  wall_corner: 'Wall corner cabinets',
  rangehood: 'Rangehood cabinets',
  tall: 'Pantry & tall',
  oven_tower: 'Oven towers',
  fridge: 'Over-fridge',
  panel: 'Panels & fillers',
  kickboard: 'Kickboards',
  benchtop: 'Benchtops',
};

const byName = <T extends { name: string }>(list: T[], name: string | undefined, fallback: (l: T[]) => T | undefined): T | undefined =>
  list.find((x) => x.name === name) ?? fallback(list);

export function defaultKitchenStyle(): KitchenStyle {
  const door = KABOODLE_DOORS.find((x) => /white/i.test(x.name)) ?? KABOODLE_DOORS[0];
  const bench = KABOODLE_BENCHTOPS.find((x) => x.name === 'Alabaster') ?? KABOODLE_BENCHTOPS.find((x) => /stone/i.test(x.material)) ?? KABOODLE_BENCHTOPS[0];
  const handle = KABOODLE_HANDLES.find((x) => x.style === 'bar') ?? KABOODLE_HANDLES[0];
  return { door: door?.name ?? '', benchtop: bench?.name ?? '', handle: handle?.name ?? '' };
}

export function kitchenStyle(r: Room | undefined): KitchenStyle {
  return { ...defaultKitchenStyle(), ...r?.kitchen };
}

export interface StyleParts {
  door?: KaboodleDoor;
  bench?: KaboodleBenchtop;
  handle?: KaboodleHandle;
}

export function styleParts(s: KitchenStyle): StyleParts {
  return {
    door: byName(KABOODLE_DOORS, s.door, (l) => l[0]),
    bench: byName(KABOODLE_BENCHTOPS, s.benchtop, (l) => l[0]),
    handle: byName(KABOODLE_HANDLES, s.handle, (l) => l[0]),
  };
}

/** How a unit is finished, as stored in its options (read by the 3D builder). */
function finishOptions(s: KitchenStyle): Record<string, string | number> {
  const { door, bench, handle } = styleParts(s);
  return {
    door: door?.name ?? '',
    doorStyle: door?.style ?? 'flat',
    bench: bench?.hex ?? '#e7e3dc',
    benchName: bench?.name ?? '',
    benchT: bench?.thickness ?? 33,
    handle: handle?.style ?? 'bar',
    handleHex: handle?.hex ?? '#b8bcc0',
    handleName: handle?.name ?? '',
    handleLen: handle?.length ?? 160,
  };
}

/** The new item for placing a Kaboodle product, finished in the kitchen's style. */
export function kaboodlePreset(p: KaboodleProduct, s: KitchenStyle): Partial<Item> {
  const fin = finishOptions(s);
  const { door, bench } = styleParts(s);
  const under = isUnderBench(p.cls);
  const benchT = Number(fin.benchT);
  // Full-height units stand on the legs; inserts like the microwave box sit up in a tower at their own height.
  const standing = (p.cls === 'tall' || p.cls === 'oven_tower') && p.height >= 1500;
  return {
    type: 'kaboodle',
    name: p.name,
    width: p.width,
    // Under-bench units carry their benchtop, which overhangs the doors by 20 mm. A farmhouse sink cabinet is
    // shorter (the sink's apron makes up the rest), so it's drawn to bench height like the others.
    depth: under ? p.depth + 20 : p.depth,
    height: under ? KB_LEGS + Math.max(p.height, 720) + benchT : standing ? KB_LEGS + p.height : p.cls === 'benchtop' ? benchT : p.height,
    elevation: under || standing ? 0 : p.elevation,
    color: p.cls === 'benchtop' ? (bench?.hex ?? '#e7e3dc') : (door?.hex ?? '#f4f4f2'),
    options: {
      cls: p.cls,
      product: p.name,
      code: p.code,
      url: p.url,
      doors: p.doors,
      drawers: p.drawers,
      ...fin,
    },
  };
}

/** Kaboodle units standing in this room. */
export function kitchenItems(d: Design, r: Room): Item[] {
  return d.items.filter((it) => it.type === 'kaboodle' && r.points.length >= 3 && pointInPolygon({ x: it.x, y: it.y }, r.points));
}

/** Restyle a unit (keeping which product it is). Under-bench units change height with the benchtop thickness. */
export function restyle(it: Item, s: KitchenStyle): Item {
  const o = it.options ?? {};
  const fin = finishOptions(s);
  const { door, bench } = styleParts(s);
  const cls = String(o.cls ?? 'base');
  let height = it.height;
  if (isUnderBench(cls)) height = it.height - Number(o.benchT ?? 33) + Number(fin.benchT);
  if (cls === 'benchtop') height = Number(fin.benchT);
  return { ...it, height, color: cls === 'benchtop' ? (bench?.hex ?? it.color) : (door?.hex ?? it.color), options: { ...o, ...fin } };
}

/** Change the kitchen's style and restyle every Kaboodle unit in it. */
export function setKitchenStyle(roomId: string, patch: Partial<KitchenStyle>) {
  store.update((d) => {
    const r = d.rooms.find((x) => x.id === roomId);
    if (!r) return d;
    const s = { ...kitchenStyle(r), ...patch };
    const inRoom = new Set(kitchenItems(d, r).map((i) => i.id));
    return {
      ...d,
      rooms: d.rooms.map((x) => (x.id === roomId ? { ...x, kitchen: s } : x)),
      items: d.items.map((i) => (inRoom.has(i.id) ? restyle(i, s) : i)),
    };
  });
}

/** Swap a placed unit for another product of the same kind, keeping its back where it was. */
export function swapProduct(itemId: string, p: KaboodleProduct, s: KitchenStyle) {
  store.update((d) => ({
    ...d,
    items: d.items.map((it) => {
      if (it.id !== itemId) return it;
      const next = kaboodlePreset(p, s);
      const dd = ((next.depth ?? it.depth) - it.depth) / 2;
      const r = rad(it.rotation);
      // The item's front is its local +y: move the centre forward by half the change in depth.
      return { ...it, ...next, x: Math.round(it.x - Math.sin(r) * dd), y: Math.round(it.y + Math.cos(r) * dd), elevation: next.elevation ?? it.elevation };
    }),
  }));
}

/** Open the kitchen designer for a room: focus both views on it with the walls cut away. */
export function openKitchenDesigner(roomId: string) {
  store.set({ kitchen: roomId, cutaway: true, hideCatalog: false, tool: { kind: 'select' } });
  requestAnimationFrame(() => {
    store.emit('fit');
    store.emit('fit3d');
  });
}

export function closeKitchenDesigner() {
  store.set({ kitchen: null, tool: { kind: 'select' } });
}
