import { useEffect, useMemo, useState } from 'react';
import { roomInterior } from '../geometry';
import { corniceFor, insideStretches, openingRects, skirtingFor, trimRuns } from '../trims';
import type { Design, Room } from '../types';
import { Field, NumField } from './Fields';

/**
 * Renovation quantities for a room: plasterboard (Gyprock-style 1200 mm sheets) for the walls (less doors and
 * windows) and ceiling, and lengths of cornice and skirting. Sheet counts are by area plus a waste allowance;
 * trims by linear metre, rounded up to whole lengths.
 */

const SHEET_LENGTHS = [2400, 2700, 3000, 3600, 4200, 4800, 6000];
const SHEET_WIDTH = 1200;

interface Settings {
  wallSheet: number;
  ceilingSheet: number;
  corniceLength: number;
  skirtingLength: number;
  waste: number;
}
const KEY = 'home-designer:renoCalc';
const DEFAULT: Settings = { wallSheet: 2700, ceilingSheet: 3600, corniceLength: 4800, skirtingLength: 5400, waste: 10 };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT;
}

const WET = /bath|ensuite|en-suite|laundry|wc|toilet|powder|shower/i;

/** Wall area facing the room (to the ceiling, less openings), ceiling area, and cornice / skirting runs (mm). */
export function roomQuantities(d: Design, r: Room) {
  const ceilingAt = (wallHeight: number) => Math.min(wallHeight, d.settings.ceilingHeight ?? wallHeight);
  let wall = 0;
  let openings = 0;
  for (const st of insideStretches(d)) {
    if (st.room?.id !== r.id) continue;
    const h = ceilingAt(st.wall.height);
    wall += (st.b - st.a) * h;
    for (const [x0, x1, sill, head] of openingRects(d, st.wall)) {
      const a = Math.max(x0, st.a);
      const b = Math.min(x1, st.b);
      if (b > a) openings += (b - a) * Math.max(0, Math.min(head, h) - sill);
    }
  }
  const ceiling = roomInterior(r.points, d.walls)?.area ?? 0;
  const ceilingH = d.settings.ceilingHeight ?? Math.max(0, ...d.walls.map((w) => w.height));
  let cornice = 0;
  let skirting = 0;
  for (const run of trimRuns(d, ceilingH + 1)) {
    if (run.room?.id !== r.id) continue;
    if (run.kind === 'cornice') cornice += run.b - run.a;
    else if (run.kind === 'skirting') skirting += run.b - run.a;
  }
  return { wall: Math.max(0, wall - openings), openings, ceiling, cornice, skirting };
}

const m2 = (mm2: number) => (mm2 / 1e6).toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const lm = (mm: number) => (mm / 1000).toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function RoomMaterials({ design, r }: { design: Design; r: Room }) {
  const [s, setS] = useState<Settings>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // ignore
    }
  }, [s]);
  const set = (patch: Partial<Settings>) => setS((x) => ({ ...x, ...patch }));
  const q = useMemo(() => roomQuantities(design, r), [design, r]);
  const waste = 1 + Math.max(0, s.waste) / 100;
  const sheets = (area: number, len: number) => Math.ceil((area * waste) / (SHEET_WIDTH * len));
  const lengths = (run: number, len: number) => Math.ceil((run * waste) / len);
  const cornice = corniceFor(design, r);
  const skirting = skirtingFor(design, r);
  const wet = WET.test(r.name);
  const sheetSelect = (value: number, onChange: (v: number) => void) => (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {SHEET_LENGTHS.map((l) => (
        <option key={l} value={l}>
          {SHEET_WIDTH} × {l}
        </option>
      ))}
    </select>
  );
  const wallSheets = sheets(q.wall, s.wallSheet);
  const ceilingSheets = sheets(q.ceiling, s.ceilingSheet);
  return (
    <section className="prop-section">
      <h3>Renovation materials</h3>
      <table className="area-table">
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Quantity</th>
            <th className="num">Order</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td title={`Wall faces to the ceiling, less ${m2(q.openings)} m² of doors and windows`}>Plasterboard — walls</td>
            <td className="num">{m2(q.wall)} m²</td>
            <td className="num">{wallSheets} sheets</td>
          </tr>
          <tr>
            <td>Plasterboard — ceiling</td>
            <td className="num">{m2(q.ceiling)} m²</td>
            <td className="num">{ceilingSheets} sheets</td>
          </tr>
          <tr>
            <td>Cornice{cornice.points.length ? ` (${cornice.name})` : ''}</td>
            {cornice.points.length ? (
              <>
                <td className="num">{lm(q.cornice)} m</td>
                <td className="num">
                  {lengths(q.cornice, s.corniceLength)} × {s.corniceLength / 1000} m
                </td>
              </>
            ) : (
              <td className="num" colSpan={2}>
                {cornice.name} — none needed
              </td>
            )}
          </tr>
          <tr>
            <td>Skirting{skirting.points.length ? ` (${skirting.name})` : ''}</td>
            {skirting.points.length ? (
              <>
                <td className="num">{lm(q.skirting)} m</td>
                <td className="num">
                  {lengths(q.skirting, s.skirtingLength)} × {s.skirtingLength / 1000} m
                </td>
              </>
            ) : (
              <td className="num" colSpan={2}>
                None
              </td>
            )}
          </tr>
        </tbody>
      </table>
      <Field label="Wall sheets">{sheetSelect(s.wallSheet, (v) => set({ wallSheet: v }))}</Field>
      <Field label="Ceiling sheets">{sheetSelect(s.ceilingSheet, (v) => set({ ceilingSheet: v }))}</Field>
      <NumField label="Cornice lengths" value={s.corniceLength} min={1000} max={7200} step={100} onChange={(v) => set({ corniceLength: v })} hint="Length each piece of cornice comes in (4.8 m and 6 m are common)" />
      <NumField label="Skirting lengths" value={s.skirtingLength} min={1000} max={7200} step={100} onChange={(v) => set({ skirtingLength: v })} hint="Length each piece of skirting comes in (5.4 m is common for timber / MDF)" />
      <NumField label="Waste" value={s.waste} min={0} max={50} step={1} suffix="%" onChange={(v) => set({ waste: v })} hint="Allowance for offcuts and mistakes; 10% is typical" />
      <p className="note">
        {wet
          ? 'Wet area: use moisture-resistant board (e.g. Gyprock Aquachek) on the walls and ceiling, and waterproof as required. '
          : 'Standard 10 mm board for walls; 10 or 13 mm for ceilings depending on joist spacing. '}
        Wall area runs to the ceiling and leaves out doors and windows. Skirting stops at doorways. Allow extra for
        jointing compound, tape, screws and cornice adhesive, and check quantities with your supplier.
      </p>
    </section>
  );
}
