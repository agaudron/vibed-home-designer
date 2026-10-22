import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { deleteSelection, moveWallPoints, newItem, newOpening, placementItem, raiseSelection, rotateSelection, wallMovePoints } from '../actions';
import { faceColor, add, clampOpeningOffset, effectiveDoor, effectiveOpenings, evalExpr, itemCorners, mul, roundTo, wallExtensions, wallFrame, wallSpans } from '../geometry';
import { snapItem } from '../plan/snap';
import { QUALITIES, setQuality, store, useStore } from '../store';
import type { RenderQuality } from '../store';
import { exteriorSides, facadeCanvas, FINISHES } from '../facade';
import { generateRoof, roofPlate } from '../roof';
import { DADO_HEIGHT, floorOf, liningRuns, openingRects, openingTrim, trimRuns } from '../trims';
import type { TrimRun } from '../trims';
import type { RoofFace } from '../roof';
import type { Design, Facade, FloorFinish, FloorSize, Item, Opening, Selection, Wall } from '../types';
import { buildItem, buildOpening, Builder } from './builders';
import { buildElectrical } from './electrical3d';
import { buildGarden } from './garden3d';
import { beamOf, cctColor, cctOf, lightSource, litLights, productOf } from '../electrical';
import { floorLevelOf, itemBase } from '../levels';
import { bulkheads } from '../kitchen';
import { useTouch, walkStick } from '../mobile';
import type { ElecPoint } from '../types';
import type { ItemContext, MatFn, MatOpts } from './builders';
import { buildMeasures, measuresForItem } from './measure3d';
import { doorwayBox, EYE_HEIGHT, floorAt, moveWithCollisions, startPose, walkWorld } from './walk';
import type { Box, WalkWorld } from './walk';
import { isTyping } from '../keyboard';
import { clearOffset, doorStopLayout } from '../doorClearance';
import type { DoorStopPlace } from '../doorClearance';
import { DOOR_STOP_SIZE, doorStopProduct } from '../doorStops';
import type { MeasureLabel, Measures } from './measure3d';
import { gauss, Mess, Shotgun } from './shotgun';
import { Music } from './music';
import { Pickles } from './pickles';
import WalkWallEditor from '../panels/WalkWallEditor';

const CUTAWAY_HEIGHT = 1200;
/** YouTube video id: Sabrina Carpenter — House Tour (Official Video), SabrinaCarpenterVEVO. */
const HOUSE_TOUR = 'KWoTyfPsqbE';
/** Start the song this many seconds in (skips the video's intro). */
const HOUSE_TOUR_START = 30;
// The standard player (not the no-cookie one): it can see you're signed in to YouTube, which avoids its
// "confirm you're not a bot" check for anonymous viewers.
const YT_ORIGIN = 'https://www.youtube.com';
/** Shotgun-mode soundtrack (idkfa): "Doom OST - E1M1 - At Doom's Gate" on YouTube. */
const DOOM_TRACK = 'BSsfjHCFosw';

export interface SceneHandle {
  screenshot(): string;
}

let sceneHandle: SceneHandle | null = null;
export const getSceneHandle = () => sceneHandle;
/** Walk-through actions for the on-screen (touch) controls. */
const walkActions: { door?: () => void } = {};

