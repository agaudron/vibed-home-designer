import type { ReactNode } from 'react';
import { cornerLegs, outdoorOpts } from '../outdoor';

/**
 * Plan symbols drawn in item-local millimetres, centred on the item.
 * The back of the item is the top edge (-d/2) and the front is the bottom edge (+d/2).
 */
export function itemSymbol(type: string, w: number, d: number, options?: Record<string, string | number>): ReactNode {
  const bowls = Number(options?.bowls ?? 1);
  const hw = w / 2;
  const hd = d / 2;
  const L = (x1: number, y1: number, x2: number, y2: number, k?: string | number) => (
    <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} />
  );

  if (type.startsWith('fridge_')) return itemSymbol('fridge', w, d, options); // all fridge layouts

  switch (type) {
    case 'bed_single':
    case 'bed_double':
    case 'bed_queen':
    case 'bed_king': {
      const pillows = type === 'bed_single' ? 1 : 2;
      const pw = (w - 120 - (pillows - 1) * 60) / pillows;
      return (
        <>
          <rect x={-hw} y={-hd} width={w} height={60} className="sym-solid" />
          {Array.from({ length: pillows }, (_, i) => (
            <rect key={i} x={-hw + 60 + i * (pw + 60)} y={-hd + 110} width={pw} height={320} rx={60} />
          ))}
          <path d={`M${-hw} ${-hd + 560} L${hw} ${-hd + 560} M${-hw} ${-hd + 560} Q${-hw + 300} ${-hd + 760} ${-hw + 500} ${-hd + 560}`} />
        </>
      );
    }
    case 'cot':
      return (
        <>
          <rect x={-hw + 40} y={-hd + 40} width={w - 80} height={d - 80} />
          {Array.from({ length: 6 }, (_, i) => L(-hw + 40 + ((i + 1) * (w - 80)) / 7, -hd + 40, -hw + 40 + ((i + 1) * (w - 80)) / 7, -hd + 120, i))}
        </>
      );
    case 'wardrobe':
    case 'wardrobe_hinged':
    case 'linen':
    case 'walkin_shelving': {
      const doors = Math.max(1, Math.round(w / (type === 'wardrobe' ? 1200 : 600)));
      return (
        <>
          {type !== 'walkin_shelving' && L(-hw, hd - 40, hw, hd - 40)}
          {L(-hw + 60, 0, hw - 60, 0, 'rail')}
          {Array.from({ length: doors - 1 }, (_, i) => L(-hw + ((i + 1) * w) / doors, 0, -hw + ((i + 1) * w) / doors, hd, `d${i}`))}
          {type === 'wardrobe' && L(-hw, hd - 80, 0, hd - 80, 'slide')}
          {[0.2, 0.4, 0.6, 0.8].map((f) => L(-hw + w * f - 60, -60, -hw + w * f + 60, 60, `h${f}`))}
        </>
      );
    }
    case 'sink_cabinet':
      return (
        <>
          {L(-hw, hd - 20, hw, hd - 20)}
          <rect x={-hw + 80} y={-hd + 120} width={w - 160} height={d - 220} rx={50} />
          <circle cx={0} cy={-hd + 70} r={25} />
        </>
      );
    case 'cooktop_cabinet':
      return (
        <>
          {L(-hw, hd - 20, hw, hd - 20)}
          {[
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ].map(([sx, sy], i) => (
            <circle key={i} cx={(sx * w) / 4.5} cy={(sy * d) / 4.5} r={Math.min(w, d) / 8} />
          ))}
        </>
      );
    case 'base_cabinet':
    case 'drawer_cabinet':
    case 'dishwasher':
    case 'corner_cabinet':
      return (
        <>
          {L(-hw, hd - 20, hw, hd - 20)}
          {type === 'dishwasher' && L(-hw + 40, -hd + 40, hw - 40, hd - 60, 'x1')}
          {type === 'dishwasher' && L(hw - 40, -hd + 40, -hw + 40, hd - 60, 'x2')}
        </>
      );
    case 'tall_cabinet':
    case 'oven_tower':
    case 'fridge':
      return (
        <>
          {L(-hw, -hd, hw, hd)}
          {L(hw, -hd, -hw, hd, 2)}
          {L(-hw, hd - 30, hw, hd - 30, 3)}
        </>
      );
    case 'wall_cabinet':
    case 'rangehood':
    case 'mirror':
    case 'towel_rail':
      return <rect x={-hw} y={-hd} width={w} height={d} className="sym-dashed" />;
    case 'kaboodle':
    case 'cabinet': {
      // Draw it like the matching generic kitchen unit.
      const cls = String(options?.cls ?? 'base');
      const as: Record<string, string> = {
        sink: 'sink_cabinet',
        tub: 'laundry_tub',
        space: 'dashed',
        tower: 'tall_cabinet',
        cooktop: 'cooktop_cabinet',
        dishwasher: 'dishwasher',
        tall: 'tall_cabinet',
        oven_tower: 'oven_tower',
        wall: 'wall_cabinet',
        wall_corner: 'wall_cabinet',
        rangehood: 'wall_cabinet',
        fridge: 'wall_cabinet',
        panel: 'none',
        kickboard: 'none',
        benchtop: 'none',
      };
      const t = as[cls] ?? 'base_cabinet';
      if (t === 'dashed') return <rect x={-hw + 30} y={-hd + 30} width={w - 60} height={d - 60} className="sym-dashed" />; // an open gap
      return t === 'none' ? null : itemSymbol(t, w, d, options);
    }
    case 'abi_vanity':
      return itemSymbol(options?.double ? 'double_vanity' : 'vanity', w, d, options);
    case 'abi_basin':
    case 'abi_bath_filler':
      return <ellipse cx={0} cy={0} rx={hw - 10} ry={hd - 10} />;
    case 'abi_bath':
      return (
        <>
          <rect x={-hw} y={-hd} width={w} height={d} rx={Math.min(hw, hd) * 0.6} />
          <rect x={-hw + 60} y={-hd + 60} width={w - 120} height={d - 120} rx={Math.min(hw, hd) * 0.5} />
        </>
      );
    case 'abi_toilet':
      return itemSymbol('toilet', w, d, options);
    case 'abi_sink':
      return (
        <>
          <rect x={-hw} y={-hd} width={w} height={d} />
          <rect x={-hw + 30} y={-hd + 30} width={w - 60} height={d - 60} rx={30} />
        </>
      );
    case 'abi_mirror':
    case 'abi_towel_rail':
    case 'abi_shower':
    case 'abi_accessory':
      return <rect x={-hw} y={-hd} width={w} height={d} className="sym-dashed" />;
    case 'abi_tap':
      return <circle cx={0} cy={0} r={Math.max(hw, 25)} />;
    case 'shelving_rack':
    case 'shelving_rack_tall':
    case 'shelving_rack_narrow':
      // Outline with the four uprights.
      return (
        <>
          <rect x={-hw} y={-hd} width={w} height={d} />
          {[-1, 1].flatMap((sx) => [-1, 1].map((sy) => <rect key={`${sx}${sy}`} x={sx * hw - (sx > 0 ? 40 : 0)} y={sy * hd - (sy > 0 ? 40 : 0)} width={40} height={40} className="sym-solid" />))}
          {L(-hw + 40, 0, hw - 40, 0)}
        </>
      );
    case 'solar_array': {
      // Panel grid.
      const cols = Math.max(1, Number(options?.cols ?? 5));
      const rows = Math.max(1, Number(options?.rows ?? 2));
      return (
        <>
          {Array.from({ length: cols * rows }, (_, i) => {
            const c = i % cols;
            const r = Math.floor(i / cols);
            const pw = (w - (cols - 1) * 20) / cols;
            const ph = (d - (rows - 1) * 20) / rows;
            return <rect key={i} x={-hw + c * (pw + 20)} y={-hd + r * (ph + 20)} width={pw} height={ph} className="sym-dashed" />;
          })}
        </>
      );
    }
    case 'skylight':
      // Overhead: dashed outline with the usual cross.
      return (
        <>
          <rect x={-hw} y={-hd} width={w} height={d} className="sym-dashed" />
          <path d={`M${-hw} ${-hd} L${hw} ${hd} M${hw} ${-hd} L${-hw} ${hd}`} className="sym-dashed" />
        </>
      );
    case 'sun_tunnel':
      return (
        <>
          <circle cx={0} cy={0} r={hw} className="sym-dashed" />
          <path d={`M${-hw * 0.7} ${-hw * 0.7} L${hw * 0.7} ${hw * 0.7} M${hw * 0.7} ${-hw * 0.7} L${-hw * 0.7} ${hw * 0.7}`} className="sym-dashed" />
        </>
      );
    case 'banquette':
      // Back cushion line and the seat front.
      return (
        <>
          <rect x={-hw} y={-hd} width={w} height={d} />
          {L(-hw, -hd + Math.min(150, d * 0.25), hw, -hd + Math.min(150, d * 0.25))}
        </>
      );
    case 'banquette_l': {
      const sd = Math.min(600, hw, hd);
      const bt = Math.min(150, sd * 0.25);
      const s = options?.corner === 'right' ? 1 : -1;
      const x = s === 1 ? hw - sd : -hw + sd;
      const xs = s === 1 ? hw : -hw;
      const xb = s === 1 ? hw - bt : -hw + bt;
      return (
        <>
          <path d={`M${-hw} ${-hd} L${hw} ${-hd} M${-hw} ${-hd} L${-hw} ${-hd + sd} M${hw} ${-hd} L${hw} ${-hd + sd} M${-hw} ${-hd + sd} L${hw} ${-hd + sd}`} />
          <path d={`M${xs} ${-hd} L${xs} ${hd} L${x} ${hd} L${x} ${-hd + sd}`} />
          {L(-hw, -hd + bt, hw, -hd + bt)}
          {L(xb, -hd + bt, xb, hd)}
        </>
      );
    }
    case 'ac_indoor':
      // Wall-mounted, high: dashed outline with the airflow direction.
      return (
        <>
          <rect x={-hw} y={-hd} width={w} height={d} className="sym-dashed" />
          {L(-hw * 0.6, hd + 80, hw * 0.6, hd + 80)}
          {[-0.4, 0, 0.4].map((k) => (
            <path key={k} d={`M${hw * k} ${hd + 20} l0 140 m-40 -50 l40 50 l40 -50`} />
          ))}
        </>
      );
    case 'ac_outdoor': {
      const r = Math.min(hd * 0.9, w * 0.3);
      return (
        <>
          <circle cx={-hw + r + 60} cy={0} r={r} />
          {L(hw - w * 0.28, -hd + 40, hw - w * 0.28, hd - 40)}
        </>
      );
    }
    case 'buffet_hutch': {
      // Hutch outline (above) and the drawer line.
      const hd2 = Math.min(d * 0.78, 400);
      return (
        <>
          <rect x={-hw + 82} y={-hd} width={w - 164} height={hd2} className="sym-dashed" />
          {L(-hw + 45, hd - 40, hw - 45, hd - 40)}
        </>
      );
    }
    case 'island':
    case 'buffet_lombardozzi':
    case 'sideboard':
    case 'bench_seat':
      return L(-hw + 40, -hd + 40, hw - 40, -hd + 40);
    case 'sofa_3':
    case 'sofa_2':
    case 'armchair': {
      const seats = type === 'sofa_3' ? 3 : type === 'sofa_2' ? 2 : 1;
      const arm = Math.min(180, w * 0.15);
      const sw = (w - 2 * arm) / seats;
      return (
        <>
          <rect x={-hw} y={-hd} width={w} height={220} rx={40} />
          <rect x={-hw} y={-hd} width={arm} height={d} rx={40} />
          <rect x={hw - arm} y={-hd} width={arm} height={d} rx={40} />
          {Array.from({ length: seats }, (_, i) => (
            <rect key={i} x={-hw + arm + i * sw + 10} y={-hd + 230} width={sw - 20} height={d - 260} rx={40} />
          ))}
        </>
      );
    }
    case 'sofa_corner': {
      const sd = 950;
      return (
        <g transform={options?.corner === 'right' ? 'scale(-1 1)' : undefined}>
          <path
            d={`M${-hw} ${-hd} L${hw} ${-hd} L${hw} ${-hd + sd} L${-hw + sd} ${-hd + sd} L${-hw + sd} ${hd} L${-hw} ${hd} Z`}
            className="sym-fill"
          />
          <path d={`M${-hw + 220} ${hd} L${-hw + 220} ${-hd + 220} L${hw} ${-hd + 220}`} />
        </g>
      );
    }
    case 'coffee_table':
    case 'dining_table':
    case 'desk':
      return <rect x={-hw + 30} y={-hd + 30} width={w - 60} height={d - 60} />;
    case 'round_table':
      return <ellipse cx={0} cy={0} rx={hw - 30} ry={hd - 30} />;
    case 'chair':
    case 'bar_stool':
      return type === 'chair' ? <rect x={-hw} y={-hd} width={w} height={80} className="sym-solid" /> : <circle cx={0} cy={0} r={Math.min(w, d) / 3} />;
    case 'office_chair':
      return (
        <>
          <circle cx={0} cy={0} r={Math.min(w, d) / 2.6} />
          <rect x={-hw * 0.6} y={-hd + 40} width={w * 0.6} height={100} rx={40} className="sym-solid" />
        </>
      );
    case 'tv_unit':
    case 'dresser':
    case 'bedside':
    case 'filing':
      return L(-hw, hd - 30, hw, hd - 30);
    case 'tv':
      return <rect x={-hw} y={-hd} width={w} height={d} className="sym-solid" />;
    case 'bookshelf':
      return (
        <>
          {L(-hw, hd - 30, hw, hd - 30)}
          {L(-hw, -hd, hw, hd, 2)}
        </>
      );
    case 'fireplace':
      return <rect x={-hw * 0.6} y={-hd + 60} width={w * 0.6} height={d - 120} className="sym-solid" />;
    case 'rug':
      return <rect x={-hw + 60} y={-hd + 60} width={w - 120} height={d - 120} className="sym-dashed" />;
    case 'plant':
      return (
        <>
          <circle cx={0} cy={0} r={Math.min(w, d) / 2.5} />
          {[0, 60, 120].map((a) => {
            const r = Math.min(w, d) / 2;
            const c = Math.cos((a * Math.PI) / 180) * r;
            const s = Math.sin((a * Math.PI) / 180) * r;
            return L(-c, -s, c, s, a);
          })}
        </>
      );
    case 'floor_lamp':
      return (
        <>
          <circle cx={0} cy={0} r={Math.min(w, d) / 2.2} />
          <circle cx={0} cy={0} r={Math.min(w, d) / 10} className="sym-solid" />
        </>
      );
    case 'toilet':
      return (
        <>
          <rect x={-hw} y={-hd} width={w} height={d * 0.25} rx={30} />
          <ellipse cx={0} cy={-hd + d * 0.25 + (d * 0.75) / 2} rx={hw * 0.9} ry={(d * 0.75) / 2} />
          <ellipse cx={0} cy={-hd + d * 0.25 + (d * 0.75) / 2 + 20} rx={hw * 0.55} ry={(d * 0.75) / 2 - 90} />
        </>
      );
    case 'vanity':
    case 'vanity_tl':
    case 'double_vanity': {
      const basins = type === 'double_vanity' || (type === 'vanity_tl' && bowls >= 2 && w >= 1200) ? 2 : 1;
      return (
        <>
          {Array.from({ length: basins }, (_, i) => (
            <ellipse key={i} cx={-hw + ((i + 0.5) * w) / basins} cy={20} rx={Math.min(220, w / basins / 3)} ry={Math.min(150, d / 3)} />
          ))}
        </>
      );
    }
    case 'bath':
      return (
        <>
          <rect x={-hw + 70} y={-hd + 70} width={w - 140} height={d - 140} rx={Math.min(250, d / 3)} />
          <circle cx={-hw + 200} cy={0} r={30} />
        </>
      );
    case 'shower':
      return (
        <>
          {L(-hw, -hd, hw, hd)}
          {L(hw, -hd, -hw, hd, 2)}
          <circle cx={0} cy={0} r={50} />
          {L(-hw, hd - 10, hw, hd - 10, 3)}
        </>
      );
    case 'washer':
    case 'dryer':
      return (
        <>
          <circle cx={0} cy={30} r={Math.min(w, d) / 3} />
          {type === 'dryer' && <circle cx={0} cy={30} r={Math.min(w, d) / 5} />}
        </>
      );
    case 'laundry_tub':
      return (
        <>
          <rect x={-hw + 60} y={-hd + 100} width={w - 120} height={d - 180} rx={40} />
          <circle cx={0} cy={-hd + 60} r={25} />
        </>
      );
    case 'stairs': {
      const steps = Math.max(2, Math.round(d / 260));
      const lines = [];
      for (let i = 1; i < steps; i++) lines.push(L(-hw, hd - (i * d) / steps, hw, hd - (i * d) / steps, i));
      return (
        <>
          {lines}
          <path d={`M0 ${hd - 100} L0 ${-hd + 150} M-80 ${-hd + 280} L0 ${-hd + 150} L80 ${-hd + 280}`} />
        </>
      );
    }
    case 'column':
      return L(-hw, -hd, hw, hd);
    case 'car':
      return (
        <>
          <rect x={-hw + 120} y={-hd + d * 0.3} width={w - 240} height={d * 0.4} rx={150} />
          {L(-hw + 120, -hd + d * 0.3, -hw + 120, -hd + 300, 'w1')}
          {L(hw - 120, -hd + d * 0.3, hw - 120, -hd + 300, 'w2')}
        </>
      );
    case 'deck': {
      const lines = [];
      for (let y = -hd + 90; y < hd; y += 90) lines.push(L(-hw, y, hw, y, y));
      return <g className="sym-light">{lines}</g>;
    }
    case 'step': {
      // The nosing along the open edge(s); corner steps are an L (see itemOutline).
      const o = outdoorOpts({ type, options });
      if (o.shape === 'corner') return <path d={`M${-o.sx * hw} ${hd - 40} L${o.sx * (hw - 40)} ${hd - 40} L${o.sx * (hw - 40)} ${-hd}`} className="sym-dashed" />;
      return L(-hw, hd - 40, hw, hd - 40, 'nose');
    }
    case 'patio': {
      const lines = [];
      for (let x = -hw + 400; x < hw; x += 400) lines.push(L(x, -hd, x, hd, `x${x}`));
      for (let y = -hd + 400; y < hd; y += 400) lines.push(L(-hw, y, hw, y, `y${y}`));
      return <g className="sym-light">{lines}</g>;
    }
    case 'veranda':
      // No roof: just the open floor (slab joints), no posts or roof fall arrow.
      if (options?.roof === 'none') {
        const lines = [];
        for (let x = -hw + 600; x < hw; x += 600) lines.push(L(x, -hd, x, hd, `x${x}`));
        return <g className="sym-light">{lines}</g>;
      }
    // falls through
    case 'porch':
    case 'pergola': {
      const span = type === 'pergola' ? 3600 : type === 'veranda' ? 3600 : w;
      const n = Math.max(1, Math.ceil((w - 120) / span));
      const posts = Array.from({ length: n + 1 }, (_, i) => -hw + 60 + ((w - 120) * i) / n);
      const rows = type === 'pergola' ? [-hd + 60, hd - 60] : [hd - 60];
      const rafters = [];
      if (type === 'pergola') for (let x = -hw; x <= hw + 1; x += Math.min(600, hw)) rafters.push(L(x, -hd, x, hd, `r${x}`));
      return (
        <>
          <g className="sym-light">{rafters}</g>
          {type !== 'pergola' && <rect x={-hw} y={-hd} width={w} height={d} className="sym-dashed" />}
          {type === 'veranda' && <path d={`M0 ${-hd * 0.5} L0 ${hd * 0.5} M-90 ${hd * 0.5 - 150} L0 ${hd * 0.5} L90 ${hd * 0.5 - 150}`} />}
          {type === 'porch' && L(0, -hd, 0, hd, 'ridge')}
          {posts.flatMap((x) => rows.map((y) => <rect key={`${x}-${y}`} x={x - 45} y={y - 45} width={90} height={90} className="sym-solid" />))}
        </>
      );
    }
    default:
      return L(-hw, -hd, hw, hd);
  }
}

