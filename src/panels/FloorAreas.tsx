import { useEffect, useMemo, useState } from 'react';
import { FLOOR_NAMES } from '../catalog';
import { exteriorSides } from '../facade';
import { roomInterior } from '../geometry';
import { store } from '../store';
import { floorOf } from '../trims';
import type { Design } from '../types';
import { Field, NumField } from './Fields';

/**
 * Floor tool side panel: floor areas for the house and each room, and a linear-metre / piece calculator for
 * boards and tiles (width + gap or grout, waste allowance, optional length for a piece count).
 */

interface Calc {
  preset: string;
  width: number;
  gap: number;
  length: number; // 0 = not counting pieces
  waste: number; // %
  excluded: string[]; // room ids left out
}

const PRESETS: Record<string, { name: string; width: number; gap: number; length: number }> = {
  timber80: { name: 'Hardwood strip flooring, 80 mm', width: 80, gap: 0, length: 0 },
  timber130: { name: 'Hardwood boards, 130 mm', width: 130, gap: 0, length: 0 },
  engineered190: { name: 'Engineered oak, 190 mm', width: 190, gap: 0, length: 1900 },
  hybrid180: { name: 'Hybrid / vinyl plank, 180 × 1220', width: 180, gap: 0, length: 1220 },
  tile200: { name: 'Tiles 200 × 200, 1.5 mm grout', width: 200, gap: 1.5, length: 200 },
  tile300: { name: 'Tiles 300 × 600, 2 mm grout', width: 300, gap: 2, length: 600 },
  tile600: { name: 'Tiles 600 × 600, 2 mm grout', width: 600, gap: 2, length: 600 },
  tile1200: { name: 'Tiles 600 × 1200, 2 mm grout', width: 600, gap: 2, length: 1200 },
  custom: { name: 'Custom', width: 100, gap: 0, length: 0 },
};

const KEY = 'home-designer:floorCalc';
const DEFAULT: Calc = { preset: 'timber80', width: 80, gap: 0, length: 0, waste: 10, excluded: [] };

function loadCalc(): Calc {
  try {
    const raw = localStorage.getItem(KEY);
    // Room ticks aren't kept: every room starts ticked.
    if (raw) return { ...DEFAULT, ...JSON.parse(raw), excluded: [] };
  } catch {
    // ignore
  }
  return DEFAULT;
}

