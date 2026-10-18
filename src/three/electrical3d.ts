import * as THREE from 'three';
import { cctColor, cctOf, elecLook, isCeilingFan, productOf } from '../electrical';
import type { Design, ElecPoint } from '../types';
import type { MatFn } from './builders';

const LENS = '#fffaf0';
const GLOW = '#fff1c9';
const DARK = '#2a2b2d';

/**
 * A switch / power point plate on a wall, or a light / fan on the ceiling. Local frame: origin on the wall face
 * (wall-mounted, at the point's height) or the ceiling, +z out of the wall, +y up.
 */
export function buildElectrical(d: Design, e: ElecPoint, m: MatFn, ceiling: number, on: boolean | null = null): THREE.Group {
  const p = productOf(e);
  const g = new THREE.Group();
  // Light demo: lights that are on glow brightly, ones that are off don't glow at all.
  const lensMat = () => {
    if (on === null) return m(LENS, { emissive: GLOW });
    const mat = m(on ? cctColor(cctOf(e)) : '#d8d6d0', on ? { emissive: cctColor(cctOf(e)) } : { rough: 0.4 });
    if (on && mat instanceof THREE.MeshStandardMaterial) mat.emissiveIntensity = 3;
    return mat;
  };
  const box = (w: number, h: number, dp: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, dp), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    g.add(mesh);
    return mesh;
  };
  const cyl = (r: number, h: number, mat: THREE.Material, y: number, segs = 24) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segs), mat);
    mesh.position.y = y;
    g.add(mesh);
    return mesh;
  };

  if (p.mount === 'wall' && p.kind !== 'light') {
    const look = elecLook(d, e);
    const plate = m(look.hex, { rough: 0.55 });
    const dark = m(DARK, { rough: 0.6 });
    const dp = p.outdoor ? p.depth : 9;
    box(look.w, look.h, dp, plate, 0, 0, dp / 2);
    const front = dp + 1.5;
    if (p.kind === 'switch' || p.kind === 'fan_control') {
      // Rockers: side by side, in two rows for 4+ gangs.
      const n = p.gangs ?? 1;
      const cols = n >= 4 ? Math.ceil(n / 2) : n;
      const rows = n >= 4 ? 2 : 1;
      const rw = Math.min(28, (look.w - 16) / cols - 3);
      const rh = rows === 2 ? 38 : 56;
      for (let i = 0; i < n; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        box(rw, rh, 3, plate, (c - (cols - 1) / 2) * (rw + 3), rows === 2 ? (r === 0 ? 22 : -22) : 0, front);
      }
    } else if (p.kind === 'dimmer') {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(15, 16, 14, 28), plate);
      knob.rotation.x = Math.PI / 2;
      knob.position.z = dp + 7;
      g.add(knob);
    } else if (p.kind === 'gpo') {
      // Socket faces, each with its switch just above.
      const n = p.id === 'iconic_gpo1' || p.id === 'iconic_gpo15' ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const x = n === 1 ? 0 : (i === 0 ? -1 : 1) * 30;
        box(26, 26, 1.5, dark, x, -6, front - 1);
        box(14, 10, 3, plate, x, 20, front);
      }
      if (p.id.includes('usb')) box(26, 6, 1.5, dark, 0, -28, front - 1);
    } else {
      box(20, 16, 1.5, dark, 0, 0, front - 1);
    }
    g.position.set(e.x, e.height, e.y);
  } else if (p.mount === 'wall') {
    // Wall light: a small fitting with a glowing face.
    const body = m('#3b3d40', { rough: 0.5, metal: 0.3 });
    box(p.w, p.h, p.depth * 0.6, body, 0, 0, p.depth * 0.3);
    box(p.w * 0.8, p.h * 0.6, 4, lensMat(), 0, 0, p.depth * 0.6 + 2);
    g.position.set(e.x, e.height, e.y);
  } else {
    const white = m('#f4f4f2', { rough: 0.5 });
    const lens = lensMat();
    const r = p.w / 2;
    if (p.kind === 'light' && p.id.startsWith('clipsal_dl')) {
      cyl(r, 4, white, -2, 32);
      cyl(r - 14, 2, lens, -4.5, 32);
    } else if (p.id === 'pendant') {
      cyl(3, p.depth, m(DARK), -p.depth / 2, 6);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(r, 260, 32, 1, true), m('#2f3133', { rough: 0.4, metal: 0.4 }));
      (shade.material as THREE.Material).side = THREE.DoubleSide;
      shade.position.y = -p.depth - 100;
      g.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(45, 16, 12), lens);
      bulb.position.y = -p.depth - 200;
      g.add(bulb);
    } else if (p.id === 'oyster') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lens);
      dome.scale.y = p.depth / r;
      g.add(dome);
    } else if (isCeilingFan(p)) {
      const metal = m('#d6d6d2', { rough: 0.4, metal: 0.5 });
      cyl(12, p.depth - 120, metal, -(p.depth - 120) / 2, 8);
      cyl(90, 120, metal, -p.depth + 60);
      for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(r - 100, 8, 140), m('#c9ad85', { rough: 0.6 }));
        const a = (i * Math.PI * 2) / 3;
        blade.position.set(Math.cos(a) * (r / 2 + 40), -p.depth + 40, Math.sin(a) * (r / 2 + 40));
        blade.rotation.y = -a;
        g.add(blade);
      }
      // Fans with a light: a light kit under the hub.
      if (p.fanLight) {
        cyl(120, 40, metal, -p.depth - 20, 32);
        const dish = new THREE.Mesh(new THREE.SphereGeometry(110, 32, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lens);
        dish.scale.y = 0.3;
        dish.position.y = -p.depth - 40;
        g.add(dish);
      }
    } else {
      // Exhaust fan grille.
      box(p.w, p.depth, p.w, white, 0, -p.depth / 2);
      for (let i = -3; i <= 3; i++) box(p.w - 40, 2, 8, m('#c9cacc'), 0, -p.depth - 1, i * 34);
    }
    g.position.set(e.x, ceiling, e.y);
  }
  g.rotation.y = -THREE.MathUtils.degToRad(e.rotation);
  g.userData.sel = { kind: 'electric', id: e.id };
  return g;
}
