import { add, deg, mul, pointInPolygon, polygonArea, projectOnSegment, rad, rot, roundTo, uid, v, wallFrame } from './geometry';
import type { Design, ElecPoint, Room, Vec } from './types';

/**
 * Electrical plan: Clipsal Iconic switches and power points, plus lights and fans. Points live in
 * `design.electrical`; a switch's `gangs` list, for each of its switches, the ids of the lights / fans it turns on.
 *
 * Codes and sizes are from clipsal.com product pages and datasheets as published (October 2026). Ones marked
 * `est` couldn't be confirmed and are Clipsal's usual pattern: check them with your electrician or supplier.
 */

export type ElecKind = 'switch' | 'dimmer' | 'fan_control' | 'gpo' | 'outlet' | 'light' | 'fan';

export interface ElecProduct {
  id: string;
  /** Clipsal catalogue number, without the range prefix or colour suffix. */
  code: string;
  name: string;
  kind: ElecKind;
  mount: 'wall' | 'ceiling';
  /** Switches: how many separately switched gangs. */
  gangs?: number;
  /** Size (mm): plate width × height for wall-mounted parts, diameter (w) for round fittings; depth off the surface. */
  w: number;
  h: number;
  depth: number;
  /** Usual height of its centre above the floor (wall-mounted). */
  mountHeight: number;
  /** Takes the house's Iconic plate range and colour (otherwise it's a fitting with its own finish). */
  plate?: boolean;
  /** Iconic Outdoor: weatherproof, its own colours. */
  outdoor?: boolean;
  /** Short note shown with it. */
  note?: string;
  /** Code couldn't be confirmed. */
  est?: boolean;
  /** Lights: light output (lumens), beam angle (degrees) and colour temperature(s) (K). */
  lumens?: number;
  beam?: number;
  cct?: number[];
  /** Fans with a light: the light is switched separately from the fan (it has its own link, see lightRef). */
  fanLight?: boolean;
}

export const ELEC_GROUPS: { kind: ElecKind; name: string }[] = [
  { kind: 'switch', name: 'Light switches' },
  { kind: 'dimmer', name: 'Dimmers' },
  { kind: 'fan_control', name: 'Fan controllers' },
  { kind: 'gpo', name: 'Power points' },
  { kind: 'outlet', name: 'Data, TV & appliance' },
  { kind: 'light', name: 'Lights' },
  { kind: 'fan', name: 'Fans' },
];

const SW = { kind: 'switch' as const, mount: 'wall' as const, w: 78, h: 120, depth: 9, mountHeight: 1100, plate: true };
const GPO = { kind: 'gpo' as const, mount: 'wall' as const, w: 120, h: 78, depth: 9, mountHeight: 300, plate: true };