/** Touch walk-through: a thumb joystick to move (forward / back / sideways). */
function WalkStick() {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 46;
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const l = Math.hypot(dx, dy);
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    setKnob({ x: dx, y: dy });
    walkStick.strafe = dx / R;
    walkStick.fwd = -dy / R;
  };
  const end = () => {
    setKnob({ x: 0, y: 0 });
    walkStick.fwd = 0;
    walkStick.strafe = 0;
  };
  useEffect(() => end, []);
  return (
    <div
      className="walk-stick"
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Already lifted: nothing to capture.
        }
        move(e);
      }}
      onPointerMove={(e) => e.buttons && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="walk-stick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

export default function Scene3D() {
  const touchScreen = useTouch();
  const ref = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const cutaway = useStore((s) => s.cutaway);
  const showRoof = useStore((s) => s.showRoof);
  const hasRoof = useStore((s) => !!s.design.roof);
  const placing = useStore((s) => s.tool.kind === 'place' || s.tool.kind === 'opening');
  const walking = useStore((s) => s.walking);
  const quality = useStore((s) => s.quality);
  const [locked, setLocked] = useState(false);
  const [armed, setArmed] = useState(false);
  const [carrying, setCarrying] = useState(false);
  const [wallFace, setWallFace] = useState<{ id: string; side: 1 | -1 } | null>(null);
  const walkSelName = useStore((s) => (s.walking && s.selection?.kind === 'item' ? s.design.items.find((i) => i.id === s.selection!.id)?.name ?? null : null));
  const [toast, setToast] = useState<string | null>(null);
  const [score, setScore] = useState({ kills: 0, left: 0, wave: 0 });
  const [muted, setMuted] = useState(false);
  const [track, setTrack] = useState<string | null>(null);
  const musicRef = useRef<Music | null>(null);
  // Walk-through soundtrack: House Tour by Sabrina Carpenter, played by YouTube's own player (or a music file of
  // your own, which never leaves the browser).
  const [ytOn, setYtOn] = useState(() => {
    try {
      return localStorage.getItem('home-designer:walkMusic') !== '0';
    } catch {
      return true;
    }
  });
  const [ytPaused, setYtPaused] = useState(false);
  // Music never starts by itself: nothing plays (and YouTube's player isn't loaded) until you press play or M.
  const [musicStarted, setMusicStarted] = useState(false);
  const [ytStatus, setYtStatus] = useState<'loading' | 'playing' | 'paused' | 'stuck'>('loading');
  const [ownTrack, setOwnTrack] = useState<{ url: string; name: string } | null>(null);
  const ownAudio = useRef<HTMLAudioElement | null>(null);
  const ytFrame = useRef<HTMLIFrameElement>(null);
  const doomFrame = useRef<HTMLIFrameElement>(null);
  const ytToggle = useRef<() => void>(() => {});
  ytToggle.current = () => toggleMusic();
  const setWalkMusic = (on: boolean) => {
    setYtOn(on);
    setYtPaused(false);
    try {
      localStorage.setItem('home-designer:walkMusic', on ? '1' : '0');
    } catch {
      // ignore
    }
  };
  const ytSend = (msg: object) => ytFrame.current?.contentWindow?.postMessage(JSON.stringify(msg), YT_ORIGIN);
  // Pause for the shotgun's soundtrack or when you press M; play again otherwise.
  useEffect(() => {
    const stop = armed || ytPaused || !walking || !ytOn || !musicStarted;
    if (ownTrack) {
      const a = ownAudio.current;
      if (a) {
        if (stop) a.pause();
        else a.play().catch(() => {});
      }
      return;
    }
    ytSend({ event: 'command', func: stop ? 'pauseVideo' : 'playVideo', args: [] });
  }, [armed, ytPaused, walking, ytOn, ownTrack, musicStarted]);
  // Shotgun mode's YouTube track: M pauses / plays it.
  useEffect(() => {
    doomFrame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: muted ? 'pauseVideo' : 'playVideo', args: [] }), YT_ORIGIN);
  }, [muted]);
  useEffect(() => {
    if (armed) setMuted(false);
  }, [armed]);
  useEffect(() => {
    if (!walking) setWallFace(null);
  }, [walking]);
  useEffect(() => {
    if (walking) {
      setYtPaused(false);
      setYtStatus('loading');
      setMusicStarted(false);
    }
  }, [walking]);
  // Listen to the YouTube player so we know whether it actually started. If it hasn't after a few seconds
  // (usually YouTube asking you to sign in, or the browser blocking autoplay), say so and enlarge the player.
  useEffect(() => {
    if (!walking || !ytOn || ownTrack || !musicStarted) return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== YT_ORIGIN || typeof e.data !== 'string') return;
      try {
        const m = JSON.parse(e.data);
        const state = m.event === 'onStateChange' ? m.info : m.event === 'infoDelivery' ? m.info?.playerState : undefined;
        if (state === 1) setYtStatus('playing');
        else if (state === 2) setYtStatus((st) => (st === 'loading' ? st : 'paused'));
      } catch {
        // not a player message
      }
    };
    window.addEventListener('message', onMsg);
    const timer = window.setTimeout(() => setYtStatus((st) => (st === 'playing' ? st : 'stuck')), 7000);
    return () => {
      window.removeEventListener('message', onMsg);
      clearTimeout(timer);
    };
  }, [walking, ytOn, ownTrack, musicStarted]);
  const pickOwnTrack = (f: File) => {
    ownAudio.current?.pause();
    if (ownTrack) URL.revokeObjectURL(ownTrack.url);
    const url = URL.createObjectURL(f);
    const a = new Audio(url);
    a.loop = true;
    a.volume = 0.7;
    ownAudio.current = a;
    setOwnTrack({ url, name: f.name.replace(/\.[^.]+$/, '') });
    setYtOn(true);
    setYtPaused(false);
    setMusicStarted(true); // choosing a file means you want to hear it
  };
  useEffect(() => () => ownAudio.current?.pause(), []);
  // The play button in the music popup. Its click also counts as the gesture browsers want before playing sound.
  const musicPlaying = musicStarted && ytOn && (ownTrack ? !ytPaused : ytStatus === 'playing' && !ytPaused);
  function toggleMusic() {
    if (!musicStarted || !ytOn) {
      setMusicStarted(true);
      return setWalkMusic(true);
    }
    if (musicPlaying) return setYtPaused(true);
    setYtPaused(false);
    if (ownTrack) ownAudio.current?.play().catch(() => {});
    else ytSend({ event: 'command', func: 'playVideo', args: [] });
  }

  useEffect(() => {
    const el = ref.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.localClippingEnabled = true; // walk-through: hide roof structure below the ceiling
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dfe7ee');

    const camera = new THREE.PerspectiveCamera(45, 1, 50, 400000);
    camera.position.set(6000, 14000, 20000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 500;
    controls.maxDistance = 150000;
    controls.screenSpacePanning = true;
    // Gentler orbiting, zooming in on whatever is under the pointer, and a short glide when you let go.
    controls.rotateSpeed = 0.45;
    controls.panSpeed = 0.9;
    controls.zoomSpeed = 1.2;
    controls.zoomToCursor = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.2;

    const hemi = new THREE.HemisphereLight('#ffffff', '#9c8f7c', 1.6);
    scene.add(hemi);
    // Extra soft fill while walking around inside (rooms are otherwise lit only by sky bounce).
    const fill = new THREE.AmbientLight('#ffffff', 0);
    scene.add(fill);
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 30;
    scene.add(sun, sun.target);
    // Light spread demo: night time, so the house's own lights show.
    let night = false;
    let envOn = false;
    const applyDay = () => {
      night = !!store.state.lightDemo;
      scene.background = new THREE.Color(night ? '#0b1020' : '#dfe7ee');
      hemi.intensity = night ? 0.06 : envOn ? 1.0 : 1.6;
      sun.intensity = night ? 0.03 : 2.2;
      scene.environmentIntensity = night ? 0.02 : 0.25;
      if (store.state.walking) fill.intensity = night ? 0.03 : 0.9;
    };

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400000, 400000), new THREE.MeshStandardMaterial({ color: '#cfd6c9', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    ground.receiveShadow = true;
    scene.add(ground);
    const gridHelper = new THREE.GridHelper(100000, 100, '#b7beb2', '#c4cabf');
    gridHelper.position.y = -1;
    scene.add(gridHelper);

    let house = new THREE.Group();
    let roofClip: THREE.Plane[] = []; // walk-through: roof clipped below the ceiling while indoors
    let walkReady = false; // set once the walk-through state below has been created
    const walkActive = () => walkReady;
    scene.add(house);
    // Walk-through easter egg ("idkfa"): the shotgun is drawn in its own pass so it never pokes into walls.
    let gun: Shotgun | null = null;
    const mess = new Mess();
    scene.add(mess.group);
    const pickles = new Pickles();
    scene.add(pickles.group);
    const music = new Music();
    musicRef.current = music;
    let shownScore = '';
    const showScore = () => {
      const sc = { kills: pickles.kills, left: pickles.left, wave: pickles.wave };
      const key = JSON.stringify(sc);
      if (key !== shownScore) {
        shownScore = key;
        setScore(sc);
      }
    };
    const muzzle = new THREE.PointLight('#ffb35c', 0, 7000, 0); // always present, so firing doesn't recompile shaders
    scene.add(muzzle);

    // ---------- Render quality ----------
    let composer: EffectComposer | null = null; // Ultra: ambient occlusion
    let envTex: THREE.Texture | null = null; // Ultra: soft reflections / image-based light
    let aniso = 8;
    let appliedQuality: RenderQuality | null = null;
    const applyAniso = (root: THREE.Object3D) => {
      root.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        const map = mat && !Array.isArray(mat) ? mat.map : null;
        if (map && map.anisotropy !== aniso) {
          map.anisotropy = aniso;
          map.needsUpdate = true;
        }
      });
    };
    const applyQuality = () => {
      const q = store.state.quality;
      if (q === appliedQuality) return;
      appliedQuality = q;
      const dpr = window.devicePixelRatio || 1;
      renderer.setPixelRatio(q === 'low' ? Math.min(dpr, 1) * 0.75 : q === 'medium' ? Math.min(dpr, 1.25) : Math.min(dpr, 2));
      // Shadows: none / sharper, cheaper / soft.
      const shadows = q !== 'low';
      const type = q === 'medium' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
      const size = q === 'medium' ? 2048 : 4096;
      if (renderer.shadowMap.enabled !== shadows || renderer.shadowMap.type !== type) {
        renderer.shadowMap.enabled = shadows;
        renderer.shadowMap.type = type;
        scene.traverse((o) => {
          const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((m) => (m.needsUpdate = true));
          else if (mat) mat.needsUpdate = true;
        });
      }
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.mapSize.set(size, size);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
      // Ultra: light from an environment map, so surfaces pick up soft reflections and bounce.
      const env = q === 'ultra';
      if (env && !envTex) {
        const pm = new THREE.PMREMGenerator(renderer);
        envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
        pm.dispose();
      }
      scene.environment = env ? envTex : null;
      envOn = !!env;
      applyDay();
      // Ultra: ambient occlusion (soft shading where surfaces meet).
      if (q === 'ultra' && !composer) {
        const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
        composer = new EffectComposer(renderer, rt);
        composer.addPass(new RenderPass(scene, camera));
        const ao = new GTAOPass(scene, camera, 1, 1);
        ao.updateGtaoMaterial({ radius: 900, distanceExponent: 2, thickness: 1000, scale: 1.8, samples: 16, distanceFallOff: 1 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
        ao.blendIntensity = 0.9;
        composer.addPass(ao);
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__gtao = ao;
        composer.addPass(new OutputPass());
      } else if (q !== 'ultra' && composer) {
        composer.dispose();
        composer = null;
      }
      aniso = q === 'low' ? 1 : q === 'medium' ? 4 : Math.min(16, renderer.capabilities.getMaxAnisotropy());
      applyAniso(scene);
      resize();
    };

    const render = () => {
      // Keep the up/down handle a similar size on screen at any zoom.
      const handle = house.children.find((c) => c.userData.liftHandle);
      if (handle) handle.scale.setScalar(Math.max(1, camera.position.distanceTo(handle.position) / 7000));
      // Door/window measurements are drawn on the wall face facing the camera.
      if (measures && !editingLabel && store.state.selection?.kind === 'opening') {
        const next = buildMeasures(store.state.design, store.state.selection, camera.position);
        if (next && next.side !== measures.side) setMeasures(next);
        else if (next) disposeTree(next.group);
      }
      if (composer) composer.render();
      else renderer.render(scene, camera);
      if (gun) {
        gun.setAspect(camera.aspect, camera.fov);
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(gun.scene, gun.cam);
        renderer.autoClear = true;
      }
      positionLabels();
    };

    // ---------- Measurements for the selected object ----------
    const labelsEl = labelsRef.current!;
    let measures: Measures | null = null;
    let labelEls: HTMLElement[] = [];
    let editingLabel = false;
    const setMeasures = (m: Measures | null) => {
      if (measures) {
        scene.remove(measures.group);
        disposeTree(measures.group);
      }
      measures = m;
      labelsEl.replaceChildren();
      labelEls = [];
      if (!m) return;
      scene.add(m.group);
      m.labels.forEach((l, i) => {
        const b = document.createElement('button');
        b.className = 'm3-label';
        b.textContent = String(Math.round(l.value));
        b.title = l.readonly ? l.title : `${l.title} — click to set it exactly`;
        if (l.readonly) b.classList.add('readonly');
        else b.onclick = () => editLabel(i, l);
        labelsEl.appendChild(b);
        labelEls.push(b);
      });
    };
    const refreshMeasures = () =>
      // While walking, only furniture gets measurements (doors and windows aren't selectable there).
      setMeasures(
        !store.state.design.settings.showClearances || (store.state.walking && store.state.selection?.kind !== 'item')
          ? null
          : buildMeasures(store.state.design, store.state.selection, camera.position),
      );
    const editLabel = (i: number, l: MeasureLabel) => {
      const input = document.createElement('input');
      input.className = 'm3-label m3-input';
      input.value = String(Math.round(l.value));
      labelEls[i].replaceWith(input);
      labelEls[i] = input;
      editingLabel = true;
      positionLabels();
      input.focus();
      input.select();
      let done = false;
      const finish = (commit: boolean) => {
        if (done) return;
        done = true;
        editingLabel = false;
        const n = evalExpr(input.value);
        if (commit && isFinite(n) && n >= 0 && Math.abs(n - l.value) >= 0.5) l.commit(Math.round(n));
        else refreshMeasures();
        render();
      };
      input.onkeydown = (e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      };
      input.onblur = () => finish(true);
    };
    const positionLabels = () => {
      if (!measures) return;
      const r = renderer.domElement.getBoundingClientRect();
      measures.labels.forEach((l, i) => {
        const el = labelEls[i];
        if (!el) return;
        const v = l.pos.clone().project(camera);
        el.style.display = v.z > 1 ? 'none' : '';
        el.style.transform = `translate(${((v.x + 1) / 2) * r.width}px, ${((1 - v.y) / 2) * r.height}px) translate(-50%, -50%)`;
      });
    };
    controls.addEventListener('change', render);
    // Damping needs update() every frame until the camera settles (it only gets called on input otherwise).
    let settleFrame = 0;
    let interacting = false;
    const settle = () => {
      // Stop when something else takes over the camera (walk-through, dragging furniture).
      if (!controls.enabled) {
        settleFrame = 0;
        return;
      }
      const moved = controls.update();
      settleFrame = moved || interacting ? requestAnimationFrame(settle) : 0;
    };
    const kick = (on: boolean) => () => {
      interacting = on;
      if (!settleFrame) settleFrame = requestAnimationFrame(settle);
    };
    controls.addEventListener('start', kick(true));
    controls.addEventListener('end', kick(false));

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      if (composer) {
        composer.setPixelRatio(renderer.getPixelRatio());
        composer.setSize(w, h);
      }
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const fitCamera = () => {
      const box = new THREE.Box3().setFromObject(house);
      // Kitchen designer: frame the kitchen.
      const kitchen = store.state.kitchen ? store.state.design.rooms.find((r) => r.id === store.state.kitchen) : undefined;
      if (kitchen?.points.length) box.setFromPoints(kitchen.points.flatMap((p) => [new THREE.Vector3(p.x, 0, p.y), new THREE.Vector3(p.x, 2400, p.y)]));
      if (box.isEmpty()) box.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10000, 2700, 8000));
      const c = box.getCenter(new THREE.Vector3());
      const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 3000);
      const vfov = THREE.MathUtils.degToRad(camera.fov);
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const distance = (r / Math.sin(Math.min(vfov, hfov) / 2)) * 0.85;
      const dir = new THREE.Vector3(0.3, 0.85, 0.75).normalize();
      controls.target.set(c.x, 0, c.z);
      camera.position.set(c.x + dir.x * distance, dir.y * distance, c.z + dir.z * distance);
      controls.update();
      render();
    };

    const updateShadowCamera = () => {
      const box = new THREE.Box3().setFromObject(house);
      if (box.isEmpty()) return;
      const c = box.getCenter(new THREE.Vector3());
      const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 3000) + 1000;
      sun.position.set(c.x + r * 0.6, r * 1.6, c.z + r * 0.9);
      sun.target.position.copy(c);
      const cam = sun.shadow.camera;
      cam.left = -r;
      cam.right = r;
      cam.top = r;
      cam.bottom = -r;
      cam.near = 100;
      cam.far = r * 5;
      cam.updateProjectionMatrix();
    };

    const itemCache: ItemCache = new Map();
    let last: { design: Design; selection: Selection | null; cutaway: boolean; roof: boolean; walking: boolean; electric: boolean; demo: string[] | null; garden: boolean } | null = null;
    // The garden only changes when the garden (or what's selected in it) does, so keep it between rebuilds.
    let gardenCache: { garden: Design['garden']; sel: string; editing: boolean; level: number; obj: THREE.Object3D } | null = null;
    const gardenGroup = (design: Design, selection: Selection | null, editing: boolean) => {
      const sel = selection && (selection.kind === 'block' || selection.kind.startsWith('garden-')) ? `${selection.kind}:${selection.id}` : '';
      const level = floorLevelOf(design);
      const c = gardenCache;
      if (c && c.garden === design.garden && c.sel === sel && c.editing === editing && c.level === level) return c.obj;
      const obj = buildGarden(design, selection, editing, makeMat(false), makeMat(true));
      gardenCache = { garden: design.garden, sel, editing, level, obj };
      return obj;
    };
    const rebuild = () => {
      const { design, selection, cutaway: cut, showRoof: roofOn, walking: walkOn, electric, lightDemo: demo, garden: gardenOn } = store.state;
      if (last && last.design === design && last.selection === selection && last.cutaway === cut && last.roof === roofOn && last.walking === walkOn && last.electric === electric && last.demo === demo && last.garden === gardenOn)
        return;
      const first = !last;
      const prevGarden = gardenCache?.obj;
      last = { design, selection, cutaway: cut, roof: roofOn, walking: walkOn, electric, demo, garden: gardenOn };
      const old = house;
      house = buildHouse(design, selection, cut, roofOn, itemCache, walkOn, electric, demo ? litLights(design, new Set(demo)) : null);
      const garden = gardenGroup(design, selection, gardenOn);
      // A garden built afresh replaces the old one, which isn't in the old house any more: dispose of it here.
      if (prevGarden && prevGarden !== garden) {
        prevGarden.removeFromParent();
        disposeTree(prevGarden);
      }
      house.add(garden); // moves a kept garden out of the old house, so it survives the disposal below
      if (night !== !!demo) applyDay();
      // Raised house: the ground is below the house floor; sloping land can go lower still.
      const groundY = Math.min(-floorLevelOf(design) - 2, garden.userData.groundY ?? Infinity);
      ground.position.y = groundY;
      gridHelper.position.y = groundY + 1;
      scene.remove(old);
      disposeTree(old); // reused furniture has already been moved into the new group
      scene.add(house);
      applyAniso(house);
      if (roofClip.length) applyRoofClip();
      if (store.state.walking && walkActive()) applyDoors();
      if (!editingLabel) refreshMeasures();
      updateShadowCamera();
      if (first) fitCamera();
      render();
    };
    rebuild();
    applyQuality();
    const unsub = store.subscribe(rebuild);
    const unsubQuality = store.subscribe(applyQuality);
    const unfit = store.on('fit3d', fitCamera);

    // ---------- Selecting and dragging in 3D ----------
    const raycaster = new THREE.Raycaster();
    const setRay = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    };
    const selOf = (o: THREE.Object3D | null, kind?: string): Selection | null => {
      while (o && !(o.userData.sel && (!kind || o.userData.sel.kind === kind))) o = o.parent;
      return o ? (o.userData.sel as Selection) : null;
    };
    const isLiftHandle = (o: THREE.Object3D | null) => {
      for (; o; o = o.parent) if (o.userData.liftHandle) return true;
      return false;
    };
    /** Whether the pointer is over the selected item's up/down handle (drawn on top of everything). */
    const pickLift = (e: PointerEvent) => {
      setRay(e);
      const handle = house.children.find((c) => c.userData.liftHandle);
      return !!handle && raycaster.intersectObject(handle, true).length > 0 && isLiftHandle(handle);
    };
    const pick = (e: PointerEvent): Selection | null => {
      setRay(e);
      const hits = raycaster
        .intersectObject(house, true)
        .filter((h) => !isLiftHandle(h.object))
        .map((h) => selOf(h.object));
      const first = hits.find((h) => h) ?? null;
      // The roof is click-through for doors, windows and furniture underneath it (e.g. a window under the
      // eaves); clicking the roof where there's nothing like that behind it still selects the roof.
      if (first?.kind === 'roof') return hits.find((h) => h && (h.kind === 'opening' || h.kind === 'item')) ?? first;
      return first;
    };
    const planeHit = (e: PointerEvent, plane: THREE.Plane) => {
      setRay(e);
      return raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    };
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    /** Wall under the pointer and how far along it (for sliding doors/windows between walls). */
    const wallUnder = (e: PointerEvent) => {
      setRay(e);
      const walls = house.children.filter((c) => c.userData.sel?.kind === 'wall');
      const hit = raycaster.intersectObjects(walls, true)[0];
      const sel = hit && selOf(hit.object, 'wall');
      const w = sel && store.state.design.walls.find((x) => x.id === sel.id);
      if (!w) return null;
      const f = wallFrame(w);
      return { wall: w, along: (hit.point.x - w.start.x) * f.u.x + (hit.point.z - w.start.y) * f.u.y, y: hit.point.y };
    };
    const alongWall = (e: PointerEvent, wallId: string) => {
      const w = store.state.design.walls.find((x) => x.id === wallId);
      if (!w) return null;
      const f = wallFrame(w);
      const plane = new THREE.Plane(new THREE.Vector3(f.n.x, 0, f.n.y), -(f.n.x * w.start.x + f.n.y * w.start.y));
      const p = planeHit(e, plane);
      return p ? { wall: w, along: (p.x - w.start.x) * f.u.x + (p.z - w.start.y) * f.u.y, y: p.y } : null;
    };

    type Drag3 = {
      sel: Selection;
      downX: number;
      downY: number;
      active: boolean;
      recorded: boolean;
      orig: Design;
      start: THREE.Vector3 | null;
      off: { x: number; y: number };
      alongOff: number;
      wallId: string;
      lift: { plane: THREE.Plane; startY: number; elevation: number } | null;
      sill: { startY: number; sill: number } | null; // windows: dragging up/down changes the sill height
    };
    let drag: Drag3 | null = null;
    let lastEvent: PointerEvent | null = null;
    let frame = 0;

    const apply = (fn: (d: Design) => Design) => {
      if (!drag) return;
      if (!drag.recorded) {
        store.checkpoint();
        drag.recorded = true;
      }
      store.update(fn, false);
    };

    // ---------- Placing new furniture / doors / windows from the catalog ----------
    let ghost: THREE.Object3D | null = null;
    let ghostData: { kind: 'item'; item: Item } | { kind: 'opening'; o: Opening; wall: Wall } | null = null;
    let placeDown: { x: number; y: number } | null = null;
    const ghostMat: MatFn = (color) => {
      const m = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, roughness: 0.8 });
      m.emissive = new THREE.Color('#2f6fde');
      m.emissiveIntensity = 0.25;
      return m;
    };
    // Alignment lines while placing / dragging furniture: the edges it lined up with, drawn at its top.
    const guideMat = new THREE.LineDashedMaterial({ color: '#e0662b', dashSize: 60, gapSize: 40, depthTest: false, transparent: true });
    let guideLines: THREE.LineSegments | null = null;
    const showGuides = (guides: [{ x: number; y: number }, { x: number; y: number }][], y = 0) => {
      if (guideLines) {
        scene.remove(guideLines);
        guideLines.geometry.dispose();
        guideLines = null;
      }
      if (!guides.length) return;
      const geo = new THREE.BufferGeometry().setFromPoints(guides.flatMap(([a, b]) => [new THREE.Vector3(a.x, y, a.y), new THREE.Vector3(b.x, y, b.y)]));
      guideLines = new THREE.LineSegments(geo, guideMat);
      guideLines.computeLineDistances();
      guideLines.renderOrder = 1001;
      scene.add(guideLines);
    };
    const clearGhost = () => {
      showGuides([]);
      if (ghost) {
        scene.remove(ghost);
        disposeTree(ghost);
      }
      ghost = null;
      ghostData = null;
    };
    const isPlacing = () => store.state.tool.kind === 'place' || store.state.tool.kind === 'opening';
    /** Work out where the new object would go for this pointer position and show a preview there. */
    const updateGhost = (e: PointerEvent) => {
      const tool = store.state.tool;
      const d = store.state.design;
      clearGhost();
      if (tool.kind === 'place') {
        const p = planeHit(e, floorPlane);
        if (p) {
          const base = placementItem(tool, p.x, p.z);
          const sn = snapItem(d, base, { x: p.x, y: p.z }, { tol: 120, grid: Math.min(d.settings.snap, 50), free: e.shiftKey });
          const item = { ...base, x: sn.x, y: sn.y, rotation: sn.rotation };
          showGuides(sn.guides, item.elevation + item.height + 5);
          ghost = buildItem(item, ghostMat);
          ghost.position.set(item.x, item.elevation, item.y);
          ghost.rotation.y = -THREE.MathUtils.degToRad(item.rotation);
          ghostData = { kind: 'item', item };
          // Clearances to walls and other items while placing.
          setMeasures(d.settings.showClearances ? measuresForItem(d, { ...item, id: '__ghost' }, false) : null);
        }
      } else if (tool.kind === 'opening') {
        const hit = wallUnder(e);
        if (hit) {
          const w = hit.wall;
          const f = wallFrame(w);
          const o = newOpening(tool.catalogId, w, e.shiftKey ? hit.along : roundTo(hit.along, 10));
          // Doors keep clear of nearby walls / furniture so they can open fully (Shift places it exactly).
          const clear = e.shiftKey ? null : clearOffset(store.state.design, o, w, 400);
          if (clear !== null) o.offset = clear;
          const g = new THREE.Group();
          g.position.set(w.start.x, 0, w.start.y);
          g.rotation.y = -f.angle;
          const og = buildOpening(o, w.thickness, w.height, ghostMat, Infinity);
          og.position.x = clampOpeningOffset(o, f.length);
          // Show the hole it will cut, as a see-through block.
          const hole = new THREE.Mesh(
            new THREE.BoxGeometry(o.width, Math.min(o.height, w.height - o.sill), w.thickness + 60),
            ghostMat('#2f6fde'),
          );
          hole.position.set(0, o.sill + Math.min(o.height, w.height - o.sill) / 2, 0);
          (hole.material as THREE.MeshStandardMaterial).opacity = 0.25;
          og.add(hole);
          g.add(og);
          ghost = g;
          ghostData = { kind: 'opening', o, wall: w };
        }
      }
      if (ghost) {
        ghost.traverse((c) => (c.renderOrder = 900));
        scene.add(ghost);
      }
      renderer.domElement.style.cursor = ghost ? 'copy' : tool.kind === 'opening' ? 'not-allowed' : '';
      render();
    };
    const commitPlacement = (e: PointerEvent) => {
      updateGhost(e);
      const data = ghostData;
      if (!data) return;
      const keepPlacing = e.ctrlKey || e.metaKey;
      if (data.kind === 'item') {
        const it = { ...data.item, id: newItem(data.item.type, 0, 0, 0).id };
        store.update((d) => ({ ...d, items: [...d.items, it] }));
        if (!keepPlacing) store.setTool({ kind: 'select' });
        store.select({ kind: 'item', id: it.id });
      } else {
        const o = { ...data.o, id: newOpening(store.state.tool.kind === 'opening' ? store.state.tool.catalogId : 'door', data.wall, 0).id };
        store.update((d) => ({ ...d, openings: [...d.openings, o] }));
        if (!keepPlacing) store.setTool({ kind: 'select' });
        store.select({ kind: 'opening', id: o.id });
      }
      if (!keepPlacing) clearGhost();
      render();
    };
    // Leaving placement mode (Esc, picking another tool) removes the preview.
    const unsubTool = store.subscribe(() => {
      if (ghost && !isPlacing()) {
        clearGhost();
        refreshMeasures();
        renderer.domElement.style.cursor = '';
        render();
      }
    });
    const onLeave = (e: PointerEvent) => {
      // Moving onto a measurement label isn't leaving the view.
      if (e.relatedTarget instanceof Node && labelsEl.contains(e.relatedTarget)) return;
      if (ghost) {
        clearGhost();
        refreshMeasures();
        render();
      }
    };
    renderer.domElement.addEventListener('pointerleave', onLeave);

    // ---------- First-person walk-through ----------

    const keys = new Set<string>();
    // Doors in walk-through: 0 = closed … 1 = open (as drawn when editing). Doors start open.
    const doorState = new Map<string, { p: number; target: number }>();
    const applyDoors = () => {
      house.traverse((obj) => {
        // Stacker panels slide; editing shows them closed.
        const slide = obj.userData.doorSlide as { id: string; base: number; dx: number } | undefined;
        if (slide) {
          obj.position.x = slide.base + slide.dx * (walk ? (doorState.get(slide.id)?.p ?? 1) : 0);
          return;
        }
        const leaf = obj.userData.doorLeaf as { id: string; open: number } | undefined;
        if (!leaf) return;
        const st = doorState.get(leaf.id);
        const p = walk ? (st?.p ?? 1) : 1;
        obj.rotation.y = leaf.open * p;
      });
    };
    const closedDoorBoxes = (): Box[] => {
      const d = store.state.design;
      const out: Box[] = [];
      for (const o of d.openings) {
        if (o.kind !== 'door' && o.kind !== 'double_door' && o.kind !== 'stacker_door') continue;
        if ((doorState.get(o.id)?.p ?? 1) > 0.85) continue; // open enough to walk through
        const b = doorwayBox(d, o.id);
        if (b) out.push(b);
      }
      return out;
    };
    /** Open or close the door straight ahead (within reach). */
    walkActions.door = () => toggleDoorAhead();
    const toggleDoorAhead = () => {
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hit = raycaster.intersectObject(house, true).find((h) => h.distance < 2600 && selOf(h.object, 'opening'));
      if (!hit || hit.distance > 2600) return;
      const sel = selOf(hit.object, 'opening');
      const o = sel && store.state.design.openings.find((x) => x.id === sel.id.split('#')[0]);
      if (!o || (o.kind !== 'door' && o.kind !== 'double_door' && o.kind !== 'stacker_door')) return;
      const st = doorState.get(o.id) ?? { p: 1, target: 1 };
      st.target = st.target > 0.5 ? 0 : 1;
      doorState.set(o.id, st);
    };
    // ---------- Editing furniture while walking ----------
    // Click an item to select it, click it again to pick it up (it follows your view, snapping to walls), click to
    // put it down.
    let carry: { id: string; off: { x: number; y: number }; recorded: boolean } | null = null;
    let carryWorld: { d: Design; id: string; world: WalkWorld } | null = null;
    /** Collisions without the item you're carrying (so it can't trap you). */
    const worldFor = (d: Design): WalkWorld => {
      if (!carry) return walkWorld(d);
      if (!carryWorld || carryWorld.d !== d || carryWorld.id !== carry.id)
        carryWorld = { d, id: carry.id, world: walkWorld({ ...d, items: d.items.filter((i) => i.id !== carry!.id) }) };
      return carryWorld.world;
    };
    /** Where you're looking on the floor (kept between arm's length and 4 m away). */
    const aimFloor = () => {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const o = camera.position;
      const horiz = Math.hypot(dir.x, dir.z) || 1;
      const floorY = walk?.feet ?? 0;
      const t = dir.y < -0.02 ? (floorY - o.y) / dir.y : Infinity;
      const dist = Math.max(700, Math.min(4000, Number.isFinite(t) ? t * horiz : 2000));
      return { x: o.x + (dir.x / horiz) * dist, y: o.z + (dir.z / horiz) * dist };
    };
    const startCarry = (id: string) => {
      const it = store.state.design.items.find((i) => i.id === id);
      if (!it) return;
      const aim = aimFloor();
      carry = { id, off: { x: it.x - aim.x, y: it.y - aim.y }, recorded: false };
      setCarrying(true);
    };
    const dropCarry = () => {
      if (!carry) return;
      carry = null;
      carryWorld = null;
      setCarrying(false);
    };
    const moveCarry = () => {
      if (!carry || !walk) return;
      const d = store.state.design;
      const it = d.items.find((i) => i.id === carry!.id);
      if (!it) return dropCarry();
      const aim = aimFloor();
      const sn = snapItem(d, it, { x: aim.x + carry.off.x, y: aim.y + carry.off.y }, { tol: 120, grid: Math.min(d.settings.snap, 50), free: false });
      if (sn.x === it.x && sn.y === it.y && sn.rotation === it.rotation) return;
      if (!carry.recorded) {
        store.checkpoint();
        carry.recorded = true;
      }
      store.update((dd) => ({ ...dd, items: dd.items.map((i) => (i.id === it.id ? { ...i, x: sn.x, y: sn.y, rotation: sn.rotation } : i)) }), false);
    };
    /** A click with the mouse captured: put down, pick up, select furniture, or open/close a door. */
    const clickAhead = () => {
      if (carry) return dropCarry();
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      // First thing hit that can be selected (linings, cornices and the ceiling aren't, so clicks go to the wall).
      const hit = raycaster.intersectObject(house, true).find((h) => {
        const mat = (h.object as THREE.Mesh).material as THREE.Material | undefined;
        return h.object.visible && !(mat && !Array.isArray(mat) && !mat.colorWrite && !selOf(h.object, 'opening')) && !!selOf(h.object);
      });
      const sel = hit && hit.distance < 6000 ? selOf(hit.object) : null;
      if (sel?.kind === 'item') {
        const cur = store.state.selection;
        if (cur?.kind === 'item' && cur.id === sel.id) startCarry(sel.id);
        else store.set({ selection: sel });
        return;
      }
      if (sel?.kind === 'opening' && hit!.distance < 2600) {
        toggleDoorAhead();
        return;
      }
      if (sel?.kind === 'wall') {
        // Edit the face you clicked: free the mouse so you can use the wall editor.
        const w = store.state.design.walls.find((x) => x.id === sel.id);
        if (w) {
          const f = wallFrame(w);
          const side = (hit!.point.x - w.start.x) * f.n.x + (hit!.point.z - w.start.y) * f.n.y >= 0 ? 1 : -1;
          store.set({ selection: sel });
          setWallFace({ id: w.id, side });
          if (document.pointerLockElement === canvas) document.exitPointerLock();
        }
        return;
      }
      if (store.state.selection) store.set({ selection: null });
    };
    let cheat = '';
    let toastTimer = 0;
    const say = (msg: string) => {
      setToast(msg);
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => setToast(null), 3000);
    };
    const setGun = (on: boolean) => {
      if (on && !gun) {
        gun = new Shotgun();
        if (music.hasFile) music.start(); // otherwise the Doom track plays on YouTube
        if (walk) pickles.spawn(store.state.design, walkWorld(store.state.design), walk.p, 10);
      } else if (!on && gun) {
        gun.dispose();
        gun = null;
        music.stop();
        pickles.clear();
      }
      showScore();
      setArmed(on);
    };
    const visibleChain = (o: THREE.Object3D | null) => {
      for (; o; o = o.parent) if (!o.visible) return false;
      return true;
    };
    const solidHit = (h: THREE.Intersection) => {
      const mat = (h.object as THREE.Mesh).material as THREE.Material | undefined;
      if (!mat || Array.isArray(mat) || !mat.colorWrite || (mat.transparent && mat.opacity < 0.02)) return false; // pick proxies
      return visibleChain(h.object);
    };
    const isGlass = (o: THREE.Object3D) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
      return !!mat && !Array.isArray(mat) && mat.transparent && mat.opacity < 0.9 && !!(o as THREE.Mesh).isMesh;
    };
    const fire = (both: boolean) => {
      if (!walk || !gun) return;
      const n = gun.fire(both);
      if (!n) return;
      camera.updateMatrixWorld();
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      muzzle.position.copy(camera.position).addScaledVector(fwd, 600);
      muzzle.intensity = n === 2 ? 4 : 3;
      walk.pitch = Math.min(1.45, walk.pitch + 0.02 * n); // recoil
      const targets = [pickles.group, house, ground];
      raycaster.far = 80000;
      const opened = new Set<string>();
      for (let i = 0; i < 9 * n; i++) {
        const spread = n === 2 ? 0.07 : 0.05;
        const dir = fwd.clone().addScaledVector(right, gauss() * spread).addScaledVector(up, gauss() * spread).normalize();
        raycaster.set(camera.position, dir);
        const hit = raycaster.intersectObjects(targets, true).find(solidHit);
        if (!hit) continue;
        const nrm = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : dir.clone().negate();
        if (nrm.dot(dir) > 0) nrm.negate();
        const pk = pickles.find(hit.object);
        if (pk) {
          pickles.explode(pk, mess, dir);
          continue;
        }
        if (isGlass(hit.object)) {
          mess.shatter(hit.object, hit.point, dir);
          continue;
        }
        // Blast closed doors open.
        let leafObj: THREE.Object3D | null = hit.object;
        while (leafObj && !leafObj.userData.doorLeaf) leafObj = leafObj.parent;
        if (leafObj) {
          const id = (leafObj.userData.doorLeaf as { id: string }).id;
          if (!opened.has(id)) {
            opened.add(id);
            const st = doorState.get(id) ?? { p: 1, target: 1 };
            if (st.target < 0.5) {
              st.target = 1;
              st.p = Math.min(1, st.p + 0.2);
              doorState.set(id, st);
            }
          }
        }
        mess.hole(hit.point, nrm, leafObj ?? undefined);
        const col = ((hit.object as THREE.Mesh).material as THREE.MeshStandardMaterial).color ?? null;
        mess.debris(hit.point, nrm, col, i % 2 ? 3 : 2);
        const item = selOf(hit.object, 'item');
        if (item) {
          let o: THREE.Object3D | null = hit.object;
          while (o && o.userData.sel?.kind !== 'item') o = o.parent;
          if (o) mess.shake(o, dir);
        }
      }
      raycaster.far = Infinity;
      showScore();
    };
    let walk: {
      p: { x: number; y: number };
      yaw: number;
      pitch: number;
      feet: number;
      vy: number;
      saved: { pos: THREE.Vector3; target: THREE.Vector3; fov: number; near: number };
    } | null = null;
    let walkFrame = 0;
    walkReady = true;
    let lastT = 0;
    let lastPost = 0;
    const canvas = renderer.domElement;
    const startWalk = () => {
      const d = store.state.design;
      const s = startPose(d);
      walk = {
        p: s.p,
        yaw: s.yaw,
        pitch: -0.05,
        feet: floorAt(walkWorld(d), s.p),
        vy: 0,
        saved: { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov, near: camera.near },
      };
      controls.enabled = false;
      fill.intensity = night ? 0.03 : 0.9;
      camera.fov = 70;
      camera.near = 20;
      camera.updateProjectionMatrix();
      camera.rotation.order = 'YXZ';
      clearGhost();
      setMeasures(null);
      doorState.clear();
      applyDoors();
      cheat = '';
      try {
        // Lock the mouse for looking around (needs the click that started walk mode).
        const req = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        req?.catch?.(() => {});
      } catch {
        // Drag-to-look still works without pointer lock.
      }
      lastT = performance.now();
      walkFrame = requestAnimationFrame(tick);
    };
    const stopWalk = () => {
      if (!walk) return;
      cancelAnimationFrame(walkFrame);
      camera.fov = walk.saved.fov;
      camera.near = walk.saved.near;
      camera.updateProjectionMatrix();
      camera.position.copy(walk.saved.pos);
      controls.target.copy(walk.saved.target);
      controls.enabled = true;
      controls.update();
      fill.intensity = 0;
      walk = null;
      roofClip = [];
      applyRoofClip();
      doorState.clear();
      applyDoors();
      mess.clear();
      dropCarry();
      setGun(false);
      muzzle.intensity = 0;
      setToast(null);
      keys.clear();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      store.set({ walker: null });
      render();
    };
    // When you're indoors, cut the roof off below the ceiling: where roof pieces overlap, their eave edges
    // would otherwise hang down inside the house like beams.
    const applyRoofClip = () => {
      house.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (mat?.userData?.roof && mat.clippingPlanes !== roofClip) {
          mat.clippingPlanes = roofClip;
          mat.needsUpdate = true;
        }
      });
    };
    const updateRoofClip = () => {
      const d = store.state.design;
      const c = walk ? ceilingOf(d) : null;
      const indoors = !!c && !!walk && c.rects.some((r) => walk!.p.x >= r.x0 && walk!.p.x <= r.x1 && walk!.p.y >= r.y0 && walk!.p.y <= r.y1);
      const want = indoors ? [new THREE.Plane(new THREE.Vector3(0, 1, 0), -(c!.height + 2))] : [];
      if (want.length !== roofClip.length || (want[0] && roofClip[0] && want[0].constant !== roofClip[0].constant)) {
        roofClip = want;
        applyRoofClip();
      }
    };
    const tick = (t: number) => {
      if (!walk) return;
      const dt = Math.min(0.1, (t - lastT) / 1000); // movement is sub-stepped, so slow frames don't tunnel
      lastT = t;
      const d = store.state.design;
      const world = worldFor(d);
      const kf = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const ks = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      // Keys, or the touch joystick (which moves slower the less it's pushed).
      const fwd = kf || walkStick.fwd;
      const strafe = ks || walkStick.strafe;
      if (Math.abs(fwd) > 0.05 || Math.abs(strafe) > 0.05) {
        const push = kf || ks ? 1 : Math.min(1, Math.hypot(walkStick.fwd, walkStick.strafe));
        const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3500 : 1400) * push; // mm/s
        const sy = Math.sin(walk.yaw);
        const cy = Math.cos(walk.yaw);
        let mx = -sy * fwd + cy * strafe;
        let my = -cy * fwd - sy * strafe;
        const l = Math.hypot(mx, my);
        mx = (mx / l) * speed * dt;
        my = (my / l) * speed * dt;
        walk.p = moveWithCollisions(world, walk.p, { x: mx, y: my }, walk.feet, closedDoorBoxes());
      }
      // Gravity, jumping and stepping up/down.
      const floor = floorAt(world, walk.p);
      const grounded = walk.feet <= floor + 1 && walk.vy <= 0;
      if (grounded && keys.has('Space')) walk.vy = 3000;
      if (walk.vy !== 0 || walk.feet > floor + 1) {
        walk.vy -= 9800 * dt;
        walk.feet += walk.vy * dt;
        if (walk.feet <= floor) {
          walk.feet = floor;
          walk.vy = 0;
        }
      } else if (walk.feet < floor) walk.feet = Math.min(floor, walk.feet + 2500 * dt);
      // Swing doors towards open / closed.
      let moving = false;
      for (const st of doorState.values())
        if (st.p !== st.target) {
          st.p = st.target > st.p ? Math.min(st.target, st.p + dt * 2.2) : Math.max(st.target, st.p - dt * 2.2);
          moving = true;
        }
      if (moving) applyDoors();
      if (gun) gun.update(dt, fwd || strafe ? (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1.6 : 1) : 0);
      mess.update(dt);
      if (gun) {
        const msg = pickles.update(dt, d, world, closedDoorBoxes(), walk.p);
        if (msg) say(msg);
        showScore();
      }
      muzzle.intensity = Math.max(0, muzzle.intensity - dt * 60);
      updateRoofClip();
      camera.position.set(walk.p.x, walk.feet + EYE_HEIGHT, walk.p.y);
      camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
      camera.updateMatrixWorld();
      moveCarry();
      if (t - lastPost > 100) {
        lastPost = t;
        store.set({ walker: { x: Math.round(walk.p.x), y: Math.round(walk.p.y), yaw: walk.yaw } });
      }
      render();
      walkFrame = requestAnimationFrame(tick);
    };
    const look = (dx: number, dy: number) => {
      if (!walk) return;
      walk.yaw -= dx * 0.0025;
      walk.pitch = Math.max(-1.45, Math.min(1.45, walk.pitch - dy * 0.0025));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!walk) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Escape') {
        // First Esc frees the mouse; Esc again (with the mouse free) leaves walk-through.
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        else store.set({ walking: false });
        return;
      }
      if (e.key.length === 1) {
        cheat = (cheat + e.key.toLowerCase()).slice(-5);
        if (cheat === 'idkfa') {
          cheat = '';
          setGun(!gun);
          say(gun ? 'VERY HAPPY AMMO ADDED' : 'Shotgun put away');
        }
      }
      if (e.code === 'KeyM' && gun) {
        if (music.hasFile) setMuted(music.toggleMute());
        else setMuted((m) => !m);
        return;
      }
      if (e.code === 'KeyM') {
        ytToggle.current();
        return;
      }
      if (e.code === 'KeyR' && gun) {
        gun.reload();
        e.preventDefault();
        return;
      }
      // Selected furniture: rotate, delete, raise / lower.
      if (!gun && store.state.selection?.kind === 'item') {
        if (e.code === 'KeyR') {
          rotateSelection(e.shiftKey ? -90 : 90);
          e.preventDefault();
          return;
        }
        if (e.code === 'Delete' || e.code === 'Backspace') {
          dropCarry();
          deleteSelection();
          store.set({ selection: null });
          e.preventDefault();
          return;
        }
        if (e.code === 'PageUp' || e.code === 'PageDown') {
          raiseSelection((e.code === 'PageUp' ? 1 : -1) * (e.shiftKey ? 100 : 10));
          e.preventDefault();
          return;
        }
      }
      if (e.code === 'KeyE') {
        toggleDoorAhead();
        e.preventDefault();
        return;
      }
      keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onBlur = () => keys.clear();
    const onLockChange = () => {
      const on = document.pointerLockElement === canvas;
      setLocked(on);
      if (!on) dropCarry(); // freeing the mouse puts down whatever you're carrying
    };
    const onMouseLook = (e: MouseEvent) => {
      if (walk && document.pointerLockElement === canvas) look(e.movementX, e.movementY);
    };
    const onContextMenu = (e: MouseEvent) => {
      if (walk) e.preventDefault();
    };
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mousemove', onMouseLook);
    // ---------- Moving the 3D view with the keyboard ----------
    // WASD / arrow keys glide the view over the plan (Q / E down / up, Shift faster) whenever the 3D view is in
    // use: 3D-only mode, or the mouse is over it in Split. With something selected, the arrows still nudge it.
    let over3d = false;
    const flyKeys = new Set<string>();
    let flyFast = false;
    let flyFrame = 0;
    let flyLast = 0;
    const FLY = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    const flyActive = () => !walk && (store.state.viewMode === '3d' || over3d);
    const flyStep = (t: number) => {
      const dt = Math.min(0.1, (t - flyLast) / 1000);
      flyLast = t;
      if (!flyKeys.size || walk) {
        flyFrame = 0;
        return;
      }
      const has = (...c: string[]) => c.some((k) => flyKeys.has(k));
      const fwd = (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0);
      const side = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0);
      const up = (has('KeyE') ? 1 : 0) - (has('KeyQ') ? 1 : 0);
      // Along the ground in the direction you're looking; faster when zoomed out.
      const dir = new THREE.Vector3().subVectors(controls.target, camera.position).setY(0);
      if (dir.lengthSq() < 1) dir.set(0, 0, -1);
      dir.normalize();
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const dist = camera.position.distanceTo(controls.target);
      const speed = Math.min(12000, Math.max(1000, dist * 0.25)) * (flyFast ? 2.5 : 1);
      const move = dir.multiplyScalar(fwd).add(right.multiplyScalar(side)).multiplyScalar(speed * dt);
      move.y = up * speed * 0.6 * dt;
      if (controls.target.y + move.y < 0) move.y = -controls.target.y; // don't sink the view below the floor
      camera.position.add(move);
      controls.target.add(move);
      controls.update();
      flyFrame = requestAnimationFrame(flyStep);
    };
    const onFlyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') flyFast = true;
      if (!FLY.has(e.code) || e.ctrlKey || e.metaKey || e.altKey || !flyActive() || isTyping(e.target)) return;
      if (e.code.startsWith('Arrow') && store.state.selection) return; // arrows nudge the selection
      e.preventDefault();
      e.stopImmediatePropagation(); // not tool shortcuts (W = wall etc.)
      flyFast = e.shiftKey;
      flyKeys.add(e.code);
      if (!flyFrame) {
        flyLast = performance.now();
        flyFrame = requestAnimationFrame(flyStep);
      }
    };
    const onFlyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') flyFast = false;
      flyKeys.delete(e.code);
    };
    const onFlyBlur = () => flyKeys.clear();
    const onEnter3d = () => (over3d = true);
    const onLeave3d = () => {
      over3d = false;
      flyKeys.clear();
    };
    window.addEventListener('keydown', onFlyDown, true);
    window.addEventListener('keyup', onFlyUp, true);
    window.addEventListener('blur', onFlyBlur);
    el.addEventListener('pointerenter', onEnter3d);
    el.addEventListener('pointerleave', onLeave3d);

    const unsubWalk = store.subscribe(() => {
      if (store.state.walking && !walk) startWalk();
      else if (!store.state.walking && walk) stopWalk();
    });

    let lastTouch: { id: number; x: number; y: number } | null = null;
    const onDownCapture = (e: PointerEvent) => {
      if (walk && e.pointerType === 'touch') {
        // Touch: drag to look around (no pointer lock on phones); the joystick and door button do the rest.
        lastTouch = { id: e.pointerId, x: e.clientX, y: e.clientY };
        e.stopPropagation();
        return;
      }
      if (walk) {
        // With the mouse captured, a click opens/closes the door you're looking at.
        // With the shotgun, left click fires a barrel and right click fires both.
        if (document.pointerLockElement === canvas && gun && (e.button === 0 || e.button === 2)) fire(e.button === 2);
        else if (document.pointerLockElement === canvas && e.button === 0) clickAhead();
        // Click to (re)capture the mouse; dragging also looks around if pointer lock isn't available.
        if (document.pointerLockElement !== canvas) {
          try {
            const req = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
            req?.catch?.(() => {});
          } catch {
            /* drag-to-look */
          }
        }
        e.stopPropagation();
        return;
      }
      if (e.button !== 0) return;
      // In placement mode a click places; a drag still orbits the camera.
      if (isPlacing()) {
        placeDown = { x: e.clientX, y: e.clientY };
        return;
      }
      const onHandle = store.state.selection?.kind === 'item' && pickLift(e);
      const sel = onHandle ? store.state.selection : pick(e);
      if (!sel || (sel.kind !== 'item' && sel.kind !== 'opening' && sel.kind !== 'wall')) return;
      const d = store.state.design;
      // Take over from the orbit controls for this gesture.
      controls.enabled = false;
      renderer.domElement.setPointerCapture(e.pointerId);
      store.select(sel);
      const start = planeHit(e, floorPlane);
      drag = { sel, downX: e.clientX, downY: e.clientY, active: false, recorded: false, orig: d, start, off: { x: 0, y: 0 }, alongOff: 0, wallId: '', lift: null, sill: null };
      if (sel.kind === 'item') {
        const it = d.items.find((i) => i.id === sel.id)!;
        if (start) drag.off = { x: it.x - start.x, y: it.y - start.z };
        if (onHandle || e.altKey || e.ctrlKey) {
          // Up/down handle (or Alt/Ctrl-drag): raise / lower on a vertical plane facing the camera.
          const n = new THREE.Vector3().subVectors(camera.position, new THREE.Vector3(it.x, it.elevation, it.y)).setY(0).normalize();
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(it.x, it.elevation, it.y));
          const p = planeHit(e, plane);
          if (p) drag.lift = { plane, startY: p.y, elevation: it.elevation };
        }
      } else if (sel.kind === 'opening') {
        const o = d.openings.find((x) => x.id === sel.id)!;
        drag.wallId = o.wallId;
        const a = alongWall(e, o.wallId);
        if (a) {
          drag.alongOff = o.offset - a.along;
          if (o.kind === 'window') drag.sill = { startY: a.y, sill: o.sill };
        }
      }
    };

    const applyMove = (e: PointerEvent) => {
      if (!drag) return;
      const d = store.state.design;
      const free = e.shiftKey;
      const { sel } = drag;
      if (sel.kind === 'item') {
        const it = d.items.find((i) => i.id === sel.id);
        if (!it) return;
        if (drag.lift) {
          const p = planeHit(e, drag.lift.plane);
          if (!p) return;
          let elevation = Math.max(0, roundTo(drag.lift.elevation + p.y - drag.lift.startY, free ? 1 : 10));
          // Line its top or bottom up with neighbours' (e.g. wall cabinets with the top of a pantry).
          if (!free) {
            const mine = itemCorners(it);
            const lo = (k: 'x' | 'y', c: { x: number; y: number }[]) => Math.min(...c.map((q) => q[k]));
            const hi = (k: 'x' | 'y', c: { x: number; y: number }[]) => Math.max(...c.map((q) => q[k]));
            const beside = d.items.filter((o) => {
              if (o.id === it.id) return false;
              const c = itemCorners(o);
              return lo('x', c) < hi('x', mine) + 150 && hi('x', c) > lo('x', mine) - 150 && lo('y', c) < hi('y', mine) + 150 && hi('y', c) > lo('y', mine) - 150;
            });
            let best = 40;
            let snapped = elevation;
            for (const o of beside)
              for (const level of [o.elevation, o.elevation + o.height])
                for (const [mineAt, at] of [
                  [elevation, level],
                  [elevation + it.height, level - it.height],
                ]) {
                  if (Math.abs(level - mineAt) < best && at >= 0) {
                    best = Math.abs(level - mineAt);
                    snapped = at;
                  }
                }
            elevation = snapped;
          }
          apply((dd) => ({ ...dd, items: dd.items.map((i) => (i.id === it.id ? { ...i, elevation } : i)) }));
          return;
        }
        const p = planeHit(e, floorPlane);
        if (!p) return;
        const sn = snapItem(d, it, { x: p.x + drag.off.x, y: p.z + drag.off.y }, { tol: 120, grid: Math.min(d.settings.snap, 50), free });
        showGuides(sn.guides, it.elevation + it.height + 5);
        apply((dd) => ({ ...dd, items: dd.items.map((i) => (i.id === it.id ? { ...i, x: sn.x, y: sn.y, rotation: sn.rotation } : i)) }));
      } else if (sel.kind === 'opening') {
        const o = d.openings.find((x) => x.id === sel.id);
        if (!o) return;
        const other = wallUnder(e);
        let target = other && other.wall.id !== drag.wallId ? other : alongWall(e, drag.wallId);
        if (!target) return;
        if (target.wall.id !== drag.wallId) {
          drag.wallId = target.wall.id;
          drag.alongOff = 0;
        }
        const w = target.wall;
        const len = wallFrame(w).length;
        const raw = target.along + drag.alongOff;
        const offset = clampOpeningOffset({ ...o, offset: free ? raw : roundTo(raw, 10) }, len);
        // Windows also move up and down (sill height), kept within the wall.
        let sill = o.sill;
        if (drag.sill) {
          const raised = drag.sill.sill + target.y - drag.sill.startY;
          sill = Math.min(Math.max(0, roundTo(raised, free ? 1 : 10)), Math.max(0, w.height - o.height));
        }
        apply((dd) => ({
          ...dd,
          openings: dd.openings.map((x) =>
            x.id === o.id ? { ...x, wallId: w.id, offset, sill, height: Math.min(x.height, w.height - sill) } : x,
          ),
        }));
        target = null;
      } else if (sel.kind === 'wall') {
        const p = planeHit(e, floorPlane);
        const w = drag.orig.walls.find((x) => x.id === sel.id);
        if (!p || !drag.start || !w) return;
        const g = drag.orig.settings.snap;
        let delta = { x: p.x - drag.start.x, y: p.z - drag.start.z };
        if (!free) delta = { x: roundTo(delta.x, g), y: roundTo(delta.y, g) };
        const orig = drag.orig;
        apply(() => moveWallPoints(orig, wallMovePoints(orig, w), delta));
      }
    };

    const onMove = (e: PointerEvent) => {
      if (walk) {
        if (e.pointerType === 'touch') {
          if (lastTouch && lastTouch.id === e.pointerId) {
            look((e.clientX - lastTouch.x) * 1.3, (e.clientY - lastTouch.y) * 1.3);
            lastTouch = { id: e.pointerId, x: e.clientX, y: e.clientY };
          }
          return;
        }
        if (document.pointerLockElement !== canvas && e.buttons & 1) look(e.movementX, e.movementY);
        return;
      }
      if (isPlacing() && !drag) {
        // Coalesce preview updates to one per frame.
        lastEvent = e;
        if (!frame)
          frame = requestAnimationFrame(() => {
            frame = 0;
            if (lastEvent && isPlacing()) updateGhost(lastEvent);
          });
        return;
      }
      if (!drag) {
        if (e.buttons === 0) {
          if (store.state.selection?.kind === 'item' && pickLift(e)) {
            renderer.domElement.style.cursor = 'ns-resize';
            return;
          }
          const sel = pick(e);
          renderer.domElement.style.cursor = sel && (sel.kind === 'item' || sel.kind === 'opening' || sel.kind === 'wall') ? 'grab' : '';
        }
        return;
      }
      if (!drag.active) {
        if (Math.hypot(e.clientX - drag.downX, e.clientY - drag.downY) < 4) return;
        drag.active = true;
        renderer.domElement.style.cursor = 'grabbing';
      }
      // Coalesce moves to one update per frame.
      lastEvent = e;
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (lastEvent) applyMove(lastEvent);
        });
    };

    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (walk) return;
      if (drag) {
        if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
          if (drag.active && lastEvent) applyMove(lastEvent);
        }
        drag = null;
        lastEvent = null;
        showGuides([]);
        controls.enabled = true;
        renderer.domElement.style.cursor = 'grab';
        if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
        return;
      }
      if (isPlacing()) {
        const pd = placeDown;
        placeDown = null;
        if (pd && e.button === 0 && Math.hypot(e.clientX - pd.x, e.clientY - pd.y) <= 4) commitPlacement(e);
        return;
      }
      // Plain click on something else (floor, roof, empty space): select it.
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || e.button !== 0) return;
      store.select(pick(e));
    };
    // Double-click: glide over to the spot you clicked and move in closer, so it's easy to look at something.
    let focusFrame = 0;
    const isShown = (o: THREE.Object3D | null) => {
      for (; o; o = o.parent) if (!o.visible) return false;
      return true;
    };
    const onDblClick = (e: MouseEvent) => {
      if (walk || store.state.walking || store.state.tool.kind !== 'select') return;
      setRay(e as PointerEvent);
      const hit = raycaster.intersectObject(house, true).find((h) => !h.object.userData.pickOnly && !isLiftHandle(h.object) && isShown(h.object));
      const point = hit?.point ?? raycaster.ray.intersectPlane(floorPlane, new THREE.Vector3());
      if (!point) return;
      const fromT = controls.target.clone();
      const fromP = camera.position.clone();
      const offset = fromP.clone().sub(fromT);
      const dist = offset.length();
      const toDist = THREE.MathUtils.clamp(dist * 0.5, Math.min(dist, 1800), dist);
      const toP = point.clone().add(offset.setLength(toDist));
      if (toP.y < 200) toP.y = 200; // stay above the floor
      const start = performance.now();
      cancelAnimationFrame(focusFrame);
      const step = (t: number) => {
        const k = Math.min(1, (t - start) / 450);
        const ease = 1 - (1 - k) ** 3;
        controls.target.lerpVectors(fromT, point, ease);
        camera.position.lerpVectors(fromP, toP, ease);
        controls.update();
        focusFrame = k < 1 ? requestAnimationFrame(step) : 0;
      };
      focusFrame = requestAnimationFrame(step);
    };
    renderer.domElement.addEventListener('dblclick', onDblClick);
    el.addEventListener('pointerdown', onDownCapture, true); // capture: runs before OrbitControls
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);

    sceneHandle = {
      screenshot: () => {
        render();
        return renderer.domElement.toDataURL('image/png');
      },
    };
    if (import.meta.env.DEV) {
      // Test hook: plan/3D point (mm) -> screen pixels.
      (window as unknown as Record<string, unknown>).__camera3d = (pos: [number, number, number], target: [number, number, number]) => {
        camera.position.set(...pos);
        controls.target.set(...target);
        controls.update();
        render();
      };
      (window as unknown as Record<string, unknown>).__project3d = (x: number, y: number, z: number) => {
        const v = new THREE.Vector3(x, y, z).project(camera);
        const r = renderer.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      };
      // Close every door leaf (tests / screenshots).
      (window as unknown as Record<string, unknown>).__closeDoors = () => {
        house.traverse((o) => {
          if (o.userData.doorLeaf) o.rotation.y = 0;
        });
        render();
      };
      // Move the walker (tests).
      (window as unknown as Record<string, unknown>).__walkTo = (x: number, y: number) => {
        if (walk) walk.p = { x, y };
      };
      // Point the walker at a world point (tests).
      (window as unknown as Record<string, unknown>).__lookAt = (x: number, y: number, z: number) => {
        if (!walk) return;
        const dx = x - camera.position.x;
        const dz = z - camera.position.z;
        walk.yaw = Math.atan2(-dx, -dz);
        walk.pitch = Math.atan2(y - camera.position.y, Math.hypot(dx, dz));
      };
      // Point the walker at the nearest visible pickle (tests).
      (window as unknown as Record<string, unknown>).__aimPickle = () => {
        if (!walk) return null;
        const w = walk;
        let best: THREE.Object3D | null = null;
        let bd = Infinity;
        for (const o of pickles.group.children) {
          const dd = Math.hypot(o.position.x - w.p.x, o.position.z - w.p.y);
          if (dd < bd) [best, bd] = [o, dd];
        }
        if (!best) return null;
        const dx = best.position.x - camera.position.x;
        const dz = best.position.z - camera.position.z;
        const dy = best.position.y + 400 - camera.position.y;
        w.yaw = Math.atan2(-dx, -dz);
        w.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        return Math.round(bd);
      };
    }

    return () => {
      sceneHandle = null;
      // Leaving the 3D view (e.g. switching to 2D) ends walk-through, so keyboard shortcuts come back.
      if (store.state.walking) store.set({ walking: false, walker: null });
      el.removeEventListener('pointerdown', onDownCapture, true);
      stopWalk();
      unsubWalk();
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onFlyDown, true);
      window.removeEventListener('keyup', onFlyUp, true);
      window.removeEventListener('blur', onFlyBlur);
      el.removeEventListener('pointerenter', onEnter3d);
      el.removeEventListener('pointerleave', onLeave3d);
      cancelAnimationFrame(flyFrame);
      clearTimeout(toastTimer);
      music.stop();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMouseLook);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      unsubTool();
      clearGhost();
      cancelAnimationFrame(frame);
      unsub();
      unsubQuality();
      composer?.dispose();
      envTex?.dispose();
      unfit();
      showGuides([]);
      guideMat.dispose();
      ro.disconnect();
      cancelAnimationFrame(settleFrame);
      cancelAnimationFrame(focusFrame);
      renderer.domElement.removeEventListener('dblclick', onDblClick);
      controls.dispose();
      disposeTree(house);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="scene-wrap">
      <div className="scene" ref={ref} />
      <div className="measure-labels" ref={labelsRef} />
      {walking && (
        <div className="walk-music-pop" style={armed ? { visibility: 'hidden' } : undefined} onMouseDown={(e) => e.stopPropagation()}>
          <div className="walk-music-bar">
            <button className="walk-music-play" onClick={toggleMusic} title={musicPlaying ? 'Pause the music (M)' : 'Play the music (M)'}>
              {musicPlaying ? '❚❚' : '▶'}
            </button>
            <span className="walk-music-name">♪ {ownTrack ? ownTrack.name : 'House Tour — Sabrina Carpenter'}</span>
          </div>
          {ytOn && musicStarted && !ownTrack && (
            <iframe
              ref={ytFrame}
              className={ytStatus === 'stuck' ? 'walk-music-player big' : 'walk-music-player'}
              title="House Tour — Sabrina Carpenter"
              src={`${YT_ORIGIN}/embed/${HOUSE_TOUR}?autoplay=1&start=${HOUSE_TOUR_START}&loop=1&playlist=${HOUSE_TOUR}&enablejsapi=1&modestbranding=1&playsinline=1&rel=0&origin=${encodeURIComponent(location.origin)}`}
              allow="autoplay; encrypted-media"
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => {
                // Ask the player to report its state.
                ytSend({ event: 'listening', id: 'house-tour', channel: 'widget' });
                ytSend({ event: 'command', func: 'addEventListener', args: ['onStateChange'] });
              }}
            />
          )}
        </div>
      )}
      {walking && armed && !track && (
        <iframe
          ref={doomFrame}
          className="walk-music"
          title="Doom E1M1 — At Doom's Gate"
          src={`${YT_ORIGIN}/embed/${DOOM_TRACK}?autoplay=1&loop=1&playlist=${DOOM_TRACK}&enablejsapi=1&modestbranding=1&playsinline=1&rel=0&origin=${encodeURIComponent(location.origin)}`}
          allow="autoplay; encrypted-media"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
      {walking && wallFace && (
        <WalkWallEditor
          wallId={wallFace.id}
          side={wallFace.side}
          onClose={() => {
            setWallFace(null);
            store.set({ selection: null });
            // Back to looking around (this click counts as the gesture pointer lock needs).
            const c = ref.current?.querySelector('canvas');
            try {
              const req = c?.requestPointerLock() as unknown as Promise<void> | undefined;
              req?.catch?.(() => {});
            } catch {
              /* drag-to-look */
            }
          }}
        />
      )}
      {walking && touchScreen && (
        <>
          <WalkStick />
          <button className="walk-door-btn" onClick={() => walkActions.door?.()}>
            Door
          </button>
        </>
      )}
      {walking && (
        <div className="walk-hud">
          <div className={armed ? 'crosshair armed' : 'crosshair'} />
          {toast && (
            <div className="walk-toast" key={toast}>
              {toast}
            </div>
          )}
          {!armed && walkSelName && (
            <div className="walk-sel">
              {carrying ? (
                <>
                  Carrying <b>{walkSelName}</b> — look where you want it and click to put it down
                </>
              ) : (
                <>
                  <b>{walkSelName}</b> selected — click it again to move it · Esc, then edit it in the panel
                </>
              )}
            </div>
          )}
          {armed && (
            <div className="walk-score">
              🥒 {score.kills} pickled · {score.left} left · wave {score.wave}
            </div>
          )}
          <div className="walk-panel">
            <strong>Walk-through</strong>
            <span>W A S D / arrows to move · mouse to look · Shift to run · Space to jump</span>
            {armed ? (
              <>
                <span>Click to fire a barrel · right-click for both · R to reload · E opens doors</span>
                <span>
                  M to {muted ? 'unmute' : 'mute'} music · {track ? `playing ${track}` : 'Doom E1M1 (YouTube)'} ·{' '}
                  <label className="music-pick" title="Play an audio file of your own (stays in your browser)">
                    load your own…
                    <input
                      type="file"
                      accept="audio/*"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f && musicRef.current) {
                          musicRef.current.useFile(f);
                          musicRef.current.start();
                          setTrack(f.name);
                          setMuted(false);
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                </span>
              </>
            ) : (
              <>
                <span>E or click to open / close the door you’re looking at</span>
                <span>Click furniture to select it, click again to pick it up · R rotate · Del delete · PgUp/PgDn raise</span>
                <span>Click a wall to change its paint colour, lining or facade</span>
              </>
            )}
            {!armed && (
              <span>
                {ytOn ? (
                  <>
                    ♪ {ownTrack ? ownTrack.name : 'House Tour — Sabrina Carpenter'} · M to {musicPlaying ? 'pause' : 'play'} ·{' '}
                    <a href="#" className="music-pick" onClick={(e) => (e.preventDefault(), setWalkMusic(false))}>
                      turn off
                    </a>
                    {' · '}
                    <label className="music-pick" title="Play an audio file of your own instead (it stays in your browser)">
                      {ownTrack ? 'other file…' : 'use a music file instead'}
                      <input
                        type="file"
                        accept="audio/*"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) pickOwnTrack(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {ownTrack && (
                      <>
                        {' · '}
                        <a
                          href="#"
                          className="music-pick"
                          onClick={(e) => {
                            e.preventDefault();
                            ownAudio.current?.pause();
                            URL.revokeObjectURL(ownTrack.url);
                            ownAudio.current = null;
                            setOwnTrack(null);
                            setYtStatus('loading');
                          }}
                        >
                          back to House Tour
                        </a>
                      </>
                    )}
                  </>
                ) : (
                  <a href="#" className="music-pick" onClick={(e) => (e.preventDefault(), toggleMusic())}>
                    ♪ Play House Tour — Sabrina Carpenter
                  </a>
                )}
              </span>
            )}
            {!armed && ytOn && musicStarted && !ownTrack && ytStatus === 'stuck' && (
              <span className="walk-warn">
                YouTube hasn’t started the song — it may want you to sign in or press play. Press Esc, then press ▶ (bottom right). Signing in to YouTube in this browser usually stops the check.
              </span>
            )}
            <span>{locked ? 'Esc to free the mouse' : 'Click the view to look around with the mouse (or drag) · Esc to exit'}</span>
            <button onClick={() => store.set({ walking: false })}>Exit walk-through</button>
          </div>
        </div>
      )}
      <div className="scene-tools" style={walking ? { display: 'none' } : undefined}>
        <button className="walk-btn" onClick={() => store.set({ walking: true, selection: null, cutaway: false, tool: { kind: 'select' } })} title="Walk through the house in first person (W A S D)">
          🚶 Walk
        </button>
        {hasRoof && (
          <button className={showRoof && !cutaway ? 'active' : ''} onClick={() => store.set({ showRoof: !(showRoof && !cutaway), cutaway: false })} title="Show or hide the roof">
            Roof
          </button>
        )}
        <button className={cutaway ? 'active' : ''} onClick={() => store.set({ cutaway: !cutaway })} title="Lower the walls to see inside">
          Cutaway walls
        </button>
        <button onClick={() => store.emit('fit3d')} title="Reset the 3D camera">
          Reset view
        </button>
        <select
          className="quality-pick"
          value={quality}
          onChange={(e) => {
            setQuality(e.target.value as RenderQuality);
            e.target.blur();
          }}
          title={`Render quality: ${QUALITIES.find((x) => x.id === quality)?.hint}`}
        >
          {QUALITIES.map((x) => (
            <option key={x.id} value={x.id}>
              Quality: {x.name}
            </option>
          ))}
        </select>
      </div>
      <div className="scene-hint" style={walking ? { display: 'none' } : undefined}>
        {placing
          ? 'Click to place · it snaps to walls and other items · drag to orbit · Ctrl+click to keep placing · Shift = no snapping · Esc to cancel'
          : 'Drag furniture, doors, windows & walls to move them (works through the roof) · drag a window up/down to change its sill · drag the blue arrows (or Alt/Ctrl-drag) to raise/lower furniture · PgUp/PgDn · R rotate · Del delete · drag empty space to orbit · scroll zooms towards the pointer · double-click to focus on a spot · WASD / arrows to move around, Q/E down/up'}
      </div>
    </div>
  );
}

