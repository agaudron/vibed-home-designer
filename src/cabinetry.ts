import { itemClearances } from './clearance';
import { add, mul } from './geometry';
import type { CustomKitchenStyle, Design, Item, KitchenStyle } from './types';

/**
 * Custom cabinetry for the kitchen designer: made-to-measure units in any width, finished in the kitchen's own
 * door, benchtop and handle choices (not tied to a flat-pack range). Units are items of type 'cabinet' drawn by the
 * same 3D builder as Kaboodle units, so their options use the same keys (cls, doors, drawers, doorStyle, bench…).
 */

export type CustomStyle = CustomKitchenStyle;

export const DOOR_PROFILES: Record<string, string> = { flat: 'Flat (slab)', shaker: 'Shaker', vgroove: 'V-groove', gloss: 'High gloss', timber: 'Timber veneer' };

export const DOOR_COLOURS: { name: string; hex: string }[] = [
  { name: 'White', hex: '#f3f2ee' },
  { name: 'Warm white', hex: '#ece6da' },
  { name: 'Pale grey', hex: '#d4d3cf' },
  { name: 'Putty', hex: '#c9bfae' },
  { name: 'Sage', hex: '#9caf88' },
  { name: 'Forest green', hex: '#3f5a46' },
  { name: 'Navy', hex: '#2f3b52' },
  { name: 'Charcoal', hex: '#3a3b3d' },
  { name: 'Black', hex: '#1f1f20' },
  { name: 'Light oak', hex: '#c9a77c' },
  { name: 'Natural oak', hex: '#b08457' },
  { name: 'Walnut', hex: '#6b4a33' },
];

export const BENCH_MATERIALS: Record<string, { name: string; thick: number[]; colours: { name: string; hex: string }[] }> = {
  stone: {
    name: 'Engineered stone',
    thick: [20, 40, 60],
    colours: [
      { name: 'Pure white', hex: '#f2f1ec' },
      { name: 'Marble look', hex: '#ece9e4' },
      { name: 'Warm grey', hex: '#cfcac1' },
      { name: 'Concrete look', hex: '#b9b7b2' },
      { name: 'Black', hex: '#2a2a2b' },
    ],
  },
  laminate: {
    name: 'Laminate',
    thick: [33, 38],
    colours: [
      { name: 'White', hex: '#efeeea' },
      { name: 'Stone look', hex: '#d9d4cb' },
      { name: 'Oak look', hex: '#c09a6b' },
      { name: 'Charcoal', hex: '#4a4a4b' },
    ],
  },
  timber: {
    name: 'Timber',
    thick: [33, 40],
    colours: [
      { name: 'Oak', hex: '#b9895a' },
      { name: 'Blackbutt', hex: '#c7a57a' },
      { name: 'Spotted gum', hex: '#8a6142' },
    ],
  },
  steel: { name: 'Stainless steel', thick: [20, 40], colours: [{ name: 'Brushed steel', hex: '#c4c8cc' }] },
};

export const HANDLE_STYLES: Record<string, string> = { bar: 'Bar pull', d: 'D handle', knob: 'Knob', cup: 'Cup pull', edge: 'Finger pull (edge)', none: 'Handleless (push)' };

export const HANDLE_FINISHES: Record<string, { name: string; hex: string }> = {
  nickel: { name: 'Brushed nickel', hex: '#b8bcc0' },
  black: { name: 'Matt black', hex: '#222224' },
  brass: { name: 'Brushed brass', hex: '#b8955a' },
  chrome: { name: 'Chrome', hex: '#d9dde0' },
  gunmetal: { name: 'Gunmetal', hex: '#5b5d60' },
};

export function defaultCustomStyle(): CustomStyle {
  return {
    profile: 'flat',
    doorColor: '#f3f2ee',
    bench: 'stone',
    benchColor: '#f2f1ec',
    benchT: 40,
    handle: 'bar',
    handleFinish: 'nickel',
    handleLen: 160,
    kick: 150,
    benchHeight: 900,
    overheadTop: 2200,
  };
}

export const customStyle = (k: KitchenStyle | undefined): CustomStyle => ({ ...defaultCustomStyle(), ...k?.custom });

export type UnitKind = 'base' | 'drawer' | 'sink' | 'cooktop' | 'dishwasher' | 'wall' | 'rangehood' | 'fridge' | 'tall' | 'oven_tower' | 'panel' | 'benchtop';

