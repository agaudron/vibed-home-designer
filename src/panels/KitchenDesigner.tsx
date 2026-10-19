import { useEffect, useMemo, useState } from 'react';
import { KABOODLE_BENCHTOPS, KABOODLE_DOORS, KABOODLE_HANDLES, KABOODLE_HOME, KABOODLE_PRODUCTS } from '../kaboodle';
import type { KaboodleClass, KaboodleDoor, KaboodleProduct } from '../kaboodle';
import { CLASS_NAMES, closeKitchenDesigner, designerName, kaboodlePreset, kitchenItems, kitchenRange, kitchenStyle, setKitchenStyle, styleParts } from '../kitchen';
import CustomCabinetry from './CustomCabinetry';
import { store, useStore } from '../store';
import { FRIDGES } from '../catalog';

/** A door's profile ("Modern", "Heritage"…) and its colour name without the profile. */
const profileOf = (d: KaboodleDoor) => d.range.split('·').pop()!.trim();
const colourOf = (d: KaboodleDoor) => d.name.replace(new RegExp(`\\s*${profileOf(d)}$`, 'i'), '').trim();

/**
 * Kitchen designer (replaces the catalogue while it's open): the kitchen's Kaboodle door colour, benchtop and
 * handles, the Kaboodle units to place, and a shopping list of what's in the kitchen.
 */
