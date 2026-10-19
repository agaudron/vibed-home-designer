import * as THREE from 'three';
import { cornerLegs, NOSE, outdoorOpts, PAVE, verandaFloor } from '../outdoor';
import { localCorners, polyCuts } from '../shape';
import { BANQUETTE_DEFAULTS, DOOR_DESIGNS, FRIDGE_STYLE, SKYLIGHT_DEFAULTS, SOLAR_DEFAULTS, SOLAR_GAP, SOLAR_PANELS, VANITY_DEFAULTS } from '../catalog';
import type { FridgeStyle } from '../catalog';
import { add, DOOR_GAP, DOOR_JAMB, doubleDoorLeaf, dressingSide, mul, norm, sidelights, stackerLayout, sub, v } from '../geometry';
import { BACKSET, doorHandle } from '../doorClearance';
import { humeLayout } from '../humeDoors';
import type { Item, Opening, Vec } from '../types';
import { DOOR_TRIM, SKIRTINGS } from '../trims';
import type { OpeningTrim } from '../trims';

// Everything in the 3D scene is in millimetres. Item-local axes: x = width, z = depth
// (front of the item at +z), y = up, origin at the centre of the footprint on the floor.

export interface MatOpts {
  opacity?: number;
  metal?: number;
  rough?: number;
  emissive?: string;
}
export type MatFn = (color: string, opts?: MatOpts) => THREE.Material;

export class Builder {
  constructor(
    public g: THREE.Object3D,
    public m: MatFn,
  ) {}

  /** Box with its base at y and centred on x/z. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, opts?: MatOpts) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.1), Math.max(h, 0.1), Math.max(d, 0.1)), this.m(color, opts));
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = !opts?.opacity;
    mesh.receiveShadow = true;
    this.g.add(mesh);
    return mesh;
  }

  /** Vertical cylinder with its base at y. */
  cyl(rTop: number, rBottom: number, h: number, x: number, y: number, z: number, color: string, opts?: MatOpts, seg = 28) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), this.m(color, opts));
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.g.add(mesh);
    return mesh;
  }

  sphere(r: number, x: number, y: number, z: number, color: string, opts?: MatOpts) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), this.m(color, opts));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.g.add(mesh);
    return mesh;
  }
}

const STONE = '#e7e3dc';
const DARK = '#2d2d2d';
const STEEL = '#b8bcc0';
const GLASS: MatOpts = { opacity: 0.28 };
const METAL: MatOpts = { metal: 0.7, rough: 0.35 };
const KICK = 100;
const TOP = 30;

function shade(hex: string, f: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
}

/** Front panels (doors or drawers) on a box whose front face is at zFront. */
function fronts(b: Builder, w: number, y0: number, h: number, zFront: number, cols: number, rows: number, color: string, handle: 'bar' | 'knob' | 'vbar' = 'bar') {
  const gap = 4;
  const pw = w / cols;
  const ph = h / rows;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = -w / 2 + pw * (c + 0.5);
      const y = y0 + ph * r;
      b.box(pw - gap, ph - gap, 18, x, y + gap / 2, zFront + 9, color);
      if (handle === 'knob') b.cyl(12, 12, 10, x, y + ph * 0.5, zFront + 22, STEEL, METAL).rotateX(Math.PI / 2);
      else if (handle === 'vbar') {
        const hx = cols === 1 ? x + pw * 0.38 : c % 2 === 0 ? x + pw * 0.4 : x - pw * 0.4;
        b.box(12, Math.min(400, ph * 0.4), 14, hx, y + ph * 0.5 - Math.min(200, ph * 0.2), zFront + 25, STEEL, METAL);
      } else b.box(Math.min(160, pw * 0.5), 12, 14, x, y + ph - 60, zFront + 25, STEEL, METAL);
    }
  }
}

function baseCabinet(b: Builder, it: Item, kind: 'doors' | 'drawers' | 'none' = 'doors') {
  const { width: w, depth: d, height: h, color } = it;
  b.box(w - 10, KICK, d - 80, 0, 0, -30, DARK);
  b.box(w, h - KICK - TOP, d - 20, 0, KICK, -10, color);
  b.box(w, TOP, d, 0, h - TOP, 0, STONE, { rough: 0.4 });
  const zf = d / 2 - 20;
  if (kind === 'doors') fronts(b, w, KICK, h - KICK - TOP, zf, Math.max(1, Math.round(w / 600)), 1, color);
  if (kind === 'drawers') fronts(b, w, KICK, h - KICK - TOP, zf, 1, 3, color);
}

// ---------- Kaboodle kitchen units (kitchen designer) ----------

/** Height of the legs / kickboard under Kaboodle floor units. */
export const KB_LEGS = 145;

type KbHandle = 'bar' | 'd' | 'knob' | 'cup' | 'edge' | 'none';

/**
 * A Kaboodle or custom cabinet, panel or benchtop. What it is and how it's finished come from `it.options` (set by
 * the kitchen designer): cls, doors, drawers, doorStyle, bench (colour), benchT (thickness), handle, handleHex,
 * handleLen, kick (kickboard height).
 * Base units' height includes the legs and benchtop; their depth includes the benchtop's 20 mm overhang.
 */
function kaboodleUnit(b: Builder, it: Item) {
  const o = it.options ?? {};
  const num = (k: string, dflt: number) => (Number.isFinite(Number(o[k])) && o[k] !== '' ? Number(o[k]) : dflt);
  const cls = String(o.cls ?? 'base');
  // Kickboard height: Kaboodle's legs, or a custom kitchen's own kick.
  const LEGS = num('kick', KB_LEGS);
  const { width: w, depth: d, height: h, color } = it;
  const style = String(o.doorStyle ?? 'flat');
  const benchCol = String(o.bench ?? STONE);
  const benchT = num('benchT', 33);
  const handle = String(o.handle ?? 'bar') as KbHandle;
  const handleCol = String(o.handleHex ?? STEEL);
  const handleLen = num('handleLen', 160);
  const doors = Math.max(0, Math.round(num('doors', Math.max(1, Math.round(w / 600)))));
  const drawers = Math.max(0, Math.round(num('drawers', 0)));
  const gap = 3;
  const doorOpts: MatOpts | undefined = style === 'gloss' ? { rough: 0.12 } : style === 'timber' ? { rough: 0.75 } : undefined;

  /** One door / drawer front with its back face at z, plus its handle. */
  const front = (x: number, y: number, fw: number, fh: number, z: number, kind: 'door' | 'drawer', side: number, place: 'top' | 'bottom' | 'middle') => {
    const pw = fw - gap;
    const ph = fh - gap;
    const py = y + gap / 2;
    if (pw < 20 || ph < 20) return;
    if (style === 'shaker' && pw > 220 && ph > 160) {
      const rail = Math.min(70, pw * 0.18, ph * 0.25);
      b.box(pw - 2 * rail + 4, ph - 2 * rail + 4, 12, x, py + rail - 2, z + 6, color, doorOpts);
      for (const sx of [-1, 1]) b.box(rail, ph, 18, x + sx * (pw / 2 - rail / 2), py, z + 9, color, doorOpts);
      for (const yy of [py, py + ph - rail]) b.box(pw - 2 * rail, rail, 18, x, yy, z + 9, color, doorOpts);
    } else b.box(pw, ph, 18, x, py, z + 9, color, doorOpts);
    if (style === 'vgroove')
      for (let gx = -pw / 2 + 100; gx < pw / 2 - 40; gx += 100) b.box(4, ph - 30, 1, x + gx, py + 15, z + 18.5, shade(color, 0.72));
    // Handle.
    const zf = z + 18;
    const len = Math.min(handleLen, pw * 0.75, kind === 'door' ? ph * 0.6 : pw * 0.75);
    if (handle === 'none') return;
    if (handle === 'edge') {
      b.box(pw * 0.9, 8, 24, x, place === 'bottom' ? py - 4 : py + ph - 4, zf + 2, handleCol, METAL);
      return;
    }
    const knob = handle === 'knob' || (handle === 'cup' && kind === 'door');
    const hx = kind === 'drawer' ? x : x + side * (pw / 2 - 45);
    const hy = kind === 'drawer' ? (ph > 300 ? py + ph - 70 : py + ph / 2) : place === 'top' ? py + ph - 60 - (knob ? 0 : len) : place === 'bottom' ? py + 60 : py + ph / 2 - (knob ? 0 : len / 2);
    if (knob) b.cyl(14, 14, 24, hx, hy, zf + 12, handleCol, METAL).rotateX(Math.PI / 2);
    else if (handle === 'cup') b.box(Math.min(96, pw * 0.4), 28, 22, hx, hy - 14, zf + 11, handleCol, METAL);
    else {
      const out = handle === 'd' ? 32 : 18;
      if (kind === 'drawer') b.box(len, 12, 12, hx, hy - 6, zf + out, handleCol, METAL);
      else b.box(12, len, 12, hx, hy, zf + out, handleCol, METAL);
      if (handle === 'd')
        for (const s of [-1, 1])
          kind === 'drawer' ? b.box(8, 8, out, hx + s * (len / 2 - 6), hy - 4, zf + out / 2, handleCol, METAL) : b.box(8, 8, out, hx, hy + (s > 0 ? len - 8 : 0), zf + out / 2, handleCol, METAL);
    }
  };
  /** A row of doors across [y, y + fh]: pairs open from the middle, a single door from its right edge. */
  const doorRow = (y: number, fh: number, z: number, n: number, place: 'top' | 'bottom' | 'middle') => {
    const k = Math.max(1, n);
    for (let c = 0; c < k; c++) {
      const side = k === 1 ? 1 : c < k / 2 ? 1 : -1;
      front(-w / 2 + (w / k) * (c + 0.5), y, w / k, fh, z, 'door', side, place);
    }
  };
  /** Drawers stacked in [y, y + fh], deeper ones at the bottom. */
  const drawerStack = (y: number, fh: number, z: number, n: number) => {
    const weights = n === 3 ? [0.4, 0.35, 0.25] : Array.from({ length: n }, () => 1 / n);
    let yy = y;
    for (const f of weights) {
      front(0, yy, w, fh * f, z, 'drawer', 1, 'middle');
      yy += fh * f;
    }
  };

  switch (cls) {
    case 'benchtop':
      b.box(w, h, d, 0, 0, 0, benchCol, { rough: 0.5 });
      return;
    case 'panel':
    case 'kickboard':
      b.box(w, h, d, 0, 0, 0, color, doorOpts);
      return;
    case 'wall':
    case 'wall_corner':
    case 'rangehood':
    case 'fridge': {
      // Hung on the wall: carcass at the back, doors on the front.
      const cd = d - 18;
      b.box(w, h, cd, 0, 0, -d / 2 + cd / 2, color);
      const z = -d / 2 + cd;
      if (cls === 'rangehood') {
        // Undermount rangehood in the bottom of the cabinet.
        b.box(w - 40, 60, cd - 20, 0, -60, -d / 2 + cd / 2, STEEL, METAL);
        doorRow(0, h, z, doors || 1, 'bottom');
      } else doorRow(0, h, z, doors || 1, 'bottom');
      return;
    }
    case 'oven_tower':
      if (h < 1500) {
        // Microwave box: a carcass round a dark appliance front, sitting up in a tower.
        b.box(w, h, d - 18, 0, 0, -9, color);
        b.box(w - 8, h - 8, 18, 0, 4, d / 2 - 9, '#1c1c1e', { rough: 0.15 });
        return;
      }
    // falls through
    case 'tall': {
      const cd = d - 18;
      b.box(w - 10, LEGS - 10, 16, 0, 0, -d / 2 + cd - 60, shade(color, 0.85));
      b.box(w, h - LEGS, cd, 0, LEGS, -d / 2 + cd / 2, color);
      const z = -d / 2 + cd;
      const H = h - LEGS;
      if (cls === 'oven_tower') {
        drawerStack(LEGS, 700, z, Math.max(2, drawers || 2));
        b.box(w - 8, 590, 18, 0, LEGS + 710, z + 9, '#1c1c1e', { rough: 0.15 });
        b.box(w - 8, 400, 18, 0, LEGS + 1310, z + 9, '#1c1c1e', { rough: 0.15 });
        b.box(w * 0.6, 12, 14, 0, LEGS + 1240, z + 25, STEEL, METAL);
        if (H > 1730) doorRow(LEGS + 1720, H - 1720, z, 1, 'bottom');
      } else if (H > 1600) {
        const low = Math.round(H * 0.62);
        doorRow(LEGS, low, z, doors || 1, 'top');
        doorRow(LEGS + low, H - low, z, doors || 1, 'bottom');
      } else doorRow(LEGS, H, z, doors || 1, 'middle');
      return;
    }
    case 'tower': {
      // Washer / dryer tower: open slots for a washer on the floor and a dryer on a shelf, a cupboard over the top.
      const cd = d - 18;
      const zb = -d / 2;
      const t = 18;
      const shelf = 900;
      const top = Math.min(h - 300, 1820);
      for (const sx of [-1, 1]) b.box(t, h, cd, sx * (w / 2 - t / 2), 0, zb + cd / 2, color);
      b.box(w - 2 * t, h, 6, 0, 0, zb + 3, shade(color, 0.92)); // back
      b.box(w - 2 * t, 25, cd, 0, shelf, zb + cd / 2, color); // dryer shelf
      b.box(w - 2 * t, t, cd, 0, top, zb + cd / 2, color); // bottom of the cupboard
      b.box(w, t, cd, 0, h - t, zb + cd / 2, color);
      doorRow(top, h - top, zb + cd, doors || 1, 'bottom');
      return;
    }
    default: {
      // Floor units under the bench: legs + kickboard, carcass, fronts, benchtop.
      const cd = d - 20 - 18;
      if (cls === 'space') {
        // Appliance space: just the benchtop running over the gap.
        b.box(w, benchT, d, 0, h - benchT, 0, benchCol, { rough: 0.5 });
        return;
      }
      const body = h - LEGS - benchT;
      const z = -d / 2 + cd;
      b.box(w - 10, LEGS - 10, 16, 0, 0, z - 60, shade(color, 0.85));
      b.box(w, body, cd, 0, LEGS, -d / 2 + cd / 2, cls === 'dishwasher' ? '#d9dcdf' : color);
      b.box(w, benchT, d, 0, h - benchT, 0, benchCol, { rough: 0.5 });
      if (cls === 'drawer') drawerStack(LEGS, body, z, Math.max(1, drawers || 3));
      else if (cls === 'cooktop') {
        front(0, LEGS + body - 150, w, 150, z, 'drawer', 1, 'middle');
        b.box(w - 8, body - 160, 18, 0, LEGS + 4, z + 9, '#1c1c1e', { rough: 0.15 });
        b.box(w * 0.6, 12, 14, 0, LEGS + body - 210, z + 25, STEEL, METAL);
        b.box(w - 60, 6, d - 100, 0, h, 0, '#101010', { rough: 0.1 });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(70, 70, 3, (sx * w) / 4.5, h + 6, (sz * d) / 4.5, '#3a3a3a');
      } else if (cls === 'dishwasher') front(0, LEGS, w, body, z, 'drawer', 1, 'middle');
      else if (drawers > 0 && doors > 0) {
        drawerStack(LEGS + body - 150, 150, z, 1);
        doorRow(LEGS, body - 150, z, doors, 'top');
      } else if (drawers > 0) drawerStack(LEGS, body, z, drawers);
      else doorRow(LEGS, body, z, doors || 1, 'top');
      if (cls === 'sink' || cls === 'tub') {
        // A laundry tub is a single big, deep bowl.
        const bw = cls === 'tub' ? Math.min(w - 80, 560) : Math.min(w - 100, 760);
        const bd = d * (cls === 'tub' ? 0.68 : 0.55);
        b.box(bw, 3, bd, 0, h, 10, '#8e959c', METAL);
        b.box(bw - 30, 2, bd - 30, 0, h + 2, 10, cls === 'tub' ? '#4c5258' : '#5d646b', METAL);
        b.cyl(18, 18, 260, 0, h, -d / 2 + 70, STEEL, METAL);
        b.box(24, 24, 180, 0, h + 236, -d / 2 + 150, STEEL, METAL);
      }
      return;
    }
  }
}

/**
 * A fridge in one of the common layouts: French door (two doors over a freezer drawer), single door, top or
 * bottom mount (fridge and freezer doors), side by side, or an under-bench bar fridge.
 */
function fridge(b: Builder, it: Item, style: FridgeStyle) {
  const { width: w, depth: d, height: h, color } = it;
  const handleCol = '#8a8d91';
  const doorT = 40;
  const bodyD = d - doorT - 30; // handles stand out ~30 mm
  b.box(w, h, bodyD, 0, 0, -d / 2 + bodyD / 2, color, METAL);
  const z = -d / 2 + bodyD + doorT / 2; // centre of the doors
  const hz = z + doorT / 2 + 15; // handles
  /** A door over [y, y + dh] and [x - dw/2, x + dw/2], with a vertical handle at hx (or a bar handle along the top/bottom). */
  const door = (x: number, dw: number, y: number, dh: number, hx: number | null, bar?: 'top' | 'bottom') => {
    b.box(dw - 4, dh - 4, doorT, x, y + 2, z, color, METAL);
    if (hx !== null) b.box(16, Math.min(600, dh * 0.6), 30, hx, y + dh * 0.2, hz, handleCol, METAL);
    if (bar) b.box(dw * 0.55, 16, 30, x, bar === 'top' ? y + dh - 60 : y + 40, hz, handleCol, METAL);
  };
  const base = 10; // toe gap under the doors
  const H = h - base;
  switch (style) {
    case 'french': {
      const split = base + Math.round(H * 0.38);
      for (const sx of [-1, 1]) door((sx * w) / 4, w / 2, split, h - split, sx * 40);
      door(0, w, base, split - base, null, 'top');
      break;
    }
    case 'side':
      // Freezer on the left (narrower), fridge on the right, both full height.
      door(-w / 2 + (w * 0.42) / 2, w * 0.42, base, H, -w / 2 + w * 0.42 - 40);
      door(w / 2 - (w * 0.58) / 2, w * 0.58, base, H, -w / 2 + w * 0.42 + 40);
      break;
    case 'top': {
      const split = base + Math.round(H * 0.72);
      door(0, w, split, h - split, -w / 2 + 50);
      door(0, w, base, split - base, -w / 2 + 50);
      break;
    }
    case 'bottom': {
      const split = base + Math.round(H * 0.32);
      door(0, w, split, h - split, -w / 2 + 50);
      door(0, w, base, split - base, null, 'top');
      break;
    }
    case 'single':
    case 'bar':
      door(0, w, base, H, -w / 2 + 50);
      break;
  }
}