export interface UnitType {
  cls: UnitKind;
  name: string;
  /** Default width and the widths offered as quick picks (mm). */
  width: number;
  widths: number[];
  depth: number;
  /** Where it goes: under the bench, hung on the wall or standing full height. */
  place: 'under' | 'wall' | 'tall' | 'panel' | 'top';
  /** Height for wall units (mm). */
  height?: number;
  drawers?: number;
}

const UNDER_W = [300, 400, 450, 500, 600, 700, 800, 900, 1000, 1200];
const WALL_W = [300, 400, 450, 500, 600, 800, 900, 1000];

export const UNIT_TYPES: UnitType[] = [
  { cls: 'base', name: 'Base cabinet', width: 600, widths: UNDER_W, depth: 600, place: 'under' },
  { cls: 'drawer', name: 'Drawers', width: 600, widths: UNDER_W, depth: 600, place: 'under', drawers: 3 },
  { cls: 'sink', name: 'Sink cabinet', width: 900, widths: [600, 800, 900, 1000, 1200], depth: 600, place: 'under' },
  { cls: 'cooktop', name: 'Oven under cooktop', width: 600, widths: [600, 900], depth: 600, place: 'under' },
  { cls: 'dishwasher', name: 'Dishwasher', width: 600, widths: [450, 600], depth: 600, place: 'under' },
  { cls: 'wall', name: 'Wall cabinet', width: 600, widths: WALL_W, depth: 350, place: 'wall', height: 720 },
  { cls: 'rangehood', name: 'Rangehood cabinet', width: 900, widths: [600, 900, 1200], depth: 350, place: 'wall', height: 400 },
  { cls: 'fridge', name: 'Over-fridge cabinet', width: 900, widths: [700, 900, 1000], depth: 600, place: 'wall', height: 400 },
  { cls: 'tall', name: 'Pantry / tall', width: 600, widths: [300, 450, 600, 900], depth: 600, place: 'tall' },
  { cls: 'oven_tower', name: 'Oven tower', width: 600, widths: [600], depth: 600, place: 'tall', drawers: 2 },
  { cls: 'panel', name: 'End panel', width: 18, widths: [18, 33], depth: 600, place: 'panel' },
  { cls: 'benchtop', name: 'Benchtop', width: 1800, widths: [1200, 1800, 2400, 3000, 3600], depth: 600, place: 'top' },
];

export const UNIT_MAP: Record<string, UnitType> = Object.fromEntries(UNIT_TYPES.map((u) => [u.cls, u]));

/** Doors a unit of this width gets: one up to 500 mm, then two or more, at most about 600 mm each. */
function doorsFor(u: UnitType, width: number) {
  if (u.cls === 'drawer' || u.cls === 'dishwasher' || u.cls === 'cooktop' || u.cls === 'panel' || u.cls === 'benchtop') return 0;
  return width <= 500 ? 1 : Math.max(2, Math.ceil(width / 600));
}

/** Finish options read by the 3D builder. */
function finish(s: CustomStyle): Record<string, string | number> {
  return {
    doorStyle: s.profile,
    door: `${DOOR_PROFILES[s.profile] ?? 'Flat'} · ${DOOR_COLOURS.find((c) => c.hex === s.doorColor)?.name ?? s.doorColor}`,
    bench: s.benchColor,
    benchName: `${BENCH_MATERIALS[s.bench]?.name ?? 'Stone'}, ${s.benchT} mm`,
    benchT: s.benchT,
    handle: s.handle,
    handleHex: HANDLE_FINISHES[s.handleFinish]?.hex ?? '#b8bcc0',
    handleName: s.handle === 'none' ? 'Handleless' : `${HANDLE_STYLES[s.handle]} · ${HANDLE_FINISHES[s.handleFinish]?.name ?? ''}`,
    handleLen: s.handleLen,
    kick: s.kick,
  };
}

/** Size and height of a unit in this style (keeping a width / depth / doors you've set). */
function shape(u: UnitType, s: CustomStyle, width: number, depth: number): Pick<Item, 'width' | 'depth' | 'height' | 'elevation'> {
  switch (u.place) {
    case 'under':
      return { width, depth, height: s.benchHeight, elevation: 0 };
    case 'wall': {
      const h = u.height ?? 720;
      return { width, depth, height: h, elevation: Math.max(0, s.overheadTop - h) };
    }
    case 'tall':
      return { width, depth, height: s.overheadTop, elevation: 0 };
    case 'panel':
      return { width, depth, height: s.benchHeight, elevation: 0 };
    case 'top':
      return { width, depth, height: s.benchT, elevation: Math.max(0, s.benchHeight - s.benchT) };
  }
}

