import { useEffect, useState } from 'react';
import { addOrSelectRoof } from '../actions';
import { closeElectrical, openElectrical } from '../elecActions';
import { exportPlanSvg, exportScreenshot, openDesign, resetFileHandle, saveDesign } from '../fileio';
import { copyShareLink } from '../share';
import { createSampleDesign } from '../sample';
import { emptyDesign, store, useStore } from '../store';
import type { Tool, ViewMode } from '../types';

const TOOLS: { tool: Tool; label: string; key: string; icon: string; tip: string }[] = [
  { tool: { kind: 'select' }, label: 'Select', key: 'V', icon: '⬉', tip: 'Select, move and edit things' },
  { tool: { kind: 'wall' }, label: 'Wall', key: 'W', icon: '▬', tip: 'Draw walls point to point' },
  { tool: { kind: 'room' }, label: 'Room', key: 'B', icon: '▭', tip: 'Drag a rectangle to create a room with 4 walls and a floor' },
  { tool: { kind: 'floor' }, label: 'Floor', key: 'A', icon: '⬠', tip: 'Outline a floor area / room of any shape' },
  { tool: { kind: 'measure' }, label: 'Measure', key: 'M', icon: '↔', tip: 'Add a dimension line' },
];

export default function Toolbar() {
  const tool = useStore((s) => s.tool);
  const viewMode = useStore((s) => s.viewMode);
  const fileName = useStore((s) => s.fileName);
  const dirty = useStore((s) => s.dirty);
  const name = useStore((s) => s.design.name);
  const roofSelected = useStore((s) => s.selection?.kind === 'roof');
  const facadeSelected = useStore((s) => s.selection?.kind === 'facade');
  const electric = useStore((s) => s.electric);
  // The settings panel shows whenever nothing is selected.
  const settingsOpen = useStore((s) => s.selection === null && s.tool.kind !== 'floor'); // the Floor tool shows floor areas instead
  useStore((s) => s.design); // re-render for undo/redo availability
  const [menu, setMenu] = useState<null | 'new' | 'export'>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.menu-wrap')) setMenu(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  const newDesign = (sample: boolean) => {
    setMenu(null);
    if (store.state.dirty && !confirm('Start a new plan? Unsaved changes to the current plan will be lost.')) return;
    resetFileHandle();
    const d = sample ? createSampleDesign() : emptyDesign();
    store.replaceDesign(d, null);
    if (!sample) store.setTool({ kind: 'room' });
  };

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="logo">⌂</span>
        <div>
          <div className="title">{name}</div>
          <div className="subtitle">
            {fileName ?? 'Not saved to a file'}
            {dirty ? ' · edited' : ''}
          </div>
        </div>
      </div>

      <div className="group">
        <div className="menu-wrap">
          <button onClick={() => setMenu(menu === 'new' ? null : 'new')}>New ▾</button>
          {menu === 'new' && (
            <div className="menu">
              <button onClick={() => newDesign(false)}>Blank plan</button>
              <button onClick={() => newDesign(true)}>Sample 2-bed home</button>
            </div>
          )}
        </div>
        <button onClick={() => void openDesign()} title="Open a saved plan (.home.json)">
          Open
        </button>
        <button className="primary" onClick={() => void saveDesign(false)} title="Save to a file on your computer (Ctrl+S)">
          Save
        </button>
        <button onClick={() => void saveDesign(true)} title="Save to a new file (Ctrl+Shift+S)">
          Save as
        </button>
        <div className="menu-wrap">
          <button onClick={() => setMenu(menu === 'export' ? null : 'export')}>Export ▾</button>
          {menu === 'export' && (
            <div className="menu">
              <button
                onClick={() => {
                  setMenu(null);
                  exportScreenshot();
                }}
              >
                3D view as PNG
              </button>
              <button
                onClick={() => {
                  setMenu(null);
                  exportPlanSvg();
                }}
              >
                Floor plan as SVG
              </button>
            </div>
          )}
        </div>
        <button onClick={() => void copyShareLink()} title="Copy a link that opens a copy of this design (the design is in the link itself; nothing is uploaded)">
          Share link
        </button>
      </div>

      <div className="group">
        <button onClick={() => store.undo()} disabled={!store.canUndo} title="Undo (Ctrl+Z)">
          ↶
        </button>
        <button onClick={() => store.redo()} disabled={!store.canRedo} title="Redo (Ctrl+Y)">
          ↷
        </button>
      </div>

      <div className="group tools">
        {TOOLS.map((t) => (
          <button
            key={t.label}
            className={tool.kind === t.tool.kind ? 'active' : ''}
            onClick={() => store.setTool(t.tool)}
            title={`${t.tip} (${t.key})`}
          >
            <span className="ico">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="group">
        <button
          className={roofSelected ? 'active' : ''}
          onClick={addOrSelectRoof}
          title="Add a roof worked out automatically from your walls"
        >
          <span className="ico">⌂</span>
          Roof
        </button>
      </div>

      <div className="group">
        <button
          className={facadeSelected ? 'active' : ''}
          onClick={() => store.set({ selection: { kind: 'facade', id: 'facade' }, tool: { kind: 'select' } })}
          title="Outside wall finish: brick, render, cladding… and colours"
        >
          <span className="ico">▦</span>
          Facade
        </button>
        <button
          className={electric ? 'active' : ''}
          onClick={() => (electric ? closeElectrical() : openElectrical())}
          title="Electrical plan: Clipsal Iconic switches and power points, lights, and what each switch turns on"
        >
          <span className="ico">⚡</span>
          Electrical
        </button>
        <button
          className={settingsOpen ? 'active' : ''}
          onClick={() => {
            store.set({ selection: null, tool: { kind: 'select' } });
            document.querySelector('.props')?.scrollTo({ top: 0, behavior: 'smooth' });
          }} title="Global settings: wall height, door height, wall colour, snapping">
          <span className="ico">⚙</span>
          Settings
        </button>
      </div>

      <div className="spacer" />

      <div className="group seg">
        {(['2d', 'split', '3d'] as ViewMode[]).map((m) => (
          <button key={m} className={viewMode === m ? 'active' : ''} onClick={() => store.set({ viewMode: m })}>
            {m === '2d' ? '2D' : m === '3d' ? '3D' : 'Split'}
          </button>
        ))}
      </div>
    </header>
  );
}