function sofa(b: Builder, w: number, d: number, h: number, color: string, seats: number) {
  const arm = Math.min(170, w * 0.15);
  b.box(w, 80, d, 0, 0, 0, shade(color, 0.6));
  b.box(w, 340, d, 0, 80, 0, color);
  b.box(w, h - 80, 220, 0, 80, -d / 2 + 110, color);
  b.box(arm, 620 - 80, d, -w / 2 + arm / 2, 80, 0, color);
  b.box(arm, 620 - 80, d, w / 2 - arm / 2, 80, 0, color);
  const sw = (w - 2 * arm) / seats;
  for (let i = 0; i < seats; i++) {
    b.box(sw - 16, 130, d - 240, -w / 2 + arm + sw * (i + 0.5), 420, 110, shade(color, 1.12));
    b.box(sw - 30, Math.max(100, h - 560), 140, -w / 2 + arm + sw * (i + 0.5), 480, -d / 2 + 290, shade(color, 1.12));
  }
}

function legs(b: Builder, w: number, d: number, h: number, inset: number, size: number, color: string) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(size, h, size, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), color);
}

function bed(b: Builder, it: Item, pillows: number) {
  const { width: w, depth: d, height: h, color } = it;
  const frame = '#7a5c43';
  b.box(w, 300, d - 60, 0, 0, 30, frame);
  b.box(w, h, 70, 0, 0, -d / 2 + 35, shade(frame, 0.9));
  b.box(w - 40, 220, d - 100, 0, 300, 35, '#f6f6f2');
  const pw = (w - 120 - (pillows - 1) * 60) / pillows;
  for (let i = 0; i < pillows; i++) b.box(pw, 130, 380, -w / 2 + 60 + pw / 2 + i * (pw + 60), 520, -d / 2 + 70 + 230, '#ffffff');
  b.box(w - 10, 70, (d - 100) * 0.7, 0, 500, d / 2 - ((d - 100) * 0.7) / 2 - 5, color);
}

export interface ItemContext {
  /** Height of the main roof's eaves, when this item sits under it. */
  plate?: number;
  /**
   * Skylights: the ceiling height, how high the light shaft goes, and the roof surface over the item's centre
   * (height and normal in the item's own frame), when there's a roof showing.
   */
  sky?: { ceiling: number; shaftTop: number; roof: { y: number; n: [number, number, number] } | null; cutaway: boolean };
  /** Height of the ground relative to the house floor (0, or below it for a raised house). */
  ground?: number;
  /** Kitchen units: a bulkhead from the top of the unit up to `top` (house-floor relative), with a cornice. */
  bulkhead?: { top: number; color: string; shadowline: boolean; cornice: [number, number][]; corniceShadow: boolean; ceilingColor: string };
}

export function buildItem(it: Item, m: MatFn, ctx: ItemContext = {}): THREE.Group {
  const g = new THREE.Group();
  const b = new Builder(g, m);
  const { width: w, depth: d, height: h, color } = it;

  switch (it.type) {
    case 'base_cabinet':
    case 'corner_cabinet':
      baseCabinet(b, it, 'doors');
      break;
    case 'drawer_cabinet':
      baseCabinet(b, it, 'drawers');
      break;
    case 'sink_cabinet': {
      baseCabinet(b, it, 'doors');
      b.box(w * 0.7, 3, d * 0.55, 0, h, 20, '#8e959c', METAL);
      b.box(w * 0.7 - 30, 2, d * 0.55 - 30, 0, h + 2, 20, '#5d646b', METAL);
      b.cyl(18, 18, 260, 0, h, -d / 2 + 70, STEEL, METAL);
      b.box(24, 24, 180, 0, h + 236, -d / 2 + 150, STEEL, METAL);
      break;
    }
    case 'cooktop_cabinet': {
      b.box(w - 10, KICK, d - 80, 0, 0, -30, DARK);
      b.box(w, h - KICK - TOP, d - 20, 0, KICK, -10, color);
      b.box(w, TOP, d, 0, h - TOP, 0, STONE, { rough: 0.4 });
      const zf2 = d / 2 - 20;
      b.box(w - 8, 150, 18, 0, h - TOP - 160, zf2 + 9, color);
      b.box(w - 8, h - KICK - TOP - 180, 18, 0, KICK + 4, zf2 + 9, '#1c1c1e', { rough: 0.15 });
      b.box(w * 0.6, 12, 14, 0, h - TOP - 230, zf2 + 25, STEEL, METAL);
      b.box(w - 60, 6, d - 90, 0, h, 0, '#101010', { rough: 0.1 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(70, 70, 3, (sx * w) / 4.5, h + 6, (sz * d) / 4.5, '#3a3a3a');
      break;
    }
    case 'dishwasher': {
      b.box(w - 10, KICK, d - 80, 0, 0, -30, DARK);
      b.box(w, h - KICK - TOP, d - 20, 0, KICK, -10, '#d9dcdf');
      b.box(w, TOP, d, 0, h - TOP, 0, STONE);
      b.box(w - 6, h - KICK - TOP - 4, 18, 0, KICK + 2, d / 2 - 11, color, METAL);
      b.box(w * 0.7, 14, 20, 0, h - TOP - 70, d / 2 + 8, '#777', METAL);
      break;
    }
    case 'tall_cabinet': {
      b.box(w - 10, KICK, d - 80, 0, 0, -30, DARK);
      b.box(w, h - KICK, d - 20, 0, KICK, -10, color);
      fronts(b, w, KICK, 800, d / 2 - 20, Math.max(1, Math.round(w / 600)), 1, color, 'vbar');
      fronts(b, w, KICK + 800, h - KICK - 800, d / 2 - 20, Math.max(1, Math.round(w / 600)), 1, color, 'vbar');
      break;
    }
    case 'oven_tower': {
      b.box(w - 10, KICK, d - 80, 0, 0, -30, DARK);
      b.box(w, h - KICK, d - 20, 0, KICK, -10, color);
      const z = d / 2 - 20;
      fronts(b, w, KICK, 700, z, 1, 2, color);
      b.box(w - 8, 590, 18, 0, KICK + 710, z + 9, '#1c1c1e', { rough: 0.15 });
      b.box(w - 8, 450, 18, 0, KICK + 1310, z + 9, '#1c1c1e', { rough: 0.15 });
      b.box(w * 0.6, 12, 14, 0, KICK + 1240, z + 25, STEEL, METAL);
      fronts(b, w, KICK + 1770, h - KICK - 1770, z, 1, 1, color);
      break;
    }
    case 'wall_cabinet': {
      b.box(w, h, d - 20, 0, 0, -10, color);
      fronts(b, w, 0, h, d / 2 - 20, Math.max(1, Math.round(w / 600)), 1, color);
      break;
    }
    case 'rangehood': {
      b.box(w, 100, d, 0, 0, 0, color, METAL);
      b.box(w * 0.35, h - 100, 280, 0, 100, -d / 2 + 140, color, METAL);
      break;
    }
    case 'island': {
      b.box(w - 20, KICK, d - 380, 0, 0, -170, DARK);
      b.box(w - 20, h - KICK - 40, d - 320, 0, KICK, -150, color);
      b.box(w, 40, d, 0, h - 40, 0, STONE, { rough: 0.35 });
      fronts(b, w - 20, KICK, h - KICK - 40, -d / 2 + 10, Math.max(1, Math.round(w / 600)), 1, color);
      // Doors face the kitchen (back): mirror them by rotating the front group copy
      g.children.slice(-Math.max(1, Math.round(w / 600)) * 2).forEach((c) => {
        c.position.z = -d / 2 + 10 - (c.position.z - (-d / 2 + 10));
      });
      break;
    }
    case 'kaboodle':
    case 'cabinet': {
      kaboodleUnit(b, it);
      const bh = ctx.bulkhead;
      // Bulkhead: a plasterboard box (or door-finished panel) from the top of the unit to the ceiling, with an
      // optional 10 mm shadowline (recessed gap) where they meet.
      const rise = bh ? bh.top - it.elevation - h : 0;
      if (bh && rise > 10) {
        const gap = bh.shadowline ? 10 : 0;
        if (gap) b.box(w - 30, gap, d - 30, 0, h, -15, '#2a2a2b');
        b.box(w, rise - gap, d, 0, h + gap, 0, bh.color, { rough: 0.9 });
        if (bh.cornice.length) bulkheadCornice(b, w, d, h + rise, bh.cornice, bh.corniceShadow ? '#2b2a28' : bh.ceilingColor);
      }
      break;
    }
    case 'bar_stool': {
      b.cyl(w * 0.32, w * 0.36, 20, 0, 0, 0, DARK, METAL);
      b.cyl(22, 22, h - 70, 0, 20, 0, STEEL, METAL);
      b.cyl(w * 0.45, w * 0.42, 60, 0, h - 60, 0, color);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(w * 0.3, 10, 8, 32), m(STEEL, METAL));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = h * 0.4;
      g.add(ring);
      break;
    }

    case 'bed_single':
      bed(b, it, 1);
      break;
    case 'bed_double':
    case 'bed_queen':
    case 'bed_king':
      bed(b, it, 2);
      break;
    case 'cot': {
      b.box(w, 60, d, 0, 350, 0, color);
      b.box(w - 60, 120, d - 60, 0, 410, 0, '#ffffff');
      for (const sx of [-1, 1]) b.box(40, h, d, (sx * (w - 40)) / 2, 0, 0, color, { opacity: 0.85 });
      for (const sz of [-1, 1]) b.box(w, h - 100, 40, 0, 100, (sz * (d - 40)) / 2, color, { opacity: 0.85 });
      break;
    }
    case 'bedside':
    case 'dresser':
    case 'filing': {
      b.box(w, h - 60, d - 20, 0, 60, -10, color);
      legs(b, w, d - 20, 60, 30, 40, shade(color, 0.6));
      const rows = it.type === 'bedside' ? 2 : it.type === 'filing' ? 3 : 4;
      fronts(b, w, 60, h - 60, d / 2 - 20, it.type === 'dresser' && w > 1000 ? 2 : 1, rows, shade(color, 1.05), 'knob');
      break;
    }
    case 'wardrobe': {
      b.box(w, h, d - 40, 0, 0, -20, shade(color, 0.92));
      const n = Math.max(2, Math.round(w / 1200));
      const pw = w / n + 40;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (w / n) * (i + 0.5);
        const z = d / 2 - 40 + (i % 2 === 0 ? 15 : 45);
        b.box(pw - 20, h - 60, 25, Math.max(-w / 2 + pw / 2, Math.min(w / 2 - pw / 2, x)), 30, z, color);
        b.box(30, h - 60, 30, x + (i % 2 === 0 ? -1 : 1) * (pw / 2 - 40), 30, z + 5, shade(color, 0.8));
      }
      break;
    }
    case 'linen':
    case 'wardrobe_hinged': {
      b.box(w, h - 80, d - 20, 0, 80, -10, color);
      b.box(w - 20, 80, d - 60, 0, 0, -30, shade(color, 0.6));
      fronts(b, w, 80, h - 80, d / 2 - 20, Math.max(1, Math.round(w / 600)), 1, color, 'vbar');
      break;
    }
    case 'walkin_shelving': {
      const bays = Math.max(1, Math.round(w / 600));
      for (let i = 0; i <= bays; i++) b.box(18, h, d, -w / 2 + 9 + ((w - 18) * i) / bays, 0, 0, color);
      for (const y of [80, h - 18, 1700]) b.box(w, 18, d, 0, y, 0, color);
      for (let i = 0; i < bays; i++) {
        const x = -w / 2 + (w / bays) * (i + 0.5);
        if (i % 2 === 0) {
          const rail = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, w / bays - 30, 12), m(STEEL, METAL));
          rail.rotation.z = Math.PI / 2;
          rail.position.set(x, 1640, 0);
          g.add(rail);
          for (let k = 0; k < 5; k++) b.box(10, 800, d * 0.8, x - w / bays / 2 + 60 + k * ((w / bays - 120) / 4), 820, 0, ['#41566b', '#c9b18f', '#8d4a42', '#e7e7e2', '#2f2f2f'][k]);
        } else for (const y of [500, 900, 1300]) b.box(w / bays - 18, 18, d, x, y, 0, color);
      }
      break;
    }

    case 'sofa_3':
      sofa(b, w, d, h, color, 3);
      break;
    case 'sofa_2':
      sofa(b, w, d, h, color, 2);
      break;
    case 'armchair':
      sofa(b, w, d, h, color, 1);
      break;
    case 'sofa_corner': {
      // Built with the return on the left; mirrored when it's set to the right.
      const sub = new THREE.Group();
      if (it.options?.corner === 'right') sub.scale.x = -1;
      g.add(sub);
      const b = new Builder(sub, m);
      const sd = 950;
      b.box(w, 420, sd, 0, 0, -d / 2 + sd / 2, color);
      b.box(sd, 420, d - sd, -w / 2 + sd / 2, 0, -d / 2 + sd + (d - sd) / 2, color);
      b.box(w, h, 220, 0, 0, -d / 2 + 110, shade(color, 0.95));
      b.box(220, h, d, -w / 2 + 110, 0, 0, shade(color, 0.95));
      b.box(160, 620, sd, w / 2 - 80, 0, -d / 2 + sd / 2, color);
      b.box(sd, 620, 160, -w / 2 + sd / 2, 0, d / 2 - 80, color);
      b.box(w - 220 - 160 - 10, 120, sd - 240, -w / 2 + 220 + (w - 220 - 160) / 2, 420, -d / 2 + 220 + (sd - 220) / 2, shade(color, 1.12));
      b.box(sd - 230, 120, d - sd - 160 - 10, -w / 2 + 220 + (sd - 220) / 2, 420, -d / 2 + sd + (d - sd - 160) / 2, shade(color, 1.12));
      break;
    }
    case 'coffee_table':
    case 'dining_table':
    case 'desk': {
      const t = it.type === 'coffee_table' ? 40 : 35;
      b.box(w, t, d, 0, h - t, 0, color);
      if (it.type === 'desk') {
        for (const sx of [-1, 1]) b.box(30, h - t, d - 40, sx * (w / 2 - 30), 0, 0, shade(color, 0.8));
        b.box(w - 60, 300, 18, 0, h - t - 300, -d / 2 + 30, shade(color, 0.8));
      } else legs(b, w, d, h - t, 70, it.type === 'coffee_table' ? 45 : 60, shade(color, 0.75));
      break;
    }
    case 'round_table': {
      const top = b.cyl(w / 2, w / 2, 35, 0, h - 35, 0, color, undefined, 48);
      top.scale.z = d / w;
      b.cyl(50, 60, h - 35, 0, 0, 0, shade(color, 0.75));
      const base = b.cyl(w * 0.22, w * 0.25, 30, 0, 0, 0, shade(color, 0.75));
      base.scale.z = d / w;
      break;
    }
    case 'chair': {
      legs(b, w, d, 450, 30, 35, shade(color, 0.8));
      b.box(w, 50, d - 20, 0, 450, 10, color);
      b.box(w, h - 500, 40, 0, 500, -d / 2 + 20, color);
      for (const sx of [-1, 1]) b.box(35, 50, 35, sx * (w / 2 - 30), 450, -d / 2 + 30, color);
      break;
    }
    case 'sideboard':
    case 'tv_unit': {
      b.box(w, h - 80, d, 0, 80, 0, color);
      legs(b, w, d, 80, 60, 40, DARK);
      fronts(b, w, 80, h - 80, d / 2, Math.max(2, Math.round(w / 600)), 1, shade(color, 1.08), 'bar');
      break;
    }
    case 'buffet_hutch':
      buffetHutch(b, it);
      break;
    case 'buffet_lombardozzi':
      oakBuffet(b, it);
      break;
    case 'abi_vanity':
    case 'abi_basin':
    case 'abi_bath':
    case 'abi_toilet':
    case 'abi_sink':
    case 'abi_mirror':
    case 'abi_towel_rail':
    case 'abi_bath_filler':
    case 'abi_shower':
    case 'abi_tap':
    case 'abi_accessory':
      abiFixture(b, it);
      break;
    case 'shelving_rack':
    case 'shelving_rack_tall':
    case 'shelving_rack_narrow':
      shelvingRack(b, it);
      break;
    case 'skylight':
    case 'sun_tunnel':
      skylight(b, it, ctx.sky);
      break;
    case 'solar_array':
      solarArray(b, it, ctx.sky);
      break;
    case 'banquette':
    case 'banquette_l':
      banquette(b, it);
      break;
    case 'ac_indoor':
      acIndoor(b, it);
      break;
    case 'ac_outdoor':
      acOutdoor(b, it);
      break;
    case 'tv': {
      b.box(w, h, Math.max(20, d * 0.5), 0, 0, -d / 4, color);
      b.box(w - 30, h - 30, 4, 0, 15, Math.max(10, d * 0.25), '#1b2734', { rough: 0.15 });
      break;
    }
    case 'bookshelf': {
      const t = 20;
      for (const sx of [-1, 1]) b.box(t, h, d, sx * (w / 2 - t / 2), 0, 0, color);
      b.box(w, t, d, 0, 0, 0, color);
      b.box(w, t, d, 0, h - t, 0, color);
      b.box(w - 2 * t, h, 8, 0, 0, -d / 2 + 4, shade(color, 0.85));
      const shelves = Math.max(2, Math.round(h / 350));
      const sp = (h - t) / shelves;
      const bookColors = ['#7c3b33', '#2f4f6f', '#c8a24a', '#41644a', '#d8d2c4', '#5b4b6b'];
      let seed = 7;
      const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      for (let i = 1; i < shelves; i++) b.box(w - 2 * t, t, d - 10, 0, i * sp, 5, color);
      for (let i = 0; i < shelves; i++) {
        let x = -w / 2 + t + 10;
        const limit = w / 2 - t - 10 - (i % 2 ? w * 0.3 : 0);
        while (x < limit - 40) {
          const bw = 25 + rnd() * 30;
          const bh = Math.min(sp - 40, 180 + rnd() * 100);
          b.box(bw - 2, bh, d * 0.75, x + bw / 2, i * sp + t, 0, bookColors[Math.floor(rnd() * bookColors.length)]);
          x += bw;
        }
      }
      break;
    }
    case 'fireplace': {
      b.box(w, h - 60, d, 0, 0, 0, color);
      b.box(w + 120, 60, d + 60, 0, h - 60, 30, shade(color, 0.8));
      b.box(w * 0.55, h * 0.45, 10, 0, 180, d / 2 + 2, '#111');
      b.box(w * 0.4, 60, 10, 0, 200, d / 2 + 8, '#ff7a2a', { emissive: '#ff5a10' });
      break;
    }
    case 'rug':
      b.box(w, Math.max(5, h), d, 0, 0, 0, color, { rough: 1 });
      break;
    case 'plant': {
      const r = Math.min(w, d) / 2;
      b.cyl(r * 0.6, r * 0.45, 420, 0, 0, 0, '#a9714f');
      b.sphere(r, 0, Math.max(420 + r * 0.6, h - r), 0, color, { rough: 0.9 });
      b.sphere(r * 0.7, r * 0.35, Math.max(420 + r * 0.4, h - r * 1.5), r * 0.2, shade(color, 1.15), { rough: 0.9 });
      b.cyl(15, 20, Math.max(0, h - r - 400), 0, 400, 0, '#5c4430');
      break;
    }
    case 'floor_lamp': {
      b.cyl(150, 160, 25, 0, 0, 0, DARK, METAL);
      b.cyl(12, 12, h - 300, 0, 25, 0, DARK, METAL);
      b.cyl(Math.min(w, d) * 0.35, Math.min(w, d) * 0.5, 300, 0, h - 300, 0, color, { emissive: '#6b5a33' });
      break;
    }

    case 'toilet': {
      b.box(w * 0.9, 400, 170, 0, 400, -d / 2 + 85, color, { rough: 0.2 });
      const bowl = b.cyl(w / 2, w * 0.38, 400, 0, 0, -d / 2 + 170 + (d - 170) / 2, color, { rough: 0.2 });
      bowl.scale.z = (d - 170) / w;
      const seat = b.cyl(w / 2, w / 2, 25, 0, 400, -d / 2 + 170 + (d - 170) / 2, '#f8f8f8', { rough: 0.3 });
      seat.scale.z = (d - 170) / w;
      break;
    }
    case 'vanity_tl':
      timberlineVanity(b, it);
      break;
    case 'vanity':
    case 'double_vanity': {
      b.box(w, h - 250 - 20, d - 10, 0, 250, -5, color);
      fronts(b, w, 250, h - 270, d / 2 - 10, Math.max(1, Math.round(w / 450)), 1, color, 'bar');
      b.box(w, 20, d, 0, h - 20, 0, '#f4f4f2', { rough: 0.3 });
      const basins = it.type === 'double_vanity' ? 2 : 1;
      for (let i = 0; i < basins; i++) {
        const x = -w / 2 + (w / basins) * (i + 0.5);
        const bs = b.cyl(Math.min(220, w / basins / 3), Math.min(180, w / basins / 3.5), 120, x, h, 20, '#ffffff', { rough: 0.15 });
        bs.scale.z = 0.75;
        b.cyl(14, 14, 200, x, h, -d / 2 + 50, STEEL, METAL);
        b.box(20, 20, 120, x, h + 180, -d / 2 + 100, STEEL, METAL);
      }
      break;
    }
    case 'mirror':
      b.box(w, h, d, 0, 0, 0, color);
      b.box(w - 40, h - 40, 4, 0, 20, d / 2 + 1, '#cfe0ea', { metal: 0.9, rough: 0.05 });
      break;
    case 'towel_rail':
      for (const sx of [-1, 1]) b.box(25, h, 25, sx * (w / 2 - 12), 0, 0, color, METAL);
      for (let i = 0; i < 6; i++) b.box(w, 15, 15, 0, 60 + (i * (h - 120)) / 5, 20, color, METAL);
      break;
    case 'bath': {
      const t = 70;
      b.box(w, 80, d, 0, 0, 0, color);
      b.box(w, h - 80, t, 0, 80, -d / 2 + t / 2, color);
      b.box(w, h - 80, t, 0, 80, d / 2 - t / 2, color);
      b.box(t, h - 80, d - 2 * t, -w / 2 + t / 2, 80, 0, color);
      b.box(t, h - 80, d - 2 * t, w / 2 - t / 2, 80, 0, color);
      b.box(w - 2 * t, 2, d - 2 * t, 0, 80, 0, '#dce9ef');
      b.box(30, 30, 140, -w / 2 + 120, h + 30, -d / 2 + 70, STEEL, METAL);
      break;
    }
    case 'shower': {
      b.box(w, 50, d, 0, 0, 0, '#f7f7f7');
      b.box(w, h - 50, 8, 0, 50, d / 2 - 4, '#bfe3f0', GLASS);
      b.box(8, h - 50, d, w / 2 - 4, 50, 0, '#bfe3f0', GLASS);
      b.box(w, 20, 20, 0, h - 20, d / 2 - 10, STEEL, METAL);
      b.box(20, 20, d, w / 2 - 10, h - 20, 0, STEEL, METAL);
      b.cyl(100, 100, 15, 0, h - 150, -d / 2 + 250, STEEL, METAL);
      b.box(20, 20, 220, 0, h - 140, -d / 2 + 110, STEEL, METAL);
      break;
    }
    case 'washer':
    case 'dryer': {
      b.box(w, h, d - 20, 0, 0, -10, color);
      b.box(w - 20, 90, 6, 0, h - 110, d / 2 - 17, '#e9e9e9');
      b.cyl(25, 25, 10, w / 2 - 80, h - 70, d / 2 - 12, '#888').rotateX(Math.PI / 2);
      const r = Math.min(w, h) * 0.3;
      const ring = b.cyl(r, r, 20, 0, h * 0.42 - 10, d / 2 - 10, '#cfd3d6', METAL);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = h * 0.42;
      const glass = b.cyl(r * 0.78, r * 0.78, 24, 0, h * 0.42, d / 2 - 8, it.type === 'washer' ? '#28394a' : '#3b3b3b', { rough: 0.1 });
      glass.rotation.x = Math.PI / 2;
      glass.position.y = h * 0.42;
      break;
    }
    case 'laundry_tub': {
      b.box(w, h - 250, d, 0, 0, 0, '#f1f1ee');
      b.box(w, 250, d, 0, h - 250, 0, color, METAL);
      b.box(w - 60, 2, d - 120, 0, h, 20, '#7d848a', METAL);
      b.cyl(15, 15, 260, 0, h, -d / 2 + 40, STEEL, METAL);
      b.box(20, 20, 160, 0, h + 240, -d / 2 + 110, STEEL, METAL);
      break;
    }
    case 'office_chair': {
      const arm = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(30, 25, w * 0.45), m(DARK, METAL));
        leg.position.set(Math.sin((i * 2 * Math.PI) / 5) * w * 0.22, 40, Math.cos((i * 2 * Math.PI) / 5) * w * 0.22);
        leg.rotation.y = (i * 2 * Math.PI) / 5;
        arm.add(leg);
      }
      g.add(arm);
      b.cyl(22, 22, 380, 0, 50, 0, STEEL, METAL);
      b.box(w * 0.75, 80, d * 0.72, 0, 430, 20, color);
      b.box(w * 0.7, h - 560, 60, 0, 560, -d * 0.36, color);
      break;
    }
    case 'stairs': {
      const n = Math.max(2, Math.round(h / 180));
      const rise = h / n;
      const run = d / n;
      for (let i = 0; i < n; i++) b.box(w, rise * (i + 1), run, 0, 0, d / 2 - run * (i + 0.5), color);
      break;
    }
    case 'bench_seat':
      b.box(w, h - 80, d, 0, 0, 0, color);
      b.box(w - 20, 80, d - 20, 0, h - 80, 0, '#a7b1ba');
      break;
    case 'car': {
      const wr = Math.min(340, h * 0.22);
      b.box(w, h * 0.42, d, 0, wr * 0.6, 0, color, { metal: 0.4, rough: 0.35 });
      b.box(w * 0.86, h * 0.36, d * 0.48, 0, wr * 0.6 + h * 0.42, -d * 0.05, '#20262c', { rough: 0.1 });
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, 220, 24), m('#151515'));
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(sx * (w / 2 - 110), wr, sz * d * 0.32);
          wheel.castShadow = true;
          g.add(wheel);
        }
      for (const sx of [-1, 1]) b.box(180, 80, 10, sx * (w / 2 - 200), wr * 0.6 + h * 0.25, -d / 2 - 2, '#fff6d8', { emissive: '#888866' });
      break;
    }
    case 'deck':
      if (it.corners) deckShaped(b, it);
      else deck(b, it);
      break;
    case 'veranda': {
      // Its floor can sit below the house floor; the roof still meets the house at the same height.
      const top = verandaFloor(it);
      verandaSlab(b, it, top, Math.min(0, ctx.ground ?? 0));
      if (it.options?.roof === 'none') break; // open: just the slab
      if (it.underRoof && ctx.plate) coveredPorch(b, it, ctx.plate, top, 3600, false);
      else veranda(b, it, m, top);
      break;
    }
    case 'porch':
      if (it.underRoof && ctx.plate) coveredPorch(b, it, ctx.plate, 150, 3600);
      else porch(b, it, m);
      break;
    case 'pergola':
      pergola(b, it);
      break;
    case 'patio':
      if (it.corners) patioShaped(b, it);
      else patio(b, it);
      break;
    case 'step':
      step(b, it);
      break;
    case 'column':
      // Holding up the roof: runs up to the top of the walls.
      b.box(w, ctx.plate ? ctx.plate - it.elevation : h, d, 0, 0, 0, color);
      break;
    case 'box':
    default: {
      const fs = FRIDGE_STYLE[it.type];
      if (fs) fridge(b, it, fs);
      else b.box(w, h, d, 0, 0, 0, color);
    }
  }
  return g;
}

