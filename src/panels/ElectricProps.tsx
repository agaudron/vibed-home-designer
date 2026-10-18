import { deleteSelection, duplicateSelection } from '../actions';
import { beamOf, cctOf, controllersOf, ELEC_PRODUCTS, elecName, finishesFor, GANG_COLORS, hasLight, isController, isSwitchable, lightRef, orderCode, productOf, productUrl, refBase, refName, roomOf, swapElecProduct, unlinkedInRoom } from '../electrical';
import type { ElecProduct } from '../electrical';
import { linkRoomLights, startLinking, toggleLink, updateElec } from '../elecActions';
import { store, useStore } from '../store';
import type { Design, ElecPoint } from '../types';
import { Field, NumField, TextField } from './Fields';

/** Products a point can be swapped for: switches for switches, power points for power points, lights for lights. */
const family = (p: ElecProduct) => (isController(p) ? 'control' : isSwitchable(p) ? 'light' : 'power');

const HEIGHTS: Record<string, number[]> = { control: [1050, 1100, 1200], power: [300, 450, 1100], light: [1800, 2000, 2200] };

export default function ElectricProps({ e, design }: { e: ElecPoint; design: Design }) {
  const tool = useStore((s) => s.tool);
  const p = productOf(e);
  const set = (fn: (x: ElecPoint) => ElecPoint) => updateElec(e.id, fn);
  const room = roomOf(design, e);
  const code = orderCode(design, e);
  const url = productUrl(p);
  const finishes = finishesFor(design, e);
  const select = (id: string) => store.set({ selection: { kind: 'electric', id }, tool: { kind: 'select' } });
  const fam = family(p);

  return (
    <section className="prop-section">
      <h3>{p.name}</h3>
      <Field label="Product">
        <select value={p.id} onChange={(ev) => store.update((d) => swapElecProduct(d, e.id, ELEC_PRODUCTS.find((q) => q.id === ev.target.value)!))}>
          {ELEC_PRODUCTS.filter((q) => family(q) === fam).map((q) => (
            <option key={q.id} value={q.id}>
              {q.name}
            </option>
          ))}
        </select>
      </Field>
      {code && (
        <Field label="Order code" hint={p.est ? 'This code could not be confirmed: check it with your supplier' : undefined}>
          <span className="readout">
            {code}
            {p.est ? ' (check)' : ''}{' '}
            {url && (
              <a href={url} target="_blank" rel="noreferrer">
                clipsal.com ↗
              </a>
            )}
          </span>
        </Field>
      )}
      {p.note && <p className="note">{p.note}</p>}
      <Field label="Room">
        <span className="readout">{room?.name ?? 'Not in a room'}</span>
      </Field>
      <TextField label="Label" value={e.label ?? ''} onChange={(v) => set((x) => ({ ...x, label: v.trim() || undefined }))} />
      {p.mount === 'wall' && (
        <>
          <NumField label="Height" value={e.height} min={0} max={3000} hint="Height of the centre of the plate above the floor" onChange={(v) => set((x) => ({ ...x, height: v }))} />
          <div className="presets">
            {HEIGHTS[fam].map((h) => (
              <button key={h} className={Math.abs(e.height - h) < 1 ? 'on' : ''} onClick={() => set((x) => ({ ...x, height: h }))}>
                {h}
              </button>
            ))}
          </div>
        </>
      )}
      {finishes.length > 0 && (
        <Field label="Colour">
          <span className="kd-swatches">
            <button className={`presets-chip${!e.finish ? ' on' : ''}`} onClick={() => set((x) => ({ ...x, finish: undefined }))} title="Use the house plate colour">
              House
            </button>
            {finishes.map((f) => (
              <button key={f.id} className={`kd-swatch${e.finish === f.id ? ' on' : ''}`} style={{ background: f.hex }} title={f.name} aria-label={f.name} onClick={() => set((x) => ({ ...x, finish: f.id }))} />
            ))}
          </span>
        </Field>
      )}

      {e.gangs && (
        <div className="elec-switching">
          <div className="sub-head">What it turns on</div>
          {e.gangs.map((g, i) => {
            const picking = tool.kind === 'elec-link' && tool.switchId === e.id && tool.gang === i;
            const extra = unlinkedInRoom(design, e).length;
            return (
              <div key={i} className={`elec-gang${picking ? ' picking' : ''}`}>
                <div className="elec-gang-head">
                  <span className="elec-chip" style={{ background: GANG_COLORS[i % GANG_COLORS.length] }} />
                  <strong>{e.gangs!.length > 1 ? `Switch ${i + 1}` : p.kind === 'switch' ? 'Switch' : p.name}</strong>
                  <span className="note">
                    {g.length} light{g.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="presets">
                  <button className={picking ? 'on' : ''} onClick={() => (picking ? store.setTool({ kind: 'select' }) : startLinking(e.id, i))} title="Click lights in the plan to add or remove them">
                    {picking ? 'Done picking' : 'Pick lights'}
                  </button>
                  {room && extra > 0 && (
                    <button onClick={() => linkRoomLights(e.id, i)} title={`Add the lights in the ${room.name.toLowerCase()} that this switch doesn't turn on yet`}>
                      + {room.name} lights ({extra})
                    </button>
                  )}
                  {g.length > 0 && <button onClick={() => set((x) => ({ ...x, gangs: x.gangs!.map((gg, k) => (k === i ? [] : gg)) }))}>Clear</button>}
                </div>
                {g.length > 0 && (
                  <ul className="elec-list">
                    {g.map((id) => {
                      const name = refName(design, id);
                      return (
                        name && (
                          <li key={id}>
                            <button className="linkish" onClick={() => select(refBase(id))}>
                              {name}
                            </button>
                            <button className="x" title="Take it off this switch" onClick={() => toggleLink(e.id, i, id)}>
                              ×
                            </button>
                          </li>
                        )
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
          {tool.kind === 'elec-link' && tool.switchId === e.id && <p className="note">Click lights in the plan to add or remove them. Esc when done.</p>}
        </div>
      )}

      {hasLight(p) && (
        <>
          <NumField label="Beam angle" value={beamOf(e)} min={10} max={160} step={5} suffix="°" hint="How wide the light spreads: check the fitting's spec sheet" onChange={(v) => set((x) => ({ ...x, beam: v }))} />
          <div className="presets">
            {[36, 60, 90, 120].map((b) => (
              <button key={b} className={beamOf(e) === b ? 'on' : ''} onClick={() => set((x) => ({ ...x, beam: b }))}>
                {b}°
              </button>
            ))}
          </div>
          {(p.cct?.length ?? 0) > 1 ? (
            <Field label="Colour temp.">
              <select value={cctOf(e)} onChange={(ev) => set((x) => ({ ...x, cct: Number(ev.target.value) }))}>
                {p.cct!.map((k) => (
                  <option key={k} value={k}>
                    {k} K{k <= 3000 ? ' warm white' : k <= 4500 ? ' cool white' : ' daylight'}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Colour temp.">
              <span className="readout">{cctOf(e)} K</span>
            </Field>
          )}
          {p.lumens && (
            <Field label="Output">
              <span className="readout">{p.lumens} lm</span>
            </Field>
          )}
        </>
      )}
      {isSwitchable(p) &&
        (p.fanLight ? (
          <>
            <TurnedOnBy refId={e.id} title="Fan turned on by" hint="select a fan controller and use Pick lights" design={design} select={select} />
            <TurnedOnBy refId={lightRef(e.id)} title="Light turned on by" hint="select a switch or dimmer and use Pick lights" design={design} select={select} />
          </>
        ) : (
          <TurnedOnBy refId={e.id} title="Turned on by" hint="select a switch and use Pick lights" design={design} select={select} />
        ))}

      <div className="actions">
        <button onClick={duplicateSelection} title="Ctrl+D">
          Duplicate
        </button>
        <button className="danger" onClick={deleteSelection} title="Delete">
          Delete
        </button>
      </div>
    </section>
  );
}

function TurnedOnBy({ refId, title, hint, design, select }: { refId: string; title: string; hint: string; design: Design; select: (id: string) => void }) {
  const by = controllersOf(design, refId);
  return (
    <div className="elec-switching">
      <div className="sub-head">{title}</div>
      {by.length === 0 ? (
        <p className="note elec-warn">Not on a switch yet: {hint}.</p>
      ) : (
        <ul className="elec-list">
          {by.map(({ sw, gang }) => (
            <li key={`${sw.id}-${gang}`}>
              <span className="elec-chip" style={{ background: GANG_COLORS[gang % GANG_COLORS.length] }} />
              <button className="linkish" onClick={() => select(sw.id)}>
                {elecName(design, sw)}
                {sw.gangs!.length > 1 ? ` · switch ${gang + 1}` : ''}
              </button>
              <button className="x" title="Take it off this switch" onClick={() => toggleLink(sw.id, gang, refId)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {by.length > 1 && <p className="note">Switched from {by.length} places (2-way switching).</p>}
    </div>
  );
}
