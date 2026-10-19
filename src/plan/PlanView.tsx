import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent, ReactNode } from 'react';
import { ITEM_MAP, OPENING_MAP } from '../catalog';
import { addWalls, moveWallPoints, newItem, newOpening, placementItem, newRoom, newWall, setWallGap, setWallLength, wallMovePoints } from '../actions';
import {
  add,
  clampOpeningOffset,
  deg,
  dist,
  evalExpr,
  formatArea,
  formatMm,
  itemCorners,
  mul,
  near,
  norm,
  normAngle,
  polygonArea,
  openingGapTitle,
  openingSideGaps,
  pointInPolygon,
  effectiveOpenings,
  uncoveredParts,
  wallClearLength,
  sidelights,
  polygonCentroid,
  roomInterior,
  rad,
  rot,
  roundTo,
  sub,
  v,
  wallExtensions,
  wallFrame,
  wallGaps,
  wallSpans,
  stackerLayout,
  dressingSide,
  dot,
  effectiveDoor,
  uid,
} from '../geometry';
import { store, useStore } from '../store';
import type { Design, Dimension, Item, Opening, Room, RoofExtension, Vec, Wall } from '../types';
import { generateRoof } from '../roof';
import type { RoofOutcome } from '../roof';
import { itemClearances } from '../clearance';
import { isTyping } from '../keyboard';
import { exteriorSides } from '../facade';
import { checkDoor, clearOffset, doorStopLayout, MIN_OPEN } from '../doorClearance';
import { DOOR_STOP_SIZE } from '../doorStops';
import { CONSTRUCTIONS } from '../construction';
import { BOARD_FLOORS, DIRECTIONAL_FLOORS, floorOf } from '../trims';
import { nearestWall, snapItem, snapPoint } from './snap';
import type { SnapResult } from './snap';
import { itemOutline, itemSymbol } from './symbols';
import { ElectricalLayer } from './electrical';
import { OutsideDims, outsideDimensions } from './outsideDims';
import { ELEC_MAP, elecPlacement, linkRefFor, litLights, newElecPoint, productOf } from '../electrical';
import { flickSwitch, startLinking, toggleLink } from '../elecActions';
import { useMobile, useTouch } from '../mobile';

interface View {
  scale: number; // screen px per mm
  tx: number;
  ty: number;
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; tx: number; ty: number }
  | { kind: 'item'; id: string; off: Vec }
  | { kind: 'item-rotate'; id: string }
  | { kind: 'elec'; id: string; off: Vec }
  | { kind: 'item-resize'; id: string; orig: Item }
  | { kind: 'wall'; id: string; start: Vec; orig: Design; pts: Vec[] }
  | { kind: 'wall-end'; id: string; which: 'start' | 'end'; orig: Design; exclude: Set<string> }
  | { kind: 'opening'; id: string }
  | { kind: 'room'; id: string; start: Vec; orig: Room }
  | { kind: 'room-vertex'; id: string; index: number }
  | { kind: 'dimension'; id: string; start: Vec; orig: Dimension }
  | { kind: 'rect'; start: Vec }
  // Roof: pull an edge out (creates an extension), move an extension, or drag one of its sides.
  | { kind: 'roof-pull'; edge: { a: Vec; b: Vec; n: Vec }; overhang: number; extId: string | null }
  | { kind: 'roof-ext'; id: string; start: Vec; orig: RoofExtension }
  | { kind: 'roof-ext-side'; id: string; side: number; orig: RoofExtension };

/** Board-line pattern for a floor: its direction and the spacing (board width, or tile width plus grout). */
function boardPattern(fl: ReturnType<typeof floorOf>) {
  const dir = ((Math.round(fl.direction) % 180) + 180) % 180;
  const step = BOARD_FLOORS.has(fl.finish) ? fl.size.board : fl.size.tileW + fl.size.grout;
  return `${dir}-${Math.max(20, Math.round(step))}`;
}

/** Corners of a roof extension. */
function extCorners(ex: RoofExtension): Vec[] {
  const r = rad(ex.rotation);
  const c = v(ex.x, ex.y);
  return [v(-1, -1), v(1, -1), v(1, 1), v(-1, 1)].map((s) => add(c, rot(v((s.x * ex.width) / 2, (s.y * ex.depth) / 2), r)));
}

function withExtension(d: Design, id: string, fn: (ex: RoofExtension) => RoofExtension): Design {
  if (!d.roof) return d;
  return { ...d, roof: { ...d.roof, extensions: (d.roof.extensions ?? []).map((ex) => (ex.id === id ? fn(ex) : ex)) } };
}

interface DragState {
  drag: Drag;
  downX: number;
  downY: number;
  active: boolean; // passed the movement threshold
  recorded: boolean; // undo checkpoint taken
}

const PX_TOL = 10;
/** Bigger tolerance for fingers. */
const TOUCH_TOL = 18;

