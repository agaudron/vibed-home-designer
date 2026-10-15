import * as THREE from 'three';

/**
 * Walk-through easter egg (type "idkfa"): a double-barrel shotgun drawn over the view, plus the mess it makes —
 * bullet holes, debris, shattered glass and shaken furniture. None of it touches the design; it all goes away
 * when you leave the walk-through.
 */

// ---------- Sound (synthesised, no files) ----------

let audio: AudioContext | null = null;
let noise: AudioBuffer | null = null;

export function ctx(): AudioContext | null {
  try {
    if (!audio) {
      audio = new AudioContext();
      noise = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
      const ch = noise.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    if (audio.state === 'suspended') audio.resume();
    return audio;
  } catch {
    return null;
  }
}

function burst(opts: { type: BiquadFilterType; from: number; to: number; gain: number; dur: number; delay?: number }) {
  const a = ctx();
  if (!a || !noise) return;
  const t = a.currentTime + (opts.delay ?? 0);
  const src = a.createBufferSource();
  src.buffer = noise;
  const f = a.createBiquadFilter();
  f.type = opts.type;
  f.frequency.setValueAtTime(opts.from, t);
  f.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur);
  const g = a.createGain();
  g.gain.setValueAtTime(opts.gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + opts.dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t, Math.random() * 0.3, opts.dur + 0.05);
}

function thump(gain: number) {
  const a = ctx();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator();
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(35, t + 0.25);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + 0.32);
}

export const sounds = {
  shot(both: boolean) {
    burst({ type: 'lowpass', from: 6000, to: 250, gain: both ? 1 : 0.75, dur: both ? 0.75 : 0.55 });
    thump(both ? 0.9 : 0.7);
  },
  click(delay = 0) {
    burst({ type: 'highpass', from: 2500, to: 1800, gain: 0.35, dur: 0.04, delay });
    burst({ type: 'bandpass', from: 900, to: 600, gain: 0.3, dur: 0.05, delay: delay + 0.02 });
  },
  glass() {
    burst({ type: 'highpass', from: 5000, to: 2500, gain: 0.45, dur: 0.5 });
    const a = ctx();
    if (!a) return;
    for (let i = 0; i < 6; i++) {
      const t = a.currentTime + Math.random() * 0.25;
      const o = a.createOscillator();
      o.frequency.value = 2800 + Math.random() * 3500;
      const g = a.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + 0.16);
    }
  },
};

// ---------- The gun ----------

