import { useMemo, useState } from 'react';
import {
  AREA_KINDS,
  areaOf,
  bedSoilLitres,
  BED_SHAPES,
  BLOCK_SHAPES,
  FENCES,
  fenceRuns,
  GARDEN_CATALOG,
  GARDEN_GROUPS,
  gardenOf,
  growthOf,
  houseFits,
  houseFootprint,
  isPermeable,
  isPlant,
  outlineOf,
  perimeterOf,
  specOf,
  surfaceOf,
  EDGINGS,
} from '../garden';
import type { GardenGroup, GardenSpec } from '../garden';
import { addDriveway, addFrontPath, closeGarden, createBlock, generateYards, updateGarden } from '../gardenActions';
import { dist, formatArea, polygonArea } from '../geometry';
import { store, useStore } from '../store';
import type { FenceType, GardenAreaKind } from '../types';
import { NumField } from './Fields';

const DRAW_KINDS: GardenAreaKind[] = ['lawn', 'bed', 'veggie', 'driveway', 'path', 'paving', 'gravel'];
const GROWTH = [
  { k: 0.3, name: 'Just planted' },
  { k: 0.6, name: 'In 3 years' },
  { k: 1, name: 'Fully grown' },
];

/**
 * Garden designer (replaces the catalogue while it's open): set out the block of land, cut it into front, back and
 * side yards, draw garden beds, lawns, driveways and paths, and plant natives, trees and vegetables, with a list of
 * quantities (turf, mulch, soil, plants, fencing) at the bottom.
 */