/** A new custom unit, `width` wide, finished in the kitchen's style. */
export function customPreset(u: UnitType, width: number, s: CustomStyle): Partial<Item> {
  return {
    type: 'cabinet',
    name: `${u.name} ${width}`,
    ...shape(u, s, width, u.depth),
    color: u.cls === 'benchtop' ? s.benchColor : s.doorColor,
    options: { cls: u.cls, doors: doorsFor(u, width), drawers: u.drawers ?? 0, ...finish(s) },
  };
}

/** Restyle a custom unit: new finishes, and heights that follow the bench / overhead heights. */
export function restyleCustom(it: Item, s: CustomStyle): Item {
  const u = UNIT_MAP[String(it.options?.cls ?? 'base')] ?? UNIT_TYPES[0];
  const sh = shape(u, s, it.width, it.depth);
  // Wall units keep a height you've changed (only their position follows the overhead line).
  const height = u.place === 'wall' ? it.height : sh.height;
  const elevation = u.place === 'wall' ? Math.max(0, s.overheadTop - it.height) : sh.elevation;
  return { ...it, height, elevation, color: u.cls === 'benchtop' ? s.benchColor : s.doorColor, options: { ...(it.options ?? {}), ...finish(s) } };
}

/** Change what kind of unit this is, keeping its width and its back where it was. */
export function changeUnit(it: Item, cls: string, s: CustomStyle): Item {
  const u = UNIT_MAP[cls];
  if (!u) return it;
  const next = customPreset(u, it.width, s);
  const dd = ((next.depth ?? it.depth) - it.depth) / 2;
  const r = (it.rotation * Math.PI) / 180;
  return { ...it, ...next, name: `${u.name} ${it.width}`, x: Math.round(it.x - Math.sin(r) * dd), y: Math.round(it.y + Math.cos(r) * dd), options: { ...next.options } } as Item;
}

/**
 * Widen a unit to close the gaps either side of it (to the next wall or unit along its run, up to `max` each side),
 * so a made-to-measure cabinet fills its space exactly. Null when there's no gap to fill.
 */
export function fillGap(d: Design, it: Item, max = 1200): Item | null {
  const side = (title: string) => itemClearances(d, it).find((c) => c.title === title && c.dist <= max)?.dist ?? 0;
  const right = side('Clearance to the right');
  const left = side('Clearance to the left');
  if (right < 1 && left < 1) return null;
  const r = (it.rotation * Math.PI) / 180;
  const ax = { x: Math.cos(r), y: Math.sin(r) };
  const c = add({ x: it.x, y: it.y }, mul(ax, (right - left) / 2));
  const width = Math.round(it.width + left + right);
  const u = UNIT_MAP[String(it.options?.cls ?? 'base')];
  const doors = u ? doorsFor(u, width) : Number(it.options?.doors ?? 1);
  return { ...it, x: Math.round(c.x), y: Math.round(c.y), width, name: `${u?.name ?? 'Cabinet'} ${width}`, options: { ...(it.options ?? {}), doors } };
}

/** Cabinet schedule: each kind and size of unit, with how many (for quoting with a cabinet maker). */
export function cabinetSchedule(items: Item[]): { name: string; size: string; fronts: string; qty: number }[] {
  const m = new Map<string, { name: string; size: string; fronts: string; qty: number }>();
  for (const it of items) {
    const o = it.options ?? {};
    const u = UNIT_MAP[String(o.cls ?? 'base')];
    const doors = Number(o.doors ?? 0);
    const drawers = Number(o.drawers ?? 0);
    const fronts = [doors && `${doors} door${doors > 1 ? 's' : ''}`, drawers && `${drawers} drawer${drawers > 1 ? 's' : ''}`].filter(Boolean).join(', ');
    const size = `${it.width} × ${it.height} × ${it.depth}`;
    const key = `${u?.name}|${size}|${fronts}`;
    const row = m.get(key) ?? { name: u?.name ?? it.name, size, fronts, qty: 0 };
    row.qty++;
    m.set(key, row);
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name) || a.size.localeCompare(b.size));
}