export default function PlanView() {
  const design = useStore((s) => s.design);
  const selection = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  const walker = useStore((s) => s.walker);
  const electric = useStore((s) => s.electric);
  const lightDemo = useStore((s) => s.lightDemo);
  const lit = useMemo(() => (lightDemo ? litLights(design, new Set(lightDemo)) : null), [design, lightDemo]);
  const roofSel = selection?.kind === 'roof';
  const roofRes = useMemo(() => (roofSel && design.roof ? generateRoof(design, design.roof) : null), [design, roofSel]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ scale: 0.05, tx: 100, ty: 100 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const [mouse, setMouse] = useState<Vec | null>(null);
  const [mods, setMods] = useState({ shift: false, alt: false });
  const [chain, setChain] = useState<Vec[]>([]);
  const [rectEnd, setRectEnd] = useState<Vec | null>(null);
  /** Alignment lines while dragging an item (the edges it lined up with). */
  const [itemGuides, setItemGuides] = useState<[Vec, Vec][]>([]);
  const [typed, setTyped] = useState('');
  const [lengthEdit, setLengthEdit] = useState<{ wallId: string; at: Vec; text: string; gap?: { side: 1 | -1; value: number; otherId: string }; opening?: { id: string; side: 'left' | 'right'; face: number }; item?: { id: string; dir: Vec; dist: number } } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragKind, setDragKind] = useState<string | null>(null);
  const spaceDown = useRef(false);
  const fitted = useRef(false);

  const touchScreen = useTouch();
  const mobile = useMobile();
  const tol = (touchScreen ? TOUCH_TOL : PX_TOL) / view.scale;
  // Touch: fingers on the plan, a two-finger pinch in progress, and a tap waiting to see if it becomes a pan.
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; view: View; mid: Vec } | null>(null);
  const pendingTap = useRef<{ id: number; ev: RPointerEvent<SVGSVGElement> } | null>(null);
  const grid = design.settings.snap;

  // ---------- view helpers ----------
  const toWorld = useCallback((clientX: number, clientY: number): Vec => {
    const r = svgRef.current!.getBoundingClientRect();
    const vw = viewRef.current;
    return { x: (clientX - r.left - vw.tx) / vw.scale, y: (clientY - r.top - vw.ty) / vw.scale };
  }, []);

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    if (!W || !H) return;
    const d = store.state.design;
    const pts: Vec[] = [];
    d.walls.forEach((w) => pts.push(w.start, w.end));
    d.items.forEach((i) => pts.push(...itemCorners(i)));
    d.rooms.forEach((r) => pts.push(...r.points));
    d.dimensions.forEach((m) => pts.push(m.a, m.b));
    // Kitchen designer: just the kitchen.
    const kitchen = store.state.kitchen ? d.rooms.find((r) => r.id === store.state.kitchen) : undefined;
    if (kitchen?.points.length) pts.splice(0, pts.length, ...kitchen.points);
    if (!pts.length) pts.push(v(0, 0), v(10000, 8000));
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const pad = 1500;
    const scale = Math.min(W / (maxX - minX + 2 * pad), H / (maxY - minY + 2 * pad));
    setView({ scale, tx: W / 2 - ((minX + maxX) / 2) * scale, ty: H / 2 - ((minY + maxY) / 2) * scale });
  }, []);

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
      if (!fitted.current && el.clientWidth > 0) {
        fitted.current = true;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  useEffect(() => store.on('fit', fit), [fit]);

  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      setView((vw) => {
        const k = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
        const scale = Math.min(2, Math.max(0.004, vw.scale * k));
        const wx = (sx - vw.tx) / vw.scale;
        const wy = (sy - vw.ty) / vw.scale;
        return { scale, tx: sx - wx * scale, ty: sy - wy * scale };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // Reset in-progress drawing when the tool changes.
  useEffect(() => {
    setChain([]);
    setRectEnd(null);
    setTyped('');
  }, [tool]);

  // ---------- derived snapping state ----------
  const drawing = tool.kind === 'wall' || tool.kind === 'floor' || tool.kind === 'measure' || tool.kind === 'room';

  // These are computed both for rendering (from the last mouse position) and inside event handlers
  // (from the event itself) so a fast click never uses a stale position.
  const computeSnap = (p: Vec | null, free: boolean): SnapResult | null => {
    if (!p || !drawing) return null;
    return snapPoint(design, p, {
      tol,
      grid,
      free,
      anchor: chain.length ? chain[chain.length - 1] : null,
      extraPoints: tool.kind === 'floor' ? [...chain, ...design.rooms.flatMap((r) => r.points)] : chain.slice(0, 1),
    });
  };

  const ghostItemSnap = (p: Vec | null, free: boolean): { item: Item; guides: [Vec, Vec][] } | null => {
    if (tool.kind !== 'place' || !p) return null;
    const base = placementItem(tool, p.x, p.y);
    const sn = snapItem(design, base, p, { tol: tol * 1.5, grid: Math.min(grid, 50), free });
    return { item: { ...base, x: sn.x, y: sn.y, rotation: sn.rotation, id: '__ghost' }, guides: sn.guides };
  };
  const computeGhostItem = (p: Vec | null, free: boolean): Item | null => ghostItemSnap(p, free)?.item ?? null;

  const computeGhostOpening = (p: Vec | null, free: boolean): { o: Opening; wall: Wall } | null => {
    if (tool.kind !== 'opening' || !p) return null;
    const hit = nearestWall(design, p, Math.max(tol, 400));
    if (!hit) return null;
    const wall = design.walls.find((w) => w.id === hit.wallId)!;
    const o = newOpening(tool.catalogId, wall, free ? hit.along : roundTo(hit.along, 10));
    // Doors keep clear of nearby walls / furniture so they can open fully (Shift places it exactly).
    const clear = free ? null : clearOffset(design, o, wall, 400);
    return { o: { ...o, offset: clear ?? o.offset, id: '__ghost' }, wall };
  };

  const computeGhostElec = (p: Vec | null, free: boolean) => {
    if (tool.kind !== 'elec' || !p) return null;
    const prod = ELEC_MAP[tool.product];
    const at = prod && elecPlacement(design, prod, p, { tol: tol * 1.5, grid, free });
    return at ? { e: { ...newElecPoint(prod, at), id: '__ghost' }, guides: at.guides } : null;
  };

  const snap = computeSnap(mouse, mods.shift);
  const ghostItem = computeGhostItem(mouse, mods.shift);
  const ghostOpening = computeGhostOpening(mouse, mods.shift);
  const ghostElec = computeGhostElec(mouse, mods.shift);

  // ---------- drawing actions ----------
  const finishChain = () => {
    setChain([]);
    setTyped('');
  };

  const addChainPoint = (p: Vec) => {
    if (tool.kind === 'wall') {
      if (!chain.length) {
        setChain([p]);
        return;
      }
      const last = chain[chain.length - 1];
      if (dist(p, last) < 1) {
        finishChain();
        return;
      }
      addWalls([newWall(store.state.design, last, p)]);
      setTyped('');
      if (chain.length >= 2 && near(p, chain[0], 1)) finishChain();
      else setChain([...chain, p]);
    } else if (tool.kind === 'floor') {
      if (chain.length >= 3 && near(p, chain[0], tol)) {
        closeFloor(chain);
        return;
      }
      if (chain.length && near(p, chain[chain.length - 1], 1)) {
        if (chain.length >= 3) closeFloor(chain);
        return;
      }
      setChain([...chain, p]);
    } else if (tool.kind === 'measure') {
      if (!chain.length) setChain([p]);
      else {
        const a = chain[0];
        if (dist(a, p) > 1) {
          const dim: Dimension = { id: `d_${Date.now().toString(36)}`, a, b: p };
          store.update((d) => ({ ...d, dimensions: [...d.dimensions, dim] }));
        }
        setChain([]);
      }
    }
  };

  const closeFloor = (pts: Vec[]) => {
    const room = newRoom(store.state.design, pts);
    store.update((d) => ({ ...d, rooms: [...d.rooms, room] }));
    setChain([]);
    store.setTool({ kind: 'select' });
    store.select({ kind: 'room', id: room.id });
  };

  const commitTyped = () => {
    const n = parseFloat(typed);
    if (!chain.length || !(n > 0)) return;
    const last = chain[chain.length - 1];
    const target = snap?.p ?? mouse ?? add(last, v(1, 0));
    const dir = dist(target, last) > 1 ? norm(sub(target, last)) : v(1, 0);
    const p = add(last, mul(dir, n));
    addChainPoint({ x: Math.round(p.x), y: Math.round(p.y) });
  };

  // ---------- keyboard (drawing-specific; captured before the global handler) ----------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || e.key === 'Alt') setMods({ shift: e.shiftKey, alt: e.altKey });
      if (isTyping(e.target)) return;
      if (store.state.walking) return;
      if (e.code === 'Space') {
        spaceDown.current = true;
        e.preventDefault();
        return;
      }
      const consume = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (e.key === 'Escape' && (chain.length || dragRef.current?.drag.kind === 'rect')) {
        finishChain();
        dragRef.current = null;
        setDragKind(null);
        setRectEnd(null);
        consume();
      } else if (e.key === 'Enter' && chain.length) {
        if (typed) commitTyped();
        else if (tool.kind === 'floor' && chain.length >= 3) closeFloor(chain);
        else finishChain();
        consume();
      } else if (chain.length && tool.kind === 'wall' && /^[0-9.]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
        setTyped((t) => t + e.key);
        consume();
      } else if (e.key === 'Backspace' && typed) {
        setTyped((t) => t.slice(0, -1));
        consume();
      } else if (e.key === 'Backspace' && chain.length > 1 && tool.kind === 'floor') {
        setChain((c) => c.slice(0, -1));
        consume();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
      if (e.key === 'Shift' || e.key === 'Alt') setMods({ shift: e.shiftKey, alt: e.altKey });
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up);
    };
  });

  // ---------- pointer handling ----------
  const beginDrag = (e: RPointerEvent, drag: Drag) => {
    dragRef.current = { drag, downX: e.clientX, downY: e.clientY, active: drag.kind === 'pan', recorded: false };
    setDragKind(drag.kind);
    try {
      svgRef.current!.setPointerCapture(e.pointerId);
    } catch {
      // The pointer may already be gone (a very quick tap); the drag still works without capture.
    }
  };

  const applyDrag = (fn: (d: Design) => Design) => {
    const ds = dragRef.current!;
    if (!ds.recorded) {
      store.checkpoint();
      ds.recorded = true;
    }
    store.update(fn, false);
  };

  /** Two fingers down: zoom and pan the plan (dropping whatever the first finger had started). */
  const startPinch = () => {
    const ds = dragRef.current;
    if (ds?.recorded) store.undo(); // the first finger may have started moving something
    dragRef.current = null;
    setDragKind(null);
    setItemGuides([]);
    pendingTap.current = null;
    const [a, b] = [...touches.current.values()];
    const r = svgRef.current!.getBoundingClientRect();
    pinch.current = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), view: viewRef.current, mid: v((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top) };
  };

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size >= 2) {
        startPinch();
        return;
      }
      // Drawing and placing tools: a tap acts (on lift), a drag pans, so pinching never drops a point by mistake.
      if (tool.kind !== 'select' && tool.kind !== 'room') {
        pendingTap.current = { id: e.pointerId, ev: { ...e, clientX: e.clientX, clientY: e.clientY, target: e.target, button: 0, pointerType: 'tap', preventDefault: () => {} } as unknown as RPointerEvent<SVGSVGElement> };
        const vw = viewRef.current;
        beginDrag(e, { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: vw.tx, ty: vw.ty });
        if (dragRef.current) dragRef.current.active = false; // it only pans once the finger moves
        setMouse(toWorld(e.clientX, e.clientY));
        return;
      }
    }
    setMods({ shift: e.shiftKey, alt: e.altKey });
    const p = toWorld(e.clientX, e.clientY);
    const vw = viewRef.current;
    if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
      e.preventDefault();
      beginDrag(e, { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: vw.tx, ty: vw.ty });
      return;
    }
    if (e.button === 2) {
      if (chain.length) {
        if (tool.kind === 'floor' && chain.length >= 3) closeFloor(chain);
        else finishChain();
      } else if (tool.kind !== 'select') store.setTool({ kind: 'select' });
      return;
    }
    if (e.button !== 0) return;
    // Electrical page: wall lengths and gaps aren't editable, so clicks always reach the electrical tools.

    const gapEl = (e.target as Element).closest('[data-kind="gap-label"]') as SVGElement | null;
    if (gapEl && !chain.length && !electric) {
      e.preventDefault();
      const value = Number(gapEl.dataset.gap);
      setLengthEdit({
        wallId: gapEl.dataset.id!,
        at: v(Number(gapEl.dataset.x), Number(gapEl.dataset.y)),
        text: String(Math.round(value)),
        gap: { side: Number(gapEl.dataset.side) as 1 | -1, value, otherId: gapEl.dataset.other! },
      });
      return;
    }
    const igEl = (e.target as Element).closest('[data-kind="item-gap"]') as SVGElement | null;
    if (igEl && !chain.length && !electric) {
      e.preventDefault();
      setLengthEdit({
        wallId: '',
        at: v(Number(igEl.dataset.x), Number(igEl.dataset.y)),
        text: String(Math.round(Number(igEl.dataset.dist))),
        item: { id: igEl.dataset.id!, dir: v(Number(igEl.dataset.dx), Number(igEl.dataset.dy)), dist: Number(igEl.dataset.dist) },
      });
      return;
    }
    const ogEl = (e.target as Element).closest('[data-kind="opening-gap"]') as SVGElement | null;
    if (ogEl && !chain.length && !electric) {
      e.preventDefault();
      setLengthEdit({
        wallId: '',
        at: v(Number(ogEl.dataset.x), Number(ogEl.dataset.y)),
        text: String(Math.round(Number(ogEl.dataset.value))),
        opening: { id: ogEl.dataset.id!, side: ogEl.dataset.side as 'left' | 'right', face: Number(ogEl.dataset.face) },
      });
      return;
    }
    const labelEl = (e.target as Element).closest('[data-kind="wall-label"]') as SVGElement | null;
    if (labelEl && !chain.length && !electric) {
      const w = store.state.design.walls.find((x) => x.id === labelEl.dataset.id);
      if (w) {
        e.preventDefault();
        store.select({ kind: 'wall', id: w.id });
        setLengthEdit({ wallId: w.id, at: v(Number(labelEl.dataset.x), Number(labelEl.dataset.y)), text: String(Math.round(wallClearLength(w, store.state.design.walls).clear)) });
      }
      return;
    }

    setMouse(p);
    switch (tool.kind) {
      case 'wall':
      case 'floor':
      case 'measure': {
        const sn = computeSnap(p, e.shiftKey);
        if (sn) addChainPoint(sn.p);
        return;
      }
      case 'room': {
        const sn = computeSnap(p, e.shiftKey);
        if (sn) {
          beginDrag(e, { kind: 'rect', start: sn.p });
          setRectEnd(sn.p);
        }
        return;
      }
      case 'place': {
        const ghostItem = computeGhostItem(p, e.shiftKey);
        if (ghostItem) {
          const it = { ...ghostItem, id: newItem(ghostItem.type, 0, 0, 0).id };
          store.update((d) => ({ ...d, items: [...d.items, it] }));
          if (!e.ctrlKey && !e.metaKey) store.setTool({ kind: 'select' });
          store.select({ kind: 'item', id: it.id });
        }
        return;
      }
      case 'elec': {
        // Electrical points: keep placing until Esc / right-click (rooms usually need several).
        const g = computeGhostElec(p, e.shiftKey);
        if (g) {
          const pt = { ...g.e, id: uid('e') };
          store.update((d) => ({ ...d, electrical: [...d.electrical, pt] }));
        }
        return;
      }
      case 'elec-link': {
        // Click lights to add them to (or take them off) the switch's gang; click another switch to link that one.
        const el = (e.target as Element).closest('[data-kind="electric"]') as SVGElement | null;
        const hit = el && store.state.design.electrical.find((x) => x.id === el.dataset.id);
        if (!hit) {
          beginDrag(e, { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: vw.tx, ty: vw.ty });
          return;
        }
        // Fans with a light: a fan controller takes the fan, a switch or dimmer the light.
        const ctl = store.state.design.electrical.find((x) => x.id === tool.switchId);
        const ref = ctl && linkRefFor(productOf(ctl), hit);
        if (ref) toggleLink(tool.switchId, tool.gang, ref);
        else if (hit.gangs && hit.id !== tool.switchId) startLinking(hit.id, 0);
        return;
      }
      case 'opening': {
        const ghostOpening = computeGhostOpening(p, e.shiftKey);
        if (ghostOpening) {
          const o = { ...ghostOpening.o, id: newOpening(tool.catalogId, ghostOpening.wall, 0).id };
          store.update((d) => ({ ...d, openings: [...d.openings, o] }));
          if (!e.ctrlKey && !e.metaKey) store.setTool({ kind: 'select' });
          store.select({ kind: 'opening', id: o.id });
        }
        return;
      }
    }

    // Select tool
    const target = (e.target as Element).closest('[data-kind]') as SVGElement | null;
    const kind = target?.dataset.kind;
    const id = target?.dataset.id ?? '';
    const d = store.state.design;
    if (!target || !kind) {
      store.select(null);
      beginDrag(e, { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: vw.tx, ty: vw.ty });
      return;
    }
    if (kind === 'handle') {
      const h = target.dataset.handle;
      if (h === 'wall-start' || h === 'wall-end') {
        const w = d.walls.find((x) => x.id === id)!;
        const pt = h === 'wall-start' ? w.start : w.end;
        const exclude = new Set(d.walls.filter((x) => near(x.start, pt) || near(x.end, pt)).map((x) => x.id));
        beginDrag(e, { kind: 'wall-end', id, which: h === 'wall-start' ? 'start' : 'end', orig: d, exclude });
      } else if (h === 'item-rotate') beginDrag(e, { kind: 'item-rotate', id });
      else if (h === 'item-resize') beginDrag(e, { kind: 'item-resize', id, orig: d.items.find((i) => i.id === id)! });
      else if (h === 'room-vertex') beginDrag(e, { kind: 'room-vertex', id, index: Number(target.dataset.index) });
      else if (h === 'roof-pull' && roofRes && !('error' in roofRes) && d.roof) {
        const edge = roofRes.outline[Number(target.dataset.index)];
        if (edge) beginDrag(e, { kind: 'roof-pull', edge, overhang: Math.max(0, d.roof.overhang), extId: null });
      } else if (h === 'roof-ext-side') {
        const ex = d.roof?.extensions?.find((x) => x.id === id);
        if (ex) beginDrag(e, { kind: 'roof-ext-side', id, side: Number(target.dataset.side), orig: ex });
      }
      return;
    }
    if (kind === 'roof-ext') {
      const ex = d.roof?.extensions?.find((x) => x.id === id);
      store.select({ kind: 'roof', id });
      if (ex) beginDrag(e, { kind: 'roof-ext', id, start: p, orig: ex });
      return;
    }
    if (kind === 'electric') {
      const el = d.electrical.find((x) => x.id === id)!;
      store.select({ kind: 'electric', id });
      // Light spread demo: clicking a switch flicks it.
      if (store.state.lightDemo && el.gangs) {
        flickSwitch(el);
        return;
      }
      beginDrag(e, { kind: 'elec', id, off: sub(p, v(el.x, el.y)) });
      return;
    }
    if (kind === 'item') {
      const it = d.items.find((i) => i.id === id)!;
      store.select({ kind: 'item', id });
      beginDrag(e, { kind: 'item', id, off: sub(p, v(it.x, it.y)) });
    } else if (kind === 'wall') {
      const w = d.walls.find((x) => x.id === id)!;
      store.select({ kind: 'wall', id });
      beginDrag(e, { kind: 'wall', id, start: p, orig: d, pts: wallMovePoints(d, w) });
    } else if (kind === 'opening') {
      store.select({ kind: 'opening', id });
      beginDrag(e, { kind: 'opening', id });
    } else if (kind === 'room') {
      // Floors cover most of the plan, so only drag a room once it is already selected; otherwise pan.
      if (isSel('room', id)) beginDrag(e, { kind: 'room', id, start: p, orig: d.rooms.find((r) => r.id === id)! });
      else {
        store.select({ kind: 'room', id });
        beginDrag(e, { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: vw.tx, ty: vw.ty });
      }
    } else if (kind === 'dimension') {
      store.select({ kind: 'dimension', id });
      beginDrag(e, { kind: 'dimension', id, start: p, orig: d.dimensions.find((m) => m.id === id)! });
    }
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pz = pinch.current;
      if (pz && touches.current.size >= 2) {
        const [a, b] = [...touches.current.values()];
        const r = svgRef.current!.getBoundingClientRect();
        const mid = v((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        const scale = Math.min(2, Math.max(0.004, (pz.view.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pz.d0));
        // Keep the plan point that was under the fingers' midpoint under it (zoom + pan together).
        const wx = (pz.mid.x - pz.view.tx) / pz.view.scale;
        const wy = (pz.mid.y - pz.view.ty) / pz.view.scale;
        setView({ scale, tx: mid.x - wx * scale, ty: mid.y - wy * scale });
        return;
      }
    }
    const p = toWorld(e.clientX, e.clientY);
    setMouse(p);
    if (e.shiftKey !== mods.shift || e.altKey !== mods.alt) setMods({ shift: e.shiftKey, alt: e.altKey });
    const ds = dragRef.current;
    if (!ds) return;
    if (!ds.active) {
      if (Math.hypot(e.clientX - ds.downX, e.clientY - ds.downY) < 4) return;
      ds.active = true;
    }
    const free = e.shiftKey;
    const drag = ds.drag;
    const d = store.state.design;
    switch (drag.kind) {
      case 'pan':
        setView((vw) => ({ ...vw, tx: drag.tx + e.clientX - drag.sx, ty: drag.ty + e.clientY - drag.sy }));
        break;
      case 'rect':
        setRectEnd(snapPoint(d, p, { tol, grid, free }).p);
        break;
      case 'item': {
        const it = d.items.find((i) => i.id === drag.id);
        if (!it) break;
        const s = snapItem(d, it, sub(p, drag.off), { tol: tol * 1.5, grid: Math.min(grid, 50), free: free || e.altKey });
        setItemGuides(s.guides);
        applyDrag((dd) => ({ ...dd, items: dd.items.map((i) => (i.id === drag.id ? { ...i, x: s.x, y: s.y, rotation: s.rotation } : i)) }));
        break;
      }
      case 'elec': {
        const el = d.electrical.find((x) => x.id === drag.id);
        if (!el) break;
        const at = elecPlacement(d, productOf(el), sub(p, drag.off), { tol: tol * 1.5, grid, free, exclude: el.id });
        if (!at) break; // wall-mounted: stays put until the cursor is near a wall
        setItemGuides(at.guides);
        applyDrag((dd) => ({ ...dd, electrical: dd.electrical.map((x) => (x.id === drag.id ? { ...x, x: at.x, y: at.y, rotation: at.rotation } : x)) }));
        break;
      }
      case 'item-rotate': {
        const it = d.items.find((i) => i.id === drag.id);
        if (!it) break;
        let a = deg(Math.atan2(p.y - it.y, p.x - it.x)) + 90;
        a = free ? Math.round(a) : roundTo(a, 15);
        applyDrag((dd) => ({ ...dd, items: dd.items.map((i) => (i.id === drag.id ? { ...i, rotation: normAngle(a) } : i)) }));
        break;
      }
      case 'item-resize': {
        const it = drag.orig;
        const r = rad(it.rotation);
        const c = v(it.x, it.y);
        const lc = rot(sub(p, c), -r);
        const o = v(-it.width / 2, -it.depth / 2);
        const step = free ? 1 : 10;
        const w = Math.max(50, roundTo(lc.x - o.x, step));
        const dp = Math.max(10, roundTo(lc.y - o.y, step));
        const nc = add(c, rot(add(o, v(w / 2, dp / 2)), r));
        applyDrag((dd) => ({
          ...dd,
          items: dd.items.map((i) => (i.id === drag.id ? { ...i, width: w, depth: dp, x: Math.round(nc.x), y: Math.round(nc.y) } : i)),
        }));
        break;
      }
      case 'wall': {
        let delta = sub(p, drag.start);
        if (!free) delta = v(roundTo(delta.x, grid), roundTo(delta.y, grid));
        applyDrag(() => moveWallPoints(drag.orig, drag.pts, delta));
        break;
      }
      case 'wall-end': {
        const w = drag.orig.walls.find((x) => x.id === drag.id)!;
        const from = drag.which === 'start' ? w.start : w.end;
        const anchor = drag.which === 'start' ? w.end : w.start;
        const s = snapPoint(drag.orig, p, { tol, grid, free, anchor, excludeWalls: drag.exclude });
        applyDrag(() => moveWallPoints(drag.orig, [from], sub(s.p, from)));
        break;
      }
      case 'opening': {
        const hit = nearestWall(d, p, Math.max(tol, 600));
        if (!hit) break;
        const wall = d.walls.find((w) => w.id === hit.wallId)!;
        applyDrag((dd) => ({
          ...dd,
          openings: dd.openings.map((o) =>
            o.id === drag.id
              ? {
                  ...o,
                  wallId: wall.id,
                  offset: clampOpeningOffset({ ...o, offset: free ? hit.along : roundTo(hit.along, 10) }, hit.length),
                  height: Math.min(o.height, wall.height - o.sill),
                }
              : o,
          ),
        }));
        break;
      }
      case 'room': {
        let delta = sub(p, drag.start);
        if (!free) delta = v(roundTo(delta.x, grid), roundTo(delta.y, grid));
        applyDrag((dd) => ({
          ...dd,
          rooms: dd.rooms.map((r) => (r.id === drag.id ? { ...r, points: drag.orig.points.map((q) => add(q, delta)) } : r)),
        }));
        break;
      }
      case 'room-vertex': {
        const others = d.rooms.flatMap((r) => (r.id === drag.id ? r.points.filter((_, i) => i !== drag.index) : r.points));
        const s = snapPoint(d, p, { tol, grid, free, extraPoints: others });
        applyDrag((dd) => ({
          ...dd,
          rooms: dd.rooms.map((r) => (r.id === drag.id ? { ...r, points: r.points.map((q, i) => (i === drag.index ? s.p : q)) } : r)),
        }));
        break;
      }
      case 'roof-pull': {
        const { a, b, n } = drag.edge;
        // The cursor marks where the new eave goes; the covered area stops an overhang short of it.
        const out = Math.max(300, roundTo(dot(sub(p, a), n) - drag.overhang, free ? 1 : 50));
        const len = dist(a, b);
        const ex: RoofExtension = {
          id: drag.extId ?? uid('rx'),
          ...add(mul(add(a, b), 0.5), mul(n, out / 2)),
          width: Math.round(len),
          depth: Math.round(out),
          rotation: normAngle(deg(Math.atan2(b.y - a.y, b.x - a.x))),
        };
        if (!drag.extId) {
          drag.extId = ex.id;
          applyDrag((dd) => (dd.roof ? { ...dd, roof: { ...dd.roof, extensions: [...(dd.roof.extensions ?? []), ex] } } : dd));
          store.select({ kind: 'roof', id: ex.id });
        } else applyDrag((dd) => withExtension(dd, ex.id, () => ex));
        break;
      }
      case 'roof-ext': {
        let delta = sub(p, drag.start);
        if (!free) delta = v(roundTo(delta.x, grid), roundTo(delta.y, grid));
        applyDrag((dd) => withExtension(dd, drag.id, (ex) => ({ ...ex, x: Math.round(drag.orig.x + delta.x), y: Math.round(drag.orig.y + delta.y) })));
        break;
      }
      case 'roof-ext-side': {
        const ex = drag.orig;
        const r = rad(ex.rotation);
        const lc = rot(sub(p, v(ex.x, ex.y)), -r);
        const step = free ? 1 : 50;
        // Sides: 0 = +x, 1 = −x, 2 = +y, 3 = −y (in the extension's own frame). The opposite side stays put.
        let [x0, x1, y0, y1] = [-ex.width / 2, ex.width / 2, -ex.depth / 2, ex.depth / 2];
        if (drag.side === 0) x1 = Math.max(x0 + 300, x0 + roundTo(lc.x - x0, step));
        if (drag.side === 1) x0 = Math.min(x1 - 300, x1 - roundTo(x1 - lc.x, step));
        if (drag.side === 2) y1 = Math.max(y0 + 300, y0 + roundTo(lc.y - y0, step));
        if (drag.side === 3) y0 = Math.min(y1 - 300, y1 - roundTo(y1 - lc.y, step));
        const c = add(v(ex.x, ex.y), rot(v((x0 + x1) / 2, (y0 + y1) / 2), r));
        applyDrag((dd) => withExtension(dd, drag.id, (e2) => ({ ...e2, x: Math.round(c.x), y: Math.round(c.y), width: Math.round(x1 - x0), depth: Math.round(y1 - y0) })));
        break;
      }
      case 'dimension': {
        let delta = sub(p, drag.start);
        if (!free) delta = v(roundTo(delta.x, grid), roundTo(delta.y, grid));
        applyDrag((dd) => ({
          ...dd,
          dimensions: dd.dimensions.map((m) => (m.id === drag.id ? { ...m, a: add(drag.orig.a, delta), b: add(drag.orig.b, delta) } : m)),
        }));
        break;
      }
    }
  };

  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'touch') {
      touches.current.delete(e.pointerId);
      if (pinch.current) {
        if (touches.current.size < 2) pinch.current = null;
        dragRef.current = null;
        setDragKind(null);
        return;
      }
      // A tap with a drawing / placing tool (the finger didn't move far enough to pan): act on it now.
      const tap = pendingTap.current;
      pendingTap.current = null;
      if (tap && tap.id === e.pointerId && !dragRef.current?.active) {
        dragRef.current = null;
        setDragKind(null);
        onPointerDown(tap.ev);
        return;
      }
    }
    const ds = dragRef.current;
    dragRef.current = null;
    setDragKind(null);
    setItemGuides([]);
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    if (!ds) return;
    if (ds.drag.kind === 'rect') {
      const a = ds.drag.start;
      const b = rectEnd ?? a;
      setRectEnd(null);
      if (Math.abs(b.x - a.x) >= 300 && Math.abs(b.y - a.y) >= 300) {
        const d = store.state.design;
        const c = [a, v(b.x, a.y), b, v(a.x, b.y)];
        // Only draw the wall segments that don't already exist (no doubled-up walls over doorways).
        const walls = c.flatMap((p, i) => uncoveredParts(d.walls, p, c[(i + 1) % 4]).map(([s, e]) => newWall(d, s, e)));
        const room = newRoom(d, c);
        addWalls(walls, [room]);
        store.setTool({ kind: 'select' });
        store.select({ kind: 'room', id: room.id });
      }
    }
  };

  // ---------- rendering ----------
  const s = view.scale;
  const px = (n: number) => n / s; // screen px -> mm
  const fs = px(11);

  const visible = {
    x0: -view.tx / s,
    y0: -view.ty / s,
    x1: (size.w - view.tx) / s,
    y1: (size.h - view.ty) / s,
  };
  let minor = 100;
  while (minor * s < 8) minor *= minor === 100 || minor === 1000 ? 5 : 2;
  const major = minor * (minor === 500 || minor === 5000 ? 2 : 10);

  const isSel = (kind: string, id: string) => selection?.kind === kind && selection.id === id;

  const allOpenings = useMemo(() => effectiveOpenings(design.walls, design.openings), [design.walls, design.openings]);
  const outsideStrings = useMemo(() => (design.settings.showOutsideDims ? outsideDimensions(design) : []), [design]);
  const wallEls: ReactNode[] = [];
  const wallLabels: ReactNode[] = [];
  const planCentre = useMemo(() => {
    const pts = design.walls.flatMap((w) => [w.start, w.end]);
    if (!pts.length) return v(0, 0);
    return mul(pts.reduce((a, p) => add(a, p), v(0, 0)), 1 / pts.length);
  }, [design.walls]);
  for (const w of design.walls) {
    const f = wallFrame(w);
    const { e0, e1 } = wallExtensions(w, design.walls);
    const { solid } = wallSpans(w, allOpenings, e0, e1);
    const ht = w.thickness / 2;
    const poly = (a: number, b: number) => {
      const p1 = add(w.start, mul(f.u, a));
      const p2 = add(w.start, mul(f.u, b));
      return [add(p1, mul(f.n, ht)), add(p2, mul(f.n, ht)), add(p2, mul(f.n, -ht)), add(p1, mul(f.n, -ht))]
        .map((q) => `${q.x},${q.y}`)
        .join(' ');
    };
    const sel = isSel('wall', w.id);
    wallEls.push(
      <g key={w.id} data-kind="wall" data-id={w.id} className={sel ? 'wall selected' : 'wall'}>
        <polygon points={poly(-e0, f.length + e1)} className="wall-hit" />
        {solid.map(([a, b], i) => (
          <polygon key={i} points={poly(a, b)} />
        ))}
        {cavityStrips(w, solid, e0, e1)}
      </g>,
    );
    const mid = add(w.start, mul(f.u, f.length / 2));
    // Which sides of the wall have a room against them.
    const roomOn = (sd: number) => design.rooms.some((r) => pointInPolygon(add(mid, mul(f.n, sd * (ht + 150))), r.points));
    const showRooms = design.settings.showRoomDimensions && !!design.settings.showRoomSides;
    const interior = showRooms && roomOn(1) && roomOn(-1);
    // Outside dimension strings measure the outside walls, so their own length labels would only repeat them.
    const outsideWall = design.settings.showOutsideDims && (exteriorSides(design.walls).map.get(w.id)?.pos || exteriorSides(design.walls).map.get(w.id)?.neg);
    if (design.settings.showDimensions && f.length * s > 40 && !outsideWall) {
      let pos: Vec;
      if (interior) {
        // Inside walls (rooms on both sides): label sits on the wall itself, so it never collides with the
        // room measurements drawn just inside each room. Centre it on the longest solid stretch (not a door).
        const { solid } = wallSpans(w, design.openings, 0, 0);
        const [sa, sb] = solid.reduce((best, sp) => (sp[1] - sp[0] > best[1] - best[0] ? sp : best), [0, 0] as [number, number]);
        pos = add(w.start, mul(f.u, sb - sa > 1 ? (sa + sb) / 2 : f.length / 2));
      } else {
        // Put the label outside: on the side without a room, else away from the middle of the plan.
        const away = dist(add(mid, f.n), planCentre) >= dist(sub(mid, f.n), planCentre) ? 1 : -1;
        const side = showRooms && roomOn(1) !== roomOn(-1) ? (roomOn(1) ? -1 : 1) : away;
        pos = add(mid, mul(f.n, side * (ht + px(10))));
      }
      let a = deg(f.angle);
      if (a > 90.01 || a < -89.99) a += 180;
      // Clear length: not counting the part that runs into the walls this one joins.
      const label = formatMm(wallClearLength(w, design.walls).clear);
      const lw = label.length * fs * 0.62 + px(8);
      wallLabels.push(
        <g
          key={w.id}
          className={`wall-label${interior ? ' on-wall' : ''}${lengthEdit?.wallId === w.id ? ' editing' : ''}`}
          data-kind="wall-label"
          data-id={w.id}
          data-x={pos.x}
          data-y={pos.y}
          transform={`rotate(${a} ${pos.x} ${pos.y})`}
        >
          <title>Click to change the wall length</title>
          <rect x={pos.x - lw / 2} y={pos.y - fs * 0.75} width={lw} height={fs * 1.5} rx={px(3)} />
          <text x={pos.x} y={pos.y} fontSize={fs} dominantBaseline="middle" textAnchor="middle">
            {label}
          </text>
        </g>,
      );
    }
  }

  /** Brick veneer / double brick: show the cavity as a light strip behind the outer brick skin. */
  function cavityStrips(w: Wall, solid: [number, number][], e0: number, e1: number): ReactNode {
    if (!w.construction) return null;
    const layers = CONSTRUCTIONS[w.construction].layers;
    const ci = layers.findIndex(([n]) => n === 'Cavity');
    if (ci < 0) return null;
    const sd = exteriorSides(design.walls).map.get(w.id);
    if (!sd || sd.pos === sd.neg) return null;
    const side = sd.pos ? 1 : -1;
    const f = wallFrame(w);
    const ht = w.thickness / 2;
    const outer = layers.slice(0, ci).reduce((s2, [, t]) => s2 + t, 0); // brick skin thickness
    const cav = layers[ci][1];
    const o1 = side * (ht - outer);
    const o2 = side * (ht - outer - cav);
    return solid.map(([a, b], i) => {
      // At corners, stop where the neighbouring wall's cavity is, so the cavity turns the corner.
      const aa = a <= -e0 + 0.5 && e0 > outer ? -(e0 - outer) : a;
      const bb = b >= f.length + e1 - 0.5 && e1 > outer ? f.length + (e1 - outer) : b;
      const p1 = add(w.start, mul(f.u, aa));
      const p2 = add(w.start, mul(f.u, bb));
      const pts = [add(p1, mul(f.n, o1)), add(p2, mul(f.n, o1)), add(p2, mul(f.n, o2)), add(p1, mul(f.n, o2))];
      return <polygon key={`cav${i}`} points={pts.map((q) => `${q.x},${q.y}`).join(' ')} className="cavity" />;
    });
  }

  const renderOpening = (o: Opening, w: Wall, ghost = false) => {
    const f = wallFrame(w);
    const c = clampOpeningOffset(o, f.length);
    const pos = add(w.start, mul(f.u, c));
    const t = w.thickness;
    const hw = o.width / 2;
    const ht = t / 2;
    const sgn = o.flip ? -1 : 1;
    const parts: ReactNode[] = [];
    // Can each leaf open to 90° without it or its handle hitting a wall or furniture?
    const checks = o.kind === 'door' || o.kind === 'double_door' ? checkDoor(design, o, w, o.offset, MIN_OPEN) : [];
    let leafNo = 0;
    const leaf = (hx: number, dir: number, lw: number, key: string) => {
      const tip = { x: hx, y: sgn * (ht + lw) };
      const closed = { x: hx + dir * lw, y: sgn * ht };
      const sweep = dir * sgn > 0 ? 1 : 0;
      const chk = checks[leafNo++];
      const blocked = !!chk && chk.maxAngle < MIN_OPEN;
      const hitAt = blocked && chk.hit ? { x: dot(sub(chk.hit.at, pos), f.u), y: dot(sub(chk.hit.at, pos), f.n) } : null;
      parts.push(
        <g key={key} className={blocked ? 'door-blocked' : undefined}>
          {blocked && <title>{`Can only open ${chk.maxAngle}° — the ${chk.hit?.part ?? 'door'} hits ${chk.hit?.what ?? 'something'}`}</title>}
          <line x1={hx} y1={sgn * ht} x2={tip.x} y2={tip.y} className="door-leaf" />
          <path d={`M${closed.x} ${closed.y} A${lw} ${lw} 0 0 ${sweep} ${tip.x} ${tip.y}`} className="door-arc" />
          {hitAt && <path d={`M${hitAt.x - 60} ${hitAt.y - 60} L${hitAt.x + 60} ${hitAt.y + 60} M${hitAt.x + 60} ${hitAt.y - 60} L${hitAt.x - 60} ${hitAt.y + 60}`} className="door-hit" />}
        </g>,
      );
    };
    switch (o.kind) {
      case 'door': {
        const sl = sidelights(o);
        const x0 = -hw + sl.left;
        const x1 = hw - sl.right;
        leaf(o.hingeEnd ? x1 : x0, o.hingeEnd ? -1 : 1, x1 - x0, 'l');
        // Sidelights: fixed glass panels either side, drawn like a window.
        for (const [a, b] of [
          [-hw, x0],
          [x1, hw],
        ] as const)
          if (b - a > 1)
            parts.push(
              <g key={`sl${a}`}>
                <rect x={a} y={-ht} width={b - a} height={t} className="window-frame" />
                <line x1={a} y1={0} x2={b} y2={0} className="window-glass" />
              </g>,
            );
        break;
      }
      case 'double_door':
        leaf(-hw, 1, hw, 'l1');
        leaf(hw, -1, hw, 'l2');
        break;
      case 'sliding_door':
        parts.push(
          <g key="s" className="glass">
            <rect x={-hw} y={-ht * 0.4} width={o.width * 0.52} height={ht * 0.35} />
            <rect x={hw - o.width * 0.52} y={ht * 0.05} width={o.width * 0.52} height={ht * 0.35} />
          </g>,
        );
        break;
      case 'stacker_door': {
        // One thin panel per track, staggered across the wall, plus an arrow towards the stacking end.
        const lay = stackerLayout(o);
        const band = (ht * 0.8) / lay.n;
        const ay = ht + 110;
        const tip = lay.dir * (hw - 60);
        parts.push(
          <g key="st" className="glass">
            {lay.panels.map((p) => (
              <rect key={p.track} x={p.closed - lay.pw / 2} y={-ht * 0.4 + p.track * band} width={lay.pw} height={band * 0.8} />
            ))}
          </g>,
          <path key="sta" d={`M${-tip} ${ay} L${tip} ${ay} M${tip - lay.dir * 90} ${ay - 50} L${tip} ${ay} L${tip - lay.dir * 90} ${ay + 50}`} className="door-leaf dashed" />,
        );
        break;
      }
      case 'cavity_door': {
        const dir = o.hingeEnd ? 1 : -1;
        parts.push(
          <g key="c">
            <rect x={dir < 0 ? -hw - o.width : hw} y={-ht * 0.25} width={o.width} height={ht * 0.5} className="pocket" />
            <line x1={-hw} y1={0} x2={hw} y2={0} className="door-leaf dashed" />
          </g>,
        );
        break;
      }
      case 'garage_door': {
        // Which side is inside the garage (opposite the outside face).
        const sd = exteriorSides(design.walls).map.get(w.id);
        const inSide = sd?.pos ? -1 : sd?.neg ? 1 : o.flip ? 1 : -1;
        const style = o.style ?? 'sectional';
        parts.push(<line key="g" x1={-hw} y1={-inSide * ht * 0.4} x2={hw} y2={-inSide * ht * 0.4} className="door-leaf" />);
        if (style === 'roller')
          parts.push(<rect key="hood" x={-hw} y={inSide > 0 ? ht : -ht - 450} width={o.width} height={450} className="garage-track" />);
        else {
          // Sectional / tilt doors run back along ceiling tracks inside the garage.
          const depth = Math.min(o.height + 300, 3000);
          parts.push(<rect key="track" x={-hw} y={inSide > 0 ? ht : -ht - depth} width={o.width} height={depth} className="garage-track" />);
        }
        break;
      }
      case 'window':
        parts.push(
          <g key="w">
            <rect x={-hw} y={-ht} width={o.width} height={t} className="window-frame" />
            <line x1={-hw} y1={0} x2={hw} y2={0} className="window-glass" />
          </g>,
        );
        break;
      case 'opening':
        break;
    }
    // Curtains / blinds on the inside face: a line for blinds, a wavy line for curtains.
    if (o.dressing) {
      const s = dressingSide(o, exteriorSides(design.walls).map.get(w.id));
      const dr = o.dressing;
      if (dr.type === 'roller' || dr.type === 'roman' || dr.type === 'venetian')
        parts.push(<line key="dr" x1={-hw - 30} y1={s * (ht + 45)} x2={hw + 30} y2={s * (ht + 45)} className="dressing blind" />);
      else {
        const L = o.width / 2 + Math.min(300, Math.max(150, o.width * 0.15));
        const y = s * (ht + 110);
        const wave = (a: number, b: number) => {
          let d = `M${a} ${y}`;
          for (let x = a; x < b - 1; x += 60) d += ` q15 ${s * 22} 30 0 t30 0`;
          return d;
        };
        const span = L * (1 - Math.max(0, Math.min(1, dr.open)) * 0.85);
        parts.push(<path key="dr1" d={wave(-L, -L + span)} className="dressing curtain" />, <path key="dr2" d={wave(L - span, L)} className="dressing curtain" />);
        if (dr.type === 'sheer_blockout') parts.push(<line key="dr3" x1={-L} y1={s * (ht + 70)} x2={L} y2={s * (ht + 70)} className="dressing sheer" />);
      }
    }
    return (
      <g
        key={ghost ? 'ghost-opening' : o.id}
        transform={`translate(${pos.x} ${pos.y}) rotate(${deg(f.angle)})`}
        data-kind={ghost ? undefined : 'opening'}
        data-id={o.id}
        className={`opening${isSel('opening', o.id) ? ' selected' : ''}${ghost ? ' ghost' : ''}`}
      >
        <rect x={-hw} y={-ht} width={o.width} height={t} className="opening-hit" />
        <line x1={-hw} y1={-ht} x2={-hw} y2={ht} className="jamb" />
        <line x1={hw} y1={-ht} x2={hw} y2={ht} className="jamb" />
        {parts}
      </g>
    );
  };

  const renderItem = (it: Item, ghost = false) => {
    const sel = isSel('item', it.id);
    return (
      <g
        key={ghost ? 'ghost-item' : it.id}
        transform={`translate(${it.x} ${it.y}) rotate(${it.rotation})`}
        data-kind={ghost ? undefined : 'item'}
        data-id={it.id}
        className={`item${sel ? ' selected' : ''}${ghost ? ' ghost' : ''}${it.elevation > 0 ? ' raised' : ''} t-${it.type}`}
      >
        <title>{`${it.name} — ${it.width} × ${it.depth} × ${it.height} mm`}</title>
        {itemOutline(it.type, it.width, it.depth, it.options)}
        <g className="sym">{itemSymbol(it.type, it.width, it.depth, it.options)}</g>
      </g>
    );
  };

  const wallsById = useMemo(() => new Map(design.walls.map((w) => [w.id, w])), [design.walls]);
  // Door stops: where each hinged door's stop sits (on the floor, or sticking out of a wall).
  const doorStops = useMemo(() => {
    const sides = exteriorSides(design.walls).map;
    return design.openings
      .filter((o) => o.kind === 'door' || o.kind === 'double_door')
      .flatMap((o) => {
        const w = wallsById.get(o.wallId);
        const sd = sides.get(o.wallId);
        const shown = effectiveDoor(o, design, !(sd?.pos || sd?.neg)); // interior doors may use the house door stop
        if (!w || !shown.doorStop || shown.doorStop.mount === 'none') return [];
        return doorStopLayout(design, shown, w).flatMap((l, i) => (l.stop ? [{ key: `${o.id}-${i}`, id: o.id, stop: l.stop }] : []));
      });
  }, [design, wallsById]);
  const itemsSorted = useMemo(
    () => [...design.items].sort((a, b) => (a.type === 'rug' ? -1 : 0) - (b.type === 'rug' ? -1 : 0) || a.elevation - b.elevation),
    [design.items],
  );

  const dimLine = (a: Vec, b: Vec, key: string, extra?: { id?: string; selected?: boolean; preview?: boolean }) => {
    const L = dist(a, b);
    const u = L > 0 ? norm(sub(b, a)) : v(1, 0);
    const n = v(-u.y, u.x);
    const tick = px(5);
    const mid = mul(add(a, b), 0.5);
    let ang = deg(Math.atan2(u.y, u.x));
    if (ang > 90.01 || ang < -89.99) ang += 180;
    const tp = add(mid, mul(n, -px(8)));
    return (
      <g key={key} className={`dim${extra?.selected ? ' selected' : ''}${extra?.preview ? ' preview' : ''}`} data-kind={extra?.id ? 'dimension' : undefined} data-id={extra?.id}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="dim-hit" />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        {[a, b].map((p, i) => (
          <line key={i} x1={p.x + (n.x - u.x) * tick} y1={p.y + (n.y - u.y) * tick} x2={p.x - (n.x - u.x) * tick} y2={p.y - (n.y - u.y) * tick} />
        ))}
        <text x={tp.x} y={tp.y} fontSize={fs} textAnchor="middle" transform={`rotate(${ang} ${tp.x} ${tp.y})`} className="dim-text">
          {formatMm(L)}
        </text>
      </g>
    );
  };

  // Internal room measurements: clear length of each side between wall faces, drawn just inside the room.
  const roomDims: ReactNode[] = [];
  if (design.settings.showRoomDimensions && design.settings.showRoomSides)
    for (const r of design.rooms) {
      const ri = roomInterior(r.points, design.walls);
      if (!ri) continue;
      ri.edges.forEach((e, i) => {
        if (e.length * s < 60) return;
        const u = norm(sub(e.b, e.a));
        const lineOff = mul(e.n, px(13));
        const a = add(e.a, lineOff);
        const b = add(e.b, lineOff);
        const tick = px(4);
        const mid = add(mul(add(e.a, e.b), 0.5), lineOff);
        let ang = deg(Math.atan2(u.y, u.x));
        if (ang > 90.01 || ang < -89.99) ang += 180;
        roomDims.push(
          <g key={`${r.id}-${i}`} className="room-dim">
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            {[a, b].map((p, k) => (
              <line key={k} x1={p.x + (e.n.x - u.x) * tick} y1={p.y + (e.n.y - u.y) * tick} x2={p.x - (e.n.x - u.x) * tick} y2={p.y - (e.n.y - u.y) * tick} />
            ))}
            <text x={mid.x} y={mid.y} fontSize={px(10.5)} strokeWidth={px(4)} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${ang} ${mid.x} ${mid.y})`}>
              {formatMm(e.length)}
            </text>
          </g>,
        );
      });
    }

  // Distances from a door/window to the walls either side, while placing it or when it's selected.
  const openingGapEls: ReactNode[] = [];
  const sideTarget = ghostOpening
    ? { o: ghostOpening.o, wall: ghostOpening.wall, ghost: true }
    : selection?.kind === 'opening'
      ? (() => {
          const o = design.openings.find((x) => x.id === selection.id);
          const wall = o && wallsById.get(o.wallId);
          return o && wall ? { o, wall, ghost: false } : null;
        })()
      : null;
  if (sideTarget) {
    const { o, wall, ghost } = sideTarget;
    const f = wallFrame(wall);
    const g = openingSideGaps(o, wall, design.walls, design.openings);
    const mid = add(wall.start, mul(f.u, f.length / 2));
    // Draw on the side facing the middle of the plan (usually inside the room).
    const side = dist(add(mid, f.n), planCentre) <= dist(sub(mid, f.n), planCentre) ? 1 : -1;
    const off = mul(f.n, side * (wall.thickness / 2 + px(16)));
    const at = (along: number) => add(add(wall.start, mul(f.u, along)), off);
    let ang = deg(f.angle);
    if (ang > 90.01 || ang < -89.99) ang += 180;
    for (const [key, from, to, face, next] of [
      ['left', g.leftFace, g.a, g.leftFace, g.leftTo],
      ['right', g.b, g.rightFace, g.rightFace, g.rightTo],
    ] as const) {
      const value = to - from;
      if (value < 0.5) continue;
      const p1 = at(from);
      const p2 = at(to);
      const m = mul(add(p1, p2), 0.5);
      const label = formatMm(value);
      const lw = label.length * fs * 0.62 + px(10);
      const tick = px(5);
      const editing = lengthEdit?.opening && lengthEdit.opening.id === o.id && lengthEdit.opening.side === key;
      openingGapEls.push(
        <g key={key} className={`opening-gap${ghost ? ' ghost-gap' : ''}`}>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />
          {[p1, p2].map((p, i) => (
            <line key={i} x1={p.x - f.n.x * tick} y1={p.y - f.n.y * tick} x2={p.x + f.n.x * tick} y2={p.y + f.n.y * tick} />
          ))}
          <g
            className={`gap-label${editing ? ' editing' : ''}`}
            data-kind={ghost ? undefined : 'opening-gap'}
            data-id={o.id}
            data-side={key}
            data-face={face}
            data-value={value}
            data-x={m.x}
            data-y={m.y}
            transform={`rotate(${ang} ${m.x} ${m.y})`}
          >
            {!ghost && <title>{openingGapTitle(next)} — click to set it exactly</title>}
            <rect x={m.x - lw / 2} y={m.y - fs * 0.8} width={lw} height={fs * 1.6} rx={px(4)} />
            <text x={m.x} y={m.y} fontSize={fs} dominantBaseline="middle" textAnchor="middle">
              {label}
            </text>
          </g>
        </g>,
      );
    }
  }

  // Clearances from an item to walls / other items: while placing it, or while it's selected (and dragged).
  const itemGapEls: ReactNode[] = [];
  const gapItem = ghostItem ?? (selection?.kind === 'item' ? design.items.find((i) => i.id === selection.id) : undefined);
  if (gapItem && gapItem.type !== 'rug') {
    const ghost = gapItem === ghostItem;
    for (const cl of itemClearances(design, gapItem)) {
      const u = cl.dir;
      const n = v(-u.y, u.x);
      const tick = px(5);
      const m = mul(add(cl.origin, cl.end), 0.5);
      let ang = deg(Math.atan2(u.y, u.x));
      if (ang > 90.01 || ang < -89.99) ang += 180;
      const label = formatMm(cl.dist);
      const lw = label.length * fs * 0.62 + px(10);
      const editing = lengthEdit?.item && lengthEdit.item.id === gapItem.id && lengthEdit.item.dir.x === u.x && lengthEdit.item.dir.y === u.y;
      itemGapEls.push(
        <g key={cl.title} className={`opening-gap${ghost ? ' ghost-gap' : ''}`}>
          <line x1={cl.origin.x} y1={cl.origin.y} x2={cl.end.x} y2={cl.end.y} />
          {[cl.origin, cl.end].map((p, i) => (
            <line key={i} x1={p.x - n.x * tick} y1={p.y - n.y * tick} x2={p.x + n.x * tick} y2={p.y + n.y * tick} />
          ))}
          <g
            className={`gap-label${editing ? ' editing' : ''}`}
            data-kind={ghost ? undefined : 'item-gap'}
            data-id={gapItem.id}
            data-dx={u.x}
            data-dy={u.y}
            data-dist={cl.dist}
            data-x={m.x}
            data-y={m.y}
            transform={`rotate(${ang} ${m.x} ${m.y})`}
          >
            {!ghost && <title>{cl.title} — click to set it exactly</title>}
            <rect x={m.x - lw / 2} y={m.y - fs * 0.8} width={lw} height={fs * 1.6} rx={px(4)} />
            <text x={m.x} y={m.y} fontSize={fs} dominantBaseline="middle" textAnchor="middle">
              {label}
            </text>
          </g>
        </g>,
      );
    }
  }

  // Clear distances to the nearest parallel walls, shown while a wall is selected or being dragged
  const gapEls: ReactNode[] = [];
  if (selection?.kind === 'wall' && tool.kind === 'select') {
    const w = wallsById.get(selection.id);
    if (w)
      for (const g of wallGaps(w, design.walls)) {
        const u = norm(sub(g.b, g.a));
        const n = v(-u.y, u.x);
        const tick = px(5);
        const mid = mul(add(g.a, g.b), 0.5);
        let ang = deg(Math.atan2(u.y, u.x));
        if (ang > 90.01 || ang < -89.99) ang += 180;
        const label = formatMm(g.gap);
        const lw = label.length * fs * 0.62 + px(10);
        const editing = lengthEdit?.gap && lengthEdit.wallId === w.id && lengthEdit.gap.otherId === g.otherId;
        gapEls.push(
          <g key={`${g.side}-${g.otherId}`} className={`gap${g.rank > 0 ? ' far' : ''}`}>
            <line x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} />
            {[g.a, g.b].map((p, i) => (
              <line key={i} x1={p.x + n.x * tick} y1={p.y + n.y * tick} x2={p.x - n.x * tick} y2={p.y - n.y * tick} />
            ))}
            <g
              className={`gap-label${editing ? ' editing' : ''}`}
              data-kind="gap-label"
              data-id={w.id}
              data-side={g.side}
              data-gap={g.gap}
              data-other={g.otherId}
              data-x={mid.x}
              data-y={mid.y}
              transform={`rotate(${ang} ${mid.x} ${mid.y})`}
            >
              <title>Clear distance between walls — click to set it exactly</title>
              <rect x={mid.x - lw / 2} y={mid.y - fs * 0.8} width={lw} height={fs * 1.6} rx={px(4)} />
              <text x={mid.x} y={mid.y} fontSize={fs} dominantBaseline="middle" textAnchor="middle">
                {label}
              </text>
            </g>
          </g>,
        );
      }
  }

  // Handles for the current selection
  const handles: ReactNode[] = [];
  const hr = px(6);
  if (selection?.kind === 'wall') {
    const w = wallsById.get(selection.id);
    if (w)
      (['start', 'end'] as const).forEach((which) => {
        const p = w[which];
        handles.push(<circle key={which} cx={p.x} cy={p.y} r={hr} className="handle" data-kind="handle" data-handle={`wall-${which}`} data-id={w.id} />);
      });
  } else if (selection?.kind === 'item') {
    const it = design.items.find((i) => i.id === selection.id);
    if (it) {
      const r = rad(it.rotation);
      const c = v(it.x, it.y);
      const rp = add(c, rot(v(0, -it.depth / 2 - px(22)), r));
      const bp = add(c, rot(v(0, -it.depth / 2), r));
      const cp = add(c, rot(v(it.width / 2, it.depth / 2), r));
      handles.push(
        <line key="rl" x1={bp.x} y1={bp.y} x2={rp.x} y2={rp.y} className="handle-line" />,
        <circle key="rot" cx={rp.x} cy={rp.y} r={hr} className="handle rotate" data-kind="handle" data-handle="item-rotate" data-id={it.id}>
          <title>Drag to rotate (hold Shift for free rotation)</title>
        </circle>,
        <rect key="rs" x={cp.x - hr} y={cp.y - hr} width={hr * 2} height={hr * 2} className="handle" data-kind="handle" data-handle="item-resize" data-id={it.id}>
          <title>Drag to resize</title>
        </rect>,
      );
      const lp = add(c, rot(v(0, it.depth / 2 + px(14)), r));
      handles.push(
        <text key="lbl" x={lp.x} y={lp.y} fontSize={fs} textAnchor="middle" dominantBaseline="middle" className="sel-label">
          {`${it.name}  ${it.width} × ${it.depth}`}
        </text>,
      );
    }
  } else if (selection?.kind === 'roof' && design.roof && roofRes && !('error' in roofRes)) {
    // Extensions: drag to move; the selected one gets a handle on each side.
    for (const ex of design.roof.extensions ?? []) {
      const cs = extCorners(ex);
      const on = selection.id === ex.id;
      handles.push(
        <polygon key={ex.id} points={cs.map((q) => `${q.x},${q.y}`).join(' ')} className={on ? 'roof-ext on' : 'roof-ext'} data-kind="roof-ext" data-id={ex.id}>
          <title>Roof extension — drag to move · Del to remove</title>
        </polygon>,
      );
      if (on) {
        const r = rad(ex.rotation);
        const sides = [v(ex.width / 2, 0), v(-ex.width / 2, 0), v(0, ex.depth / 2), v(0, -ex.depth / 2)];
        sides.forEach((s, i) => {
          const q = add(v(ex.x, ex.y), rot(s, r));
          handles.push(
            <rect key={`${ex.id}-${i}`} x={q.x - hr} y={q.y - hr} width={hr * 2} height={hr * 2} className="handle" data-kind="handle" data-handle="roof-ext-side" data-id={ex.id} data-side={i}>
              <title>Drag to resize</title>
            </rect>,
          );
        });
        handles.push(
          <text key={`${ex.id}-lbl`} x={ex.x} y={ex.y} fontSize={fs} textAnchor="middle" dominantBaseline="middle" className="sel-label">
            {`${formatMm(ex.width)} × ${formatMm(ex.depth)}`}
          </text>,
        );
      }
    }
    // Arrows on the roof's edges: drag one out to stretch the roof over a patio.
    const o = Math.max(0, design.roof.overhang);
    roofRes.outline.forEach((e, i) => {
      if (dist(e.a, e.b) < 1000) return;
      const m = add(mul(add(e.a, e.b), 0.5), mul(e.n, o + px(14)));
      const t = v(-e.n.y, e.n.x);
      const s = px(9);
      const tip = add(m, mul(e.n, s));
      const l = add(sub(m, mul(e.n, s * 0.6)), mul(t, s));
      const rr = sub(sub(m, mul(e.n, s * 0.6)), mul(t, s));
      handles.push(
        <polygon key={`pull-${i}`} points={`${tip.x},${tip.y} ${l.x},${l.y} ${rr.x},${rr.y}`} className="handle roof-pull" data-kind="handle" data-handle="roof-pull" data-index={i}>
          <title>Drag out to extend the roof (e.g. over a patio)</title>
        </polygon>,
      );
    });
  } else if (selection?.kind === 'room') {
    const r = design.rooms.find((x) => x.id === selection.id);
    r?.points.forEach((p, i) =>
      handles.push(<circle key={i} cx={p.x} cy={p.y} r={hr} className="handle" data-kind="handle" data-handle="room-vertex" data-id={r.id} data-index={i} />),
    );
  }

  // Tool previews
  const preview: ReactNode[] = [];
  if (snap && (tool.kind === 'wall' || tool.kind === 'floor' || tool.kind === 'measure')) {
    const p = snap.p;
    if (chain.length) {
      const last = chain[chain.length - 1];
      let end = p;
      if (typed && tool.kind === 'wall') {
        const n = parseFloat(typed);
        if (n > 0) end = add(last, mul(dist(p, last) > 1 ? norm(sub(p, last)) : v(1, 0), n));
      }
      if (tool.kind === 'wall') {
        preview.push(
          <polyline key="chain" points={chain.map((q) => `${q.x},${q.y}`).join(' ')} className="chain" />,
          <line key="seg" x1={last.x} y1={last.y} x2={end.x} y2={end.y} className="draft-wall" strokeWidth={design.settings.wallThickness} />,
        );
        preview.push(dimLine(last, end, 'draftdim', { preview: true }));
      } else if (tool.kind === 'floor') {
        const pts = [...chain, p];
        preview.push(<polygon key="fl" points={pts.map((q) => `${q.x},${q.y}`).join(' ')} className="draft-floor" />);
        preview.push(dimLine(last, p, 'draftdim', { preview: true }));
      } else {
        preview.push(dimLine(last, p, 'draftdim', { preview: true }));
      }
    }
    preview.push(<circle key="snap" cx={p.x} cy={p.y} r={px(snap.kind === 'endpoint' ? 6 : 4)} className={`snap snap-${snap.kind}`} />);
  }
  if (tool.kind === 'room') {
    const ds = dragRef.current;
    if (ds?.drag.kind === 'rect' && rectEnd) {
      const a = ds.drag.start;
      const b = rectEnd;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      preview.push(
        <rect key="rr" x={x} y={y} width={w} height={h} className="draft-room" strokeWidth={design.settings.wallThickness} />,
        dimLine(v(x, y), v(x + w, y), 'rw', { preview: true }),
        dimLine(v(x, y + h), v(x, y), 'rh', { preview: true }),
      );
    } else if (snap) preview.push(<circle key="snap" cx={snap.p.x} cy={snap.p.y} r={px(4)} className={`snap snap-${snap.kind}`} />);
  }
  if (ghostItem) preview.push(renderItem(ghostItem, true));
  if (ghostOpening) preview.push(renderOpening(ghostOpening.o, ghostOpening.wall, true));

  const cursorClass =
    dragKind === 'pan'
      ? 'panning'
      : tool.kind === 'select'
        ? 'tool-select'
        : (tool.kind === 'opening' && !ghostOpening) || (tool.kind === 'elec' && !ghostElec)
          ? 'tool-blocked'
          : tool.kind === 'elec-link'
            ? 'tool-select'
            : 'tool-draw';

  return (
    <div className="plan-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className={`plan plan-canvas ${cursorClass}${electric ? ' elec-mode' : ''}`}
        width={size.w}
        height={size.h}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setMouse(null)}
        onContextMenu={(e) => e.preventDefault()}
        onDoubleClick={() => {
          if (tool.kind === 'floor' && chain.length >= 3) closeFloor(chain);
          else if (tool.kind === 'wall') finishChain();
        }}
      >
        <defs>
          <pattern id="grid-minor" width={minor} height={minor} patternUnits="userSpaceOnUse">
            <path d={`M ${minor} 0 L 0 0 0 ${minor}`} fill="none" stroke="var(--grid-minor)" strokeWidth={px(1)} />
          </pattern>
          {[...new Set(design.rooms.map((r) => boardPattern(floorOf(design, r))))].map((key) => {
            const [dir, step] = key.split('-').map(Number);
            return (
              <pattern key={key} id={`boards-${key}`} width={600} height={step} patternUnits="userSpaceOnUse" patternTransform={`rotate(${dir})`}>
                <line x1={0} y1={0} x2={600} y2={0} stroke="#6b5a48" strokeOpacity={0.25} strokeWidth={px(1)} />
              </pattern>
            );
          })}
          <pattern id="grid-major" width={major} height={major} patternUnits="userSpaceOnUse">
            <rect width={major} height={major} fill="url(#grid-minor)" />
            <path d={`M ${major} 0 L 0 0 0 ${major}`} fill="none" stroke="var(--grid-major)" strokeWidth={px(1)} />
          </pattern>
        </defs>
        <g transform={`translate(${view.tx} ${view.ty}) scale(${s})`}>
          <rect x={visible.x0} y={visible.y0} width={visible.x1 - visible.x0} height={visible.y1 - visible.y0} fill="url(#grid-major)" />
          <g className="rooms">
            {design.rooms.map((r) => {
              const fl = floorOf(design, r);
              const pts = r.points.map((p) => `${p.x},${p.y}`).join(' ');
              return (
                <g key={r.id}>
                  <polygon points={pts} fill={fl.color} className={`room${isSel('room', r.id) ? ' selected' : ''}`} data-kind="room" data-id={r.id} />
                  {/* Faint board lines showing which way the floor runs */}
                  {DIRECTIONAL_FLOORS.has(fl.finish) && <polygon points={pts} fill={`url(#boards-${boardPattern(fl)})`} className="room-boards" />}
                </g>
              );
            })}
          </g>
          <g className="items low">{itemsSorted.filter((i) => i.elevation <= 0).map((i) => renderItem(i))}</g>
          <g className="walls">{wallEls}</g>
          <g className="openings">
            {design.openings.map((o) => {
              const w = wallsById.get(o.wallId);
              return w ? renderOpening(o, w) : null;
            })}
          </g>
          <g className="items high">{itemsSorted.filter((i) => i.elevation > 0).map((i) => renderItem(i))}</g>
          <g className="labels">
            {wallLabels}
            {design.rooms.map((r) => {
              const ri = roomInterior(r.points, design.walls);
              if (!ri) return null;
              const c = polygonCentroid(r.points);
              const dims = ri.rect && design.settings.showRoomDimensions ? `${formatMm(ri.rect[0])} × ${formatMm(ri.rect[1])}` : null;
              return (
                <g key={r.id} className="room-label">
                  <text x={c.x} y={c.y - px(dims ? 14 : 7)} fontSize={px(13)} textAnchor="middle" className="room-name">
                    {r.name}
                  </text>
                  {dims && (
                    <text x={c.x} y={c.y + px(2)} fontSize={px(11)} textAnchor="middle" className="room-size">
                      {dims}
                    </text>
                  )}
                  <text x={c.x} y={c.y + px(dims ? 17 : 9)} fontSize={px(11)} textAnchor="middle" className="room-area">
                    {formatArea(ri.area)}
                  </text>
                </g>
              );
            })}
            {design.settings.showRoomDimensions && roomDims}
          </g>
          <g className="door-stops">
            {doorStops.map(({ key, stop }) => {
              const r = DOOR_STOP_SIZE.diameter / 2;
              if (stop.mount === 'floor') return <circle key={key} cx={stop.at.x} cy={stop.at.y} r={r} />;
              const n = v(-stop.dir.y, stop.dir.x);
              const end = add(stop.at, mul(stop.dir, DOOR_STOP_SIZE.projection));
              const pts = [add(stop.at, mul(n, r)), add(end, mul(n, r)), sub(end, mul(n, r)), sub(stop.at, mul(n, r))];
              return <polygon key={key} points={pts.map((q) => `${q.x},${q.y}`).join(' ')} />;
            })}
          </g>
          {design.settings.showOutsideDims && <OutsideDims strings={outsideStrings} px={px} showWalls={design.settings.outsideDimWalls !== false} />}
          <g className="dims">{design.dimensions.map((m) => dimLine(m.a, m.b, m.id, { id: m.id, selected: isSel('dimension', m.id) }))}</g>
          {electric && <ElectricalLayer design={design} px={px} selection={selection} tool={tool} ghost={ghostElec?.e ?? null} lit={lit} />}
          {roofRes && <RoofOverlay r={roofRes} fs={fs} />}
          {design.settings.showClearances && (
            <g className="gaps">
              {gapEls}
              {openingGapEls}
              {itemGapEls}
            </g>
          )}
          <g className="handles">{handles}</g>
          <g className="preview">{preview}</g>
          <g className="align-guides">
            {(dragKind === 'item' || dragKind === 'elec' ? itemGuides : (ghostElec?.guides ?? ghostItemSnap(mouse, mods.shift)?.guides ?? [])).map(([g1, g2], i) => (
              <line key={i} x1={g1.x} y1={g1.y} x2={g2.x} y2={g2.y} />
            ))}
          </g>
          {walker && <WalkerMarker x={walker.x} y={walker.y} yaw={walker.yaw} px={px} />}
        </g>
      </svg>
      {lengthEdit && (
        <LengthEditor
          left={lengthEdit.at.x * s + view.tx}
          top={lengthEdit.at.y * s + view.ty}
          initial={lengthEdit.text}
          onCommit={(text) => {
            const n = evalExpr(text);
            const w = store.state.design.walls.find((x) => x.id === lengthEdit.wallId);
            if (lengthEdit.item) {
              const { id, dir, dist: was } = lengthEdit.item;
              if (n >= 0 && Math.abs(n - was) >= 0.5)
                store.update((d) => ({
                  ...d,
                  items: d.items.map((x) => (x.id === id ? { ...x, x: Math.round(x.x + dir.x * (was - n)), y: Math.round(x.y + dir.y * (was - n)) } : x)),
                }));
            } else if (lengthEdit.opening) {
              const { id, side, face } = lengthEdit.opening;
              const o = store.state.design.openings.find((x) => x.id === id);
              const ow = o && store.state.design.walls.find((x) => x.id === o.wallId);
              if (o && ow && n >= 0) {
                const offset = side === 'left' ? face + n + o.width / 2 : face - n - o.width / 2;
                store.update((d) => ({
                  ...d,
                  openings: d.openings.map((x) => (x.id === id ? { ...x, offset: clampOpeningOffset({ ...x, offset }, wallFrame(ow).length) } : x)),
                }));
              }
            } else if (lengthEdit.gap) {
              if (w && n > 0 && Math.abs(n - lengthEdit.gap.value) >= 0.5) setWallGap(w.id, lengthEdit.gap.side, lengthEdit.gap.value, Math.round(n));
            } else if (w) {
              const cl = wallClearLength(w, store.state.design.walls);
              if (n > 0 && Math.abs(n - cl.clear) >= 0.5) setWallLength(w.id, Math.round(n + cl.e0 + cl.e1));
            }
            setLengthEdit(null);
          }}
          onCancel={() => setLengthEdit(null)}
        />
      )}
      <PlanHud tool={tool.kind} chainLen={chain.length} typed={typed} mouse={snap?.p ?? mouse} snapKind={snap?.kind} />
      {mobile && tool.kind !== 'select' && (
        // Phones: what Enter / Esc / right-click do on a computer.
        <div className="plan-actions">
          <span className="hint">{TOUCH_HINTS[tool.kind]}</span>
          {tool.kind === 'floor' && chain.length > 1 && <button onClick={() => setChain((c) => c.slice(0, -1))}>Undo point</button>}
          {tool.kind === 'floor' && chain.length >= 3 && (
            <button className="primary" onClick={() => closeFloor(chain)}>
              Finish floor
            </button>
          )}
          {tool.kind === 'wall' && chain.length > 0 && <button onClick={finishChain}>End walls</button>}
          <button
            className={tool.kind === 'floor' && chain.length >= 3 ? '' : 'primary'}
            onClick={() => {
              finishChain();
              store.setTool({ kind: 'select' });
            }}
          >
            Done
          </button>
        </div>
      )}
      <div className="plan-zoom">
        <button title="Zoom in" onClick={() => zoomBy(1.25)}>
          +
        </button>
        <button title="Zoom out" onClick={() => zoomBy(0.8)}>
          −
        </button>
        <button title="Zoom to fit (F)" onClick={fit}>
          ⤢
        </button>
      </div>
      <ScaleBar scale={s} />
    </div>
  );

  function zoomBy(k: number) {
    setView((vw) => {
      const scale = Math.min(2, Math.max(0.004, vw.scale * k));
      const cx = size.w / 2;
      const cy = size.h / 2;
      return { scale, tx: cx - ((cx - vw.tx) / vw.scale) * scale, ty: cy - ((cy - vw.ty) / vw.scale) * scale };
    });
  }
}

