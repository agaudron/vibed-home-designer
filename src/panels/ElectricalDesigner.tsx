import { useMemo, useState } from 'react';
import { allGangKeys, refBase, refName, unswitched, ELEC_GROUPS, gangKey, litLights, roomLightLevels, ELEC_PRODUCTS, elecName, houseStyle, ICONIC_HOME, ICONIC_RANGES, orderCode, productOf, productUrl } from '../electrical';
import type { ElecProduct } from '../electrical';
import { closeElectrical, flickSwitch, setGangs, toggleLightDemo } from '../elecActions';
import { store, useStore } from '../store';

/**
 * Electrical page (replaces the catalogue while it's open): the house's Clipsal Iconic plate range and colour, the
 * switches, power points and lights to place, what each switch turns on, and a schedule of everything in the plan.
 */
export default function ElectricalDesigner() {
  const design = useStore((s) => s.design);
  const tool = useStore((s) => s.tool);
  const selection = useStore((s) => s.selection);
  const lightDemo = useStore((s) => s.lightDemo);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(ELEC_GROUPS.map((g) => [g.kind, true])));
  const { range, finish } = houseStyle(design);
  const points = design.electrical;

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ELEC_GROUPS.map((g) => ({
      ...g,
      products: ELEC_PRODUCTS.filter((p) => p.kind === g.kind && (!s || `${p.name} ${p.code} ${g.name}`.toLowerCase().includes(s))),
    })).filter((g) => g.products.length);
  }, [q]);

  // Schedule: each product (order code) with how many are in the plan.
  const schedule = useMemo(() => {
    const m = new Map<string, { name: string; code: string; url: string | null; qty: number; est: boolean }>();
    for (const e of points) {
      const p = productOf(e);
      const code = orderCode(design, e);
      const key = `${p.id}|${code}`;
      const row = m.get(key) ?? { name: p.name, code, url: productUrl(p), qty: 0, est: !!p.est };
      row.qty++;
      m.set(key, row);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [points, design]);

  const switches = points.filter((e) => e.gangs);
  const on = useMemo(() => new Set(lightDemo ?? []), [lightDemo]);
  const levels = useMemo(() => (lightDemo ? roomLightLevels(design, litLights(design, on)) : []), [design, lightDemo, on]);
  const orphans = unswitched(design);
  const setStyle = (patch: { range?: string; finish?: string }) =>
    store.update((d) => {
      const cur = houseStyle(d);
      const r = ICONIC_RANGES.find((x) => x.id === (patch.range ?? cur.range.id)) ?? cur.range;
      const f = r.finishes.find((x) => x.id === patch.finish) ?? r.finishes.find((x) => x.id === cur.finish.id) ?? r.finishes[0];
      return { ...d, settings: { ...d.settings, electrical: { range: r.id, finish: f.id } } };
    });
  const place = (p: ElecProduct) => store.setTool({ kind: 'elec', product: p.id });
  const placing = (p: ElecProduct) => tool.kind === 'elec' && tool.product === p.id;
  const select = (id: string) => store.set({ selection: { kind: 'electric', id }, tool: { kind: 'select' } });

  return (
    <aside className="catalog kitchen-designer elec-designer">
      <div className="kd-head">
        <div>
          <strong>Electrical</strong>
          <span className="kd-room">Clipsal Iconic · {points.length} point{points.length === 1 ? '' : 's'}</span>
        </div>
        <button className="primary" onClick={closeElectrical} title="Back to the full catalogue">
          Done
        </button>
      </div>
      <div className="cat-scroll">
        <div className="kd-section">
          <div className="kd-label">
            Plates <span>{range.look}</span>
          </div>
          <div className="presets kd-profiles">
            {ICONIC_RANGES.map((r) => (
              <button key={r.id} className={r.id === range.id ? 'on' : ''} onClick={() => setStyle({ range: r.id })} title={r.look}>
                {r.name.replace('Iconic ', '')}
              </button>
            ))}
          </div>
          <div className="kd-label">
            Colour <span>{finish.name}</span>
          </div>
          <div className="kd-swatches">
            {range.finishes.map((f) => (
              <button
                key={f.id}
                className={`kd-swatch${f.id === finish.id ? ' on' : ''}`}
                style={{ background: f.hex }}
                title={`${f.name} (-${f.suffix})`}
                aria-label={f.name}
                onClick={() => setStyle({ finish: f.id })}
              />
            ))}
          </div>
        </div>

        <div className="kd-section">
          <button className={`elec-demo-btn${lightDemo ? ' primary' : ''}`} onClick={toggleLightDemo} title="Show each light's spread on the floor, and use the switches to turn lights on and off">
            💡 {lightDemo ? 'Stop light demo' : 'Light spread demo'}
          </button>
          {lightDemo && (
            <>
              <p className="note">Click a switch in the plan (or below) to flick it. Pools show each light's beam reaching the floor; 3D goes to night.</p>
              {switches.length > 0 && (
                <div className="presets">
                  <button onClick={() => setGangs(allGangKeys(design), true)}>All on</button>
                  <button onClick={() => setGangs(allGangKeys(design), false)}>All off</button>
                </div>
              )}
              {switches.map((sw) => (
                <div key={sw.id} className="elec-demo-sw">
                  <button className="linkish" onClick={() => flickSwitch(sw)} title="Flick the whole switch">
                    {elecName(design, sw)}
                  </button>
                  <span className="gangs">
                    {sw.gangs!.map((g, i) => (
                      <button
                        key={i}
                        className={`elec-rocker${on.has(gangKey(sw.id, i)) ? ' on' : ''}`}
                        onClick={() => flickSwitch(sw, i)}
                        title={`${g.length} light${g.length === 1 ? '' : 's'}`}
                      >
                        {sw.gangs!.length > 1 ? i + 1 : on.has(gangKey(sw.id, i)) ? 'On' : 'Off'}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
              {levels.length > 0 && (
                <>
                  <div className="kd-label">Light level (rough estimate)</div>
                  <table className="kd-table elec-lux">
                    <tbody>
                      {levels.map((l) => (
                        <tr key={l.room.id}>
                          <td>{l.room.name}</td>
                          <td className="kd-num">{l.lumens} lm</td>
                          <td className="kd-num">~{l.lux} lux</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="note">Lights that are on, × 0.5 for light lost to walls and ceiling, ÷ floor area. A lighting designer can do a proper calculation.</p>
                </>
              )}
            </>
          )}
        </div>

        <input className="search kd-search" placeholder="Search switches, power points, lights…" value={q} onChange={(e) => setQ(e.target.value)} />
        <p className="note kd-tip">Click a product, then click in the plan. Switches and power points go on the nearest wall; keep clicking to add more, Esc when done.</p>
        {groups.map((g) => (
          <div key={g.kind} className="cat-group">
            <button className="cat-head" onClick={() => setOpen((c) => ({ ...c, [g.kind]: !c[g.kind] }))}>
              <span className={`caret${open[g.kind] || q ? ' open' : ''}`}>▸</span>
              {g.name}
              <span className="kd-count">{g.products.length}</span>
            </button>
            {(open[g.kind] || q) && (
              <div className="kd-list">
                {g.products.map((p) => (
                  <button key={p.id} className={`kd-unit${placing(p) ? ' active' : ''}`} onClick={() => place(p)} title={p.note ?? p.name}>
                    <span className="kd-unit-name">{p.name}</span>
                    <span className="kd-unit-meta">
                      {p.code ? `${p.plate && !p.outdoor ? range.prefix : ''}${p.code}${p.est ? ' (check code)' : ''}` : 'Generic fitting'}
                      {p.mount === 'wall' ? ` · ${p.mountHeight} mm high` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {!groups.length && <p className="note">Nothing matches “{q}”.</p>}

        <div className="kd-section">
          <div className="kd-label">Switching</div>
          {switches.length === 0 ? (
            <p className="note">Place a switch, select it, then pick the lights each of its switches turns on.</p>
          ) : (
            <ul className="elec-list">
              {switches.map((sw) => (
                <li key={sw.id}>
                  <button className={`linkish${selection?.id === sw.id ? ' on' : ''}`} onClick={() => select(sw.id)}>
                    {elecName(design, sw)}
                  </button>
                  <span className="elec-gangs">
                    {sw.gangs!.map((g, i) => (
                      <span key={i} className={g.length ? '' : 'none'}>
                        {sw.gangs!.length > 1 ? `${i + 1}: ` : ''}
                        {g.length ? `${g.length} light${g.length === 1 ? '' : 's'}` : 'nothing'}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {orphans.length > 0 && (
            <p className="note elec-warn">
              Not on any switch: {orphans.slice(0, 3).map((r) => refName(design, r)).join(', ')}
              {orphans.length > 3 ? ` and ${orphans.length - 3} more` : ''}.{' '}
              <button className="linkish" onClick={() => select(refBase(orphans[0]))}>
                Show
              </button>
            </p>
          )}
        </div>

        <div className="kd-section kd-shopping">
          <div className="kd-label">Schedule</div>
          {schedule.length === 0 ? (
            <p className="note">Everything you place is listed here with its Clipsal order code.</p>
          ) : (
            <>
              <table className="kd-table">
                <tbody>
                  {schedule.map((r) => (
                    <tr key={`${r.name}|${r.code}`}>
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
                      <td className="kd-num" title={r.est ? 'Code not confirmed: check with your supplier' : undefined}>
                        {r.code}
                        {r.est ? '*' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="note">
                Codes include the plate range and colour. * = check the code. Electrical work must be done by a licensed electrician — see{' '}
                <a href={ICONIC_HOME} target="_blank" rel="noreferrer">
                  clipsal.com
                </a>{' '}
                for the full range.
              </p>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