/** A Kolton door stop (a short stainless cylinder): sticking out of the wall, or standing on the floor. */
function doorStopMesh(stop: DoorStopPlace, color: string, m: MatFn, openingId: string): THREE.Mesh {
  const { diameter, projection } = DOOR_STOP_SIZE;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(diameter / 2, diameter / 2, projection, 24), m(color, { metal: 0.7, rough: 0.35 }));
  if (stop.mount === 'floor') mesh.position.set(stop.at.x, projection / 2, stop.at.y);
  else {
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(stop.dir.x, 0, stop.dir.y));
    mesh.position.set(stop.at.x + (stop.dir.x * projection) / 2, stop.height, stop.at.y + (stop.dir.y * projection) / 2);
  }
  mesh.castShadow = true;
  mesh.userData.sel = { kind: 'opening', id: openingId };
  return mesh;
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    if (c.userData.fx) return; // bullet holes share their geometry and material
    const mesh = c as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

function makeMat(selected: boolean): MatFn {
  return (color: string, opts?: MatOpts) => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: opts?.rough ?? 0.75,
      metalness: opts?.metal ?? 0,
    });
    if (opts?.opacity !== undefined) {
      mat.transparent = true;
      mat.opacity = opts.opacity;
      mat.depthWrite = false;
    }
    if (opts?.emissive) {
      mat.emissive = new THREE.Color(opts.emissive);
      mat.emissiveIntensity = 0.8;
    }
    if (selected) {
      mat.emissive = new THREE.Color('#2f7bff');
      mat.emissiveIntensity = 0.35;
    }
    return mat;
  };
}

