import type { ReactNode } from 'react';
import { BED_TIMBERS, cropLayout, EDGINGS, fenceOf, fenceRuns, gardenOf, isPlant, outlineOf, outwardNormal, shownScale, specOf, streetStrip, surfaceOf } from '../garden';
import type { GardenSpec } from '../garden';
import { EDGES } from '../outdoor';
import { add, deg, dist, formatArea, mul, polygonArea, polygonCentroid, rad, rot, sub, v } from '../geometry';
import type { Design, GardenArea, GardenItem, Selection, Vec } from '../types';

/**
 * The garden in the 2D plan: the block of land, yards and garden areas under the house (GardenGround), and the
 * fences, plants and features over it (GardenTop). Only clickable while the garden designer is open.
 */

const pts = (p: Vec[]) => p.map((q) => `${q.x},${q.y}`).join(' ');

/** Darken (f < 1) or lighten (f > 1) a hex colour. */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.max(0, Math.min(255, Math.round(f < 1 ? x * f : x + (255 - x) * (f - 1)))));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Small deterministic number from an id, for natural-looking variation that doesn't jump about. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

/** Surface patterns (grass, mulch, gravel, pavers), drawn faintly over each area's colour. */
function SurfacePatterns({ px, tiles }: { px: (n: number) => number; tiles: [number, number][] }) {
  const sw = px(1);
  return (
    <defs>
      <pattern id="gp-grass" width={240} height={240} patternUnits="userSpaceOnUse">
        {[
          [30, 40],
          [150, 20],
          [90, 120],
          [200, 150],
          [40, 190],
          [130, 210],
        ].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y} l-12 -40 M${x + 14} ${y} l4 -44`} stroke="#2f5a1f" strokeOpacity={0.35} strokeWidth={sw} fill="none" />
        ))}
      </pattern>
      <pattern id="gp-mulch" width={300} height={300} patternUnits="userSpaceOnUse">
        {[
          [20, 30, 50],
          [120, 60, -30],
          [220, 20, 15],
          [60, 140, 80],
          [180, 160, -60],
          [260, 240, 40],
          [100, 250, 0],
          [30, 230, -20],
        ].map(([x, y, a], i) => (
          <rect key={i} x={x} y={y} width={70} height={22} transform={`rotate(${a} ${x} ${y})`} fill="#000" fillOpacity={0.18} />
        ))}
      </pattern>
      <pattern id="gp-gravel" width={160} height={160} patternUnits="userSpaceOnUse">
        {[
          [20, 20],
          [90, 40],
          [140, 100],
          [50, 110],
          [110, 140],
          [10, 80],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={16} fill="#000" fillOpacity={0.14} />
        ))}
      </pattern>
      <pattern id="gp-soil" width={200} height={200} patternUnits="userSpaceOnUse">
        <path d="M0 50 H200 M0 150 H200" stroke="#000" strokeOpacity={0.15} strokeWidth={sw} />
      </pattern>
      {tiles.map(([l, w]) => (
        <pattern key={`${l}x${w}`} id={`gp-tile-${l}x${w}`} width={l} height={w * 2} patternUnits="userSpaceOnUse">
          <path d={`M0 0 H${l} M0 ${w} H${l} M0 0 V${w} M${l / 2} ${w} V${2 * w}`} stroke="#000" strokeOpacity={0.25} strokeWidth={sw} fill="none" />
        </pattern>
      ))}
    </defs>
  );
}

function patternFor(a: GardenArea): string | null {
  const s = surfaceOf(a);
  if (s.tile) return `url(#gp-tile-${s.tile[0]}x${s.tile[1]})`;
  if (s.tex === 'grass' || s.tex === 'turf') return 'url(#gp-grass)';
  if (s.tex === 'mulch') return 'url(#gp-mulch)';
  if (s.tex === 'gravel' || s.tex === 'aggregate') return 'url(#gp-gravel)';
  if (s.tex === 'soil') return 'url(#gp-soil)';
  return null;
}

/** Areas drawn yards first, then lawns, then hard surfaces, then beds (so beds sit in lawns). */
const AREA_ORDER: Record<string, number> = { yard: 0, lawn: 1, gravel: 2, paving: 3, driveway: 3, path: 4, veggie: 5, bed: 5 };

export function GardenGround(props: { design: Design; px: (n: number) => number; selection: Selection | null; editing: boolean; ghost: Vec[] | null }) {
  const { design, px, selection, editing } = props;
  const g = gardenOf(design);
  const tiles = [...new Set(g.areas.map((a) => surfaceOf(a).tile).filter((t): t is [number, number] => !!t).map((t) => t.join('x')))].map((k) => k.split('x').map(Number) as [number, number]);
  const areas = [...g.areas].sort((a, b) => AREA_ORDER[a.kind] - AREA_ORDER[b.kind]);
  const street = g.block && streetStrip(g.block);
  return (
    <g className={`garden-ground${editing ? ' editing' : ''}`} pointerEvents={editing ? undefined : 'none'}>
      <SurfacePatterns px={px} tiles={tiles} />
      {street && <Street s={street} />}
      {g.block && (
        <polygon
          points={pts(g.block.points)}
          className={`garden-block${selection?.kind === 'block' ? ' selected' : ''}`}
          data-kind={editing ? 'block' : undefined}
          data-id="block"
        />
      )}
      {areas.map((a) => {
        const outline = pts(outlineOf(a));
        const pat = patternFor(a);
        const edging = a.edging ? EDGINGS[a.edging] : null;
        const sel = selection?.kind === 'garden-area' && selection.id === a.id;
        return (
          <g key={a.id} className={`garden-area kind-${a.kind}${sel ? ' selected' : ''}`} data-kind={editing ? 'garden-area' : undefined} data-id={a.id}>
            <polygon points={outline} fill={surfaceOf(a).color} />
            {pat && <polygon points={outline} fill={pat} className="garden-pattern" />}
            {edging && <polygon points={outline} fill="none" stroke={edging.color} strokeWidth={Math.max(edging.width, px(2))} className="garden-edging" />}
          </g>
        );
      })}
      {props.ghost && <polygon points={pts(props.ghost)} className="garden-ghost-area" />}
    </g>
  );
}

/** The street in front of the block: a grass verge with a footpath, then the road. */
function Street({ s }: { s: { a: Vec; b: Vec; n: Vec } }) {
  const u = mul(sub(s.b, s.a), 1 / Math.max(1, dist(s.a, s.b)));
  const ext = 6000;
  const a = sub(s.a, mul(u, ext));
  const b = add(s.b, mul(u, ext));
  const band = (o0: number, o1: number) => pts([add(a, mul(s.n, o0)), add(b, mul(s.n, o0)), add(b, mul(s.n, o1)), add(a, mul(s.n, o1))]);
  const mid = add(mul(add(s.a, s.b), 0.5), mul(s.n, 8000));
  let ang = deg(Math.atan2(u.y, u.x));
  if (ang > 90.01 || ang < -89.99) ang += 180;
  return (
    <g className="garden-street">
      <polygon points={band(0, 3800)} className="verge" />
      <polygon points={band(1400, 2600)} className="footpath" />
      <polygon points={band(3800, 4000)} className="kerb" />
      <polygon points={band(4000, 11000)} className="road" />
      <text x={mid.x} y={mid.y} fontSize={900} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${ang} ${mid.x} ${mid.y})`}>
        STREET
      </text>
    </g>
  );
}

export function GardenTop(props: { design: Design; px: (n: number) => number; selection: Selection | null; editing: boolean; ghost: GardenItem | null }) {
  const { design, px, selection, editing } = props;
  const g = gardenOf(design);
  const fs = px(11);
  const runs = fenceRuns(g);
  const labels: ReactNode[] = [];
  if (editing) {
    for (const a of g.areas) {
      const outline = outlineOf(a);
      const area = polygonArea(outline);
      // Only label areas big enough on screen to fit the text.
      if (area / (px(1) * px(1)) < 4000) continue;
      const c = polygonCentroid(outline);
      labels.push(
        <g key={a.id} className={`garden-label kind-${a.kind}`}>
          <text x={c.x} y={c.y - px(6)} fontSize={fs} textAnchor="middle">
            {a.name}
          </text>
          <text x={c.x} y={c.y + px(8)} fontSize={px(10)} textAnchor="middle" className="sub">
            {`${surfaceOf(a).name} · ${formatArea(area)}`}
          </text>
        </g>,
      );
    }
    // Side lengths: the block's boundaries, and the straight sides of the selected area.
    const sideLabels = (p: Vec[], key: string, inside: boolean) =>
      p.forEach((a, i) => {
        const b = p[(i + 1) % p.length];
        const L = dist(a, b);
        if (L / px(1) < 50) return;
        const n = outwardNormal(p, i);
        const m = add(mul(add(a, b), 0.5), mul(n, (inside ? -1 : 1) * px(12)));
        let ang = deg(Math.atan2(b.y - a.y, b.x - a.x));
        if (ang > 90.01 || ang < -89.99) ang += 180;
        labels.push(
          <text key={`${key}${i}`} x={m.x} y={m.y} fontSize={px(10.5)} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${ang} ${m.x} ${m.y})`} className="garden-side">
            {`${(L / 1000).toFixed(2)} m`}
          </text>,
        );
      });
    if (g.block) sideLabels(g.block.points, 'b', false);
    const selArea = selection?.kind === 'garden-area' ? g.areas.find((a) => a.id === selection.id) : undefined;
    if (selArea && !selArea.curved) sideLabels(selArea.points, 'a', true);
  }
  return (
    <g className={`garden-top${editing ? ' editing' : ''}`} pointerEvents={editing ? undefined : 'none'}>
      {g.block && <polygon points={pts(g.block.points)} className="garden-boundary" />}
      <g className="garden-fences">
        {runs.map((r, i) => {
          const f = fenceOf(g.block!.sides[r.side]);
          const fence = g.block!.sides[r.side].fence;
          return <line key={i} x1={r.a.x} y1={r.a.y} x2={r.b.x} y2={r.b.y} stroke={fence === 'pool' ? '#6aa6b0' : shade(f.color, 0.85)} strokeWidth={Math.max(fence === 'rendered' ? 200 : 60, px(2.5))} className={`fence fence-${fence}`} />;
        })}
      </g>
      <g className="garden-items">
        {[...g.items]
          .sort((a, b) => specOrder(a) - specOrder(b))
          .map((it) => (
            <GardenItemSymbol key={it.id} it={it} scale={shownScale(g, it)} selected={selection?.kind === 'garden-item' && selection.id === it.id} editing={editing} px={px} />
          ))}
        {props.ghost && <GardenItemSymbol it={props.ghost} scale={shownScale(g, props.ghost)} selected={false} editing={false} px={px} ghost />}
      </g>
      {labels}
    </g>
  );
}

