import * as THREE from 'three';
import { AREA_KINDS, BED_TIMBERS, cropLayout, EDGINGS, fenceOf, fenceRuns, gardenOf, isPlant, outlineOf, shownScale, specOf, streetStrip, surfaceOf } from '../garden';
import type { GardenSpec, SurfaceTexture } from '../garden';
import { featureColor, shade } from '../plan/garden';
import { add, dist, mul, sub } from '../geometry';
import { floorLevelOf } from '../levels';
import type { Design, GardenArea, GardenItem, Selection, Vec } from '../types';
import type { MatFn } from './builders';

/**
 * The garden in 3D: the block, the street in front, yards and garden areas as thin slabs on the ground, fences
 * along the boundary, and plants and features modelled simply (low-poly foliage, timber and steel beds…).
 * Everything stands on the ground, which is below the house floor for a raised house.
 */

// ---------- generated textures (light, so the material colour tints them) ----------

const texCache = new Map<string, THREE.Texture>();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTex(key: string, size: number, draw: (c: CanvasRenderingContext2D, r: () => number) => void): THREE.Texture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, size, size);
  draw(c, rng(key.length * 7919 + key.charCodeAt(0)));
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** A surface texture and how many mm one repeat covers. */
function surfaceTex(tex: SurfaceTexture, tile?: [number, number]): { t: THREE.Texture; size: [number, number] } {
  switch (tex) {
    case 'grass':
    case 'turf':
      return {
        size: [800, 800],
        t: canvasTex(`grass-${tex}`, 256, (c, r) => {
          for (let i = 0; i < 2600; i++) {
            const g = 150 + r() * 105;
            c.fillStyle = `rgb(${g * 0.86},${g},${g * 0.8})`;
            c.fillRect(r() * 256, r() * 256, 1.5, 3 + r() * 4);
          }
        }),
      };
    case 'mulch':
      return {
        size: [700, 700],
        t: canvasTex('mulch', 256, (c, r) => {
          for (let i = 0; i < 900; i++) {
            const g = 120 + r() * 135;
            c.fillStyle = `rgb(${g},${g * 0.92},${g * 0.85})`;
            c.save();
            c.translate(r() * 256, r() * 256);
            c.rotate(r() * Math.PI);
            c.fillRect(-6, -1.5, 12 + r() * 8, 3 + r() * 2);
            c.restore();
          }
        }),
      };
    case 'gravel':
    case 'aggregate':
      return {
        size: tex === 'gravel' ? [500, 500] : [900, 900],
        t: canvasTex(`gravel-${tex}`, 256, (c, r) => {
          for (let i = 0; i < (tex === 'gravel' ? 1400 : 2200); i++) {
            const g = 140 + r() * 115;
            c.fillStyle = `rgb(${g},${g},${g})`;
            c.beginPath();
            c.ellipse(r() * 256, r() * 256, 1.5 + r() * 3, 1.5 + r() * 2.5, r() * 3, 0, Math.PI * 2);
            c.fill();
          }
        }),
      };
    case 'soil':
      return {
        size: [900, 900],
        t: canvasTex('soil', 256, (c, r) => {
          for (let i = 0; i < 3000; i++) {
            const g = 150 + r() * 105;
            c.fillStyle = `rgb(${g},${g},${g})`;
            c.fillRect(r() * 256, r() * 256, 2, 2);
          }
        }),
      };
    case 'asphalt':
    case 'concrete':
      return {
        size: [1500, 1500],
        t: canvasTex(`flat-${tex}`, 256, (c, r) => {
          for (let i = 0; i < 4000; i++) {
            const g = 205 + r() * 50;
            c.fillStyle = `rgb(${g},${g},${g})`;
            c.fillRect(r() * 256, r() * 256, 1, 1);
          }
        }),
      };
    case 'pavers':
    case 'brick': {
      const [l, w] = tile ?? [400, 400];
      return {
        size: [l, w * 2],
        t: canvasTex(`pavers-${l}x${w}`, 256, (c) => {
          c.strokeStyle = '#9a9a9a';
          c.lineWidth = Math.max(2, 256 * (8 / l));
          c.beginPath();
          c.moveTo(0, 1);
          c.lineTo(256, 1);
          c.moveTo(0, 128);
          c.lineTo(256, 128);
          c.moveTo(1, 0);
          c.lineTo(1, 128);
          c.moveTo(128, 128);
          c.lineTo(128, 256);
          c.stroke();
        }),
      };
    }
  }
}

