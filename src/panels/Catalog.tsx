import { useState } from 'react';
import { CATEGORIES, ITEMS, OPENINGS } from '../catalog';
import { isProductType } from '../productInfo';
import { openProductCard } from './ProductCard';
import type { ItemDef, OpeningDef } from '../catalog';
import { itemOutline, itemSymbol } from '../plan/symbols';
import { store, useStore } from '../store';

const DOORS = 'Doors & windows';

export default function Catalog() {
  const tool = useStore((s) => s.tool);
  const [q, setQ] = useState('');
  // Filters: one category (or all), widest allowed (mm), and only items modelled on a real product.
  const [cat, setCat] = useState('');
  const [maxW, setMaxW] = useState('');
  const [products, setProducts] = useState(false);
  // Every group starts collapsed; searching or filtering opens them all.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const widest = Number(maxW) > 0 ? Number(maxW) : Infinity;
  const filtering = !!q.trim() || !!cat || widest < Infinity || products;
  const match = (name: string, group: string, width: number, product: boolean) => {
    const s = q.trim().toLowerCase();
    if (cat && cat !== group) return false;
    if (width > widest || (products && !product)) return false;
    return !s || name.toLowerCase().includes(s) || group.toLowerCase().includes(s) || (group === DOORS && 'doors windows'.includes(s));
  };
  const openings = OPENINGS.filter((o) => match(o.name, DOORS, o.width, false));
  const groups: [string, React.ReactNode[]][] = [];
  if (openings.length)
    groups.push([
      DOORS,
      openings.map((o) => (
        <button
          key={o.id}
          className={`cat-item${tool.kind === 'opening' && tool.catalogId === o.id ? ' active' : ''}`}
          onClick={() => store.setTool({ kind: 'opening', catalogId: o.id })}
          title={`${o.name} — ${o.width} × ${o.height} mm. Click, then click on a wall.`}
        >
          <OpeningIcon def={o} />
          <span className="cat-name">{o.name}</span>
          <span className="cat-size">{o.width}</span>
        </button>
      )),
    ]);
  for (const c of CATEGORIES) {
    const list = ITEMS.filter((i) => i.category === c && match(i.name, c, i.width, isProductType(i.type) || !!i.link));
    if (!list.length) continue;
    groups.push([
      c,
      list.map((d) => (
        <div key={d.type} className="cat-cell">
          <button
            className={`cat-item${tool.kind === 'place' && tool.itemType === d.type ? ' active' : ''}`}
            onClick={() => store.setTool({ kind: 'place', itemType: d.type })}
            title={`${d.name} — ${d.width} × ${d.depth} × ${d.height} mm. Click, then click on the plan.`}
          >
            <ItemIcon def={d} />
            <span className="cat-name">{d.name}</span>
            <span className="cat-size">
              {d.width}×{d.depth}
            </span>
          </button>
          {isProductType(d.type) && (
            <button className="cat-info" onClick={() => openProductCard({ type: d.type })} title="Product details" aria-label={`${d.name}: product details`}>
              i
            </button>
          )}
        </div>
      )),
    ]);
  }

  return (
    <aside className="catalog">
      <input className="search" placeholder="Search furniture, doors…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="cat-filters">
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {[DOORS, ...CATEGORIES].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input type="number" min={0} step={100} placeholder="Max width" value={maxW} onChange={(e) => setMaxW(e.target.value)} aria-label="Max width (mm)" title="Only show items this wide or narrower (mm)" />
        <label className="toggle" title="Only items modelled on a real product you can buy">
          <input type="checkbox" checked={products} onChange={(e) => setProducts(e.target.checked)} />
          <span>Real products</span>
        </label>
        {filtering && (
          <button
            className="cat-clear"
            onClick={() => {
              setQ('');
              setCat('');
              setMaxW('');
              setProducts(false);
            }}
          >
            Clear
          </button>
        )}
      </div>
      <div className="cat-scroll">
        {groups.map(([name, els]) => {
          const open = filtering || !!expanded[name];
          return (
            <div key={name} className="cat-group">
              <button className="cat-head" onClick={() => setExpanded((c) => ({ ...c, [name]: !c[name] }))}>
                <span className={`caret${open ? ' open' : ''}`}>▸</span>
                {name}
                <span className="cat-count">{els.length}</span>
              </button>
              {open && <div className="cat-grid">{els}</div>}
            </div>
          );
        })}
        {!groups.length && <p className="note">Nothing matches. Clear the filters, or try “Custom block” and resize it.</p>}
      </div>
    </aside>
  );
}

function ItemIcon({ def }: { def: ItemDef }) {
  const pad = Math.max(def.width, def.depth) * 0.08;
  return (
    <svg className="cat-icon plan" viewBox={`${-def.width / 2 - pad} ${-def.depth / 2 - pad} ${def.width + 2 * pad} ${def.depth + 2 * pad}`}>
      <g className="item">
        {itemOutline(def.type, def.width, def.depth)}
        <g className="sym">{itemSymbol(def.type, def.width, def.depth)}</g>
      </g>
    </svg>
  );
}

function OpeningIcon({ def }: { def: OpeningDef }) {
  const k = def.kind;
  return (
    <svg className="cat-icon" viewBox="0 0 40 40">
      <rect x="1" y="17" width="8" height="6" className="ic-wall" />
      <rect x="31" y="17" width="8" height="6" className="ic-wall" />
      {k === 'door' && <path d="M9 23 L9 1 M9 1 A22 22 0 0 1 31 23" className="ic-line" />}
      {k === 'double_door' && <path d="M9 23 L9 12 M9 12 A11 11 0 0 1 20 23 M31 23 L31 12 M31 12 A11 11 0 0 0 20 23" className="ic-line" />}
      {k === 'sliding_door' && <path d="M9 18.5 L22 18.5 M18 21.5 L31 21.5" className="ic-line thick" />}
      {k === 'stacker_door' && <path d="M9 17.5 L18 17.5 M15 20 L25 20 M22 22.5 L31 22.5" className="ic-line thick" />}
      {k === 'cavity_door' && <path d="M1 20 L20 20" className="ic-line thick" />}
      {k === 'garage_door' && <path d="M9 20 L31 20" className="ic-line dashed" />}
      {k === 'window' && (
        <>
          <rect x="9" y="17" width="22" height="6" className="ic-win" />
          <path d="M9 20 L31 20" className="ic-line" />
        </>
      )}
    </svg>
  );
}