const HINTS: Record<string, string[]> = {
  select: ['Click to select · drag to move', 'Drag empty space to pan · scroll to zoom', 'R rotate · Del delete · Ctrl+D duplicate · arrows nudge'],
  wall: ['Click to start a wall, click again to place each corner', 'Type a length in mm then Enter for exact walls', 'Enter / right-click / double-click to finish · Shift = no snapping'],
  room: ['Drag a rectangle to create a room (4 walls + floor)', 'Shift = no snapping'],
  floor: ['Click points to outline a floor / room area', 'Click the first point, Enter or double-click to close'],
  measure: ['Click two points to add a dimension line'],
  place: ['Click to place · snaps against walls and neighbouring items', 'Shift = no snapping · Ctrl+click to keep placing · Esc to cancel'],
  opening: ['Hover a wall and click to insert', 'Ctrl+click to keep placing · Esc to cancel'],
  elec: ['Click to place each one · switches and power points go on the nearest wall', 'Lights line up with each other · Shift = no snapping', 'Esc or right-click when done'],
  'elec-link': ['Click lights to add them to this switch, click again to take them off', 'Fans with a light: switches link the light, fan controllers the fan', 'Click another switch to link that one instead', 'Esc or right-click when done'],
};

/** Short hints for touch screens (shown above the Done button). */
const TOUCH_HINTS: Record<string, string> = {
  wall: 'Tap to start a wall, then tap each corner',
  room: 'Drag a rectangle for a room',
  floor: 'Tap each corner of the floor',
  measure: 'Tap two points to measure',
  place: 'Tap where it goes',
  opening: 'Tap a wall to put it in',
  elec: 'Tap to place; switches and power points go on walls',
  'elec-link': 'Tap lights to add or take them off',
};

