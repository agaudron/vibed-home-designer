import * as THREE from 'three';
import { add, clampOpeningOffset, dot, itemCorners, mul, openingGapTitle, openingSideGaps, rad, sub, v, wallExtensions, wallFrame } from '../geometry';
import { store } from '../store';
import { itemClearances } from '../clearance';
import type { Design, Item, Opening, Selection, Vec, Wall } from '../types';

/**
 * Dimension lines shown in the 3D view for the selected door/window/item: distances to the walls (or other
 * furniture) on each side, and the gaps below and above it. Each label can be clicked to type an exact value.
 */

export interface MeasureLabel {
  pos: THREE.Vector3;
  value: number;
  title: string;
  commit: (value: number) => void;
  /** Shown only (e.g. while placing a new item). */
  readonly?: boolean;
}

export interface Measures {
  group: THREE.Group;
  labels: MeasureLabel[];
  /** Which side of the host wall the lines are drawn on (re-built when the camera moves to the other side). */
  side: number;
}

const COLOR = '#1b9e5a';
const TICK = 90;

export function buildMeasures(d: Design, sel: Selection | null, camera: THREE.Vector3): Measures | null {
  if (sel?.kind === 'opening') {
    const o = d.openings.find((x) => x.id === sel.id);
    const w = o && d.walls.find((x) => x.id === o.wallId);
    return o && w ? openingMeasures(d, o, w, camera) : null;
  }
  if (sel?.kind === 'item') {
    const it = d.items.find((x) => x.id === sel.id);
    return it ? measuresForItem(d, it) : null;
  }
  return null;
}

class Lines {
  pts: number[] = [];
  labels: MeasureLabel[] = [];
  /** A dimension from a to b with end ticks along `tick` (unit vector). */
  dim(a: THREE.Vector3, b: THREE.Vector3, tick: THREE.Vector3, label: Omit<MeasureLabel, 'pos' | 'value'>) {
    const value = a.distanceTo(b);
    if (value < 1) return;
    this.seg(a, b);
    for (const p of [a, b]) this.seg(p.clone().addScaledVector(tick, -TICK / 2), p.clone().addScaledVector(tick, TICK / 2));
    this.labels.push({ ...label, value, pos: a.clone().add(b).multiplyScalar(0.5) });
  }
  seg(a: THREE.Vector3, b: THREE.Vector3) {
    this.pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  build(side = 0): Measures {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pts, 3));
    const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COLOR, depthTest: false, transparent: true }));
    line.renderOrder = 1000;
    const group = new THREE.Group();
    group.add(line);
    return { group, labels: this.labels, side };
  }
}

const P = (p: Vec, y: number) => new THREE.Vector3(p.x, y, p.y);

function updateOpening(id: string, patch: (o: Opening, w: Wall) => Partial<Opening>) {
  store.update((d) => ({
    ...d,
    openings: d.openings.map((o) => {
      if (o.id !== id) return o;
      const w = d.walls.find((x) => x.id === o.wallId);
      if (!w) return o;
      const next = { ...o, ...patch(o, w) };
      next.sill = Math.max(0, Math.min(next.sill, w.height - 50));
      next.height = Math.max(50, Math.min(next.height, w.height - next.sill));
      next.offset = clampOpeningOffset(next, wallFrame(w).length);
      return next;
    }),
  }));
}

function openingMeasures(d: Design, o: Opening, w: Wall, camera: THREE.Vector3): Measures {
  const f = wallFrame(w);
  const g = openingSideGaps(o, w, d.walls, d.openings);
  // Draw on the face of the wall the camera is looking at.
  const side = dot(sub(v(camera.x, camera.z), w.start), f.n) >= 0 ? 1 : -1;
  const face = mul(f.n, side * (w.thickness / 2 + 40));
  const at = (along: number) => add(add(w.start, mul(f.u, along)), face);
  const L = new Lines();
  const top = Math.min(o.sill + o.height, w.height);
  const midY = o.sill + (top - o.sill) / 2;
  const up = new THREE.Vector3(0, 1, 0);
  const alongDir = new THREE.Vector3(f.u.x, 0, f.u.y);

  L.dim(P(at(g.leftFace), midY), P(at(g.a), midY), up, {
    title: openingGapTitle(g.leftTo),
    commit: (val) => updateOpening(o.id, () => ({ offset: g.leftFace + val + o.width / 2 })),
  });
  L.dim(P(at(g.b), midY), P(at(g.rightFace), midY), up, {
    title: openingGapTitle(g.rightTo),
    commit: (val) => updateOpening(o.id, () => ({ offset: g.rightFace - val - o.width / 2 })),
  });
  const c = clampOpeningOffset(o, f.length);
  const centre = at(c);
  if (o.sill > 0.5)
    L.dim(P(centre, 0), P(centre, o.sill), alongDir, {
      title: 'Height from the floor (sill)',
      commit: (val) => updateOpening(o.id, (x) => ({ sill: val, height: x.height })),
    });
  if (w.height - top > 0.5)
    L.dim(P(centre, top), P(centre, w.height), alongDir, {
      title: o.kind === 'window' ? 'Gap above the window' : 'Gap above the door',
      // Windows move to keep their size; doors get taller/shorter.
      commit: (val) =>
        updateOpening(o.id, (x, wall) => (x.kind === 'window' ? { sill: wall.height - x.height - val } : { height: wall.height - x.sill - val })),
    });
  return L.build(side);
}


function updateItem(id: string, patch: (it: Item) => Partial<Item>) {
  store.update((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch(i) } : i)) }));
}

/** Measurements round an item (also used for the placement preview, with `editable` false). */
export function measuresForItem(d: Design, it: Item, editable = true): Measures {
  const r = rad(it.rotation);
  const ax = v(Math.cos(r), Math.sin(r)); // width direction
  const bx = v(-Math.sin(r), Math.cos(r)); // depth direction (front)
  const c = v(it.x, it.y);
  const yMid = it.elevation + Math.min(it.height, 1200) / 2;
  const yRange: [number, number] = [it.elevation, it.elevation + it.height];
  const up = new THREE.Vector3(0, 1, 0);
  const L = new Lines();

  for (const cl of itemClearances(d, it)) {
    const { dir, dist } = cl;
    L.dim(P(cl.origin, yMid), P(cl.end, yMid), up, {
      title: cl.title,
      readonly: !editable,
      // Move the item along this direction so the gap becomes the typed value.
      commit: (val) => updateItem(it.id, (x) => ({ x: Math.round(x.x + dir.x * (dist - val)), y: Math.round(x.y + dir.y * (dist - val)) })),
    });
  }

  const ceiling = d.settings.wallHeight;
  const front = add(c, mul(bx, it.depth / 2 + 60));
  const tickDir = new THREE.Vector3(ax.x, 0, ax.y);
  if (it.elevation > 0.5)
    L.dim(P(front, 0), P(front, it.elevation), tickDir, {
      title: 'Height off the floor',
      readonly: !editable,
      commit: (val) => updateItem(it.id, () => ({ elevation: Math.max(0, val) })),
    });
  const topY = it.elevation + it.height;
  if (ceiling - topY > 0.5)
    L.dim(P(front, topY), P(front, ceiling), tickDir, {
      title: 'Gap to the ceiling',
      readonly: !editable,
      commit: (val) => updateItem(it.id, (x) => ({ elevation: Math.max(0, ceiling - x.height - val) })),
    });
  return L.build();
}
