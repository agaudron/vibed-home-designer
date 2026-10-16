import { useState } from 'react';
import { CATEGORIES, ITEMS, OPENINGS } from '../catalog';
import { isProductType } from '../productInfo';
import { openProductCard } from './ProductCard';
import type { ItemDef, OpeningDef } from '../catalog';
import { itemOutline, itemSymbol } from '../plan/symbols';
import { store, useStore } from '../store';

export default function Catalog() {
  const tool = useStore((s) => s.tool);
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ 'LG fridges': true }); // long list: open on demand
  const match = (name: string, cat: string) => {
    const s = q.trim().toLowerCase();
    return !s || name.toLowerCase().includes(s) || cat.toLowerCase().includes(s);
  };
  const openings = OPENINGS.filter((o) => match(o.name, 'doors windows'));
  const groups: [string, React.ReactNode[]][] = [];
  if (openings.length)
    groups.push([
      'Doors & windows',
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
  for (const cat of CATEGORIES) {
    const list = ITEMS.filter((i) => i.category === cat && match(i.name, cat));
    if (!list.length) continue;
    groups.push([
      cat,
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
      <div className="cat-scroll">
        {groups.map(([name, els]) => (
          <div key={name} className="cat-group">
            <button className="cat-head" onClick={() => setCollapsed((c) => ({ ...c, [name]: !c[name] }))}>
              <span className={`caret${collapsed[name] && !q ? '' : ' open'}`}>▸</span>
              {name}
            </button>
            {(!collapsed[name] || q) && <div className="cat-grid">{els}</div>}
          </div>
        ))}
        {!groups.length && <p className="note">Nothing matches “{q}”. Try “Custom block” and resize it.</p>}
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
