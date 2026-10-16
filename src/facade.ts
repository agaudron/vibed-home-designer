import { add, mul, sub, wallExtensions, wallFrame } from './geometry';
import type { Design, Facade, FacadeFinish, Vec, Wall } from './types';

/**
 * External wall finishes: which wall faces are on the outside of the house, and the real-scale
 * patterns used to draw each finish.
 */

export interface FinishInfo {
  name: string;
  /** Pattern repeat in mm (width along the wall, height). */
  tile: [number, number];
  /** Which palette the colour comes from. */
  palette: 'paint' | 'brick' | 'stone' | 'timber' | 'block' | 'colorbond';
  /** Whether a mortar/joint colour applies. */
  mortar: boolean;
  roughness: number;
  defaultColor: string;
}

export const FINISHES: Record<FacadeFinish, FinishInfo> = {
  brick: { name: 'Face brick', tile: [480, 344], palette: 'brick', mortar: true, roughness: 0.95, defaultColor: '#9c4f3a' },
  painted_brick: { name: 'Painted brick', tile: [480, 344], palette: 'paint', mortar: false, roughness: 0.85, defaultColor: '#efece2' },
  render: { name: 'Render', tile: [1000, 1000], palette: 'paint', mortar: false, roughness: 0.9, defaultColor: '#efece2' },
  paint: { name: 'Smooth paint', tile: [1000, 1000], palette: 'paint', mortar: false, roughness: 0.7, defaultColor: '#efece2' },
  weatherboard: { name: 'Weatherboard', tile: [1200, 360], palette: 'paint', mortar: false, roughness: 0.75, defaultColor: '#e9eae4' },
  vertical: { name: 'Vertical cladding', tile: [532, 1200], palette: 'paint', mortar: false, roughness: 0.75, defaultColor: '#3a3d40' },
  panel: { name: 'Fibre cement panel', tile: [1200, 2400], palette: 'paint', mortar: false, roughness: 0.8, defaultColor: '#d1cdc4' },
  timber: { name: 'Timber cladding', tile: [560, 1200], palette: 'timber', mortar: false, roughness: 0.8, defaultColor: '#a86f43' },
  stone: { name: 'Stacked stone', tile: [800, 400], palette: 'stone', mortar: false, roughness: 0.95, defaultColor: '#9b9284' },
  block: { name: 'Concrete block', tile: [800, 400], palette: 'block', mortar: true, roughness: 0.95, defaultColor: '#b9b5ad' },
  // Corrugated sheet: 76.2 mm pitch, ten waves per tile.
  colorbond: { name: 'COLORBOND® corrugated', tile: [762, 1000], palette: 'colorbond', mortar: false, roughness: 0.45, defaultColor: '#bdbfba' },
};

export function defaultFacade(): Facade {
  return { finish: 'render', color: '#efece2', mortar: '#d9d4c7' };
}

// ---------- which faces are outside ----------

export interface WallSides {
  /** The +normal side of the wall faces outside. */
  pos: boolean;
  /** The -normal side of the wall faces outside. */
  neg: boolean;
  /** Fraction of each face that is outside (0..1). */
  posFrac?: number;
  negFrac?: number;
}

interface SidesResult {
  map: Map<string, WallSides>;
  enclosed: boolean;
  /** Rectangles covering everything inside the outside walls (walls included), in plan mm. */
  inside: { x0: number; y0: number; x1: number; y1: number }[];
  /** Rectangles covering the floor inside the outside walls: up to just under the inner wall faces. */
  floor: { x0: number; y0: number; x1: number; y1: number }[];
  /** The raster used (for room detection). */
  grid?: { cell: number; minX: number; minY: number; nx: number; ny: number; wall: Uint8Array; outside: Uint8Array };
}

const sidesCache = new WeakMap<Wall[], SidesResult>();

/**
 * Rasterise the walls, flood-fill the outside, and check which side of each wall touches it.
 * Works for any wall angles. `enclosed` is false when the outside walls don't close up yet.
 */
export function exteriorSides(walls: Wall[]): SidesResult {
  const cached = sidesCache.get(walls);
  if (cached) return cached;
  const result = computeSides(walls);
  sidesCache.set(walls, result);
  return result;
}

