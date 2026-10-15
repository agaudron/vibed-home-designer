import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { evalExpr } from '../geometry';
import { TIMBER_STAINS } from '../catalog';
import { DULUX_COLOURS, DULUX_FAMILIES } from '../dulux';
import { PORTERS, PORTERS_FAMILIES } from '../porters';
import { PAINT_RANGES, setPaintRange, useStore } from '../store';
import type { PaintRange } from '../store';

interface PaintColour {
  hex: string;
  name: string;
  /** Text in the pick-by-name list. */
  label: string;
  url?: string;
}
interface Palette {
  swatches: string[];
  names: Record<string, string>;
  /** Named colours in groups, for the pick-by-name list. */
  groups: { label: string; colors: PaintColour[] }[];
  /** hex -> the colour's page on the maker's website. */
  links: Record<string, string>;
  /** The maker's colour range page. */
  home: { url: string; label: string };
}

/** Well-known Dulux colours, as quick swatches. */
const DULUX_FAVOURITES = ['Vivid White', 'Natural White', 'White on White', 'Lexicon Quarter', 'Lexicon Half', 'Whisper White', 'Antique White U.S.A.', 'Hog Bristle Quarter', 'Hog Bristle Half', 'Snowy Mountains Half', 'Terrace White', 'Casper White Quarter', 'Limed White', 'Beige Royal Quarter', 'Silkwort', 'Timeless Grey', 'Tranquil Retreat', 'Western Myall', 'Duck Egg Blue', 'Teahouse', 'Stepney', 'Dieskau', 'Domino', 'Black'];

const paletteCache = new Map<string, Palette>();
/** Paint colours for a paint range (plus timber stains for trims and doors). */
function paintPalette(range: PaintRange, mode: 'interior' | 'timber' | 'exterior'): Palette {
  const key = `${range}:${mode}`;
  const hit = paletteCache.get(key);
  if (hit) return hit;
  const stains: PaintColour[] = (mode === 'timber' ? TIMBER_STAINS : []).map((c) => ({ hex: c.hex, name: c.name, label: c.name }));
  let colours: (PaintColour & { family: string })[];
  let families: string[];
  let quick: string[];
  let home: Palette['home'];
  if (range === 'porters') {
    colours = PORTERS.map((c) => ({
      hex: c.hex,
      name: c.name,
      family: c.family,
      label: c.lrv !== undefined ? `${c.name} · LRV ${c.lrv}` : c.name,
      url: c.url ? `https://www.porterspaints.com${c.url}` : undefined,
    }));
    families = PORTERS_FAMILIES;
    // Porter's popular colours and the first few whites, neutrals and greys.
    quick = [
      ...PORTERS.filter((c) => c.popular),
      ...PORTERS.filter((c) => c.family === PORTERS_FAMILIES[0]).slice(0, 10),
      ...PORTERS.filter((c) => c.family === PORTERS_FAMILIES[1]).slice(0, 6),
      ...PORTERS.filter((c) => c.family === PORTERS_FAMILIES[2]).slice(0, 5),
    ].map((c) => c.hex);
    home = { url: 'https://www.porterspaints.com/colours/all-colours/', label: 'porterspaints.com' };
  } else {
    colours = DULUX_COLOURS.map((c) => ({
      hex: c.hex,
      name: c.name,
      family: c.family,
      label: [c.name, c.code, c.lrv !== undefined ? `LRV ${c.lrv}` : ''].filter(Boolean).join(' · '),
      url: c.url ? `https://www.dulux.com.au${c.url}/` : `https://www.dulux.com.au/search/?q=${encodeURIComponent(c.name)}`,
    }));
    families = DULUX_FAMILIES;
    quick = DULUX_FAVOURITES.map((n) => DULUX_COLOURS.find((c) => c.name === n)?.hex).filter((h): h is string => !!h);
    home = { url: 'https://www.dulux.com.au/colour/', label: 'dulux.com.au' };
  }
  const pal: Palette = {
    swatches: [...new Set([...quick, ...stains.map((c) => c.hex)])],
    names: Object.fromEntries([...colours.map((c) => [c.hex, c.name]), ...stains.map((c) => [c.hex, c.name])]),
    groups: [
      ...families.map((f) => ({ label: f, colors: colours.filter((c) => c.family === f) })).filter((g) => g.colors.length),
      ...(stains.length ? [{ label: 'Timber stains', colors: stains }] : []),
    ],
    links: Object.fromEntries(colours.filter((c) => c.url).map((c) => [c.hex, c.url!])),
    home,
  };
  paletteCache.set(key, pal);
  return pal;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field" title={hint}>
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
    </label>
  );
}