/** Low things first so trees draw over shrubs and beds. */
function specOrder(it: GardenItem) {
  const s = specOf(it);
  return s.form === 'tree' || s.form === 'eucalypt' || s.form === 'palm' || s.form === 'columnar' || s.form === 'citrus' ? 2 : s.group === 'raised' || s.id === 'stepping_stone' ? 0 : 1;
}

function GardenItemSymbol(props: { it: GardenItem; scale: number; selected: boolean; editing: boolean; px: (n: number) => number; ghost?: boolean }) {
  const { it, scale, px } = props;
  const s = specOf(it);
  const w = it.width * scale;
  const d = it.depth * scale;
  return (
    <g
      transform={`translate(${it.x} ${it.y}) rotate(${it.rotation})`}
      className={`garden-item g-${s.group}${props.selected ? ' selected' : ''}${props.ghost ? ' ghost' : ''}`}
      data-kind={props.editing ? 'garden-item' : undefined}
      data-id={it.id}
    >
      <title>{`${s.name}${s.botanical ? ` (${s.botanical})` : ''} — ${Math.round(it.width)} × ${Math.round(it.depth)} × ${Math.round(it.height)} mm${isPlant(s) ? ' when grown' : ''}`}</title>
      {isPlant(s) ? plantSymbol(s, it, w, d, px) : featureSymbol(s, it, px)}
      {props.selected && (s.round || isPlant(s) ? <circle r={w / 2 + px(4)} className="garden-sel" /> : <rect x={-it.width / 2 - px(4)} y={-it.depth / 2 - px(4)} width={it.width + px(8)} height={it.depth + px(8)} className="garden-sel" />)}
    </g>
  );
}

