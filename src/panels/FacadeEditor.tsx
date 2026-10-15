import { useMemo } from 'react';
import { FACADE_PALETTES, MORTAR_COLORS } from '../catalog';
import { facadeCanvas, FINISHES } from '../facade';
import type { Facade, FacadeFinish } from '../types';
import { ColorField } from './Fields';

const ORDER: FacadeFinish[] = ['brick', 'painted_brick', 'render', 'paint', 'weatherboard', 'vertical', 'panel', 'timber', 'stone', 'block'];

/** Pick an outside wall finish and its colours. */
export default function FacadeEditor({ value, onChange }: { value: Facade; onChange: (f: Facade) => void }) {
  const info = FINISHES[value.finish];
  const palette = FACADE_PALETTES[info.palette];
  const names = useMemo(() => Object.fromEntries(palette.map((c) => [c.hex, c.name])), [palette]);
  const setFinish = (finish: FacadeFinish) => {
    const next = FINISHES[finish];
    // Keep the colour if it belongs to the new finish's palette, otherwise use that finish's default.
    const keep = FACADE_PALETTES[next.palette].some((c) => c.hex === value.color.toLowerCase());
    onChange({ ...value, finish, color: keep ? value.color : next.defaultColor });
  };
  return (
    <div className="facade-editor">
      <div className="facade-finishes">
        {ORDER.map((f) => (
          <button key={f} className={value.finish === f ? 'on' : ''} onClick={() => setFinish(f)} title={FINISHES[f].name}>
            <Swatch facade={{ ...value, finish: f, color: f === value.finish ? value.color : FINISHES[f].defaultColor }} />
            <span>{FINISHES[f].name}</span>
          </button>
        ))}
      </div>
      {info.palette === 'paint' ? (
        <ColorField label="Paint colour" value={value.color} onChange={(c) => onChange({ ...value, color: c })} paint="exterior" />
      ) : (
        <ColorField label="Colour" value={value.color} onChange={(c) => onChange({ ...value, color: c })} swatches={palette.map((c) => c.hex)} names={names} />
      )}
      {info.mortar && (
        <ColorField
          label="Mortar"
          value={value.mortar}
          onChange={(c) => onChange({ ...value, mortar: c })}
          swatches={MORTAR_COLORS.map((c) => c.hex)}
          names={Object.fromEntries(MORTAR_COLORS.map((c) => [c.hex, c.name]))}
        />
      )}
    </div>
  );
}

function Swatch({ facade }: { facade: Facade }) {
  const url = useMemo(() => facadeCanvas(facade).toDataURL(), [facade.finish, facade.color, facade.mortar]);
  const [tw] = FINISHES[facade.finish].tile;
  // Show roughly 1.2 m of wall in the thumbnail.
  const size = Math.max(20, (tw / 1200) * 64);
  return <span className="facade-swatch" style={{ backgroundImage: `url(${url})`, backgroundSize: `${size}px auto` }} />;
}
