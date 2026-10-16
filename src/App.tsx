import { useEffect } from 'react';
import { deleteSelection, duplicateSelection, nudgeSelection, raiseSelection, rotateSelection } from './actions';
import { saveDesign } from './fileio';
import { isFormControl, isTyping } from './keyboard';
import Catalog from './panels/Catalog';
import KitchenDesigner from './panels/KitchenDesigner';
import Properties from './panels/Properties';
import Legal from './panels/Legal';
import ProductCard from './panels/ProductCard';
import Toolbar from './panels/Toolbar';
import PlanView from './plan/PlanView';
import { store, togglePanel, useStore } from './store';
import Scene3D from './three/Scene3D';

export default function App() {
  const viewMode = useStore((s) => s.viewMode);
  const status = useStore((s) => s.status);
  const hideCatalog = useStore((s) => s.hideCatalog);
  const hideProps = useStore((s) => s.hideProps);
  const kitchen = useStore((s) => s.kitchen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 's') {
        e.preventDefault();
        void saveDesign(e.shiftKey);
        return;
      }
      // Esc leaves whatever field / dropdown you're in.
      if (e.key === 'Escape' && isFormControl(e.target)) {
        (e.target as HTMLElement).blur();
        return;
      }
      // Shortcuts only pause while typing in a text box; dropdowns, checkboxes and buttons don't block them.
      if (isTyping(e.target)) return;
      if (isFormControl(e.target) && (e.key.startsWith('Arrow') || e.key === 'Delete' || e.key === 'Backspace')) {
        (e.target as HTMLElement).blur();
        e.preventDefault();
      }
      if (store.state.walking) return; // WASD etc. drive the walker
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        store.redo();
      } else if (mod && k === 'd') {
        e.preventDefault();
        duplicateSelection();
      } else if (mod) {
        return;
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === 'Escape') {
        if (store.state.tool.kind !== 'select') store.setTool({ kind: 'select' });
        else store.select(null);
      } else if (k === 'r') rotateSelection(e.shiftKey ? -90 : 90);
      else if (k === 'v') store.setTool({ kind: 'select' });
      else if (k === 'w') store.setTool({ kind: 'wall' });
      else if (k === 'b') store.setTool({ kind: 'room' });
      else if (k === 'a') store.setTool({ kind: 'floor' });
      else if (k === 'm') store.setTool({ kind: 'measure' });
      else if (k === 'f') store.emit('fit');
      else if (e.key === '[') togglePanel('hideCatalog');
      else if (e.key === ']') togglePanel('hideProps');
      else if ((e.key === 'PageUp' || e.key === 'PageDown') && store.state.selection) {
        e.preventDefault();
        raiseSelection((e.key === 'PageUp' ? 1 : -1) * (e.shiftKey ? 100 : 10));
      } else if (e.key.startsWith('Arrow') && store.state.selection) {
        e.preventDefault();
        const step = e.shiftKey ? 100 : 10;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        nudgeSelection(dx, dy);
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (store.state.dirty && store.state.fileName) e.preventDefault();
    };
    // A dropdown keeps keyboard focus after you pick from it, which would make the arrow keys change it
    // instead of moving things; let go of it once a choice is made.
    const onChange = (e: Event) => {
      if (e.target instanceof HTMLSelectElement) e.target.blur();
    };
    document.addEventListener('change', onChange);
    // Picking the Floor tool brings back the side panel (it shows the floor areas).
    let lastTool = store.state.tool.kind;
    const unsubTool = store.subscribe(() => {
      const t = store.state.tool.kind;
      if (t === 'floor' && lastTool !== 'floor' && store.state.hideProps) store.set({ hideProps: false });
      lastTool = t;
    });
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('change', onChange);
      unsubTool();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  return (
    <div className="app">
      <Legal />
      <Toolbar />
      <div className="main">
        {hideCatalog ? (
          <button className="panel-rail left" onClick={() => togglePanel('hideCatalog')} title="Show the catalog ( [ )">
            <span>›</span>
            <span className="rail-label">Catalog</span>
          </button>
        ) : (
          <div className="panel-wrap">
            {kitchen ? <KitchenDesigner roomId={kitchen} /> : <Catalog />}
            <button className="panel-collapse left" onClick={() => togglePanel('hideCatalog')} title="Hide the catalog for more room ( [ )">
              ‹
            </button>
          </div>
        )}
        <div className={`views mode-${viewMode}`}>
          <ProductCard />
          {viewMode !== '3d' && (
            <div className="view-pane">
              <PlanView />
            </div>
          )}
          {viewMode !== '2d' && (
            <div className="view-pane">
              <Scene3D />
            </div>
          )}
        </div>
        {hideProps ? (
          <button className="panel-rail right" onClick={() => togglePanel('hideProps')} title="Show properties & settings ( ] )">
            <span>‹</span>
            <span className="rail-label">Properties</span>
          </button>
        ) : (
          <div className="panel-wrap">
            <button className="panel-collapse right" onClick={() => togglePanel('hideProps')} title="Hide this panel for more room ( ] )">
              ›
            </button>
            <Properties />
          </div>
        )}
      </div>
      {status && <div className="toast">{status}</div>}
    </div>
  );
}