// ---------- floor textures (generated, greyscale so the floor colour tints them) ----------
const textureCache = new Map<string, THREE.Texture>();

/**
 * Floor texture for a finish at the room's sizes: boards of the given width (timber, hybrid), tiles of the given
 * size with grout joints, or carpet / concrete grain. Texture x runs along the boards / tile length.
 */
function floorTexture(kind: FloorFinish, size: Required<FloorSize>): THREE.Texture {
  const key = `${kind}|${size.board}|${size.tileW}|${size.tileL}|${size.grout}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const W = 1024;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  // Size of the repeat in mm (x along the boards / tile length, y across).
  let rx = 1200;
  let ry = 1200;
  if (kind === 'timber' || kind === 'hybrid') {
    const timber = kind === 'timber';
    const bw = Math.max(40, size.board);
    const n = Math.max(2, Math.min(16, Math.round((timber ? 1200 : 1400) / bw))); // boards in the repeat
    ry = bw * n;
    rx = timber ? 2400 : 1830; // a board length or two, so the joints stagger
    const bh = H / n;
    for (let i = 0; i < n; i++) {
      const g = (timber ? 225 : 228) + rnd() * (timber ? 30 : 24);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(0, i * bh, W, bh);
      for (let k = 0; k < (timber ? 14 : 10); k++) {
        ctx.strokeStyle = `rgba(0,0,0,${(timber ? 0.03 : 0.02) + rnd() * (timber ? 0.04 : 0.03)})`;
        ctx.beginPath();
        const y = i * bh + rnd() * bh;
        ctx.moveTo(0, y);
        if (timber) ctx.bezierCurveTo(W / 3, y + rnd() * 6 - 3, (2 * W) / 3, y + rnd() * 6 - 3, W, y);
        else ctx.lineTo(W, y + rnd() * 4 - 2);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(0,0,0,${timber ? 0.28 : 0.2})`;
      ctx.fillRect(0, i * bh, W, 2);
      ctx.fillRect(((i * (timber ? 0.37 : 0.53)) % 1) * W, i * bh, 3, bh);
    }
  } else if (kind === 'tile' || kind === 'large_tile') {
    // 2 × 2 tiles (plus their grout) in the repeat.
    const tl = Math.max(50, size.tileL);
    const tw = Math.max(50, size.tileW);
    const g = Math.max(0, size.grout);
    rx = 2 * (tl + g);
    ry = 2 * (tw + g);
    const px = W / rx;
    const py = H / ry;
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        const v = 236 + rnd() * 14;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(i * (tl + g) * px, j * (tw + g) * py, (tl + g) * px, (tw + g) * py);
      }
    // Grout joints (at least a hairline so the tiles still read).
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    const gx = Math.max(1, g * px);
    const gy = Math.max(1, g * py);
    for (let i = 0; i < 2; i++) ctx.fillRect(i * (tl + g) * px, 0, gx, H);
    for (let j = 0; j < 2; j++) ctx.fillRect(0, j * (tw + g) * py, W, gy);
  } else {
    rx = ry = kind === 'carpet' ? 600 : 2000;
    const img = ctx.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) {
      const g = kind === 'carpet' ? 215 + rnd() * 40 : 225 + rnd() * 30;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / rx, 1 / ry);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  textureCache.set(key, tex);
  return tex;
}