/**
 * Build a door/window in wall-local space: x along the wall (centre of the opening at x = 0),
 * z along the wall normal, y up. `t` is the wall thickness.
 */
export function buildOpening(
  o: Opening,
  t: number,
  wallHeight: number,
  m: MatFn,
  cutHeight: number,
  outside?: number,
  trimSpec: OpeningTrim = { type: 'square66', width: DOOR_TRIM, profile: SKIRTINGS.square66 },
  /** How far each hinged leaf opens (degrees, in doorLeaves order): fully (90°) unless something's in the way. */
  leafOpen: number[] = [],
): THREE.Group {
  const g = new THREE.Group();
  const b = new Builder(g, m);
  const w = o.width;
  const oh = Math.min(o.height, wallHeight - o.sill);
  const y0 = o.sill;
  const sgn = o.flip ? -1 : 1;
  const frameD = t + 20;
  const col = o.color;
  const visible = (y: number) => y < cutHeight;

  const frame = (fw = 40) => {
    b.box(fw, oh, frameD, -w / 2 + fw / 2, y0, 0, col);
    b.box(fw, oh, frameD, w / 2 - fw / 2, y0, 0, col);
    if (visible(y0 + oh - fw)) b.box(w, fw, frameD, 0, y0 + oh - fw, 0, col);
  };

  // Where the closed leaf sits across the wall: against the stop of a single-rebated jamb (near the swing
  // face), or against the centre stop of a double-rebated jamb.
  const double = o.jamb === 'double';
  const leafZ = double ? sgn * (STOP_W / 2 + 19) : sgn * (t / 2 - 20);
  const leaf = (hingeX: number, dir: number, lw: number, open: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(hingeX, y0, leafZ);
    const lb = new Builder(pivot, m);
    doorLeaf(lb, o, dir, lw, Math.min(oh - JAMB - 3, cutHeight - y0), col);
    drawHandle(lb, o, dir, lw);
    pivot.rotation.y = -dir * sgn * open;
    pivot.userData.doorLeaf = { id: o.id, open: pivot.rotation.y }; // walk-through opens/closes it
    g.add(pivot);
  };
  /** Jamb linings with a door stop (single or double rebated), plus architraves on the inside faces. */
  const trim = '#f7f6f2';
  /** Jamb linings round one section [cx ± ww/2] of the opening, optionally with a door stop. */
  const jambSection = (cx: number, ww: number, withStop: boolean) => {
    const depth = t + 2;
    const headY = y0 + oh - JAMB;
    for (const sx of [-1, 1]) b.box(JAMB, oh, depth, cx + sx * (ww / 2 - JAMB / 2), y0, 0, trim);
    if (visible(headY)) b.box(ww, JAMB, depth, cx, headY, 0, trim);
    if (withStop) {
      // Single rebate: the stop is on the far side of the closed leaf. Double rebate: a centre stop.
      const stopZ = double ? 0 : leafZ - sgn * (19 + STOP_W / 2);
      for (const sx of [-1, 1]) b.box(STOP_D, oh - JAMB, STOP_W, cx + sx * (ww / 2 - JAMB - STOP_D / 2), y0, stopZ, trim);
      if (visible(headY - STOP_D)) b.box(ww - 2 * JAMB, STOP_D, STOP_W, cx, headY - STOP_D, stopZ, trim);
    }
  };
  /**
   * Architraves round the opening on faces that aren't the outside of the house: the chosen profile (a skirting
   * section, scaled to the trim's width) up both sides and across the head, mitred at the corners, lapping 10 mm
   * over the jamb. `apronY`: windows with a sill get a length under it, its top edge here. `frame`: the trim also
   * runs along the bottom, mitred into the sides (windows without a sill).
   */
  const architraves = (bottom = y0, lap = 10, apronY?: number, frame = false) => {
    const A = trimSpec.width;
    if (A <= 0 || !trimSpec.profile.points.length) return;
    const shadow = !!trimSpec.profile.shadow;
    const across = shadow ? 10 : A; // a shadow line is just a narrow dark gap
    const pts = trimSpec.profile.points;
    const ph = Math.max(...pts.map((p) => p[1])) || 1;
    // Profile [out from the wall, height] → [across from the outer edge, out from the wall].
    const shape = new THREE.Shape(pts.map(([out, h]) => new THREE.Vector2((h / ph) * across, out)));
    const mat = m(shadow ? '#2b2b2b' : trim);
    const inner = w / 2 - lap; // inner edge, from the centre
    const headIn = y0 + oh - lap;
    const fits = headIn + across <= wallHeight; // room for the head below the ceiling
    const headOn = fits && visible(headIn + across);
    const sideTop = Math.min(headOn ? headIn + across : Math.min(headIn, wallHeight), cutHeight);
    for (const face of [-1, 1]) {
      if (outside !== undefined && face === outside) continue;
      const out = new THREE.Vector3(0, 0, face);
      /** One length: outer edge from p0 along u for len, `c` pointing across towards the opening; mitred ends k0/k1. */
      const piece = (p0: THREE.Vector3, u: THREE.Vector3, c: THREE.Vector3, len: number, k0: number, k1: number) => {
        if (len <= 1) return;
        // Keep the basis right-handed (c × out = u) so faces aren't turned inside out: run it the other way if not.
        if (new THREE.Vector3().crossVectors(c, out).dot(u) < 0) {
          p0 = p0.clone().addScaledVector(u, len);
          u = u.clone().negate();
          [k0, k1] = [k1, k0];
        }
        const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: 4 });
        const pos = geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const z = pos.getZ(i);
          if (z < 0.01) pos.setZ(i, z + k0 * x);
          else if (z > len - 0.01) pos.setZ(i, z - k1 * x);
        }
        geo.applyMatrix4(new THREE.Matrix4().makeBasis(c, out, u).setPosition(p0.x, p0.y, p0.z + face * (t / 2)));
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        g.add(mesh);
      };
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3(1, 0, 0);
      const mitre = headOn && sideTop === headIn + across ? 1 : 0;
      const sillIn = y0 + lap; // frame: inner edge of the bottom length
      const frameOn = frame && sillIn - across > 0 && visible(sillIn);
      const base = frameOn ? sillIn - across : bottom;
      const k0 = frameOn ? 1 : 0;
      piece(new THREE.Vector3(-inner - across, base, 0), up, right, sideTop - base, k0, mitre);
      piece(new THREE.Vector3(inner + across, base, 0), up, right.clone().negate(), sideTop - base, k0, mitre);
      if (frameOn) piece(new THREE.Vector3(-inner - across, base, 0), right, up, 2 * (inner + across), 1, 1);
      if (headOn) piece(new THREE.Vector3(-inner - across, headIn + across, 0), right, up.clone().negate(), 2 * (inner + across), 1, 1);
      if (apronY !== undefined && apronY - across > 0 && visible(apronY - across))
        piece(new THREE.Vector3(-inner - across, apronY - across, 0), right, up, 2 * (inner + across), 0, 0);
    }
  };
  const jambs = (withStop: boolean) => {
    jambSection(0, w, withStop);
    architraves();
  };
  /** Fixed glazed sidelight between x0 and x1: kick panel, glass, top rail, in the door's colour and glass. */
  const sidelightPanel = (x0: number, x1: number) => {
    jambSection((x0 + x1) / 2, x1 - x0, false);
    const ix0 = x0 + JAMB;
    const ix1 = x1 - JAMB;
    const iw = ix1 - ix0;
    const cx = (ix0 + ix1) / 2;
    const headY = Math.min(y0 + oh - JAMB, cutHeight);
    const match = DOOR_DESIGNS[o.design ?? '']?.sidelight;
    if (match) {
      // Matching sidelight panel (e.g. Ivy Willow / Oaklands sidelites).
      const holder = new THREE.Group();
      holder.position.set(ix0 + 3, y0, leafZ);
      g.add(holder);
      drawLeaf(new Builder(holder, m), match, 1, iw - 6, headY - y0 - 3, col, o.glass, 40);
      return;
    }
    const kick = 300;
    const stile = 50;
    b.box(iw, kick, 38, cx, y0, leafZ, col);
    if (headY - 60 > y0 + kick) b.box(iw, 60, 38, cx, headY - 60, leafZ, col);
    for (const sx of [-1, 1]) b.box(stile, Math.max(0, headY - y0 - kick), 38, cx + sx * (iw / 2 - stile / 2), y0 + kick, leafZ, col);
    const gTop = headY - 60;
    if (gTop > y0 + kick) {
      const clear = o.glass === 'clear';
      b.box(iw - 2 * stile, gTop - y0 - kick, 8, cx, y0 + kick, leafZ, clear ? '#bfe3f0' : '#e6eef1', { opacity: clear ? 0.3 : 0.78 });
    }
  };

  switch (o.kind) {
    case 'door': {
      // Door section, with any sidelights beside it.
      const sl = sidelights(o);
      const dx0 = -w / 2 + sl.left;
      const dx1 = w / 2 - sl.right;
      jambSection((dx0 + dx1) / 2, dx1 - dx0, true);
      architraves();
      if (sl.left > 0) sidelightPanel(-w / 2, dx0);
      if (sl.right > 0) sidelightPanel(dx1, w / 2);
      leaf(o.hingeEnd ? dx1 - JAMB - 3 : dx0 + JAMB + 3, o.hingeEnd ? -1 : 1, dx1 - dx0 - 2 * JAMB - 6, THREE.MathUtils.degToRad(leafOpen[0] ?? 90));
      if (DOOR_DESIGNS[o.design ?? '']?.layout === 'ivy_arch') {
        // Arched door in a square frame: fill the two corners above the arch (spandrels) in the trim colour.
        const iw = dx1 - dx0 - 2 * JAMB;
        const rr = iw / 2;
        const headY = y0 + oh - JAMB;
        const spring = headY - rr;
        if (spring < cutHeight) {
          const sp = new THREE.Shape();
          sp.moveTo(-rr, spring);
          sp.lineTo(-rr, headY - y0 + y0);
          sp.lineTo(rr, headY);
          sp.lineTo(rr, spring);
          sp.absarc(0, spring, rr, 0, Math.PI, false);
          const sg = new THREE.ExtrudeGeometry(sp, { depth: t, bevelEnabled: false, curveSegments: 24 });
          sg.translate((dx0 + dx1) / 2, 0, -t / 2);
          const mesh = new THREE.Mesh(sg, m(trim));
          mesh.castShadow = true;
          g.add(mesh);
        }
      }
      break;
    }
    case 'double_door':
      jambs(true);
      // Two leaves with DOOR_GAP at each edge and between them.
      leaf(-w / 2 + JAMB + DOOR_GAP, 1, doubleDoorLeaf(w), THREE.MathUtils.degToRad(leafOpen[0] ?? 90));
      leaf(w / 2 - JAMB - DOOR_GAP, -1, doubleDoorLeaf(w), THREE.MathUtils.degToRad(leafOpen[1] ?? 90));
      break;
    case 'cavity_door': {
      jambs(false);
      const lw = w - 80;
      const dir = o.hingeEnd ? 1 : -1;
      // Fully open: slid into the wall pocket with its leading edge flush with the jamb face.
      b.box(lw, Math.min(oh - 45, cutHeight - y0), 38, dir * (w / 2 - JAMB + lw / 2), y0, 0, col);
      break;
    }
    case 'sliding_door': {
      frame(50);
      b.box(w, 20, frameD, 0, y0, 0, col);
      const pw = w * 0.52;
      for (const [x, z] of [
        [-w / 2 + pw / 2, -25],
        [w / 2 - pw / 2, 25],
      ]) {
        const ph = oh - 70;
        b.box(pw - 20, ph - 80, 8, x, y0 + 60, z, '#bfe3f0', GLASS);
        b.box(pw - 20, 40, 40, x, y0 + 20, z, col);
        if (visible(y0 + ph - 20)) b.box(pw - 20, 40, 40, x, y0 + ph - 20, z, col);
        b.box(45, ph, 40, x - pw / 2 + 32, y0 + 20, z, col);
        b.box(45, ph, 40, x + pw / 2 - 32, y0 + 20, z, col);
      }
      break;
    }
    case 'stacker_door': {
      // Aluminium frame with one track per panel; panel 0 is fixed at the stacking end, the rest slide over it.
      // Each sliding panel is tagged so the walk-through can slide it open (dx = how far it moves to stack).
      frame(50);
      b.box(w, 20, frameD, 0, y0, 0, col);
      const lay = stackerLayout(o);
      const ph = oh - 70;
      const pitch = Math.min(34, (frameD - 30) / lay.n);
      for (const p of lay.panels) {
        const pg = new THREE.Group();
        pg.position.set(p.closed, 0, (p.track - (lay.n - 1) / 2) * pitch);
        if (p.track > 0) pg.userData.doorSlide = { id: o.id, base: p.closed, dx: p.open - p.closed };
        const pb = new Builder(pg, b.m);
        const pw = lay.pw;
        pb.box(pw - 50, ph - 100, 8, 0, y0 + 70, 0, '#bfe3f0', GLASS);
        pb.box(pw, 50, 28, 0, y0 + 20, 0, col); // bottom rail
        if (visible(y0 + ph - 30)) pb.box(pw, 50, 28, 0, y0 + ph - 30, 0, col); // top rail
        pb.box(45, ph, 30, -pw / 2 + 22, y0 + 20, 0, col); // stiles
        pb.box(45, ph, 30, pw / 2 - 22, y0 + 20, 0, col);
        // A flush pull on the leading stile of the panel furthest from the stack.
        if (p.track === lay.n - 1) pb.box(16, 260, 36, -lay.dir * (pw / 2 - 22), y0 + 900, 0, '#1f2226', METAL);
        b.g.add(pg);
      }
      break;
    }
    case 'garage_door': {
      frame(60);
      garageDoor(b, o, w, oh, y0, t, Math.min(oh, cutHeight - y0), col, outside ?? sgn);
      break;
    }
    case 'window': {
      if (!visible(y0)) break;
      const fw = 50;
      const fd = 90;
      const top = Math.min(y0 + oh, cutHeight);
      const hh = top - y0;
      b.box(w, fw, fd, 0, y0, 0, col);
      if (top === y0 + oh) b.box(w, fw, fd, 0, top - fw, 0, col);
      b.box(fw, hh, fd, -w / 2 + fw / 2, y0, 0, col);
      b.box(fw, hh, fd, w / 2 - fw / 2, y0, 0, col);
      if (w > 1000) b.box(fw * 0.8, hh, fd * 0.8, 0, y0, 0, col);
      b.box(w - 2 * fw, hh - 2 * fw, 8, 0, y0 + fw, 0, '#bfe3f0', GLASS);
      if (o.windowSill !== false) {
        // Sill: reaches a little past the trim either side.
        const at = trimSpec.width > 0 && trimSpec.profile.points.length ? trimSpec.width : 0;
        b.box(w + Math.max(60, 2 * at + 40), 25, t + 60, 0, y0 - 25, 0, '#e9e6df');
        // Trim round the inside: up both sides from the sill, across the head and a length under the sill.
        architraves(y0, 0, y0 - 25);
      } else architraves(y0, 0, undefined, true); // no sill: trim right round, like a picture frame
      break;
    }
    case 'opening':
      break;
  }
  if (o.dressing) windowDressing(b, o, w, oh, y0, t, wallHeight, cutHeight, outside);
  // Invisible grab area filling the opening, so clicking anywhere in a doorway/window picks it.
  const ph = Math.max(10, Math.min(oh, cutHeight - y0));
  if (y0 < cutHeight) {
    const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    const pickBox = new THREE.Mesh(new THREE.BoxGeometry(w, ph, t + 40), pickMat);
    pickBox.position.set(0, y0 + ph / 2, 0);
    pickBox.userData.pickOnly = true;
    g.add(pickBox);
  }
  return g;
}

