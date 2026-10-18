import type { ReactNode } from 'react';
import { cctColor, cctOf, ceilingHeight, controllersOf, GANG_COLORS, isCeilingFan, isController, isSwitchable, poolRadius, productOf, refBase, refsOf } from '../electrical';
import type { ElecProduct } from '../electrical';
import { add, dist, mul, rad, rot, sub, v } from '../geometry';
import type { Design, ElecPoint, Selection, Tool, Vec } from '../types';

/** Symbol radius in screen px: symbols stay the same size on screen, like text, so they can be clicked. */
const R = 7;

/** Where a point's symbol is drawn: wall-mounted ones just out from the wall face. */
export function symbolCentre(e: ElecPoint, px: (n: number) => number): Vec {
  return productOf(e).mount === 'wall' ? add(v(e.x, e.y), rot(v(0, px(R + 1)), rad(e.rotation))) : v(e.x, e.y);
}

/** The label inside a wall symbol. */
function tag(p: ElecProduct): string {
  if (p.kind === 'switch') return String(p.gangs ?? 1);
  if (p.kind === 'dimmer') return 'D';
  if (p.kind === 'fan_control') return 'F';
  if (p.id === 'iconic_gpo15') return '15';
  if (p.id.includes('usb')) return 'U';
  if (p.id === 'iconic_cooker') return 'CS';
  if (p.id === 'iconic_tv') return 'TV';
  if (p.id === 'iconic_data') return 'DA';
  return '';
}

/** Plan symbol, in the point's own frame (origin on the wall face / fitting centre, +y out of the wall). */
function symbol(p: ElecProduct, r: number, fs: number, turn: number): ReactNode {
  const x = (a: Vec, s: number) => `M${a.x - s} ${a.y - s} L${a.x + s} ${a.y + s} M${a.x + s} ${a.y - s} L${a.x - s} ${a.y + s}`;
  const c = v(0, r + r / R);
  const text = (t: string, at: Vec) =>
    t && (
      <text x={at.x} y={at.y} fontSize={t.length > 1 ? fs * 0.8 : fs} textAnchor="middle" dominantBaseline="central" className="elec-tag" transform={`rotate(${-turn} ${at.x} ${at.y})`}>
        {t}
      </text>
    );
  switch (p.kind) {
    case 'switch':
    case 'dimmer':
    case 'fan_control':
      return (
        <>
          <line x1={0} y1={0} x2={0} y2={c.y - r} />
          <circle cx={c.x} cy={c.y} r={r} />
          {text(tag(p), c)}
        </>
      );
    case 'gpo': {
      // Power point: a half circle on the wall, a stroke per outlet; outdoor ones boxed in.
      const n = p.id === 'iconic_gpo1' || p.id === 'iconic_gpo15' ? 1 : 2;
      const t = tag(p);
      return (
        <>
          <path d={`M${-r * 1.2} 0 A${r * 1.2} ${r * 1.2} 0 0 0 ${r * 1.2} 0 Z`} />
          {!t && Array.from({ length: n }, (_, i) => <line key={i} x1={(i - (n - 1) / 2) * r * 0.7} y1={r * 0.25} x2={(i - (n - 1) / 2) * r * 0.7} y2={r * 0.85} />)}
          {text(t, v(0, r * 0.55))}
          {p.outdoor && <rect x={-r * 1.6} y={0} width={r * 3.2} height={r * 1.8} className="elec-wp" />}
        </>
      );
    }
    case 'outlet':
      return (
        <>
          <rect x={-r * 1.1} y={0} width={r * 2.2} height={r * 1.6} />
          {text(tag(p), v(0, r * 0.8))}
        </>
      );
    case 'light': {
      if (p.mount === 'wall') {
        // Wall light: half a lamp symbol on the wall.
        const rr = r * 1.1;
        return (
          <>
            <path d={`M${-rr} 0 A${rr} ${rr} 0 0 0 ${rr} 0 Z`} />
            <path d={`M${-rr * 0.7} ${rr * 0.05} L${rr * 0.5} ${rr * 0.85} M${rr * 0.7} ${rr * 0.05} L${-rr * 0.5} ${rr * 0.85}`} />
            {p.id === 'outdoor_light' && <rect x={-r * 1.6} y={0} width={r * 3.2} height={r * 1.8} className="elec-wp" />}
          </>
        );
      }
      const rr = p.id === 'oyster' ? r * 1.15 : p.id === 'pendant' ? r : r * 0.8;
      return (
        <>
          <circle r={rr} className="elec-lamp" />
          {p.id === 'oyster' && <circle r={rr * 0.65} />}
          <path d={x(v(0, 0), rr * 0.7)} />
          {p.id === 'pendant' && <circle r={rr * 0.3} className="elec-dot" />}
        </>
      );
    }
    case 'fan':
      if (isCeilingFan(p))
        return (
          <>
            {/* Fans with a light: the lamp symbol in the middle of the blades. */}
            {p.fanLight ? (
              <>
                <circle r={r * 0.7} className="elec-lamp" />
                <path d={x(v(0, 0), r * 0.48)} />
              </>
            ) : (
              <circle r={r * 0.5} />
            )}
            {[0, 120, 240].map((a) => {
              const d = rot(v(0, -1), rad(a));
              const r0 = p.fanLight ? r * 0.7 : r * 0.5;
              return <line key={a} x1={d.x * r0} y1={d.y * r0} x2={d.x * r * 1.7} y2={d.y * r * 1.7} />;
            })}
          </>
        );
      return (
        <>
          <rect x={-r} y={-r} width={r * 2} height={r * 2} className="elec-lamp" />
          {text('EF', v(0, 0))}
        </>
      );
  }
}

