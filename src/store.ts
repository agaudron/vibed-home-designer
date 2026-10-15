import { useSyncExternalStore } from 'react';
import type { Design, Roof, Selection, Tool, ViewMode } from './types';
import { createSampleDesign } from './sample';
import { defaultFacade } from './facade';

export interface AppState {
  design: Design;
  selection: Selection | null;
  tool: Tool;
  viewMode: ViewMode;
  cutaway: boolean;
  showRoof: boolean;
  /** First-person walk-through mode is on. */
  walking: boolean;
  /** Where the walker is (plan mm) and which way they face, for the 2D marker. */
  walker: { x: number; y: number; yaw: number } | null;
  /** Side panels collapsed to make more room for the views. */
  hideCatalog: boolean;
  hideProps: boolean;
  /** 3D render quality (a preference for this browser, not part of the design). */
  quality: RenderQuality;
  /** Which paint maker's colours the colour pickers offer (a preference for this browser). */
  paintRange: PaintRange;
  fileName: string | null;
  dirty: boolean;
  status: string;
}

export function defaultRoof(): Roof {
  return { style: 'hip', pitch: 22.5, overhang: 450, eaveHeight: null, fascia: 200, color: '#4b4c46', skillionDir: 0, levelRidges: true }; // Woodland Grey
}

export function emptyDesign(): Design {
  return {
    app: 'home-designer',
    version: 1,
    name: 'Untitled home',
    walls: [],
    openings: [],
    items: [],
    rooms: [],
    dimensions: [],
    roof: null,
    facade: defaultFacade(),
    settings: { snap: 50, wallThickness: 110, wallHeight: 2700, showDimensions: true, showRoomDimensions: true, wallColor: '#f2efe9', doorHeight: 2040, ceilingColor: '#ffffff', ceilingHeight: null, flooring: { finish: 'timber', color: '#c49a6c' }, cornice: 'cove90', skirting: 'pencil', skirtingColor: '#ffffff' },
  };
}

const AUTOSAVE_KEY = 'home-designer:autosave';

/** Small UI preferences kept in the browser (best effort). */
function readPref(key: string): boolean {
  try {
    return localStorage.getItem(`home-designer:${key}`) === '1';
  } catch {
    return false;
  }
}
export type RenderQuality = 'low' | 'medium' | 'high' | 'ultra';
export const QUALITIES: { id: RenderQuality; name: string; hint: string }[] = [
  { id: 'low', name: 'Low', hint: 'No shadows, lower resolution — fastest, for slow laptops' },
  { id: 'medium', name: 'Medium', hint: 'Sharper shadows at lower detail' },
  { id: 'high', name: 'High', hint: 'Soft shadows, full resolution (default)' },
  { id: 'ultra', name: 'Ultra', hint: 'Adds reflections and ambient occlusion (soft shading in corners) — needs a good graphics card' },
];
function readQuality(): RenderQuality {
  try {
    const q = localStorage.getItem('home-designer:quality');
    if (QUALITIES.some((x) => x.id === q)) return q as RenderQuality;
  } catch {
    // ignore
  }
  return 'high';
}
export function setQuality(q: RenderQuality) {
  store.set({ quality: q });
  try {
    localStorage.setItem('home-designer:quality', q);
  } catch {
    // ignore
  }
}
export type PaintRange = 'dulux' | 'porters';
export const PAINT_RANGES: { id: PaintRange; name: string }[] = [
  { id: 'dulux', name: 'Dulux' },
  { id: 'porters', name: "Porter's Paints" },
];
function readPaintRange(): PaintRange {
  try {
    if (localStorage.getItem('home-designer:paintRange') === 'porters') return 'porters';
  } catch {
    // ignore
  }
  return 'dulux';
}
export function setPaintRange(r: PaintRange) {
  store.set({ paintRange: r });
  try {
    localStorage.setItem('home-designer:paintRange', r);
  } catch {
    // ignore
  }
}
export function togglePanel(key: 'hideCatalog' | 'hideProps') {
  const v = !store.state[key];
  store.set({ [key]: v } as Partial<AppState>);
  try {
    localStorage.setItem(`home-designer:${key}`, v ? '1' : '0');
  } catch {
    // ignore
  }
}
const HISTORY_LIMIT = 200;