/** Floor texture turned so the boards run in `deg` (0 = along plan x). Shares the image with the base texture. */
const rotatedTextures = new Map<string, THREE.Texture>();
function floorTextureAt(kind: FloorFinish, deg: number, size: Required<FloorSize>): THREE.Texture {
  const base = floorTexture(kind, size);
  const a = ((Math.round(deg) % 180) + 180) % 180;
  if (!a) return base;
  const key = `${kind}|${size.board}|${size.tileW}|${size.tileL}|${size.grout}|${a}`;
  let t = rotatedTextures.get(key);
  if (!t) {
    t = base.clone();
    t.rotation = (a * Math.PI) / 180;
    t.needsUpdate = true;
    rotatedTextures.set(key, t);
  }
  return t;
}

type ItemCache = Map<string, { item: Item; selected: boolean; plate: number | undefined; sky: string; base: number; ground: number; bulk: string; obj: THREE.Object3D }>;

// ---------- Skylights ----------
type CRect = { x0: number; y0: number; x1: number; y1: number };
/** Plan bounding box of an item (rotated). */
function footprintBox(it: Item): CRect {
  const r = THREE.MathUtils.degToRad(it.rotation);
  const ex = (Math.abs(Math.cos(r)) * it.width + Math.abs(Math.sin(r)) * it.depth) / 2;
  const ey = (Math.abs(Math.sin(r)) * it.width + Math.abs(Math.cos(r)) * it.depth) / 2;
  return { x0: it.x - ex, y0: it.y - ey, x1: it.x + ex, y1: it.y + ey };
}
/** A rectangle minus a hole: up to four rectangles. */
function cutRect(r: CRect, h: CRect): CRect[] {
  if (h.x1 <= r.x0 || h.x0 >= r.x1 || h.y1 <= r.y0 || h.y0 >= r.y1) return [r];
  const out: CRect[] = [];
  if (h.y0 > r.y0) out.push({ ...r, y1: h.y0 });
  if (h.y1 < r.y1) out.push({ ...r, y0: h.y1 });
  const y0 = Math.max(r.y0, h.y0);
  const y1 = Math.min(r.y1, h.y1);
  if (h.x0 > r.x0) out.push({ x0: r.x0, x1: h.x0, y0, y1 });
  if (h.x1 < r.x1) out.push({ x0: h.x1, x1: r.x1, y0, y1 });
  return out;
}
/**
 * Height and (world) normal of the roof's top surface over a plan point, if any. The roof is built from
 * overlapping pieces, so `lowest` finds the lowest piece there instead (whose underside could show in a shaft).
 */