/** Numeric input that accepts expressions like "2400+90" or "2.4m", committed on Enter or blur. */
export function NumField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  step?: number;
  hint?: string;
}) {
  const { value, min = -Infinity, max = Infinity, suffix = 'mm', step = 10 } = props;
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmt(value));
  }, [value, focused]);

  const commit = (t: string) => {
    const n = evalExpr(t);
    if (!isFinite(n)) {
      setText(fmt(value));
      return;
    }
    const c = Math.min(max, Math.max(min, Math.round(n * 100) / 100));
    if (c !== value) props.onChange(c);
    setText(fmt(c));
  };

  return (
    <Field label={props.label} hint={props.hint}>
      <input
        className="num"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={(e) => {
          setFocused(false);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(fmt(value));
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const n = evalExpr(text);
            if (isFinite(n)) {
              const k = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? step * 10 : step);
              const c = Math.min(max, Math.max(min, n + k));
              setText(fmt(c));
              props.onChange(c);
            }
          }
        }}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </Field>
  );
}

function fmt(n: number) {
  return String(Math.round(n * 100) / 100);
}

export function TextField(props: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(props.value);
  useEffect(() => setText(props.value), [props.value]);
  return (
    <Field label={props.label}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== props.value && props.onChange(text)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </Field>
  );
}

const SWATCHES = ['#f3f1ec', '#ffffff', '#d9d4ca', '#b98a5e', '#7a5c43', '#3b3b3b', '#7d8a96', '#4f6d5a', '#8c2f2f', '#2f4f6f', '#c9b79c', '#c4c8cc'];

/** Colours offered in every colour picker, whatever else it shows. */
export const POPULAR_GREENS: { name: string; hex: string }[] = [
  { name: 'Sage', hex: '#9caf88' },
  { name: 'Millennial green', hex: '#7f9479' },
];

export function ColorField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  swatches?: string[];
  /** Optional names for swatches (hex -> name), shown as tooltips and under the swatches. */
  names?: Record<string, string>;
  /** Paint: offer the chosen paint range's colours (Dulux or Porter's), with a switch between them. */
  paint?: boolean | 'timber' | 'exterior';
}) {
  const range = useStore((s) => s.paintRange);
  const pal = props.paint ? paintPalette(range, props.paint === true ? 'interior' : props.paint) : null;
  const base = pal?.swatches ?? props.swatches ?? SWATCHES;
  const propNames = pal?.names ?? props.names;
  // Every picker also offers sage and millennial green.
  const extra = POPULAR_GREENS.filter((g) => !base.some((c) => c.toLowerCase() === g.hex));
  const swatches = [...base, ...extra.map((g) => g.hex)];
  const names: Record<string, string> = { ...(propNames ?? {}), ...Object.fromEntries(POPULAR_GREENS.map((g) => [g.hex, g.name])) };
  const current = names[props.value.toLowerCase()];
  return (
    <Field label={props.label}>
      <span className="color-row">
        <input type="color" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch${c.toLowerCase() === props.value.toLowerCase() ? ' on' : ''}`}
            style={{ background: c }}
            title={names[c.toLowerCase()] ?? c}
            onClick={() => props.onChange(c)}
          />
        ))}
        {pal ? (
          // Big ranges (Porter's): every colour by name, grouped by colour family.
          <select className="color-names" value={current ? props.value.toLowerCase() : ''} onChange={(e) => e.target.value && props.onChange(e.target.value)}>
            {!current && <option value="">Custom colour</option>}
            {pal.groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.colors.map((c) => (
                  <option key={`${g.label}${c.name}`} value={c.hex} data-swatch={c.hex}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            ))}
            <optgroup label="Popular greens">
              {POPULAR_GREENS.map((g) => (
                <option key={g.hex} value={g.hex} data-swatch={g.hex}>
                  {g.name}
                </option>
              ))}
            </optgroup>
          </select>
        ) : propNames && Object.keys(propNames).length >= 8 ? (
          // Long named palettes (e.g. Dulux): choose by name.
          <select className="color-names" value={current ? props.value.toLowerCase() : ''} onChange={(e) => e.target.value && props.onChange(e.target.value)}>
            {!current && <option value="">Custom colour</option>}
            {swatches
              .filter((c) => names[c.toLowerCase()])
              .map((c) => (
                <option key={c} value={c.toLowerCase()} data-swatch={c}>
                  {names[c.toLowerCase()]}
                </option>
              ))}
          </select>
        ) : (
          (propNames || current) && <span className="swatch-name">{current ?? 'Custom colour'}</span>
        )}
        {pal && (
          <a
            className="paint-link"
            href={pal.links[props.value.toLowerCase()] ?? pal.home.url}
            target="_blank"
            rel="noopener noreferrer"
            title={pal.links[props.value.toLowerCase()] ? `See ${current} on ${pal.home.label}` : `Browse colours on ${pal.home.label}`}
            onClick={(e) => e.stopPropagation()}
          >
            {pal.links[props.value.toLowerCase()] ? `${pal.home.label} ↗` : `Browse ${pal.home.label} ↗`}
          </a>
        )}
        {props.paint && (
          <span className="paint-range" title="Which paint colours to offer (applies to every paint colour)">
            {PAINT_RANGES.map((r) => (
              <button key={r.id} type="button" className={range === r.id ? 'on' : ''} onClick={() => setPaintRange(r.id)}>
                {r.name}
              </button>
            ))}
          </span>
        )}
      </span>
    </Field>
  );
}

export function Toggle(props: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={props.value} onChange={(e) => props.onChange(e.target.checked)} />
      <span>{props.label}</span>
    </label>
  );
}