function computeSides(walls: Wall[]): SidesResult {
  const map = new Map<string, WallSides>();
  const real = walls.filter((w) => wallFrame(w).length > 1);
  if (!real.length) return { map, enclosed: false, inside: [], floor: [] };

  const rects = real.map((w) => {
    const f = wallFrame(w);
    const { e0, e1 } = wallExtensions(w, real);
    return { w, f, a: add(w.start, mul(f.u, -e0)), len: f.length + e0 + e1, half: w.thickness / 2 };
  });
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects)
    for (const s of [-1, 1])
      for (const p of [r.a, add(r.a, mul(r.f.u, r.len))]) {
        const q = add(p, mul(r.f.n, s * r.half));
        minX = Math.min(minX, q.x);
        minY = Math.min(minY, q.y);
        maxX = Math.max(maxX, q.x);
        maxY = Math.max(maxY, q.y);
      }
  const margin = 600;
  minX -= margin;
  minY -= margin;
  maxX += margin;
  maxY += margin;
  // ~40 mm cells, coarser for very large plans.
  let cell = 40;
  while (((maxX - minX) / cell) * ((maxY - minY) / cell) > 2e6) cell *= 1.5;
  const nx = Math.ceil((maxX - minX) / cell);
  const ny = Math.ceil((maxY - minY) / cell);
  const wall = new Uint8Array(nx * ny);
  for (const r of rects) {
    const corners = [-1, 1].flatMap((s) => [r.a, add(r.a, mul(r.f.u, r.len))].map((p) => add(p, mul(r.f.n, s * r.half))));
    const i0 = Math.max(0, Math.floor((Math.min(...corners.map((c) => c.x)) - minX) / cell));
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(...corners.map((c) => c.x)) - minX) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(...corners.map((c) => c.y)) - minY) / cell));
    const j1 = Math.min(ny - 1, Math.ceil((Math.max(...corners.map((c) => c.y)) - minY) / cell));
    // Pad by half a cell so thin or diagonal walls still form a closed barrier.
    const pad = cell * 0.75;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const p = { x: minX + (i + 0.5) * cell, y: minY + (j + 0.5) * cell };
        const d = sub(p, r.a);
        const along = d.x * r.f.u.x + d.y * r.f.u.y;
        const perp = d.x * r.f.n.x + d.y * r.f.n.y;
        if (along >= -pad && along <= r.len + pad && Math.abs(perp) <= r.half + pad) wall[j * nx + i] = 1;
      }
  }
  const outside = new Uint8Array(nx * ny);
  const stack = new Int32Array(nx * ny);
  let sp = 0;
  stack[sp++] = 0;
  outside[0] = 1;
  while (sp) {
    const c = stack[--sp];
    const i = c % nx;
    const j = (c - i) / nx;
    if (i > 0 && !outside[c - 1] && !wall[c - 1]) (outside[c - 1] = 1), (stack[sp++] = c - 1);
    if (i < nx - 1 && !outside[c + 1] && !wall[c + 1]) (outside[c + 1] = 1), (stack[sp++] = c + 1);
    if (j > 0 && !outside[c - nx] && !wall[c - nx]) (outside[c - nx] = 1), (stack[sp++] = c - nx);
    if (j < ny - 1 && !outside[c + nx] && !wall[c + nx]) (outside[c + nx] = 1), (stack[sp++] = c + nx);
  }
  let insideCells = 0;
  for (let c = 0; c < nx * ny; c++) if (!outside[c] && !wall[c]) insideCells++;
  const enclosed = insideCells * cell * cell > 0.5e6;

  const isOutside = (p: Vec) => {
    const i = Math.floor((p.x - minX) / cell);
    const j = Math.floor((p.y - minY) / cell);
    if (i < 0 || j < 0 || i >= nx || j >= ny) return true;
    return !!outside[j * nx + i];
  };
  for (const { w, f } of rects) {
    const SAMPLES = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
    const outFrac = (s: number) => {
      let votes = 0;
      for (const t of SAMPLES) {
        const p = add(add(w.start, mul(f.u, f.length * t)), mul(f.n, s * (w.thickness / 2 + cell * 1.6)));
        if (isOutside(p)) votes++;
      }
      return votes / SAMPLES.length;
    };
    const pf = enclosed ? outFrac(1) : 0;
    const nf = enclosed ? outFrac(-1) : 0;
    map.set(w.id, { pos: pf >= 0.3, neg: nf >= 0.3, posFrac: pf, negFrac: nf });
  }
  type Rect = SidesResult['inside'][number];
  /** Merge the cells in `mask` into as few rectangles as possible (runs per row, extended down while identical). */
  const merge = (mask: (c: number) => boolean): Rect[] => {
    const out: Rect[] = [];
    let open = new Map<string, { i0: number; i1: number; j0: number }>();
    const close = (r: { i0: number; i1: number; j0: number }, jEnd: number) =>
      out.push({ x0: minX + r.i0 * cell, x1: minX + (r.i1 + 1) * cell, y0: minY + r.j0 * cell, y1: minY + jEnd * cell });
    for (let j = 0; j <= ny; j++) {
      const next = new Map<string, { i0: number; i1: number; j0: number }>();
      if (j < ny)
        for (let i = 0; i < nx; ) {
          if (!mask(j * nx + i)) {
            i++;
            continue;
          }
          let i1 = i;
          while (i1 + 1 < nx && mask(j * nx + i1 + 1)) i1++;
          const key = `${i}:${i1}`;
          next.set(key, open.get(key) ?? { i0: i, i1, j0: j });
          i = i1 + 1;
        }
      for (const [key, r] of open) if (!next.has(key)) close(r, j);
      open = next;
    }
    return out;
  };
  const inside = enclosed ? merge((c) => !outside[c]) : [];
  // Floor / ceiling: the open cells inside, grown a couple of cells into the walls so they run under the inner
  // wall faces (wall cells are padded past the faces) without reaching the outer faces or free-standing walls.
  let floor: Rect[] = [];
  if (enclosed) {
    const fm = new Uint8Array(nx * ny);
    for (let c = 0; c < nx * ny; c++) if (!outside[c] && !wall[c]) fm[c] = 1;
    for (let pass = 0; pass < 2; pass++) {
      const grow: number[] = [];
      for (let c = 0; c < nx * ny; c++) {
        if (fm[c] || outside[c]) continue;
        const i = c % nx;
        if ((i > 0 && fm[c - 1]) || (i < nx - 1 && fm[c + 1]) || (c >= nx && fm[c - nx]) || (c + nx < nx * ny && fm[c + nx])) grow.push(c);
      }
      for (const c of grow) fm[c] = 1;
    }
    floor = merge((c) => !!fm[c]);
  }
  return { map, enclosed, inside, floor, grid: { cell, minX, minY, nx, ny, wall, outside } };
}