// ---------- Outdoor structures ----------

/** Posts along the front edge (and back corners if `back`), at most `maxSpan` apart. */
function postXs(w: number, maxSpan: number, inset: number) {
  const n = Math.max(1, Math.ceil((w - 2 * inset) / maxSpan));
  return Array.from({ length: n + 1 }, (_, i) => -w / 2 + inset + ((w - 2 * inset) * i) / n);
}

function deck(b: Builder, it: Item) {
  const { width: w, depth: d, height: h, color } = it;
  const board = 22;
  const top = Math.max(board, h);
  const frame = shade(color, 0.55);
  // Substructure: posts and bearers under the boards (visible on raised decks).
  if (top > 60) {
    const sub = top - board;
    for (const x of postXs(w, 1800, 100)) for (const z of [-d / 2 + 100, 0, d / 2 - 100]) b.box(90, sub, 90, x, 0, z, frame);
    for (const z of [-d / 2 + 100, 0, d / 2 - 100]) b.box(w - 60, Math.min(140, sub), 70, 0, sub - Math.min(140, sub), z, frame);
  }
  // Decking boards (86 mm + 4 mm gap) running parallel to the house.
  for (let z = -d / 2; z < d / 2 - 1; z += 90) b.box(w, board, Math.min(86, d / 2 - z), 0, top - board, z + Math.min(86, d / 2 - z) / 2, shade(color, 0.92 + ((Math.abs(z) * 7) % 10) / 60));
  // Fascia boards round the edge.
  if (top > 60) {
    b.box(w, top, 20, 0, 0, d / 2 - 10, shade(color, 0.85));
    for (const sx of [-1, 1]) b.box(20, top, d, sx * (w / 2 - 10), 0, 0, shade(color, 0.85));
  }
  // Balustrade on decks 1 m or more above the ground (front and sides).
  if (top >= 1000) {
    const bh = 1000;
    const glass = { opacity: 0.3 };
    b.box(w, bh - 60, 12, 0, top + 30, d / 2 - 30, '#bfe3f0', glass);
    for (const sx of [-1, 1]) b.box(12, bh - 60, d, sx * (w / 2 - 30), top + 30, 0, '#bfe3f0', glass);
    b.box(w, 40, 60, 0, top + bh - 40, d / 2 - 30, frame);
    for (const sx of [-1, 1]) b.box(60, 40, d, sx * (w / 2 - 30), top + bh - 40, 0, frame);
  }
}

/**
 * Retaining sides for raised fill: a block in the edge finish from the ground up to `h`, with joint lines on its
 * faces for coursed finishes (brick, block, stone, sleepers).
 */
function fillBlock(b: Builder, w: number, h: number, d: number, x: number, z: number, edge: { color: string; course: number }) {
  b.box(w, h, d, x, 0, z, edge.color, { rough: 0.92 });
  if (!edge.course || h < edge.course) return;
  const joint = shade(edge.color, 0.72);
  for (let y = edge.course; y < h - 5; y += edge.course) {
    for (const sz of [-1, 1]) b.box(w, 6, 2, x, y - 3, z + sz * (d / 2 + 1), joint);
    for (const sx of [-1, 1]) b.box(2, 6, d, x + sx * (w / 2 + 1), y - 3, z, joint);
  }
}

/** Paving: a slab with joints every `grid` mm, its top at `top`. */
function paving(b: Builder, w: number, d: number, x: number, z: number, top: number, thick: number, color: string, grid = 400) {
  b.box(w, thick, d, x, top - thick, z, color, { rough: 0.95 });
  const joint = shade(color, 0.7);
  for (let gx = -w / 2 + grid; gx < w / 2 - 1; gx += grid) b.box(6, 2, d, x + gx, top, z, joint);
  for (let gz = -d / 2 + grid; gz < d / 2 - 1; gz += grid) b.box(w, 2, 6, x, top, z + gz, joint);
}

/** Patio: paving on the ground, or raised on fill with retaining sides (and the paving overhanging them a little). */
function patio(b: Builder, it: Item) {
  const { width: w, depth: d, height: h, color } = it;
  const o = outdoorOpts(it);
  if (h <= PAVE * 2.5) {
    paving(b, w, d, 0, 0, Math.max(10, h), Math.max(10, h), color);
    return;
  }
  fillBlock(b, w, h - PAVE, d, 0, 0, { color: o.edgeColor, course: o.edge.course });
  paving(b, w + 2 * NOSE, d + 2 * NOSE, 0, 0, h, PAVE, color);
}

/** A single step: a solid block up to its tread (L-shaped for corner steps), paved on top with a nosing. */
function step(b: Builder, it: Item) {
  const { width: w, depth: d, height: h, color } = it;
  const o = outdoorOpts(it);
  const edge = { color: o.edgeColor, course: o.edge.course };
  const pave = Math.min(PAVE, h / 2);
  const parts = o.shape === 'corner' ? cornerLegs(it) : [[-w / 2, -d / 2, w / 2, d / 2] as [number, number, number, number]];
  for (const [x0, y0, x1, y1] of parts) {
    const pw = x1 - x0;
    const pd = y1 - y0;
    const cx = (x0 + x1) / 2;
    const cz = (y0 + y1) / 2;
    fillBlock(b, pw, h - pave, pd, cx, cz, edge);
    // Nosing over the open edges (front, and the outer side of a corner step).
    const out = (e: number, lim: number) => (Math.abs(e - lim) < 1 ? NOSE : 0);
    const nx0 = out(x0, -w / 2);
    const nx1 = out(x1, w / 2);
    const nz1 = out(y1, d / 2);
    paving(b, pw + nx0 + nx1, pd + nz1, cx + (nx1 - nx0) / 2, cz + nz1 / 2, h, pave, color, 600);
  }
}

/**
 * The room's cornice along a bulkhead where it meets the ceiling (at `top`, item-local): across the front and back
 * along both ends, mitred at the two outside corners. Profile x = out from the face, y = down from the ceiling.
 */
function bulkheadCornice(b: Builder, w: number, d: number, top: number, profile: [number, number][], color: string) {
  const shape = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  const mat = b.m(color, { rough: 0.8 });
  (mat as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  const run = (face: THREE.Vector3, out: THREE.Vector3, along: THREE.Vector3, len: number, mitreStart: boolean, mitreEnd: boolean) => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: 4 });
    // Outside corners: each end reaches further the further the profile stands out, so the pieces meet.
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      if (mitreStart && z < 0.01) pos.setZ(i, z - x);
      else if (mitreEnd && z > len - 0.01) pos.setZ(i, z + x);
    }
    geo.applyMatrix4(new THREE.Matrix4().makeBasis(out, new THREE.Vector3(0, -1, 0), along).setPosition(face));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    b.g.add(mesh);
  };
  const X = new THREE.Vector3(1, 0, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  run(new THREE.Vector3(-w / 2, top, d / 2), Z, X, w, true, true); // front
  run(new THREE.Vector3(w / 2, top, d / 2), X, Z.clone().negate(), d, true, false); // right end, front to back
  run(new THREE.Vector3(-w / 2, top, d / 2), X.clone().negate(), Z.clone().negate(), d, true, false); // left end
}

// ---------- Reshaped outdoor structures (any four-cornered outline, see shape.ts) ----------

/** A slab with this outline (item-local plan points), from y0 up h. */
function prism(b: Builder, poly: Vec[], y0: number, h: number, color: string, opts?: MatOpts) {
  if (h < 0.5) return;
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  // Shape x / y are plan x / y; extruded along +z, turned so it rises from y0 (plan y becomes the item's z).
  geo.rotateX(Math.PI / 2);
  geo.translate(0, y0 + h, 0);
  const mesh = new THREE.Mesh(geo, b.m(color, opts));
  mesh.castShadow = !opts?.opacity;
  mesh.receiveShadow = true;
  b.g.add(mesh);
  return mesh;
}

/** A thin board / panel along an edge of the outline (from a to c), t thick, from y0 up h. */
function edgeBox(b: Builder, a: Vec, c: Vec, y0: number, h: number, t: number, color: string, opts?: MatOpts) {
  const len = Math.hypot(c.x - a.x, c.y - a.y);
  if (len < 1) return;
  const mesh = b.box(len, h, t, (a.x + c.x) / 2, y0, (a.y + c.y) / 2, color, opts);
  mesh.rotation.y = -Math.atan2(c.y - a.y, c.x - a.x);
}

/** Joint / groove lines across the outline every `step` mm (along x for 'y' lines, along y for 'x' lines). */
function outlineLines(b: Builder, poly: Vec[], along: 'x' | 'y', step: number, y: number, color: string) {
  const vals = poly.map((p) => (along === 'x' ? p.x : p.y));
  for (let at = Math.min(...vals) + step; at < Math.max(...vals) - 1; at += step)
    for (const [p, q] of polyCuts(poly, along, at)) {
      if (along === 'y') b.box(q - p, 2, 6, (p + q) / 2, y, at, color);
      else b.box(6, 2, q - p, at, y, (p + q) / 2, color);
    }
}

/** Deck with a reshaped outline: boards, fascia, posts at the corners and along the edges, balustrade when high. */
function deckShaped(b: Builder, it: Item) {
  const { height: h, color } = it;
  const poly = localCorners(it);
  const board = 22;
  const top = Math.max(board, h);
  const frame = shade(color, 0.55);
  prism(b, poly, top - board, board, shade(color, 0.95));
  outlineLines(b, poly, 'y', 90, top, shade(color, 0.7));
  if (top > 60) {
    const c = poly.reduce((acc, p) => add(acc, mul(p, 1 / poly.length)), v(0, 0));
    // Posts in from each corner and along each edge (at most 1.8 m apart), and a fascia round the edge.
    poly.forEach((a, i) => {
      const e = poly[(i + 1) % poly.length];
      const n = Math.max(1, Math.ceil(Math.hypot(e.x - a.x, e.y - a.y) / 1800));
      for (let k = 0; k < n; k++) {
        const p = add(a, mul(sub(e, a), k / n));
        const q = add(p, mul(norm(sub(c, p)), 100));
        b.box(90, top - board, 90, q.x, 0, q.y, frame);
      }
      edgeBox(b, a, e, 0, top, 20, shade(color, 0.85));
    });
  }
  // Balustrade on decks 1 m or more above the ground, round every edge but the back (the house side).
  if (top >= 1000)
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i];
      const e = poly[(i + 1) % poly.length];
      edgeBox(b, a, e, top + 30, 940, 12, '#bfe3f0', { opacity: 0.3 });
      edgeBox(b, a, e, top + 960, 40, 60, frame);
    }
}

/** Patio with a reshaped outline: paving on the ground, or raised on fill with retaining sides. */
function patioShaped(b: Builder, it: Item) {
  const { height: h, color } = it;
  const o = outdoorOpts(it);
  const poly = localCorners(it);
  const pave = h <= PAVE * 2.5 ? Math.max(10, h) : PAVE;
  if (h > pave) prism(b, poly, 0, h - pave, o.edgeColor, { rough: 0.92 });
  prism(b, poly, h - pave, pave, color, { rough: 0.95 });
  outlineLines(b, poly, 'x', 400, h, shade(color, 0.7));
  outlineLines(b, poly, 'y', 400, h, shade(color, 0.7));
}

/** Sloping roof sheet from (zBack, yBack) to (zFront, yFront), across the full width. */
function sheet(g: THREE.Object3D, m: MatFn, color: string, w: number, zBack: number, yBack: number, zFront: number, yFront: number) {
  const run = zFront - zBack;
  const fall = yBack - yFront;
  const len = Math.hypot(run, fall);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 30, len), m(color, { metal: 0.25, rough: 0.5 }));
  mesh.rotation.x = Math.atan2(fall, run);
  mesh.position.set(0, (yBack + yFront) / 2 + 15, (zBack + zFront) / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
}

/**
 * A veranda's slab, its top at `top` (house-floor relative); below a raised one, fill with retaining sides down to
 * the ground.
 */