export const ELEC_PRODUCTS: ElecProduct[] = [
  { ...SW, id: 'iconic_sw1', code: '3041VA', name: '1 gang switch', gangs: 1, note: '10AX, 2-way mechanism' },
  { ...SW, id: 'iconic_sw2', code: '3042VA', name: '2 gang switch', gangs: 2, note: '10AX, 2-way mechanisms', est: true },
  { ...SW, id: 'iconic_sw3', code: '3043VAG', name: '3 gang switch', gangs: 3, note: '10AX, 2-way mechanisms' },
  { ...SW, id: 'iconic_sw4', code: '3044VAG', name: '4 gang switch', gangs: 4, note: '10AX, 2-way mechanisms' },
  { ...SW, id: 'iconic_sw5', code: '3045VAG', name: '5 gang switch', gangs: 5, note: '10AX, 2-way mechanisms', est: true },
  { ...SW, id: 'iconic_sw6', code: '3046VH', name: '6 gang switch', gangs: 6, note: '10AX, 2-way mechanisms' },
  { ...SW, id: 'iconic_dim_rotary', code: '42ELEDM2', name: 'LED rotary dimmer', kind: 'dimmer', gangs: 1, note: 'Trailing edge, for dimmable LEDs' },
  { ...SW, id: 'iconic_dim_push', code: '41E300PBUD2SM', name: 'Push-button dimmer', kind: 'dimmer', gangs: 1, note: '300 W universal, 2-way capable' },
  { ...SW, id: 'iconic_fan', code: '41ECSFWM', name: 'Fan controller', kind: 'fan_control', gangs: 1, note: '3-speed, Bluetooth (Zigbee: 41ECSFWMZ)' },
  { ...GPO, id: 'iconic_gpo1', code: '3015', name: 'Single power point', note: '10 A, switched' },
  { ...GPO, id: 'iconic_gpo2', code: '3025', name: 'Double power point', note: '10 A, switched' },
  { ...GPO, id: 'iconic_gpo2_usb', code: '3025USBAC', name: 'Double power point + USB-A/C', note: '10 A, USB-A 2.4 A + USB-C 3 A' },
  { ...GPO, id: 'iconic_gpo2_usb2', code: '3025USB2', name: 'Double power point + 2 USB-A', note: '10 A, two USB-A' },
  { ...GPO, id: 'iconic_gpo15', code: '3015/15', name: '15 A power point', note: 'For heaters, pumps, large appliances', est: true },
  { ...GPO, id: 'iconic_gpo_out', code: 'O3025', name: 'Outdoor double power point', w: 120, h: 90, depth: 40, outdoor: true, mountHeight: 600, note: 'Iconic Outdoor, IP54' },
  { ...GPO, id: 'iconic_cooker', code: '3041H45', kind: 'outlet', name: 'Cooker switch 45 A', mountHeight: 1100, note: 'Isolating switch for the oven / cooktop' },
  { ...SW, id: 'iconic_data', code: '30RJ45', kind: 'outlet', name: 'Data outlet (RJ45)', mountHeight: 300, est: true },
  { ...SW, id: 'iconic_tv', code: '3031TV', kind: 'outlet', name: 'TV outlet', mountHeight: 300, est: true },
  // Lights and fans: Clipsal LED downlights (90 mm cut-out) and common fittings.
  { id: 'clipsal_dl7', code: 'TPDL1C3', name: 'LED downlight 7 W tri-colour', kind: 'light', mount: 'ceiling', w: 110, h: 110, depth: 10, mountHeight: 0, lumens: 750, beam: 90, cct: [3000, 4000, 6000], note: '750 lm, 3000/4000/6000 K, dimmable, IP44, 90 mm cut-out' },
  { id: 'clipsal_dl9', code: 'TPDL2K4', name: 'LED downlight 9 W 4000 K', kind: 'light', mount: 'ceiling', w: 115, h: 115, depth: 10, mountHeight: 0, lumens: 950, beam: 90, cct: [4000], note: '950 lm, IP44, 90 mm cut-out' },
  { id: 'pendant', code: '', name: 'Pendant light', kind: 'light', mount: 'ceiling', w: 350, h: 350, depth: 700, mountHeight: 0, lumens: 800, beam: 70, cct: [2700, 3000], note: 'Hangs 700 mm (set the drop to suit)' },
  { id: 'oyster', code: '', name: 'Oyster light', kind: 'light', mount: 'ceiling', w: 330, h: 330, depth: 100, mountHeight: 0, lumens: 1600, beam: 120, cct: [3000, 4000] },
  { id: 'wall_light', code: '', name: 'Wall light', kind: 'light', mount: 'wall', w: 120, h: 200, depth: 90, mountHeight: 1800, lumens: 400, beam: 100, cct: [2700, 3000] },
  { id: 'outdoor_light', code: '', name: 'Outdoor wall light', kind: 'light', mount: 'wall', w: 150, h: 250, depth: 120, mountHeight: 2000, lumens: 600, beam: 100, cct: [3000, 4000] },
  { id: 'ceiling_fan', code: '', name: 'Ceiling fan', kind: 'fan', mount: 'ceiling', w: 1320, h: 1320, depth: 350, mountHeight: 0, note: '52" (1320 mm) sweep' },
  { id: 'ceiling_fan_light', code: '', name: 'Ceiling fan with LED light', kind: 'fan', mount: 'ceiling', w: 1320, h: 1320, depth: 400, mountHeight: 0, fanLight: true, lumens: 1500, beam: 120, cct: [3000, 4000, 6000], note: '52" (1320 mm) sweep, tri-colour LED light. Fan and light are switched separately' },
  { id: 'ceiling_fan_light_48', code: '', name: 'Ceiling fan with LED light 48"', kind: 'fan', mount: 'ceiling', w: 1220, h: 1220, depth: 400, mountHeight: 0, fanLight: true, lumens: 1200, beam: 120, cct: [3000, 4000, 6000], note: '48" (1220 mm) sweep, tri-colour LED light. Fan and light are switched separately' },
  { id: 'exhaust_fan', code: '', name: 'Exhaust fan', kind: 'fan', mount: 'ceiling', w: 300, h: 300, depth: 30, mountHeight: 0 },
];