export default function KitchenDesigner({ roomId }: { roomId: string }) {
  const room = useStore((s) => s.design.rooms.find((r) => r.id === roomId));
  const design = useStore((s) => s.design);
  const tool = useStore((s) => s.tool);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ base: true });
  const style = kitchenStyle(room);
  const parts = styleParts(style);
  const units = useMemo(() => (room ? kitchenItems(design, room).filter((i) => i.type === 'kaboodle') : []), [design, room]);

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out = new Map<KaboodleClass, KaboodleProduct[]>();
    for (const p of KABOODLE_PRODUCTS) {
      if (s && !`${p.name} ${p.group} ${CLASS_NAMES[p.cls]} ${p.width}`.toLowerCase().includes(s)) continue;
      if (!out.has(p.cls)) out.set(p.cls, []);
      out.get(p.cls)!.push(p);
    }
    return [...out.entries()];
  }, [q]);

  const fridges = useMemo(() => {
    const s = q.trim().toLowerCase();
    return FRIDGES.filter((f) => !s || `fridge ${f.name} ${f.width}`.toLowerCase().includes(s));
  }, [q]);

  // Shopping list: each product with how many are in the kitchen.
  const list = useMemo(() => {
    const m = new Map<string, { name: string; code: string; url: string; qty: number }>();
    for (const it of units) {
      const o = it.options ?? {};
      const key = String(o.product ?? it.name);
      const row = m.get(key) ?? { name: key, code: String(o.code ?? ''), url: String(o.url ?? ''), qty: 0 };
      row.qty++;
      m.set(key, row);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [units]);

  // The kitchen was deleted (or undone away): close.
  useEffect(() => {
    if (!room) closeKitchenDesigner();
  }, [room]);
  if (!room) return null;
  const range = kitchenRange(design, room);
  // Doors come in profiles (Modern, Heritage…), each in tiers of colours (Everyday, Premium…).
  const profile = parts.door ? profileOf(parts.door) : 'Modern';
  const profiles = [...new Set(KABOODLE_DOORS.map(profileOf))];
  const inProfile = KABOODLE_DOORS.filter((d) => profileOf(d) === profile);
  const tiers = [...new Set(inProfile.map((d) => d.range.split('·')[0].trim()))];
  const pickProfile = (pf: string) => {
    if (pf === profile) return;
    const colour = parts.door ? colourOf(parts.door) : '';
    const next = KABOODLE_DOORS.find((d) => profileOf(d) === pf && colourOf(d) === colour) ?? KABOODLE_DOORS.find((d) => profileOf(d) === pf);
    if (next) setKitchenStyle(room.id, { door: next.name });
  };
  const place = (p: KaboodleProduct) => store.setTool({ kind: 'place', itemType: 'kaboodle', preset: kaboodlePreset(p, style) });
  const placing = (p: KaboodleProduct) => tool.kind === 'place' && tool.preset?.options?.product === p.name;

  return (
    <aside className="catalog kitchen-designer">
      <div className="kd-head">
        <div>
          <strong>{designerName(room)}</strong>
          <span className="kd-room">
            {room.name} · {range === 'custom' ? 'Custom cabinetry' : 'Kaboodle'}
          </span>
        </div>
        <button className="primary" onClick={closeKitchenDesigner} title="Back to the full catalogue">
          Done
        </button>
      </div>
      <div className="cat-scroll">
        <div className="kd-section">
          <div className="presets kd-profiles kd-range-pick">
            <button className={range === 'custom' ? 'on' : ''} onClick={() => setKitchenStyle(room.id, { range: 'custom' })} title="Made-to-measure cabinets in any size and finish">
              Custom cabinetry
            </button>
            <button className={range === 'kaboodle' ? 'on' : ''} onClick={() => setKitchenStyle(room.id, { range: 'kaboodle' })} title="Kaboodle flat-pack range (Bunnings)">
              Kaboodle
            </button>
          </div>
        </div>
        <div className="kd-section">
          <label className="toggle">
            <input
              type="checkbox"
              checked={!!room.kitchen?.bulkhead?.on}
              onChange={(e) => setKitchenStyle(room.id, { bulkhead: { ...room.kitchen?.bulkhead, on: e.target.checked } })}
            />
            Bulkhead above wall cabinets
          </label>
          {room.kitchen?.bulkhead?.on && (
            <>
              <div className="presets">
                {(
                  [
                    ['plaster', 'Plaster (ceiling colour)'],
                    ['doors', 'Match the doors'],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} className={(room.kitchen?.bulkhead?.finish ?? 'plaster') === k ? 'on' : ''} onClick={() => setKitchenStyle(room.id, { bulkhead: { on: true, ...room.kitchen?.bulkhead, finish: k } })}>
                    {label}
                  </button>
                ))}
              </div>
              <label className="toggle">
                <input type="checkbox" checked={!!room.kitchen?.bulkhead?.shadowline} onChange={(e) => setKitchenStyle(room.id, { bulkhead: { on: true, ...room.kitchen?.bulkhead, shadowline: e.target.checked } })} />
                10 mm shadowline under it
              </label>
              <p className="note">Fills from the top of the wall cabinets and tall units up to the ceiling ({design.settings.ceilingHeight ? `${design.settings.ceilingHeight} mm` : 'the top of the walls'}).</p>
            </>
          )}
        </div>
        {range === 'custom' ? (
          <CustomCabinetry room={room} />
        ) : (
          <>
        <div className="kd-section">
          <div className="kd-label">
            Doors <span>{parts.door?.name}</span>
          </div>
          <div className="presets kd-profiles">
            {profiles.map((pf) => (
              <button key={pf} className={pf === profile ? 'on' : ''} onClick={() => pickProfile(pf)}>
                {pf}
              </button>
            ))}
          </div>
          {tiers.map((tier) => (
            <div key={tier} className="kd-range">
              <span className="kd-range-name">{tier}</span>
              <div className="kd-swatches">
                {inProfile.filter((d) => d.range.split('·')[0].trim() === tier).map((d) => (
                  <button
                    key={d.name}
                    className={`kd-swatch${style.door === d.name ? ' on' : ''}${d.style === 'shaker' ? ' shaker' : ''}`}
                    style={{ background: d.hex }}
                    title={`${colourOf(d)} (${d.range})`}
                    aria-label={d.name}
                    onClick={() => setKitchenStyle(room.id, { door: d.name })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="kd-section">
          <div className="kd-label">
            Benchtop <span>{parts.bench?.name}</span>
          </div>
          <div className="kd-swatches">
            {KABOODLE_BENCHTOPS.map((b) => (
              <button
                key={b.name}
                className={`kd-swatch${style.benchtop === b.name ? ' on' : ''}`}
                style={{ background: b.hex }}
                title={`${b.name} — ${b.material}, ${b.thickness} mm`}
                aria-label={b.name}
                onClick={() => setKitchenStyle(room.id, { benchtop: b.name })}
              />
            ))}
          </div>
        </div>
        <div className="kd-section">
          <label className="kd-label" htmlFor="kd-handle">
            Handles
          </label>
          <select id="kd-handle" value={style.handle} onChange={(e) => setKitchenStyle(room.id, { handle: e.target.value })}>
            {KABOODLE_HANDLES.map((h) => (
              <option key={h.name} value={h.name}>
                {h.name}
                {h.finish && !h.name.includes(h.finish) ? ` — ${h.finish}` : ''}
              </option>
            ))}
          </select>
        </div>

        <input className="search kd-search" placeholder="Search Kaboodle units…" value={q} onChange={(e) => setQ(e.target.value)} />
        <p className="note kd-tip">Click a unit, then click in the plan or 3D view. Units snap to walls and to each other; hold Shift to place freely.</p>
        {groups.map(([cls, products]) => (
          <div key={cls} className="cat-group">
            <button className="cat-head" onClick={() => setOpen((c) => ({ ...c, [cls]: !c[cls] }))}>
              <span className={`caret${open[cls] || q ? ' open' : ''}`}>▸</span>
              {CLASS_NAMES[cls]}
              <span className="kd-count">{products.length}</span>
            </button>
            {(open[cls] || q) && (
              <div className="kd-list">
                {products.map((p, i) => (
                  <button
                    key={`${p.name}-${i}`}
                    className={`kd-unit${placing(p) ? ' active' : ''}`}
                    onClick={() => place(p)}
                    title={`${p.description || p.name}${p.code ? ` (item ${p.code})` : ''}`}
                  >
                    <span className="kd-unit-name">{p.name}</span>
                    <span className="kd-unit-meta">
                      {p.width} × {p.depth} × {p.height}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {fridges.length > 0 && (
          <div className="cat-group">
            <button className="cat-head" onClick={() => setOpen((c) => ({ ...c, fridges: !c.fridges }))}>
              <span className={`caret${open.fridges || q ? ' open' : ''}`}>▸</span>
              Fridges
              <span className="kd-count">{fridges.length}</span>
            </button>
            {(open.fridges || q) && (
              <div className="kd-list">
                {fridges.map((f) => (
                  <button
                    key={f.type}
                    className={`kd-unit${tool.kind === 'place' && tool.itemType === f.type ? ' active' : ''}`}
                    onClick={() => store.setTool({ kind: 'place', itemType: f.type })}
                    title={`${f.name}, ${f.litres}. Typical size; check your model's cavity needs.`}
                  >
                    <span className="kd-unit-name">{f.name}</span>
                    <span className="kd-unit-meta">
                      {f.width} × {f.depth} × {f.height} · {f.litres}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {!groups.length && !fridges.length && <p className="note">Nothing matches “{q}”.</p>}

        <div className="kd-section kd-shopping">
          <div className="kd-label">Shopping list</div>
          {list.length === 0 ? (
            <p className="note">Units you place in the {room.name.toLowerCase()} are listed here.</p>
          ) : (
            <>
              <table className="kd-table">
                <tbody>
                  {list.map((r) => (
                    <tr key={r.name}>
                      <td>{r.qty} ×</td>
                      <td>
                        {r.url ? (
                          <a href={r.url} target="_blank" rel="noreferrer">
                            {r.name}
                          </a>
                        ) : (
                          r.name
                        )}
                      </td>
                      <td className="kd-num">{r.code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="note">
                Doors, benchtops, handles and legs are sold separately from the cabinets — check{' '}
                <a href={KABOODLE_HOME} target="_blank" rel="noreferrer">
                  kaboodle.com.au
                </a>{' '}
                before you buy.
              </p>
            </>
          )}
        </div>
          </>
        )}
      </div>
    </aside>
  );
}