/** Area (mm²) covered by a set of possibly overlapping rectangles. */
function unionArea(rects: { x0: number; y0: number; x1: number; y1: number }[]) {
  const xs = [...new Set(rects.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((r) => [r.y0, r.y1]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < ys.length; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      if (rects.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1)) area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    }
  return area;
}

const m2 = (mm2: number) => mm2 / 1e6;
const fmt = (n: number, dp = 2) => n.toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export default function FloorAreas({ design }: { design: Design }) {
  const [calc, setCalc] = useState<Calc>(loadCalc);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...calc, excluded: undefined }));
    } catch {
      // ignore
    }
  }, [calc]);
  const set = (patch: Partial<Calc>) => setCalc((c) => ({ ...c, ...patch }));

  const rooms = useMemo(
    () =>
      design.rooms
        .filter((r) => r.points.length >= 3)
        .map((r) => {
          const f = floorOf(design, r);
          return { r, area: roomInterior(r.points, design.walls)?.area ?? 0, finish: FLOOR_NAMES[f.finish] ?? f.finish, color: f.color };
        })
        .sort((a, b) => b.area - a.area),
    [design],
  );
  const insideArea = useMemo(() => {
    const s = exteriorSides(design.walls);
    return s.enclosed ? unionArea(s.inside) : 0;
  }, [design.walls]);

  const included = rooms.filter((x) => !calc.excluded.includes(x.r.id));
  const roomsTotal = rooms.reduce((a, x) => a + x.area, 0);
  const calcTotal = included.reduce((a, x) => a + x.area, 0);

  // Linear metres: area ÷ (width + gap), plus waste. Pieces: area ÷ ((w + gap) × (l + gap)), plus waste.
  const pitch = Math.max(1, calc.width + calc.gap);
  const waste = 1 + Math.max(0, calc.waste) / 100;
  const lm = (area: number) => (area / pitch / 1000) * waste;
  const pieces = (area: number) => (calc.length > 0 ? Math.ceil((area / (pitch * (calc.length + calc.gap))) * waste) : 0);

  return (
    <>
      <section className="prop-section">
        <h3>Floor areas</h3>
        <Field label="Rooms total" hint="Sum of the floor inside each room (to the wall faces)">
          <span className="readout">
            <b>{fmt(m2(roomsTotal))} m²</b>
          </span>
        </Field>
        {insideArea > 0 && (
          <Field label="Inside outer walls" hint="Everything inside the outside walls, including internal walls and areas not set up as rooms">
            <span className="readout">{fmt(m2(insideArea))} m²</span>
          </Field>
        )}
        {rooms.length ? (
          <table className="area-table">
            <thead>
              <tr>
                <th>Room</th>
                <th>Floor</th>
                <th className="num">m²</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map(({ r, area, finish, color }) => (
                <tr key={r.id}>
                  <td>
                    <a href="#" onClick={(e) => (e.preventDefault(), store.select({ kind: 'room', id: r.id }))} title="Select this room">
                      {r.name}
                    </a>
                  </td>
                  <td>
                    <span className="swatch-dot" style={{ background: color }} /> {finish}
                  </td>
                  <td className="num">{fmt(m2(area))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="note">No rooms yet. Draw one with the Floor tool, or use “Detect rooms”, to see each room's area.</p>
        )}
      </section>

      <section className="prop-section">
        <h3>Linear metres calculator</h3>
        <Field label="Material">
          <select
            value={calc.preset}
            onChange={(e) => {
              const p = PRESETS[e.target.value];
              set(e.target.value === 'custom' ? { preset: 'custom' } : { preset: e.target.value, width: p.width, gap: p.gap, length: p.length });
            }}
          >
            {Object.entries(PRESETS).map(([k, p]) => (
              <option key={k} value={k}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <NumField label="Width" value={calc.width} min={10} max={3000} step={1} onChange={(v) => set({ width: v, preset: 'custom' })} hint="Board or tile width (cover width for boards)" />
        <NumField label="Gap / grout" value={calc.gap} min={0} max={20} step={0.5} onChange={(v) => set({ gap: v, preset: 'custom' })} hint="Grout line or expansion gap between rows" />
        <NumField label="Length" value={calc.length} min={0} max={3000} step={1} onChange={(v) => set({ length: v, preset: 'custom' })} hint="Optional: board or tile length, to count pieces (0 = don't count)" />
        <NumField label="Waste" value={calc.waste} min={0} max={50} step={1} suffix="%" onChange={(v) => set({ waste: v })} hint="Allowance for cuts and breakage (10% is typical; 15% for diagonal or herringbone)" />
        <table className="area-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  title="Tick or untick every room"
                  checked={calc.excluded.length === 0}
                  ref={(el) => {
                    if (el) el.indeterminate = calc.excluded.length > 0 && included.length > 0;
                  }}
                  onChange={(e) => set({ excluded: e.target.checked ? [] : rooms.map((x) => x.r.id) })}
                />
              </th>
              <th>Room</th>
              <th className="num">m²</th>
              <th className="num">Lin. m</th>
              {calc.length > 0 && <th className="num">Pieces</th>}
            </tr>
          </thead>
          <tbody>
            {rooms.map(({ r, area }) => (
              <tr key={r.id} className={calc.excluded.includes(r.id) ? 'off' : ''}>
                <td>
                  <input
                    type="checkbox"
                    title="Include this room in the total"
                    checked={!calc.excluded.includes(r.id)}
                    onChange={(e) => set({ excluded: e.target.checked ? calc.excluded.filter((x) => x !== r.id) : [...calc.excluded, r.id] })}
                  />
                </td>
                <td>{r.name}</td>
                <td className="num">{fmt(m2(area))}</td>
                <td className="num">{fmt(lm(area), 1)}</td>
                {calc.length > 0 && <td className="num">{pieces(area).toLocaleString('en-AU')}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>Total{calc.excluded.length > 0 ? ` (${included.length} of ${rooms.length})` : ''}</td>
              <td className="num">{fmt(m2(calcTotal))}</td>
              <td className="num">{fmt(lm(calcTotal), 1)}</td>
              {calc.length > 0 && <td className="num">{pieces(calcTotal).toLocaleString('en-AU')}</td>}
            </tr>
          </tfoot>
        </table>
        <p className="note">
          Linear metres = area ÷ ({calc.width}
          {calc.gap ? ` + ${calc.gap}` : ''} mm) + {calc.waste}% waste. Order to the supplier's pack or box size, and check cover width for tongue-and-groove boards.
        </p>
      </section>
    </>
  );
}