/** Corrugated steel: vertical ribs (u runs along the sheet). */
const corrugated = () =>
  canvasTex('corrugated', 128, (c) => {
    const g = c.createLinearGradient(0, 0, 128, 0);
    for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, i % 2 ? '#d8d8d8' : '#ffffff');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
/** Boards with dark gaps, vertical (palings) or horizontal (slats). */
const boards = (dir: 'v' | 'h') =>
  canvasTex(`boards-${dir}`, 128, (c, r) => {
    for (let i = 0; i < 8; i++) {
      const g = 215 + r() * 40;
      c.fillStyle = `rgb(${g},${g},${g})`;
      if (dir === 'v') c.fillRect(i * 16, 0, 15, 128);
      else c.fillRect(0, i * 16, 128, 13);
    }
    c.fillStyle = '#555';
    for (let i = 0; i < 8; i++) {
      if (dir === 'v') c.fillRect(i * 16 + 15, 0, 1, 128);
      else c.fillRect(0, i * 16 + 13, 128, 3);
    }
  });

function texMat(color: string, t: THREE.Texture | null, repeat: [number, number], selected: boolean, rough = 0.95, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
  let map: THREE.Texture | null = null;
  if (t) {
    map = t.clone();
    map.repeat.set(repeat[0], repeat[1]);
    map.needsUpdate = true;
  }
  const m = new THREE.MeshStandardMaterial({ color, map, roughness: rough, side });
  // Each material has its own copy of the (cached) texture; let it go with the material.
  if (map) m.addEventListener('dispose', () => map!.dispose());
  if (selected) {
    m.emissive = new THREE.Color('#2f7bff');
    m.emissiveIntensity = 0.3;
  }
  return m;
}

/** Keep coplanar ground layers from flickering: later layers win. */
function layer(m: THREE.Material, n: number) {
  m.polygonOffset = true;
  m.polygonOffsetFactor = -n;
  m.polygonOffsetUnits = -n * 2;
  return m;
}

// ---------- shapes on the ground ----------

const toShape = (p: Vec[]) => new THREE.Shape(p.map((q) => new THREE.Vector2(q.x, -q.y)));

/** A flat outline at height y, facing up. UVs are plan mm. */
function flat(p: Vec[], y: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.ShapeGeometry(toShape(p));
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

/** An outline extruded from y0 up to y1. */
function slab(p: Vec[], y0: number, y1: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(toShape(p), { depth: Math.max(1, y1 - y0), bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y0;
  mesh.receiveShadow = true;
  return mesh;
}

/** A box standing on y0 between two plan points (fences, edging, kerbs). */
function run(a: Vec, b: Vec, y0: number, h: number, t: number, mat: THREE.Material, off = 0): THREE.Mesh {
  const L = dist(a, b);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1, L), Math.max(1, h), Math.max(1, t)), mat);
  const u = mul(sub(b, a), 1 / Math.max(1, L));
  const n = { x: -u.y, y: u.x };
  const m = add(mul(add(a, b), 0.5), mul(n, off));
  mesh.position.set(m.x, y0 + h / 2, m.y);
  mesh.rotation.y = -Math.atan2(u.y, u.x);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- the garden ----------

export function buildGarden(d: Design, selection: Selection | null, editing: boolean, plain: MatFn, highlight: MatFn): THREE.Group {
  const g = gardenOf(d);
  const out = new THREE.Group();
  const base = -floorLevelOf(d);
  const isSel = (kind: string, id: string) => selection?.kind === kind && selection.id === id;
  const pick = (o: THREE.Object3D, kind: string, id: string) => {
    if (editing || kind === 'garden-item') o.userData.sel = { kind, id };
    return o;
  };

  if (g.block) {
    const grass = surfaceTex('grass');
    const blockMat = layer(texMat('#8fb069', grass.t, [1 / grass.size[0], 1 / grass.size[1]], isSel('block', 'block')), 1);
    out.add(pick(flat(g.block.points, base - 1.4, blockMat), 'block', 'block'));
    const st = streetStrip(g.block);
    if (st) out.add(buildStreet(st, base));
    out.add(buildFences(g, base));
  }

  // Yards first (flat), then the other areas as slabs standing a little proud of them.
  for (const a of g.areas) {
    const s = surfaceOf(a);
    const tx = surfaceTex(s.tex, s.tile);
    const k = AREA_KINDS[a.kind];
    const outline = outlineOf(a);
    if (outline.length < 3) continue;
    const mat = texMat(s.color, tx.t, [1 / tx.size[0], 1 / tx.size[1]], isSel('garden-area', a.id), s.tex === 'concrete' || s.tex === 'pavers' ? 0.8 : 0.95);
    const mesh = k.rise > 0 ? slab(outline, base - 1, base + k.rise, layer(mat, 3)) : flat(outline, base - 0.8, layer(mat, 2));
    out.add(pick(mesh, 'garden-area', a.id));
    if (a.edging && EDGINGS[a.edging] && k.edging) out.add(pick(buildEdging(a, outline, base, isSel('garden-area', a.id) ? highlight : plain), 'garden-area', a.id));
  }

  for (const it of g.items) {
    const m = isSel('garden-item', it.id) ? highlight : plain;
    const obj = buildGardenItem(it, m, isSel('garden-item', it.id));
    const k = shownScale(g, it);
    obj.scale.setScalar(k);
    obj.position.set(it.x, base, it.y);
    obj.rotation.y = -THREE.MathUtils.degToRad(it.rotation);
    out.add(pick(obj, 'garden-item', it.id));
  }
  return out;
}

function buildEdging(a: GardenArea, outline: Vec[], base: number, m: MatFn): THREE.Group {
  const e = EDGINGS[a.edging!];
  const gr = new THREE.Group();
  const mat = m(e.color, { rough: e.width < 20 ? 0.6 : 0.9, metal: e.width < 20 ? 0.3 : 0 });
  const top = base + Math.max(AREA_KINDS[a.kind].rise + 25, 40);
  for (let i = 0; i < outline.length; i++) gr.add(run(outline[i], outline[(i + 1) % outline.length], base - 1, top - base + 1, Math.max(e.width, 20), mat));
  return gr;
}

/** Verge, footpath, kerb and road along the street side, with a dashed centre line. */
function buildStreet(s: { a: Vec; b: Vec; n: Vec }, base: number): THREE.Group {
  const gr = new THREE.Group();
  const u = mul(sub(s.b, s.a), 1 / Math.max(1, dist(s.a, s.b)));
  const a = sub(s.a, mul(u, 6000));
  const b = add(s.b, mul(u, 6000));
  const band = (o0: number, o1: number) => [add(a, mul(s.n, o0)), add(b, mul(s.n, o0)), add(b, mul(s.n, o1)), add(a, mul(s.n, o1))];
  const grass = surfaceTex('grass');
  const conc = surfaceTex('concrete');
  const asph = surfaceTex('asphalt');
  gr.add(flat(band(0, 3800), base - 1.2, layer(texMat('#93b06f', grass.t, [1 / 800, 1 / 800], false), 1)));
  gr.add(flat(band(1400, 2600), base - 0.6, layer(texMat('#c9c5bd', conc.t, [1 / 1500, 1 / 1500], false), 3)));
  gr.add(flat(band(4000, 11000), base - 1.2, layer(texMat('#4b4b4d', asph.t, [1 / 1500, 1 / 1500], false), 1)));
  const kerbMat = new THREE.MeshStandardMaterial({ color: '#bdb9b1', roughness: 0.9 });
  gr.add(run(add(a, mul(s.n, 3900)), add(b, mul(s.n, 3900)), base - 1, 110, 200, kerbMat));
  const line = layer(new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.8 }), 4);
  const L = dist(a, b);
  for (let x = 1000; x + 1500 < L; x += 4500) {
    const p = add(add(a, mul(u, x)), mul(s.n, 7450));
    const q = add(p, mul(u, 1500));
    gr.add(flat([p, q, add(q, mul(s.n, 100)), add(p, mul(s.n, 100))], base - 0.6, line));
  }
  gr.traverse((o) => (o.castShadow = false));
  return gr;
}

