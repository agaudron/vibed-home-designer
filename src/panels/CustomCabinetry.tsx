import { useState } from 'react';
import { BENCH_MATERIALS, cabinetSchedule, customPreset, customStyle, DOOR_COLOURS, DOOR_PROFILES, HANDLE_FINISHES, HANDLE_STYLES, UNIT_TYPES } from '../cabinetry';
import type { CustomStyle, UnitType } from '../cabinetry';
import { kitchenItems, setKitchenStyle } from '../kitchen';
import { store, useStore } from '../store';
import type { Room } from '../types';
import { ColorField, NumField } from './Fields';

/**
 * Custom cabinetry (in the kitchen designer): the kitchen's door, benchtop and handle finishes and heights, a short
 * list of unit types in any width, and a cabinet schedule to take to a cabinet maker.
 */
export default function CustomCabinetry({ room }: { room: Room }) {
  const design = useStore((s) => s.design);
  const tool = useStore((s) => s.tool);
  const s = customStyle(room.kitchen);
  const set = (patch: Partial<CustomStyle>) => setKitchenStyle(room.id, { custom: { ...room.kitchen?.custom, ...patch } });
  const [unit, setUnit] = useState<UnitType>(UNIT_TYPES[0]);
  const [width, setWidth] = useState(UNIT_TYPES[0].width);
  const units = kitchenItems(design, room).filter((i) => i.type === 'cabinet');
  const schedule = cabinetSchedule(units);
  const bench = BENCH_MATERIALS[s.bench] ?? BENCH_MATERIALS.stone;

  const pickUnit = (u: UnitType) => {
    setUnit(u);
    const w = u.widths.includes(width) ? width : u.width;
    setWidth(w);
    place(u, w);
  };
  const place = (u: UnitType, w: number) => store.setTool({ kind: 'place', itemType: 'cabinet', preset: customPreset(u, w, s) });
  const placing = tool.kind === 'place' && tool.itemType === 'cabinet';

  return (
    <>
      <div className="kd-section">
        <div className="kd-label">1. Add units</div>
        <div className="cc-units">
          {UNIT_TYPES.map((u) => (
            <button key={u.cls} className={`kd-unit${placing && unit.cls === u.cls ? ' active' : ''}`} onClick={() => pickUnit(u)}>
              <span className="kd-unit-name">{u.name}</span>
            </button>
          ))}
        </div>
        <div className="kd-label">
          Width <span>{unit.name}</span>
        </div>
        <div className="presets">
          {unit.widths.map((w) => (
            <button
              key={w}
              className={w === width ? 'on' : ''}
              onClick={() => {
                setWidth(w);
                place(unit, w);
              }}
            >
              {w}
            </button>
          ))}
        </div>
        <NumField
          label="Any width"
          value={width}
          min={unit.cls === 'panel' ? 10 : 100}
          max={4800}
          onChange={(w) => {
            setWidth(w);
            place(unit, w);
          }}
        />
        <p className="note kd-tip">
          {placing ? 'Click in the plan to place it; it snaps to walls and the units beside it. Ctrl+click to keep placing.' : 'Pick a unit and width, then click in the plan.'} Select a placed
          unit to change it, or use Fill gap to stretch it to the next wall or unit.
        </p>
      </div>

      <div className="kd-section">
        <div className="kd-label">
          2. Doors <span>{DOOR_PROFILES[s.profile]}</span>
        </div>
        <div className="presets kd-profiles">
          {Object.entries(DOOR_PROFILES).map(([k, name]) => (
            <button key={k} className={k === s.profile ? 'on' : ''} onClick={() => set({ profile: k })}>
              {name}
            </button>
          ))}
        </div>
        <div className="kd-swatches">
          {DOOR_COLOURS.map((c) => (
            <button key={c.hex} className={`kd-swatch${s.doorColor === c.hex ? ' on' : ''}`} style={{ background: c.hex }} title={c.name} aria-label={c.name} onClick={() => set({ doorColor: c.hex })} />
          ))}
        </div>
        <ColorField label="Any colour" value={s.doorColor} onChange={(c) => set({ doorColor: c })} paint />
      </div>

      <div className="kd-section">
        <div className="kd-label">
          3. Benchtop <span>{bench.name}, {s.benchT} mm</span>
        </div>
        <select value={s.bench} onChange={(e) => set({ bench: e.target.value, benchT: BENCH_MATERIALS[e.target.value].thick[0], benchColor: BENCH_MATERIALS[e.target.value].colours[0].hex })}>
          {Object.entries(BENCH_MATERIALS).map(([k, m]) => (
            <option key={k} value={k}>
              {m.name}
            </option>
          ))}
        </select>
        <div className="kd-swatches">
          {bench.colours.map((c) => (
            <button key={c.hex} className={`kd-swatch${s.benchColor === c.hex ? ' on' : ''}`} style={{ background: c.hex }} title={c.name} aria-label={c.name} onClick={() => set({ benchColor: c.hex })} />
          ))}
        </div>
        <div className="presets">
          {bench.thick.map((t) => (
            <button key={t} className={t === s.benchT ? 'on' : ''} onClick={() => set({ benchT: t })}>
              {t} mm
            </button>
          ))}
        </div>
      </div>

      <div className="kd-section">
        <div className="kd-label">
          4. Handles <span>{s.handle === 'none' ? 'Handleless' : HANDLE_FINISHES[s.handleFinish]?.name}</span>
        </div>
        <select value={s.handle} onChange={(e) => set({ handle: e.target.value })}>
          {Object.entries(HANDLE_STYLES).map(([k, name]) => (
            <option key={k} value={k}>
              {name}
            </option>
          ))}
        </select>
        {s.handle !== 'none' && (
          <div className="kd-swatches">
            {Object.entries(HANDLE_FINISHES).map(([k, f]) => (
              <button key={k} className={`kd-swatch${s.handleFinish === k ? ' on' : ''}`} style={{ background: f.hex }} title={f.name} aria-label={f.name} onClick={() => set({ handleFinish: k })} />
            ))}
          </div>
        )}
        {(s.handle === 'bar' || s.handle === 'd') && (
          <div className="presets">
            {[96, 128, 160, 224, 320].map((l) => (
              <button key={l} className={l === s.handleLen ? 'on' : ''} onClick={() => set({ handleLen: l })}>
                {l}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="kd-section">
        <div className="kd-label">5. Heights</div>
        <NumField label="Bench height" value={s.benchHeight} min={600} max={1200} onChange={(v) => set({ benchHeight: v })} hint="Floor to the top of the benchtop (900 is standard)" />
        <NumField label="Kickboard" value={s.kick} min={0} max={300} onChange={(v) => set({ kick: v })} />
        <NumField label="Top of overheads" value={s.overheadTop} min={1600} max={3600} onChange={(v) => set({ overheadTop: v })} hint="Top of the wall cabinets and pantries (2200 typical, or up to the ceiling)" />
        <p className="note">Changing finishes or heights updates every custom unit in the {room.name.toLowerCase()}.</p>
      </div>

      <div className="kd-section kd-shopping">
        <div className="kd-label">Cabinet schedule</div>
        {schedule.length === 0 ? (
          <p className="note">Units you place in the {room.name.toLowerCase()} are listed here with their sizes (W × H × D).</p>
        ) : (
          <>
            <table className="kd-table">
              <tbody>
                {schedule.map((r) => (
                  <tr key={`${r.name}|${r.size}|${r.fronts}`}>
                    <td>{r.qty} ×</td>
                    <td>
                      {r.name}
                      {r.fronts && <span className="note"> · {r.fronts}</span>}
                    </td>
                    <td className="kd-num">{r.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="note">
              Doors: {DOOR_PROFILES[s.profile]}, {DOOR_COLOURS.find((c) => c.hex === s.doorColor)?.name ?? s.doorColor} · Benchtop: {bench.name} {s.benchT} mm · Handles:{' '}
              {s.handle === 'none' ? 'handleless' : `${HANDLE_STYLES[s.handle]}, ${HANDLE_FINISHES[s.handleFinish]?.name}`}. Sizes are overall (benchtop included for base units); confirm with your
              cabinet maker.
            </p>
          </>
        )}
      </div>
    </>
  );
}