function radial(stops: [number, string][]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [at, col] of stops) grad.addColorStop(at, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const RELOAD_TIME = 1.15;

export class Shotgun {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(70, 1, 5, 5000);
  private gun = new THREE.Group();
  private flash: THREE.Sprite;
  private flashLight = new THREE.PointLight('#ffb35c', 0, 1500, 0);
  private flashT = 0;
  private kick = 0;
  private bob = 0;
  loaded = 2;
  private reloading = -1; // seconds into a reload, or -1
  private reloadWait = -1; // pause after the last shot before breaking the gun open

  constructor() {
    const metal = new THREE.MeshStandardMaterial({ color: '#4a4e55', metalness: 0.45, roughness: 0.38 });
    const blued = new THREE.MeshStandardMaterial({ color: '#565b63', metalness: 0.4, roughness: 0.32 });
    const wood = new THREE.MeshStandardMaterial({ color: '#6b3a1e', roughness: 0.55 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      this.gun.add(m);
      return m;
    };
    for (const x of [-16, 16]) add(new THREE.CylinderGeometry(15, 15, 620, 24), metal, x, 0, -310, Math.PI / 2);
    add(new THREE.BoxGeometry(10, 8, 600), blued, 0, 15, -300); // top rib
    add(new THREE.BoxGeometry(20, 14, 600), blued, 0, -8, -300); // bottom rib
    add(new THREE.SphereGeometry(5, 10, 8), new THREE.MeshStandardMaterial({ color: '#d9d2c0', metalness: 1, roughness: 0.2 }), 0, 22, -590); // bead
    add(new THREE.BoxGeometry(66, 60, 150), blued, 0, -8, 70); // receiver
    for (const x of [-14, 14]) add(new THREE.BoxGeometry(9, 26, 22), metal, x, 30, 130, -0.5); // hammers
    add(new THREE.BoxGeometry(48, 34, 260), wood, 0, -30, -150); // forend
    add(new THREE.BoxGeometry(40, 50, 130), wood, 0, -34, 205, 0.28); // wrist
    add(new THREE.BoxGeometry(44, 100, 250), wood, 0, -78, 340, 0.12); // butt
    const guard = add(new THREE.TorusGeometry(20, 3.5, 8, 16, Math.PI), metal, 0, -40, 120);
    guard.rotation.set(0, Math.PI / 2, Math.PI);
    add(new THREE.BoxGeometry(5, 26, 6), metal, 0, -48, 118, 0.3); // trigger

    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radial([
          [0, 'rgba(255,255,230,1)'],
          [0.25, 'rgba(255,210,90,0.95)'],
          [0.6, 'rgba(255,110,20,0.5)'],
          [1, 'rgba(255,60,0,0)'],
        ]),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.flash.position.set(0, 0, -700);
    this.flash.visible = false;
    this.gun.add(this.flash);
    this.flashLight.position.set(0, 0, -650);
    this.gun.add(this.flashLight);

    this.scene.add(this.gun);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#4a4038', 1.6));
    const key = new THREE.DirectionalLight('#fff4e0', 2);
    key.position.set(-1, 2, 1);
    this.scene.add(key);
    this.pose(0);
  }

  get busy() {
    return this.reloading >= 0 || this.reloadWait >= 0;
  }

  /** Fire one barrel (or both). Returns how many barrels went off. */
  fire(both: boolean): number {
    if (this.busy) return 0;
    if (this.loaded === 0) {
      this.reload();
      return 0;
    }
    const n = both ? this.loaded : 1;
    this.loaded -= n;
    this.kick = Math.min(1.6, this.kick + (n === 2 ? 1.5 : 1));
    this.flashT = 0.06;
    this.flash.material.rotation = Math.random() * Math.PI * 2;
    this.flash.scale.setScalar((n === 2 ? 420 : 300) * (0.85 + Math.random() * 0.3));
    sounds.shot(n === 2);
    if (this.loaded === 0) this.reloadWait = 0.35;
    return n;
  }

  reload() {
    if (this.busy || this.loaded === 2) return;
    this.reloading = 0;
    sounds.click();
  }

  update(dt: number, moving: number) {
    this.kick *= Math.exp(-dt * 8);
    this.flashT -= dt;
    this.bob += dt * moving * 9;
    if (this.reloadWait >= 0) {
      this.reloadWait += dt;
      if (this.reloadWait > 0.35) {
        this.reloadWait = -1;
        this.reloading = 0;
        sounds.click();
      }
    }
    if (this.reloading >= 0) {
      const before = this.reloading;
      this.reloading += dt;
      if (before < RELOAD_TIME * 0.8 && this.reloading >= RELOAD_TIME * 0.8) sounds.click();
      if (this.reloading >= RELOAD_TIME) {
        this.reloading = -1;
        this.loaded = 2;
      }
    }
    this.pose(moving);
  }

  private pose(moving: number) {
    const r = this.reloading >= 0 ? Math.sin((Math.PI * this.reloading) / RELOAD_TIME) : 0;
    const bob = Math.sin(this.bob) * 8 * moving;
    const sway = Math.cos(this.bob / 2) * 6 * moving;
    this.gun.position.set(150 + sway, -165 + bob - r * 70 - this.kick * 12, -330 + this.kick * 70);
    this.gun.rotation.set(this.kick * 0.32 - r * 0.75, 0.05, -r * 0.25);
    const lit = this.flashT > 0;
    this.flash.visible = lit;
    this.flashLight.intensity = lit ? 6 : 0;
  }

  setAspect(aspect: number, fov: number) {
    if (this.cam.aspect !== aspect || this.cam.fov !== fov) {
      this.cam.aspect = aspect;
      this.cam.fov = fov;
      this.cam.updateProjectionMatrix();
    }
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose();
    });
  }
}

// ---------- The mess ----------

interface Particle {
  obj: THREE.Object3D;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  max: number;
  fade?: THREE.Material & { opacity: number };
  grow?: number;
}

interface Shake {
  t: number;
  pos: THREE.Vector3;
  rot: THREE.Euler;
  dir: THREE.Vector3;
}

const MAX_HOLES = 800;
const GRAVITY = 9800;

