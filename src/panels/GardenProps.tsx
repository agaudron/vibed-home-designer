import { deleteSelection, duplicateSelection } from '../actions';
import { COLORBOND } from '../catalog';
import {
  AREA_KINDS,
  areaOf,
  BED_TIMBERS,
  bedSoilLitres,
  BIRDIES_HEIGHTS,
  BIRDIES_RECT,
  BIRDIES_ROUND,
  CROPS,
  EDGINGS,
  FENCES,
  fenceOf,
  isPlant,
  outlineOf,
  perimeterOf,
  setBlockSideLength,
  specOf,
  surfaceOf,
  SURFACES,
  ZINCALUME,
} from '../garden';
import { updateArea, updateBlock, updateGardenItem, updateLevel } from '../gardenActions';
import { formatLevel } from '../terrain';
import { EDGES } from '../outdoor';
import { dist, formatArea, normAngle, polygonArea } from '../geometry';
import { featureColor } from '../plan/garden';
import type { Block, FenceType, GardenArea, GardenAreaKind, GardenItem, SpotLevel } from '../types';
import { ColorField, Field, NumField, TextField, Toggle } from './Fields';

const COLORBOND_HEX = COLORBOND.map((c) => c.hex);
const COLORBOND_NAMES = Object.fromEntries(COLORBOND.map((c) => [c.hex, c.name]));
const STEEL_HEX = [ZINCALUME, ...COLORBOND_HEX];
const STEEL_NAMES = { [ZINCALUME]: 'Zinc-aluminium (unpainted)', ...COLORBOND_NAMES };

function Actions({ duplicate = true }: { duplicate?: boolean }) {
  return (
    <div className="actions">
      {duplicate && (
        <button onClick={duplicateSelection} title="Ctrl+D">
          Duplicate
        </button>
      )}
      <button className="danger" onClick={deleteSelection} title="Delete">
        Delete
      </button>
    </div>
  );
}

const m = (mm: number) => `${(mm / 1000).toFixed(2)} m`;

// ---------- the block ----------