export const ELEC_MAP: Record<string, ElecProduct> = Object.fromEntries(ELEC_PRODUCTS.map((p) => [p.id, p]));

export const productOf = (e: ElecPoint): ElecProduct => ELEC_MAP[e.product] ?? ELEC_PRODUCTS[0];
/** Things that turn other things on: switches, dimmers, fan controllers. */
export const isController = (p: ElecProduct) => p.kind === 'switch' || p.kind === 'dimmer' || p.kind === 'fan_control';
/** Things a switch can turn on. */
export const isSwitchable = (p: ElecProduct) => p.kind === 'light' || p.kind === 'fan';
/** Gives light: lights, and fans with a light. */
export const hasLight = (p: ElecProduct) => p.kind === 'light' || !!p.fanLight;
export const isCeilingFan = (p: ElecProduct) => p.id.startsWith('ceiling_fan');

/**
 * What a switch gang links to: a light / fan's id, or `<id>#light` for the light of a fan with a light (the fan
 * itself is its plain id).
 */
const LIGHT_PART = '#light';
export const lightRef = (id: string) => id + LIGHT_PART;
export const refBase = (ref: string) => (ref.endsWith(LIGHT_PART) ? ref.slice(0, -LIGHT_PART.length) : ref);
/** The link a point's light follows (its own id for a plain light). */
export const lightRefOf = (e: ElecPoint) => (productOf(e).fanLight ? lightRef(e.id) : e.id);

/** What clicking this point links to a controller: fan controllers take the fan, switches and dimmers its light. */
export function linkRefFor(controller: ElecProduct, e: ElecPoint): string | null {
  const p = productOf(e);
  if (!isSwitchable(p)) return null;
  return p.fanLight && controller.kind !== 'fan_control' ? lightRef(e.id) : e.id;
}

/** The links a point has: one, or two (fan + light) for fans with a light. */
export function refsOf(e: ElecPoint): string[] {
  const p = productOf(e);
  if (!isSwitchable(p)) return [];
  return p.fanLight ? [e.id, lightRef(e.id)] : [e.id];
}

export interface IconicFinish {
  id: string;
  name: string;
  /** Colour suffix on the order code (e.g. "-VW"). */
  suffix: string;
  hex: string;
}

export interface IconicRange {
  id: string;
  name: string;
  /** Range prefix on the order code (Styl "S", Essence "E"). */
  prefix: string;
  /** Plate size (portrait). */
  w: number;
  h: number;
  /** Corner radius of the plate (mm). */
  radius: number;
  look: string;
  finishes: IconicFinish[];
}

// Clipsal doesn't publish hex values: these are close matches to the colours.
export const ICONIC_RANGES: IconicRange[] = [
  {
    id: 'iconic',
    name: 'Iconic',
    prefix: '',
    w: 78,
    h: 120,
    radius: 3,
    look: 'Matt plastic, softly curved edges',
    finishes: [
      { id: 'VW', name: 'Vivid White', suffix: 'VW', hex: '#f4f4f1' },
      { id: 'CY', name: 'Cool Grey', suffix: 'CY', hex: '#a3a6a8' },
      { id: 'AN', name: 'Anthracite', suffix: 'AN', hex: '#3a3c3e' },
    ],
  },
  {
    id: 'styl',
    name: 'Iconic Styl',
    prefix: 'S',
    w: 82,
    h: 126,
    radius: 6,
    look: 'Sandblasted anodised aluminium',
    finishes: [{ id: 'CE', name: 'Crowne', suffix: 'CE', hex: '#a88f6c' }],
  },
  {
    id: 'essence',
    name: 'Iconic Essence',
    prefix: 'E',
    w: 85,
    h: 131,
    radius: 8,
    look: 'Plastic face with a birch timber edge',
    finishes: [
      { id: 'AW', name: 'Arctic White', suffix: 'AW', hex: '#f2f1ec' },
      { id: 'AG', name: 'Ash Grey', suffix: 'AG', hex: '#8f8d88' },
    ],
  },
];