function buildFences(g: ReturnType<typeof gardenOf>, base: number): THREE.Group {
  const gr = new THREE.Group();
  const b = g.block!;
  for (const r of fenceRuns(g)) {
    const side = b.sides[r.side];
    const f = fenceOf(side);
    const L = dist(r.a, r.b);
    if (L < 50) continue;
    const u = mul(sub(r.b, r.a), 1 / L);
    const postsAt = (gap: number) => Array.from({ length: Math.floor(L / gap) + 1 }, (_, i) => Math.min(L, i * gap)).concat(L % gap > 100 ? [L] : []);
    const post = (at: number, w: number, h: number, mat: THREE.Material) => {
      const p = add(r.a, mul(u, at));
      gr.add(run(sub(p, mul(u, w / 2)), add(p, mul(u, w / 2)), base, h, w, mat));
    };
    switch (side.fence) {
      case 'colorbond': {
        const mat = texMat(f.color, corrugated(), [L / 76, 1], false, 0.5);
        mat.metalness = 0.2;
        gr.add(run(r.a, r.b, base, f.height, 30, mat));
        const frame = new THREE.MeshStandardMaterial({ color: shade(f.color, 0.9), roughness: 0.5, metalness: 0.2 });
        gr.add(run(r.a, r.b, base + f.height - 10, 40, 50, frame));
        for (const at of postsAt(2365)) post(at, 50, f.height + 30, frame);
        break;
      }
      case 'paling':
      case 'slat': {
        const mat = texMat(f.color, boards(side.fence === 'paling' ? 'v' : 'h'), side.fence === 'paling' ? [L / 800, 1] : [1, f.height / 750], false, 0.9);
        gr.add(run(r.a, r.b, base + 50, f.height - 50, 20, mat));
        const timber = new THREE.MeshStandardMaterial({ color: shade(f.color, 0.75), roughness: 0.9 });
        for (const at of postsAt(2400)) post(at, 100, f.height, timber);
        if (side.fence === 'paling') for (const y of [300, f.height - 300]) gr.add(run(r.a, r.b, base + y, 75, 40, timber, 25));
        break;
      }
      case 'picket': {
        const mat = new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.7 });
        const n = Math.floor(L / 130);
        const picket = new THREE.InstancedMesh(new THREE.BoxGeometry(75, f.height - 50, 20), mat, Math.max(1, n));
        const m4 = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(u.y, u.x));
        for (let i = 0; i < n; i++) {
          const p = add(r.a, mul(u, (i + 0.5) * (L / n)));
          m4.compose(new THREE.Vector3(p.x, base + 50 + (f.height - 50) / 2, p.y), q, new THREE.Vector3(1, 1, 1));
          picket.setMatrixAt(i, m4);
        }
        picket.castShadow = true;
        gr.add(picket);
        for (const y of [250, f.height - 250]) gr.add(run(r.a, r.b, base + y, 70, 35, mat, 25));
        for (const at of postsAt(2400)) post(at, 90, f.height + 50, mat);
        break;
      }
      case 'pool': {
        const glass = new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false });
        const n = Math.max(1, Math.round(L / 1200));
        for (let i = 0; i < n; i++) {
          const a0 = add(r.a, mul(u, (i * L) / n + 25));
          const a1 = add(r.a, mul(u, ((i + 1) * L) / n - 25));
          gr.add(run(a0, a1, base + 100, f.height - 100, 12, glass));
        }
        const steel = new THREE.MeshStandardMaterial({ color: '#c8cacc', roughness: 0.3, metalness: 0.8 });
        for (let i = 0; i <= n * 2; i++) post((i * L) / (n * 2), 50, 250, steel);
        break;
      }
      case 'rendered': {
        const mat = new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.95 });
        gr.add(run(r.a, r.b, base, f.height, 200, mat));
        const cap = new THREE.MeshStandardMaterial({ color: shade(f.color, 0.85), roughness: 0.9 });
        for (const at of postsAt(2400)) post(at, 350, f.height + 150, cap);
        break;
      }
    }
  }
  return gr;
}

