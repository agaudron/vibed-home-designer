import { normaliseDesign, store } from './store';
import { getSceneHandle } from './three/Scene3D';

// Minimal typings for the File System Access API (Chromium browsers).
interface FsHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void> }>;
}
type PickerWindow = Window & {
  showSaveFilePicker?: (o: unknown) => Promise<FsHandle>;
  showOpenFilePicker?: (o: unknown) => Promise<FsHandle[]>;
};

const FILE_TYPES = [{ description: 'Home Designer plan', accept: { 'application/json': ['.home.json', '.json'] } }];
let currentHandle: FsHandle | null = null;

const w = window as PickerWindow;

function safeName(name: string) {
  return (name.trim() || 'home').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase();
}

function serialise() {
  return JSON.stringify(store.state.design, null, 2);
}

function download(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveDesign(saveAs = false) {
  const blob = new Blob([serialise()], { type: 'application/json' });
  const suggested = `${safeName(store.state.design.name)}.home.json`;
  try {
    if (w.showSaveFilePicker) {
      if (!currentHandle || saveAs) {
        currentHandle = await w.showSaveFilePicker({ suggestedName: store.state.fileName ?? suggested, types: FILE_TYPES });
      }
      const writable = await currentHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      store.set({ fileName: currentHandle.name, dirty: false });
      store.flash(`Saved to ${currentHandle.name}`);
      return;
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return;
    console.warn('File System Access save failed, falling back to download', e);
  }
  const name = store.state.fileName ?? suggested;
  download(blob, name);
  store.set({ fileName: name, dirty: false });
  store.flash(`Downloaded ${name}`);
}

async function loadFromFile(file: File) {
  try {
    const design = normaliseDesign(JSON.parse(await file.text()));
    store.replaceDesign(design, file.name);
    store.flash(`Opened ${file.name}`);
  } catch (e) {
    alert(`Could not open ${file.name}: ${(e as Error).message}`);
  }
}

export async function openDesign() {
  if (store.state.dirty && !confirm('Open another plan? Unsaved changes to the current plan will be lost.')) return;
  try {
    if (w.showOpenFilePicker) {
      const [handle] = await w.showOpenFilePicker({ types: FILE_TYPES, multiple: false });
      currentHandle = handle;
      await loadFromFile(await handle.getFile());
      return;
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) {
      currentHandle = null;
      void loadFromFile(f);
    }
  };
  input.click();
}

export function resetFileHandle() {
  currentHandle = null;
}

export function exportScreenshot() {
  const h = getSceneHandle();
  if (!h) {
    alert('Switch to the 3D or split view to export a 3D image.');
    return;
  }
  const url = h.screenshot();
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(store.state.design.name)}-3d.png`;
  a.click();
}

export function exportPlanSvg() {
  const svg = document.querySelector('svg.plan-canvas') as SVGSVGElement | null;
  if (!svg) {
    alert('Switch to the 2D or split view to export the plan.');
    return;
  }
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.querySelectorAll('.handles, .preview').forEach((n) => n.remove());
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = Array.from(document.styleSheets)
    .flatMap((s) => {
      try {
        return Array.from(s.cssRules).map((r) => r.cssText);
      } catch {
        return [];
      }
    })
    .filter((t) => t.includes('.plan') || t.startsWith(':root'))
    .join('\n');
  clone.insertBefore(style, clone.firstChild);
  clone.classList.add('plan');
  download(new Blob([clone.outerHTML], { type: 'image/svg+xml' }), `${safeName(store.state.design.name)}-plan.svg`);
}