const OUTDOOR_FINISHES: IconicFinish[] = [
  { id: 'XW', name: 'Matte White', suffix: 'XW', hex: '#f0f0ee' },
  { id: 'BK', name: 'Matte Black', suffix: 'BK', hex: '#1c1c1c' },
];

export const ICONIC_HOME = 'https://www.clipsal.com/products/power-points-switches/clipsal-iconic';

export function houseStyle(d: Design): { range: IconicRange; finish: IconicFinish } {
  const s = d.settings.electrical;
  const range = ICONIC_RANGES.find((r) => r.id === s?.range) ?? ICONIC_RANGES[0];
  const finish = range.finishes.find((f) => f.id === s?.finish) ?? range.finishes[0];
  return { range, finish };
}

/** Plate colours this point can have. */
export function finishesFor(d: Design, e: ElecPoint): IconicFinish[] {
  const p = productOf(e);
  if (!p.plate) return [];
  return p.outdoor ? OUTDOOR_FINISHES : houseStyle(d).range.finishes;
}

/** How a point looks: plate size and colour (Iconic plates), or the fitting's own colour. */
export function elecLook(d: Design, e: ElecPoint): { w: number; h: number; radius: number; hex: string; finish?: IconicFinish } {
  const p = productOf(e);
  if (!p.plate) return { w: p.w, h: p.h, radius: 0, hex: '#f4f4f2' };
  const { range, finish: house } = houseStyle(d);
  const list = finishesFor(d, e);
  const finish = list.find((f) => f.id === e.finish) ?? (p.outdoor ? list[0] : house);
  // Plates are portrait; landscape products (power points) are the same plate on its side.
  const [w, h] = p.outdoor ? [p.w, p.h] : p.w > p.h ? [range.h, range.w] : [range.w, range.h];
  return { w, h, radius: range.radius, hex: finish.hex, finish };
}

/** Order code with the range prefix and colour suffix, e.g. "E3041VA-AW". */
export function orderCode(d: Design, e: ElecPoint): string {
  const p = productOf(e);
  if (!p.code) return '';
  if (!p.plate) return p.code;
  const look = elecLook(d, e);
  const prefix = p.outdoor ? '' : houseStyle(d).range.prefix;
  return `${prefix}${p.code}${look.finish ? `-${look.finish.suffix}` : ''}`;
}

export function productUrl(p: ElecProduct): string | null {
  return p.code ? `https://www.clipsal.com/products/detail?CatNo=${encodeURIComponent(p.code)}` : null;
}

/** The room a point is in (wall-mounted points: the room they face into). */
export function roomOf(d: Design, e: ElecPoint) {
  const p = productOf(e);
  const at = p.mount === 'wall' ? add(v(e.x, e.y), rot(v(0, 150), rad(e.rotation))) : v(e.x, e.y);
  return d.rooms.find((r) => pointInPolygon(at, r.points)) ?? null;
}

/** A point's name for lists: its label, else the product and room. */
export function elecName(d: Design, e: ElecPoint): string {
  if (e.label) return e.label;
  const room = roomOf(d, e);
  return `${productOf(e).name}${room ? ` · ${room.name}` : ''}`;
}

/** A link's name for lists, e.g. "Fan light · Bedroom 1". */
export function refName(d: Design, ref: string): string | null {
  const e = d.electrical.find((x) => x.id === refBase(ref));
  if (!e) return null;
  if (!productOf(e).fanLight) return elecName(d, e);
  // Fans with a light: say which part first, so it survives being cut short in narrow lists.
  const part = ref === e.id ? 'Fan' : 'Fan light';
  const room = roomOf(d, e);
  return e.label ? `${part} · ${e.label}` : `${part}${room ? ` · ${room.name}` : ''}`;
}