function verandaSlab(b: Builder, it: Item, top: number, ground: number) {
  const { width: w, depth: d } = it;
  const slab = 100;
  if (it.corners) {
    const poly = localCorners(it);
    prism(b, poly, top - slab, slab, '#c9c5bd', { rough: 0.95 });
    if (top - slab - ground > 5) prism(b, poly, ground, top - slab, outdoorOpts({ type: 'patio', options: it.options }).edgeColor, { rough: 0.92 });
    return;
  }
  b.box(w, slab, d, 0, top - slab, 0, '#c9c5bd', { rough: 0.95 });
  const fillTop = top - slab;
  if (fillTop - ground > 5) {
    const o = outdoorOpts({ type: 'patio', options: it.options });
    b.box(w - 2, fillTop - ground, d - 2, 0, ground, 0, o.edgeColor, { rough: 0.92 });
  }
}

function veranda(b: Builder, it: Item, m: MatFn, top: number) {
  const { width: w, depth: d, height: h, color } = it;
  const post = '#efece2';
  const fall = Math.tan((5 * Math.PI) / 180) * d; // 5° roof fall away from the house
  const hFront = h - fall;
  for (const x of postXs(w, 3600, 60)) b.box(90, hFront - 100 - top, 90, x, top, d / 2 - 60, post);
  b.box(w, 200, 90, 0, hFront - 200, d / 2 - 60, post); // front beam
  b.box(w, 150, 90, 0, h - 150, -d / 2 + 45, post); // ledger on the house wall
  for (const x of postXs(w, 900, 45)) {
    // rafters
    const r = new THREE.Mesh(new THREE.BoxGeometry(45, 90, Math.hypot(d, fall)), b.m(post));
    r.rotation.x = Math.atan2(fall, d);
    r.position.set(x, (h + hFront) / 2 - 75, 0);
    r.castShadow = true;
    b.g.add(r);
  }
  sheet(b.g, m, color, w + 100, -d / 2, h, d / 2 + 150, hFront - Math.tan((5 * Math.PI) / 180) * 150);
  b.box(w + 100, 100, 110, 0, hFront - 120, d / 2 + 180, color, { metal: 0.3, rough: 0.5 }); // gutter
}

function porch(b: Builder, it: Item, m: MatFn) {
  const { width: w, depth: d, height: h, color } = it;
  const post = '#efece2';
  const pitch = (25 * Math.PI) / 180;
  const half = w / 2 + 150;
  const rise = Math.tan(pitch) * half;
  b.box(w, 150, d, 0, 0, 0, '#c9c5bd', { rough: 0.95 }); // step / landing
  for (const sx of [-1, 1]) b.box(110, h - 150 - 200, 110, sx * (w / 2 - 80), 150, d / 2 - 80, post);
  b.box(w, 200, 110, 0, h - 200, d / 2 - 80, post);
  for (const sx of [-1, 1]) b.box(110, 200, d, sx * (w / 2 - 80), h - 200, 0, post);
  // Gable roof with its ridge running out from the house.
  for (const sx of [-1, 1]) {
    const len = Math.hypot(half, rise);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(len, 30, d + 200), m(color, { metal: 0.25, rough: 0.5 }));
    panel.rotation.z = sx * -pitch;
    panel.position.set((sx * half) / 2, h + rise / 2 + 15, 100);
    panel.castShadow = true;
    b.g.add(panel);
  }
  // Gable end infill facing the front.
  const tri = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rise * (w / 2 / half))]);
  const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 30, bevelEnabled: false }), b.m(post));
  gable.position.set(0, h, d / 2 - 60);
  gable.castShadow = true;
  b.g.add(gable);
}

function pergola(b: Builder, it: Item) {
  const { width: w, depth: d, height: h, color } = it;
  for (const x of postXs(w, 3600, 60)) for (const z of [-d / 2 + 60, d / 2 - 60]) b.box(90, h - 190, 90, x, 0, z, color);
  for (const z of [-d / 2 + 60, d / 2 - 60]) b.box(w + 300, 190, 65, 0, h - 190, z, shade(color, 0.9));
  for (let x = -w / 2; x <= w / 2 + 1; x += Math.min(600, w / 2)) b.box(45, 140, d + 300, Math.min(x, w / 2 - 22), h, 0, color);
}

/** Veranda/porch under the main roof: just the floor, posts and a beam up to the roof's eaves. */
function coveredPorch(b: Builder, it: Item, plate: number, floor: number, span: number, slab = true) {
  const { width: w, depth: d } = it;
  const post = '#efece2';
  if (slab) b.box(w, floor, d, 0, 0, 0, '#c9c5bd', { rough: 0.95 });
  for (const x of postXs(w, span, 60)) b.box(90, plate - floor - 200, 90, x, floor, d / 2 - 60, post);
  b.box(w, 200, 90, 0, plate - 200, d / 2 - 60, post);
  for (const sx of [-1, 1]) b.box(90, 200, d, sx * (w / 2 - 45), plate - 200, 0, post);
}

/**
 * Garage door leaf, closed, sitting just inside the outer face of the wall. `sgn` points to the side the
 * door is seen from (its outside face).
 */
function garageDoor(b: Builder, o: Opening, w: number, oh: number, y0: number, t: number, ph: number, col: string, sgn: number) {
  const dw = w - 120;
  const zf = sgn * (t / 2 - 50); // door plane, set back from the outer face
  const face = zf + sgn * 22; // front of the leaf
  const dark = shade(col, 0.72);
  const style = o.style ?? 'sectional';
  if (style !== 'glass') b.box(dw, ph, 40, 0, y0, zf, col, { metal: style === 'timber' ? 0 : 0.2, rough: 0.55 });
  const groove = (y: number, h = 10) => y < ph && b.box(dw, h, 6, 0, y0 + y, face, dark);
  switch (style) {
    case 'sectional':
    case 'sectional_windows': {
      const n = 4;
      for (let i = 1; i < n; i++) groove((oh * i) / n - 5, 12);
      // Subtle horizontal ribs on each panel
      for (let i = 0; i < n; i++) groove((oh * (i + 0.5)) / n, 4);
      if (style === 'sectional_windows') {
        const cols = Math.max(2, Math.round(dw / 600));
        const ww = dw / cols - 120;
        const y = (oh * 3) / 4 + 90;
        if (y + oh / 4 - 180 < ph)
          for (let c = 0; c < cols; c++)
            b.box(ww, oh / 4 - 180, 6, -dw / 2 + (dw / cols) * (c + 0.5), y0 + y, face + sgn * 2, '#1f2a33', { rough: 0.1, metal: 0.3 });
      }
      break;
    }
    case 'roller': {
      for (let y = 40; y < ph; y += 75) groove(y, 18);
      b.box(dw, 60, 10, 0, y0, face, dark); // bottom rail
      // Roller drum hood inside the garage, above the opening
      b.box(w, 450, 450, 0, y0 + oh - 50, -sgn * (t / 2 + 225), '#9a9c9e', { metal: 0.4, rough: 0.5 });
      break;
    }
    case 'tilt': {
      const tr = 70;
      b.box(dw, tr, 6, 0, y0, face, dark);
      groove(ph - tr, tr);
      b.box(tr, ph, 6, -dw / 2 + tr / 2, y0, face, dark);
      b.box(tr, ph, 6, dw / 2 - tr / 2, y0, face, dark);
      b.box(dw * 0.22, 26, 14, 0, y0 + 900, face + sgn * 8, '#9a9a9a', { metal: 0.7, rough: 0.3 }); // handle
      break;
    }
    case 'timber': {
      for (let x = -dw / 2 + 85; x < dw / 2; x += 85) b.box(8, ph, 6, x, y0, face, shade(col, 0.6));
      for (let i = 1; i < 4; i++) groove((oh * i) / 4 - 3, 6);
      break;
    }
    case 'glass': {
      const rows = 4;
      const cols = Math.max(3, Math.round(dw / 700));
      const bar = 50;
      for (let i = 0; i <= rows; i++) groove(Math.min(ph - bar, (oh * i) / rows - (i === rows ? bar : 0)), bar);
      for (let c = 0; c <= cols; c++) b.box(bar, ph, 8, -dw / 2 + bar / 2 + ((dw - bar) * c) / cols, y0, face, col, { metal: 0.5, rough: 0.35 });
      // frosted glass fill between the bars
      b.box(dw - 20, ph - 20, 4, 0, y0 + 10, face - sgn * 4, '#cfdde3', { opacity: 0.75 });
      break;
    }
  }
}

// ---------- Doors: jambs and leaf designs ----------
const JAMB = DOOR_JAMB; // jamb lining thickness
const STOP_W = 37; // door stop width (across the wall)
const STOP_D = 12; // how far the stop stands out from the jamb

type R = [number, number, number, number]; // x0, y0, x1, y1 in leaf coordinates (x from the hinge)

/** Leaf layout: glass openings, raised panels and grooves for each design. */
/** Outline of a rectangle as four thin routed grooves. */
function routed([x0, y0, x1, y1]: R, w = 6): R[] {
  return [
    [x0, y0, x1, y0 + w],
    [x0, y1 - w, x1, y1],
    [x0, y0, x0 + w, y1],
    [x1 - w, y0, x1, y1],
  ];
}

function leafLayout(design: string, lw: number, lh: number): { glass: R[]; panels: R[]; grooves: R[] } {
  if (design.startsWith('hume:')) {
    const h = humeLayout(design.slice(5), lw, lh);
    if (h) return h;
  }
  const st = Math.min(120, lw * 0.15); // stile width
  switch (design) {
    case 'shaker':
      return { glass: [], panels: [[st, 200, lw - st, lh - 200]], grooves: [] };
    case 'accent': {
      // Routed vertical grooves set towards the latch side
      const grooves: R[] = [];
      for (let i = 0; i < 3; i++) grooves.push([lw * 0.55 + i * 70, 200, lw * 0.55 + i * 70 + 6, lh - 200]);
      return { glass: [], panels: [], grooves };
    }
    case 'accent_glass': {
      const grooves: R[] = [];
      for (let i = 0; i < 2; i++) grooves.push([lw * 0.5 + i * 70, 200, lw * 0.5 + i * 70 + 6, lh - 200]);
      return { glass: [[lw * 0.5 + 160, 200, lw * 0.5 + 260, lh - 200]], panels: [], grooves };
    }
    case 'grooves_h': {
      const grooves: R[] = [];
      for (let y = 300; y < lh - 250; y += 300) grooves.push([0, y, lw, y + 6]);
      return { glass: [], panels: [], grooves };
    }
    case 'panels2':
      return {
        glass: [],
        panels: [
          [st, 180, lw - st, lh * 0.45],
          [st, lh * 0.5, lw - st, lh - 150],
        ],
        grooves: [],
      };
    case 'panels6': {
      const panels: R[] = [];
      const mid = lw / 2;
      const rows: [number, number][] = [
        [150, lh * 0.36],
        [lh * 0.4, lh * 0.72],
        [lh * 0.76, lh - 130],
      ];
      for (const [y0, y1] of rows) panels.push([st, y0, mid - 40, y1], [mid + 40, y0, lw - st, y1]);
      return { glass: [], panels, grooves: [] };
    }
    case 'madison': {
      const grooves: R[] = [];
      for (const r of [
        [st, 160, lw - st, lh * 0.32],
        [st, lh * 0.36, lw - st, lh * 0.64],
        [st, lh * 0.68, lw - st, lh - 130],
      ] as R[])
        grooves.push(...routed(r));
      return { glass: [], panels: [], grooves };
    }
    case 'madison_glass': {
      const grooves: R[] = [...routed([st, 160, lw - st, lh * 0.32]), ...routed([st, lh * 0.36, lw - st, lh * 0.55])];
      return { glass: [[st, lh * 0.6, lw - st, lh - 130]], panels: [], grooves };
    }
    case 'motive': {
      const grooves: R[] = [];
      for (let i = 0; i < 4; i++) {
        const y = lh * 0.3 + i * 120;
        grooves.push([st, y, lw - st, y + 6]);
      }
      return { glass: [], panels: [], grooves };
    }
    case 'moda':
      return { glass: [[lw / 2 - 60, 250, lw / 2 + 60, lh - 250]], panels: [], grooves: [] };
    case 'veneer':
      return { glass: [], panels: [], grooves: [] };
    case 'ham1_glass':
    case 'ham1_panel': {
      // Hume Hampton HAM1: shaker frame (≈115 mm stiles and top rail, deeper bottom rail) round one
      // full-height glass panel, or an inlaid MDF panel.
      const s2 = Math.min(115, lw * 0.15);
      const r: R = [s2, 205, lw - s2, lh - 115];
      return design === 'ham1_glass' ? { glass: [r], panels: [], grooves: [] } : { glass: [], panels: [], grooves: routed(r, 10) };
    }
    case 'ivy':
    case 'ivy_breeze':
    case 'oaklands':
    case 'oaklands_breeze': {
      // Front Porch Properties: four lites (2 × 2) over a lower panel — a plain recessed panel (Ivy Willow)
      // or VJ boards (Oaklands). Proportions taken from the product photos.
      const oak = design.startsWith('oaklands');
      const s2 = Math.min(120, lw * 0.14);
      const mun = 36;
      const gTop = lh - (oak ? 160 : 150);
      const gBot = oak ? lh * 0.5 : lh * 0.31;
      const gMid = (gBot + gTop) / 2;
      const xm = lw / 2;
      const glass: R[] = [
        [s2, gBot, xm - mun / 2, gMid - mun / 2],
        [xm + mun / 2, gBot, lw - s2, gMid - mun / 2],
        [s2, gMid + mun / 2, xm - mun / 2, gTop],
        [xm + mun / 2, gMid + mun / 2, lw - s2, gTop],
      ];
      const low: R = [s2, 150, lw - s2, gBot - 140];
      if (!oak) return { glass, panels: [low], grooves: [] };
      const grooves: R[] = [...routed(low)];
      for (let x = low[0] + 90; x < low[2] - 30; x += 90) grooves.push([x, low[1], x + 5, low[3]]);
      return { glass, panels: [], grooves };
    }
    case 'hav44':
    case 'hav45': {
      // Hume Haven HAV44 / HAV45 sidelite, proportions from Hume's catalogue drawing (2040 × 820 door): lites from
      // 27% to 93% of the height split by 26 mm glazing bars, one routed panel below from 7% to 23%.
      const side = design === 'hav45';
      const s2 = side ? Math.min(96, lw * 0.24) : Math.min(130, lw * 0.143);
      const bar = side ? 22 : 26;
      const gBot = lh * 0.267;
      const gTop = lh * 0.934;
      const gMid = (gBot + gTop) / 2;
      const xm = lw / 2;
      const glass: R[] = side
        ? [
            [s2, gBot, lw - s2, gMid - bar / 2],
            [s2, gMid + bar / 2, lw - s2, gTop],
          ]
        : [
            [s2, gBot, xm - bar / 2, gMid - bar / 2],
            [xm + bar / 2, gBot, lw - s2, gMid - bar / 2],
            [s2, gMid + bar / 2, xm - bar / 2, gTop],
            [xm + bar / 2, gMid + bar / 2, lw - s2, gTop],
          ];
      return { glass, panels: [[s2, lh * 0.072, lw - s2, lh * 0.233]], grooves: [] };
    }
    case 'ivy_side':
    case 'oaklands_side': {
      // Matching sidelight: two lites stacked over the same lower panel.
      const oak = design.startsWith('oaklands');
      const s2 = Math.min(90, lw * 0.2);
      const mun = 36;
      const gTop = lh - (oak ? 160 : 150);
      const gBot = oak ? lh * 0.5 : lh * 0.31;
      const gMid = (gBot + gTop) / 2;
      const glass: R[] = [
        [s2, gBot, lw - s2, gMid - mun / 2],
        [s2, gMid + mun / 2, lw - s2, gTop],
      ];
      const low: R = [s2, 150, lw - s2, gBot - 140];
      if (!oak) return { glass, panels: [low], grooves: [] };
      const grooves: R[] = [...routed(low)];
      for (let x = low[0] + 90; x < low[2] - 30; x += 90) grooves.push([x, low[1], x + 5, low[3]]);
      return { glass, panels: [], grooves };
    }
    case 'savoy':
      return { glass: [[lw / 2 - 90, 300, lw / 2 + 90, lh - 300]], panels: [], grooves: [] };
    case 'linear': {
      const grooves: R[] = [];
      for (let y = 150; y < lh - 100; y += 150) grooves.push([30, y, lw - 300, y + 6]);
      return { glass: [[lw - 230, 250, lw - 130, lh - 250]], panels: [], grooves };
    }
    case 'newington': {
      const glass: R[] = [];
      for (let i = 0; i < 4; i++) {
        const y = lh * 0.38 + i * 160;
        glass.push([lw * 0.3, y, lw * 0.3 + Math.min(420, lw * 0.55), y + 80]);
      }
      return { glass, panels: [], grooves: [] };
    }
    case 'vaucluse':
      return {
        glass: [[st, lh * 0.62, lw - st, lh - 130]],
        panels: [
          [st, 160, lw - st, lh * 0.3],
          [st, lh * 0.33, lw - st, lh * 0.58],
        ],
        grooves: [],
      };
    case 'joinery': {
      const glass: R[] = [];
      const gx0 = st;
      const gx1 = lw - st;
      const mid = (gx0 + gx1) / 2;
      const top = lh - 120;
      const bot = lh * 0.47;
      const rh = (top - bot - 2 * 40) / 3;
      for (let r = 0; r < 3; r++)
        for (const [a, b] of [
          [gx0, mid - 20],
          [mid + 20, gx1],
        ]) {
          const y = bot + r * (rh + 40);
          glass.push([a, y, b, y + rh]);
        }
      return { glass, panels: [[st, 220, lw - st, lh * 0.43]], grooves: [] };
    }
    case 'haven':
      return {
        glass: [
          [st, 250, lw / 2 - 20, lh * 0.72],
          [lw / 2 + 20, 250, lw - st, lh * 0.72],
          [st, lh * 0.72 + 40, lw - st, lh - 130],
        ],
        panels: [],
        grooves: [],
      };
    default:
      return { glass: [], panels: [], grooves: [] };
  }
}

/** The leaf rectangle minus the glass openings, as boxes. */
function solidMinusHoles(lw: number, lh: number, holes: R[]): R[] {
  const ys = [...new Set([0, lh, ...holes.flatMap((h) => [h[1], h[3]])])].filter((y) => y >= 0 && y <= lh).sort((a, b) => a - b);
  const out: R[] = [];
  for (let i = 0; i + 1 < ys.length; i++) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    const mid = (y0 + y1) / 2;
    const cuts = holes.filter((h) => h[1] <= mid && h[3] >= mid).sort((a, b) => a[0] - b[0]);
    let x = 0;
    for (const h of cuts) {
      if (h[0] > x) out.push([x, y0, h[0], y1]);
      x = Math.max(x, h[2]);
    }
    if (x < lw) out.push([x, y0, lw, y1]);
  }
  return out;
}