export class Mess {
  group = new THREE.Group();
  private holeGeo = new THREE.PlaneGeometry(1, 1);
  private holeMat = new THREE.MeshBasicMaterial({
    map: radial([
      [0, 'rgba(8,6,5,1)'],
      [0.35, 'rgba(20,16,12,0.95)'],
      [0.55, 'rgba(60,52,44,0.45)'],
      [1, 'rgba(90,80,70,0)'],
    ]),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  private puffMap = radial([
    [0, 'rgba(200,195,185,0.8)'],
    [1, 'rgba(200,195,185,0)'],
  ]);
  private chipGeo = new THREE.BoxGeometry(1, 1, 1);
  private shardGeo = new THREE.PlaneGeometry(1, 1);
  private chipMats = new Map<string, THREE.Material>();
  private shardMat = new THREE.MeshStandardMaterial({ color: '#cfe6ee', transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide });
  private holes: THREE.Object3D[] = [];
  private particles: Particle[] = [];
  private shakes = new Map<THREE.Object3D, Shake>();
  private hidden: THREE.Object3D[] = [];

  /** A bullet hole at p on a surface facing n. Stuck to `parent` (e.g. a door leaf) if given. */
  hole(p: THREE.Vector3, n: THREE.Vector3, parent?: THREE.Object3D) {
    const m = new THREE.Mesh(this.holeGeo, this.holeMat);
    m.userData.fx = true; // shared geometry: the house's disposeTree must leave it alone
    m.position.copy(p).addScaledVector(n, 0.5);
    m.lookAt(p.clone().add(n));
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(16 + Math.random() * 14);
    this.group.add(m);
    if (parent) parent.attach(m);
    this.holes.push(m);
    if (this.holes.length > MAX_HOLES) this.holes.shift()!.removeFromParent();
  }

  /** Chips flying off a surface plus a little dust. */
  debris(p: THREE.Vector3, n: THREE.Vector3, color: THREE.Color | null, count = 4) {
    const key = color ? color.getHexString() : 'ccc';
    let mat = this.chipMats.get(key);
    if (!mat) this.chipMats.set(key, (mat = new THREE.MeshStandardMaterial({ color: color ?? '#cccccc', roughness: 0.8 })));
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.chipGeo, mat);
      m.position.copy(p).addScaledVector(n, 5);
      m.scale.set(6 + Math.random() * 14, 4 + Math.random() * 8, 6 + Math.random() * 12);
      const v = n.clone().multiplyScalar(1200 + Math.random() * 1800).add(rand(900));
      this.spawn(m, v, 0.9 + Math.random() * 0.5);
    }
    const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffMap, transparent: true, depthWrite: false, opacity: 0.7 }));
    puff.position.copy(p).addScaledVector(n, 20);
    puff.scale.setScalar(60);
    this.spawn(puff, n.clone().multiplyScalar(300), 0.6, puff.material, 220);
  }

  private splatMat = new THREE.MeshBasicMaterial({
    map: radial([
      [0, 'rgba(110,150,40,0.95)'],
      [0.45, 'rgba(95,138,43,0.8)'],
      [0.7, 'rgba(140,170,60,0.35)'],
      [1, 'rgba(140,170,60,0)'],
    ]),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  /** Chunks flying everywhere (an exploding pickle), pushed along `dir`. */
  burst(p: THREE.Vector3, dir: THREE.Vector3, color: THREE.Color, count: number) {
    const key = color.getHexString();
    let mat = this.chipMats.get(key);
    if (!mat) this.chipMats.set(key, (mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 })));
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.chipGeo, mat);
      m.position.copy(p).add(rand(120));
      m.scale.set(15 + Math.random() * 40, 12 + Math.random() * 30, 15 + Math.random() * 40);
      const v = rand(5000).add(dir.clone().multiplyScalar(1500)).setY(800 + Math.random() * 3200);
      this.spawn(m, v, 1.6 + Math.random() * 1.2);
    }
    const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffMap, color: '#a9c46a', transparent: true, depthWrite: false, opacity: 0.7 }));
    puff.position.copy(p);
    puff.scale.setScalar(250);
    this.spawn(puff, new THREE.Vector3(0, 200, 0), 0.7, puff.material, 900);
  }

  /** A pickle-juice splat on a surface. */
  splat(p: THREE.Vector3, n: THREE.Vector3, size: number) {
    const m = new THREE.Mesh(this.holeGeo, this.splatMat);
    m.userData.fx = true;
    m.position.copy(p).addScaledVector(n, 0.5);
    m.lookAt(p.clone().add(n));
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.set(size * (0.8 + Math.random() * 0.4), size * (0.8 + Math.random() * 0.4), 1);
    this.group.add(m);
    this.holes.push(m);
    if (this.holes.length > MAX_HOLES) this.holes.shift()!.removeFromParent();
  }

  /** Smash a pane of glass: hide it and throw shards. */
  shatter(pane: THREE.Object3D, p: THREE.Vector3, dir: THREE.Vector3) {
    pane.visible = false;
    this.hidden.push(pane);
    sounds.glass();
    const box = new THREE.Box3().setFromObject(pane);
    const size = box.getSize(new THREE.Vector3());
    const count = Math.min(70, 20 + Math.round((size.x + size.y + size.z) / 40));
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.shardGeo, this.shardMat);
      m.position.set(box.min.x + Math.random() * size.x, box.min.y + Math.random() * size.y, box.min.z + Math.random() * size.z);
      if (i < count / 3) m.position.lerp(p, 0.6);
      m.scale.set(20 + Math.random() * 70, 20 + Math.random() * 90, 1);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.spawn(m, dir.clone().multiplyScalar(500 + Math.random() * 1500).add(rand(700)), 1.4 + Math.random() * 0.6);
    }
  }

  /** Make an item jump and wobble back into place. */
  shake(obj: THREE.Object3D, dir: THREE.Vector3) {
    const s = this.shakes.get(obj);
    if (s) {
      s.t = 0;
      return;
    }
    this.shakes.set(obj, { t: 0, pos: obj.position.clone(), rot: obj.rotation.clone(), dir: dir.clone().setY(0).normalize() });
  }

  private spawn(obj: THREE.Object3D, v: THREE.Vector3, max: number, fade?: THREE.Material & { opacity: number }, grow?: number) {
    this.group.add(obj);
    this.particles.push({ obj, v, spin: rand(14), life: 0, max, fade, grow });
  }

  update(dt: number) {
    this.particles = this.particles.filter((pt) => {
      pt.life += dt;
      if (pt.life >= pt.max) {
        pt.obj.removeFromParent();
        if (pt.fade) pt.fade.dispose();
        return false;
      }
      if (pt.fade) {
        pt.fade.opacity = 0.7 * (1 - pt.life / pt.max);
        pt.obj.scale.addScalar((pt.grow ?? 0) * dt);
        pt.obj.position.addScaledVector(pt.v, dt);
        return true;
      }
      pt.v.y -= GRAVITY * dt;
      pt.obj.position.addScaledVector(pt.v, dt);
      if (pt.obj.position.y < 5) {
        // Land on the floor (good enough: floors are near 0) and stop.
        pt.obj.position.y = 5;
        pt.v.set(0, 0, 0);
        pt.spin.set(0, 0, 0);
      }
      pt.obj.rotation.x += pt.spin.x * dt;
      pt.obj.rotation.y += pt.spin.y * dt;
      pt.obj.rotation.z += pt.spin.z * dt;
      return true;
    });
    for (const [obj, s] of this.shakes) {
      s.t += dt;
      const k = Math.exp(-s.t * 6);
      const w = Math.sin(s.t * 38) * k;
      obj.position.copy(s.pos).addScaledVector(s.dir, 25 * k).setY(s.pos.y + 30 * Math.max(0, Math.sin(s.t * 14)) * k);
      obj.rotation.set(s.rot.x + w * 0.05, s.rot.y + w * 0.08, s.rot.z - w * 0.05);
      if (s.t > 0.8) {
        obj.position.copy(s.pos);
        obj.rotation.copy(s.rot);
        this.shakes.delete(obj);
      }
    }
  }

  get busy() {
    return this.particles.length > 0 || this.shakes.size > 0;
  }

  /** Tidy up: remove holes and debris, put glass and furniture back. */
  clear() {
    for (const h of this.holes) h.removeFromParent();
    this.holes = [];
    for (const pt of this.particles) {
      pt.obj.removeFromParent();
      pt.fade?.dispose();
    }
    this.particles = [];
    for (const [obj, s] of this.shakes) {
      obj.position.copy(s.pos);
      obj.rotation.copy(s.rot);
    }
    this.shakes.clear();
    for (const o of this.hidden) o.visible = true;
    this.hidden = [];
  }
}

function rand(s: number) {
  return new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.3) * s, (Math.random() - 0.5) * s);
}

/** Roughly normal random number (for pellet spread). */
export function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}