/** The switches (and which of their gangs) that turn this light / fan (or a fan's light: lightRef) on. */
export function controllersOf(d: Design, ref: string): { sw: ElecPoint; gang: number }[] {
  const out: { sw: ElecPoint; gang: number }[] = [];
  for (const sw of d.electrical) sw.gangs?.forEach((g, i) => g.includes(ref) && out.push({ sw, gang: i }));
  return out;
}

/** Links that no switch controls yet (fans with a light can have the fan, the light or both unswitched). */
export function unswitched(d: Design): string[] {
  return d.electrical.flatMap((e) => refsOf(e).filter((r) => !controllersOf(d, r).length));
}

// ---------- Light spread demo ----------

/** Key for one gang of a switch in the demo's list of switches that are on. */
export const gangKey = (swId: string, gang: number) => `${swId}:${gang}`;

export function allGangKeys(d: Design): string[] {
  return d.electrical.flatMap((e) => (e.gangs ?? []).map((_, i) => gangKey(e.id, i)));
}

/** Lights that are on: any switch controlling them is on (lights on no switch are always on). */
export function litLights(d: Design, on: Set<string>): Set<string> {
  const lit = new Set<string>();
  for (const e of d.electrical) {
    if (!hasLight(productOf(e))) continue;
    const by = controllersOf(d, lightRefOf(e));
    if (!by.length || by.some(({ sw, gang }) => on.has(gangKey(sw.id, gang)))) lit.add(e.id);
  }
  return lit;
}

export const beamOf = (e: ElecPoint) => e.beam ?? productOf(e).beam ?? 90;
export const cctOf = (e: ElecPoint) => e.cct ?? productOf(e).cct?.[0] ?? 3000;

/** Approximate RGB of a colour temperature (warm white … daylight). */
export function cctColor(k: number): string {
  if (k <= 2800) return '#ffc98f';
  if (k <= 3200) return '#ffd7a6';
  if (k <= 4500) return '#fff0dc';
  return '#f4f6ff';
}

/** Ceiling height for the electrical plan: the house setting, else the tallest wall. */
export function ceilingHeight(d: Design): number {
  return d.settings.ceilingHeight ?? Math.max(2400, ...d.walls.map((w) => w.height));
}

/** Where a light hangs from / sits at (mm above the floor). */
export function lightSource(e: ElecPoint, ceiling: number): number {
  const p = productOf(e);
  if (p.mount === 'wall') return e.height;
  if (p.fanLight) return ceiling - p.depth - 60;
  return p.id === 'pendant' ? ceiling - p.depth - 200 : ceiling - 5;
}

/** Radius of a light's pool on the floor: the beam cone out to the floor (capped for very wide beams). */
export function poolRadius(e: ElecPoint, ceiling: number): number {
  const h = lightSource(e, ceiling);
  const half = Math.min(80, beamOf(e) / 2);
  return Math.min(4000, h * Math.tan(rad(half)));
}

/** Rough light level (lux) in each room with lights: lumen method, all lit lights × 0.5 utilisation ÷ floor area. */
export function roomLightLevels(d: Design, lit: Set<string>): { room: Room; lights: number; lumens: number; lux: number }[] {
  const out: { room: Room; lights: number; lumens: number; lux: number }[] = [];
  for (const r of d.rooms) {
    const area = polygonArea(r.points) / 1e6;
    if (area < 0.5) continue;
    const inRoom = d.electrical.filter((e) => lit.has(e.id) && roomOf(d, e)?.id === r.id);
    if (!inRoom.length && !d.electrical.some((e) => hasLight(productOf(e)) && roomOf(d, e)?.id === r.id)) continue;
    const lumens = inRoom.reduce((s, e) => s + (productOf(e).lumens ?? 0), 0);
    out.push({ room: r, lights: inRoom.length, lumens, lux: Math.round((lumens * 0.5) / area) });
  }
  return out;
}