/** How each glass type looks. Reeded glass also gets fine vertical reeds. */
function glassLook(type?: string): { color: string; opacity: number; reeds: boolean } {
  switch (type) {
    case 'clear':
      return { color: '#bfe3f0', opacity: 0.3, reeds: false };
    case 'cathedral':
      return { color: '#d6e6dc', opacity: 0.62, reeds: false };
    case 'reeded':
      return { color: '#e3edf0', opacity: 0.6, reeds: true };
    case 'frosted':
      return { color: '#eef3f4', opacity: 0.86, reeds: false };
    case 'grey':
      return { color: '#7f878b', opacity: 0.55, reeds: false };
    default:
      return { color: '#e6eef1', opacity: 0.78, reeds: false };
  }
}

/** A door leaf: solid timber with the design's glass, raised panels and grooves (both faces). */
function doorLeaf(b: Builder, o: Opening, dir: number, lw: number, lh: number, col: string) {
  const def = DOOR_DESIGNS[o.design ?? 'flush'];
  const layout = def?.layout ?? o.design ?? 'flush';
  const T = def?.use === 'internal' ? 35 : 40;
  if (layout === 'ivy_arch') archLeaf(b, dir, lw, lh, col, o.glass, T);
  else drawLeaf(b, layout, dir, lw, lh, col, o.glass, T);
}

/** Draw a leaf / sidelight panel with a layout, running from x=0 to dir·lw. */
function drawLeaf(b: Builder, layout: string, dir: number, lw: number, lh: number, col: string, glassType: string | undefined, T: number) {
  const L = leafLayout(layout, lw, lh);
  const glass = L.glass.filter((r) => r[3] <= lh - 10); // cutaway may shorten the leaf
  const X = (x: number) => dir * x; // leaf coords run from the hinge
  for (const [x0, y0, x1, y1] of solidMinusHoles(lw, lh, glass)) b.box(x1 - x0, y1 - y0, T, X((x0 + x1) / 2), y0, 0, col);
  const look = glassLook(glassType);
  for (const [x0, y0, x1, y1] of glass) {
    b.box(x1 - x0, y1 - y0, 6, X((x0 + x1) / 2), y0, 0, look.color, { opacity: look.opacity });
    if (look.reeds) for (let x = x0 + 12; x < x1 - 4; x += 12) b.box(2, y1 - y0, 7, X(x), y0, 0, '#ffffff', { opacity: 0.35 });
    // glazing beads round each lite, both faces
    for (const z of [-1, 1]) {
      b.box(x1 - x0 + 16, 8, 8, X((x0 + x1) / 2), y0 - 8, z * 15, shade(col, 0.9));
      b.box(x1 - x0 + 16, 8, 8, X((x0 + x1) / 2), y1, z * 15, shade(col, 0.9));
      b.box(8, y1 - y0, 8, X(x0 - 4), y0, z * 15, shade(col, 0.9));
      b.box(8, y1 - y0, 8, X(x1 + 4), y0, z * 15, shade(col, 0.9));
    }
  }
  // Breeze 2-in-1: black security mesh behind the glass, and black mini hinges on the glass panels.
  if (layout.endsWith('_breeze') && glass.length) {
    const gx0 = Math.min(...glass.map((g) => g[0]));
    const gx1 = Math.max(...glass.map((g) => g[2]));
    const gy0 = Math.min(...glass.map((g) => g[1]));
    const gy1 = Math.max(...glass.map((g) => g[3]));
    b.box(gx1 - gx0, gy1 - gy0, 2, X((gx0 + gx1) / 2), gy0, -10, '#1c1c1c', { opacity: 0.55 });
    for (const y of [gy0 + 80, gy1 - 120]) for (const x of [gx0 - 6, gx1 + 6]) b.box(10, 40, 12, X(x), y, T / 2 + 4, '#1a1a1a', METAL);
  }
  for (const [x0, y0, x1, y1] of L.panels)
    if (y1 <= lh)
      for (const z of [-1, 1]) {
        b.box(x1 - x0, y1 - y0, 6, X((x0 + x1) / 2), y0, z * (T / 2 + 3), shade(col, 0.97));
        b.box(x1 - x0 - 60, y1 - y0 - 60, 6, X((x0 + x1) / 2), y0 + 30, z * (T / 2 + 6), shade(col, 1.02));
      }
  for (const [x0, y0, x1, y1] of L.grooves)
    if (y1 <= lh) for (const z of [-1, 1]) b.box(x1 - x0, y1 - y0, 2, X((x0 + x1) / 2), y0, z * (T / 2 + 0.5), shade(col, 0.65));
}

/**
 * Arch Ivy Willow: a leaf with a semicircular head, an arched glass opening divided 2 × 2 by muntins,
 * and a recessed lower panel.
 */
function archLeaf(b: Builder, dir: number, lw: number, lh: number, col: string, glassType: string | undefined, T: number) {
  const r = lw / 2;
  const st = Math.min(120, lw * 0.14);
  const gBot = lh * 0.31;
  const ri = r - st; // inner arch radius
  const spring = lh - r; // where the arch starts
  const outline = new THREE.Shape();
  outline.moveTo(0, 0);
  outline.lineTo(lw, 0);
  outline.lineTo(lw, spring);
  outline.absarc(r, spring, r, 0, Math.PI, false);
  outline.lineTo(0, 0);
  const hole = new THREE.Path();
  hole.moveTo(st, gBot);
  hole.lineTo(lw - st, gBot);
  hole.lineTo(lw - st, spring);
  hole.absarc(r, spring, ri, 0, Math.PI, false);
  hole.lineTo(st, gBot);
  outline.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(outline, { depth: T, bevelEnabled: false, curveSegments: 24 });
  geo.translate(0, 0, -T / 2);
  geo.scale(dir, 1, 1);
  const leaf = new THREE.Mesh(geo, b.m(col));
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  b.g.add(leaf);
  // Glass in the arched opening
  const glassShape = new THREE.Shape();
  glassShape.moveTo(st, gBot);
  glassShape.lineTo(lw - st, gBot);
  glassShape.lineTo(lw - st, spring);
  glassShape.absarc(r, spring, ri, 0, Math.PI, false);
  glassShape.lineTo(st, gBot);
  const gGeo = new THREE.ExtrudeGeometry(glassShape, { depth: 6, bevelEnabled: false, curveSegments: 24 });
  gGeo.translate(0, 0, -3);
  gGeo.scale(dir, 1, 1);
  const look = glassLook(glassType);
  const glass = new THREE.Mesh(gGeo, b.m(look.color, { opacity: look.opacity }));
  b.g.add(glass);
  // Muntins: a vertical bar up the middle and a horizontal bar halfway up the glass.
  const X = (x: number) => dir * x;
  const gMid = (gBot + spring) / 2;
  b.box(36, lh - st - gBot, T - 6, X(r), gBot, 0, col);
  b.box(lw - 2 * st, 36, T - 6, X(r), gMid - 18, 0, col);
  // Lower recessed panel
  for (const z of [-1, 1]) {
    b.box(lw - 2 * st, gBot - 290, 6, X(r), 150, z * (T / 2 + 3), shade(col, 0.97));
    b.box(lw - 2 * st - 60, gBot - 350, 6, X(r), 180, z * (T / 2 + 6), shade(col, 1.02));
  }
}

// ---------- Timberline vanity (configurable) ----------
function timberlineVanity(b: Builder, it: Item) {
  const o = { ...VANITY_DEFAULTS, ...(it.options ?? {}) };
  const { width: w, depth: d, height: h, color } = it;
  const topT = o.top === 'silk' || o.basin === 'integrated' ? 30 : 20;
  const topCol = o.basin === 'integrated' || o.top === 'silk' ? '#f6f6f3' : String(o.topColor);
  const boxTop = h - topT;
  // Cabinet: wall-hung boxes float; floor-standing ones sit on legs or a recessed kickboard.
  const base = o.mounting === 'wall' ? Math.max(150, boxTop - 480) : o.mounting === 'legs' ? 160 : 100;
  if (o.mounting === 'legs')
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(35, base, 35, sx * (w / 2 - 40), 0, sz * (d / 2 - 40), shade(color, 0.6));
  if (o.mounting === 'kick') b.box(w - 20, base, d - 60, 0, 0, -20, shade(color, 0.55));
  b.box(w, boxTop - base, d - 18, 0, base, -9, color);
  const curved = o.style === 'curved';
  if (curved)
    for (const sx of [-1, 1]) {
      const c = b.cyl(60, 60, boxTop - base, sx * (w / 2 - 60), base, d / 2 - 78, color);
      c.castShadow = true;
    }
  // Fronts: columns of doors or rows of drawers.
  const fh = boxTop - base;
  const cols = Math.max(1, Math.round(w / 600));
  const rows = o.fronts === 'drawers' ? (fh > 420 ? 2 : 1) : 1;
  const zf = d / 2 - 18;
  const pw = (curved ? w - 120 : w) / cols;
  const x0 = -(curved ? w - 120 : w) / 2;
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const fw = pw - 4;
      const fhh = fh / rows - 4;
      const cx = x0 + pw * (c + 0.5);
      const y = base + (fh / rows) * r + 2;
      b.box(fw, fhh, 18, cx, y, zf + 9, color);
      const face = zf + 18;
      switch (o.style) {
        case 'shaker': {
          const rail = Math.min(60, fw * 0.12);
          b.box(fw, rail, 6, cx, y, face + 3, shade(color, 1.03));
          b.box(fw, rail, 6, cx, y + fhh - rail, face + 3, shade(color, 1.03));
          for (const sx of [-1, 1]) b.box(rail, fhh, 6, cx + sx * (fw / 2 - rail / 2), y, face + 3, shade(color, 1.03));
          break;
        }
        case 'vgroove':
          for (let x = -fw / 2 + 50; x < fw / 2 - 10; x += 50) b.box(4, fhh, 2, cx + x, y, face + 1, shade(color, 0.7));
          break;
        case 'fluted':
          for (let x = -fw / 2 + 15; x < fw / 2 - 5; x += 30) {
            const fl = b.cyl(11, 11, fhh, cx + x, y, face, shade(color, 1.04), undefined, 8);
            fl.scale.z = 0.5;
          }
          break;
        case 'slab':
          b.box(fw, 12, 8, cx, y + fhh - 12, face - 2, shade(color, 0.55)); // finger-pull shadow line
          break;
      }
      // Handles (not on handleless slab fronts)
      if (o.style !== 'slab') {
        if (o.fronts === 'drawers') b.box(Math.min(160, fw * 0.4), 12, 14, cx, y + fhh - 70, face + 12, '#b8b2a6', METAL);
        else b.box(12, 140, 14, cx + (c % 2 === 0 ? fw / 2 - 50 : -fw / 2 + 50), y + fhh - 220, face + 12, '#b8b2a6', METAL);
      }
    }
  // Top and basins
  const top = b.box(w + (curved ? 0 : 10), topT, d, 0, boxTop, 0, topCol, { rough: 0.25 });
  void top;
  const bowls = Number(o.bowls) >= 2 && w >= 1200 ? 2 : 1;
  for (let i = 0; i < bowls; i++) {
    const x = -w / 2 + (w / bowls) * (i + 0.5);
    const r = Math.min(220, w / bowls / 2.8);
    if (o.basin === 'above') {
      const bowl = b.cyl(r, r * 0.8, 130, x, h, 30, '#ffffff', { rough: 0.15 });
      bowl.scale.z = 0.8;
      b.cyl(r * 0.8, r * 0.8, 2, x, h + 128, 30, '#d7dde0', { rough: 0.1 });
    } else {
      // Undercounter / integrated: a recessed bowl seen through the top
      const well = b.cyl(r, r, 3, x, h, 40, o.basin === 'integrated' ? '#e9ecec' : '#dfe4e6', { rough: 0.15 });
      well.scale.z = 0.7;
    }
    // Mixer tap behind each bowl
    b.cyl(16, 16, o.basin === 'above' ? 300 : 200, x, h, -d / 2 + 50, '#c9ccce', METAL);
    b.box(20, 20, 120, x, h + (o.basin === 'above' ? 280 : 180), -d / 2 + 100, '#c9ccce', METAL);
  }
}

/**
 * Buffet and hutch modelled on Provincial Home Living's Rochester (natural oak): a 12-drawer buffet on a plinth,
 * then a hutch with two open bays below two glazed cabinets (two doors each, two shelves) under a stepped cornice.
 * Proportions follow the product photos and scale with the item's size.
 */
function buffetHutch(b: Builder, it: Item) {
  const { width: W, depth: D, height: H, color: c } = it;
  const inside = shade(c, 0.82);
  const knob = '#2a2420';
  const bronze: MatOpts = { metal: 0.6, rough: 0.4 };
  const glass: MatOpts = { opacity: 0.22 };
  const back = -D / 2;
  /** Box between a front and a back z (front = +z). */
  const slab = (w: number, h: number, front: number, rear: number, x: number, y: number, col = c) => b.box(w, h, front - rear, x, y, (front + rear) / 2, col);

  // ---- Buffet ----
  const bh = Math.min(780, H * 0.355); // worktop height
  const plinth = Math.min(115, bh * 0.15);
  const top = 40;
  const bodyW = W - 90;
  const bodyFront = D / 2 - 40;
  slab(W - 60, plinth, bodyFront + 15, back, 0, 0);
  slab(bodyW, bh - plinth - top, bodyFront, back, 0, plinth);
  slab(W - 40, top, D / 2, back, 0, bh - top); // worktop, overhanging the front
  // Drawers: inset fronts with a raised panel and a bronze knob.
  const cols = Math.max(2, Math.round(W / 580));
  const rows = H >= 1500 ? 3 : 2;
  const fx0 = -bodyW / 2 + 40;
  const fy0 = plinth + 30;
  const fw = (bodyW - 80) / cols;
  const fh = (bh - top - 30 - fy0) / rows;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = fx0 + fw * (i + 0.5);
      const y = fy0 + fh * j;
      slab(fw - 30, fh - 28, bodyFront + 10, bodyFront - 5, x, y + 14, shade(c, 1.04));
      slab(fw - 90, fh - 70, bodyFront + 16, bodyFront + 10, x, y + 35, shade(c, 1.09));
      b.sphere(14, x, y + fh / 2, bodyFront + 30, knob, bronze);
    }

  // ---- Hutch ----
  const hw = W - 165;
  const hd = Math.min(D * 0.78, 400);
  const hFront = back + hd;
  const corniceH = Math.min(100, H * 0.045);
  const hutchTop = H - corniceH;
  const side = 40;
  const bay = Math.min(300, (hutchTop - bh) * 0.24); // open bays
  const sill = 30;
  const cab0 = bh + bay + sill; // bottom of the glazed cabinets
  const cab1 = hutchTop - 35; // under the top rail
  for (const sx of [-1, 1]) slab(side, hutchTop - bh, hFront, back, sx * (hw / 2 - side / 2), bh);
  slab(side, hutchTop - bh, hFront, back, 0, bh); // centre post
  b.box(hw - 2 * side, hutchTop - bh, 15, 0, bh, back + 7.5, inside); // back panel
  slab(hw, sill, hFront, back, 0, bh + bay); // floor of the cabinets / top of the bays
  slab(hw, hutchTop - cab1, hFront, back, 0, cab1); // top rail
  // Cabinet shelves (seen through the glass).
  for (const k of [1 / 3, 2 / 3]) slab(hw - 2 * side, 20, hFront - 30, back + 15, 0, cab0 + (cab1 - cab0) * k, inside);
  // Doors: two per cabinet, each a frame round a single pane of slightly blue glass.
  const stile = 45;
  const doorFront = hFront + 22;
  const halves: [number, number][] = [
    [-hw / 2 + side, -side / 2],
    [side / 2, hw / 2 - side],
  ];
  for (const [x0, x1] of halves) {
    const dw = (x1 - x0) / 2;
    for (let k = 0; k < 2; k++) {
      const a = x0 + dw * k + 2;
      const z = dw - 4; // door width
      const cx = a + z / 2;
      const dh = cab1 - cab0 - 4;
      const y = cab0 + 2;
      slab(z, stile, doorFront, hFront, cx, y);
      slab(z, stile, doorFront, hFront, cx, y + dh - stile);
      slab(stile, dh, doorFront, hFront, a + stile / 2, y);
      slab(stile, dh, doorFront, hFront, a + z - stile / 2, y);
      b.box(z - 2 * stile, dh - 2 * stile, 5, cx, y + stile, hFront + 11, '#b9d3db', glass);
      // Knobs where the pair of doors meet; small hinges on the outer edges.
      const meet = k === 0 ? a + z - stile / 2 : a + stile / 2;
      b.sphere(13, meet, y + dh / 2, doorFront + 14, knob, bronze);
      const hingeX = k === 0 ? a + 3 : a + z - 3;
      for (const hy of [y + 120, y + dh / 2, y + dh - 160]) b.box(6, 40, 10, hingeX, hy, doorFront - 6, knob, bronze);
    }
  }
  // Stepped cornice, flush at the back.
  slab(hw + 40, corniceH * 0.35, hFront + 20, back, 0, hutchTop);
  slab(hw + 110, corniceH * 0.3, hFront + 55, back, 0, hutchTop + corniceH * 0.35, shade(c, 1.05));
  slab(W, corniceH * 0.35, hFront + 85, back, 0, hutchTop + corniceH * 0.65);
}

/**
 * Split system air conditioner, indoor wall unit (after Panasonic's Z series): a smooth white body with a gently
 * curved front, the air outlet and swing louvre underneath, and a small display at the bottom right.
 */
