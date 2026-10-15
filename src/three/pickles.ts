import * as THREE from 'three';
import { pointInPolygon } from '../geometry';
import type { Design, Vec } from '../types';
import { blocked, floorAt, moveWithCollisions } from './walk';
import type { Box, WalkWorld } from './walk';
import { ctx } from './shotgun';
import type { Mess } from './shotgun';

/**
 * Shotgun-mode targets: pickles on little legs running round the house. They wander, scatter when you get
 * close, and burst into chunks when shot. Clear a wave and a bigger one turns up.
 */

const LEG = 170;
const BODY_R = 85;
const BODY_LEN = 260;
const BODY_Y = LEG + BODY_LEN / 2 + BODY_R - 20;

const mats = {
  skin: new THREE.MeshStandardMaterial({ color: '#5f8a2b', roughness: 0.55 }),
  bump: new THREE.MeshStandardMaterial({ color: '#4a6d1f', roughness: 0.6 }),
  limb: new THREE.MeshStandardMaterial({ color: '#6e9a34', roughness: 0.6 }),
  white: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }),
  black: new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.4 }),
  shoe: new THREE.MeshStandardMaterial({ color: '#b3261e', roughness: 0.5 }),
};
const geos = {
  body: new THREE.CapsuleGeometry(BODY_R, BODY_LEN, 6, 16),
  bump: new THREE.SphereGeometry(13, 8, 6),
  eye: new THREE.SphereGeometry(26, 14, 10),
  pupil: new THREE.SphereGeometry(11, 10, 8),
  brow: new THREE.BoxGeometry(46, 9, 8),
  mouth: new THREE.TorusGeometry(24, 4, 6, 12, Math.PI),
  arm: new THREE.CylinderGeometry(11, 11, 150, 8),
  hand: new THREE.SphereGeometry(18, 8, 6),
  leg: new THREE.CylinderGeometry(15, 13, LEG, 8),
  shoe: new THREE.BoxGeometry(52, 32, 86),
};

interface Pickle {
  root: THREE.Group;
  body: THREE.Group;
  legs: THREE.Object3D[];
  arms: THREE.Object3D[];
  p: Vec;
  feet: number;
  heading: number;
  speed: number;
  phase: number;
  turnIn: number;
  hop: number;
  vy: number;
  alive: boolean;
}

function makePickle(): Omit<Pickle, 'p' | 'feet' | 'heading' | 'speed' | 'phase' | 'turnIn' | 'hop' | 'vy' | 'alive'> {
  const root = new THREE.Group();
  root.userData.pickle = true;
  const body = new THREE.Group();
  body.position.y = BODY_Y;
  root.add(body);
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const trunk = add(body, geos.body, mats.skin, 0, 0, 0);
  trunk.scale.set(1, 1, 0.92);
  trunk.castShadow = true;
  // Warts, avoiding the face.
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2;
    const h = (Math.random() - 0.5) * (BODY_LEN + 60);
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI / 2) < 0.8 && h > 10) continue;
    add(body, geos.bump, mats.bump, Math.cos(a) * BODY_R * 0.97, h, Math.sin(a) * BODY_R * 0.9);
  }
  // Face (front is +z).
  for (const sx of [-1, 1]) {
    add(body, geos.eye, mats.white, sx * 34, 115, 62);
    add(body, geos.pupil, mats.black, sx * 30, 113, 85);
    const brow = add(body, geos.brow, mats.black, sx * 34, 148, 76);
    brow.rotation.z = sx * -0.45; // angry
  }
  const mouth = add(body, geos.mouth, mats.black, 0, 55, 76);
  mouth.rotation.z = Math.PI; // grimace
  // Arms swing from the shoulders.
  const arms: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (BODY_R - 5), 30, 0);
    pivot.rotation.z = sx * 0.5;
    add(pivot, geos.arm, mats.limb, 0, -75, 0);
    add(pivot, geos.hand, mats.limb, 0, -150, 0);
    body.add(pivot);
    arms.push(pivot);
  }
  // Legs swing from the hips.
  const legs: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 38, LEG, 0);
    add(pivot, geos.leg, mats.limb, 0, -LEG / 2, 0);
    add(pivot, geos.shoe, mats.shoe, 0, -LEG + 10, 18);
    root.add(pivot);
    legs.push(pivot);
  }
  return { root, body, legs, arms };
}

function squish() {
  const a = ctx();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(420, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.25);
  const g = a.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + 0.32);
  const n = a.createBufferSource();
  const buf = a.createBuffer(1, a.sampleRate * 0.4, a.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length) ** 2;
  n.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(2500, t);
  f.frequency.exponentialRampToValueAtTime(200, t + 0.35);
  const ng = a.createGain();
  ng.gain.value = 0.6;
  n.connect(f).connect(ng).connect(a.destination);
  n.start(t);
}

export class Pickles {
  group = new THREE.Group();
  private list: Pickle[] = [];
  kills = 0;
  wave = 0;
  /** Seconds until the next wave turns up, once this one's cleared. */
  private waveIn = -1;

  get left() {
    return this.list.filter((p) => p.alive).length;
  }