/** Colours for each gang of a switch on the plan. */
export const GANG_COLORS = ['#e8590c', '#2f9e44', '#1c7ed6', '#ae3ec9', '#f59f00', '#0c8599'];

export interface ElecPlacement {
  x: number;
  y: number;
  rotation: number;
  /** Alignment lines (ceiling fittings lining up with others). */
  guides: [Vec, Vec][];
}

/**
 * Where a point goes for the cursor at `p`: wall-mounted ones on the face of the nearest wall (facing the side
 * the cursor is on), ceiling ones on the grid, lining up with other ceiling fittings. Null = no wall nearby.
 */
export function elecPlacement(d: Design, product: ElecProduct, p: Vec, o: { tol: number; grid: number; free: boolean; exclude?: string }): ElecPlacement | null {
  if (product.mount === 'wall') {
    let best: { w: (typeof d.walls)[number]; along: number; dist: number; side: number } | null = null;
    for (const w of d.walls) {
      const pr = projectOnSegment(p, w.start, w.end);
      if (pr.dist > Math.max(o.tol, w.thickness / 2 + 400) || pr.t < 0 || pr.t > 1) continue;
      if (!best || pr.dist < best.dist) {
        const f = wallFrame(w);
        const side = (p.x - w.start.x) * f.n.x + (p.y - w.start.y) * f.n.y >= 0 ? 1 : -1;
        best = { w, along: pr.along, dist: pr.dist, side };
      }
    }
    if (!best) return null;
    const f = wallFrame(best.w);
    const half = product.w / 2;
    const along = Math.min(Math.max(o.free ? best.along : roundTo(best.along, 10), half), f.length - half);
    const out = mul(f.n, best.side);
    const at = add(add(best.w.start, mul(f.u, along)), mul(out, best.w.thickness / 2));
    // Local +y faces out of the wall: rot((0, 1), r) = (−sin r, cos r).
    const rotation = Math.round(deg(Math.atan2(-out.x, out.y)) * 100) / 100;
    return { x: Math.round(at.x * 10) / 10, y: Math.round(at.y * 10) / 10, rotation, guides: [] };
  }
  let x = o.free ? Math.round(p.x) : roundTo(p.x, Math.min(o.grid, 50));
  let y = o.free ? Math.round(p.y) : roundTo(p.y, Math.min(o.grid, 50));
  const guides: [Vec, Vec][] = [];
  if (!o.free) {
    // Line up with other ceiling fittings (rows of downlights).
    const others = d.electrical.filter((e) => e.id !== o.exclude && productOf(e).mount === 'ceiling');
    const ax = others.filter((e) => Math.abs(e.x - p.x) < o.tol).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    const ay = others.filter((e) => Math.abs(e.y - p.y) < o.tol).sort((a, b) => Math.abs(a.y - p.y) - Math.abs(b.y - p.y))[0];
    if (ax) {
      x = ax.x;
      guides.push([v(x, Math.min(ax.y, y) - 300), v(x, Math.max(ax.y, y) + 300)]);
    }
    if (ay) {
      y = ay.y;
      guides.push([v(Math.min(ay.x, x) - 300, y), v(Math.max(ay.x, x) + 300, y)]);
    }
  }
  return { x, y, rotation: 0, guides };
}

export function newElecPoint(product: ElecProduct, at: ElecPlacement): ElecPoint {
  return {
    id: uid('e'),
    product: product.id,
    x: at.x,
    y: at.y,
    rotation: at.rotation,
    height: product.mountHeight,
    ...(isController(product) ? { gangs: Array.from({ length: product.gangs ?? 1 }, () => []) } : {}),
  };
}

/** Change a point's product, keeping its links (switches with fewer gangs drop the extra ones). */
export function withProduct(e: ElecPoint, product: ElecProduct): ElecPoint {
  const next: ElecPoint = { ...e, product: product.id };
  if (isController(product)) {
    const n = product.gangs ?? 1;
    next.gangs = Array.from({ length: n }, (_, i) => e.gangs?.[i] ?? []);
  } else delete next.gangs;
  if (product.mount !== productOf(e).mount) next.height = product.mountHeight;
  return next;
}