export default function GardenDesigner() {
  const design = useStore((s) => s.design);
  const tool = useStore((s) => s.tool);
  const selection = useStore((s) => s.selection);
  const g = gardenOf(design);
  const [shape, setShape] = useState('rect');
  const [W, setW] = useState(15000);
  const [D, setD] = useState(40000);
  const [kind, setKind] = useState<GardenAreaKind>('bed');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ native: true, tree: true, veg: false, raised: true, letterbox: false, feature: false });
  const [redo, setRedo] = useState(false);

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    return GARDEN_GROUPS.map((gr) => ({
      ...gr,
      items: GARDEN_CATALOG.filter((p) => p.group === gr.id && (!s || `${p.name} ${p.botanical ?? ''} ${gr.name} ${p.native ? 'native' : ''}`.toLowerCase().includes(s))),
    })).filter((gr) => gr.items.length);
  }, [q]);

  const blockArea = g.block ? polygonArea(g.block.points) : 0;
  const houseArea = useMemo(() => houseFootprint(design), [design]);
  const fits = g.block ? houseFits(design, g.block) : true;
  const yards = g.areas.filter((a) => a.kind === 'yard');

  const quantities = useMemo(() => {
    // Areas on top of the yards: what's under them doesn't count twice in the permeable estimate.
    const hard = g.areas.filter((a) => a.kind !== 'yard' && !isPermeable(surfaceOf(a))).reduce((s, a) => s + areaOf(a), 0);
    const rows = new Map<string, { label: string; qty: number; unit: string; dp: number }>();
    const addRow = (key: string, label: string, qty: number, unit: string, dp = 1) => {
      const r = rows.get(key) ?? { label, qty: 0, unit, dp };
      r.qty += qty;
      rows.set(key, r);
    };
    for (const a of g.areas) {
      const s = surfaceOf(a);
      const area = areaOf(a) / 1e6;
      const k = AREA_KINDS[a.kind];
      if (s.tex === 'grass') addRow(`turf-${s.name}`, `${s.name} turf`, area * 1.05, 'm²', 0);
      else if (s.tex === 'turf') addRow('synthetic', 'Synthetic turf', area * 1.05, 'm²', 0);
      else if (s.tile) addRow(`pave-${s.name}`, s.name, area * 1.1, 'm²', 0);
      else if (k.depth) addRow(`fill-${s.name}`, s.name, area * (k.depth / 1000) * 1.1, 'm³', 2);
      if (a.edging && EDGINGS[a.edging]) addRow(`edge-${a.edging}`, EDGINGS[a.edging].name, (perimeterOf(outlineOf(a)) / 1000) * 1.05, 'm', 1);
    }
    let soil = 0;
    const plants = new Map<string, { spec: GardenSpec; n: number }>();
    for (const it of g.items) {
      const s = specOf(it);
      if (s.group === 'raised') soil += bedSoilLitres(it);
      if (isPlant(s)) plants.set(s.id, { spec: s, n: (plants.get(s.id)?.n ?? 0) + 1 });
      else addRow(`item-${s.id}`, s.name, 1, '×', 0);
    }
    if (soil > 0) addRow('soil', 'Garden mix for raised beds', soil / 1000, 'm³', 2);
    const fences = new Map<FenceType, number>();
    for (const r of fenceRuns(g)) {
      const f = g.block!.sides[r.side].fence;
      fences.set(f, (fences.get(f) ?? 0) + dist(r.a, r.b));
    }
    for (const [f, L] of fences) addRow(`fence-${f}`, FENCES[f].name, L / 1000, 'm', 1);
    return { rows: [...rows.values()], plants: [...plants.values()].sort((a, b) => a.spec.name.localeCompare(b.spec.name)), hard };
  }, [g]);

  const placing = (id: string) => tool.kind === 'garden-item' && tool.itemType === id;
  const drawing = (curved: boolean | undefined, shapeId?: string) => tool.kind === 'garden-area' && tool.area === kind && (shapeId ? tool.shape === shapeId : !tool.shape && !!tool.curved === !!curved);
  const growth = growthOf(g);
  const select = (id: string) => store.set({ selection: { kind: 'garden-area', id }, tool: { kind: 'select' } });

  return (
    <aside className="catalog kitchen-designer garden-designer">
      <div className="kd-head">
        <div>
          <strong>Garden</strong>
          <span className="kd-room">{g.block ? `Block ${Math.round(blockArea / 1e6)} m² · ${g.items.length} plant${g.items.length === 1 ? '' : 's'} & features` : 'Landscape designer'}</span>
        </div>
        <button className="primary" onClick={closeGarden} title="Back to the full catalogue">
          Done
        </button>
      </div>
      <div className="cat-scroll">
        {/* ---- Block of land ---- */}
        <div className="kd-section">
          <div className="kd-label">
            1. Block of land {g.block && <span>{Math.round(blockArea / 1e6)} m²</span>}
          </div>
          {g.block && !redo ? (
            <>
              <div className="presets">
                <button className={selection?.kind === 'block' ? 'on' : ''} onClick={() => store.set({ selection: { kind: 'block', id: 'block' }, tool: { kind: 'select' } })}>
                  Edit block & fences
                </button>
                <button onClick={() => setRedo(true)}>Start again</button>
              </div>
              {houseArea > 0 && (
                <p className="note">
                  House footprint {Math.round(houseArea / 1e6)} m² · site coverage {Math.round((houseArea / blockArea) * 100)}% · hard surfaces outside {Math.round(quantities.hard / 1e6)} m²
                </p>
              )}
              {!fits && <p className="note elec-warn">The house runs outside the block. Move or reshape the block (select it, then drag).</p>}
            </>
          ) : (
            <>
              <div className="presets kd-profiles">
                {BLOCK_SHAPES.map((b) => (
                  <button key={b.id} className={shape === b.id ? 'on' : ''} onClick={() => setShape(b.id)} title={b.hint}>
                    {b.name}
                  </button>
                ))}
              </div>
              <NumField label="Frontage" value={W} min={4000} max={200000} onChange={setW} hint="Width of the block along the street" />
              <NumField label="Depth" value={D} min={6000} max={300000} onChange={setD} hint="From the street to the back boundary" />
              <p className="note">
                {Math.round((W * D) / 1e6)} m² before shaping. The house is set back from the street, facing the way its front wall faces (set one on an
                outside wall).
              </p>
              <div className="presets">
                <button
                  className="primary"
                  onClick={() => {
                    createBlock(shape, W, D);
                    setRedo(false);
                  }}
                >
                  Set out block
                </button>
                <button
                  className={tool.kind === 'garden-area' && tool.area === 'block' ? 'on' : ''}
                  onClick={() => (store.setTool({ kind: 'garden-area', area: 'block' }), setRedo(false))}
                  title="Click each corner of the boundary in the plan"
                >
                  Draw my own
                </button>
                {redo && <button onClick={() => setRedo(false)}>Cancel</button>}
              </div>
            </>
          )}
        </div>

        {/* ---- Yards ---- */}
        <div className="kd-section">
          <div className="kd-label">2. Front, back & side yards</div>
          <button onClick={generateYards} disabled={!g.block} title={g.block ? 'Cut the block into yards round the house' : 'Set out the block first'}>
            {yards.length ? 'Remake yards' : 'Make yards'}
          </button>
          {yards.length > 0 && (
            <ul className="elec-list">
              {yards.map((y) => (
                <li key={y.id}>
                  <button className={`linkish${selection?.id === y.id ? ' on' : ''}`} onClick={() => select(y.id)}>
                    {y.name}
                  </button>
                  <span className="elec-gangs">
                    <span>
                      {Math.round(areaOf(y) / 1e6)} m² · {surfaceOf(y).name}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ---- Areas ---- */}
        <div className="kd-section">
          <div className="kd-label">
            3. Garden areas <span>{AREA_KINDS[kind].name}</span>
          </div>
          <div className="presets kd-profiles garden-kinds">
            {DRAW_KINDS.map((k) => (
              <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                <span className="ico">{AREA_KINDS[k].icon}</span> {AREA_KINDS[k].name}
              </button>
            ))}
          </div>
          <div className="presets">
            <button className={drawing(false) ? 'on' : ''} onClick={() => store.setTool({ kind: 'garden-area', area: kind, curved: false })} title="Click each corner in the plan">
              ✎ Draw straight
            </button>
            <button className={drawing(true) ? 'on' : ''} onClick={() => store.setTool({ kind: 'garden-area', area: kind, curved: true })} title="Click points in the plan; the edge curves smoothly through them">
              ✎ Draw curved
            </button>
          </div>
          <div className="kd-label">Shapes</div>
          <div className="presets kd-profiles">
            {BED_SHAPES.map((sh) => (
              <button key={sh.id} className={drawing(undefined, sh.id) ? 'on' : ''} onClick={() => store.setTool({ kind: 'garden-area', area: kind, shape: sh.id })} title={`${sh.name} ${AREA_KINDS[kind].name.toLowerCase()}, ${sh.w / 1000} × ${sh.d / 1000} m: click in the plan to drop it, then drag its corners`}>
                {sh.name}
              </button>
            ))}
          </div>
          <div className="presets">
            <button onClick={addDriveway} title="A driveway from the garage door out to the street">
              🚗 Driveway from garage
            </button>
            <button onClick={addFrontPath} title="A path from the front door out to the street">
              ┅ Path to front door
            </button>
          </div>
          {g.areas.some((a) => a.kind !== 'yard') && (
            <ul className="elec-list">
              {g.areas
                .filter((a) => a.kind !== 'yard')
                .map((a) => (
                  <li key={a.id}>
                    <button className={`linkish${selection?.id === a.id ? ' on' : ''}`} onClick={() => select(a.id)}>
                      {a.name}
                    </button>
                    <span className="elec-gangs">
                      <span>
                        {formatArea(areaOf(a))} · {surfaceOf(a).name}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>

        {/* ---- Plants & features ---- */}
        <div className="kd-section">
          <div className="kd-label">
            4. Plants & features <span>{GROWTH.find((x) => Math.abs(x.k - growth) < 0.05)?.name ?? `${Math.round(growth * 100)}% grown`}</span>
          </div>
          <div className="presets" title="How big plants are drawn">
            {GROWTH.map((x) => (
              <button key={x.k} className={Math.abs(growth - x.k) < 0.05 ? 'on' : ''} onClick={() => updateGarden((gg) => ({ ...gg, growth: x.k }))}>
                {x.name}
              </button>
            ))}
          </div>
        </div>
        <input className="search kd-search" placeholder="Search plants, trees, raised beds…" value={q} onChange={(e) => setQ(e.target.value)} />
        <p className="note kd-tip">Click one, then click in the plan. Plants keep planting until Esc; sizes are fully grown.</p>
        {groups.map((gr) => (
          <div key={gr.id} className="cat-group">
            <button className="cat-head" onClick={() => setOpen((c) => ({ ...c, [gr.id]: !c[gr.id] }))}>
              <span className={`caret${open[gr.id] || q ? ' open' : ''}`}>▸</span>
              {gr.name}
              <span className="kd-count">{gr.items.length}</span>
            </button>
            {(open[gr.id] || q) && (
              <div className="kd-list">
                {gr.items.map((p) => (
                  <button key={p.id} className={`kd-unit${placing(p.id) ? ' active' : ''}`} onClick={() => store.setTool({ kind: 'garden-item', itemType: p.id })} title={p.note ?? p.name}>
                    <span className="kd-unit-name">
                      <span className="garden-dot" style={{ background: p.flower ?? p.color }} />
                      {p.name}
                      {p.native && gr.id !== ('native' as GardenGroup) && <span className="garden-native">native</span>}
                    </span>
                    <span className="kd-unit-meta">
                      {p.botanical ? <i>{p.botanical}</i> : null}
                      {p.botanical ? ' · ' : ''}
                      {isPlant(p) ? `${(p.width / 1000).toFixed(1)} m wide × ${(p.height / 1000).toFixed(1)} m high` : `${p.width} × ${p.depth} × ${p.height}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {!groups.length && <p className="note">Nothing matches “{q}”.</p>}

        {/* ---- Quantities ---- */}
        <div className="kd-section kd-shopping">
          <div className="kd-label">Quantities</div>
          {!quantities.rows.length && !quantities.plants.length ? (
            <p className="note">Turf, mulch, gravel, pavers, edging, soil, fencing and a plant list appear here as you design.</p>
          ) : (
            <>
              <table className="kd-table">
                <tbody>
                  {quantities.rows.map((r) => (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      <td className="kd-num">
                        {r.unit === '×' ? `${r.qty} ×` : `${r.qty.toFixed(r.dp)} ${r.unit}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {quantities.plants.length > 0 && (
                <>
                  <div className="kd-label">Plant list</div>
                  <table className="kd-table">
                    <tbody>
                      {quantities.plants.map(({ spec, n }) => (
                        <tr key={spec.id}>
                          <td>{n} ×</td>
                          <td>
                            {spec.name}
                            {spec.botanical && <div className="garden-botanical-sm">{spec.botanical}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              <p className="note">Turf includes 5%, pavers and loose fill 10% extra. Mulch and gravel at {AREA_KINDS.bed.depth} / {AREA_KINDS.gravel.depth} mm deep, driveways 100 mm slabs. Check with your supplier.</p>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
