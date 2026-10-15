import { useEffect, useState } from 'react';
import { ITEM_MAP } from '../catalog';
import { isProductType, productInfo } from '../productInfo';
import type { ProductInfo } from '../productInfo';
import { store, useStore } from '../store';

/**
 * Pops up when you select (or ask about) a real product: photo, brand, description, key specs, price and links to
 * the product and the brand. It floats over the corner of the views and doesn't get in the way of editing.
 */

/** Show the card for an item (or a catalog entry, by type). */
export function openProductCard(target: { id?: string; type?: string }) {
  window.dispatchEvent(new CustomEvent('home-designer:product', { detail: target }));
}

export default function ProductCard() {
  const selId = useStore((s) => (s.selection?.kind === 'item' ? s.selection.id : null));
  const item = useStore((s) => (selId ? s.design.items.find((i) => i.id === selId) : undefined));
  const [catalogType, setCatalogType] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [info, setInfo] = useState<ProductInfo | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const t = (e as CustomEvent).detail as { id?: string; type?: string };
      if (t.type) setCatalogType(t.type);
      else setCatalogType(null);
      setDismissed(null);
    };
    window.addEventListener('home-designer:product', onOpen);
    return () => window.removeEventListener('home-designer:product', onOpen);
  }, []);
  // Selecting something else replaces a card opened from the catalog.
  useEffect(() => setCatalogType(null), [selId]);

  const subject = catalogType
    ? { type: catalogType, width: ITEM_MAP[catalogType]?.width, depth: ITEM_MAP[catalogType]?.depth, height: ITEM_MAP[catalogType]?.height }
    : item && isProductType(item.type)
      ? item
      : null;
  const key = catalogType ? `type:${catalogType}` : item ? `${item.id}:${item.type}:${JSON.stringify(item.options ?? {})}:${item.width}` : '';

  useEffect(() => {
    let live = true;
    setInfo(null);
    if (subject) void productInfo(subject).then((i) => live && setInfo(i));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!subject || !info || dismissed === key) return null;
  return (
    <div className="product-card" role="dialog" aria-label={`${info.brand}: ${info.name}`}>
      <button className="product-card-close" onClick={() => (setDismissed(key), setCatalogType(null))} aria-label="Close" title="Close">
        ✕
      </button>
      {info.image && (
        <a href={info.url ?? info.brandUrl} target="_blank" rel="noopener noreferrer" className="product-card-img">
          <img src={info.image} alt={info.name} loading="lazy" referrerPolicy="no-referrer" />
        </a>
      )}
      <div className="product-card-body">
        <div className="product-card-brand">{info.brand}</div>
        <div className="product-card-name">{info.name}</div>
        {info.price && <div className="product-card-price">{info.price}<span> when listed</span></div>}
        {info.description && <p className="product-card-desc">{info.description}</p>}
        {info.specs.length > 0 && (
          <dl className="product-card-specs">
            {info.specs.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {info.note && <p className="product-card-note">{info.note}</p>}
        <div className="product-card-links">
          {info.url && (
            <a className="primary" href={info.url} target="_blank" rel="noopener noreferrer">
              View product ↗
            </a>
          )}
          <a href={info.brandUrl} target="_blank" rel="noopener noreferrer">
            Visit {info.brand} ↗
          </a>
        </div>
        {catalogType && (
          <button className="product-card-place" onClick={() => (store.setTool({ kind: 'place', itemType: catalogType }), setCatalogType(null))}>
            Place one
          </button>
        )}
      </div>
    </div>
  );
}