function plantSymbol(s: GardenSpec, it: GardenItem, w: number, d: number, px: (n: number) => number): ReactNode {
  const r = w / 2;
  const color = it.color ?? s.color;
  const edge = shade(color, 0.6);
  const sw = px(1);
  const h = hash(it.id);
  const dots = (n: number, rr: number, at: number, fill: string) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + h * 6;
      return <circle key={i} cx={Math.cos(a) * r * at} cy={Math.sin(a) * r * at} r={rr} fill={fill} />;
    });
  // Wavy outline round a circle: bumps of the given depth.
  const bumpy = (n: number, depth: number, irregular = 0) => {
    let p = '';
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const k = i % 2 === 0 ? 1 : 1 - depth;
      const rr = r * k * (1 - irregular * 0.5 + irregular * Math.abs(Math.sin(a * 2 + h * 9)));
      p += `${i ? 'L' : 'M'}${Math.cos(a) * rr} ${Math.sin(a) * rr}`;
    }
    return p + 'Z';
  };
  switch (s.form) {
    case 'tree':
    case 'citrus':
      return (
        <>
          <path d={bumpy(9, 0.12)} fill={color} fillOpacity={0.55} stroke={edge} strokeWidth={sw} />
          <circle r={r * 0.55} fill="none" stroke={edge} strokeOpacity={0.35} strokeWidth={sw} />
          {s.flower && dots(s.form === 'citrus' ? 7 : 9, Math.max(40, r * 0.06), 0.7, s.flower)}
          <circle r={Math.max(50, r * 0.05)} fill="#5a4330" />
        </>
      );
    case 'eucalypt':
      return (
        <>
          <path d={bumpy(7, 0.18, 0.5)} fill={color} fillOpacity={0.5} stroke={edge} strokeWidth={sw} />
          <circle r={Math.max(60, r * 0.06)} fill="#e6e1d6" stroke={edge} strokeWidth={sw} />
        </>
      );
    case 'palm':
      return (
        <>
          {Array.from({ length: 9 }, (_, i) => {
            const a = (i / 9) * Math.PI * 2 + h;
            return <path key={i} d={`M0 0 Q${Math.cos(a + 0.2) * r * 0.6} ${Math.sin(a + 0.2) * r * 0.6} ${Math.cos(a) * r} ${Math.sin(a) * r}`} stroke={color} strokeWidth={Math.max(r * 0.12, px(2))} fill="none" strokeLinecap="round" />;
          })}
          <circle r={Math.max(80, r * 0.08)} fill="#7a6a52" />
        </>
      );
    case 'columnar':
      return (
        <>
          <circle r={r} fill={color} fillOpacity={0.6} stroke={edge} strokeWidth={sw} />
          <circle r={r * 0.6} fill="none" stroke={edge} strokeOpacity={0.5} strokeWidth={sw} />
          <circle r={r * 0.25} fill="none" stroke={edge} strokeOpacity={0.5} strokeWidth={sw} />
          {s.flower && dots(5, Math.max(30, r * 0.07), 0.8, s.flower)}
        </>
      );
    case 'hedge':
      return (
        <>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={Math.min(w, d) * 0.35} fill={color} fillOpacity={0.7} stroke={edge} strokeWidth={sw} />
          {s.flower && <rect x={-w / 2 + d * 0.15} y={-d / 2 + d * 0.15} width={w - d * 0.3} height={d * 0.7} rx={d * 0.3} fill={s.flower} fillOpacity={0.25} />}
        </>
      );
    case 'grass':
    case 'strappy':
      return (
        <>
          <circle r={r} fill={color} fillOpacity={0.25} />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2 + h;
            return <line key={i} x1={0} y1={0} x2={Math.cos(a) * r} y2={Math.sin(a) * r} stroke={edge} strokeWidth={Math.max(px(1), r * 0.05)} strokeLinecap="round" />;
          })}
          {s.flower && dots(4, Math.max(25, r * 0.12), 0.85, s.flower)}
        </>
      );
    case 'groundcover':
      return (
        <>
          <path d={bumpy(10, 0.08)} fill={color} fillOpacity={0.55} stroke={edge} strokeWidth={sw} strokeDasharray={`${px(3)} ${px(2)}`} />
          {s.flower && dots(10, Math.max(18, r * 0.05), 0.55, s.flower)}
        </>
      );
    case 'climber':
      return (
        <>
          <circle r={r} fill={color} fillOpacity={0.4} stroke={edge} strokeWidth={sw} strokeDasharray={`${px(4)} ${px(3)}`} />
          <path d={`M${-r * 0.7} 0 Q${-r * 0.35} ${-r * 0.5} 0 0 T${r * 0.7} 0`} stroke={edge} strokeWidth={sw * 1.5} fill="none" />
          {s.flower && dots(6, Math.max(25, r * 0.06), 0.6, s.flower)}
        </>
      );
    case 'trellis':
      return (
        <>
          <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke="#8a6a4c" strokeWidth={Math.max(30, px(2))} />
          {(() => {
            const n = Math.max(2, Math.round(w / 200));
            return Array.from({ length: n }, (_, i) => <circle key={i} cx={-w / 2 + ((i + 0.5) * w) / n} cy={0} r={Math.min(110, w / n / 2)} fill={color} fillOpacity={0.7} />);
          })()}
        </>
      );
    case 'tomato':
    case 'veg':
      return (
        <>
          <circle r={r} fill={color} fillOpacity={0.7} stroke={edge} strokeWidth={sw} />
          {s.flower && dots(s.form === 'tomato' ? 5 : 3, Math.max(20, r * 0.13), 0.5, s.flower)}
          {s.form === 'tomato' && <circle r={20} fill="#8a6a4c" />}
        </>
      );
    default:
      return (
        <>
          <path d={bumpy(8, 0.1)} fill={color} fillOpacity={0.65} stroke={edge} strokeWidth={sw} />
          {s.flower && dots(6, Math.max(25, r * 0.07), 0.55, s.flower)}
        </>
      );
  }
}