// ---------- plants ----------

const blobGeo = new Map<number, THREE.BufferGeometry>();
/** Low-poly foliage blob, unit radius (shared geometry; scaled per mesh). */
function blob(detail = 1) {
  let geo = blobGeo.get(detail);
  if (!geo) {
    geo = new THREE.IcosahedronGeometry(1, detail);
    // Roughen it so foliage doesn't look like a ball.
    const pos = geo.getAttribute('position');
    const r = rng(17 + detail);
    for (let i = 0; i < pos.count; i++) {
      const k = 0.88 + r() * 0.24;
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
    }
    geo.computeVertexNormals();
    blobGeo.set(detail, geo);
  }
  return geo;
}

/** A mesh with its own copy of a cached geometry (so disposing the garden doesn't break the cache). */
function sharedMesh(geo: THREE.BufferGeometry, mat: THREE.Material) {
  const mesh = new THREE.Mesh(geo.clone(), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function foliage(gr: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, rx: number, ry: number, rz: number, detail = 1) {
  const mesh = sharedMesh(blob(detail), mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(rx, ry, rz);
  gr.add(mesh);
  return mesh;
}

function cylinder(gr: THREE.Object3D, mat: THREE.Material, rTop: number, rBot: number, h: number, x: number, y: number, z: number, seg = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  gr.add(mesh);
  return mesh;
}

function boxAt(gr: THREE.Object3D, mat: THREE.Material, w: number, h: number, dp: number, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1, w), Math.max(1, h), Math.max(1, dp)), mat);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  gr.add(mesh);
  return mesh;
}

/** Flowers or fruit dotted over a canopy. */
function dots(gr: THREE.Object3D, mat: THREE.Material, n: number, cx: number, cy: number, cz: number, rx: number, ry: number, size: number, seed: number) {
  const r = rng(seed);
  const geo = new THREE.IcosahedronGeometry(size, 0);
  const inst = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const e = (r() - 0.25) * Math.PI * 0.6;
    m4.makeTranslation(cx + Math.cos(a) * Math.cos(e) * rx, cy + Math.sin(e) * ry + ry * 0.15, cz + Math.sin(a) * Math.cos(e) * rx);
    inst.setMatrixAt(i, m4);
  }
  gr.add(inst);
}

function seedOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** A plant at its full size w × d × h, standing on y = 0. */
export function buildPlant(s: GardenSpec, w: number, d: number, h: number, m: MatFn, color: string, seed: number): THREE.Group {
  const gr = new THREE.Group();
  const leaf = m(color, { rough: 0.9 });
  const leafDark = m(shade(color, 0.8), { rough: 0.9 });
  const bloom = s.flower ? m(s.flower, { rough: 0.6 }) : null;
  const bark = m('#6b5541', { rough: 0.95 });
  const r = w / 2;
  const rnd = rng(seed);
  switch (s.form) {
    case 'tree':
    case 'citrus': {
      const trunkH = h * (s.form === 'citrus' ? 0.3 : 0.4);
      cylinder(gr, bark, Math.max(30, r * 0.05), Math.max(45, r * 0.08), trunkH + h * 0.15, 0, 0, 0, 8);
      const cy = trunkH + (h - trunkH) / 2;
      const ry = (h - trunkH) / 2;
      foliage(gr, leaf, 0, cy, 0, r * 0.8, ry * 0.85, r * 0.8);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + rnd();
        foliage(gr, i % 2 ? leafDark : leaf, Math.cos(a) * r * 0.4, cy + (rnd() - 0.4) * ry * 0.5, Math.sin(a) * r * 0.4, r * 0.55, ry * 0.6, r * 0.55);
      }
      if (bloom) dots(gr, bloom, s.form === 'citrus' ? 18 : 30, 0, cy, 0, r * 0.85, ry * 0.75, Math.max(35, r * 0.04), seed);
      break;
    }
    case 'eucalypt': {
      const pale = m('#e6e1d6', { rough: 0.8 });
      cylinder(gr, pale, r * 0.05, r * 0.08, h * 0.6, 0, 0, 0, 8);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + rnd();
        const limb = cylinder(gr, pale, r * 0.025, r * 0.04, h * 0.3, 0, 0, 0, 6);
        limb.position.set(Math.cos(a) * r * 0.15, h * 0.5 + h * 0.15, Math.sin(a) * r * 0.15);
        limb.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + rnd() * 0.8;
        const k = 0.35 + rnd() * 0.25;
        foliage(gr, i % 2 ? leafDark : leaf, Math.cos(a) * r * 0.5, h * (0.7 + rnd() * 0.15), Math.sin(a) * r * 0.5, r * k, h * 0.12, r * k);
      }
      break;
    }
    case 'palm': {
      cylinder(gr, m('#8a7a62', { rough: 0.9 }), r * 0.05, r * 0.07, h * 0.85, 0, 0, 0, 10);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const frond = new THREE.Mesh(new THREE.BoxGeometry(r, 15, r * 0.18), i % 2 ? leaf : leafDark);
        const pivot = new THREE.Group();
        pivot.position.y = h * 0.85;
        pivot.rotation.y = a;
        frond.position.x = r / 2;
        frond.rotation.z = -0.35 - rnd() * 0.3;
        frond.castShadow = true;
        pivot.add(frond);
        gr.add(pivot);
      }
      break;
    }
    case 'columnar': {
      cylinder(gr, bark, r * 0.06, r * 0.1, h * 0.2, 0, 0, 0, 8);
      foliage(gr, leaf, 0, h * 0.58, 0, r * 0.95, h * 0.42, r * 0.95);
      if (bloom) dots(gr, bloom, 24, 0, h * 0.58, 0, r * 0.95, h * 0.38, Math.max(30, r * 0.05), seed);
      break;
    }
    case 'hedge': {
      const hedge = boxAt(gr, leaf, w * 0.96, h * 0.92, d * 0.96, 0, 0, 0);
      hedge.geometry.dispose();
      hedge.geometry = new THREE.BoxGeometry(w * 0.96, h * 0.92, d * 0.96, 4, 6, 3);
      foliage(gr, leafDark, 0, h * 0.9, 0, w * 0.48, h * 0.1, d * 0.48);
      if (bloom) dots(gr, bloom, 20, 0, h * 0.85, 0, w * 0.45, h * 0.08, 50, seed);
      break;
    }
    case 'grass':
    case 'strappy': {
      const blades = 16;
      for (let i = 0; i < blades; i++) {
        const a = (i / blades) * Math.PI * 2 + rnd() * 0.3;
        const bh = h * (s.form === 'strappy' && s.flower ? 0.6 : 0.9) * (0.7 + rnd() * 0.3);
        const blade = new THREE.Mesh(new THREE.ConeGeometry(Math.max(15, r * 0.08), bh, 4), i % 2 ? leaf : leafDark);
        const lean = 0.35 + rnd() * 0.35;
        blade.position.set((Math.cos(a) * Math.sin(lean) * bh) / 2, (Math.cos(lean) * bh) / 2, (Math.sin(a) * Math.sin(lean) * bh) / 2);
        blade.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
        blade.castShadow = true;
        gr.add(blade);
      }
      if (s.flower && bloom) {
        // Flower stems above the leaves.
        const stem = m(shade(color, 0.7), { rough: 0.9 });
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + rnd();
          const x = Math.cos(a) * r * 0.25;
          const z = Math.sin(a) * r * 0.25;
          cylinder(gr, stem, 8, 10, h * 0.9, x, 0, z, 5);
          foliage(gr, bloom, x, h * 0.92, z, Math.max(30, r * 0.08), Math.max(50, h * 0.08), Math.max(30, r * 0.08), 0);
        }
      }
      break;
    }
    case 'groundcover':
      foliage(gr, leaf, 0, h * 0.4, 0, r * 0.95, Math.max(40, h * 0.6), r * 0.95);
      if (bloom) dots(gr, bloom, 26, 0, h * 0.6, 0, r * 0.8, Math.max(20, h * 0.3), Math.max(18, r * 0.03), seed);
      break;
    case 'climber': {
      // A timber trellis with the climber over it.
      const timber = m('#8a6a4c', { rough: 0.9 });
      for (const x of [-r * 0.9, r * 0.9]) boxAt(gr, timber, 40, h, 40, x, 0, 0);
      for (let y = h * 0.25; y < h; y += h * 0.25) boxAt(gr, timber, w * 0.9, 25, 25, 0, y, 0);
      foliage(gr, leaf, 0, h * 0.55, 30, r * 0.85, h * 0.42, 120);
      if (bloom) dots(gr, bloom, 24, 0, h * 0.55, 60, r * 0.8, h * 0.35, 35, seed);
      break;
    }
    case 'trellis': {
      const timber = m('#8a6a4c', { rough: 0.9 });
      for (const x of [-r, r]) boxAt(gr, timber, 35, h, 35, x, 0, 0);
      boxAt(gr, timber, w, 30, 30, 0, h - 30, 0);
      foliage(gr, leaf, 0, h * 0.5, 0, r * 0.9, h * 0.45, 110);
      if (bloom) dots(gr, bloom, 16, 0, h * 0.5, 0, r * 0.8, h * 0.35, 25, seed);
      break;
    }
    case 'tomato': {
      boxAt(gr, m('#8a6a4c', { rough: 0.9 }), 25, h, 25, 0, 0, 0);
      foliage(gr, leaf, 0, h * 0.45, 0, r * 0.75, h * 0.42, r * 0.75);
      if (bloom) dots(gr, bloom, 12, 0, h * 0.4, 0, r * 0.75, h * 0.3, Math.max(25, r * 0.08), seed);
      break;
    }
    case 'veg':
      foliage(gr, leaf, 0, h * 0.45, 0, r * 0.9, h * 0.5, r * 0.9);
      if (bloom) dots(gr, bloom, 8, 0, h * 0.45, 0, r * 0.8, h * 0.3, Math.max(18, r * 0.08), seed);
      break;
    default: {
      // Shrub: a few overlapping blobs.
      foliage(gr, leaf, 0, h * 0.5, 0, r * 0.85, h * 0.5, r * 0.85);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + rnd();
        foliage(gr, leafDark, Math.cos(a) * r * 0.35, h * 0.4, Math.sin(a) * r * 0.35, r * 0.55, h * 0.4, r * 0.55);
      }
      if (bloom) dots(gr, bloom, 22, 0, h * 0.5, 0, r * 0.85, h * 0.45, Math.max(25, r * 0.045), seed);
    }
  }
  return gr;
}