function PlanHud(props: { tool: string; chainLen: number; typed: string; mouse: Vec | null; snapKind?: string }) {
  return (
    <div className="plan-hud">
      {(HINTS[props.tool] ?? []).map((h) => (
        <div key={h}>{h}</div>
      ))}
      {props.typed && <div className="typed">Length: {props.typed} mm ↵</div>}
      {props.mouse && (
        <div className="coords">
          x {Math.round(props.mouse.x)} · y {Math.round(props.mouse.y)} mm{props.snapKind && props.snapKind !== 'free' ? ` · ${props.snapKind}` : ''}
        </div>
      )}
    </div>
  );
}

function ScaleBar({ scale }: { scale: number }) {
  const target = 120 / scale;
  const steps = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  const mm = steps.find((st) => st >= target * 0.6) ?? 50000;
  return (
    <div className="scale-bar">
      <div className="bar" style={{ width: mm * scale }} />
      <span>{mm >= 1000 ? `${mm / 1000} m` : `${mm} mm`}</span>
    </div>
  );
}

function LengthEditor(props: { left: number; top: number; initial: string; onCommit: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(props.initial);
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) props.onCommit(text);
    else props.onCancel();
  };
  return (
    <div className="length-editor" style={{ left: props.left, top: props.top }} onPointerDown={(e) => e.stopPropagation()}>
      <input
        autoFocus
        value={text}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(true);
          else if (e.key === 'Escape') finish(false);
        }}
        onBlur={() => finish(true)}
      />
      <span>mm</span>
    </div>
  );
}