/** The colour a raised bed, letterbox or feature is drawn in. */
export function featureColor(s: GardenSpec, it: GardenItem): string {
  if (it.color) return it.color;
  if (s.id === 'raised_timber') return BED_TIMBERS[String(it.options?.timber ?? 'hardwood')]?.color ?? s.color;
  if (s.id === 'letterbox_pier') return EDGES[String(it.options?.finish ?? 'brick')]?.color ?? s.color;
  if (s.id === 'retaining_wall') return EDGES[String(it.options?.edge ?? 'sleeper')]?.color ?? s.color;
  return s.color;
}

function featureSymbol(s: GardenSpec, it: GardenItem, px: (n: number) => number): ReactNode {
  const w = it.width;
  const d = it.depth;
  const r = w / 2;
  const color = featureColor(s, it);
  const edge = shade(color, 0.6);
  const sw = px(1);
  const box = (extra?: object) => <rect x={-w / 2} y={-d / 2} width={w} height={d} fill={color} stroke={edge} strokeWidth={sw} {...extra} />;
  switch (s.id) {
    case 'raised_timber':
    case 'raised_birdies': {
      const round = s.id === 'raised_birdies' && it.options?.shape === 'round';
      const t = s.id === 'raised_timber' ? Number(it.options?.thick ?? 75) : 30;
      const crops = cropLayout(it).map((c, i) => <circle key={i} cx={c.x} cy={c.y} r={Math.min(c.spec.width, 450) * 0.35} fill={c.spec.color} fillOpacity={0.85} />);
      const frame = color;
      return round ? (
        <>
          <circle r={r} fill={frame} stroke={shade(frame, 0.6)} strokeWidth={sw} />
          <circle r={r - t} fill="#4a3626" />
          {crops}
        </>
      ) : (
        <>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={s.id === 'raised_birdies' ? 60 : 0} fill={frame} stroke={shade(frame, 0.6)} strokeWidth={sw} />
          <rect x={-w / 2 + t} y={-d / 2 + t} width={w - 2 * t} height={d - 2 * t} fill="#4a3626" />
          {crops}
        </>
      );
    }
    case 'letterbox_pier':
    case 'letterbox_post':
    case 'letterbox_pillar':
      return (
        <>
          {box()}
          <path d={`M${-w * 0.3} ${-d * 0.2} H${w * 0.3} V${d * 0.2} H${-w * 0.3} Z M${-w * 0.3} ${-d * 0.2} L0 ${d * 0.05} L${w * 0.3} ${-d * 0.2}`} fill="#fff" fillOpacity={0.8} stroke={edge} strokeWidth={sw} />
        </>
      );
    case 'boulder': {
      const h = hash(it.id);
      const p = Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const k = 0.8 + 0.2 * Math.sin(a * 3 + h * 10);
        return v((Math.cos(a) * w * k) / 2, (Math.sin(a) * d * k) / 2);
      });
      return <polygon points={pts(p)} fill={color} stroke={edge} strokeWidth={sw} />;
    }
    case 'retaining_wall':
      return (
        <>
          {box()}
          {Array.from({ length: Math.floor(w / 400) }, (_, i) => (
            <line key={i} x1={-w / 2 + (i + 1) * 400} y1={-d / 2} x2={-w / 2 + (i + 1) * 400 - d} y2={d / 2} stroke={edge} strokeWidth={sw} />
          ))}
        </>
      );
    case 'pot':
      return (
        <>
          <circle r={r} fill={color} stroke={edge} strokeWidth={sw} />
          <circle r={r * 0.75} fill="#5f8a45" />
        </>
      );
    case 'birdbath':
      return (
        <>
          <circle r={r} fill={color} stroke={edge} strokeWidth={sw} />
          <circle r={r * 0.75} fill="#9cc7d6" />
        </>
      );
    case 'fire_pit':
      return (
        <>
          <circle r={r} fill={color} stroke={edge} strokeWidth={sw} />
          <circle r={r * 0.7} fill="#5a3a2a" />
          <circle r={r * 0.3} fill="#e0752b" fillOpacity={0.8} />
        </>
      );
    case 'bench':
      return (
        <>
          {box()}
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={-w / 2} y1={-d / 2 + d * f} x2={w / 2} y2={-d / 2 + d * f} stroke={edge} strokeWidth={sw} />
          ))}
        </>
      );
    case 'tank_slim':
      return (
        <>
          {box({ rx: d / 2 })}
          {Array.from({ length: Math.floor(w / 300) }, (_, i) => (
            <line key={i} x1={-w / 2 + (i + 1) * 300} y1={-d / 2} x2={-w / 2 + (i + 1) * 300} y2={d / 2} stroke={edge} strokeWidth={sw} />
          ))}
        </>
      );
    case 'tank_round':
    case 'compost':
      return (
        <>
          <circle r={r} fill={color} stroke={edge} strokeWidth={sw} />
          <circle r={r * 0.85} fill="none" stroke={edge} strokeWidth={sw} />
        </>
      );
    case 'clothesline':
      return (
        <>
          <circle r={r} fill="none" stroke={edge} strokeWidth={sw} strokeDasharray={`${px(4)} ${px(3)}`} />
          {[0, 1, 2, 3].map((i) => {
            const a = (i * Math.PI) / 2 + Math.PI / 4;
            return <line key={i} x1={0} y1={0} x2={Math.cos(a) * r} y2={Math.sin(a) * r} stroke={edge} strokeWidth={sw * 1.5} />;
          })}
          {[0.35, 0.65, 0.95].map((k) => (
            <rect key={k} x={(-r * k) / Math.SQRT2} y={(-r * k) / Math.SQRT2} width={(r * k * 2) / Math.SQRT2} height={(r * k * 2) / Math.SQRT2} fill="none" stroke={edge} strokeOpacity={0.5} strokeWidth={sw} />
          ))}
          <circle r={50} fill={edge} />
        </>
      );
    case 'shed':
      return (
        <>
          {box()}
          <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke={edge} strokeWidth={sw} />
          <rect x={-w * 0.2} y={d / 2 - 40} width={w * 0.4} height={40} fill={edge} />
        </>
      );
    case 'stepping_stone':
      return <circle r={r} fill={color} stroke={edge} strokeWidth={sw} />;
    default:
      return s.round ? <circle r={r} fill={color} stroke={edge} strokeWidth={sw} /> : box();
  }
}