function roofAt(faces: RoofFace[], x: number, z: number, lowest = false): { y: number; n: THREE.Vector3 } | null {
  let best: { y: number; n: THREE.Vector3 } | null = null;
  for (const f of faces) {
    const p = f.pts;
    if (p.length < 3) continue;
    const a = new THREE.Vector3(p[0].x, p[0].y, p[0].z);
    const n = new THREE.Vector3()
      .subVectors(new THREE.Vector3(p[1].x, p[1].y, p[1].z), a)
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(p[2].x, p[2].y, p[2].z), a));
    if (Math.abs(n.y) < 1e-6) continue;
    if (n.y < 0) n.negate();
    n.normalize();
    // Inside the face (seen from above)?
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++)
      if (p[i].z > z !== p[j].z > z && x < ((p[j].x - p[i].x) * (z - p[i].z)) / (p[j].z - p[i].z) + p[i].x) inside = !inside;
    if (!inside) continue;
    const y = a.y - (n.x * (x - a.x) + n.z * (z - a.z)) / n.y;
    if (!best || (lowest ? y < best.y : y > best.y)) best = { y, n };
  }
  return best;
}
function skylightContext(it: Item, faces: RoofFace[] | null, ceiling: number, cutaway: boolean, roofDepth: number): NonNullable<ItemContext['sky']> {
  const rot = THREE.MathUtils.degToRad(it.rotation);
  const at = faces ? roofAt(faces, it.x, it.y) : null;
  // The shaft stops a little under the roof's underside (the roof is drawn as a slab as deep as the fascia).
  let shaftTop = ceiling + 400;
  if (faces) {
    const ys: number[] = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const lx = (sx * it.width) / 2;
      const lz = (sz * it.depth) / 2;
      const hit = roofAt(faces, it.x + lx * Math.cos(rot) - lz * Math.sin(rot), it.y + lx * Math.sin(rot) + lz * Math.cos(rot), true);
      if (hit) ys.push(hit.y);
    }
    if (ys.length) shaftTop = Math.min(...ys) - roofDepth - 30;
  }
  // The item group is turned by -rotation about y, so bring the normal into its frame.
  const n = at ? at.n.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rot) : null;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    ceiling: Math.round(ceiling),
    shaftTop: Math.round(shaftTop),
    roof: at && n ? { y: Math.round(at.y), n: [r(n.x), r(n.y), r(n.z)] } : null,
    cutaway,
  };
}

function buildHouse(d: Design, selection: Selection | null, cutaway: boolean, showRoof: boolean, cache: ItemCache, walking = false, electric = false, lit: Set<string> | null = null): THREE.Group {
  const house = new THREE.Group();
  const plain = makeMat(false);
  const highlight = makeMat(true);
  const isSel = (kind: string, id: string) => selection?.kind === kind && selection.id === id;

  // House flooring: covers everything inside the walls (whether or not rooms are drawn).
  const floorMat = (f: { finish: FloorFinish; color: string; direction?: number; size: Required<FloorSize> }) =>
    new THREE.MeshStandardMaterial({
      color: f.color,
      map: floorTextureAt(f.finish, f.direction ?? 0, f.size),
      roughness: f.finish === 'tile' || f.finish === 'large_tile' ? 0.35 : f.finish === 'concrete' ? 0.5 : 0.85,
      side: THREE.DoubleSide,
    });
  const inside = exteriorSides(d.walls);
  if (inside.enclosed && inside.floor.length) {
    const pos: number[] = [];
    const uv: number[] = [];
    for (const r of inside.floor) {
      const quad = [
        [r.x0, r.y0],
        [r.x1, r.y0],
        [r.x1, r.y1],
        [r.x0, r.y0],
        [r.x1, r.y1],
        [r.x0, r.y1],
      ];
      for (const [x, y] of quad) {
        pos.push(x, 0.5, y);
        uv.push(x, y); // world mm; the texture repeat converts to pattern size
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, floorMat(floorOf(d, null)));
    mesh.receiveShadow = true;
    house.add(mesh);
  }

  // Rooms (their own flooring, or the house flooring)
  for (const r of d.rooms) {
    if (r.points.length < 3) continue;
    const shape = new THREE.Shape(r.points.map((p) => new THREE.Vector2(p.x, p.y)));
    const geo = new THREE.ShapeGeometry(shape);
    const mat = floorMat(floorOf(d, r));
    if (isSel('room', r.id)) {
      mat.emissive = new THREE.Color('#2f7bff');
      mat.emissiveIntensity = 0.25;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 1;
    mesh.receiveShadow = true;
    mesh.userData.sel = { kind: 'room', id: r.id };
    house.add(mesh);
  }

  // Ceilings in walk-through mode: over everything inside the outside walls (rooms or not), at the ceiling
  // height, so you see a ceiling instead of the underside of the roof.
  if (walking) {
    const c = ceilingOf(d);
    if (c) {
      const pos: number[] = [];
      // Skylights cut their opening out of the ceiling.
      let rects = c.rects.map((r) => ({ ...r }));
      for (const it of d.items) if (it.type === 'skylight') rects = rects.flatMap((r) => cutRect(r, footprintBox(it)));
      for (const r of rects)
        pos.push(r.x0, c.height, r.y0, r.x1, c.height, r.y0, r.x1, c.height, r.y1, r.x0, c.height, r.y0, r.x1, c.height, r.y1, r.x0, c.height, r.y1);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: d.settings.ceilingColor, roughness: 0.95, side: THREE.DoubleSide });
      // A little self-light stands in for light bouncing off the floor and walls.
      mat.emissive = new THREE.Color(d.settings.ceilingColor);
      mat.emissiveIntensity = 0.35;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      house.add(mesh);
    }
  }

  // Walls with openings
  const sides = exteriorSides(d.walls);
  const allOpenings = effectiveOpenings(d.walls, d.openings);
  for (const w of d.walls) {
    const f = wallFrame(w);
    if (f.length < 1) continue;
    const H = cutaway ? Math.min(w.height, CUTAWAY_HEIGHT) : w.height;
    const g = new THREE.Group();
    g.position.set(w.start.x, 0, w.start.y);
    g.rotation.y = -f.angle;
    g.userData.sel = { kind: 'wall', id: w.id };
    const selected = isSel('wall', w.id);
    const inner = (selected ? highlight : plain)(w.color, { rough: 0.92 });
    // Outside faces get the facade (house default or this wall's own).
    const out = sides.map.get(w.id);
    const fac = w.facade ?? d.facade;
    const facMat = out && (out.pos || out.neg) ? facadeMaterial(fac, selected) : null;
    // Inside faces painted a different colour from the rest of the wall.
    const paint = (side: 1 | -1) => {
      const c = faceColor(w, side);
      return c.toLowerCase() === w.color.toLowerCase() ? null : (selected ? highlight : plain)(c, { rough: 0.92 });
    };
    const faces = { pos: out?.pos ? facMat : paint(1), neg: out?.neg ? facMat : paint(-1), tile: FINISHES[fac.finish].tile };
    // Stop 1 mm short of where walls overlap at corners, so ends never z-fight with the neighbour's face.
    const { e0, e1 } = wallExtensions(w, d.walls);
    const { solid, ops } = wallSpans(w, allOpenings, e0 > 0 ? e0 - 1 : 0, e1 > 0 ? e1 - 1 : 0);
    for (const [a, z] of solid) wallBox(g, z - a, H, w.thickness, (a + z) / 2, 0, inner, faces);
    // Raised house: the outside walls carry on down to the ground (brick and render as the wall, cladding over
    // a dark battened subfloor), under doorways too.
    const L = floorLevelOf(d);
    if (L > 0 && facMat) {
      const masonry = ['brick', 'painted_brick', 'render', 'paint', 'stone', 'block'].includes(fac.finish);
      const base = masonry ? facMat : plain('#4f4d48', { rough: 0.95 });
      const a0 = -(e0 > 0 ? e0 - 1 : 0);
      const a1 = f.length + (e1 > 0 ? e1 - 1 : 0);
      wallBox(g, a1 - a0, L, w.thickness, (a0 + a1) / 2, -L, inner, { pos: out?.pos ? base : null, neg: out?.neg ? base : null, tile: faces.tile });
    }
    for (const { o, a, b: z } of ops) {
      const cx = (a + z) / 2;
      const top = Math.min(o.sill + o.height, w.height);
      const sill = Math.min(o.sill, H);
      if (sill > 0) wallBox(g, z - a, sill, w.thickness, cx, 0, inner, faces);
      if (top < H) wallBox(g, z - a, H - top, w.thickness, cx, top, inner, faces);
      if (o.id.includes('#')) continue; // a hole cut through a doubled-up wall; the door itself is built once
      const shown = effectiveDoor(o, d, !(out?.pos || out?.neg)); // interior doors follow the house style
      // Hinged doors open fully, or until something's in the way (or they rest on their door stop).
      const layout = shown.kind === 'door' || shown.kind === 'double_door' ? doorStopLayout(d, shown, w) : [];
      const og = buildOpening(shown, w.thickness, w.height, isSel('opening', o.id) ? highlight : plain, H, out?.pos ? 1 : out?.neg ? -1 : undefined, openingTrim(d, shown), layout.map((l) => l.angle));
      og.position.x = cx;
      og.userData.sel = { kind: 'opening', id: o.id };
      g.add(og);
      for (const { stop } of layout) if (stop && (stop.mount === 'floor' || stop.height < H)) house.add(doorStopMesh(stop, doorStopProduct(shown.doorStop?.product).hex, plain, o.id));
    }
    house.add(g);
  }

  // Cornices, skirting boards and wall linings (VJ etc.)
  house.add(buildTrims(d, cutaway));
  house.add(buildLinings(d, cutaway ? CUTAWAY_HEIGHT : Infinity));

  // Roof (hidden in cutaway mode so you can see in)
  let roofFaces: RoofFace[] | null = null; // for skylights
  const roofRes = d.roof ? generateRoof(d, d.roof) : null;
  if (d.roof && showRoof && !cutaway) {
    const r = roofRes!;
    if (!('error' in r)) {
      roofFaces = r.faces.filter((f) => f.mat === 'roof' && f.top);
      const sel = selection?.kind === 'roof'; // the roof or one of its extensions
      // While a door, window or item is selected, make the roof see-through so you can see what you're moving.
      const seeThrough = selection?.kind === 'opening' || selection?.kind === 'item';
      const wallColor = d.walls[0]?.color ?? '#f2efe9';
      const g = new THREE.Group();
      g.userData.sel = { kind: 'roof', id: 'roof' };
      // Roofing: sheet ribs / tile courses run down the slope on the top surface.
      const tiles = d.roof.material === 'concrete_tile' || d.roof.material === 'terracotta_tile';
      const profile = d.roof.profile ?? (tiles ? 'flat_tile' : 'corrugated');
      const roofing = roofTexture(profile);
      for (const [mat, color, top] of [
        ['roof', d.roof.color, true],
        ['roof', d.roof.color, false],
        ['infill', wallColor, false],
      ] as const) {
        const infill = mat === 'infill';
        const faces = r.faces.filter((f) => f.mat === mat && !!f.top === top);
        const geo = top ? facesToGeometry(faces, undefined, roofing.tile) : facesToGeometry(faces, infill ? FINISHES[d.facade.finish].tile : undefined);
        if (!geo) continue;
        // Gable ends / skillion infill are outside walls, so they get the house facade.
        const m = infill
          ? (facadeMaterial(d.facade, false) as THREE.MeshStandardMaterial)
          : new THREE.MeshStandardMaterial({
              color,
              roughness: tiles ? 0.85 : 0.5,
              metalness: tiles ? 0 : 0.2,
              map: top ? roofing.tex : null,
            });
        m.side = THREE.DoubleSide;
        if (sel) {
          m.emissive = new THREE.Color('#2f7bff');
          m.emissiveIntensity = 0.12;
        }
        if (seeThrough) {
          m.transparent = true;
          m.opacity = 0.28;
          m.depthWrite = false;
        }
        m.userData.roof = true;
        const mesh = new THREE.Mesh(geo, m);
        mesh.castShadow = !top && !seeThrough;
        mesh.receiveShadow = true;
        g.add(mesh);
      }
      g.add(buildEaves(d, r, roofFaces));
      house.add(g);
    }
  }

  // Furniture & fixtures
  // Unchanged furniture is reused from the last build, which keeps dragging smooth.
  const seen = new Set<string>();
  const plate = d.roof ? roofPlate(d, d.roof) : undefined;
  const ceilingH = ceilingOf(d)?.height ?? Math.max(0, ...d.walls.map((w) => w.height));
  const bulks = bulkheads(d, ceilingH);
  for (const it of d.items) {
    // Porches under the main roof and the columns holding it up rise to the top of the walls.
    const itemPlate = it.underRoof || (roofRes && !('error' in roofRes) && roofRes.supports.includes(it.id)) ? plate : undefined;
    seen.add(it.id);
    const selected = isSel('item', it.id);
    const cached = cache.get(it.id);
    // Skylights depend on the roof and ceiling too.
    const sky = it.type === 'skylight' || it.type === 'sun_tunnel' || it.type === 'solar_array' ? skylightContext(it, roofFaces, ceilingH, cutaway, Math.max(20, d.roof?.fascia ?? 200)) : undefined;
    const skyKey = sky ? JSON.stringify(sky) : '';
    const base = itemBase(d, it); // decks, patios and outside stairs stand on the ground
    const ground = -floorLevelOf(d);
    const bulkhead = bulks.get(it.id);
    const bulk = bulkhead ? JSON.stringify(bulkhead) : '';
    if (cached && cached.item === it && cached.selected === selected && cached.plate === itemPlate && cached.sky === skyKey && cached.base === base && cached.ground === ground && cached.bulk === bulk) {
      house.add(cached.obj);
      continue;
    }
    const g = buildItem(it, selected ? highlight : plain, { plate: itemPlate, sky, ground, bulkhead });
    g.position.set(it.x, it.elevation + base, it.y);
    g.rotation.y = -THREE.MathUtils.degToRad(it.rotation);
    g.userData.sel = { kind: 'item', id: it.id };
    cache.set(it.id, { item: it, selected, plate: itemPlate, sky: skyKey, base, ground, bulk, obj: g });
    house.add(g);
  }
  for (const id of [...cache.keys()]) if (!seen.has(id)) cache.delete(id);

  // Electrical: plates on the walls; ceiling lights and fans only where there's a ceiling to hang from (walking
  // through) or on the electrical page, so they don't float over the open-topped house.
  // Light spread demo: a real spotlight for each light that's on (no shadows, so dozens stay quick).
  for (const e of d.electrical) {
    if (productOf(e).mount === 'ceiling' && !walking && !electric) continue;
    const on = lit ? lit.has(e.id) : null;
    house.add(buildElectrical(d, e, isSel('electric', e.id) ? highlight : plain, ceilingH, on));
    if (on) house.add(lightSpot(e, ceilingH));
  }

  // Up/down handle above the selected item: drag it to raise or lower the item.
  const selItem = selection?.kind === 'item' ? d.items.find((i) => i.id === selection.id) : undefined;
  if (selItem) house.add(liftHandle(selItem));
  return house;
}

