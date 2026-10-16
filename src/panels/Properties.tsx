import { useEffect, useMemo, useState } from 'react';
import { SOLAR_DEFAULTS, SOLAR_PANELS, solarArraySize, GUTTER_STYLES, ROOF_MATERIALS, ROOF_PROFILES, TILE_COLOURS, productLink, DRESSINGS, DRESSING_FABRICS, BANQUETTE_BACKS, BANQUETTE_DEFAULTS, SKYLIGHT_DEFAULTS, SKYLIGHT_MODELS, SKYLIGHT_SIZES, SUN_TUNNEL_SIZES, UPHOLSTERY, COLORBOND, DOOR_DESIGNS, TIMBERLINE, VANITY_DEFAULTS, FLOOR_COLORS, FLOOR_NAMES, FLOOR_SWATCHES, GARAGE_STYLES, ITEM_MAP } from '../catalog';
import { BOARD_FLOORS, CORNICES, TILE_FLOORS, floorOf, DIRECTIONAL_FLOORS, LININGS, SKIRTINGS, WINDOW_TRIM, hasOpeningTrim, houseTrimType, houseTrimWidth, liningFor, openingTrim, wallFaces } from '../trims';
import type { TrimProfile } from '../trims';
import { addOrSelectRoof, detectRoomsWithMessage, duplicateWalls, removeDuplicateWallsWithMessage, squareUpWallsWithMessage, deleteSelection, duplicateSelection, isDoorKind, setGlobalDoorHeight, setGlobalWallColor, setGlobalWallHeight, rotateSelection, setWallLength, splitWall } from '../actions';
import { faceColor, pointInPolygon, clampOpeningOffset, DOOR_GAP, DOOR_JAMB, doubleDoorLeaf, doubleDoorWidth, DEFAULT_INTERIOR_DOOR, STACKER_FRAME, STACKER_MAX_PANELS, STACKER_OVERLAP, stackerWidth, deg, dist, effectiveDoor, isLeafDoor, sidelights, wallClearLength, formatArea, normAngle, polygonArea, roomInterior, wallFrame } from '../geometry';
import { QUALITIES, setQuality, store, useStore } from '../store';
import type { RenderQuality } from '../store';
import FloorAreas from './FloorAreas';
import { openLegal } from './Legal';
import RoomMaterials from './RoomMaterials';
import { openProductCard } from './ProductCard';
import { checkDoor, clearOffset, doorHandle, doorStopLayout, HANDLE_DEFAULT, HANDLE_FINISHES, HANDLES, MIN_OPEN } from '../doorClearance';
import type { HandleType } from '../doorClearance';
import { exteriorSides, FINISHES } from '../facade';
import { generateRoof } from '../roof';
import FacadeEditor from './FacadeEditor';
import { KABOODLE_PRODUCTS } from '../kaboodle';
import { DOOR_STOP_SIZE, DOOR_STOPS, doorStopProduct, doorStopUrl } from '../doorStops';
import { ABI_HANDLE_BY_SLUG, ABI_HANDLES, abiHandleName, abiHandleUrl } from '../doorHandles';
import { isKitchenRoom, isUnderBench, kitchenStyle, openKitchenDesigner, swapProduct } from '../kitchen';
import { applyConstructionWithMessage, applyWallConstructionWithMessage, CONSTRUCTIONS, constructionThickness } from '../construction';
import type { Construction, CorniceType, Design, DoorDesign, LiningType, GarageStyle, Facade, FloorFinish, FloorSize, SkirtingType, Item, Opening, OpeningKind, Roof, RoofExtension, RoofStyle, Room, Wall, DoorStop, DoorHandleSpec } from '../types';
import { ColorField, Field, NumField, TextField, Toggle } from './Fields';