  /** Put `count` pickles in the rooms (or round `near` if there are none), away from the player. */
  spawn(d: Design, world: WalkWorld, near: Vec, count: number) {
    this.wave++;
    const rooms = d.rooms.filter((r) => r.points.length >= 3);
    const pick = (): Vec | null => {
      for (let tries = 0; tries < 300; tries++) {
        let p: Vec;
        if (rooms.length) {
          const r = rooms[Math.floor(Math.random() * rooms.length)];
          const xs = r.points.map((q) => q.x);
          const ys = r.points.map((q) => q.y);
          p = { x: Math.min(...xs) + Math.random() * (Math.max(...xs) - Math.min(...xs)), y: Math.min(...ys) + Math.random() * (Math.max(...ys) - Math.min(...ys)) };
          if (!pointInPolygon(p, r.points)) continue;
        } else {
          const a = Math.random() * Math.PI * 2;
          const k = 1500 + Math.random() * 4000;
          p = { x: near.x + Math.cos(a) * k, y: near.y + Math.sin(a) * k };
        }
        if (Math.hypot(p.x - near.x, p.y - near.y) < 1200 || blocked(world, p)) continue;
        return p;
      }
      return null;
    };
    for (let i = 0; i < count; i++) {
      const p = pick();
      if (!p) continue;
      const parts = makePickle();
      const pk: Pickle = {
        ...parts,
        p,
        feet: floorAt(world, p),
        heading: Math.random() * Math.PI * 2,
        speed: 900 + Math.random() * 900,
        phase: Math.random() * 6,
        turnIn: Math.random() * 2,
        hop: 0,
        vy: 0,
        alive: true,
      };
      const s = 0.85 + Math.random() * 0.35;
      pk.root.scale.setScalar(s);
      this.group.add(pk.root);
      this.list.push(pk);
      this.place(pk);
    }
  }

  private place(pk: Pickle) {
    pk.root.position.set(pk.p.x, pk.feet + pk.hop, pk.p.y);
    // Local +z (the face) points along the heading.
    pk.root.rotation.y = Math.atan2(Math.cos(pk.heading), Math.sin(pk.heading));
  }

  /** Run about. Returns a message when a new wave arrives. */
  update(dt: number, d: Design, world: WalkWorld, extra: Box[], player: Vec): string | null {
    for (const pk of this.list) {
      if (!pk.alive) continue;
      // Scatter away from the player when they get close, otherwise wander.
      const away = Math.atan2(pk.p.y - player.y, pk.p.x - player.x);
      const dist = Math.hypot(pk.p.x - player.x, pk.p.y - player.y);
      pk.turnIn -= dt;
      if (dist < 2500) {
        const diff = Math.atan2(Math.sin(away - pk.heading), Math.cos(away - pk.heading));
        pk.heading += diff * Math.min(1, dt * 4);
      } else if (pk.turnIn <= 0) {
        pk.heading += (Math.random() - 0.5) * 2.2;
        pk.turnIn = 0.8 + Math.random() * 2;
      }
      const speed = pk.speed * (dist < 2500 ? 1.6 : 1);
      const want = { x: Math.cos(pk.heading) * speed * dt, y: Math.sin(pk.heading) * speed * dt };
      const next = moveWithCollisions(world, pk.p, want, pk.feet, extra);
      const moved = Math.hypot(next.x - pk.p.x, next.y - pk.p.y);
      // Bumped into something: turn round (roughly).
      if (moved < Math.hypot(want.x, want.y) * 0.5) pk.heading += Math.PI * (0.5 + Math.random());
      pk.p = next;
      // Feet follow the floor; the odd excited hop.
      const floor = floorAt(world, pk.p);
      pk.feet += (floor - pk.feet) * Math.min(1, dt * 12);
      if (pk.hop <= 0 && pk.vy === 0 && Math.random() < dt * 0.25) pk.vy = 2200;
      if (pk.vy !== 0 || pk.hop > 0) {
        pk.vy -= 9800 * dt;
        pk.hop += pk.vy * dt;
        if (pk.hop <= 0) {
          pk.hop = 0;
          pk.vy = 0;
        }
      }
      // Run cycle.
      pk.phase += dt * speed * 0.012;
      const sw = Math.sin(pk.phase);
      pk.legs[0].rotation.x = sw * 0.8;
      pk.legs[1].rotation.x = -sw * 0.8;
      pk.arms[0].rotation.x = -sw * 0.9;
      pk.arms[1].rotation.x = sw * 0.9;
      pk.body.position.y = BODY_Y + Math.abs(Math.cos(pk.phase)) * 22;
      pk.body.rotation.x = 0.12; // leaning into the run
      pk.body.rotation.z = sw * 0.06;
      this.place(pk);
    }
    if (this.left === 0 && this.list.length && this.waveIn < 0) this.waveIn = 2.5;
    if (this.waveIn >= 0) {
      this.waveIn -= dt;
      if (this.waveIn < 0) {
        this.clear(false);
        this.spawn(d, world, player, Math.min(30, 8 + this.wave * 4));
        return `WAVE ${this.wave}`;
      }
    }
    return null;
  }

  /** The pickle an object belongs to (if it's alive). */
  find(o: THREE.Object3D | null): Pickle | null {
    for (; o; o = o.parent) if (o.userData.pickle) return this.list.find((p) => p.root === o && p.alive) ?? null;
    return null;
  }

  explode(pk: Pickle, mess: Mess, dir: THREE.Vector3) {
    pk.alive = false;
    this.kills++;
    pk.root.removeFromParent();
    squish();
    const s = pk.root.scale.x;
    const c = new THREE.Vector3(pk.p.x, pk.feet + pk.hop + BODY_Y * s, pk.p.y);
    mess.burst(c, dir, new THREE.Color('#5f8a2b'), 26);
    mess.burst(c, dir, new THREE.Color('#d2dc8a'), 16); // the inside
    mess.burst(c, dir, new THREE.Color('#ffffff'), 3); // eyeballs
    mess.splat(new THREE.Vector3(pk.p.x, pk.feet + 1, pk.p.y), new THREE.Vector3(0, 1, 0), 520 * s);
  }

  clear(all = true) {
    for (const pk of this.list) pk.root.removeFromParent();
    this.list = [];
    if (all) {
      this.kills = 0;
      this.wave = 0;
      this.waveIn = -1;
    } else this.waveIn = -1;
  }
}