/** The beam of a light that's on in the light spread demo, aimed at the floor (or out from the wall, angled down). */
function lightSpot(e: ElecPoint, ceiling: number): THREE.SpotLight {
  const p = productOf(e);
  const h = lightSource(e, ceiling);
  const half = THREE.MathUtils.degToRad(Math.min(80, beamOf(e) / 2));
  // decay 0: no fall-off with distance (scene units are mm, so physical fall-off would need huge intensities).
  const spot = new THREE.SpotLight(cctColor(cctOf(e)), ((p.lumens ?? 600) / 750) * 2.2, h * 3, half, 0.55, 0);
  const r = THREE.MathUtils.degToRad(e.rotation);
  const out = p.mount === 'wall' ? 60 : 0; // wall lights: from just in front of the wall
  spot.position.set(e.x - Math.sin(r) * out, h - 20, e.y + Math.cos(r) * out);
  spot.target.position.set(e.x - Math.sin(r) * (p.mount === 'wall' ? h * 0.5 : 0), 0, e.y + Math.cos(r) * (p.mount === 'wall' ? h * 0.5 : 0));
  spot.add(spot.target);
  spot.target.position.sub(spot.position);
  return spot;
}

function liftHandle(it: Item): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#2f6fde', depthTest: false, transparent: true, opacity: 0.95 });
  const add = (geo: THREE.BufferGeometry, y: number, flip = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    if (flip) m.rotation.x = Math.PI;
    m.renderOrder = 999;
    g.add(m);
  };
  add(new THREE.CylinderGeometry(22, 22, 380, 12), 0);
  add(new THREE.ConeGeometry(75, 150, 20), 265);
  add(new THREE.ConeGeometry(75, 150, 20), -265, true);
  // Generous invisible grab area around the arrows.
  const grab = new THREE.Mesh(new THREE.CylinderGeometry(130, 130, 700, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  g.add(grab);
  g.position.set(it.x, it.elevation + it.height + 450, it.y);
  g.userData.liftHandle = true;
  return g;
}

/** Extrude each cornice/skirting profile along its run of wall. */
function buildTrims(d: Design, cutaway: boolean): THREE.Group {
  const g = new THREE.Group();
  const ceiling = ceilingOf(d)?.height ?? Math.max(0, ...d.walls.map((w) => w.height));
  const runs = trimRuns(d, ceiling + 1);
  const mats = {
    cornice: new THREE.MeshStandardMaterial({ color: d.settings.ceilingColor, roughness: 0.8, side: THREE.DoubleSide }),
    skirting: new THREE.MeshStandardMaterial({ color: d.settings.skirtingColor, roughness: 0.55, side: THREE.DoubleSide }),
    shadow: new THREE.MeshStandardMaterial({ color: '#2b2a28', roughness: 1 }),
    dado: null as unknown as THREE.MeshStandardMaterial,
  };
  mats.dado = mats.skirting;
  const shapes = new Map<TrimRun['profile'], THREE.Shape>();
  for (const run of runs) {
    if (run.kind === 'cornice' && cutaway) continue;
    const f = wallFrame(run.wall);
    let shape = shapes.get(run.profile);
    if (!shape) {
      shape = new THREE.Shape(run.profile.points.map(([x, y]) => new THREE.Vector2(x, y)));
      shapes.set(run.profile, shape);
    }
    const len = run.b - run.a;
    const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: 4 });
    // Outside corners: mitre the ends so pieces meet at the corner (each end reaches further the further it
    // stands out from the wall).
    const [m0, m1] = run.mitre ?? [0, 0];
    if (m0 || m1) {
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        if (z < 0.01) pos.setZ(i, z - x * m0);
        else if (z > len - 0.01) pos.setZ(i, z + x * m1);
      }
    }
    // Shape x = out from the wall face, shape y = up (skirting) or down (cornice), extrusion = along the wall.
    const out = new THREE.Vector3(f.n.x * run.side, 0, f.n.y * run.side);
    const up = new THREE.Vector3(0, run.kind === 'cornice' ? -1 : 1, 0);
    const along = new THREE.Vector3(f.u.x, 0, f.u.y);
    const face = add(add(run.wall.start, mul(f.u, run.a)), mul(f.n, run.side * (run.wall.thickness / 2)));
    const baseY = run.kind === 'skirting' ? 0 : run.kind === 'dado' ? DADO_HEIGHT - 30 : ceiling + 1;
    const m = new THREE.Matrix4().makeBasis(out, up, along).setPosition(face.x, baseY, face.y);
    geo.applyMatrix4(m);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, run.profile.shadow ? mats.shadow : mats[run.kind]);
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

// ---------- Wall linings: VJ panelling, shiplap, board & batten ----------
const liningTextures = new Map<string, THREE.Texture>();
/** Greyscale pattern (tinted by the wall colour), one repeat = `tile` mm. */
function liningTexture(type: string): { tex: THREE.Texture; tile: [number, number] } {
  const tile: [number, number] = type === 'shiplap' ? [600, 600] : type === 'board_batten' ? [800, 800] : [400, 400];
  let tex = liningTextures.get(type);
  if (!tex) {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);
    const px = size / tile[0]; // px per mm
    if (type === 'vj' || type === 'vj_dado') {
      // 100 mm boards with a V-groove: dark line, then a lit chamfer
      for (let x = 0; x < tile[0]; x += 100) {
        g.fillStyle = 'rgba(0,0,0,0.38)';
        g.fillRect(x * px, 0, 3, size);
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(x * px + 3, 0, 4, size);
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.fillRect(x * px - 3, 0, 3, size);
      }
    } else if (type === 'shiplap') {
      // 150 mm horizontal boards with a shadow gap at each lap
      for (let y = 0; y < tile[1]; y += 150) {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(0, y * px, size, 4);
        const grad = g.createLinearGradient(0, y * px + 4, 0, y * px + 18);
        grad.addColorStop(0, 'rgba(0,0,0,0.12)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(0, y * px + 4, size, 14);
      }
    } else if (type === 'board_batten') {
      // 60 mm battens every 400 mm, lit on one edge, shadowed on the other
      for (let x = 0; x < tile[0]; x += 400) {
        g.fillStyle = 'rgba(0,0,0,0.05)';
        g.fillRect(x * px, 0, 60 * px, size);
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.fillRect(x * px, 0, 3, size);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect((x + 60) * px, 0, 5, size);
        g.fillStyle = 'rgba(0,0,0,0.1)';
        g.fillRect((x + 60) * px + 5, 0, 8, size);
      }
    }
    tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    liningTextures.set(type, tex);
  }
  return { tex, tile };
}