export function BlockProps({ b, houseArea }: { b: Block; houseArea: number }) {
  const area = polygonArea(b.points);
  const set = (fn: (x: Block) => Block) => updateBlock(fn);
  const setSide = (i: number, patch: Partial<Block['sides'][number]>) => set((x) => ({ ...x, sides: x.sides.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  const setLength = (i: number, L: number) => set((x) => setBlockSideLength(x, i, L));
  const fenceAll = (fence: FenceType) => set((x) => ({ ...x, sides: x.sides.map((s, i) => (i === x.street ? s : { ...s, fence })) }));
  return (
    <section className="prop-section">
      <h3>Block of land</h3>
      <Field label="Area">
        <span className="readout">
          {formatArea(area)} · {Math.round(area / 1e6)} m²
        </span>
      </Field>
      <Field label="Boundary">
        <span className="readout">{m(perimeterOf(b.points))}</span>
      </Field>
      {houseArea > 0 && (
        <Field label="Site coverage" hint="House footprint (outside walls) as a share of the block. Councils set a maximum: check yours.">
          <span className="readout">{Math.round((houseArea / area) * 100)}%</span>
        </Field>
      )}
      <Field label="Street side">
        <select value={b.street} onChange={(e) => set((x) => ({ ...x, street: Number(e.target.value) }))}>
          {b.points.map((_, i) => (
            <option key={i} value={i}>
              Side {i + 1} ({m(dist(b.points[i], b.points[(i + 1) % b.points.length]))})
            </option>
          ))}
        </select>
      </Field>
      <p className="note">Drag the corners in the plan to reshape the block; drag a + to add a corner, Alt+click a corner to remove it. Drag inside the block (once selected) to move it.</p>

      <div className="kd-label">Sides & fences</div>
      <div className="presets">
        {(['colorbond', 'paling', 'slat', 'none'] as FenceType[]).map((f) => (
          <button key={f} onClick={() => fenceAll(f)} title={`${FENCES[f].name} on every side except the street`}>
            All {f === 'none' ? 'unfenced' : FENCES[f].name.replace(/ fence| screen/, '').replace('COLORBOND® steel', 'COLORBOND®')}
          </button>
        ))}
      </div>
      {b.points.map((p, i) => {
        const q = b.points[(i + 1) % b.points.length];
        const side = b.sides[i] ?? { fence: 'none' as FenceType };
        const f = fenceOf(side);
        return (
          <div key={i} className="garden-side-row">
            <div className="kd-label">
              Side {i + 1}
              {i === b.street ? ' · street' : ''}
            </div>
            <NumField label="Length" value={Math.round(dist(p, q))} min={500} onChange={(v) => setLength(i, v)} hint="Moves the corner at the end of this side" />
            <Field label="Fence">
              <select value={side.fence} onChange={(e) => setSide(i, { fence: e.target.value as FenceType, height: undefined, color: undefined })}>
                {(Object.keys(FENCES) as FenceType[]).map((k) => (
                  <option key={k} value={k}>
                    {FENCES[k].name}
                  </option>
                ))}
              </select>
            </Field>
            {side.fence !== 'none' && (
              <>
                <NumField label="Height" value={f.height} min={300} max={3000} onChange={(v) => setSide(i, { height: v })} />
                {side.fence !== 'pool' && (
                  <ColorField
                    label="Colour"
                    value={f.color}
                    onChange={(c) => setSide(i, { color: c })}
                    swatches={FENCES[side.fence].colorbond ? COLORBOND_HEX : undefined}
                    names={FENCES[side.fence].colorbond ? COLORBOND_NAMES : undefined}
                    paint={side.fence === 'rendered' || side.fence === 'picket' ? 'exterior' : side.fence === 'paling' || side.fence === 'slat' ? 'timber' : undefined}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
      <p className="note">Fences stop where a driveway or path crosses the boundary. Dividing fences are usually shared with your neighbour: check local rules before building.</p>
      <Actions duplicate={false} />
    </section>
  );
}

// ---------- garden areas ----------

export function AreaProps({ a }: { a: GardenArea }) {
  const k = AREA_KINDS[a.kind];
  const set = (fn: (x: GardenArea) => GardenArea) => updateArea(a.id, fn);
  const outline = outlineOf(a);
  const area = areaOf(a);
  const per = perimeterOf(outline);
  const s = surfaceOf(a);
  return (
    <section className="prop-section">
      <h3>{a.name}</h3>
      <TextField label="Name" value={a.name} onChange={(v) => set((x) => ({ ...x, name: v.trim() || x.name }))} />
      <Field label="Type">
        <select
          value={a.kind}
          onChange={(e) => {
            const kind = e.target.value as GardenAreaKind;
            set((x) => ({ ...x, kind, surface: AREA_KINDS[kind].surfaces.includes(x.surface ?? '') ? x.surface : undefined, edging: AREA_KINDS[kind].edging ? x.edging : undefined }));
          }}
        >
          {(Object.keys(AREA_KINDS) as GardenAreaKind[]).map((id) => (
            <option key={id} value={id}>
              {AREA_KINDS[id].name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Surface">
        <select value={a.surface ?? k.surface} onChange={(e) => set((x) => ({ ...x, surface: e.target.value }))}>
          {[...new Set([...k.surfaces, a.surface ?? k.surface])].map((id) => (
            <option key={id} value={id}>
              {SURFACES[id]?.name ?? id}
            </option>
          ))}
        </select>
      </Field>
      <div className="kd-swatches">
        {k.surfaces.map((id) => (
          <button key={id} className={`kd-swatch${(a.surface ?? k.surface) === id ? ' on' : ''}`} style={{ background: SURFACES[id].color }} title={SURFACES[id].name} aria-label={SURFACES[id].name} onClick={() => set((x) => ({ ...x, surface: id }))} />
        ))}
      </div>
      {k.edging && (
        <Field label="Edging">
          <select value={a.edging ?? ''} onChange={(e) => set((x) => ({ ...x, edging: e.target.value || undefined }))}>
            <option value="">None</option>
            {Object.entries(EDGINGS).map(([id, e]) => (
              <option key={id} value={id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Toggle label="Curved outline" value={!!a.curved} onChange={(v) => set((x) => ({ ...x, curved: v }))} />
      {a.curved && (
        <div className="presets">
          <button onClick={() => set((x) => ({ ...x, sharp: [] }))}>All corners curved</button>
          <button onClick={() => set((x) => ({ ...x, sharp: x.points.map((_, i) => i) }))}>All corners sharp</button>
        </div>
      )}
      <p className="note">
        Drag the corners in the plan to reshape it, or drag a + to add a corner. Alt+click a corner to remove it
        {a.curved ? '; double-click one to switch it between curved and sharp' : ''}.
      </p>
      <Field label="Area">
        <span className="readout">{formatArea(area)}</span>
      </Field>
      <Field label="Perimeter">
        <span className="readout">{m(per)}</span>
      </Field>
      {(a.kind === 'lawn' || (a.kind === 'yard' && (s.tex === 'grass' || s.tex === 'turf'))) && (
        <Field label={s.tex === 'turf' ? 'Synthetic turf' : 'Turf to order'} hint="Area plus 5% for cutting in">
          <span className="readout">{Math.ceil((area / 1e6) * 1.05)} m²</span>
        </Field>
      )}
      {k.depth && s.tex !== 'pavers' && s.tex !== 'brick' && (
        <Field label={s.tex === 'concrete' || s.tex === 'aggregate' ? 'Concrete' : s.tex === 'soil' ? 'Soil / compost' : s.tex === 'gravel' ? 'Gravel' : 'Mulch'} hint={`At ${k.depth} mm deep, plus 10%`}>
          <span className="readout">{((area / 1e9) * k.depth * 1.1).toFixed(2)} m³</span>
        </Field>
      )}
      {(s.tex === 'pavers' || s.tex === 'brick') && (
        <Field label="Pavers" hint="Area plus 10% for cuts">
          <span className="readout">{Math.ceil((area / 1e6) * 1.1)} m²</span>
        </Field>
      )}
      {a.edging && (
        <Field label="Edging">
          <span className="readout">{m(per * 1.05)}</span>
        </Field>
      )}
      <Actions />
    </section>
  );
}

// ---------- plants and features ----------

export function GardenItemProps({ it }: { it: GardenItem }) {
  const s = specOf(it);
  const set = (fn: (x: GardenItem) => GardenItem) => updateGardenItem(it.id, fn);
  const opt = (key: string, value: string | number) => set((x) => ({ ...x, options: { ...(x.options ?? {}), [key]: value } }));
  const plant = isPlant(s);
  const round = s.round || (it.type === 'raised_birdies' && it.options?.shape === 'round');
  return (
    <section className="prop-section">
      <h3>{s.name}</h3>
      {s.botanical && (
        <p className="note garden-botanical">
          <i>{s.botanical}</i>
          {s.native && <span className="garden-native">Australian native</span>}
        </p>
      )}
      {s.note && <p className="note">{s.note}</p>}

      {it.type === 'raised_timber' && (
        <>
          <Field label="Timber">
            <select value={String(it.options?.timber ?? 'hardwood')} onChange={(e) => (opt('timber', e.target.value), set((x) => ({ ...x, color: undefined })))}>
              {Object.entries(BED_TIMBERS).map(([id, t]) => (
                <option key={id} value={id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sleeper thickness">
            <span className="readout">{Number(it.options?.thick ?? 75)} mm</span>
          </Field>
          <div className="presets">
              {[50, 75].map((t) => (
                <button key={t} className={Number(it.options?.thick ?? 75) === t ? 'on' : ''} onClick={() => opt('thick', t)}>
                  {t} mm
                </button>
              ))}
          </div>
          <Field label="Height">
            <span className="readout">{it.height} mm</span>
          </Field>
          <div className="presets">
              {[200, 400, 600, 800].map((h) => (
                <button key={h} className={it.height === h ? 'on' : ''} onClick={() => set((x) => ({ ...x, height: h }))}>
                  {h / 200} × 200
                </button>
              ))}
          </div>
        </>
      )}

      {it.type === 'raised_birdies' && (
        <>
          <Field label="Shape">
            <span className="readout">{round ? 'Round' : 'Rectangular'}</span>
          </Field>
          <div className="presets">
              {(['rect', 'round'] as const).map((sh) => (
                <button
                  key={sh}
                  className={(it.options?.shape ?? 'rect') === sh ? 'on' : ''}
                  onClick={() => (opt('shape', sh), set((x) => (sh === 'round' ? { ...x, width: 1200, depth: 1200 } : { ...x, width: 1500, depth: 800 })))}
                >
                  {sh === 'rect' ? 'Rectangular' : 'Round'}
                </button>
              ))}
          </div>
          <Field label="Size">
            <span className="readout">{round ? `Ø${it.width} mm` : `${it.width} × ${it.depth} mm`}</span>
          </Field>
          <div className="presets">
              {round
                ? BIRDIES_ROUND.map((dd) => (
                    <button key={dd} className={it.width === dd ? 'on' : ''} onClick={() => set((x) => ({ ...x, width: dd, depth: dd }))}>
                      Ø{dd / 10}
                    </button>
                  ))
                : BIRDIES_RECT.map(([w, dd]) => (
                    <button key={`${w}x${dd}`} className={it.width === w && it.depth === dd ? 'on' : ''} onClick={() => set((x) => ({ ...x, width: w, depth: dd }))}>
                      {w / 10}×{dd / 10}
                    </button>
                  ))}
          </div>
          <Field label="Height">
            <span className="readout">{it.height} mm</span>
          </Field>
          <div className="presets">
              {BIRDIES_HEIGHTS.map(({ h, name }) => (
                <button key={h} className={it.height === h ? 'on' : ''} onClick={() => set((x) => ({ ...x, height: h }))} title={`${h} mm`}>
                  {name} ({h / 10} cm)
                </button>
              ))}
          </div>
          <ColorField label="Colour" value={it.color ?? s.color} onChange={(c) => set((x) => ({ ...x, color: c }))} swatches={STEEL_HEX} names={STEEL_NAMES} />
        </>
      )}

      {(it.type === 'raised_timber' || it.type === 'raised_birdies') && (
        <>
          <Field label="Growing">
            <select value={String(it.options?.crop ?? 'none')} onChange={(e) => opt('crop', e.target.value)}>
              {Object.entries(CROPS).map(([id, c]) => (
                <option key={id} value={id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Soil to fill it" hint="Inside the bed, to 50 mm below the top">
            <span className="readout">
              {Math.round(bedSoilLitres(it))} L ({(bedSoilLitres(it) / 1000).toFixed(2)} m³)
            </span>
          </Field>
        </>
      )}

      {it.type === 'letterbox_pier' && (
        <Field label="Finish">
          <select value={String(it.options?.finish ?? 'brick')} onChange={(e) => (opt('finish', e.target.value), set((x) => ({ ...x, color: undefined })))}>
            {['brick', 'render', 'stone', 'block'].map((id) => (
              <option key={id} value={id}>
                {EDGES[id].name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {it.type === 'retaining_wall' && (
        <Field label="Built from">
          <select value={String(it.options?.edge ?? 'sleeper')} onChange={(e) => (opt('edge', e.target.value), set((x) => ({ ...x, color: undefined })))}>
            {Object.entries(EDGES).map(([id, e]) => (
              <option key={id} value={id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {plant ? (
        <>
          <NumField label="Grown spread" value={it.width} min={50} max={30000} onChange={(v) => set((x) => ({ ...x, width: v, depth: s.round ? v : x.depth }))} hint="Width when fully grown" />
          {!s.round && <NumField label="Grown depth" value={it.depth} min={50} max={30000} onChange={(v) => set((x) => ({ ...x, depth: v }))} />}
          <NumField label="Grown height" value={it.height} min={50} max={40000} onChange={(v) => set((x) => ({ ...x, height: v }))} />
          <ColorField label="Foliage" value={it.color ?? s.color} onChange={(c) => set((x) => ({ ...x, color: c }))} swatches={[s.color, '#3f6b3a', '#5f8f3a', '#8a9c80', '#6f8c86', '#a63a2a']} />
        </>
      ) : (
        <>
          {it.type !== 'raised_birdies' && <NumField label={round ? 'Diameter' : 'Width'} value={it.width} min={50} max={30000} onChange={(v) => set((x) => ({ ...x, width: v, depth: round ? v : x.depth }))} />}
          {!round && it.type !== 'raised_birdies' && <NumField label="Depth" value={it.depth} min={20} max={30000} onChange={(v) => set((x) => ({ ...x, depth: v }))} />}
          {it.type !== 'raised_birdies' && it.type !== 'raised_timber' && <NumField label="Height" value={it.height} min={10} max={10000} onChange={(v) => set((x) => ({ ...x, height: v }))} />}
          {it.type !== 'raised_birdies' && it.type !== 'stepping_stone' && (
            <ColorField
              label="Colour"
              value={featureColor(s, it)}
              onChange={(c) => set((x) => ({ ...x, color: c }))}
              swatches={['tank_slim', 'tank_round', 'shed', 'letterbox_pillar', 'letterbox_post'].includes(it.type) ? COLORBOND_HEX : undefined}
              names={['tank_slim', 'tank_round', 'shed', 'letterbox_pillar', 'letterbox_post'].includes(it.type) ? COLORBOND_NAMES : undefined}
            />
          )}
        </>
      )}
      {!round && <NumField label="Rotation" value={it.rotation} suffix="°" step={15} onChange={(v) => set((x) => ({ ...x, rotation: normAngle(v) }))} />}
      <Actions />
    </section>
  );
}

// ---------- spot levels ----------

export function LevelProps({ l }: { l: SpotLevel }) {
  const set = (z: number) => updateLevel(l.id, (x) => ({ ...x, z: Math.round(z) }));
  return (
    <section className="prop-section">
      <h3>Spot level {formatLevel(l.z)}</h3>
      <NumField label="Height" value={l.z} min={-50000} max={50000} onChange={set} hint="Above (+) or below (−) the ground at the house" />
      <div className="presets">
        {[-500, -100, 100, 500].map((dz) => (
          <button key={dz} onClick={() => set(l.z + dz)}>
            {dz > 0 ? '+' : '−'}
            {Math.abs(dz)}
          </button>
        ))}
        <button onClick={() => set(0)} title="Level with the ground at the house">
          0
        </button>
      </div>
      <p className="note">The ground is shaped through all the spot levels. Drag this one in the plan to move it; it keeps its height.</p>
      <Actions duplicate={false} />
    </section>
  );
}