/** Rewrite every switch's links: `fn` returns the new link, or null to drop it. */
function mapLinks(d: Design, fn: (ref: string, sw: ElecPoint) => string | null): Design {
  return {
    ...d,
    electrical: d.electrical.map((e) => {
      if (!e.gangs) return e;
      const gangs = e.gangs.map((g) => [...new Set(g.flatMap((r) => fn(r, e) ?? []))]);
      return gangs.some((g, i) => g.length !== e.gangs![i].length || g.some((r, k) => r !== e.gangs![i][k])) ? { ...e, gangs } : e;
    }),
  };
}

/** Remove points, and any switch links to them. */
export function removeElec(d: Design, ids: Set<string>): Design {
  return mapLinks({ ...d, electrical: d.electrical.filter((e) => !ids.has(e.id)) }, (r) => (ids.has(refBase(r)) ? null : r));
}

/**
 * Swap a point for another product, keeping its switch links where they still make sense: a fan's light link
 * moves to a plain light (and back), and goes when the new fan has no light.
 */
export function swapElecProduct(d: Design, id: string, product: ElecProduct): Design {
  const e = d.electrical.find((x) => x.id === id);
  if (!e) return d;
  const next = { ...d, electrical: d.electrical.map((x) => (x.id === id ? withProduct(x, product) : x)) };
  return mapLinks(next, (r, sw) => {
    if (refBase(r) !== id) return r;
    const isLight = r !== id || (productOf(e).kind === 'light' && !productOf(e).fanLight);
    if (product.fanLight) return isLight || productOf(sw).kind !== 'fan_control' ? lightRef(id) : id;
    if (product.kind === 'light') return id;
    return isLight ? null : id;
  });
}

/** Links in the switch's room that no gang of it has yet: lights for switches and dimmers, fans for fan controllers. */
export function unlinkedInRoom(d: Design, sw: ElecPoint): string[] {
  const room = roomOf(d, sw);
  if (!room) return [];
  const ctl = productOf(sw);
  const taken = new Set(sw.gangs?.flat());
  return d.electrical.flatMap((e) => {
    const p = productOf(e);
    if (roomOf(d, e)?.id !== room.id) return [];
    // Exhaust fans usually go on the light switch; ceiling fans on a fan controller.
    const wanted = ctl.kind === 'fan_control' ? p.kind === 'fan' : hasLight(p) || p.id === 'exhaust_fan';
    const ref = wanted ? linkRefFor(ctl, e) : null;
    return ref && !taken.has(ref) ? [ref] : [];
  });
}

/** Read the electrical list from a saved file, dropping anything malformed. */
export function normaliseElectrical(raw: unknown): ElecPoint[] {
  if (!Array.isArray(raw)) return [];
  const num = (x: unknown, dflt: number) => (typeof x === 'number' && isFinite(x) ? x : dflt);
  const list = raw
    .filter((e) => e && typeof e === 'object' && ELEC_MAP[(e as ElecPoint).product])
    .map((e: any): ElecPoint => {
      const p = ELEC_MAP[e.product];
      return {
        id: String(e.id),
        product: p.id,
        x: num(e.x, 0),
        y: num(e.y, 0),
        rotation: num(e.rotation, 0),
        height: num(e.height, p.mountHeight),
        ...(typeof e.finish === 'string' ? { finish: e.finish } : {}),
        ...(typeof e.label === 'string' && e.label ? { label: e.label } : {}),
        ...(typeof e.beam === 'number' && e.beam > 0 ? { beam: e.beam } : {}),
        ...(typeof e.cct === 'number' && e.cct > 0 ? { cct: e.cct } : {}),
        ...(isController(p) ? { gangs: Array.from({ length: p.gangs ?? 1 }, (_, i) => (Array.isArray(e.gangs?.[i]) ? e.gangs[i].map(String) : [])) } : {}),
      };
    });
  const ids = new Set(list.map((e) => e.id));
  return list.map((e) => (e.gangs ? { ...e, gangs: e.gangs.map((g) => g.filter((r) => ids.has(refBase(r)) && r !== e.id)) } : e));
}