/** Handles for the selected garden thing: corners of the block / an area (plus + to add one), or rotate and resize. */
export function gardenHandles(design: Design, selection: Selection | null, px: (n: number) => number): ReactNode[] {
  const g = gardenOf(design);
  const out: ReactNode[] = [];
  const hr = px(6);
  if (selection?.kind === 'block' || selection?.kind === 'garden-area') {
    const area = selection.kind === 'garden-area' ? g.areas.find((a) => a.id === selection.id) : undefined;
    const points = selection.kind === 'block' ? g.block?.points : area?.points;
    if (!points) return out;
    const sharp = new Set(area?.sharp ?? []);
    const id = selection.kind === 'block' ? 'block' : selection.id;
    const tip = area?.curved
      ? 'Drag to reshape · double-click to make this corner sharp / curved · Alt+click to remove it'
      : 'Drag to reshape · Alt+click to remove this corner';
    points.forEach((p, i) => {
      const q = points[(i + 1) % points.length];
      const m = mul(add(p, q), 0.5);
      if (dist(p, q) / px(1) > 30)
        out.push(
          <g key={`ins${i}`} className="handle insert" data-kind="handle" data-handle="garden-insert" data-id={id} data-index={i + 1}>
            <title>Drag to add a corner here</title>
            <circle cx={m.x} cy={m.y} r={hr * 0.8} />
            <path d={`M${m.x - hr * 0.45} ${m.y} H${m.x + hr * 0.45} M${m.x} ${m.y - hr * 0.45} V${m.y + hr * 0.45}`} />
          </g>,
        );
      const square = !area?.curved || sharp.has(i);
      out.push(
        square ? (
          <rect key={`v${i}`} x={p.x - hr} y={p.y - hr} width={hr * 2} height={hr * 2} className="handle" data-kind="handle" data-handle="garden-vertex" data-id={id} data-index={i}>
            <title>{tip}</title>
          </rect>
        ) : (
          <circle key={`v${i}`} cx={p.x} cy={p.y} r={hr} className="handle" data-kind="handle" data-handle="garden-vertex" data-id={id} data-index={i}>
            <title>{tip}</title>
          </circle>
        ),
      );
    });
  } else if (selection?.kind === 'garden-item') {
    const it = g.items.find((x) => x.id === selection.id);
    if (!it) return out;
    const k = shownScale(g, it);
    const r = rad(it.rotation);
    const c = v(it.x, it.y);
    const hd = (it.depth * k) / 2;
    const rp = add(c, rot(v(0, -hd - px(22)), r));
    const bp = add(c, rot(v(0, -hd), r));
    const cp = add(c, rot(v((it.width * k) / 2, hd), r));
    const s = specOf(it);
    out.push(
      <line key="rl" x1={bp.x} y1={bp.y} x2={rp.x} y2={rp.y} className="handle-line" />,
      <circle key="rot" cx={rp.x} cy={rp.y} r={hr} className="handle rotate" data-kind="handle" data-handle="garden-rotate" data-id={it.id}>
        <title>Drag to rotate (hold Shift for free rotation)</title>
      </circle>,
      <rect key="rs" x={cp.x - hr} y={cp.y - hr} width={hr * 2} height={hr * 2} className="handle" data-kind="handle" data-handle="garden-resize" data-id={it.id}>
        <title>{isPlant(s) ? 'Drag to change its grown size' : 'Drag to resize'}</title>
      </rect>,
    );
    const lp = add(c, rot(v(0, hd + px(14)), r));
    out.push(
      <text key="lbl" x={lp.x} y={lp.y} fontSize={px(11)} textAnchor="middle" dominantBaseline="middle" className="sel-label">
        {`${s.name}  ${Math.round(it.width)} × ${Math.round(it.depth)}`}
      </text>,
    );
  }
  return out;
}

