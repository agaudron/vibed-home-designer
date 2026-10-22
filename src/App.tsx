import { useEffect } from 'react';
import { deleteSelection, duplicateSelection, nudgeSelection, raiseSelection, rotateSelection } from './actions';
import { saveDesign } from './fileio';
import { isFormControl, isTyping } from './keyboard';
import Catalog from './panels/Catalog';
import KitchenDesigner from './panels/KitchenDesigner';
import ElectricalDesigner from './panels/ElectricalDesigner';
import GardenDesigner from './panels/GardenDesigner';
import Properties from './panels/Properties';
import Legal from './panels/Legal';
import ProductCard from './panels/ProductCard';
import Toolbar from './panels/Toolbar';
import PlanView from './plan/PlanView';
import { store, togglePanel, useStore } from './store';
import { isMobile, useMobile } from './mobile';
import type { ViewMode } from './types';
import Scene3D from './three/Scene3D';

export default function App() {
  const viewMode = useStore((s) => s.viewMode);
  const status = useStore((s) => s.status);
  const hideCatalog = useStore((s) => s.hideCatalog);
  const hideProps = useStore((s) => s.hideProps);
  const kitchen = useStore((s) => s.kitchen);
  const electric = useStore((s) => s.electric);
  const garden = useStore((s) => s.garden);
  const sheet = useStore((s) => s.sheet);
  const mobile = useMobile();
  // Phones show one view at a time.
  const mode: ViewMode = mobile && viewMode === 'split' ? '2d' : viewMode;

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
    let lastDesigner = !!(store.state.kitchen || store.state.electric || store.state.garden);
    const unsubTool = store.subscribe(() => {
      const t = store.state.tool.kind;
      if (t === 'floor' && lastTool !== 'floor' && store.state.hideProps && !isMobile()) store.set({ hideProps: false });
      if (isMobile()) {
        // Phones: the sheet gets out of the way once you've picked something to place or draw (tap the plan next),
        // and opening the kitchen / electrical designer shows it in the sheet.
        if (t !== lastTool && t !== 'select' && store.state.sheet) store.set({ sheet: null });
        const designer = !!(store.state.kitchen || store.state.electric || store.state.garden);
        const opened = designer && !lastDesigner;
        lastDesigner = designer; // before set(): it calls this listener again
        if (opened) store.set({ sheet: 'catalog' });
      }
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

  const leftPanel = kitchen ? <KitchenDesigner roomId={kitchen} /> : electric ? <ElectricalDesigner /> : garden ? <GardenDesigner /> : <Catalog />;
  const views = (
    <div className={`views mode-${mode}`}>
      <ProductCard />
      {mode !== '3d' && (
        <div className="view-pane">
          <PlanView />
        </div>
      )}
      {mode !== '2d' && (
        <div className="view-pane">
          <Scene3D />
        </div>
      )}
    </div>
  );

  if (mobile)
    return (
      <div className="app mobile">
        <Legal />
        <Toolbar />
        <div className="main">{views}</div>
        {sheet && (
          <div className={`sheet sheet-${sheet}`}>
            <div className="sheet-head">
              <strong>{sheet === 'props' ? 'Properties' : kitchen || electric || garden ? 'Designer' : 'Add to the plan'}</strong>
              <button onClick={() => store.set({ sheet: null })} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="sheet-body">{sheet === 'props' ? <Properties /> : leftPanel}</div>
          </div>
        )}
        <MobileBar mode={mode} />
        {status && <div className="toast">{status}</div>}
      </div>
    );

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
            {leftPanel}
            <button className="panel-collapse left" onClick={() => togglePanel('hideCatalog')} title="Hide the catalog for more room ( [ )">
              ‹
            </button>
          </div>
        )}
        {views}
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

/** Phone bottom bar: open the catalogue (or designer) or properties in the bottom sheet, and switch 2D / 3D. */
function MobileBar({ mode }: { mode: ViewMode }) {
  const sheet = useStore((s) => s.sheet);
  const selected = useStore((s) => s.selection !== null);
  const kitchen = useStore((s) => s.kitchen);
  const electric = useStore((s) => s.electric);
  const garden = useStore((s) => s.garden);
  const toggle = (which: 'catalog' | 'props') => store.set({ sheet: sheet === which ? null : which });
  return (
    <nav className="mobile-bar">
      <button className={sheet === 'catalog' ? 'active' : ''} onClick={() => toggle('catalog')}>
        <span className="ico">＋</span>
        {kitchen ? 'Kitchen' : electric ? 'Electrical' : garden ? 'Garden' : 'Add'}
      </button>
      <button className={`${sheet === 'props' ? 'active' : ''}${selected && sheet !== 'props' ? ' has-sel' : ''}`} onClick={() => toggle('props')}>
        <span className="ico">☰</span>
        {selected ? 'Selected' : 'Settings'}
      </button>
      <div className="group seg">
        {(['2d', '3d'] as ViewMode[]).map((m) => (
          <button key={m} className={mode === m ? 'active' : ''} onClick={() => store.set({ viewMode: m })}>
            {m.toUpperCase()}
          </button>
        ))}
      </div>
    </nav>
  );
}