/** Items whose outline is not a plain rectangle. */
export function itemOutline(type: string, w: number, d: number, options?: Record<string, string | number>): ReactNode {
  const hw = w / 2;
  const hd = d / 2;
  if (type === 'step' && outdoorOpts({ type, options }).shape === 'corner') {
    const legs = cornerLegs({ type, options, width: w, depth: d });
    const [, [sx0, , sx1]] = legs;
    const sx = outdoorOpts({ type, options }).sx;
    const ix = sx > 0 ? sx0 : sx1;
    const fy0 = legs[0][1];
    // The L: front leg plus the side leg; the cut-out corner is left open (the higher level sits there).
    const pts = sx > 0 ? [[-hw, fy0], [ix, fy0], [ix, -hd], [hw, -hd], [hw, hd], [-hw, hd]] : [[hw, fy0], [ix, fy0], [ix, -hd], [-hw, -hd], [-hw, hd], [hw, hd]];
    return (
      <>
        <rect x={-hw} y={-hd} width={w} height={d} className="item-outline item-ghost" />
        <polygon points={pts.map((p) => p.join(',')).join(' ')} className="item-outline" />
      </>
    );
  }
  if (type === 'round_table' || type === 'plant' || type === 'floor_lamp' || type === 'bar_stool')
    return <ellipse cx={0} cy={0} rx={hw} ry={hd} className="item-outline" />;
  if (type === 'sofa_corner') return <rect x={-hw} y={-hd} width={w} height={d} className="item-outline item-ghost" />;
  return <rect x={-hw} y={-hd} width={w} height={d} className="item-outline" />;
}