function RoofOverlay({ r, fs }: { r: RoofOutcome; fs: number }) {
  if ('error' in r) return null;
  const pts = r.eaves.flat();
  const cx = (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2;
  const cy = (Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2;
  return (
    <>
      <g className="roof-eaves" opacity={0.22}>
        {r.eaves.map((poly, i) => (
          <polygon key={i} points={poly.map((p) => `${p.x},${p.y}`).join(' ')} />
        ))}
      </g>
      <text x={cx} y={cy} fontSize={fs * 1.2} textAnchor="middle" className="roof-label">
        {`Roof · ridge ${Math.round(r.ridge)} mm`}
      </text>
    </>
  );
}

/** "You are here" marker for walk-through mode: a dot plus the direction you're looking. */
function WalkerMarker({ x, y, yaw, px }: { x: number; y: number; yaw: number; px: (n: number) => number }) {
  const fx = -Math.sin(yaw);
  const fy = -Math.cos(yaw);
  const reach = Math.max(1500, px(60));
  const spread = 0.6;
  const a = { x: x + (fx * Math.cos(spread) - fy * Math.sin(spread)) * reach, y: y + (fx * Math.sin(spread) + fy * Math.cos(spread)) * reach };
  const b = { x: x + (fx * Math.cos(-spread) - fy * Math.sin(-spread)) * reach, y: y + (fx * Math.sin(-spread) + fy * Math.cos(-spread)) * reach };
  return (
    <g className="walker" pointerEvents="none">
      <path d={`M${x} ${y} L${a.x} ${a.y} L${b.x} ${b.y} Z`} />
      <circle cx={x} cy={y} r={px(7)} />
    </g>
  );
}