type Listener = () => void;
type EventName = 'fit' | 'fit3d';

class Store {
  state: AppState;
  private past: Design[] = [];
  private future: Design[] = [];
  private listeners = new Set<Listener>();
  private events = new Map<EventName, Set<() => void>>();
  private saveTimer: number | undefined;

  constructor() {
    let design: Design | null = null;
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) design = normaliseDesign(JSON.parse(raw));
    } catch {
      design = null;
    }
    this.state = {
      design: design ?? createSampleDesign(),
      selection: null,
      tool: { kind: 'select' },
      viewMode: 'split',
      cutaway: false,
      showRoof: false, // the 3D view opens without the roof so you can see in; the Roof button shows it
      walking: false,
      walker: null,
      hideCatalog: readPref('hideCatalog'),
      hideProps: readPref('hideProps'),
      quality: readQuality(),
      paintRange: readPaintRange(),
      fileName: null,
      dirty: false,
      status: '',
    };
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  on(name: EventName, cb: () => void) {
    if (!this.events.has(name)) this.events.set(name, new Set());
    this.events.get(name)!.add(cb);
    return () => {
      this.events.get(name)!.delete(cb);
    };
  }

  emit(name: EventName) {
    this.events.get(name)?.forEach((cb) => cb());
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  set(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  /** Push the current design onto the undo stack (call before a change). */
  checkpoint() {
    this.past.push(this.state.design);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
  }

  /** Update the design. With record=true the previous state becomes an undo step. */
  update(fn: (d: Design) => Design, record = true) {
    if (record) this.checkpoint();
    const design = fn(this.state.design);
    this.state = { ...this.state, design, dirty: true };
    this.validateSelection();
    this.notify();
    this.scheduleAutosave();
  }

  replaceDesign(design: Design, fileName: string | null) {
    this.past = [];
    this.future = [];
    this.state = { ...this.state, design, selection: null, fileName, dirty: false, tool: { kind: 'select' } };
    this.notify();
    this.scheduleAutosave();
    requestAnimationFrame(() => {
      this.emit('fit');
      this.emit('fit3d');
    });
  }

  undo() {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.state.design);
    this.state = { ...this.state, design: prev, dirty: true };
    this.validateSelection();
    this.notify();
    this.scheduleAutosave();
  }

  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.state.design);
    this.state = { ...this.state, design: next, dirty: true };
    this.validateSelection();
    this.notify();
    this.scheduleAutosave();
  }

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }

  select(selection: Selection | null) {
    if (selection === this.state.selection) return;
    this.set({ selection });
  }

  setTool(tool: Tool) {
    this.set({ tool, selection: tool.kind === 'select' ? this.state.selection : null });
  }

  flash(status: string) {
    this.set({ status });
    window.setTimeout(() => {
      if (this.state.status === status) this.set({ status: '' });
    }, 3000);
  }

  private validateSelection() {
    const s = this.state.selection;
    if (!s) return;
    const d = this.state.design;
    if (s.kind === 'facade') return;
    if (s.kind === 'roof') {
      if (!d.roof) this.state = { ...this.state, selection: null };
      return;
    }
    const list =
      s.kind === 'wall'
        ? d.walls
        : s.kind === 'opening'
          ? d.openings
          : s.kind === 'item'
            ? d.items
            : s.kind === 'room'
              ? d.rooms
              : d.dimensions;
    if (!list.some((e) => e.id === s.id)) this.state = { ...this.state, selection: null };
  }

  private scheduleAutosave() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(this.state.design));
      } catch {
        // Storage unavailable (private mode etc.) - autosave is best effort only.
      }
    }, 400);
  }
}

export const store = new Store();

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.state));
}