/** A curved dashed line from a switch to a light it turns on (the usual way switching is shown on plans). */
function wire(a: Vec, b: Vec, bend: number) {
  const m = mul(add(a, b), 0.5);
  const d = sub(b, a);
  const c = add(m, mul(v(-d.y, d.x), bend));
  return `M${a.x} ${a.y} Q${c.x} ${c.y} ${b.x} ${b.y}`;
}

export function ElectricalLayer(props: { design: Design; px: (n: number) => number; selection: Selection | null; tool: Tool; ghost: ElecPoint | null; lit: Set<string> | null }) {
  const { design, px, selection, tool } = props;
  const r = px(R);
  const fs = px(8.5);
  const byId = new Map(design.electrical.map((e) => [e.id, e]));
  const selId = selection?.kind === 'electric' ? selection.id : null;
  const linking = tool.kind === 'elec-link' ? tool : null;
  // Lights the selected switch (or the switches of the selected light) turn on: drawn in their gang's colour.
  const focus = new Set<string>();
  const sel = selId ? byId.get(selId) : undefined;
  if (sel) {
    focus.add(sel.id);
    if (sel.gangs) sel.gangs.flat().forEach((ref) => focus.add(refBase(ref)));
    else refsOf(sel).forEach((ref) => controllersOf(design, ref).forEach(({ sw }) => focus.add(sw.id)));
  }
  const tint = new Map<string, string>();
  const linkSw = linking ? byId.get(linking.switchId) : sel?.gangs ? sel : undefined;
  linkSw?.gangs?.forEach((g, i) => g.forEach((ref) => tint.set(refBase(ref), GANG_COLORS[i % GANG_COLORS.length])));

  // Light spread demo: a soft pool of light on the floor under each light that's on.
  const pools: ReactNode[] = [];
  if (props.lit) {
    const ceiling = ceilingHeight(design);
    for (const e of design.electrical) {
      if (!props.lit.has(e.id)) continue;
      const pr = poolRadius(e, ceiling);
      const wall = productOf(e).mount === 'wall';
      const col = cctColor(cctOf(e));
      pools.push(
        <g key={e.id} transform={`translate(${e.x} ${e.y}) rotate(${e.rotation})`}>
          <radialGradient id={`pool-${e.id}`} gradientUnits="userSpaceOnUse" cx={0} cy={0} r={pr}>
            <stop offset="0" stopColor={col} stopOpacity={0.85} />
            <stop offset="0.55" stopColor={col} stopOpacity={0.45} />
            <stop offset="1" stopColor={col} stopOpacity={0} />
          </radialGradient>
          {wall ? <path d={`M${-pr} 0 A${pr} ${pr} 0 0 0 ${pr} 0 Z`} fill={`url(#pool-${e.id})`} /> : <circle r={pr} fill={`url(#pool-${e.id})`} />}
        </g>,
      );
    }
  }

  const wires: ReactNode[] = [];
  for (const sw of design.electrical) {
    if (!sw.gangs) continue;
    const a = symbolCentre(sw, px);
    sw.gangs.forEach((g, gi) =>
      g.forEach((id, k) => {
        const l = byId.get(refBase(id));
        if (!l) return;
        const b = symbolCentre(l, px);
        if (dist(a, b) < 1) return;
        const on = !sel || focus.has(sw.id);
        const current = linking && linking.switchId === sw.id && linking.gang === gi;
        wires.push(
          <path
            key={`${sw.id}-${gi}-${id}`}
            d={wire(a, b, 0.18 + 0.04 * ((gi + k) % 3))}
            stroke={GANG_COLORS[gi % GANG_COLORS.length]}
            className={`elec-wire${on ? '' : ' faded'}${current ? ' current' : ''}`}
          />,
        );
      }),
    );
  }

  const draw = (e: ElecPoint, ghost = false) => {
    const p = productOf(e);
    const selected = e.id === selId;
    const color = tint.get(e.id);
    const target = linking && !isController(p) && isSwitchable(p);
    const sweep = isCeilingFan(p) ? p.w / 2 : 0;
    return (
      <g
        key={ghost ? 'elec-ghost' : e.id}
        transform={`translate(${e.x} ${e.y}) rotate(${e.rotation})`}
        data-kind={ghost ? undefined : 'electric'}
        data-id={e.id}
        className={`elec k-${p.kind}${props.lit?.has(e.id) ? ' lit' : ''}${selected ? ' selected' : ''}${ghost ? ' ghost' : ''}${target ? ' target' : ''}${sel && !focus.has(e.id) && !linking ? ' dim' : ''}`}
        style={color ? { color } : undefined}
      >
        {!ghost && <title>{`${p.name}${p.code ? ` (${p.code})` : ''}${e.label ? ` — ${e.label}` : ''}`}</title>}
        {sweep > 0 && <circle r={sweep} className="elec-sweep" />}
        <circle cx={0} cy={p.mount === 'wall' ? r : 0} r={r * 2} className="elec-hit" />
        {symbol(p, r, fs, e.rotation)}
      </g>
    );
  };

  return (
    <g className={`electrical${linking ? ' linking' : ''}${props.lit ? ' demo' : ''}`}>
      {props.lit && <rect x={-1e6} y={-1e6} width={2e6} height={2e6} className="elec-night" />}
      {pools.length > 0 && <g className="elec-pools">{pools}</g>}
      {!props.lit && <g className="elec-wires">{wires}</g>}
      {design.electrical.map((e) => draw(e))}
      {props.ghost && draw(props.ghost, true)}
    </g>
  );
}