function acIndoor(b: Builder, it: Item) {
  const { width: w, depth: d, height: h, color: c } = it;
  // Side profile: x = out from the wall (0 at the back), y = up.
  const s = new THREE.Shape();
  s.moveTo(0, h * 0.14);
  s.lineTo(0, h);
  s.lineTo(d * 0.72, h);
  s.quadraticCurveTo(d, h, d, h * 0.76);
  s.lineTo(d, h * 0.36);
  s.quadraticCurveTo(d, h * 0.12, d * 0.8, h * 0.08);
  s.lineTo(d * 0.3, 0);
  s.lineTo(d * 0.08, 0);
  s.lineTo(0, h * 0.14);
  const geo = new THREE.ExtrudeGeometry(s, { depth: w - 16, bevelEnabled: true, bevelThickness: 8, bevelSize: 6, bevelSegments: 3, curveSegments: 10 });
  // Extruded along +z; turn it so the width runs along x and the profile's x points out (+z, the front).
  geo.rotateY(-Math.PI / 2);
  geo.translate(w / 2 - 8, 0, -d / 2);
  const body = new THREE.Mesh(geo, b.m(c, { rough: 0.35 }));
  body.castShadow = true;
  body.receiveShadow = true;
  b.g.add(body);
  // Front panel seam, the outlet slot and the louvre.
  b.box(w - 40, 2, 3, 0, h * 0.4, d / 2 + 1, shade(c, 0.86));
  b.box(w - 80, 26, d * 0.45, 0, h * 0.02, d * 0.08, '#2a2c2e');
  const louvre = b.box(w - 90, 6, d * 0.32, 0, h * 0.05, d * 0.3, shade(c, 0.97));
  louvre.rotation.x = 0.35;
  // Display and status light.
  b.box(70, 14, 3, w / 2 - 110, h * 0.17, d / 2 - 3, '#33373b');
  b.box(8, 4, 4, w / 2 - 90, h * 0.17 + 5, d / 2 - 1, '#5fd38a', { rough: 0.2 });
}

/** Split system outdoor unit: cabinet with a round fan grille on the left and a service panel on the right. */
function acOutdoor(b: Builder, it: Item) {
  const { width: w, depth: d, height: h, color: c } = it;
  const feet = 40;
  for (const sx of [-1, 1]) b.box(70, feet, d + 30, sx * (w / 2 - 80), 0, 0, '#4a4d50');
  b.box(w, h - feet, d, 0, feet, 0, c, { rough: 0.5 });
  // Fan grille.
  const r = Math.min((h - feet) * 0.4, w * 0.3);
  const cx = -w / 2 + r + 70;
  const cy = feet + (h - feet) / 2;
  const fan = new THREE.Mesh(new THREE.CircleGeometry(r, 40), b.m('#26282a'));
  fan.position.set(cx, cy, d / 2 + 1);
  b.g.add(fan);
  for (let k = 1; k <= 6; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry((r * k) / 6, 3, 6, 48), b.m(shade(c, 0.9)));
    ring.position.set(cx, cy, d / 2 + 4);
    b.g.add(ring);
  }
  for (let k = 0; k < 4; k++) {
    const bar = b.box(r * 2, 6, 6, cx, cy - 3, d / 2 + 5, shade(c, 0.9));
    bar.rotation.z = (k * Math.PI) / 4;
    bar.position.set(cx, cy, d / 2 + 5);
  }
  // Service panel and a few vents on the side.
  b.box(w * 0.22, (h - feet) * 0.45, 4, w / 2 - w * 0.14, feet + (h - feet) * 0.3, d / 2 + 2, shade(c, 0.95));
  for (let k = 0; k < 6; k++) b.box(4, (h - feet) * 0.5, d * 0.6, -w / 2 - 1, feet + (h - feet) * 0.25, -d * 0.3 + k * d * 0.12, '#9a9c9e');
  b.box(w + 10, 12, d + 10, 0, h - 12, 0, shade(c, 0.97)); // lid lip
}

/**
 * Upholstered banquette: a panelled base (colour = the item colour) on a recessed kick, a seat cushion and a
 * back in the chosen style and fabric. The L version runs along the back and down one side, sharing the corner.
 */
function banquette(b: Builder, it: Item) {
  const o = { ...BANQUETTE_DEFAULTS, ...(it.options ?? {}) };
  const { width: w, depth: d, height: h, color: frame } = it;
  const fabric = String(o.fabric);
  const soft: MatOpts = { rough: 0.95 };
  const seatH = Math.max(300, Math.min(Number(o.seatHeight) || 460, h - 150));
  const L = it.type === 'banquette_l';
  const sd = L ? Math.min(600, w / 2, d / 2) : d; // seat depth including the back
  const backT = Math.min(150, sd * 0.25);
  const cushion = 80;
  const kick = 70;

  /**
   * One straight run along local x, back at -z. `skip0` / `skip1`: length at each end with a back but no seat
   * (where it meets the other run's seat in a corner). `end0` / `end1`: finish that end with a side panel.
   */
  const run = (len: number, skip0: number, skip1: number, end0: boolean, end1: boolean) => {
    const g = new THREE.Group();
    const r = new Builder(g, b.m);
    const z0 = -sd / 2;
    const x0 = -len / 2 + skip0;
    const x1 = len / 2 - skip1;
    const seatLen = x1 - x0;
    const sx = (x0 + x1) / 2;
    if (seatLen > 1) {
      r.box(seatLen - 20, kick, sd - backT - 70, sx, 0, z0 + backT + (sd - backT - 70) / 2, '#2b2a28'); // kick recess
      r.box(seatLen, seatH - cushion - kick, sd - backT, sx, kick, z0 + backT + (sd - backT) / 2 - 10, frame); // base
      // Panel moulding on the base front.
      const panels = Math.max(1, Math.round(seatLen / 600));
      const pw = seatLen / panels;
      for (let i = 0; i < panels; i++)
        r.box(pw - 80, seatH - cushion - kick - 80, 6, x0 + pw * (i + 0.5), kick + 40, sd / 2 - 7, shade(frame, 0.95));
      r.box(seatLen - 10, cushion, sd - backT - 5, sx, seatH - cushion, z0 + backT + (sd - backT) / 2, fabric, soft); // seat
    }
    // Back board, full length, up to the top.
    r.box(len, h - seatH + cushion, 30, 0, seatH - cushion, z0 + 15, frame);
    r.box(len + 10, 25, 50, 0, h - 25, z0 + 20, frame); // capping
    const bh = h - seatH - 60; // back cushion height
    const by = seatH + 10;
    const bz = z0 + 30 + (backT - 30) / 2;
    switch (o.back) {
      case 'channel': {
        const n = Math.max(2, Math.round(len / 170));
        const cw = len / n;
        for (let i = 0; i < n; i++) r.box(cw - 12, bh, backT - 30, -len / 2 + cw * (i + 0.5), by, bz, fabric, soft);
        break;
      }
      case 'buttoned': {
        r.box(len - 10, bh, backT - 30, 0, by, bz, fabric, soft);
        const cols = Math.max(2, Math.round(len / 220));
        for (let i = 0; i < cols; i++)
          for (const k of [0.33, 0.7])
            r.sphere(9, -len / 2 + (len / cols) * (i + 0.5) + (k > 0.5 ? len / cols / 2 : 0), by + bh * k, z0 + backT, shade(fabric, 0.7), soft);
        break;
      }
      case 'plain':
        r.box(len - 10, bh, backT - 30, 0, by, bz, fabric, soft);
        break;
      default:
        // Timber back: the board is the back; add a few horizontal slats for interest.
        for (let k = 0; k < 3; k++) r.box(len - 20, 60, 20, 0, by + 40 + k * (bh / 3), z0 + 40, shade(frame, 1.05));
    }
    for (const [on, x] of [
      [end0, -len / 2 + 12],
      [end1, len / 2 - 12],
    ] as const)
      if (on) r.box(24, h - 40, sd, x, 0, 0, frame); // side panel
    return g;
  };

  if (!L) {
    b.g.add(run(w, 0, 0, true, true));
    return;
  }
  // L: along the back, then down the chosen side.
  const s = o.corner === 'right' ? 1 : -1;
  const a = run(w, 0, 0, s > 0, s < 0);
  a.position.z = -d / 2 + sd / 2;
  b.g.add(a);
  const len = d - backT;
  const skip = sd - backT; // the back run's seat already covers this bit
  const side = run(len, s > 0 ? skip : 0, s > 0 ? 0 : skip, s < 0, s > 0);
  side.rotation.y = -s * (Math.PI / 2);
  side.position.set(s * (w / 2 - sd / 2), 0, -d / 2 + backT + len / 2);
  b.g.add(side);
}

/**
 * Solid Tasmanian oak buffet (after Harvey Norman's Lombardozzi): a row of drawers under a solid top, doors
 * below, on tapered legs, with recessed finger pulls. The 2070 model has 3 drawers over 4 doors; narrower
 * sizes get fewer.
 */
function oakBuffet(b: Builder, it: Item) {
  const { width: w, depth: d, height: h, color: c } = it;
  const legH = Math.min(140, h * 0.18);
  const top = 30;
  const body = h - legH - top;
  const drawers = w < 1300 ? 2 : 3;
  const doors = w < 1300 ? 2 : w < 1800 ? 3 : 4;
  const front = d / 2 - 15;
  const groove = shade(c, 0.55);
  // Tapered legs, set in a little from the corners.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = b.cyl(16, 24, legH + 5, sx * (w / 2 - 70), 0, sz * (d / 2 - 70), shade(c, 0.95), undefined, 12);
      leg.rotation.z = sx * 0.05;
    }
  b.box(w - 20, body, d - 30, 0, legH, -15, c); // carcass
  b.box(w, top, d, 0, h - top, 0, shade(c, 1.05)); // solid top
  // Fronts: drawers across the top, doors below, each with a finger-pull groove and a thin shadow gap.
  const gap = 4;
  const drH = Math.min(170, body * 0.28);
  const fw = w - 40;
  const x0 = -fw / 2;
  for (let i = 0; i < drawers; i++) {
    const dw = fw / drawers;
    const cx = x0 + dw * (i + 0.5);
    b.box(dw - gap, drH - gap, 18, cx, h - top - drH, front, shade(c, 1.02));
    b.box(dw * 0.35, 12, 6, cx, h - top - drH + drH * 0.62, front + 9, groove);
  }
  const doorH = body - drH - 20;
  for (let i = 0; i < doors; i++) {
    const dw = fw / doors;
    const cx = x0 + dw * (i + 0.5);
    b.box(dw - gap, doorH - gap, 18, cx, legH + 10, front, c);
    // Vertical pull on the meeting edge (pairs meet in the middle of each pair).
    const edge = i % 2 === 0 ? 1 : -1;
    b.box(12, Math.min(220, doorH * 0.4), 6, cx + edge * (dw / 2 - 30), legH + 10 + doorH * 0.55, front + 9, groove);
  }
}

/**
 * VELUX skylight / Sun Tunnel. Inside: a hole in the ceiling with a trim, a white light shaft and a bright sky
 * panel at the top (Sun Tunnel: a round diffuser). Outside: the glazed unit (or dome) on its flashing, lying on
 * the roof slope. The roof itself isn't cut; the unit sits on it like the real thing.
 */
function skylight(b: Builder, it: Item, sky: ItemContext['sky']) {
  const { width: w, depth: d } = it;
  const o = { ...SKYLIGHT_DEFAULTS, ...(it.options ?? {}) };
  const tunnel = it.type === 'sun_tunnel';
  const ceiling = sky?.ceiling ?? 2700;
  const white = '#f7f7f5';
  const glow: MatOpts = { rough: 0.9 };
  const skyMat = () => {
    // Daylight: bright enough to read as sky through the tone mapping.
    const m = b.m('#ffffff', glow) as THREE.MeshStandardMaterial;
    const g = m.clone();
    g.emissive = new THREE.Color('#eef7ff');
    g.emissiveIntensity = 2.4;
    return g;
  };
  if (sky?.cutaway) return; // nothing above the cut
  if (tunnel) {
    const r = w / 2;
    // Ceiling diffuser with a trim ring.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 18, 14, 8, 40), b.m(white));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = ceiling - 10;
    b.g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r + 4, 40), skyMat());
    disc.rotation.x = Math.PI / 2;
    disc.position.y = ceiling - 6;
    b.g.add(disc);
    // Reflective tube up to the roof.
    const top = Math.max(ceiling + 150, sky?.shaftTop ?? ceiling + 400);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, top - ceiling, 24, 1, true), b.m('#d9dde0', { metal: 0.8, rough: 0.25 }));
    tube.position.y = (ceiling + top) / 2;
    b.g.add(tube);
  } else {
    // Ceiling trim around the opening, the shaft walls, and the glowing sky at the top.
    const top = Math.max(ceiling + 150, sky?.shaftTop ?? ceiling + 400);
    const sh = top - ceiling;
    // Shaft walls get some of the daylight bouncing down them.
    const lit = (m: THREE.Mesh) => {
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      mat.emissive = new THREE.Color('#ffffff');
      mat.emissiveIntensity = 0.45;
      m.material = mat;
    };
    for (const sx of [-1, 1]) {
      b.box(50, 12, d + 100, sx * (w / 2 + 25), ceiling - 12, 0, white);
      lit(b.box(16, sh, d, sx * (w / 2 + 8), ceiling, 0, white));
    }
    for (const sz of [-1, 1]) {
      b.box(w, 12, 50, 0, ceiling - 12, sz * (d / 2 + 25), white);
      lit(b.box(w + 32, sh, 16, 0, ceiling, sz * (d / 2 + 8), white));
    }
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), skyMat());
    pane.rotation.x = Math.PI / 2;
    pane.position.y = top;
    b.g.add(pane);
  }
  // On the roof.
  const roof = sky?.roof;
  if (!roof) return;
  const n = new THREE.Vector3(...roof.n).normalize();
  const u = new THREE.Vector3(1, 0, 0).addScaledVector(n, -n.x).normalize();
  const v = new THREE.Vector3().crossVectors(u, n).normalize(); // across the slope… or up it
  const unit = new THREE.Group();
  unit.matrixAutoUpdate = false;
  unit.matrix.makeBasis(u, n, v).setPosition(0, roof.y, 0);
  b.g.add(unit);
  const ub = new Builder(unit, b.m);
  const flash = '#4a4d50'; // VELUX grey aluminium
  if (tunnel) {
    const r = w / 2;
    ub.cyl(r + 90, r + 120, 20, 0, 0, 0, flash, METAL, 32);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r + 20, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), b.m('#dfeef6', { opacity: 0.45, rough: 0.1 }));
    dome.scale.y = 0.55;
    dome.position.y = 20;
    unit.add(dome);
    return;
  }
  const lw = w; // across
  const ll = d; // along the item's depth
  ub.box(lw + 80, 25, ll + 80, 0, 0, 0, flash, METAL); // flashing
  ub.box(lw, 70, ll, 0, 20, 0, flash, METAL); // frame
  ub.box(lw - 70, 6, ll - 70, 0, 88, 0, '#20313d', { metal: 0.6, rough: 0.08 }); // glass
  // Opening models: a top control bar; solar ones carry a small panel on it.
  if (o.model !== 'FS') {
    const upEnd = v.y >= 0 ? 1 : -1;
    ub.box(lw, 30, 60, 0, 85, upEnd * (ll / 2 - 30), flash, METAL);
    if (o.model === 'VSS') ub.box(lw * 0.5, 6, 45, 0, 116, upEnd * (ll / 2 - 30), '#16233a', { metal: 0.5, rough: 0.2 });
  }
}

/**
 * Boltless steel shelving (after Bunnings' Pinnacle heavy duty units): angle-section uprights, step beams front
 * and back with side ties at each tier, and particleboard shelves. Tiers default to 4 below 2 m, 5 above.
 */
function shelvingRack(b: Builder, it: Item) {
  const { width: w, depth: d, height: h, color: c } = it;
  const tiers = Math.max(2, Math.min(6, Math.round(Number(it.options?.tiers ?? (h > 2000 ? 5 : 4)))));
  const board = String(it.options?.board ?? '#c9a878');
  const post = 40;
  const steel: MatOpts = { metal: 0.35, rough: 0.55 };
  // Uprights: an L section at each corner (two thin plates), with small foot plates.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * (w / 2 - post / 2);
      const z = sz * (d / 2 - post / 2);
      b.box(post, h, 3, x, 0, sz * (d / 2 - 1.5), c, steel);
      b.box(3, h, post, sx * (w / 2 - 1.5), 0, z, c, steel);
      b.box(post + 10, 4, post + 10, x, 0, z, c, steel);
    }
  // Slotted look: a few lighter dashes up the front of each upright.
  for (const sx of [-1, 1])
    for (let y = 60; y < h - 40; y += 50) b.box(6, 22, 1, sx * (w / 2 - post / 2 - 6), y, d / 2 + 0.5, shade(c, 2.2));
  // Tiers: bottom shelf just off the floor, top shelf at the top, evenly spaced between.
  const y0 = 120;
  const y1 = h - 45;
  for (let i = 0; i < tiers; i++) {
    const y = y0 + ((y1 - y0) * i) / (tiers - 1);
    for (const sz of [-1, 1]) b.box(w - 2 * post + 6, 45, 30, 0, y, sz * (d / 2 - 15), c, steel); // step beams
    for (const sx of [-1, 1]) b.box(30, 35, d - 2 * post + 6, sx * (w / 2 - 15), y + 5, 0, c, steel); // side ties
    b.box(w - 2 * post - 10, 15, d - 50, 0, y + 45, 0, board, { rough: 0.85 }); // particleboard shelf
  }
}

/**
 * Curtains and blinds on the inside face of a window or glass door. Blinds sit just in front of the reveal
 * under a headbox; curtains hang in pleats from a rod above the window (wider than it, so they stack clear of
 * the glass when open), to the floor or just below the sill.
 */