// ---------- features ----------

export function buildGardenItem(it: GardenItem, m: MatFn, selected: boolean): THREE.Group {
  const s = specOf(it);
  const seed = seedOf(it.id);
  if (isPlant(s)) return buildPlant(s, it.width, it.depth, it.height, m, it.color ?? s.color, seed);
  const gr = new THREE.Group();
  const w = it.width;
  const d = it.depth;
  const h = it.height;
  const color = featureColor(s, it);
  const mat = m(color, { rough: 0.85 });
  switch (s.id) {
    case 'raised_timber': {
      const t = Number(it.options?.thick ?? 75);
      const timber = BED_TIMBERS[String(it.options?.timber ?? 'hardwood')] ?? BED_TIMBERS.hardwood;
      const courses = Math.max(1, Math.round(h / 200));
      const ch = h / courses;
      for (let c = 0; c < courses; c++) {
        const y = c * ch;
        // Slightly different tones per course so the sleepers read.
        const cm = m(it.color ?? shade(timber.color, c % 2 ? 0.92 : 1), { rough: 0.9 });
        boxAt(gr, cm, w, ch - 4, t, 0, y, -d / 2 + t / 2);
        boxAt(gr, cm, w, ch - 4, t, 0, y, d / 2 - t / 2);
        boxAt(gr, cm, t, ch - 4, d - 2 * t, -w / 2 + t / 2, y, 0);
        boxAt(gr, cm, t, ch - 4, d - 2 * t, w / 2 - t / 2, y, 0);
      }
      bedFill(gr, it, w - 2 * t, d - 2 * t, h, m, false, seed);
      break;
    }
    case 'raised_birdies': {
      const steelMat = (len: number) => {
        const sm = texMat(color, corrugated(), [len / 76, 1], selected, 0.45, THREE.DoubleSide);
        sm.metalness = 0.35;
        return sm;
      };
      const round = it.options?.shape === 'round';
      if (round) {
        const side = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 48, 1, true), steelMat(Math.PI * w));
        side.position.y = h / 2;
        side.castShadow = true;
        gr.add(side);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(w / 2, 15, 6, 48), m(color, { rough: 0.45, metal: 0.35 }));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = h;
        gr.add(rim);
      } else {
        const panel = (len: number, x: number, z: number, ry: number) => {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, h, 12), steelMat(len));
          mesh.position.set(x, h / 2, z);
          mesh.rotation.y = ry;
          mesh.castShadow = true;
          gr.add(mesh);
        };
        const rc = 60;
        panel(w - 2 * rc, 0, -d / 2, 0);
        panel(w - 2 * rc, 0, d / 2, 0);
        panel(d - 2 * rc, -w / 2, 0, Math.PI / 2);
        panel(d - 2 * rc, w / 2, 0, Math.PI / 2);
        const cm = m(color, { rough: 0.45, metal: 0.35 });
        for (const [x, z] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ])
          cylinder(gr, cm, rc, rc, h, x * (w / 2 - rc), 0, z * (d / 2 - rc), 12);
        // Rolled top edge.
        for (const [len, x, z, ry] of [
          [w, 0, -d / 2, 0],
          [w, 0, d / 2, 0],
          [d, -w / 2, 0, Math.PI / 2],
          [d, w / 2, 0, Math.PI / 2],
        ]) {
          const lip = boxAt(gr, cm, len, 25, 30, x, h - 25, z);
          lip.rotation.y = ry;
        }
      }
      bedFill(gr, it, w - 40, d - 40, h, m, round, seed);
      break;
    }
    case 'letterbox_pier': {
      boxAt(gr, mat, w, h - 60, d, 0, 0, 0);
      boxAt(gr, m('#d8d2c6', { rough: 0.8 }), w + 60, 60, d + 60, 0, h - 60, 0);
      boxAt(gr, m('#2a2a2a', { rough: 0.5, metal: 0.4 }), w * 0.55, 30, 6, 0, h - 300, d / 2 + 1);
      boxAt(gr, m('#3a3a3a', { rough: 0.5, metal: 0.4 }), w * 0.6, w * 0.6, 6, 0, h - 300 - w * 0.65, -d / 2 - 1);
      break;
    }
    case 'letterbox_post': {
      const post = m('#3a3a3a', { rough: 0.6, metal: 0.3 });
      boxAt(gr, post, 65, h - 300, 65, 0, 0, 0);
      boxAt(gr, mat, w, 220, d, 0, h - 300, 0);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(d / 2, d / 2, w, 16, 1, false, 0, Math.PI), mat);
      top.rotation.set(0, 0, Math.PI / 2);
      top.position.y = h - 80;
      top.castShadow = true;
      gr.add(top);
      boxAt(gr, m('#111', { rough: 0.5 }), w * 0.5, 20, 4, 0, h - 160, d / 2 + 1);
      break;
    }
    case 'letterbox_pillar': {
      boxAt(gr, m(color, { rough: 0.5, metal: 0.3 }), w, h, d, 0, 0, 0);
      boxAt(gr, m('#111', { rough: 0.5 }), w * 0.6, 25, 4, 0, h - 180, d / 2 + 1);
      boxAt(gr, m(shade(color, 0.8), { rough: 0.5, metal: 0.3 }), w * 0.7, h * 0.35, 4, 0, h * 0.4, -d / 2 - 1);
      break;
    }
    case 'stepping_stone':
      cylinder(gr, m(color, { rough: 0.95 }), w / 2, w / 2, h, 0, 0, 0, 18);
      break;
    case 'boulder': {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), m(color, { rough: 1 }));
      rock.scale.set(w / 2, h, d / 2);
      rock.position.y = h * 0.35;
      rock.rotation.y = (seed % 100) / 16;
      rock.castShadow = true;
      gr.add(rock);
      break;
    }
    case 'retaining_wall': {
      const courses = Math.max(1, Math.round(h / 200));
      for (let c = 0; c < courses; c++) boxAt(gr, m(it.color ?? shade(color, c % 2 ? 0.92 : 1), { rough: 0.9 }), w, h / courses - 3, d, 0, (c * h) / courses, 0);
      break;
    }
    case 'pot': {
      cylinder(gr, m(color, { rough: 0.8 }), w / 2, w * 0.36, h * 0.6, 0, 0, 0, 20);
      const shrub = buildPlant(GARDEN_SHRUB, w * 0.9, w * 0.9, h * 0.7, m, '#5f8a45', seed);
      shrub.position.y = h * 0.5;
      gr.add(shrub);
      break;
    }
    case 'birdbath': {
      const stone = m(color, { rough: 0.9 });
      cylinder(gr, stone, w * 0.15, w * 0.22, h - 120, 0, 0, 0, 14);
      cylinder(gr, stone, w / 2, w * 0.3, 120, 0, h - 120, 0, 24);
      cylinder(gr, m('#8fbfd1', { rough: 0.1, metal: 0.1 }), w * 0.44, w * 0.44, 5, 0, h - 10, 0, 24);
      break;
    }
    case 'fire_pit': {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 28, 1, true), m(color, { rough: 0.5, metal: 0.5 }));
      (ring.material as THREE.Material).side = THREE.DoubleSide;
      ring.position.y = h / 2;
      ring.castShadow = true;
      gr.add(ring);
      cylinder(gr, m('#3a2a20', { rough: 1 }), w * 0.48, w * 0.48, h * 0.4, 0, 0, 0, 24);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(w * 0.18, h * 0.9, 8), m('#ff8a2b', { emissive: '#ff6a00' }));
      flame.position.y = h * 0.4 + h * 0.45;
      gr.add(flame);
      break;
    }
    case 'bench': {
      const leg = m('#3a3a3a', { rough: 0.6, metal: 0.4 });
      for (const x of [-w / 2 + 100, w / 2 - 100]) {
        boxAt(gr, leg, 50, 430, d * 0.9, x, 0, 0);
        boxAt(gr, leg, 50, h - 430, 40, x, 430, -d / 2 + 40);
      }
      for (let i = 0; i < 4; i++) boxAt(gr, mat, w, 30, d * 0.2, 0, 430, -d * 0.35 + i * d * 0.24);
      for (let i = 0; i < 3; i++) boxAt(gr, mat, w, 80, 25, 0, 520 + i * 100, -d / 2 + 40);
      break;
    }
    case 'tank_slim': {
      const steel = texMat(color, corrugated(), [w / 76, 1], selected, 0.45);
      steel.metalness = 0.3;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), steel);
      mesh.position.y = h / 2;
      mesh.castShadow = true;
      gr.add(mesh);
      cylinder(gr, m('#8a8a8a', { rough: 0.4, metal: 0.6 }), 20, 20, 60, w / 2 - 200, 150, d / 2 + 30);
      break;
    }
    case 'tank_round': {
      const steel = texMat(color, corrugated(), [(Math.PI * w) / 76, 1], selected, 0.45);
      steel.metalness = 0.3;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 40), steel);
      mesh.position.y = h / 2;
      mesh.castShadow = true;
      gr.add(mesh);
      const lid = new THREE.Mesh(new THREE.ConeGeometry(w / 2 + 10, 200, 40), m(color, { rough: 0.45, metal: 0.3 }));
      lid.position.y = h + 100;
      gr.add(lid);
      break;
    }
    case 'clothesline': {
      const steel = m(color, { rough: 0.4, metal: 0.6 });
      cylinder(gr, steel, 25, 25, h, 0, 0, 0, 10);
      const r = w / 2;
      const top = h - 50;
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(r, 20, 20), steel);
        arm.position.set((Math.cos(a) * r) / 2, top - 150, (Math.sin(a) * r) / 2);
        arm.rotation.set(0, -a, -0.12);
        gr.add(arm);
      }
      const line = m('#e8e8e8', { rough: 0.6 });
      for (const k of [0.35, 0.65, 0.95]) {
        const s2 = (r * k) / Math.SQRT2;
        const y = top - 150 - k * 110;
        boxAt(gr, line, s2 * 2, 6, 6, 0, y, -s2);
        boxAt(gr, line, s2 * 2, 6, 6, 0, y, s2);
        boxAt(gr, line, 6, 6, s2 * 2, -s2, y, 0);
        boxAt(gr, line, 6, 6, s2 * 2, s2, y, 0);
      }
      break;
    }
    case 'shed': {
      const wallH = h * 0.8;
      const steel = texMat(color, corrugated(), [w / 76, 1], selected, 0.5);
      steel.metalness = 0.25;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), steel);
      body.position.y = wallH / 2;
      body.castShadow = true;
      gr.add(body);
      const rise = h - wallH;
      const half = Math.hypot(d / 2 + 60, rise);
      const roofMat = m(shade(color, 0.85), { rough: 0.5, metal: 0.25 });
      for (const sgn of [-1, 1]) {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 120, 20, half), roofMat);
        roof.position.set(0, wallH + rise / 2, (sgn * (d / 2 + 60)) / 2);
        roof.rotation.x = sgn * Math.atan2(rise, d / 2 + 60);
        roof.castShadow = true;
        gr.add(roof);
      }
      const gable = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
      for (const sgn of [-1, 1]) {
        const gm = new THREE.Mesh(new THREE.ShapeGeometry(gable), m(color, { rough: 0.5 }));
        (gm.material as THREE.Material).side = THREE.DoubleSide;
        gm.rotation.y = Math.PI / 2;
        gm.position.set((sgn * w) / 2, wallH, 0);
        gr.add(gm);
      }
      boxAt(gr, m(shade(color, 0.7), { rough: 0.5 }), w * 0.45, wallH * 0.9, 6, 0, 0, d / 2 + 2);
      break;
    }
    case 'compost': {
      cylinder(gr, m(color, { rough: 0.8 }), w * 0.38, w / 2, h - 60, 0, 0, 0, 20);
      cylinder(gr, m(shade(color, 0.8), { rough: 0.8 }), w * 0.36, w * 0.4, 60, 0, h - 60, 0, 20);
      break;
    }
    default:
      if (s.round) cylinder(gr, mat, w / 2, w / 2, h, 0, 0, 0, 20);
      else boxAt(gr, mat, w, h, d, 0, 0, 0);
  }
  return gr;
}

/** Shrub used in pots. */
const GARDEN_SHRUB: GardenSpec = { id: 'pot_shrub', name: 'Shrub', group: 'native', width: 500, depth: 500, height: 500, color: '#5f8a45', form: 'shrub' };

/** Soil in a raised bed, and whatever's growing in it. */
function bedFill(gr: THREE.Group, it: GardenItem, iw: number, id: number, h: number, m: MatFn, round: boolean, seed: number) {
  const soilTop = h - 50;
  const soilMat = m('#4a3626', { rough: 1 });
  if (round) cylinder(gr, soilMat, iw / 2, iw / 2, soilTop, 0, 0, 0, 32);
  else boxAt(gr, soilMat, iw, soilTop, id, 0, 0, 0);
  for (const c of cropLayout(it)) {
    const pw = Math.min(c.spec.width, 450);
    const ph = Math.min(c.spec.height, c.spec.form === 'tomato' ? 1300 : 600);
    const p = buildPlant(c.spec, pw, pw, ph, m, c.spec.color, seed + Math.round(c.x * 7 + c.y));
    p.position.set(c.x, soilTop, c.y);
    gr.add(p);
  }
}