// ---------- textures ----------

const texCache = new Map<string, HTMLCanvasElement>();

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgb = (c: [number, number, number], k = 1) =>
  `rgb(${Math.max(0, Math.min(255, Math.round(c[0] * k)))},${Math.max(0, Math.min(255, Math.round(c[1] * k)))},${Math.max(0, Math.min(255, Math.round(c[2] * k)))})`;

/** A canvas (sRGB) with one repeat of the finish's pattern, drawn at ~1 px per mm. */
export function facadeCanvas(f: Facade): HTMLCanvasElement {
  const key = `${f.finish}|${f.color}|${f.mortar}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const info = FINISHES[f.finish];
  const [tw, th] = info.tile;
  const scale = f.finish === 'panel' ? 0.25 : f.finish === 'render' || f.finish === 'paint' ? 0.5 : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(tw * scale);
  c.height = Math.round(th * scale);
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  const base = hexToRgb(f.color);
  const mortar = hexToRgb(f.mortar);
  let seed = 1234;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const noise = (amount: number, size = 3) => {
    for (let i = 0; i < (tw * th) / 60; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${rnd() * amount})`;
      g.fillRect(rnd() * tw, rnd() * th, size, size);
    }
  };

  switch (f.finish) {
    case 'brick':
    case 'painted_brick': {
      const painted = f.finish === 'painted_brick';
      g.fillStyle = rgb(painted ? base : mortar, painted ? 0.88 : 1);
      g.fillRect(0, 0, tw, th);
      const bl = 230;
      const bh = 76;
      const joint = 10;
      for (let row = 0; row < 4; row++) {
        const y = row * (bh + joint) + joint / 2;
        const off = row % 2 ? (bl + joint) / 2 : 0;
        for (let k = -1; k < 3; k++) {
          const x = k * (bl + joint) + off + joint / 2;
          g.fillStyle = rgb(base, painted ? 1 : 0.86 + rnd() * 0.24);
          g.fillRect(x, y, bl, bh);
          if (!painted) {
            g.fillStyle = 'rgba(0,0,0,0.12)';
            g.fillRect(x, y + bh - 6, bl, 6);
          }
        }
      }
      noise(painted ? 0.05 : 0.12, 2);
      break;
    }
    case 'block': {
      g.fillStyle = rgb(mortar);
      g.fillRect(0, 0, tw, th);
      for (let row = 0; row < 2; row++)
        for (let k = -1; k < 3; k++) {
          const x = k * 400 + (row % 2 ? 200 : 0) + 5;
          g.fillStyle = rgb(base, 0.92 + rnd() * 0.12);
          g.fillRect(x, row * 200 + 5, 390, 190);
        }
      noise(0.14, 2);
      break;
    }
    case 'render':
    case 'paint': {
      g.fillStyle = rgb(base);
      g.fillRect(0, 0, tw, th);
      noise(f.finish === 'render' ? 0.06 : 0.02, f.finish === 'render' ? 4 : 6);
      break;
    }
    case 'weatherboard': {
      const board = 180;
      for (let k = 0; k < th / board; k++) {
        const y = k * board;
        const grad = g.createLinearGradient(0, y, 0, y + board);
        grad.addColorStop(0, rgb(base, 0.9));
        grad.addColorStop(1, rgb(base, 1.04));
        g.fillStyle = grad;
        g.fillRect(0, y, tw, board);
        g.fillStyle = rgb(base, 0.62); // shadow line under each board's lap
        g.fillRect(0, y, tw, 7);
      }
      noise(0.03, 3);
      break;
    }
    case 'vertical': {
      g.fillStyle = rgb(base);
      g.fillRect(0, 0, tw, th);
      for (let x = 0; x < tw; x += 133) {
        g.fillStyle = rgb(base, 0.55);
        g.fillRect(x, 0, 6, th);
        g.fillStyle = rgb(base, 1.12);
        g.fillRect(x + 6, 0, 3, th);
      }
      noise(0.03, 3);
      break;
    }
    case 'panel': {
      g.fillStyle = rgb(base);
      g.fillRect(0, 0, tw, th);
      g.fillStyle = rgb(base, 0.6);
      g.fillRect(0, 0, tw, 12);
      g.fillRect(0, 0, 12, th);
      noise(0.03, 8);
      break;
    }
    case 'timber': {
      const bw = 140;
      for (let k = 0; k < tw / bw; k++) {
        const x = k * bw;
        g.fillStyle = rgb(base, 0.85 + rnd() * 0.25);
        g.fillRect(x, 0, bw, th);
        for (let s = 0; s < 14; s++) {
          g.strokeStyle = `rgba(60,30,10,${0.06 + rnd() * 0.08})`;
          g.lineWidth = 1 + rnd() * 2;
          g.beginPath();
          const gx = x + rnd() * bw;
          g.moveTo(gx, 0);
          g.bezierCurveTo(gx + rnd() * 10 - 5, th / 3, gx + rnd() * 10 - 5, (2 * th) / 3, gx, th);
          g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x, 0, 4, th);
      }
      break;
    }
    case 'colorbond': {
      // Shade each corrugation across its width: dark in the trough, bright on the crest.
      const pitch = 76.2;
      for (let x = 0; x < tw; x++) {
        const wave = Math.cos(((x % pitch) / pitch) * Math.PI * 2);
        g.fillStyle = rgb(base, 0.86 + 0.16 * wave);
        g.fillRect(x, 0, 1, th);
      }
      noise(0.015, 4);
      break;
    }
    case 'stone': {
      g.fillStyle = rgb(base, 0.55);
      g.fillRect(0, 0, tw, th);
      let y = 0;
      while (y < th) {
        const h = 40 + Math.floor(rnd() * 3) * 25;
        let x = -rnd() * 150;
        while (x < tw) {
          const w = 120 + rnd() * 260;
          g.fillStyle = rgb(base, 0.75 + rnd() * 0.45);
          g.fillRect(x + 3, y + 3, w - 6, Math.min(h, th - y) - 6);
          x += w;
        }
        y += h;
      }
      noise(0.1, 3);
      break;
    }
  }
  texCache.set(key, c);
  return c;
}