/** Lining panels laid just proud of each inside wall face, cut round doors and windows. */
function buildLinings(d: Design, cutHeight: number): THREE.Group {
  const g = new THREE.Group();
  const batches = new Map<string, { pos: number[]; uv: number[]; color: string; type: string }>();
  for (const run of liningRuns(d)) {
    const w = run.wall;
    const f = wallFrame(w);
    const top = Math.min(run.lining === 'vj_dado' ? DADO_HEIGHT : w.height, cutHeight);
    if (top <= 0) continue;
    const color = faceColor(w, run.side);
    const key = `${run.lining}|${color}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { pos: [], uv: [], color, type: run.lining };
      batches.set(key, batch);
    }
    const { tile } = liningTexture(run.lining);
    const off = run.side * (w.thickness / 2 + 1.5);
    const holes = openingRects(d, w).filter(([oa, ob]) => ob > run.a && oa < run.b);
    // Cut the stretch at opening edges; within an opening, only cover below the sill and above the head.
    const xs = [...new Set([run.a, run.b, ...holes.flatMap(([oa, ob]) => [oa, ob]).filter((x) => x > run.a && x < run.b)])].sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i++) {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const hole = holes.find(([oa, ob]) => oa <= x0 + 0.5 && ob >= x1 - 0.5);
      const bands: [number, number][] = hole ? [[0, Math.min(hole[2], top)], [Math.min(hole[3], top), top]] : [[0, top]];
      for (const [y0, y1] of bands) {
        if (y1 - y0 < 1) continue;
        const p = (along: number, y: number) => {
          const q = add(add(w.start, mul(f.u, along)), mul(f.n, off));
          batch!.pos.push(q.x, y, q.y);
          batch!.uv.push(along / tile[0], y / tile[1]);
        };
        p(x0, y0);
        p(x1, y0);
        p(x1, y1);
        p(x0, y0);
        p(x1, y1);
        p(x0, y1);
      }
    }
  }
  for (const b of batches.values()) {
    if (!b.pos.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: b.color, map: liningTexture(b.type).tex, roughness: 0.7, side: THREE.DoubleSide }));
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

/** Ceiling rectangles and height for walk-through mode. */
function ceilingOf(d: Design) {
  const sides = exteriorSides(d.walls);
  if (!sides.enclosed || !sides.floor.length) return null;
  const outerWalls = d.walls.filter((w) => sides.map.get(w.id)?.pos || sides.map.get(w.id)?.neg);
  const auto = Math.max(0, ...(outerWalls.length ? outerWalls : d.walls).map((w) => w.height));
  return { rects: sides.floor, height: (d.settings.ceilingHeight ?? auto) - 1 };
}

/** Triangulate roof faces: planar convex polygons as fans, infill strips as quads. */
function facesToGeometry(faces: RoofFace[], uvTile?: [number, number], slopeTile?: [number, number]): THREE.BufferGeometry | null {
  const pos: number[] = [];
  const uvs: number[] = [];
  // Roof top: u across the slope, v down it, so ribs and tile courses follow the fall of each face.
  let ax = new THREE.Vector3();
  let dn = new THREE.Vector3();
  const push = (p: { x: number; y: number; z: number }) => {
    pos.push(p.x, p.y, p.z);
    if (slopeTile) uvs.push((p.x * ax.x + p.y * ax.y + p.z * ax.z) / slopeTile[0], (p.x * dn.x + p.y * dn.y + p.z * dn.z) / slopeTile[1]);
  };
  for (const f of faces) {
    const p = f.pts;
    if (slopeTile && p.length >= 3) {
      const a = new THREE.Vector3(p[0].x, p[0].y, p[0].z);
      const n = new THREE.Vector3().subVectors(new THREE.Vector3(p[1].x, p[1].y, p[1].z), a).cross(new THREE.Vector3().subVectors(new THREE.Vector3(p[2].x, p[2].y, p[2].z), a));
      if (n.y < 0) n.negate();
      n.normalize();
      dn = new THREE.Vector3(0, -1, 0).addScaledVector(n, n.y); // downhill, in the face
      if (dn.lengthSq() < 1e-6) dn.set(0, 0, 1); // flat roof
      dn.normalize();
      ax = new THREE.Vector3().crossVectors(n, dn).normalize();
    }
    if (f.mat === 'infill') {
      for (let i = 0; i + 3 < p.length; i += 2) {
        push(p[i]);
        push(p[i + 1]);
        push(p[i + 3]);
        push(p[i]);
        push(p[i + 3]);
        push(p[i + 2]);
      }
    } else {
      for (let i = 1; i + 1 < p.length; i++) {
        push(p[0]);
        push(p[i]);
        push(p[i + 1]);
      }
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (slopeTile) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (uvTile) {
    // Vertical wall infill: run the pattern along the wall and up from the ground.
    const uv: number[] = [];
    for (let i = 0; i < pos.length; i += 3) uv.push((pos[i] + pos[i + 2]) / uvTile[0], pos[i + 1] / uvTile[1]);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------- facades ----------
const facadeTextures = new Map<HTMLCanvasElement, THREE.CanvasTexture>();

function facadeMaterial(f: Facade, selected: boolean): THREE.Material {
  const canvas = facadeCanvas(f);
  let tex = facadeTextures.get(canvas);
  if (!tex) {
    tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    facadeTextures.set(canvas, tex);
  }
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: FINISHES[f.finish].roughness });
  if (selected) {
    m.emissive = new THREE.Color('#2f7bff');
    m.emissiveIntensity = 0.35;
  }
  return m;
}

/**
 * A wall piece (in wall-local space: x along the wall, z = wall normal). The two long faces use the facade
 * material when that side is outside, with the pattern mapped at real size (courses line up from the ground).
 */
function wallBox(
  g: THREE.Object3D,
  len: number,
  h: number,
  t: number,
  cx: number,
  y0: number,
  inner: THREE.Material,
  faces: { pos: THREE.Material | null; neg: THREE.Material | null; tile: [number, number] },
) {
  if (len < 0.1 || h < 0.1) return;
  const geo = new THREE.BoxGeometry(len, h, t);
  if (faces.pos || faces.neg) {
    const p = geo.getAttribute('position');
    const n = geo.getAttribute('normal');
    const uv = geo.getAttribute('uv');
    const [tw, th] = faces.tile;
    for (let i = 0; i < p.count; i++) {
      const nz = n.getZ(i);
      if (Math.abs(nz) < 0.5) continue;
      const x = p.getX(i) + cx;
      uv.setXY(i, (nz > 0 ? x : -x) / tw, (p.getY(i) + y0 + h / 2) / th);
    }
    uv.needsUpdate = true;
  }
  // BoxGeometry material order: +x, -x, +y, -y, +z (normal side), -z.
  const mesh = new THREE.Mesh(geo, [inner, inner, inner, inner, faces.pos ?? inner, faces.neg ?? inner]);
  mesh.position.set(cx, y0 + h / 2, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
}

// ---------- Roofing textures and gutters ----------
const roofTextures = new Map<string, { tex: THREE.Texture; tile: [number, number] }>();
/** Greyscale pattern for a roofing profile (tinted by the roof colour); x across the slope, y down it. */
function roofTexture(profile: string): { tex: THREE.Texture; tile: [number, number] } {
  const hit = roofTextures.get(profile);
  if (hit) return hit;
  const tile: [number, number] =
    profile === 'corrugated' ? [608, 608] : profile === 'trapezoidal' ? [760, 760] : profile === 'kliplok' ? [812, 812] : profile === 'wave_tile' ? [600, 690] : [660, 690];
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  const px = size / tile[0]; // px per mm across
  const py = size / tile[1]; // px per mm down
  const ribs = (pitch: number, width: number) => {
    for (let x = 0; x < tile[0]; x += pitch) {
      const grad = g.createLinearGradient((x - width / 2) * px, 0, (x + width / 2) * px, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.28)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(0,0,0,0.22)');
      g.fillStyle = grad;
      g.fillRect((x - width / 2) * px, 0, width * px, size);
    }
  };
  if (profile === 'corrugated') {
    // Sine-shaded corrugations every 76 mm.
    for (let x = 0; x < size; x++) {
      const v = Math.sin(((x / px) / 76) * Math.PI * 2);
      g.fillStyle = v > 0 ? `rgba(255,255,255,${0.22 * v})` : `rgba(0,0,0,${-0.2 * v})`;
      g.fillRect(x, 0, 1, size);
    }
  } else if (profile === 'trapezoidal') ribs(190, 40);
  else if (profile === 'kliplok') ribs(406, 50);
  else {
    // Tiles: courses with a shadow under each tile's lower edge; joints staggered course to course.
    const course = 345;
    const tw = profile === 'wave_tile' ? 300 : 330;
    for (let y = 0, row = 0; y < tile[1]; y += course, row++) {
      const top = y * py;
      const grad = g.createLinearGradient(0, top, 0, top + course * py);
      grad.addColorStop(0, 'rgba(255,255,255,0.12)');
      grad.addColorStop(0.85, 'rgba(0,0,0,0.05)');
      grad.addColorStop(1, 'rgba(0,0,0,0.38)');
      g.fillStyle = grad;
      g.fillRect(0, top, size, course * py);
      if (profile === 'wave_tile')
        for (let x = 0; x < size; x++) {
          const v = Math.sin(((x / px) / tw) * Math.PI * 2);
          g.fillStyle = v > 0 ? `rgba(255,255,255,${0.16 * v})` : `rgba(0,0,0,${-0.22 * v})`;
          g.fillRect(x, top, 1, course * py);
        }
      else {
        g.fillStyle = 'rgba(0,0,0,0.25)';
        for (let x = (row % 2) * (tw / 2); x < tile[0]; x += tw) g.fillRect(x * px, top, 2, course * py);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const out = { tex, tile };
  roofTextures.set(profile, out);
  return out;
}

/** Gutter cross-sections: x out from the fascia, y up (mm). */
function gutterShape(style: string): THREE.Shape {
  const s = new THREE.Shape();
  switch (style) {
    case 'half_round':
      s.moveTo(0, 62);
      s.absarc(62, 62, 62, Math.PI, 0, false);
      s.lineTo(0, 62);
      break;
    case 'square_line':
      s.moveTo(0, 0);
      s.lineTo(110, 0);
      s.lineTo(110, 100);
      s.lineTo(120, 105);
      s.lineTo(0, 110);
      break;
    case 'fascia':
      s.moveTo(0, 0);
      s.lineTo(135, 0);
      s.lineTo(140, 190);
      s.lineTo(150, 196);
      s.lineTo(0, 196);
      break;
    case 'ogee':
      s.moveTo(0, 0);
      s.lineTo(70, 0);
      s.bezierCurveTo(130, 0, 85, 80, 125, 110);
      s.lineTo(125, 118);
      s.lineTo(0, 118);
      break;
    default:
      // Quad: flat back, curved quarter-round front with a rolled bead.
      s.moveTo(0, 0);
      s.lineTo(55, 0);
      s.quadraticCurveTo(115, 0, 115, 60);
      s.lineTo(115, 112);
      s.lineTo(124, 116);
      s.lineTo(0, 116);
  }
  return s;
}

interface EaveEdge {
  a: { x: number; y: number };
  b: { x: number; y: number };
  /** Along the edge (a → b) and out from the roof, in plan. */
  ux: number;
  uz: number;
  ox: number;
  oz: number;
  len: number;
  /** Roof top height along the edge. */
  h: number;
  /** Mitre at each end (tan of half the turn; + outside corner, − inside corner, 0 = square end). */
  k0: number;
  k1: number;
}

type P2 = { x: number; y: number };
/**
 * The outline of a union of polygons (the roof is built from overlapping pieces, one per wing): every edge is split
 * where other outlines cross it, the parts that lie inside another piece are dropped, and the rest are chained into
 * loops, all anticlockwise.
 */
function unionOutline(polys: P2[][]): P2[][] {
  const area = (p: P2[]) => p.reduce((a, q, i) => a + q.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * q.y, 0) / 2;
  const ccw = polys.filter((p) => p.length >= 3).map((p) => (area(p) > 0 ? p : [...p].reverse()));
  const inside = (q: P2, poly: P2[]) => {
    let r = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
      if (poly[i].y > q.y !== poly[j].y > q.y && q.x < ((poly[j].x - poly[i].x) * (q.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) r = !r;
    return r;
  };
  const segs: { a: P2; b: P2 }[] = [];
  ccw.forEach((poly, pi) => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1) continue;
      // Where other outlines cross or touch this edge.
      const ts = [0, 1];
      ccw.forEach((other, oi) => {
        if (oi === pi) return;
        for (let j = 0; j < other.length; j++) {
          const c = other[j];
          const e = other[(j + 1) % other.length];
          const ex = e.x - c.x;
          const ey = e.y - c.y;
          const den = dx * ey - dy * ex;
          if (Math.abs(den) > 1e-9) {
            const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / den;
            const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / den;
            if (t > 1e-6 && t < 1 - 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) ts.push(t);
          }
          // Corners of the other outline lying on this edge (overlapping, collinear edges).
          const t2 = ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2;
          const off = Math.abs((c.x - a.x) * dy - (c.y - a.y) * dx) / Math.sqrt(len2);
          if (t2 > 1e-6 && t2 < 1 - 1e-6 && off < 0.5) ts.push(t2);
        }
      });
      ts.sort((x, y) => x - y);
      const L = Math.sqrt(len2);
      const ox = dy / L; // outward (right of travel for an anticlockwise loop in this plan's axes)
      const oy = -dx / L;
      for (let k = 0; k + 1 < ts.length; k++) {
        if (ts[k + 1] - ts[k] < 1e-6) continue;
        const tm = (ts[k] + ts[k + 1]) / 2;
        const m = { x: a.x + dx * tm, y: a.y + dy * tm };
        const out = { x: m.x + ox * 5, y: m.y + oy * 5 };
        const inn = { x: m.x - ox * 5, y: m.y - oy * 5 };
        // On the outside of the union: just outside is in no piece, just inside is in this one.
        if (ccw.some((q) => inside(out, q))) continue;
        if (!inside(inn, poly)) continue;
        const sa = { x: a.x + dx * ts[k], y: a.y + dy * ts[k] };
        const sb = { x: a.x + dx * ts[k + 1], y: a.y + dy * ts[k + 1] };
        // Two pieces sharing an outside line give the same part twice.
        if (segs.some((sg) => Math.hypot(sg.a.x - sa.x, sg.a.y - sa.y) < 1 && Math.hypot(sg.b.x - sb.x, sg.b.y - sb.y) < 1)) continue;
        segs.push({ a: sa, b: sb });
      }
    }
  });
  // Chain the parts into loops, then merge straight runs.
  const key = (q: P2) => `${Math.round(q.x)},${Math.round(q.y)}`;
  const byStart = new Map<string, number[]>();
  segs.forEach((sg, i) => byStart.set(key(sg.a), [...(byStart.get(key(sg.a)) ?? []), i]));
  const used = new Set<number>();
  const loops: P2[][] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used.has(i)) continue;
    const loop: P2[] = [];
    let cur = i;
    while (cur !== undefined && !used.has(cur)) {
      used.add(cur);
      loop.push(segs[cur].a);
      const next = (byStart.get(key(segs[cur].b)) ?? []).find((n) => !used.has(n));
      if (next === undefined) break;
      cur = next;
    }
    // Drop points in the middle of straight runs.
    const clean = loop.filter((q, j) => {
      const pr = loop[(j - 1 + loop.length) % loop.length];
      const nx = loop[(j + 1) % loop.length];
      return Math.abs((q.x - pr.x) * (nx.y - q.y) - (q.y - pr.y) * (nx.x - q.x)) > 1;
    });
    if (clean.length >= 3) loops.push(clean);
  }
  return loops;
}

/**
 * The level, low edges of the roof (eaves, not gable rakes or the high side of a skillion), with the mitre at each
 * end where an eave turns a corner into the next one.
 */
function eaveEdges(r: { eaves: { x: number; y: number }[][] }, faces: RoofFace[]): EaveEdge[][] {
  const heightAt = (x: number, z: number) => roofAt(faces, x, z)?.y ?? null;
  let lowest = Infinity;
  for (const poly of r.eaves)
    for (const p of poly) {
      const h = heightAt(p.x, p.y);
      if (h !== null) lowest = Math.min(lowest, h);
    }
  return unionOutline(r.eaves).map((poly) => {
    const n = poly.length;
    const area = poly.reduce((acc, p, i) => acc + p.x * poly[(i + 1) % n].y - poly[(i + 1) % n].x * p.y, 0);
    const sign = area > 0 ? 1 : -1;
    const edges: (EaveEdge | null)[] = poly.map((a, i) => {
      const b = poly[(i + 1) % n];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 150) return null;
      const ux = (b.x - a.x) / len;
      const uz = (b.y - a.y) / len;
      const ox = sign * uz;
      const oz = -sign * ux;
      const at = (t: number) => heightAt(a.x + (b.x - a.x) * t - ox * 30, a.y + (b.y - a.y) * t - oz * 30);
      const h0 = at(0.05);
      const h1 = at(0.5);
      const h2 = at(0.95);
      const eave = h0 !== null && h1 !== null && h2 !== null && Math.abs(h0 - h2) < 15 && Math.abs(h0 - h1) < 15 && h1 < lowest + 60;
      return eave ? { a, b, ux, uz, ox, oz, len, h: h1!, k0: 0, k1: 0 } : null;
    });
    // Mitres between consecutive eave edges.
    for (let i = 0; i < n; i++) {
      const e = edges[i];
      const next = edges[(i + 1) % n];
      if (!e || !next) continue;
      const turn = Math.atan2(e.ux * next.uz - e.uz * next.ux, e.ux * next.ux + e.uz * next.uz); // signed
      // Turning away from the outward side = an outside corner.
      const outside = (e.ox * next.ux + e.oz * next.uz) < 0;
      const k = Math.tan(Math.abs(turn) / 2) * (outside ? 1 : -1);
      e.k1 = k;
      next.k0 = k;
    }
    return edges.filter((e): e is EaveEdge => !!e);
  });
}

/** A gutter cross-section extruded along an eave edge, with its ends mitred (x = out from the fascia). */
function mitredRun(shape: THREE.Shape, e: EaveEdge, y: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: e.len, bevelEnabled: false, curveSegments: 8 });
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    if (z < 0.01) pos.setZ(i, z - x * e.k0);
    else if (z > e.len - 0.01) pos.setZ(i, z + x * e.k1);
  }
  geo.applyMatrix4(
    new THREE.Matrix4()
      .makeBasis(new THREE.Vector3(e.ox, 0, e.oz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(e.ux, 0, e.uz))
      .setPosition(e.a.x, y, e.a.y),
  );
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

/**
 * Everything along the eaves: the eave lining (Villaboard soffit) from the fascia back to the wall, gutters on the
 * fascia just under the roof edge with mitred corners, and downpipes at outside corners and the ends of runs.
 */
function buildEaves(d: Design, r: { eaves: { x: number; y: number }[][]; outside: { x: number; y: number }[][] }, faces: RoofFace[] | null): THREE.Group {
  const g = new THREE.Group();
  const roof = d.roof!;
  if (!faces?.length) return g;
  const loops = eaveEdges(r, faces);
  const fasciaDepth = Math.max(20, roof.fascia);
  // Eave lining: a level sheet under each eave, its width the overhang, mitred where eaves meet.
  const soffit = roof.soffit ?? { show: true, color: '#f4f4f0' };
  if (soffit.show !== false) {
    const ov = roof.overhang;
    const pos: number[] = [];
    const k = Math.tan(THREE.MathUtils.degToRad(roof.pitch));
    // Roofed areas outside the walls (patios, verandas…) are lined right back to the house, level with the eaves.
    const eaveH = Math.min(...loops.flat().map((e) => e.h));
    if (r.outside.length && Number.isFinite(eaveH)) {
      const y = eaveH - 30 * k - fasciaDepth - 15;
      for (const poly of r.outside) {
        const [p1, p2, p3, p4] = poly.map((q) => [q.x, y, q.y]);
        pos.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
      }
    }
    if (ov > 40) {
      for (const loop of loops)
        for (const e of loop) {
          // Just under the bottom of the fascia (the roof edge is a little below where e.h was measured).
          const y = e.h - 30 * k - fasciaDepth - 15;
          const ix = -e.ox * ov;
          const iz = -e.oz * ov;
          const p1 = [e.a.x, y, e.a.y];
          const p2 = [e.b.x, y, e.b.y];
          const p3 = [e.b.x + ix - e.ux * ov * e.k1, y, e.b.y + iz - e.uz * ov * e.k1];
          const p4 = [e.a.x + ix + e.ux * ov * e.k0, y, e.a.y + iz + e.uz * ov * e.k0];
          pos.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
        }
    }
    if (pos.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      // Lit mostly by light bouncing up off the ground and walls: a little self-light keeps it reading as a
      // light lining rather than a black slot.
      const m = new THREE.MeshStandardMaterial({ color: soffit.color, roughness: 0.9, side: THREE.DoubleSide });
      m.emissive = new THREE.Color(soffit.color);
      m.emissiveIntensity = 0.32;
      const mesh = new THREE.Mesh(geo, m);
      g.add(mesh);
    }
  }
  const gut = roof.gutter;
  // COLORBOND® fascia board on the eave edges (matching the gutters, or the roof with no gutters).
  {
    const k = Math.tan(THREE.MathUtils.degToRad(roof.pitch));
    const fasciaMat = new THREE.MeshStandardMaterial({ color: roof.fasciaColor ?? (gut && gut.style !== 'none' ? gut.color : roof.color), roughness: 0.5, metalness: 0.2 });
    const board = new THREE.Shape();
    board.moveTo(0, 0);
    board.lineTo(6, 0);
    board.lineTo(6, fasciaDepth + 4);
    board.lineTo(0, fasciaDepth + 4);
    for (const loop of loops)
      for (const e of loop) {
        const top = e.h - 30 * k;
        const m = mitredRun(board, e, top - fasciaDepth - 2, fasciaMat);
        m.position.add(new THREE.Vector3(e.ox, 0, e.oz).multiplyScalar(1));
        g.add(m);
      }
  }
  if (!gut || gut.style === 'none') return g;
  const mat = new THREE.MeshStandardMaterial({ color: gut.color, roughness: 0.45, metalness: 0.25, side: THREE.DoubleSide });
  const shape = gutterShape(gut.style);
  const depth = gut.style === 'fascia' ? 196 : gut.style === 'half_round' ? 62 : 116; // height of the section
  for (const loop of loops) {
    for (const e of loop) g.add(mitredRun(shape, e, e.h - 20 - depth, mat));
    if (!gut.downpipes) continue;
    // Downpipes: at outside corners between two runs, and at the ends of runs (e.g. where a gutter meets a gable end).
    // Each drops from under the gutter, back under the eaves to the wall, then down to the ground.
    const pipe = (px: number, pz: number, ux: number, uz: number, ox: number, oz: number, h: number) => {
      const gy = h - 20 - depth;
      const outlet = new THREE.Vector3(px + ux * 300 + ox * 60, gy, pz + uz * 300 + oz * 60);
      const back = Math.max(80, roof.overhang - 40);
      const wallPt = new THREE.Vector3(outlet.x - ox * (back + 60), gy - 260, outlet.z - oz * (back + 60));
      const seg = (from: THREE.Vector3, to: THREE.Vector3) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(45, 45, from.distanceTo(to), 14), mat);
        m.position.copy(from).add(to).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(to, from).normalize());
        m.castShadow = true;
        g.add(m);
      };
      seg(outlet, new THREE.Vector3(outlet.x, gy - 120, outlet.z));
      seg(new THREE.Vector3(outlet.x, gy - 120, outlet.z), wallPt);
      seg(wallPt, new THREE.Vector3(wallPt.x, 0, wallPt.z));
    };
    for (const e of loop) {
      // Start of this run: a pipe if nothing joins here, or at an outside corner (counted once, at the run's start).
      if (e.k0 === 0 || e.k0 > 0) pipe(e.a.x, e.a.y, e.ux, e.uz, e.ox, e.oz, e.h);
      // End of a run that doesn't continue round a corner.
      if (e.k1 === 0) pipe(e.b.x, e.b.y, -e.ux, -e.uz, e.ox, e.oz, e.h);
    }
  }
  return g;
}
