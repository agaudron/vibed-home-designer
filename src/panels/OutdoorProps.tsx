import { floorLevelOf } from '../levels';
import { EDGES, nextStep, outdoorOpts, verandaFloor } from '../outdoor';
import { store, useStore } from '../store';
import type { Item } from '../types';
import { ColorField, Field, NumField } from './Fields';

const setItem = (id: string, patch: Partial<Item>) => store.update((d) => ({ ...d, items: d.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
const setOpt = (it: Item, patch: Record<string, string | number>) => setItem(it.id, { options: { ...(it.options ?? {}), ...patch } });

/** Lowest surface above the ground: deck boards on bearers, paving or a step. */
const MIN_HEIGHT: Record<string, number> = { deck: 22, patio: 20, step: 20 };
/** A low deck's surface above the ground, when its level means raising the house floor. */
const DECK_MIN = 150;

function Choice<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <span className="presets inline">
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => onPick(v)}>
          {label}
        </button>
      ))}
    </span>
  );
}

/**
 * Level of a deck, patio or step relative to the house floor (0 = level with it, −1000 = a metre below). They
 * stand on the ground, so their height is the floor's height above the ground plus this. A deck lower than the
 * ground allows raises the house floor instead (leaving a low deck on the ground); patios and steps stop at the
 * ground.
 */
export function GroundLevel({ it, presets }: { it: Item; presets: number[] }) {
  const design = useStore((s) => s.design);
  const L = floorLevelOf(design);
  const min = MIN_HEIGHT[it.type] ?? 20;
  const above = Math.max(min, it.height);
  const level = above - L;
  const setLevel = (lv: number) => {
    if (L + lv >= min || lv >= 0) {
      setItem(it.id, { height: Math.max(min, L + lv) });
      return;
    }
    if (it.type !== 'deck') {
      setItem(it.id, { height: min });
      store.flash(`That's below the ground: the house floor is only ${L} mm above it (Floor above ground, in Settings)`);
      return;
    }
    const need = DECK_MIN - lv;
    store.update((d) => ({ ...d, settings: { ...d.settings, floorLevel: need }, items: d.items.map((x) => (x.id === it.id ? { ...x, height: DECK_MIN } : x)) }));
    store.flash(`Raised the house floor to ${need} mm above the ground so the deck can sit ${-lv} mm below it`);
  };
  return (
    <>
      <NumField
        label="Level vs floor"
        value={level}
        min={-5000}
        max={3000}
        onChange={setLevel}
        hint="Surface relative to the house floor: 0 = level with it, −1000 = 1 m below. Height (above) is the height above the ground."
      />
      <div className="presets">
        {presets.map((p) => (
          <button key={p} className={Math.abs(level - p) < 1 ? 'on' : ''} onClick={() => setLevel(p)}>
            {p === 0 ? '0' : `−${-p}`}
          </button>
        ))}
      </div>
      <p className="note">
        {level === 0 ? 'Level with the house floor' : level < 0 ? `${-level} mm below the house floor` : `${level} mm above the house floor`} · {above} mm above the ground
        {L === 0 ? ' (the house floor is at ground level; set Floor above ground in Settings)' : ''}.
        {it.type === 'deck' && above >= 1000 ? ' Balustrade added (1 m or more above the ground).' : ''}
      </p>
    </>
  );
}