/** Fill in defaults and drop malformed entries so older or hand-edited files still load. */
export function normaliseDesign(raw: unknown): Design {
  if (!raw || typeof raw !== 'object') throw new Error('Not a design file');
  const r = raw as Partial<Design>;
  if (!Array.isArray(r.walls)) throw new Error('Not a Home Designer file (missing walls)');
  const base = emptyDesign();
  const num = (x: unknown, d: number) => (typeof x === 'number' && isFinite(x) ? x : d);
  const vec = (p: any) => ({ x: num(p?.x, 0), y: num(p?.y, 0) });
  return {
    ...base,
    name: typeof r.name === 'string' ? r.name : base.name,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    walls: r.walls.map((w: any) => ({
      id: String(w.id),
      start: vec(w.start),
      end: vec(w.end),
      thickness: num(w.thickness, 110),
      height: num(w.height, 2700),
      color: typeof w.color === 'string' ? w.color : '#f2efe9',
      facade: w.facade && typeof w.facade === 'object' ? { ...defaultFacade(), ...w.facade } : null,
      construction: w.construction ?? null,
      ...(w.lining && typeof w.lining === 'object' ? { lining: { pos: w.lining.pos ?? null, neg: w.lining.neg ?? null } } : {}),
      ...(w.sideColor && typeof w.sideColor === 'object' ? { sideColor: { ...w.sideColor } } : {}),
    })),
    openings: (r.openings ?? []).map((o: any) => ({
      id: String(o.id),
      wallId: String(o.wallId),
      kind: o.kind ?? 'door',
      offset: num(o.offset, 500),
      width: num(o.width, 820),
      height: num(o.height, 2040),
      sill: num(o.sill, 0),
      hingeEnd: !!o.hingeEnd,
      flip: !!o.flip,
      color: typeof o.color === 'string' ? o.color : '#f4f1ea',
      ...(o.style ? { style: o.style } : o.kind === 'garage_door' ? { style: 'sectional' } : {}),
      ...(o.design ? { design: o.design } : {}),
      ...(o.glass ? { glass: o.glass } : {}),
      ...(o.jamb ? { jamb: o.jamb } : {}),
      ...(o.sidelight ? { sidelight: o.sidelight } : {}),
      ...(o.panels ? { panels: num(o.panels, 3), panelWidth: num(o.panelWidth, 1000) } : {}),
      ...(o.dressing && typeof o.dressing === 'object' && o.dressing.type ? { dressing: { ...o.dressing } } : {}),
      ...(o.handle && typeof o.handle === 'object' ? { handle: { ...o.handle } } : {}),
    })),
    items: (r.items ?? []).map((i: any) => ({
      id: String(i.id),
      type: String(i.type ?? 'box'),
      name: String(i.name ?? i.type ?? 'Item'),
      x: num(i.x, 0),
      y: num(i.y, 0),
      rotation: num(i.rotation, 0),
      width: num(i.width, 600),
      depth: num(i.depth, 600),
      height: num(i.height, 900),
      elevation: num(i.elevation, 0),
      color: typeof i.color === 'string' ? i.color : '#cccccc',
      ...(i.underRoof ? { underRoof: true } : {}),
      ...(i.options && typeof i.options === 'object' ? { options: { ...i.options } } : {}),
    })),
    rooms: (r.rooms ?? []).map((rm: any) => ({
      id: String(rm.id),
      name: String(rm.name ?? 'Room'),
      points: Array.isArray(rm.points) ? rm.points.map(vec) : [],
      floor: rm.floor ?? null,
      color: typeof rm.color === 'string' ? rm.color : null,
      cornice: rm.cornice ?? null,
      skirting: rm.skirting ?? null,
      floorDirection: typeof rm.floorDirection === 'number' ? rm.floorDirection : null,
      wallLining: rm.wallLining ?? null,
    })),
    dimensions: (r.dimensions ?? []).map((dm: any) => ({ id: String(dm.id), a: vec(dm.a), b: vec(dm.b) })),
    roof: r.roof && typeof r.roof === 'object' ? { ...defaultRoof(), ...(r.roof as object) } : null,
    facade: r.facade && typeof r.facade === 'object' ? { ...defaultFacade(), ...(r.facade as object) } : defaultFacade(),
  };
}