function windowDressing(b: Builder, o: Opening, w: number, oh: number, y0: number, t: number, wallHeight: number, cutHeight: number, outside?: number) {
  const dr = o.dressing!;
  const s = outside !== undefined ? -outside : dressingSide(o, undefined);
  const face = s * (t / 2);
  const open = Math.max(0, Math.min(1, dr.open ?? 0));
  const col = dr.color;
  const top = Math.min(y0 + oh, wallHeight); // top of the opening
  if (dr.type === 'roller' || dr.type === 'roman' || dr.type === 'venetian') {
    const bw = w + 60;
    const head = Math.min(top + 90, wallHeight - 5); // top of the headbox
    if (head > cutHeight) return;
    const z = face + s * 45;
    const full = head - 40 - y0 + 30; // fully lowered: just past the sill
    const drop = Math.max(20, full * (1 - open));
    const bottom = head - 40 - drop;
    b.box(bw + 20, 40, 80, 0, head - 40, z, dr.type === 'venetian' ? col : '#f1f1ee'); // headbox / headrail
    if (dr.type === 'venetian') {
      // Slats every 45 mm, tilted half open; they stack up under the headrail when raised.
      const n = Math.max(2, Math.floor(drop / 45));
      for (let i = 0; i < n; i++) {
        const slat = b.box(bw, 3, 50, 0, head - 50 - i * (drop / n), z, col, { rough: 0.5 });
        slat.rotation.x = 0.45 * s;
      }
      b.box(bw, 20, 40, 0, bottom, z, col);
      return;
    }
    const blockout = dr.fabric === 'blockout';
    const fabric = b.box(bw, drop, 4, 0, bottom, z, col, blockout ? { rough: 0.95 } : { rough: 0.95, opacity: 0.85 });
    fabric.castShadow = blockout;
    if (dr.type === 'roman') {
      // Soft horizontal folds; a deeper stack of them under the headbox as it's raised.
      for (let y = bottom + 180; y < head - 60; y += 180) b.box(bw, 10, 14, 0, y, z + s * 6, shade(col, 0.9), { rough: 0.95 });
      if (open > 0.05) b.box(bw, Math.min(160, 40 + open * 120), 60, 0, bottom, z + s * 10, shade(col, 0.95), { rough: 0.95 });
    } else b.box(bw, 25, 14, 0, bottom - 10, z, '#d7d7d4'); // roller bottom bar
    return;
  }
  // Curtains.
  const rodY = Math.min(wallHeight - 40, top + 180);
  const rodLen = w + 2 * Math.min(300, Math.max(150, w * 0.15));
  const floorLen = dr.length !== 'sill';
  const bottom = floorLen ? 12 : Math.max(10, y0 - 120);
  const H = Math.min(rodY - 25, cutHeight) - bottom;
  if (H <= 50) return;
  const curtain = (z: number, color: string, sheer: boolean, frac: number) => {
    // Two panels meeting in the middle; drawn back they bunch up at the ends of the rod.
    const half = rodLen / 2;
    const pw = Math.max(rodLen * 0.09, half * (1 - frac) + 40 * (1 - frac));
    const amp = 18 + 22 * frac; // deeper pleats when gathered
    for (const sx of [-1, 1]) {
      const segs = Math.max(8, Math.round(pw / 25));
      const geo = new THREE.PlaneGeometry(pw, H, segs, 1);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const pleats = Math.max(3, Math.round(pw / 110));
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(((pos.getX(i) + pw / 2) / pw) * pleats * Math.PI * 2) * amp);
      geo.computeVertexNormals();
      const mat = b.m(color, sheer ? { opacity: 0.42, rough: 0.9 } : { rough: 0.95 }) as THREE.MeshStandardMaterial;
      mat.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(sx * (half - pw / 2), bottom + H / 2, z);
      mesh.castShadow = !sheer;
      mesh.receiveShadow = true;
      b.g.add(mesh);
    }
  };
  if (rodY < cutHeight) {
    // Rod with finials, on brackets off the wall.
    const rz = face + s * (dr.type === 'sheer_blockout' ? 165 : 115);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, rodLen + 60, 12), b.m('#3a3a38', { metal: 0.6, rough: 0.35 }));
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, rodY, rz);
    b.g.add(rod);
    for (const sx of [-1, 1]) {
      b.sphere(22, sx * (rodLen / 2 + 40), rodY, rz, '#3a3a38', { metal: 0.6, rough: 0.35 });
      b.box(16, 16, Math.abs(rz - face), sx * (rodLen / 2 - 20), rodY - 8, (rz + face) / 2, '#3a3a38', { metal: 0.6, rough: 0.35 });
    }
  }
  if (dr.type === 'sheer') curtain(face + s * 110, col, true, open);
  else if (dr.type === 'blockout') curtain(face + s * 110, col, false, open);
  else {
    curtain(face + s * 95, '#f6f4ee', true, 0); // sheer behind, left drawn
    curtain(face + s * 160, col, false, open); // blockout on the room side
  }
}

/** The handle on both faces of a door leaf (leaf-local: x from the hinge towards the latch, z across). */
function drawHandle(b: Builder, o: Opening, dir: number, lw: number) {
  const h = doorHandle(o);
  if (h.type === 'none') return;
  const x = dir * (lw - BACKSET);
  const y = h.height;
  const fin = h.finish;
  const met: MatOpts = { metal: 0.75, rough: 0.3 };
  const face = 20; // half the leaf thickness
  for (const side of [-1, 1]) {
    const z = side * face;
    const out = (n: number) => z + side * n;
    if (h.type === 'flush') {
      b.box(45, 140, 3, x, y - 70, out(1.5), shade(fin, 0.6), met);
      continue;
    }
    // Round rose on the face.
    const rose = b.cyl(26, 26, 8, x, 0, 0, fin, met);
    rose.rotation.x = Math.PI / 2;
    rose.position.set(x, y, out(4));
    if (h.type === 'lever') {
      const neck = b.cyl(9, 9, 50, x, 0, 0, fin, met);
      neck.rotation.x = Math.PI / 2;
      neck.position.set(x, y, out(30));
      b.box(120, 16, 18, x - dir * 52, y - 8, out(58), fin, met); // lever towards the hinge
    } else if (h.type === 'halfmoon') {
      // Half-moon pull: a solid half disc (e.g. 205 × 102.5 mm), curved side towards the hinge, 50 mm off the door.
      const r = (h.length > 0 && h.length < 400 ? h.length : 205) / 2;
      const geo = new THREE.CylinderGeometry(r, r, 50, 24, 1, false, 0, Math.PI); // half disc on +x, axis up
      geo.rotateX(Math.PI / 2); // flat on the door, curved side +x
      if (dir > 0) geo.rotateZ(Math.PI); // curved side towards the hinge
      const mesh = new THREE.Mesh(geo, b.m(fin, met));
      mesh.position.set(x + dir * 30, y, out(25));
      mesh.castShadow = true;
      b.g.add(mesh);
      // The flat face (rose) sits on the door, so no rose disc needed.
      rose.visible = false;
    } else if (h.type === 'knob') {
      const neck = b.cyl(10, 12, 25, x, 0, 0, fin, met);
      neck.rotation.x = Math.PI / 2;
      neck.position.set(x, y, out(20));
      b.sphere(28, x, y, out(40), fin, met);
    } else {
      // D pull: a vertical bar (its length) on two stand-offs.
      const len = Math.max(150, h.length);
      rose.visible = false;
      for (const dy of [-(len / 2 - 40), len / 2 - 40]) {
        const st = b.cyl(8, 8, 60, x, 0, 0, fin, met);
        st.rotation.x = Math.PI / 2;
        st.position.set(x, y + dy, out(34));
      }
      b.cyl(11, 11, len, x, y - len / 2, out(66), fin, met);
    }
  }
}

// ---------- ABI Interiors fixtures ----------
/** Rounded-rectangle footprint extruded upwards (for basins, baths, sinks). */
function roundedSlab(b: Builder, w: number, d: number, h: number, r: number, x: number, y: number, z: number, color: string, opts?: MatOpts) {
  const s = new THREE.Shape();
  const rr = Math.max(1, Math.min(r, w / 2 - 1, d / 2 - 1));
  s.moveTo(-w / 2 + rr, -d / 2);
  s.lineTo(w / 2 - rr, -d / 2);
  s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + rr);
  s.lineTo(w / 2, d / 2 - rr);
  s.quadraticCurveTo(w / 2, d / 2, w / 2 - rr, d / 2);
  s.lineTo(-w / 2 + rr, d / 2);
  s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - rr);
  s.lineTo(-w / 2, -d / 2 + rr);
  s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + rr, -d / 2);
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 10 });
  geo.rotateX(-Math.PI / 2); // extrude upwards; shape y becomes -z
  const mesh = new THREE.Mesh(geo, b.m(color, opts));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  b.g.add(mesh);
  return mesh;
}

/**
 * ABI Interiors products, drawn by type from their real sizes and finish (item colour). The product's ABI
 * sub-category (options.group) picks the variant, e.g. pedestal vs wall-hung basins, round mirrors, ladders.
 */
function abiFixture(b: Builder, it: Item) {
  const { width: w, depth: d, height: h, color: c } = it;
  const cls = it.type.slice(4);
  const group = String(it.options?.group ?? '');
  const name = it.name;
  const metal: MatOpts = { metal: 0.7, rough: 0.3 };
  const ceramic = '#f7f7f5';
  const glass: MatOpts = { metal: 0.25, rough: 0.12 }; // reads as a mirror without an environment to reflect
  switch (cls) {
    case 'vanity': {
      // Wall-hung cabinet (sits off the floor by its elevation) with drawer fronts and a top; basin(s) above.
      // No tap: ABI sells those separately (add an ABI tap / mixer).
      b.box(w, h - 20, d - 10, 0, 0, -5, c);
      fronts(b, w, 0, h - 20, d / 2 - 10, Math.max(1, Math.round(w / 600)), h > 600 ? 2 : 1, shade(c, 1.04), 'bar');
      b.box(w, 20, d, 0, h - 20, 0, '#f4f4f2', { rough: 0.3 });
      const n = /double/i.test(name) ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (w / n) * (i + 0.5);
        const bowl = b.cyl(Math.min(200, w / n / 3), Math.min(170, w / n / 3.4), 120, x, h, 30, ceramic, { rough: 0.15 });
        bowl.scale.z = 0.8;
      }
      break;
    }
    case 'basin': {
      if (/pedestal/i.test(group)) {
        // Free-standing pedestal basin: column with the bowl on top.
        b.cyl(Math.min(w, d) * 0.28, Math.min(w, d) * 0.34, h - 160, 0, 0, 0, c, { rough: 0.6 });
        roundedSlab(b, w, d, 160, Math.min(w, d) / 2, 0, h - 160, 0, c, { rough: 0.5 });
      } else if (/round/i.test(group) || Math.abs(w - d) < 30) {
        b.cyl(w / 2, w / 2.4, h, 0, 0, 0, c, { rough: 0.3 });
      } else roundedSlab(b, w, d, h, Math.min(w, d) * 0.25, 0, 0, 0, c, { rough: 0.3 });
      b.cyl(Math.min(w, d) * 0.4, Math.min(w, d) * 0.4, 3, 0, h - 2, 0, shade(c, 0.85)); // bowl
      break;
    }
    case 'bath': {
      const freestanding = /freestanding|round|concrete/i.test(group) || /freestanding/i.test(name);
      roundedSlab(b, w, d, h, freestanding ? Math.min(w, d) * 0.45 : 40, 0, 0, 0, c, { rough: 0.3 });
      roundedSlab(b, w - 110, d - 110, 3, freestanding ? Math.min(w, d) * 0.4 : 30, 0, h - 1, 0, '#dce9ef', { rough: 0.1 });
      break;
    }
    case 'toilet': {
      b.box(w * 0.9, 400, 170, 0, 400, -d / 2 + 85, c, { rough: 0.2 });
      const bowl = b.cyl(w / 2, w * 0.38, 400, 0, 0, -d / 2 + 170 + (d - 170) / 2, c, { rough: 0.2 });
      bowl.scale.z = (d - 170) / w;
      const seat = b.cyl(w / 2, w / 2, 25, 0, 400, -d / 2 + 170 + (d - 170) / 2, '#f8f8f8', { rough: 0.3 });
      seat.scale.z = (d - 170) / w;
      break;
    }
    case 'sink': {
      // Inset sink: rim at the top (benchtop height), bowl(s) below.
      const n = /double/i.test(group) || /double/i.test(name) ? 2 : 1;
      b.box(w, 6, d, 0, h - 6, 0, c, metal);
      for (let i = 0; i < n; i++) {
        const bw = (w - 60 - (n - 1) * 30) / n;
        const x = -w / 2 + 30 + bw / 2 + i * (bw + 30);
        b.box(bw, h - 6, d - 60, x, 0, 0, shade(c, 0.85), metal);
      }
      break;
    }
    case 'mirror': {
      if (/round/i.test(group) || Math.abs(w - h) < 20) {
        const frame = b.cyl(w / 2, w / 2, Math.max(15, d), 0, 0, 0, c, metal);
        frame.rotation.x = Math.PI / 2;
        frame.position.set(0, h / 2, 0);
        const pane = b.cyl(w / 2 - 15, w / 2 - 15, 4, 0, 0, 0, '#dfe8ec', glass);
        pane.rotation.x = Math.PI / 2;
        pane.position.set(0, h / 2, Math.max(15, d) / 2 + 1);
      } else {
        b.box(w, h, Math.max(15, d), 0, 0, 0, c, /cabinet/i.test(group) ? undefined : metal);
        b.box(w - 30, h - 30, 4, 0, 15, Math.max(15, d) / 2 + 1, '#dfe8ec', glass);
      }
      break;
    }
    case 'towel_rail': {
      const ladder = h > 300;
      for (const sx of [-1, 1]) b.box(22, h, 22, sx * (w / 2 - 11), 0, -d / 2 + 11, c, metal);
      const bars = ladder ? Math.max(3, Math.round(h / 120)) : 1;
      for (let i = 0; i < bars; i++) {
        const y = ladder ? 40 + (i * (h - 80)) / Math.max(1, bars - 1) : h / 2;
        const bar = b.cyl(10, 10, w - 22, 0, 0, 0, c, metal);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0, y, d / 2 - 15);
      }
      break;
    }
    case 'bath_filler': {
      // Floor-standing bath spout.
      b.cyl(35, 35, 10, 0, 0, 0, c, metal);
      b.cyl(18, 18, h - 60, 0, 10, 0, c, metal);
      b.box(30, 30, Math.max(120, d - 60), 0, h - 50, Math.max(120, d - 60) / 2 - 15, c, metal);
      break;
    }
    case 'shower': {
      // Head on an arm from the wall, a rail and hand shower if it's a set.
      const set = /set|rail/i.test(group) || /rail/i.test(name);
      const headR = Math.max(50, Math.min(150, w / 2));
      b.box(20, 20, Math.max(120, d - headR), 0, h - 30, Math.max(120, d - headR) / 2 - 10, c, metal);
      const head = b.cyl(headR, headR, 12, 0, h - 45, Math.max(120, d - headR), c, metal);
      head.castShadow = false;
      if (set) {
        b.box(18, Math.max(400, h * 0.7), 18, 0, h * 0.25, -d / 2 + 30, c, metal);
        b.box(25, 220, 25, 0, h * 0.25 + Math.max(400, h * 0.7) * 0.6, -d / 2 + 60, c, metal);
      }
      break;
    }
    case 'tap': {
      // Wall or deck mounted mixer / spout, sized from ABI's reach and height.
      const wall = /wall|shower|bath tap|spout/i.test(group) && !/basin taps|sink/i.test(group);
      if (wall) {
        const plate = b.cyl(30, 30, 10, 0, 0, 0, c, metal);
        plate.rotation.x = Math.PI / 2;
        plate.position.set(0, h / 2, -d / 2 + 5);
        b.box(22, 22, d - 10, 0, h / 2 - 11, 5, c, metal);
      } else {
        b.cyl(22, 25, h, 0, 0, -d / 2 + 30, c, metal);
        b.box(20, 20, d - 30, 0, h - 20, 15, c, metal);
      }
      break;
    }
    default: {
      // Accessories: a small wall plate with the fitting.
      b.box(Math.max(30, w), Math.max(20, h), 12, 0, 0, -d / 2 + 6, c, metal);
      if (d > 30) b.box(Math.max(20, w * 0.8), 18, d - 12, 0, h / 2 - 9, 6, c, metal);
    }
  }
}

// ---------- Solar panels ----------
const cellTextures = new Map<string, THREE.Texture>();
/** Cell pattern for a panel face (half-cut cells: a fine grid). */
function cellTexture(cols: number, rows: number): THREE.Texture {
  const key = `${cols}x${rows}`;
  const hit = cellTextures.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 1; i < cols; i++) g.fillRect((i * c.width) / cols - 1, 0, 2, c.height);
  for (let j = 1; j < rows; j++) g.fillRect(0, (j * c.height) / rows - 1, c.width, 2);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(0, c.height / 2 - 2, c.width, 4); // the split between the two halves
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cellTextures.set(key, tex);
  return tex;
}

/**
 * A rows × columns array of panels on rails, lying on the roof slope under the item's centre (skylight-style roof
 * context). With no roof under it, it's a ground-mounted frame tilted to 20°.
 */
function solarArray(b: Builder, it: Item, sky: ItemContext['sky']) {
  const o = { ...SOLAR_DEFAULTS, ...(it.options ?? {}) };
  const p = SOLAR_PANELS[String(o.panel)] ?? SOLAR_PANELS.jinko_tiger_neo_440;
  const portrait = o.orient !== 'landscape';
  const pw = portrait ? p.short : p.long; // across
  const pl = portrait ? p.long : p.short; // up the slope
  const cols = Math.max(1, Number(o.cols) || 1);
  const rows = Math.max(1, Number(o.rows) || 1);
  const W = cols * pw + (cols - 1) * SOLAR_GAP;
  const L = rows * pl + (rows - 1) * SOLAR_GAP;
  const group = new THREE.Group();
  if (sky?.roof && !sky.cutaway) {
    // Lay it in the roof plane: x across (the item's width), z up/down the slope.
    const n = new THREE.Vector3(...sky.roof.n).normalize();
    const u = new THREE.Vector3(1, 0, 0).addScaledVector(n, -n.x).normalize();
    const v = new THREE.Vector3().crossVectors(u, n).normalize();
    group.matrixAutoUpdate = false;
    group.matrix.makeBasis(u, n, v).setPosition(0, sky.roof.y + 90, 0);
  } else if (sky?.cutaway) return;
  else {
    // Ground mount: legs and a 20° tilt.
    group.position.y = 300;
    group.rotation.x = -0.35;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(50, sz > 0 ? 300 : 300 + L * 0.34, 50, sx * (W / 2 - 100), 0, sz * (L / 2 - 100), '#9a9c9e');
  }
  b.g.add(group);
  const gb = new Builder(group, b.m);
  // Rails under each row of panels.
  for (const z of [-L / 2 + L * 0.2, L / 2 - L * 0.2]) gb.box(W + 100, 40, 40, 0, -50, z, '#9ea2a6', { metal: 0.6, rough: 0.4 });
  const tex = cellTexture(portrait ? 6 : 18, portrait ? 18 : 6);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = -W / 2 + pw / 2 + c * (pw + SOLAR_GAP);
      const z = -L / 2 + pl / 2 + r * (pl + SOLAR_GAP);
      gb.box(pw, p.thick, pl, x, -p.thick + 10, z, p.frame, { metal: 0.5, rough: 0.4 });
      const glassMat = b.m(p.cells, { metal: 0.6, rough: 0.12 }) as THREE.MeshStandardMaterial;
      glassMat.map = tex;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(pw - 30, pl - 30), glassMat);
      face.rotation.x = -Math.PI / 2;
      face.position.set(x, 11, z);
      face.receiveShadow = true;
      group.add(face);
    }
}