function EdgeFields({ it }: { it: Item }) {
  const o = outdoorOpts(it);
  const id = Object.entries(EDGES).find(([, e]) => e === o.edge)?.[0] ?? 'render';
  return (
    <>
      <Field label="Sides" hint="What holds the fill in round the sides">
        <select value={id} onChange={(e) => setOpt(it, { edge: e.target.value, edgeColor: EDGES[e.target.value].color })}>
          {Object.entries(EDGES).map(([k, e]) => (
            <option key={k} value={k}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>
      <ColorField label="Sides colour" value={o.edgeColor} onChange={(c) => setOpt(it, { edgeColor: c })} paint={id === 'render'} />
    </>
  );
}

/** Patio: raised patios are fill held in by retaining sides. */
export function PatioOptions({ it }: { it: Item }) {
  return it.height > 100 ? <EdgeFields it={it} /> : <p className="note">Raise it (Level vs floor) to build it up on fill with retaining sides.</p>;
}

/** A single step: straight or corner, and adding the next one down (or up). */
export function StepOptions({ it }: { it: Item }) {
  const o = outdoorOpts(it);
  const L = floorLevelOf(useStore((s) => s.design));
  const add = (dir: 1 | -1) => {
    const next = nextStep(it, dir);
    if (!next) {
      store.flash(dir > 0 ? 'No room for another step: that would be below the ground' : 'This corner step is too small to have one above it');
      return;
    }
    store.update((d) => ({ ...d, items: [...d.items, next] }));
    store.select({ kind: 'item', id: next.id });
  };
  const setShape = (shape: 'straight' | 'corner') => {
    if (shape === o.shape) return;
    // Corner steps need room for both legs; straight steps are one tread deep.
    const size = shape === 'corner' ? { width: Math.max(it.width, 2 * o.tread), depth: Math.max(it.depth, 2 * o.tread) } : { depth: o.tread };
    setItem(it.id, { ...size, options: { ...(it.options ?? {}), shape } });
  };
  const nextLevel = it.height - o.rise - L;
  return (
    <>
      <Field label="Shape">
        <Choice value={o.shape} options={[['straight', 'Straight'], ['corner', 'Corner']]} onPick={setShape} />
      </Field>
      {o.shape === 'corner' && (
        <Field label="Wraps" hint="Which side the step turns round, seen from the front">
          <Choice value={o.sx > 0 ? 'right' : 'left'} options={[['left', 'Left'], ['right', 'Right']]} onPick={(v) => setOpt(it, { side: v })} />
        </Field>
      )}
      <NumField
        label="Tread"
        value={o.tread}
        min={150}
        max={1000}
        hint="How deep each step is, front to back"
        onChange={(v) => setItem(it.id, { ...(o.shape === 'straight' ? { depth: v } : {}), options: { ...(it.options ?? {}), tread: v } })}
      />
      <NumField label="Riser" value={o.rise} min={50} max={300} hint="Height between this step and the next one added" onChange={(v) => setOpt(it, { rise: v })} />
      <EdgeFields it={it} />
      <div className="actions">
        <button className="primary" onClick={() => add(1)} title="One tread further out and one riser lower">
          + Step down
        </button>
        <button onClick={() => add(-1)} title="One tread further in and one riser higher">
          + Step up
        </button>
      </div>
      <p className="note">
        Next step down: {nextLevel === 0 ? 'level with the floor' : `${Math.abs(nextLevel)} mm ${nextLevel < 0 ? 'below' : 'above'} the floor`}. Outdoor steps are often 150–180 mm risers and 300 mm+
        treads; check what’s required with your builder or certifier.
      </p>
    </>
  );
}

/**
 * A veranda's floor level relative to the house floor (its roof still meets the house at the same height). Below
 * the floor needs the house raised above the ground: going lower than the ground allows raises the house floor.
 */
export function VerandaLevel({ it }: { it: Item }) {
  const design = useStore((s) => s.design);
  const L = floorLevelOf(design);
  const level = verandaFloor(it);
  const setLevel = (lv: number) => {
    if (lv >= -L) {
      setOpt(it, { floor: lv });
      return;
    }
    store.update((d) => ({ ...d, settings: { ...d.settings, floorLevel: -lv }, items: d.items.map((x) => (x.id === it.id ? { ...x, options: { ...(x.options ?? {}), floor: lv } } : x)) }));
    store.flash(`Raised the house floor to ${-lv} mm above the ground so the veranda can sit ${-lv} mm below it`);
  };
  return (
    <>
      <NumField label="Floor vs house" value={level} min={-5000} max={1000} onChange={setLevel} hint="Top of the veranda floor relative to the house floor: 0 = level with it, −300 = 300 mm below" />
      <div className="presets">
        {[100, 0, -150, -300, -600, -1000].map((p) => (
          <button key={p} className={Math.abs(level - p) < 1 ? 'on' : ''} onClick={() => setLevel(p)}>
            {p > 0 ? `+${p}` : p === 0 ? '0' : `−${-p}`}
          </button>
        ))}
      </div>
      <p className="note">
        {level === 0 ? 'Level with the house floor' : level < 0 ? `${-level} mm below the house floor` : `${level} mm above the house floor`}
        {L > 0 ? ` · ${L + level} mm above the ground${L + level > 100 ? ', on fill with retaining sides' : ''}` : ''}. Its roof stays where it meets the house.
      </p>
      {L + level > 100 && <EdgeFields it={it} />}
    </>
  );
}