const upd = <K extends 'walls' | 'openings' | 'items' | 'rooms'>(key: K, id: string, patch: Partial<Design[K][number]>) =>
  store.update((d) => ({ ...d, [key]: (d[key] as { id: string }[]).map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

export default function Properties() {
  const design = useStore((s) => s.design);
  const sel = useStore((s) => s.selection);
  const floorTool = useStore((s) => s.tool.kind === 'floor');

  let body;
  if (sel?.kind === 'wall') {
    const w = design.walls.find((x) => x.id === sel.id);
    if (w) body = <WallProps w={w} design={design} />;
  } else if (sel?.kind === 'opening') {
    const o = design.openings.find((x) => x.id === sel.id);
    const w = o && design.walls.find((x) => x.id === o.wallId);
    if (o && w) body = <OpeningProps o={o} w={w} />;
  } else if (sel?.kind === 'item') {
    const it = design.items.find((x) => x.id === sel.id);
    if (it) body = <ItemProps it={it} />;
  } else if (sel?.kind === 'room') {
    const r = design.rooms.find((x) => x.id === sel.id);
    if (r)
      body = (
        <>
          <RoomProps r={r} />
          <RoomMaterials design={design} r={r} />
        </>
      );
  } else if (sel?.kind === 'facade') {
    body = <FacadeProps design={design} />;
  } else if (sel?.kind === 'roof' && design.roof) {
    body = <RoofProps roof={design.roof} design={design} />;
  } else if (sel?.kind === 'dimension') {
    const m = design.dimensions.find((x) => x.id === sel.id);
    if (m)
      body = (
        <Section title="Dimension">
          <Field label="Length">
            <span className="readout">{Math.round(dist(m.a, m.b))} mm</span>
          </Field>
          <Actions />
        </Section>
      );
  }
  // The Floor tool shows floor areas and the flooring calculator (with the selected room's settings below).
  if (floorTool)
    return (
      <aside className="props">
        <FloorAreas design={design} />
        {sel?.kind === 'room' && body}
      </aside>
    );
  return <aside className="props">{body ?? <DesignProps design={design} />}</aside>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="prop-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Actions({ duplicate = true, extra }: { duplicate?: boolean; extra?: React.ReactNode }) {
  return (
    <div className="actions">
      {extra}
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

function Presets({ values, current, onPick, suffix = '' }: { values: number[]; current: number; onPick: (v: number) => void; suffix?: string }) {
  return (
    <div className="presets">
      {values.map((v) => (
        <button key={v} className={v === current ? 'on' : ''} onClick={() => onPick(v)}>
          {v}
          {suffix}
        </button>
      ))}
    </div>
  );
}

function WallProps({ w, design }: { w: Wall; design: Design }) {
  const f = wallFrame(w);
  const cl = wallClearLength(w, design.walls);
  const count = design.openings.filter((o) => o.wallId === w.id).length;
  const sd = exteriorSides(design.walls).map.get(w.id);
  const outside = !!(sd?.pos || sd?.neg);
  const isFront = design.settings.frontWallId === w.id;
  return (
    <Section title="Wall">
      <NumField
        label="Length"
        value={Math.round(cl.clear)}
        min={10}
        onChange={(v) => setWallLength(w.id, v + cl.e0 + cl.e1)}
        hint="Clear length, not counting the parts that run into the walls it joins. Moves the end point of the wall."
      />
      {(cl.e0 > 0 || cl.e1 > 0) && (
        <Field label="Centre to centre">
          <span className="readout">{Math.round(f.length)} mm</span>
        </Field>
      )}
      <NumField label="Thickness" value={w.thickness} min={10} max={1000} onChange={(v) => upd('walls', w.id, { thickness: v })} />
      <Presets values={[70, 90, 110, 150, 230, 290]} current={w.thickness} onPick={(v) => upd('walls', w.id, { thickness: v })} />
      <NumField label="Height" value={w.height} min={100} max={10000} onChange={(v) => upd('walls', w.id, { height: v })} />
      <Presets values={[900, 1200, 2400, 2700, 3000]} current={w.height} onPick={(v) => upd('walls', w.id, { height: v })} />
      <Field label="Angle">
        <span className="readout">{normAngle(-deg(f.angle))}°</span>
      </Field>
      {outside && (
        <>
          <Toggle
            label="Front of house"
            value={isFront}
            onChange={(v) => store.update((d) => ({ ...d, settings: { ...d.settings, frontWallId: v ? w.id : null } }))}
          />
          {isFront && <p className="note">Walk mode starts out in front of this wall, at its door if it has one.</p>}
        </>
      )}
      <WallConstruction w={w} design={design} />
      <WallFacade w={w} design={design} />
      <WallLining w={w} design={design} />
      <WallPaint w={w} design={design} />
      <p className="note">
        {count} opening{count === 1 ? '' : 's'} · drag the end handles to reshape
      </p>
      <Actions
        extra={
          <>
            <button onClick={() => splitWall(w.id)}>Split</button>
            <button
              onClick={() =>
                store.update((d) => ({ ...d, walls: d.walls.map((x) => ({ ...x, height: w.height })) }))
              }
              title="Set every wall to this height"
            >
              Height → all
            </button>
          </>
        }
      />
    </Section>
  );
}

const KIND_NAMES: Record<OpeningKind, string> = {
  door: 'Hinged door',
  double_door: 'Double door',
  sliding_door: 'Sliding glass door',
  stacker_door: 'Stacker door',
  cavity_door: 'Cavity slider',
  garage_door: 'Garage door',
  window: 'Window',
  opening: 'Open archway',
};

function OpeningProps({ o: raw, w }: { o: Opening; w: Wall }) {
  const design = useStore((st) => st.design);
  const side = exteriorSides(design.walls).map.get(w.id);
  const inside = !(side?.pos || side?.neg);
  const follows = inside && isLeafDoor(raw) && !raw.design;
  const o = effectiveDoor(raw, design, inside);
  const L = wallFrame(w).length;
  const c = clampOpeningOffset(o, L);
  const fromStart = Math.round(c - o.width / 2);
  const isDoor = o.kind === 'door' || o.kind === 'double_door' || o.kind === 'cavity_door';
  return (
    <Section title={KIND_NAMES[o.kind]}>
      <Field label="Type">
        <select
          value={o.kind}
          onChange={(e) => {
            const kind = e.target.value as OpeningKind;
            const stacker = kind === 'stacker_door' && !o.panels ? { panels: 3, panelWidth: Math.round((o.width - 2 * STACKER_FRAME + 2 * STACKER_OVERLAP) / 3) } : {};
            upd('openings', o.id, { kind, sill: kind === 'window' ? Math.max(o.sill, 600) : 0, ...stacker });
          }}
        >
          {Object.entries(KIND_NAMES).map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      <NumField
        label="Width"
        value={o.width}
        min={100}
        max={L}
        onChange={(v) =>
          upd('openings', o.id, {
            width: v,
            offset: clampOpeningOffset({ ...o, width: v }, L),
            // Stackers: the panels share out the new width.
            ...(o.kind === 'stacker_door' ? { panelWidth: Math.round((v - 2 * STACKER_FRAME + ((o.panels ?? 3) - 1) * STACKER_OVERLAP) / (o.panels ?? 3)) } : {}),
          })
        }
      />
      {isDoor && o.kind !== 'double_door' && <Presets values={[620, 720, 820, 920, 1020]} current={o.width} onPick={(v) => upd('openings', o.id, { width: v })} />}
      {o.kind === 'double_door' && (
        <>
          <NumField
            label="Each door"
            value={Math.round(doubleDoorLeaf(o.width) * 10) / 10}
            min={300}
            max={1200}
            onChange={(v) => {
              const width = doubleDoorWidth(v);
              upd('openings', o.id, { width, offset: clampOpeningOffset({ ...o, width }, L) });
            }}
            hint={`Width of each door leaf; the opening is 2 doors + ${DOOR_GAP} mm gaps at both edges and between them + the jambs`}
          />
          <Presets
            values={[620, 720, 820, 920]}
            current={doubleDoorLeaf(o.width)}
            onPick={(v) => {
              const width = doubleDoorWidth(v);
              upd('openings', o.id, { width, offset: clampOpeningOffset({ ...o, width }, L) });
            }}
          />
          <p className="note">
            Two {Math.round(doubleDoorLeaf(o.width) * 10) / 10} mm doors with {DOOR_GAP} mm gaps at the edges and in the middle, in a {o.width} mm opening (including {DOOR_JAMB} mm jambs each side).
          </p>
        </>
      )}
      <NumField label="Height" value={o.height} min={100} max={w.height - o.sill} onChange={(v) => upd('openings', o.id, { height: v })} />
      <NumField label="Sill height" value={o.sill} min={0} max={w.height - 100} onChange={(v) => upd('openings', o.id, { sill: v, height: Math.min(o.height, w.height - v) })} />
      <NumField
        label="From wall start"
        value={fromStart}
        min={0}
        max={L - o.width}
        onChange={(v) => upd('openings', o.id, { offset: v + o.width / 2 })}
        hint="Distance from the start of the wall (centreline) to the near edge of the opening"
      />
      <NumField label="From wall end" value={Math.round(L - c - o.width / 2)} min={0} max={L - o.width} onChange={(v) => upd('openings', o.id, { offset: L - v - o.width / 2 })} />
      {o.kind === 'stacker_door' && <StackerOptions o={o} wallLength={L} />}
      {(isDoor || o.kind === 'sliding_door' || o.kind === 'stacker_door') && (
        <div className="toggles">
          <Toggle label="Hinge / slide other side" value={o.hingeEnd} onChange={(v) => upd('openings', o.id, { hingeEnd: v })} />
          {o.kind !== 'cavity_door' && o.kind !== 'sliding_door' && o.kind !== 'stacker_door' && <Toggle label="Swing other way" value={o.flip} onChange={(v) => upd('openings', o.id, { flip: v })} />}
        </div>
      )}
      {(o.kind === 'door' || o.kind === 'double_door') && <DoorOptions o={o} follows={follows} inside={inside} />}
      {(o.kind === 'door' || o.kind === 'double_door') && <HandleOptions o={raw} w={w} design={design} inside={inside} />}
      {(o.kind === 'door' || o.kind === 'double_door') && <DoorStopOptions o={raw} w={w} design={design} inside={inside} />}
      {(o.kind === 'window' || o.kind === 'sliding_door' || o.kind === 'stacker_door') && <DressingOptions o={raw} inside={inside} />}
      {o.kind === 'garage_door' && (
        <Field label="Style">
          <select
            value={o.style ?? 'sectional'}
            onChange={(e) => {
              const style = e.target.value as GarageStyle;
              upd('openings', o.id, { style, color: GARAGE_STYLES[style].color });
            }}
          >
            {(Object.keys(GARAGE_STYLES) as GarageStyle[]).map((k) => (
              <option key={k} value={k}>
                {GARAGE_STYLES[k].name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {o.kind === 'garage_door' && o.style !== 'timber' ? (
        <ColorField
          label="Colorbond®"
          value={o.color}
          onChange={(col) => upd('openings', o.id, { color: col })}
          swatches={COLORBOND.map((c) => c.hex)}
          names={Object.fromEntries(COLORBOND.map((c) => [c.hex, c.name]))}
        />
      ) : (
        <ColorField label="Colour" value={o.color} onChange={(col) => upd('openings', o.id, follows ? { design: o.design, glass: o.glass, color: col } : { color: col })} paint="timber" />
      )}
      {hasOpeningTrim(o.kind) && <OpeningTrimOptions o={raw} design={design} />}
      <Actions />
    </Section>
  );
}

/** Trim (architraves) round a door or window, and whether a window has a sill. */
function OpeningTrimOptions({ o, design }: { o: Opening; design: Design }) {
  const t = openingTrim(design, o);
  const setTrim = (patch: Partial<NonNullable<Opening['trim']>>) => {
    const next = { ...o.trim, ...patch };
    for (const k of Object.keys(next) as (keyof typeof next)[]) if (next[k] === undefined) delete next[k];
    upd('openings', o.id, { trim: Object.keys(next).length ? next : undefined });
  };
  const houseWidth = houseTrimWidth(design, o.kind);
  return (
    <>
      <div className="sub-head">Trim</div>
      <TrimSelect<SkirtingType>
        label="Type"
        kind="skirting"
        options={SKIRTINGS}
        value={o.trim?.type ?? null}
        inherit={`House (${SKIRTINGS[houseTrimType(design)].name})`}
        onChange={(v) => setTrim({ type: v ?? undefined })}
      />
      {t.type !== 'none' && (
        <>
          <NumField label="Width" value={t.width} min={0} max={300} onChange={(v) => setTrim({ width: v })} hint="Face width of the trim (architraves)" />
          <div className="presets">
            {[42, 66, 90].map((p) => (
              <button key={p} className={o.trim?.width === p ? 'on' : ''} onClick={() => setTrim({ width: p })}>
                {p}
              </button>
            ))}
            <button className={o.trim?.width === undefined ? 'on' : ''} onClick={() => setTrim({ width: undefined })} title={`The house setting (${houseWidth} mm)`}>
              House
            </button>
          </div>
        </>
      )}
      {o.kind === 'window' && (
        <Field label="Bottom">
          <span className="presets inline">
            <button className={o.windowSill !== false ? 'on' : ''} onClick={() => upd('openings', o.id, { windowSill: undefined })} title="A sill, with trim under it">
              Sill
            </button>
            <button className={o.windowSill === false ? 'on' : ''} onClick={() => upd('openings', o.id, { windowSill: false })} title="No sill: the trim runs right round">
              Trim only
            </button>
          </span>
        </Field>
      )}
    </>
  );
}

function ItemProps({ it }: { it: Item }) {
  const def = ITEM_MAP[it.type];
  const set = (patch: Partial<Item>) => upd('items', it.id, patch);
  return (
    <Section title={def?.name ?? 'Item'}>
      <TextField label="Label" value={it.name} onChange={(v) => set({ name: v })} />
      <NumField label="Width" value={it.width} min={10} onChange={(v) => set({ width: v })} />
      <NumField label="Depth" value={it.depth} min={5} onChange={(v) => set({ depth: v })} />
      <NumField label="Height" value={it.height} min={5} onChange={(v) => set({ height: v })} />
      <NumField label="Off floor" value={it.elevation} min={0} onChange={(v) => set({ elevation: v })} hint="Height of the bottom of the item above the floor" />
      <NumField label="X" value={it.x} onChange={(v) => set({ x: v })} />
      <NumField label="Y" value={it.y} onChange={(v) => set({ y: v })} />
      <NumField label="Rotation" value={it.rotation} suffix="°" step={15} onChange={(v) => set({ rotation: normAngle(v) })} />
      <div className="presets">
        <button onClick={() => rotateSelection(-90)}>↺ 90°</button>
        <button onClick={() => rotateSelection(90)}>↻ 90°</button>
        <button onClick={() => rotateSelection(180)}>180°</button>
        {def && (
          <button
            onClick={() => set({ width: def.width, depth: def.depth, height: def.height, elevation: def.elevation ?? 0 })}
            title="Restore the default size"
          >
            Reset size
          </button>
        )}
      </div>
      <ColorField label="Colour" value={it.color} onChange={(c) => set({ color: c })} />
      {(it.type === 'veranda' || it.type === 'porch') && <UnderRoof it={it} />}
      {it.type === 'column' && <ColumnSupport it={it} />}
      {it.type === 'kaboodle' && <KaboodleOptions it={it} />}
      {it.type === 'vanity_tl' && <TimberlineOptions it={it} />}
      {it.type.startsWith('abi_') && <AbiOptions it={it} />}
      <ProductLinkRow it={it} />
      {(it.type === 'banquette' || it.type === 'banquette_l') && <BanquetteOptions it={it} />}
      {(it.type === 'skylight' || it.type === 'sun_tunnel') && <SkylightOptions it={it} />}
      {it.type === 'solar_array' && <SolarOptions it={it} />}
      {it.type.startsWith('shelving_rack') && (
        <>
          <Field label="Tiers">
            <span className="presets inline">
              {[2, 3, 4, 5, 6].map((k) => (
                <button key={k} className={Number(it.options?.tiers ?? (it.height > 2000 ? 5 : 4)) === k ? 'on' : ''} onClick={() => set({ options: { ...(it.options ?? {}), tiers: k } })}>
                  {k}
                </button>
              ))}
            </span>
          </Field>
          <ColorField label="Shelves" value={String(it.options?.board ?? '#c9a878')} onChange={(c) => set({ options: { ...(it.options ?? {}), board: c } })} swatches={['#c9a878', '#e9e4da', '#9b9ea2', '#2b2d30']} names={{ '#c9a878': 'Particleboard', '#e9e4da': 'White melamine', '#9b9ea2': 'Galvanised steel', '#2b2d30': 'Black steel' }} />
          <p className="note">Colour (above) is the steel frame. Heavy duty units like this are rated about 600 kg per shelf, evenly spread — check the product label.</p>
        </>
      )}
      {it.type === 'sofa_corner' && (
        <Field label="Return on">
          <span className="presets inline">
            {(['left', 'right'] as const).map((k) => (
              <button
                key={k}
                className={(it.options?.corner ?? 'left') === k ? 'on' : ''}
                onClick={() => set({ options: { ...(it.options ?? {}), corner: k } })}
                title="Which side the chaise / return is on"
              >
                {k === 'left' ? 'Left' : 'Right'}
              </button>
            ))}
          </span>
        </Field>
      )}
      {it.type === 'buffet_lombardozzi' && (
        <Field label="Size">
          <span className="presets inline">
            {[1100, 1580, 2070].map((wd) => (
              <button key={wd} className={it.width === wd ? 'on' : ''} onClick={() => set({ width: wd })} title={`${wd / 10} cm model`}>
                {wd / 10} cm
              </button>
            ))}
          </span>
        </Field>
      )}
      <Actions />
    </Section>
  );
}

function RoomProps({ r }: { r: Room }) {
  const set = (patch: Partial<Room>) => upd('rooms', r.id, patch);
  const walls = useStore((s) => s.design.walls);
  const ri = roomInterior(r.points, walls);
  const perim = r.points.reduce((s, p, i) => s + dist(p, r.points[(i + 1) % r.points.length]), 0);
  return (
    <Section title="Room / floor">
      <TextField label="Name" value={r.name} onChange={(v) => set({ name: v })} />
      {isKitchenRoom(r) && (
        <div className="kd-open">
          <button className="primary" onClick={() => openKitchenDesigner(r.id)}>
            Open kitchen designer
          </button>
          <p className="note">Lay out the kitchen with Kaboodle cabinets, pick door colours, benchtops and handles, and get a shopping list.</p>
        </div>
      )}
      <RoomFinishes r={r} />
      {ri?.rect && (
        <Field label="Internal size">
          <span className="readout">
            {Math.round(ri.rect[0])} × {Math.round(ri.rect[1])} mm
          </span>
        </Field>
      )}
      <Field label="Floor area">
        <span className="readout" title="Inside the walls — the area to floor">
          {formatArea(ri?.area ?? polygonArea(r.points))}
        </span>
      </Field>
      <Field label="To wall centres">
        <span className="readout">{formatArea(polygonArea(r.points))}</span>
      </Field>
      {ri && !ri.rect && (
        <Field label="Internal sides">
          <span className="readout">{ri.edges.map((e) => Math.round(e.length)).join(' · ')} mm</span>
        </Field>
      )}
      <Field label="Perimeter">
        <span className="readout">{Math.round(perim)} mm</span>
      </Field>
      <p className="note">Drag corner handles to reshape. Drag the selected floor to move it.</p>
      <Actions />
    </Section>
  );
}

function DesignProps({ design }: { design: Design }) {
  const s = design.settings;
  const setS = (patch: Partial<Design['settings']>) => store.update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const area = design.rooms.reduce((a, r) => a + (roomInterior(r.points, design.walls)?.area ?? 0), 0);
  return (
    <>
      <Section title="Design">
        <TextField label="Name" value={design.name} onChange={(v) => store.update((d) => ({ ...d, name: v }))} />
        <Field label="Floor area">
          <span className="readout">{formatArea(area)}</span>
        </Field>
        <Field label="Contents">
          <span className="readout">
            {design.walls.length} walls · {design.openings.length} openings · {design.items.length} items
          </span>
        </Field>
      </Section>
      <RenderQualityPicker />
      <Section title="Roof">
        {design.roof ? (
          <p className="note">
            {STYLE_NAMES[design.roof.style]} roof, {design.roof.pitch}° pitch.{' '}
            <a href="#" onClick={(e) => (e.preventDefault(), addOrSelectRoof())}>
              Edit roof
            </a>
          </p>
        ) : (
          <>
            <p className="note">Adds a roof worked out from your walls. It updates automatically as you change the plan.</p>
            <button className="primary" onClick={addOrSelectRoof}>
              Add roof
            </button>
          </>
        )}
      </Section>
      <GlobalSettings design={design} />
      <InteriorDoorSettings design={design} />
      <InteriorSettings design={design} />
      <Section title="Snapping & display">
        <NumField label="Snap grid" value={s.snap} min={1} max={1000} onChange={(v) => setS({ snap: v })} />
        <Presets values={[10, 50, 100, 500]} current={s.snap} onPick={(v) => setS({ snap: v })} />
        <Toggle label="Show wall lengths" value={s.showDimensions} onChange={(v) => setS({ showDimensions: v })} />
        <Toggle label="Show room sizes (width × length and area)" value={s.showRoomDimensions} onChange={(v) => setS({ showRoomDimensions: v })} />
        <Toggle label="Show each room's side measurements" value={!!s.showRoomSides} onChange={(v) => setS({ showRoomSides: v })} />
        <Toggle label="Show clearance measurements (green gaps to walls and items)" value={!!s.showClearances} onChange={(v) => setS({ showClearances: v })} />
      </Section>
      <Section title="Shortcuts">
        <dl className="shortcuts">
          <dt>V / W / B / A / M</dt>
          <dd>Select / Wall / Room box / Floor area / Measure</dd>
          <dt>Del</dt>
          <dd>Delete selection</dd>
          <dt>R / Shift+R</dt>
          <dd>Rotate item 90°</dd>
          <dt>Ctrl+D</dt>
          <dd>Duplicate</dd>
          <dt>Arrows</dt>
          <dd>Nudge 10 mm (Shift: 100 mm)</dd>
          <dt>Ctrl+Z / Ctrl+Y</dt>
          <dd>Undo / Redo</dd>
          <dt>Ctrl+S</dt>
          <dd>Save</dd>
          <dt>F</dt>
          <dd>Zoom to fit</dd>
          <dt>Shift (hold)</dt>
          <dd>Disable snapping</dd>
          <dt>Space + drag</dt>
          <dd>Pan</dd>
        </dl>
      </Section>
      <Section title="About">
        <p className="note">
          Home Designer is a design and visualisation tool only — not building, structural or engineering advice. Measurements and
          estimates are approximate.
        </p>
      </Section>
      <footer className="props-footer">
        <a href="#" onClick={(e) => (e.preventDefault(), openLegal('terms'))}>
          Terms of Service
        </a>
        <a href="#" onClick={(e) => (e.preventDefault(), openLegal('privacy'))}>
          Privacy Policy
        </a>
        <a href="#" onClick={(e) => (e.preventDefault(), openLegal('disclosure'))}>
          Brand Disclosure
        </a>
      </footer>
    </>
  );
}

const STYLE_NAMES: Record<RoofStyle, string> = { hip: 'Hip', gable: 'Gable', skillion: 'Skillion', flat: 'Flat' };
const STYLE_HINTS: Record<RoofStyle, string> = {
  hip: 'Slopes on every side',
  gable: 'Two slopes with triangular wall ends',
  skillion: 'A single sloping plane',
  flat: 'Flat (low-pitch) roof',
};

function RoofProps({ roof, design }: { roof: Roof; design: Design }) {
  const set = (patch: Partial<Roof>) => store.update((d) => ({ ...d, roof: d.roof ? { ...d.roof, ...patch } : d.roof }));
  const result = generateRoof(design, roof);
  const autoPlate = Math.max(0, ...design.walls.map((w) => w.height));
  return (
    <Section title="Roof">
      <p className="note warn">The roof tool is extremely buggy and doesn’t work well most of the time. Expect odd shapes, gaps or no roof at all.</p>
      <div className="roof-styles">
        {(Object.keys(STYLE_NAMES) as RoofStyle[]).map((st) => (
          <button key={st} className={roof.style === st ? 'on' : ''} onClick={() => set({ style: st })} title={STYLE_HINTS[st]}>
            <RoofIcon style={st} />
            {STYLE_NAMES[st]}
          </button>
        ))}
      </div>
      {'error' in result ? (
        <p className="note warn">{result.error}</p>
      ) : (
        <>
          <Field label="Ridge height">
            <span className="readout">{Math.round(result.ridge)} mm</span>
          </Field>
          {result.note && <p className="note">{result.note}</p>}
          {result.offSquare > 0 && (
            <p className="note warn">
              {result.offSquare} wall{result.offSquare === 1 ? ' is' : 's are'} slightly out of square. The roof allows for it, but squaring
              them up gives cleaner corners.{' '}
              <a href="#" onClick={(e) => (e.preventDefault(), squareUpWallsWithMessage())}>
                Square up walls
              </a>
            </p>
          )}
        </>
      )}
      {roof.style !== 'flat' && (
        <>
          <NumField label="Pitch" value={roof.pitch} min={1} max={60} step={2.5} suffix="°" onChange={(v) => set({ pitch: v })} />
          <div className="presets">
            {[15, 22.5, 25, 30, 35].map((p) => (
              <button key={p} className={roof.pitch === p ? 'on' : ''} onClick={() => set({ pitch: p })}>
                {p}°
              </button>
            ))}
          </div>
        </>
      )}
      {(roof.style === 'hip' || roof.style === 'gable') && (
        <div className="toggles">
          <Toggle label="Level ridges (same height on every wing)" value={roof.levelRidges !== false} onChange={(v) => set({ levelRidges: v })} />
        </div>
      )}
      {roof.style === 'skillion' && (
        <Field label="Rises towards">
          <span className="presets inline">
            {([0, 90, 180, 270] as const).map((a) => (
              <button key={a} className={roof.skillionDir === a ? 'on' : ''} onClick={() => set({ skillionDir: a })}>
                {['→', '↓', '←', '↑'][a / 90]}
              </button>
            ))}
          </span>
        </Field>
      )}
      <NumField label="Eaves overhang" value={roof.overhang} min={0} max={2000} onChange={(v) => set({ overhang: v })} />
      <div className="presets">
        {[0, 300, 450, 600].map((p) => (
          <button key={p} className={roof.overhang === p ? 'on' : ''} onClick={() => set({ overhang: p })}>
            {p}
          </button>
        ))}
      </div>
      <NumField
        label="Sits at"
        value={roof.eaveHeight ?? autoPlate}
        min={100}
        max={20000}
        onChange={(v) => set({ eaveHeight: v })}
        hint="Height of the wall tops the roof sits on"
      />
      <div className="toggles">
        <Toggle label="Use tallest wall height" value={roof.eaveHeight === null} onChange={(on) => set({ eaveHeight: on ? null : autoPlate })} />
      </div>
      <NumField label="Roof thickness" value={roof.fascia} min={20} max={600} onChange={(v) => set({ fascia: v })} />
      <RoofExtensions roof={roof} set={set} />
      <RoofingOptions roof={roof} set={set} />
      <p className="note">The roof follows your walls automatically. In 3D, “Cutaway walls” or the Roof button hides it so you can see inside.</p>
      <Actions duplicate={false} />
    </Section>
  );
}

/** Areas the roof is pulled out over (made by dragging the arrows on its edges in the plan). */
function RoofExtensions({ roof, set }: { roof: Roof; set: (patch: Partial<Roof>) => void }) {
  const selId = useStore((s) => (s.selection?.kind === 'roof' ? s.selection.id : null));
  const list = roof.extensions ?? [];
  const setExt = (id: string, patch: Partial<RoofExtension>) => set({ extensions: list.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  return (
    <>
      <div className="sub-head">Roof extensions</div>
      {list.length === 0 && (
        <p className="note">
          To roof over a patio, drag one of the arrows on the roof’s edges out in the plan. Adding a column outside the house also pulls the roof out
          over it.
        </p>
      )}
      {list.map((x, i) => (
        <div key={x.id} className={selId === x.id ? 'roof-ext-row on' : 'roof-ext-row'}>
          <Field label={`Extension ${i + 1}`}>
            <a href="#" onClick={(e) => (e.preventDefault(), store.select({ kind: 'roof', id: x.id }))}>
              select
            </a>
            {' · '}
            <a href="#" onClick={(e) => (e.preventDefault(), set({ extensions: list.filter((y) => y.id !== x.id) }))}>
              remove
            </a>
          </Field>
          <NumField label="Along the house" value={x.width} min={300} max={30000} onChange={(v) => setExt(x.id, { width: v })} />
          <NumField label="Out from it" value={x.depth} min={300} max={30000} onChange={(v) => setExt(x.id, { depth: v })} />
        </div>
      ))}
      {list.length > 0 && <p className="note">Drag an extension in the plan to move it, or its side handles to resize it. Del removes the selected one.</p>}
    </>
  );
}

/** A Kaboodle unit: what it is, other sizes of the same kind, and its kitchen. */
function KaboodleOptions({ it }: { it: Item }) {
  const design = useStore((s) => s.design);
  const kitchenOpen = useStore((s) => s.kitchen);
  const o = it.options ?? {};
  const cls = String(o.cls ?? 'base');
  const room = design.rooms.find((r) => r.points.length >= 3 && pointInPolygon({ x: it.x, y: it.y }, r.points));
  const style = kitchenStyle(room);
  const same = KABOODLE_PRODUCTS.filter((p) => p.cls === cls);
  const current = String(o.product ?? it.name);
  return (
    <>
      <div className="sub-head">Kaboodle</div>
      <Field label="Unit">
        <select
          value={current}
          onChange={(e) => {
            const p = same.find((x) => x.name === e.target.value);
            if (p) swapProduct(it.id, p, style);
          }}
        >
          {!same.some((p) => p.name === current) && <option value={current}>{current}</option>}
          {same.map((p, i) => (
            <option key={`${p.name}-${i}`} value={p.name}>
              {p.name} ({p.width})
            </option>
          ))}
        </select>
      </Field>
      <p className="note">
        {[o.door && `Doors: ${o.door}`, isUnderBench(cls) && o.benchName && `benchtop: ${o.benchName}`, o.handleName && `handles: ${o.handleName}`].filter(Boolean).join(' · ')}
        {o.url ? (
          <>
            {' · '}
            <a href={String(o.url)} target="_blank" rel="noreferrer">
              Product page
            </a>
          </>
        ) : null}
      </p>
      {room && isKitchenRoom(room) && kitchenOpen !== room.id && (
        <button onClick={() => openKitchenDesigner(room.id)}>Open kitchen designer</button>
      )}
    </>
  );
}

/** Columns standing outside the house hold up the main roof, which is pulled out over them. */
function ColumnSupport({ it }: { it: Item }) {
  const design = useStore((s) => s.design);
  const res = useMemo(() => (design.roof ? generateRoof(design, design.roof) : null), [design]);
  if (!design.roof) return <p className="note">If you add a roof, it’s pulled out over columns standing outside the house.</p>;
  if (res && !('error' in res) && res.supports.includes(it.id)) return <p className="note">Holds up the main roof: the roof reaches out over it and the column rises to the top of the walls.</p>;
  return <p className="note">Not holding up the roof. Stand it on the floor, at least 1800 mm tall and within 10 m of the house, to extend the roof over it.</p>;
}

function RoofIcon({ style }: { style: RoofStyle }) {
  const d = {
    hip: 'M2 20 L10 10 L22 10 L30 20 Z M10 10 L6 20 M22 10 L26 20',
    gable: 'M2 20 L8 8 L30 8 L30 20 Z M8 8 L14 20 M2 20 L14 20',
    skillion: 'M2 20 L2 14 L30 6 L30 20 Z',
    flat: 'M2 20 L2 13 L30 13 L30 20 Z',
  }[style];
  return (
    <svg viewBox="0 0 32 24" className="roof-icon">
      <path d={d} />
    </svg>
  );
}

/** House-wide settings that apply to every wall / door that uses the general value. */
function GlobalSettings({ design }: { design: Design }) {
  const s = design.settings;
  const setS = (patch: Partial<Design['settings']>) => store.update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const customHeight = design.walls.filter((w) => Math.abs(w.height - s.wallHeight) >= 0.5).length;
  const customColor = design.walls.filter((w) => w.color.toLowerCase() !== s.wallColor.toLowerCase()).length;
  const doors = design.openings.filter((o) => isDoorKind(o.kind));
  const customDoors = doors.filter((o) => Math.abs(o.height - s.doorHeight) >= 0.5).length;
  const exceptions = (n: number, what: string, apply: () => void) =>
    n > 0 && (
      <p className="note">
        {n} {what} set differently and won’t change.{' '}
        <a href="#" onClick={(e) => (e.preventDefault(), apply())}>
          Apply to all
        </a>
      </p>
    );
  return (
    <Section title="Global settings">
      <NumField label="Wall height" value={s.wallHeight} min={100} max={10000} onChange={(v) => setGlobalWallHeight(v)} hint="Ceiling height — applies to every wall using the general height" />
      <Presets values={[2400, 2550, 2700, 3000]} current={s.wallHeight} onPick={(v) => setGlobalWallHeight(v)} />
      {exceptions(customHeight, customHeight === 1 ? 'wall is' : 'walls are', () => setGlobalWallHeight(s.wallHeight, true))}
      <ConstructionPicker design={design} />
      <NumField label="Wall thickness" value={s.wallThickness} min={10} max={1000} onChange={(v) => setS({ wallThickness: v })} hint="Used for new walls" />
      <Presets values={[70, 90, 110, 150, 230, 290]} current={s.wallThickness} onPick={(v) => setS({ wallThickness: v })} />
      <NumField label="Door height" value={s.doorHeight} min={1500} max={3000} onChange={(v) => setGlobalDoorHeight(v)} hint="Hinged, double and cavity doors" />
      <Presets values={[2040, 2100, 2340]} current={s.doorHeight} onPick={(v) => setGlobalDoorHeight(v)} />
      {exceptions(customDoors, customDoors === 1 ? 'door is' : 'doors are', () => setGlobalDoorHeight(s.doorHeight, true))}
      <ColorField label="Wall colour" value={s.wallColor} onChange={(c) => setGlobalWallColor(c)} paint />
      {exceptions(customColor, customColor === 1 ? 'wall is' : 'walls are', () => setGlobalWallColor(s.wallColor, true))}
      <ColorField label="Ceiling colour" value={s.ceilingColor} onChange={(c) => setS({ ceilingColor: c })} paint />
      <NumField
        label="Ceiling height"
        value={s.ceilingHeight ?? Math.max(0, ...design.walls.map((w) => w.height))}
        min={1800}
        max={10000}
        onChange={(v) => setS({ ceilingHeight: v })}
        hint="Shown in walk-through"
      />
      <div className="toggles">
        <Toggle label="Ceiling at the top of the outside walls" value={s.ceilingHeight === null} onChange={(on) => setS({ ceilingHeight: on ? null : Math.max(0, ...design.walls.map((w) => w.height)) })} />
      </div>
      <p className="note">Wall thickness applies to new walls. Change a single wall by selecting it.</p>
      <div className="actions">
        <button onClick={squareUpWallsWithMessage} title="Straighten walls that are a few degrees out of square, keeping corners joined">
          Square up walls
        </button>
        <DuplicateWallsButton design={design} />
      </div>
    </Section>
  );
}

function FacadeProps({ design }: { design: Design }) {
  const sides = exteriorSides(design.walls);
  const outside = design.walls.filter((w) => {
    const sd = sides.map.get(w.id);
    return sd && (sd.pos || sd.neg);
  });
  const own = outside.filter((w) => w.facade).length;
  const set = (f: Facade) => store.update((d) => ({ ...d, facade: f }));
  return (
    <Section title="Facade (outside walls)">
      {!sides.enclosed && (
        <p className="note warn">The outside walls don’t join up into a closed outline yet, so the app can’t tell which faces are outside.</p>
      )}
      <FacadeEditor value={design.facade} onChange={set} />
      <p className="note">
        Applies to the outside face of {outside.length} wall{outside.length === 1 ? '' : 's'} and to gable ends. Inside faces keep their wall colour.
      </p>
      {own > 0 && (
        <p className="note">
          {own} wall{own === 1 ? ' has its' : 's have their'} own finish.{' '}
          <a href="#" onClick={(e) => (e.preventDefault(), store.update((d) => ({ ...d, walls: d.walls.map((w) => (w.facade ? { ...w, facade: null } : w)) })))}>
            Use the house facade everywhere
          </a>
        </p>
      )}
      <p className="note">To mix finishes (e.g. brick at the front, cladding at the back), select a wall and set its own outside finish.</p>
      <p className="note">Colours are screen approximations of Dulux® colours. Check a colour chip before buying.</p>
    </Section>
  );
}

/** Construction of one outside wall (e.g. a double brick garage wall on a brick veneer house). */
function WallConstruction({ w, design }: { w: Wall; design: Design }) {
  const sd = exteriorSides(design.walls).map.get(w.id);
  if (!sd || !(sd.pos || sd.neg)) return null;
  const current = w.construction ?? null;
  return (
    <div className="construction">
      <Field label="Construction">
        <select
          value={current ?? ''}
          onChange={(e) => applyWallConstructionWithMessage(w.id, (e.target.value || null) as Construction | null)}
          title="Rebuilds this wall at this thickness; extra thickness goes outward so the room keeps its size"
        >
          <option value="">None / custom</option>
          {(Object.keys(CONSTRUCTIONS) as Construction[]).map((c) => (
            <option key={c} value={c}>
              {CONSTRUCTIONS[c].name} ({constructionThickness(c)} mm)
            </option>
          ))}
        </select>
      </Field>
      {current && (
        <div className="layers">
          {CONSTRUCTIONS[current].layers.map(([n, t], i) => (
            <span key={i} className={`layer l-${n.split(' ')[0].toLowerCase()}`} style={{ flexGrow: t }} title={`${n} ${t} mm`}>
              {t >= 40 ? t : ''}
            </span>
          ))}
        </div>
      )}
      {current && (
        <button onClick={() => applyWallConstructionWithMessage(w.id, current, true)} title="Apply this construction to every outside wall joined to this one, e.g. a whole shed">
          Apply to whole outline
        </button>
      )}
      {current && current !== design.settings.construction && <p className="note">Differs from the rest of the house. Re-applying the house construction resets it.</p>}
    </div>
  );
}

function WallFacade({ w, design }: { w: Wall; design: Design }) {
  const sd = exteriorSides(design.walls).map.get(w.id);
  if (!sd || !(sd.pos || sd.neg)) return null;
  const own = !!w.facade;
  return (
    <div className="wall-facade">
      <Field label="Outside finish">
        <select
          value={own ? 'own' : 'house'}
          onChange={(e) => upd('walls', w.id, { facade: e.target.value === 'own' ? { ...design.facade } : null })}
        >
          <option value="house">House facade ({FINISHES[design.facade.finish].name})</option>
          <option value="own">This wall only…</option>
        </select>
      </Field>
      {own && <FacadeEditor value={w.facade!} onChange={(f) => upd('walls', w.id, { facade: f })} />}
    </div>
  );
}

/** Porch / veranda: extend the main roof over it (its outer edge then counts as an outside wall). */
function UnderRoof({ it }: { it: Item }) {
  const hasRoof = useStore((s) => !!s.design.roof);
  return (
    <div className="toggles">
      <Toggle label="Extend the main roof over this" value={!!it.underRoof} onChange={(v) => upd('items', it.id, { underRoof: v })} />
      {it.underRoof && !hasRoof && (
        <p className="note warn">
          There’s no main roof yet.{' '}
          <a href="#" onClick={(e) => (e.preventDefault(), addOrSelectRoof())}>
            Add a roof
          </a>
        </p>
      )}
      {it.underRoof && hasRoof && <p className="note">The main roof wraps round this as if its outer edge were an outside wall. Posts rise to the roof’s eaves.</p>}
    </div>
  );
}

/**
 * Board width (timber, hybrid) or tile size and grout width (tiles) for a floor. `reset`: a room's own sizes,
 * back to the house's.
 */
function FloorSizeFields({ finish, size, onChange, reset }: { finish: FloorFinish; size: Required<FloorSize>; onChange: (p: FloorSize) => void; reset?: () => void }) {
  const resetLink = reset && (
    <p className="note">
      This room has its own sizes.{' '}
      <a href="#" onClick={(e) => (e.preventDefault(), reset())}>
        Use the house sizes
      </a>
    </p>
  );
  if (BOARD_FLOORS.has(finish)) {
    const presets = finish === 'timber' ? [85, 130, 180, 220] : [180, 230];
    return (
      <>
        <NumField label="Board width" value={size.board} min={40} max={600} onChange={(v) => onChange({ board: v })} hint="Width of each board / plank (its cover width)" />
        <div className="presets">
          {presets.map((p) => (
            <button key={p} className={size.board === p ? 'on' : ''} onClick={() => onChange({ board: p })}>
              {p}
            </button>
          ))}
        </div>
        {resetLink}
      </>
    );
  }
  if (TILE_FLOORS.has(finish)) {
    const presets: [number, number][] = finish === 'tile' ? [[300, 300], [450, 450], [600, 600], [300, 600]] : [[600, 1200], [750, 1500], [800, 1600], [1200, 1200]];
    return (
      <>
        <Field label="Tile size" hint="Width × length of each tile (length runs in the floor direction)">
          <span className="tile-size">
            <input type="number" min={50} max={3200} value={size.tileW} onChange={(e) => Number(e.target.value) >= 50 && onChange({ tileW: Number(e.target.value) })} aria-label="Tile width" />
            ×
            <input type="number" min={50} max={3200} value={size.tileL} onChange={(e) => Number(e.target.value) >= 50 && onChange({ tileL: Number(e.target.value) })} aria-label="Tile length" />
            mm
          </span>
        </Field>
        <div className="presets">
          {presets.map(([w, l]) => (
            <button key={`${w}x${l}`} className={size.tileW === w && size.tileL === l ? 'on' : ''} onClick={() => onChange({ tileW: w, tileL: l })}>
              {w}×{l}
            </button>
          ))}
        </div>
        <NumField label="Grout" value={size.grout} min={0} max={20} step={0.5} onChange={(v) => onChange({ grout: v })} hint="Width of the grout joints between tiles" />
        <div className="presets">
          {[1.5, 2, 3, 5].map((g) => (
            <button key={g} className={size.grout === g ? 'on' : ''} onClick={() => onChange({ grout: g })}>
              {g} mm
            </button>
          ))}
        </div>
        {resetLink}
      </>
    );
  }
  return null;
}

/** Floor finish + named colour swatches. */
function FloorPicker({ value, onChange }: { value: { finish: FloorFinish; color: string }; onChange: (v: { finish: FloorFinish; color: string }) => void }) {
  const sw = FLOOR_SWATCHES[value.finish] ?? [];
  return (
    <>
      <Field label="Flooring">
        <select value={value.finish} onChange={(e) => onChange({ finish: e.target.value as FloorFinish, color: FLOOR_COLORS[e.target.value] })}>
          {Object.entries(FLOOR_NAMES).map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      <ColorField
        label="Floor colour"
        value={value.color}
        onChange={(c) => onChange({ ...value, color: c })}
        swatches={sw.map((c) => c.hex)}
        names={Object.fromEntries(sw.map((c) => [c.hex, c.name]))}
      />
    </>
  );
}

/** Small cross-section drawing of a cornice / skirting profile. */
function ProfileIcon({ profile, kind }: { profile: TrimProfile; kind: 'cornice' | 'skirting' }) {
  const pts = profile.points;
  return (
    <svg className="profile-icon" viewBox="-6 -6 170 170">
      <rect x="-6" y="-6" width="6" height="176" className="pi-wall" />
      {kind === 'cornice' && <rect x="-6" y="-6" width="176" height="6" className="pi-wall" />}
      {kind === 'skirting' && <rect x="-6" y="158" width="176" height="6" className="pi-wall" />}
      {pts.length > 0 && (
        <polygon
          points={pts.map(([x, y]) => `${x},${kind === 'cornice' ? y : 158 - y}`).join(' ')}
          className={profile.shadow ? 'pi-shadow' : 'pi-trim'}
        />
      )}
    </svg>
  );
}

function TrimSelect<T extends string>(props: {
  label: string;
  kind: 'cornice' | 'skirting';
  options: Record<T, TrimProfile>;
  value: T | null;
  inherit?: string; // label for "use the house setting"
  onChange: (v: T | null) => void;
}) {
  const current = props.value ? props.options[props.value] : null;
  return (
    <Field label={props.label}>
      <span className="trim-select">
        <ProfileIcon profile={current ?? props.options[Object.keys(props.options)[0] as T]} kind={props.kind} />
        <select value={props.value ?? ''} onChange={(e) => props.onChange((e.target.value || null) as T | null)}>
          {props.inherit && <option value="">{props.inherit}</option>}
          {(Object.keys(props.options) as T[]).map((k) => (
            <option key={k} value={k}>
              {props.options[k].name}
            </option>
          ))}
        </select>
      </span>
    </Field>
  );
}

/** House-wide flooring, cornice and skirting. */
function InteriorSettings({ design }: { design: Design }) {
  const s = design.settings;
  const setS = (patch: Partial<Design['settings']>) => store.update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const own = design.rooms.filter((r) => r.floor || r.cornice || r.skirting).length;
  return (
    <Section title="Floors, cornices & skirting">
      <FloorPicker
        value={s.flooring}
        // A different finish starts from its own default sizes.
        onChange={(f) => setS({ flooring: { ...s.flooring, ...f, size: f.finish === s.flooring.finish ? s.flooring.size : undefined } })}
      />
      <FloorSizeFields
        finish={s.flooring.finish}
        size={floorOf(design, null).size}
        onChange={(p) => setS({ flooring: { ...s.flooring, size: { ...s.flooring.size, ...p } } })}
      />
      {DIRECTIONAL_FLOORS.has(s.flooring.finish) && (
        <BoardDirection value={s.flooring.direction ?? 0} onChange={(dir) => setS({ flooring: { ...s.flooring, direction: dir ?? 0 } })} />
      )}
      <Field label="Wall lining">
        <select value={s.wallLining ?? 'plaster'} onChange={(e) => setS({ wallLining: e.target.value as LiningType })}>
          {(Object.keys(LININGS) as LiningType[]).map((k) => (
            <option key={k} value={k}>
              {LININGS[k]}
            </option>
          ))}
        </select>
      </Field>
      <TrimSelect<CorniceType> label="Cornice" kind="cornice" options={CORNICES} value={s.cornice} onChange={(v) => setS({ cornice: v ?? 'none' })} />
      <TrimSelect<SkirtingType> label="Skirting" kind="skirting" options={SKIRTINGS} value={s.skirting} onChange={(v) => setS({ skirting: v ?? 'none' })} />
      <ColorField label="Skirting colour" value={s.skirtingColor} onChange={(c) => setS({ skirtingColor: c })} paint="timber" />
      <NumField
        label="Window trim"
        value={s.windowTrim ?? WINDOW_TRIM}
        min={0}
        max={200}
        onChange={(v) => setS({ windowTrim: v })}
        hint="Width of the trim (architraves) round the inside of windows; 0 for none"
      />
      <div className="presets">
        {[0, 42, 66, 90].map((p) => (
          <button key={p} className={(s.windowTrim ?? WINDOW_TRIM) === p ? 'on' : ''} onClick={() => setS({ windowTrim: p })}>
            {p === 0 ? 'None' : p}
          </button>
        ))}
      </div>
      <p className="note">
        These apply to the whole house. Cornices use the ceiling colour. Select a room to give it its own floor, cornice or skirting (e.g. a bathroom with tiles, a
        square-set ceiling and no skirting).
        {own > 0 && (
          <>
            {' '}
            {own} room{own === 1 ? ' has' : 's have'} their own.{' '}
            <a href="#" onClick={(e) => (e.preventDefault(), store.update((d) => ({ ...d, rooms: d.rooms.map((r) => ({ ...r, floor: null, color: null, cornice: null, skirting: null })) })))}>
              Use the house settings everywhere
            </a>
          </>
        )}
      </p>
      {design.rooms.length === 0 && (
        <p className="note warn">
          No rooms yet. To set finishes per room, draw rooms with the Room / Floor tools or{' '}
          <a href="#" onClick={(e) => (e.preventDefault(), detectRoomsWithMessage())}>
            detect rooms from the walls
          </a>
          .
        </p>
      )}
    </Section>
  );
}

/** Per-room flooring, cornice and skirting, each defaulting to the house setting. */
function RoomFinishes({ r }: { r: Room }) {
  const d = useStore((s) => s.design);
  const set = (patch: Partial<Room>) => upd('rooms', r.id, patch);
  const s = d.settings;
  return (
    <div className="room-finishes">
      <Field label="Flooring">
        <select
          value={r.floor ? 'own' : 'house'}
          onChange={(e) => set(e.target.value === 'own' ? { floor: s.flooring.finish, color: s.flooring.color } : { floor: null, color: null })}
        >
          <option value="house">House flooring ({FLOOR_NAMES[s.flooring.finish]})</option>
          <option value="own">This room only…</option>
        </select>
      </Field>
      {r.floor && (
        <FloorPicker
          value={{ finish: r.floor, color: r.color ?? FLOOR_COLORS[r.floor] }}
          onChange={(f) => set({ floor: f.finish, color: f.color, ...(f.finish !== r.floor ? { floorSize: null } : {}) })}
        />
      )}
      <FloorSizeFields
        finish={r.floor ?? s.flooring.finish}
        size={floorOf(d, r).size}
        onChange={(p) => set({ floorSize: { ...r.floorSize, ...p } })}
        reset={r.floorSize ? () => set({ floorSize: null }) : undefined}
      />
      {DIRECTIONAL_FLOORS.has(r.floor ?? s.flooring.finish) && (
        <BoardDirection
          value={r.floorDirection ?? null}
          house={s.flooring.direction ?? 0}
          longest={longestWallDirection(r)}
          onChange={(dir) => set({ floorDirection: dir })}
        />
      )}
      <Field label="Wall lining">
        <select value={r.wallLining ?? ''} onChange={(e) => set({ wallLining: (e.target.value || null) as LiningType | null })}>
          <option value="">House lining ({LININGS[s.wallLining ?? 'plaster']})</option>
          {(Object.keys(LININGS) as LiningType[]).map((k) => (
            <option key={k} value={k}>
              {LININGS[k]}
            </option>
          ))}
        </select>
      </Field>
      <TrimSelect<CorniceType>
        label="Cornice"
        kind="cornice"
        options={CORNICES}
        value={r.cornice ?? null}
        inherit={`House cornice (${CORNICES[s.cornice].name})`}
        onChange={(v) => set({ cornice: v })}
      />
      <TrimSelect<SkirtingType>
        label="Skirting"
        kind="skirting"
        options={SKIRTINGS}
        value={r.skirting ?? null}
        inherit={`House skirting (${SKIRTINGS[s.skirting].name})`}
        onChange={(v) => set({ skirting: v })}
      />
      <div className="presets">
        <button onClick={() => set({ floor: 'tile', color: FLOOR_COLORS.tile, cornice: 'square_set', skirting: 'none' })} title="Tiled floor, square-set ceiling, no skirting">
          Wet area preset
        </button>
      </div>
    </div>
  );
}

/** Outside wall construction (brick veneer etc.): thickens the outside walls outward, keeping room sizes. */
function ConstructionPicker({ design }: { design: Design }) {
  const current = design.settings.construction ?? null;
  return (
    <div className="construction">
      <Field label="Outside walls">
        <select
          value={current ?? ''}
          onChange={(e) => e.target.value && applyConstructionWithMessage(e.target.value as Construction)}
          title="Rebuilds every outside wall at this thickness; extra thickness goes outward so rooms keep their size"
        >
          <option value="">Choose construction…</option>
          {(Object.keys(CONSTRUCTIONS) as Construction[]).map((c) => (
            <option key={c} value={c}>
              {CONSTRUCTIONS[c].name} ({constructionThickness(c)} mm)
            </option>
          ))}
        </select>
      </Field>
      {current && (
        <>
          <div className="layers">
            {CONSTRUCTIONS[current].layers.map(([n, t], i) => (
              <span key={i} className={`layer l-${n.split(' ')[0].toLowerCase()}`} style={{ flexGrow: t }} title={`${n} ${t} mm`}>
                {t >= 40 ? t : ''}
              </span>
            ))}
          </div>
          <p className="note">
            {CONSTRUCTIONS[current].layers.map(([n, t]) => `${n} ${t}`).join(' · ')} (outside → in).{' '}
            <a href="#" onClick={(e) => (e.preventDefault(), applyConstructionWithMessage(current))}>
              Re-apply
            </a>{' '}
            after adding outside walls.
          </p>
        </>
      )}
    </div>
  );
}

function DuplicateWallsButton({ design }: { design: Design }) {
  const n = useMemo(() => duplicateWalls(design).length, [design]);
  if (!n) return null;
  return (
    <button onClick={removeDuplicateWallsWithMessage} title="Walls drawn on top of other walls (e.g. by the Room tool over existing walls)">
      Remove {n} doubled-up wall{n === 1 ? '' : 's'}
    </button>
  );
}

const DIRECTIONS: { deg: number; label: string; title: string }[] = [
  { deg: 0, label: '↔', title: 'Left to right on the plan' },
  { deg: 90, label: '↕', title: 'Top to bottom on the plan' },
  { deg: 45, label: '⤢', title: 'Diagonal' },
  { deg: 135, label: '⤡', title: 'Diagonal (other way)' },
];

/** Which way boards / planks run. With `house`, null means "same as the house". */
function BoardDirection(props: { value: number | null; house?: number; longest?: number; onChange: (deg: number | null) => void }) {
  const name = (deg: number) => DIRECTIONS.find((x) => x.deg === ((deg % 180) + 180) % 180)?.label ?? `${deg}°`;
  return (
    <Field label="Boards run">
      <span className="presets inline">
        {props.house !== undefined && (
          <button className={props.value === null ? 'on' : ''} onClick={() => props.onChange(null)} title="Same direction as the house flooring">
            House {name(props.house)}
          </button>
        )}
        {DIRECTIONS.map((d) => (
          <button key={d.deg} className={props.value === d.deg ? 'on' : ''} onClick={() => props.onChange(d.deg)} title={d.title}>
            {d.label}
          </button>
        ))}
        {props.longest !== undefined && (
          <button onClick={() => props.onChange(props.longest!)} title="Run the boards along the room's longest side">
            Along longest wall
          </button>
        )}
      </span>
    </Field>
  );
}

/** Direction (degrees) of a room's longest side. */
function longestWallDirection(r: Room): number {
  let best = 0;
  let bestLen = -1;
  r.points.forEach((p, i) => {
    const q = r.points[(i + 1) % r.points.length];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len > bestLen) {
      bestLen = len;
      best = Math.round((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI);
    }
  });
  return ((best % 180) + 180) % 180;
}

/** Hinged doors: jamb type, leaf design (Hume entrance ranges) and glass. */
function DoorOptions({ o, follows, inside }: { o: Opening; follows: boolean; inside: boolean }) {
  const house = useStore((st) => st.design.settings.interiorDoor ?? DEFAULT_INTERIOR_DOOR);
  const set = (patch: Partial<Opening>) => upd('openings', o.id, patch);
  const design = o.design && DOOR_DESIGNS[o.design] ? o.design : 'flush';
  const info = DOOR_DESIGNS[design];
  return (
    <>
      <Field label="Door jamb">
        <span className="presets inline">
          <button className={o.jamb !== 'double' ? 'on' : ''} onClick={() => set({ jamb: 'single' })} title="One rebate: the door closes against a stop near one face">
            Single rebated
          </button>
          <button className={o.jamb === 'double' ? 'on' : ''} onClick={() => set({ jamb: 'double' })} title="Two rebates: a centre stop with a rebate each side (e.g. for a screen door)">
            Double rebated
          </button>
        </span>
      </Field>
      <Field label="Door design">
        <select
          value={follows ? '' : design}
          onChange={(e) => {
            if (!e.target.value) {
              // Back to the house interior-door style.
              set({ design: undefined, glass: undefined, jamb: undefined, color: house.color });
              return;
            }
            const d = e.target.value as DoorDesign;
            const def = DOOR_DESIGNS[d];
            const types = def.glassTypes ?? ['clear', 'translucent'];
            set({ design: d, color: def.color, glass: def.glass ? (o.glass && types.includes(o.glass) ? o.glass : types[types.length > 2 ? 0 : 1]) : undefined } as Partial<Opening>);
          }}
        >
          {inside && <option value="">House interior door ({DOOR_DESIGNS[house.design]?.name ?? 'Flush'})</option>}
          {[...new Set(Object.values(DOOR_DESIGNS).map((x) => x.group))].map((grp) => (
            <optgroup key={grp} label={grp}>
              {Object.entries(DOOR_DESIGNS)
                .filter(([, x]) => x.group === grp)
                .map(([k, x]) => (
                  <option key={k} value={k}>
                    {x.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </Field>
      {info.glass && (
        <Field label="Glass">
          <span className="presets inline">
            {(info.glassTypes ?? ['clear', 'translucent']).map((g) => {
              const types = info.glassTypes ?? ['clear', 'translucent'];
              const current = o.glass && types.includes(o.glass) ? o.glass : types[types.length > 2 ? 0 : 1];
              return (
                <button key={g} className={current === g ? 'on' : ''} onClick={() => set({ glass: g as Opening['glass'] })}>
                  {g[0].toUpperCase() + g.slice(1)}
                </button>
              );
            })}
          </span>
        </Field>
      )}
      {o.kind === 'door' && <SidelightOptions o={o} />}
      {info.models && (
        <p className="note">
          Based on the {info.models}.{info.note ? ` ${info.note}` : ''} Check the maker’s current catalogue for the exact model, panel and glass layout.
        </p>
      )}
    </>
  );
}

/** Per-wall lining (VJ etc.) for each inside face, overriding the room's lining. */
function WallLining({ w, design }: { w: Wall; design: Design }) {
  const faces = wallFaces(design, w);
  if (!faces.length) return null;
  const setFace = (side: 1 | -1, v: LiningType | null) =>
    upd('walls', w.id, { lining: { ...(w.lining ?? {}), [side > 0 ? 'pos' : 'neg']: v } });
  const setAll = (v: LiningType | null) =>
    upd('walls', w.id, { lining: Object.fromEntries(faces.map((f) => [f.side > 0 ? 'pos' : 'neg', v])) as Wall['lining'] });
  return (
    <div className="wall-lining">
      {faces.map((f) => {
        const own = w.lining?.[f.side > 0 ? 'pos' : 'neg'] ?? null;
        const inherited = liningFor(design, f.room);
        return (
          <Field key={f.side} label={faces.length > 1 ? `Lining: ${f.label}` : 'Wall lining'}>
            <select value={own ?? ''} onChange={(e) => setFace(f.side, (e.target.value || null) as LiningType | null)} title={f.label}>
              <option value="">{f.room ? 'Room' : 'House'} default ({LININGS[inherited]})</option>
              {(Object.keys(LININGS) as LiningType[]).map((k) => (
                <option key={k} value={k}>
                  {LININGS[k]}
                </option>
              ))}
            </select>
          </Field>
        );
      })}
      <div className="presets">
        {faces.length > 1 && (
          <button onClick={() => setAll('vj')} title="VJ panelling on both faces of this wall">
            VJ both sides
          </button>
        )}
        {faces.map((f) => (
          <button key={f.side} onClick={() => setFace(f.side, 'vj')} title={`VJ panelling on the ${f.label} face only`}>
            VJ {faces.length > 1 ? (f.room ? f.room.name : f.label.replace(/ \(.*\)$/, '')) : 'this wall'}
          </button>
        ))}
        {w.lining && (
          <button onClick={() => upd('walls', w.id, { lining: undefined })} title="Use the room / house lining again">
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

/** Front door sidelights: fixed glazed panels beside the door. The door keeps its size; the opening widens. */
function SidelightOptions({ o }: { o: Opening }) {
  const design = DOOR_DESIGNS[o.design ?? ''];
  const standard = design?.sidelightWidths ?? [];
  const cur = o.sidelight ?? { hinge: false, latch: false, width: standard[standard.length - 1] ?? 400 };
  const apply = (next: { hinge: boolean; latch: boolean; width: number }) => {
    const before = sidelights(o);
    const after = sidelights({ ...o, sidelight: next });
    const grow = after.left + after.right - before.left - before.right;
    // Keep the door itself where it is: shift the centre by half the change on each side.
    const shift = (after.right - before.right - (after.left - before.left)) / 2;
    upd('openings', o.id, { sidelight: next.hinge || next.latch ? next : undefined, width: o.width + grow, offset: o.offset + shift });
  };
  const mode = cur.hinge && cur.latch ? 'both' : cur.hinge ? 'hinge' : cur.latch ? 'latch' : 'none';
  const setMode = (m: string) => apply({ ...cur, hinge: m === 'hinge' || m === 'both', latch: m === 'latch' || m === 'both' });
  return (
    <>
      <Field label="Sidelight">
        <span className="presets inline">
          {(
            [
              ['none', 'None'],
              ['hinge', 'Hinge side'],
              ['latch', 'Latch side'],
              ['both', 'Both'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
              {label}
            </button>
          ))}
        </span>
      </Field>
      {mode !== 'none' && (
        <>
          <Field label="Sidelight width">
            <span className="presets inline">
              {[...new Set([300, 350, 400, 420, 500, 600, ...standard])]
                .sort((a, b) => a - b)
                .map((wd) => (
                  <button
                    key={wd}
                    className={`${cur.width === wd ? 'on' : ''}${standard.includes(wd) ? ' std' : ''}`}
                    onClick={() => apply({ ...cur, width: wd })}
                    title={standard.includes(wd) ? 'Standard width for this door' : undefined}
                  >
                    {wd}
                  </button>
                ))}
            </span>
          </Field>
          <p className="note">
            Door {Math.round(o.width - sidelights(o).left - sidelights(o).right)} mm + sidelight{cur.hinge && cur.latch ? 's' : ''} = {Math.round(o.width)} mm overall
            opening. Sidelights use the door’s colour and glass{design?.sidelight ? ' and match its design' : ''}.
          </p>
        </>
      )}
    </>
  );
}

/** Timberline vanity: range, size and look. */
function TimberlineOptions({ it }: { it: Item }) {
  const o = { ...VANITY_DEFAULTS, ...(it.options ?? {}) };
  const setOpt = (patch: Record<string, string | number>) => upd('items', it.id, { options: { ...o, ...patch } });
  const pick = (label: string, key: string, choices: Record<string, string>) => (
    <Field label={label}>
      <select value={String(o[key])} onChange={(e) => setOpt({ [key]: e.target.value })}>
        {Object.entries(choices).map(([k, n]) => (
          <option key={k} value={k}>
            {n}
          </option>
        ))}
      </select>
    </Field>
  );
  return (
    <div className="room-finishes">
      <Field label="Timberline range">
        <select value={String(o.range)} onChange={(e) => setOpt({ range: e.target.value })}>
          {TIMBERLINE.ranges.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Width">
        <span className="presets inline">
          {TIMBERLINE.widths.map((wd) => (
            <button
              key={wd}
              className={it.width === wd ? 'on' : ''}
              onClick={() => upd('items', it.id, { width: wd, name: `${o.range} ${wd}`, options: { ...o, bowls: wd < 1200 ? 1 : o.bowls } })}
            >
              {wd}
            </button>
          ))}
        </span>
      </Field>
      {pick('Mounting', 'mounting', TIMBERLINE.mounting)}
      {pick('Fronts', 'fronts', TIMBERLINE.fronts)}
      {pick('Door style', 'style', TIMBERLINE.style)}
      {pick('Basin', 'basin', TIMBERLINE.basin)}
      <Field label="Bowls">
        <span className="presets inline">
          <button className={Number(o.bowls) < 2 ? 'on' : ''} onClick={() => setOpt({ bowls: 1 })}>
            Single
          </button>
          <button
            className={Number(o.bowls) >= 2 ? 'on' : ''}
            disabled={it.width < 1200}
            title={it.width < 1200 ? 'Double bowls need 1200 mm or wider' : ''}
            onClick={() => setOpt({ bowls: 2 })}
          >
            Double
          </button>
        </span>
      </Field>
      {o.basin !== 'integrated' && pick('Top', 'top', TIMBERLINE.top)}
      {o.basin !== 'integrated' && o.top === 'stone' && (
        <ColorField
          label="Stone colour"
          value={String(o.topColor)}
          onChange={(c) => setOpt({ topColor: c })}
          swatches={TIMBERLINE.tops.map((c) => c.hex)}
          names={Object.fromEntries(TIMBERLINE.tops.map((c) => [c.hex, c.name]))}
        />
      )}
      <ColorField
        label="Cabinet finish"
        value={it.color}
        onChange={(c) => upd('items', it.id, { color: c })}
        swatches={TIMBERLINE.colors.map((c) => c.hex)}
        names={Object.fromEntries(TIMBERLINE.colors.map((c) => [c.hex, c.name]))}
      />
      <p className="note">
        Timberline {String(o.range)} {it.width} mm. Range names and sizes are from Timberline stockists; set the style to match the model you choose and check
        Timberline’s catalogue for exact finishes and tops.
      </p>
    </div>
  );
}

/** House handle for interior hinged doors (generic or ABI Interiors). */
function HouseHandle({ design, interiorDoors }: { design: Design; interiorDoors: Opening[] }) {
  const hh = design.settings.interiorHandle ?? undefined;
  const setHh = (v: DoorHandleSpec | undefined) => store.update((d) => ({ ...d, settings: { ...d.settings, interiorHandle: v ?? null } }));
  const own = interiorDoors.filter((o) => o.handle).length;
  return (
    <>
      <HandlePicker value={hh ?? { ...HANDLE_DEFAULT }} onChange={setHh} entry={false} />
      {own > 0 && (
        <p className="note">
          {own} interior door{own === 1 ? ' has its' : 's have their'} own handle.{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              const ids = new Set(interiorDoors.map((o) => o.id));
              store.update((d) => ({ ...d, openings: d.openings.map((o) => (ids.has(o.id) ? { ...o, handle: undefined } : o)) }));
            }}
          >
            Use the house handle on all
          </a>
        </p>
      )}
    </>
  );
}

/** House door stop for interior hinged doors (ABI Interiors). */
function HouseDoorStop({ design, interiorDoors }: { design: Design; interiorDoors: Opening[] }) {
  const hs = design.settings.interiorDoorStop ?? null;
  const product = doorStopProduct(hs?.product);
  const setHs = (v: DoorStop | null) => store.update((d) => ({ ...d, settings: { ...d.settings, interiorDoorStop: v } }));
  const own = interiorDoors.filter((o) => o.doorStop).length;
  return (
    <>
      <Field label="Door stop">
        <span className="presets inline">
          <button className={!hs || hs.mount === 'none' ? 'on' : ''} onClick={() => setHs(null)}>
            None
          </button>
          <button className={hs?.mount === 'wall' ? 'on' : ''} onClick={() => setHs({ mount: 'wall', product: product.slug })} title="On the wall each door opens back to, at handle height">
            Wall
          </button>
          <button className={hs?.mount === 'floor' ? 'on' : ''} onClick={() => setHs({ mount: 'floor', product: product.slug })} title="On the floor where each door rests when open">
            Floor
          </button>
        </span>
      </Field>
      {hs && hs.mount !== 'none' && (
        <Field label="ABI stop">
          <select value={product.slug} onChange={(e) => setHs({ ...hs, product: e.target.value })}>
            {[false, true].map((mag) => (
              <optgroup key={String(mag)} label={mag ? 'Kolton Magnetic Door Stop' : 'Kolton Door Stop'}>
                {DOOR_STOPS.filter((p) => p.magnetic === mag).map((p) => (
                  <option key={p.slug} value={p.slug} data-swatch={p.hex}>
                    {p.finish}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      )}
      {own > 0 && (
        <p className="note">
          {own} interior door{own === 1 ? ' has its' : 's have their'} own door stop setting.{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              const ids = new Set(interiorDoors.map((o) => o.id));
              store.update((d) => ({ ...d, openings: d.openings.map((o) => (ids.has(o.id) ? { ...o, doorStop: undefined } : o)) }));
            }}
          >
            Use the house door stop on all
          </a>
        </p>
      )}
    </>
  );
}

/** House style for interior doors. */
function InteriorDoorSettings({ design }: { design: Design }) {
  const g = design.settings.interiorDoor ?? DEFAULT_INTERIOR_DOOR;
  const setG = (patch: Partial<typeof g>) =>
    store.update((d) => ({ ...d, settings: { ...d.settings, interiorDoor: { ...(d.settings.interiorDoor ?? DEFAULT_INTERIOR_DOOR), ...patch } } }));
  const info = DOOR_DESIGNS[g.design] ?? DOOR_DESIGNS.flush;
  const types = info.glassTypes ?? ['clear', 'translucent'];
  const sides = exteriorSides(design.walls).map;
  const interiorDoors = design.openings.filter((o) => {
    const sd = sides.get(o.wallId);
    return isLeafDoor(o) && !(sd?.pos || sd?.neg);
  });
  const own = interiorDoors.filter((o) => o.design).length;
  return (
    <Section title="Interior doors">
      <Field label="Door design">
        <select
          value={g.design}
          onChange={(e) => {
            const def = DOOR_DESIGNS[e.target.value];
            const t = def.glassTypes ?? ['clear', 'translucent'];
            setG({ design: e.target.value, color: def.color, glass: def.glass ? (g.glass && t.includes(g.glass) ? g.glass : (t[t.length > 2 ? 0 : 1] as Opening['glass'])) : undefined });
          }}
        >
          {[...new Set(Object.values(DOOR_DESIGNS).map((x) => x.group))].map((grp) => (
            <optgroup key={grp} label={grp}>
              {Object.entries(DOOR_DESIGNS)
                .filter(([, x]) => x.group === grp)
                .map(([k, x]) => (
                  <option key={k} value={k}>
                    {x.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </Field>
      {info.glass && (
        <Field label="Glass">
          <span className="presets inline">
            {types.map((t) => (
              <button key={t} className={(g.glass ?? types[types.length > 2 ? 0 : 1]) === t ? 'on' : ''} onClick={() => setG({ glass: t as Opening['glass'] })}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </span>
        </Field>
      )}
      <Field label="Door jamb">
        <span className="presets inline">
          <button className={g.jamb !== 'double' ? 'on' : ''} onClick={() => setG({ jamb: 'single' })}>
            Single rebated
          </button>
          <button className={g.jamb === 'double' ? 'on' : ''} onClick={() => setG({ jamb: 'double' })}>
            Double rebated
          </button>
        </span>
      </Field>
      <ColorField label="Colour" value={g.color} onChange={(c) => setG({ color: c })} paint="timber" />
      <HouseHandle design={design} interiorDoors={interiorDoors} />
      <HouseDoorStop design={design} interiorDoors={interiorDoors} />
      <p className="note">
        {interiorDoors.length - own} of {interiorDoors.length} interior door{interiorDoors.length === 1 ? '' : 's'} use this style.
        {own > 0 && (
          <>
            {' '}
            {own} {own === 1 ? 'has' : 'have'} {own === 1 ? 'its' : 'their'} own design.{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                const ids = new Set(interiorDoors.map((o) => o.id));
                store.update((d) => ({
                  ...d,
                  openings: d.openings.map((o) => (ids.has(o.id) ? { ...o, design: undefined, glass: undefined, jamb: undefined, color: g.color } : o)),
                }));
              }}
            >
              Apply to all interior doors
            </a>
          </>
        )}
      </p>
      {info.models && <p className="note">Based on the {info.models}.</p>}
    </Section>
  );
}

/** Swatches + names for the Dulux interior range (optionally with timber stains for doors). */

function RenderQualityPicker() {
  const quality = useStore((s) => s.quality);
  const q = QUALITIES.find((x) => x.id === quality)!;
  return (
    <Section title="3D display">
      <Field label="Render quality">
        <select value={quality} onChange={(e) => setQuality(e.target.value as RenderQuality)} title={q.hint}>
          {QUALITIES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>
      <p className="note">{q.hint}. Saved in this browser, not in the design.</p>
    </Section>
  );
}

/** Stacker doors: how many panels (2–4) and how wide each is; the opening width follows. */
function StackerOptions({ o, wallLength }: { o: Opening; wallLength: number }) {
  const n = Math.max(2, Math.min(STACKER_MAX_PANELS, o.panels ?? 3));
  const pw = o.panelWidth ?? Math.round((o.width - 2 * STACKER_FRAME + (n - 1) * STACKER_OVERLAP) / n);
  const set = (panels: number, panelWidth: number) => {
    // Keep it within the wall: shrink the panels if the new width wouldn't fit.
    const maxPw = Math.floor((wallLength - 2 * STACKER_FRAME + (panels - 1) * STACKER_OVERLAP) / panels);
    const pwFit = Math.max(400, Math.min(panelWidth, maxPw));
    const width = stackerWidth(panels, pwFit);
    upd('openings', o.id, { panels, panelWidth: pwFit, width, offset: clampOpeningOffset({ ...o, width }, wallLength) });
  };
  return (
    <>
      <Field label="Panels">
        <div className="presets">
          {Array.from({ length: STACKER_MAX_PANELS - 1 }, (_, i) => i + 2).map((k) => (
            <button key={k} className={k === n ? 'active' : ''} onClick={() => set(k, pw)}>
              {k}
            </button>
          ))}
        </div>
      </Field>
      <NumField label="Panel width" value={pw} min={400} max={1500} onChange={(v) => set(n, v)} hint="Each sliding panel; neighbouring panels overlap 50 mm" />
      <Presets values={[800, 900, 1000, 1200]} current={pw} onPick={(v) => set(n, v)} />
      <p className="note">
        {n} panels × {pw} mm = {stackerWidth(n, pw)} mm overall, stacking to the {o.hingeEnd ? 'start' : 'end'} of the wall.
      </p>
    </>
  );
}

/** Banquette seating: back style, upholstery, seat height and (for the L) which side the return is on. */
function BanquetteOptions({ it }: { it: Item }) {
  const o = { ...BANQUETTE_DEFAULTS, ...(it.options ?? {}) };
  const setOpt = (patch: Record<string, string | number>) => upd('items', it.id, { options: { ...o, ...patch } });
  return (
    <div className="room-finishes">
      <Field label="Back">
        <select value={String(o.back)} onChange={(e) => setOpt({ back: e.target.value })}>
          {Object.entries(BANQUETTE_BACKS).map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      <ColorField
        label="Upholstery"
        value={String(o.fabric)}
        onChange={(c) => setOpt({ fabric: c })}
        swatches={UPHOLSTERY.map((u) => u.hex)}
        names={Object.fromEntries(UPHOLSTERY.map((u) => [u.hex, u.name]))}
      />
      <NumField label="Seat height" value={Number(o.seatHeight)} min={300} max={700} onChange={(v) => setOpt({ seatHeight: v })} hint="Top of the seat cushion; 450–470 suits a 750 mm table" />
      {it.type === 'banquette_l' && (
        <Field label="Return on">
          <span className="presets inline">
            {(['left', 'right'] as const).map((k) => (
              <button key={k} className={o.corner === k ? 'on' : ''} onClick={() => setOpt({ corner: k })}>
                {k === 'left' ? 'Left' : 'Right'}
              </button>
            ))}
          </span>
        </Field>
      )}
      <p className="note">Colour (above) is the timber or painted base; Upholstery is the cushions.</p>
    </div>
  );
}

/** VELUX skylights: model and standard size (which sets the item's size); Sun Tunnels: tube size. */
function SkylightOptions({ it }: { it: Item }) {
  const o = { ...SKYLIGHT_DEFAULTS, ...(it.options ?? {}) };
  if (it.type === 'sun_tunnel')
    return (
      <div className="room-finishes">
        <Field label="Tube">
          <span className="presets inline">
            {SUN_TUNNEL_SIZES.map((sz) => (
              <button key={sz} className={it.width === sz ? 'on' : ''} onClick={() => upd('items', it.id, { width: sz, depth: sz })}>
                {sz} mm
              </button>
            ))}
          </span>
        </Field>
        <p className="note">Shows as a round diffuser on the ceiling, a reflective tube, and a dome on the roof.</p>
      </div>
    );
  const size = Object.entries(SKYLIGHT_SIZES).find(([, [sw, sl]]) => sw === it.width && sl === it.depth)?.[0] ?? '';
  return (
    <div className="room-finishes">
      <Field label="Model">
        <select value={String(o.model)} onChange={(e) => upd('items', it.id, { options: { ...o, model: e.target.value } })}>
          {Object.entries(SKYLIGHT_MODELS).map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Size">
        <select
          value={size}
          onChange={(e) => {
            const [sw, sl] = SKYLIGHT_SIZES[e.target.value];
            upd('items', it.id, { width: sw, depth: sl, options: { ...o, size: e.target.value } });
          }}
        >
          {!size && <option value="">Custom</option>}
          {Object.entries(SKYLIGHT_SIZES).map(([k, [sw, sl]]) => (
            <option key={k} value={k}>
              {k} — {sw} × {sl}
            </option>
          ))}
        </select>
      </Field>
      <p className="note">Width × length of the frame; the length runs up the roof. Turn the skylight (R) to line it up with the slope.</p>
    </div>
  );
}

/** Curtains and blinds for a window or glass door. */
function DressingOptions({ o, inside }: { o: Opening; inside: boolean }) {
  const dr = o.dressing;
  const set = (patch: Partial<NonNullable<Opening['dressing']>> | null) =>
    upd('openings', o.id, { dressing: patch === null ? undefined : ({ ...(dr ?? { type: 'roller', color: DRESSINGS.roller.color, open: 0 }), ...patch } as Opening['dressing']) });
  const curtain = dr && DRESSINGS[dr.type]?.kind === 'curtain';
  return (
    <div className="room-finishes">
      <Field label="Curtains / blinds">
        <select
          value={dr?.type ?? ''}
          onChange={(e) => {
            const t = e.target.value;
            if (!t) return set(null);
            const def = DRESSINGS[t];
            // Keep the colour if you'd already picked one; otherwise the type's usual colour.
            set({ type: t as NonNullable<Opening['dressing']>['type'], color: dr && dr.type !== t && dr.color !== DRESSINGS[dr.type]?.color ? dr.color : def.color, open: dr?.open ?? 0 });
          }}
        >
          <option value="">None</option>
          <optgroup label="Blinds">
            {Object.entries(DRESSINGS)
              .filter(([, d]) => d.kind === 'blind')
              .map(([k, d]) => (
                <option key={k} value={k}>
                  {d.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Curtains">
            {Object.entries(DRESSINGS)
              .filter(([, d]) => d.kind === 'curtain')
              .map(([k, d]) => (
                <option key={k} value={k}>
                  {d.name}
                </option>
              ))}
          </optgroup>
        </select>
      </Field>
      {dr && (
        <>
          <ColorField
            label={dr.type === 'sheer_blockout' ? 'Blockout colour' : 'Colour'}
            value={dr.color}
            onChange={(c) => set({ color: c })}
            swatches={DRESSING_FABRICS.map((f) => f.hex)}
            names={Object.fromEntries(DRESSING_FABRICS.map((f) => [f.hex, f.name]))}
          />
          {(dr.type === 'roller' || dr.type === 'roman') && (
            <Field label="Fabric">
              <span className="presets inline">
                {(['light', 'blockout'] as const).map((k) => (
                  <button key={k} className={(dr.fabric ?? 'light') === k ? 'on' : ''} onClick={() => set({ fabric: k })}>
                    {k === 'light' ? 'Light filtering' : 'Blockout'}
                  </button>
                ))}
              </span>
            </Field>
          )}
          {curtain && (
            <Field label="Length">
              <span className="presets inline">
                {(['floor', 'sill'] as const).map((k) => (
                  <button key={k} className={(dr.length ?? 'floor') === k ? 'on' : ''} onClick={() => set({ length: k })}>
                    {k === 'floor' ? 'To the floor' : 'Below the sill'}
                  </button>
                ))}
              </span>
            </Field>
          )}
          <Field label={curtain ? 'Drawn' : 'Lowered'}>
            <span className="presets inline">
              {[0, 0.5, 1].map((k) => (
                <button key={k} className={Math.abs((dr.open ?? 0) - k) < 0.01 ? 'on' : ''} onClick={() => set({ open: k })}>
                  {curtain ? (k === 0 ? 'Closed' : k === 1 ? 'Open' : 'Half') : k === 0 ? 'Down' : k === 1 ? 'Up' : 'Half'}
                </button>
              ))}
            </span>
          </Field>
          {inside && <Toggle label="Hang on the other side of the wall" value={(dr.side ?? 1) < 0} onChange={(v) => set({ side: v ? -1 : 1 })} />}
        </>
      )}
    </div>
  );
}

/** Door handle (type, height, finish) and whether the door can open fully without hitting anything. */
/** A door stop from ABI Interiors: none, on the wall the door opens back to, or on the floor. */
function DoorStopOptions({ o, w, design, inside }: { o: Opening; w: Wall; design: Design; inside: boolean }) {
  // Interior doors with no setting of their own use the house door stop (Interior doors settings).
  const house = inside ? (design.settings.interiorDoorStop ?? null) : null;
  const own = o.doorStop;
  const stop = own ?? house ?? undefined;
  const active = stop && stop.mount !== 'none' ? stop : undefined;
  const product = doorStopProduct(stop?.product);
  const layout = active ? doorStopLayout(design, { ...o, doorStop: active }, w) : [];
  const fallback = layout.some((l) => l.stop?.fallback);
  const set = (patch: Partial<DoorStop> | null) =>
    upd('openings', o.id, { doorStop: patch === null ? undefined : { mount: active?.mount ?? 'wall', product: product.slug, ...patch } });
  const houseLabel = !house || house.mount === 'none' ? 'none' : `${house.mount}, ${doorStopProduct(house.product).finish}`;
  return (
    <>
      <div className="sub-head">Door stop</div>
      <Field label="Mount">
        <span className="presets inline">
          {inside && (
            <button className={!own ? 'on' : ''} onClick={() => set(null)} title={`Use the house door stop (${houseLabel}) from the Interior doors settings`}>
              House
            </button>
          )}
          <button className={inside ? (own?.mount === 'none' ? 'on' : '') : !active ? 'on' : ''} onClick={() => (inside ? set({ mount: 'none' }) : set(null))}>
            None
          </button>
          <button className={own?.mount === 'wall' || (!inside && active?.mount === 'wall') ? 'on' : ''} onClick={() => set({ mount: 'wall' })} title="On the wall the door opens back to, at handle height">
            Wall
          </button>
          <button className={own?.mount === 'floor' || (!inside && active?.mount === 'floor') ? 'on' : ''} onClick={() => set({ mount: 'floor' })} title="On the floor where the door rests when open">
            Floor
          </button>
        </span>
      </Field>
      {inside && !own && <p className="note">Using the house door stop: {houseLabel}.</p>}
      {active && own && (
        <>
          <Field label="ABI stop">
            <select value={product.slug} onChange={(e) => set({ product: e.target.value })}>
              {[false, true].map((mag) => (
                <optgroup key={String(mag)} label={mag ? 'Kolton Magnetic Door Stop' : 'Kolton Door Stop'}>
                  {DOOR_STOPS.filter((p) => p.magnetic === mag).map((p) => (
                    <option key={p.slug} value={p.slug} data-swatch={p.hex}>
                      {p.finish}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <p className="note">
            {product.description} {DOOR_STOP_SIZE.diameter} mm across, {DOOR_STOP_SIZE.projection} mm projection.{' '}
            <a href={doorStopUrl(product.slug)} target="_blank" rel="noopener noreferrer">
              View on ABI Interiors
            </a>
          </p>
          {fallback && <p className="note warn">There’s no wall where this door opens to, so the stop is shown on the floor.</p>}
        </>
      )}
    </>
  );
}

/**
 * Choose a door handle: a generic type (lever, knob, pull…) with its finish, or an ABI Interiors handle (which sets
 * the type, finish and length). `house`: offer "use the house handle" (interior doors).
 */
function HandlePicker({ value, onChange, house, entry }: { value: DoorHandleSpec | undefined; onChange: (v: DoorHandleSpec | undefined) => void; house?: string; entry: boolean }) {
  const h = doorHandle({ handle: value } as Opening);
  const product = value?.product ? ABI_HANDLE_BY_SLUG[value.product] : undefined;
  const key = house !== undefined && !value ? 'house' : product ? `abi:${product.slug}` : `type:${h.type}`;
  const ranges = [...new Set(ABI_HANDLES.map((x) => x.range))].sort((a, b) => {
    // Internal handles first on interior doors, entry handles first on outside doors.
    const ea = ABI_HANDLES.find((x) => x.range === a)!.entry === entry ? 0 : 1;
    const eb = ABI_HANDLES.find((x) => x.range === b)!.entry === entry ? 0 : 1;
    return ea - eb || a.localeCompare(b);
  });
  const base = { height: h.height };
  return (
    <>
      <Field label="Handle">
        <select
          value={key}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'house') onChange(undefined);
            else if (v.startsWith('abi:')) onChange({ ...base, product: v.slice(4) });
            else onChange({ ...base, type: v.slice(5) as HandleType, finish: product ? HANDLE_DEFAULT.finish : h.finish, length: h.length });
          }}
        >
          {house !== undefined && <option value="house">House handle ({house})</option>}
          <optgroup label="Generic">
            {(Object.keys(HANDLES) as HandleType[]).map((k) => (
              <option key={k} value={`type:${k}`}>
                {HANDLES[k].name}
              </option>
            ))}
          </optgroup>
          {ranges.map((r) => (
            <optgroup key={r} label={`ABI ${r}${ABI_HANDLES.find((x) => x.range === r)!.entry ? ' (entry)' : ''}`}>
              {ABI_HANDLES.filter((x) => x.range === r).map((x) => (
                <option key={x.slug} value={`abi:${x.slug}`} data-swatch={x.hex}>
                  {x.finish || x.range}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      {value && h.type !== 'none' && (
        <>
          <NumField label="Handle height" value={h.height} min={600} max={1600} onChange={(v) => onChange({ ...value, height: v })} hint="Floor to the centre of the handle; 900–1100 is usual, 1000 is common" />
          {!product && (
            <ColorField
              label="Finish"
              value={h.finish}
              onChange={(c) => onChange({ ...value, finish: c })}
              swatches={HANDLE_FINISHES.map((f) => f.hex)}
              names={Object.fromEntries(HANDLE_FINISHES.map((f) => [f.hex, f.name]))}
            />
          )}
          {!product && h.type === 'pull' && <NumField label="Pull length" value={h.length} min={150} max={1800} onChange={(v) => onChange({ ...value, length: v })} />}
        </>
      )}
      {product && (
        <p className="note">
          {abiHandleName(product)}
          {product.dims ? ` — ${product.dims}` : ''}.{' '}
          <a href={abiHandleUrl(product.slug)} target="_blank" rel="noopener noreferrer">
            View on ABI Interiors
          </a>
        </p>
      )}
    </>
  );
}

/** Label for the house handle. */
function houseHandleLabel(spec: DoorHandleSpec | null | undefined) {
  const p = spec?.product ? ABI_HANDLE_BY_SLUG[spec.product] : undefined;
  if (p) return `ABI ${abiHandleName(p)}`;
  return HANDLES[doorHandle({ handle: spec ?? undefined } as Opening).type].name;
}

function HandleOptions({ o, w, design, inside }: { o: Opening; w: Wall; design: Design; inside: boolean }) {
  // Interior doors with no handle of their own use the house handle (Interior doors settings).
  const house = inside ? (design.settings.interiorHandle ?? null) : null;
  const eff = o.handle || !house ? o : { ...o, handle: house };
  const checks = checkDoor(design, eff, w);
  const worst = checks.reduce<(typeof checks)[number] | null>((a, c) => (!a || c.maxAngle < a.maxAngle ? c : a), null);
  const blocked = !!worst && worst.maxAngle < MIN_OPEN;
  const fix = blocked ? clearOffset(design, o, w, 1500) : null;
  const L = wallFrame(w).length;
  const moveBy = fix !== null ? Math.round(fix - clampOpeningOffset(o, L)) : 0;
  return (
    <div className="room-finishes">
      <HandlePicker value={o.handle} onChange={(v) => upd('openings', o.id, { handle: v })} house={inside ? houseHandleLabel(house) : undefined} entry={!inside} />
      {worst &&
        (blocked ? (
          <div className="door-check bad">
            <b>Can only open {worst.maxAngle}°</b> — the {worst.hit?.part ?? 'door'} hits {worst.hit?.what ?? 'something'}.
            {fix !== null ? (
              <>
                {' '}
                Moving it {Math.abs(moveBy)} mm {moveBy > 0 ? 'towards the wall end' : 'towards the wall start'} lets it open fully.{' '}
                <button onClick={() => upd('openings', o.id, { offset: fix })}>Fix</button>
              </>
            ) : (
              ' Try swinging it the other way, hinging on the other side, or a cavity slider.'
            )}
          </div>
        ) : (
          <div className="door-check ok">
            Opens {worst.maxAngle >= 180 ? 'fully' : `to ${worst.maxAngle}°`} without the leaf or handle hitting anything.
          </div>
        ))}
    </div>
  );
}

/** Paint colour for each inside face of a wall (each can differ), labelled by the room it faces. */
function WallPaint({ w, design }: { w: Wall; design: Design }) {
  const faces = wallFaces(design, w);
  if (!faces.length) return null;
  const key = (side: number) => (side > 0 ? 'pos' : 'neg');
  const setFace = (side: 1 | -1, c: string) => {
    const sc = { ...(w.sideColor ?? {}), [key(side)]: c };
    const pos = sc.pos ?? w.color;
    const neg = sc.neg ?? w.color;
    // Both the same again: back to one colour for the wall.
    if (pos.toLowerCase() === neg.toLowerCase()) upd('walls', w.id, { color: pos, sideColor: undefined });
    else upd('walls', w.id, { sideColor: sc });
  };
  if (faces.length === 1)
    return <ColorField label="Inside colour" value={faceColor(w, faces[0].side)} onChange={(c) => setFace(faces[0].side, c)} paint />;
  const differ = faceColor(w, 1).toLowerCase() !== faceColor(w, -1).toLowerCase();
  return (
    <div className="wall-paint">
      {faces.map((f) => (
        <ColorField key={f.side} label={`Paint — ${f.label}`} value={faceColor(w, f.side)} onChange={(c) => setFace(f.side, c)} paint />
      ))}
      <p className="note">
        Each side can be its own colour.{' '}
        {differ &&
          faces.map((f, i) => (
            <span key={f.side}>
              {i > 0 && ' · '}
              <a href="#" onClick={(e) => (e.preventDefault(), upd('walls', w.id, { color: faceColor(w, f.side), sideColor: undefined }))}>
                Use {f.room?.name ?? f.label}'s colour on both
              </a>
            </span>
          ))}
      </p>
    </div>
  );
}

/** A link to the real product an item is modelled on. */
function ProductLinkRow({ it }: { it: Item }) {
  const link = productLink(it);
  if (!link) return null;
  return (
    <Field label="Product">
      <span className="product-row">
        <a className="product-link" href={link.url} target="_blank" rel="noopener noreferrer" title={link.url}>
          View on {link.label} ↗
        </a>
        <button className="product-details-btn" onClick={() => openProductCard({ id: it.id })}>
          Details
        </button>
      </span>
    </Field>
  );
}

type AbiModule = typeof import('../abi');
let abiModule: Promise<AbiModule> | null = null;
/** The ABI product list is big, so it's only loaded when an ABI item is selected. */
const loadAbi = () => (abiModule ??= import('../abi'));

/** Where an ABI product sits off the floor, by kind and ABI's sub-category. */
function abiElevation(p: { cls: string; group: string; height: number; mount: string; name: string }): number {
  const h = p.height;
  switch (p.cls) {
    case 'vanity':
      return /floor/i.test(p.mount) ? 0 : Math.max(0, 850 - h);
    case 'basin':
      if (/pedestal/i.test(p.group)) return 0;
      if (/top mount|above/i.test(p.group)) return 850;
      return Math.max(0, 850 - h);
    case 'sink':
      return Math.max(0, 900 - h);
    case 'mirror':
      return Math.max(900, 1550 - h / 2);
    case 'towel_rail':
      return h > 400 ? 300 : 1000;
    case 'shower':
      return /outdoor/i.test(p.group) && h > 1500 ? 0 : Math.max(0, 2100 - h);
    case 'tap':
      if (/basin taps|sink|pull-out|mixer taps/i.test(p.group)) return 880;
      if (/bath/i.test(p.group)) return 650;
      if (/outdoor/i.test(p.group)) return 600;
      return 1000;
    case 'accessory':
      if (/hook/i.test(p.group)) return 1600;
      if (/toilet roll/i.test(p.group)) return 750;
      if (/toilet brush/i.test(p.group)) return 0;
      if (/hand towel/i.test(p.group)) return 1150;
      if (/paper towel/i.test(p.group)) return 1300;
      return 1100;
    default:
      return 0;
  }
}

/** Pick the actual ABI Interiors product: sets the item's name, size, finish, height and product link. */
function AbiOptions({ it }: { it: Item }) {
  const [mod, setMod] = useState<AbiModule | null>(null);
  useEffect(() => {
    let live = true;
    void loadAbi().then((m) => live && setMod(m));
    return () => {
      live = false;
    };
  }, []);
  const cls = it.type.slice(4);
  const products = useMemo(() => (mod ? mod.ABI_PRODUCTS.filter((p) => p.cls === cls) : []), [mod, cls]);
  const groups = useMemo(() => [...new Set(products.map((p) => p.group))], [products]);
  const current = String(it.options?.slug ?? '');
  const p = products.find((x) => x.slug === current);
  const choose = (slug: string) => {
    const q = products.find((x) => x.slug === slug);
    if (!q) return;
    upd('items', it.id, {
      name: q.name,
      width: q.width,
      depth: q.depth,
      height: q.height,
      elevation: abiElevation(q),
      // Finishes we can't turn into a colour: white for ceramics, otherwise keep the current colour.
      color: q.hex ?? (cls === 'bath' || cls === 'basin' || cls === 'toilet' ? '#f4f2ee' : it.color),
      options: { ...(it.options ?? {}), slug: q.slug, group: q.group, finish: q.finish, double: /double/i.test(q.name) ? 1 : 0 },
    });
  };
  if (!mod) return <p className="note">Loading ABI Interiors products…</p>;
  return (
    <div className="room-finishes">
      <Field label="ABI product">
        <select value={current} onChange={(e) => choose(e.target.value)}>
          {!p && <option value="">Choose one of {products.length}…</option>}
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {products
                .filter((x) => x.group === g)
                .map((x) => (
                  <option key={x.slug} value={x.slug} data-swatch={x.hex}>
                    {x.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </Field>
      {p ? (
        <p className="note">
          {[p.finish, `${p.width} × ${p.depth} × ${p.height} mm`].filter(Boolean).join(' · ')}. Size and
          height follow ABI&apos;s published dimensions; adjust them above if needed.
        </p>
      ) : (
        <p className="note">Pick a product to use its real size and finish. Type in the list to jump to a name.</p>
      )}
    </div>
  );
}

/** Roofing material, profile and colour, and COLORBOND® gutters / downpipes. */
function RoofingOptions({ roof, set }: { roof: Roof; set: (patch: Partial<Roof>) => void }) {
  const material = roof.material ?? 'colorbond';
  const tiles = material !== 'colorbond';
  const profiles = ROOF_MATERIALS[material].profiles;
  const profile = roof.profile && profiles.includes(roof.profile) ? roof.profile : profiles[0];
  const palette = tiles ? TILE_COLOURS : COLORBOND;
  const gutter = roof.gutter ?? { style: 'none' as const, color: roof.color, downpipes: true };
  const setGutter = (patch: Partial<NonNullable<Roof['gutter']>>) => set({ gutter: { ...gutter, ...patch } });
  const soffit = roof.soffit ?? { show: true, color: '#f4f4f0' };
  return (
    <>
      <Field label="Roofing">
        <select
          value={material}
          onChange={(e) => {
            const m = e.target.value as NonNullable<Roof['material']>;
            const nextTiles = m !== 'colorbond';
            // Switching between steel and tiles: pick a colour from the new range if the current one isn't in it.
            const pal = nextTiles ? TILE_COLOURS : COLORBOND;
            const keep = pal.some((c) => c.hex.toLowerCase() === roof.color.toLowerCase());
            set({ material: m, profile: ROOF_MATERIALS[m].profiles[0] as Roof['profile'], color: keep ? roof.color : m === 'terracotta_tile' ? '#b5583a' : pal[0].hex });
          }}
        >
          {Object.entries(ROOF_MATERIALS).map(([k, m]) => (
            <option key={k} value={k}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Profile">
        <select value={profile} onChange={(e) => set({ profile: e.target.value as Roof['profile'] })}>
          {profiles.map((p) => (
            <option key={p} value={p}>
              {ROOF_PROFILES[p]}
            </option>
          ))}
        </select>
      </Field>
      <ColorField
        label={tiles ? 'Tile colour' : 'COLORBOND®'}
        value={roof.color}
        onChange={(c) => set({ color: c })}
        swatches={palette.map((c) => c.hex)}
        names={Object.fromEntries(palette.map((c) => [c.hex, c.name]))}
      />
      <ColorField
        label="Fascia COLORBOND®"
        value={roof.fasciaColor ?? (gutter.style !== 'none' ? gutter.color : roof.color)}
        onChange={(c) => set({ fasciaColor: c })}
        swatches={COLORBOND.map((c) => c.hex)}
        names={Object.fromEntries(COLORBOND.map((c) => [c.hex, c.name]))}
      />
      {roof.fasciaColor && (
        <p className="note">
          <a href="#" onClick={(e) => (e.preventDefault(), set({ fasciaColor: undefined }))}>
            Match the gutters
          </a>
        </p>
      )}
      <Toggle label="Eave lining (Villaboard)" value={soffit.show !== false} onChange={(v) => set({ soffit: { ...soffit, show: v } })} />
      {soffit.show !== false && <ColorField label="Eave lining colour" value={soffit.color} onChange={(c) => set({ soffit: { ...soffit, color: c } })} paint="exterior" />}
      <Field label="Gutters">
        <select value={gutter.style} onChange={(e) => setGutter({ style: e.target.value as NonNullable<Roof['gutter']>['style'] })}>
          <option value="none">None</option>
          {Object.entries(GUTTER_STYLES).map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      {gutter.style !== 'none' && (
        <>
          <ColorField
            label="Gutter COLORBOND®"
            value={gutter.color}
            onChange={(c) => setGutter({ color: c })}
            swatches={COLORBOND.map((c) => c.hex)}
            names={Object.fromEntries(COLORBOND.map((c) => [c.hex, c.name]))}
          />
          <Toggle label="Downpipes at the corners" value={gutter.downpipes} onChange={(v) => setGutter({ downpipes: v })} />
          <p className="note">Gutters run along the eaves (not up gable ends). Downpipes come down at outside corners; check your plumber’s layout for the real number and size.</p>
        </>
      )}
    </>
  );
}

/** Solar array: panel (Jinko, Trina, SunPower), rows × columns and orientation; the item's size follows. */
function SolarOptions({ it }: { it: Item }) {
  const o = { ...SOLAR_DEFAULTS, ...(it.options ?? {}) };
  const p = SOLAR_PANELS[String(o.panel)] ?? SOLAR_PANELS.jinko_tiger_neo_440;
  const set = (patch: Record<string, string | number>) => {
    const next = { ...o, ...patch };
    const [w, d] = solarArraySize(next);
    const panel = SOLAR_PANELS[String(next.panel)] ?? p;
    upd('items', it.id, { options: next, width: w, depth: d, color: panel.frame, name: `Solar panels — ${panel.brand} ${panel.model}` });
  };
  const count = Number(o.rows) * Number(o.cols);
  const kw = (count * p.watts) / 1000;
  return (
    <div className="room-finishes">
      <Field label="Panel">
        <select value={String(o.panel)} onChange={(e) => set({ panel: e.target.value })}>
          {Object.entries(SOLAR_PANELS).map(([k, x]) => (
            <option key={k} value={k}>
              {x.brand} {x.model}
            </option>
          ))}
        </select>
      </Field>
      <NumField label="Rows" value={Number(o.rows)} min={1} max={12} step={1} suffix="" onChange={(v) => set({ rows: Math.round(v) })} hint="Panels up the roof" />
      <NumField label="Columns" value={Number(o.cols)} min={1} max={30} step={1} suffix="" onChange={(v) => set({ cols: Math.round(v) })} hint="Panels across the roof" />
      <Field label="Orientation">
        <span className="presets inline">
          {(['portrait', 'landscape'] as const).map((k) => (
            <button key={k} className={o.orient === k ? 'on' : ''} onClick={() => set({ orient: k })}>
              {k === 'portrait' ? 'Portrait' : 'Landscape'}
            </button>
          ))}
        </span>
      </Field>
      <p className="note">
        <b>
          {count} × {p.watts} W = {kw.toFixed(2)} kW
        </b>{' '}
        · {(count * p.long * p.short / 1e6).toFixed(1)} m² of panels · about {Math.round(count * p.kg)} kg. Place it over the roof and turn it (R) so the
        rows run along the slope; it lies on the roof in 3D. Roof space, setbacks, orientation and shading need checking by a solar installer.
      </p>
    </div>
  );
}
