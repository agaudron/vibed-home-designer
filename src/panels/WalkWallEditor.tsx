import { exteriorSides, FINISHES } from '../facade';
import { faceColor } from '../geometry';
import { store, useStore } from '../store';
import { LININGS, liningFor, wallFaces } from '../trims';
import type { LiningType, Wall } from '../types';
import FacadeEditor from './FacadeEditor';
import { ColorField, Field } from './Fields';

/**
 * Walk-through: the wall face you clicked. Inside faces get their paint colour and lining (VJ, shiplap…);
 * outside faces get the facade (house-wide, or this wall only). Changes show straight away around you.
 */
export default function WalkWallEditor({ wallId, side, onClose }: { wallId: string; side: 1 | -1; onClose: () => void }) {
  const design = useStore((s) => s.design);
  const w = design.walls.find((x) => x.id === wallId);
  if (!w) return null;
  const sd = exteriorSides(design.walls).map.get(w.id);
  const outside = side > 0 ? !!sd?.pos : !!sd?.neg;
  const face = wallFaces(design, w).find((f) => f.side === side);
  const key = side > 0 ? 'pos' : 'neg';
  const upd = (patch: Partial<Wall>) => store.update((d) => ({ ...d, walls: d.walls.map((x) => (x.id === w.id ? { ...x, ...patch } : x)) }));
  const setColour = (c: string) => {
    const sc = { ...(w.sideColor ?? {}), [key]: c };
    const pos = sc.pos ?? w.color;
    const neg = sc.neg ?? w.color;
    if (pos.toLowerCase() === neg.toLowerCase()) upd({ color: pos, sideColor: undefined });
    else upd({ sideColor: sc });
  };
  const own = w.lining?.[key] ?? null;
  const inherited = liningFor(design, face?.room);
  return (
    <div className="walk-wall" onMouseDown={(e) => e.stopPropagation()}>
      <div className="walk-wall-head">
        <b>{outside ? 'Outside wall' : face?.label ?? 'Wall'}</b>
        <button onClick={onClose} title="Back to walking">
          Back to walking
        </button>
      </div>
      {outside ? (
        <>
          <Field label="Finish">
            <select value={w.facade ? 'own' : 'house'} onChange={(e) => upd({ facade: e.target.value === 'own' ? { ...design.facade } : null })}>
              <option value="house">House facade ({FINISHES[design.facade.finish].name})</option>
              <option value="own">This wall only…</option>
            </select>
          </Field>
          {w.facade ? (
            <FacadeEditor value={w.facade} onChange={(f) => upd({ facade: f })} />
          ) : (
            <FacadeEditor value={design.facade} onChange={(f) => store.update((d) => ({ ...d, facade: f }))} />
          )}
          {!w.facade && <p className="note">Changes the whole house’s facade. Choose “This wall only” to change just this wall.</p>}
        </>
      ) : (
        <>
          <ColorField label="Paint" value={faceColor(w, side)} onChange={setColour} paint />
          <Field label="Lining">
            <select
              value={own ?? ''}
              onChange={(e) => upd({ lining: { ...(w.lining ?? {}), [key]: (e.target.value || null) as LiningType | null } })}
            >
              <option value="">Room default ({LININGS[inherited]})</option>
              {(Object.keys(LININGS) as LiningType[]).map((k) => (
                <option key={k} value={k}>
                  {LININGS[k]}
                </option>
              ))}
            </select>
          </Field>
          <p className="note">Only this side of the wall changes; the other side keeps its own colour and lining.</p>
        </>
      )}
    </div>
  );
}
