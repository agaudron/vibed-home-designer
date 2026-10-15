/**
 * Every door in Hume Doors' entrance and internal catalogues (July 2022), drawn from the catalogue images as glass
 * lites, raised (moulded) panels, routed outlines and grooves. Coordinates are fractions of the leaf: x across from
 * the hinge (0–1), y up from the bottom (0–1), so each design scales to any door size.
 */

type El = ['g' | 'p' | 'r', number, number, number, number] | ['v', number, number, number] | ['h', number, number, number];

export interface HumeModel {
  code: string;
  range: string;
  use: 'entrance' | 'internal';
  color: string;
  els: El[];
  glass?: boolean;
  /** Matching sidelite (its code) and width. */
  sidelite?: string;
  sideliteWidth?: number;
  /** Shown in the list but not as its own door (it's a sidelite). */
  sideliteOnly?: boolean;
  note?: string;
}

const WHITE = '#f4f4ef'; // DuraXP / primed
const SPM = '#a86a43'; // Hume's standard timber veneer (SPM)

// ---------- helpers (fractions) ----------
const G = (x0: number, y0: number, x1: number, y1: number): El => ['g', x0, y0, x1, y1];
const P = (x0: number, y0: number, x1: number, y1: number): El => ['p', x0, y0, x1, y1];
const R = (x0: number, y0: number, x1: number, y1: number): El => ['r', x0, y0, x1, y1];
const V = (x: number, y0 = 0.03, y1 = 0.97): El => ['v', x, y0, y1];
const H = (y: number, x0 = 0, x1 = 1): El => ['h', y, x0, x1];
type Kind = 'g' | 'p' | 'r';
const box = (k: Kind, x0: number, y0: number, x1: number, y1: number): El => [k, x0, y0, x1, y1];
/** n horizontal strips of height h, evenly spaced between y0 and y1. */
const hslots = (k: Kind, n: number, y0: number, y1: number, h: number, x0 = 0.2, x1 = 0.8): El[] =>
  Array.from({ length: n }, (_, i) => {
    const c = n === 1 ? (y0 + y1) / 2 : y0 + h / 2 + ((y1 - y0 - h) * i) / (n - 1);
    return box(k, x0, c - h / 2, x1, c + h / 2);
  });
/** n vertical strips of width w, evenly spaced between x0 and x1. */
const vslots = (k: Kind, n: number, x0: number, x1: number, w: number, y0 = 0.1, y1 = 0.9): El[] =>
  Array.from({ length: n }, (_, i) => {
    const c = n === 1 ? (x0 + x1) / 2 : x0 + w / 2 + ((x1 - x0 - w) * i) / (n - 1);
    return box(k, c - w / 2, y0, c + w / 2, y1);
  });
/** cols × rows of lites / panels inside a box, with bars of `bar` (fraction of width) between them. */
const grid = (k: Kind, cols: number, rows: number, x0: number, y0: number, x1: number, y1: number, bar = 0.04): El[] => {
  const out: El[] = [];
  const cw = (x1 - x0 - bar * (cols - 1)) / cols;
  const barY = bar * 0.4; // bars read about the same thickness both ways on a tall door
  const rh = (y1 - y0 - barY * (rows - 1)) / rows;
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) out.push(box(k, x0 + c * (cw + bar), y0 + r * (rh + barY), x0 + c * (cw + bar) + cw, y0 + r * (rh + barY) + rh));
  return out;
};
const vgrooves = (n: number, x0: number, x1: number, y0 = 0.03, y1 = 0.97): El[] => Array.from({ length: n }, (_, i) => V(x0 + ((x1 - x0) * i) / Math.max(1, n - 1), y0, y1));
const hgrooves = (n: number, y0: number, y1: number, x0 = 0, x1 = 1): El[] => Array.from({ length: n }, (_, i) => H(y0 + ((y1 - y0) * i) / Math.max(1, n - 1), x0, x1));

// Common frames
const S = 0.14; // stile
/** Four-panel (two tall over two short) */
const fourPanel = (k: Kind = 'p', topGlass = false): El[] => [
  ...grid(topGlass ? 'g' : k, 2, 1, S, 0.45, 1 - S, 0.92, 0.07),
  ...grid(k, 2, 1, S, 0.08, 1 - S, 0.33, 0.07),
];
/** Tall panel / glass over a short bottom panel */
const overPanel = (top: Kind, bottom: Kind = 'p', split = 0.33): El[] => [box(top, S, split + 0.05, 1 - S, 0.92), box(bottom, S, 0.08, 1 - S, split)];

const m = (range: string, use: HumeModel['use'], color: string, defs: Record<string, El[] | [El[], Partial<HumeModel>]>): HumeModel[] =>
  Object.entries(defs).map(([code, d]) => {
    // Either a list of elements, or [elements, extra settings] (an element is itself an array starting with a letter).
    const pair = d.length === 2 && Array.isArray(d[0]) && (d[0].length === 0 || Array.isArray(d[0][0])) && !Array.isArray(d[1]);
    const [els, extra] = pair ? (d as [El[], Partial<HumeModel>]) : [d as El[], {}];
    return { code, range, use, color, els, glass: els.some((e) => e[0] === 'g'), ...extra };
  });
const side = (code: string, w = 400): Partial<HumeModel> => ({ sidelite: code, sideliteWidth: w });
const SL: Partial<HumeModel> = { sideliteOnly: true };

// ---------- Entrance ----------
const havenBottom = P(S, 0.07, 1 - S, 0.23);
const ENTRANCE: HumeModel[] = [
  ...m('Haven', 'entrance', WHITE, {
    HAV22: [P(S, 0.267, 1 - S, 0.934), havenBottom],
    HAV45: [[...grid('g', 1, 2, 0.24, 0.267, 0.76, 0.934, 0.06), P(0.24, 0.07, 0.76, 0.23)], SL],
    HAV66: [[...grid('g', 2, 3, S, 0.267, 1 - S, 0.934), havenBottom], side('HAV67')],
    HAV67: [[...grid('g', 1, 3, 0.24, 0.267, 0.76, 0.934, 0.06), P(0.24, 0.07, 0.76, 0.23)], SL],
    HAV88: [[...grid('g', 2, 4, S, 0.267, 1 - S, 0.934), havenBottom], side('HAV89')],
    HAV89: [[...grid('g', 1, 4, 0.24, 0.267, 0.76, 0.934, 0.06), P(0.24, 0.07, 0.76, 0.23)], SL],
    HAV99: [
      [
        // French-style: a big centre pane bordered by narrow lites
        G(0.28, 0.33, 0.72, 0.84),
        ...grid('g', 3, 1, S, 0.86, 1 - S, 0.934, 0.03),
        ...grid('g', 1, 4, S, 0.267, 0.25, 0.84, 0.03),
        ...grid('g', 1, 4, 0.75, 0.267, 1 - S, 0.84, 0.03),
        G(0.28, 0.267, 0.72, 0.31),
        havenBottom,
      ],
      side('HAV45'),
    ],
    HAV100: [[G(S, 0.267, 1 - S, 0.934), havenBottom], side('HAV45')],
  }),
  ...m('Savoy 820 / 1200', 'entrance', SPM, {
    XS2: fourPanel(),
    XS3: [fourPanel('p', true), side('XS4')],
    XS4: [overPanel('g', 'p'), SL],
    XS11: hslots('g', 4, 0.18, 0.86, 0.03, 0.22, 0.78),
    XS24: hslots('g', 4, 0.12, 0.9, 0.09, 0.2, 0.8),
    XS26: hslots('g', 6, 0.1, 0.91, 0.06, 0.2, 0.8),
    XS28: hslots('g', 8, 0.08, 0.92, 0.045, 0.2, 0.8),
    XS45: vslots('g', 3, 0.22, 0.78, 0.08, 0.1, 0.92),
  }),
  ...m('Verve', 'entrance', WHITE, {
    VER1: [G(0.15, 0.2, 0.19, 0.85)],
    VER4: hslots('g', 4, 0.36, 0.82, 0.018, 0.22, 0.78),
    VER6: hslots('g', 6, 0.3, 0.85, 0.018, 0.22, 0.78),
    VER11: [G(0.5, 0.2, 0.53, 0.85), G(0.56, 0.2, 0.59, 0.85)],
  }),
  ...m('Linear', 'entrance', WHITE, {
    XLR120: [G(0.15, 0.12, 0.21, 0.88), ...hgrooves(5, 0.16, 0.84, 0.27, 1)],
    XLR130: hgrooves(5, 0.16, 0.84),
    XLR140: [V(0.24), ...hgrooves(5, 0.16, 0.84, 0.24, 1)],
    XLR170: [V(0.16), V(0.19)],
    XLR700: [G(0.15, 0.12, 0.21, 0.88), ...vgrooves(6, 0.3, 0.88, 0.08, 0.92)],
  }),
  ...m('Linear', 'entrance', SPM, {
    XLR150: hgrooves(6, 0.15, 0.85),
    XLR160: [G(0.15, 0.12, 0.21, 0.88), ...hgrooves(6, 0.15, 0.85, 0.27, 1)],
    XLR300: [V(0.1), V(0.9), ...hgrooves(6, 0.15, 0.85, 0.1, 0.9)],
    XLR310: [...hgrooves(4, 0.55, 0.88), ...hgrooves(2, 0.2, 0.32)],
    XLR500: vgrooves(6, 0.12, 0.88),
    XLR600: hgrooves(10, 0.08, 0.92),
  }),
  ...m('Joinery', 'entrance', SPM, {
    JST1: [[G(S, 0.1, 1 - S, 0.93)], side('JST11')],
    JST11: [[G(0.2, 0.1, 0.8, 0.93)], SL],
    JST2: [[G(S, 0.43, 1 - S, 0.93), G(S, 0.1, 1 - S, 0.38)], side('JST11')],
    JST4: [grid('g', 1, 4, S, 0.1, 1 - S, 0.93, 0.08), side('JST12')],
    JST12: [grid('g', 1, 4, 0.2, 0.1, 0.8, 0.93, 0.08), SL],
    JST6: [[...grid('g', 2, 3, S, 0.45, 1 - S, 0.93, 0.05), ...grid('p', 2, 1, S, 0.08, 1 - S, 0.4, 0.07)], side('JST5')],
    JST10: [grid('g', 2, 5, S, 0.08, 1 - S, 0.93, 0.05), side('JST5')],
    JST5: [grid('g', 1, 5, 0.2, 0.08, 0.8, 0.93, 0.08), SL],
    XL10: grid('p', 2, 5, S, 0.06, 1 - S, 0.94, 0.06),
  }),
  ...m('Illusion', 'entrance', SPM, {
    // Glass all round a floating timber panel.
    XIL1: [[G(S, 0.08, 0.38, 0.93), G(0.62, 0.08, 1 - S, 0.93), G(0.38, 0.08, 0.62, 0.15), G(0.38, 0.86, 0.62, 0.93)], side('JST11')],
    XIL6: [
      [G(S, 0.08, 0.38, 0.93), G(0.62, 0.08, 1 - S, 0.93), G(0.38, 0.08, 0.62, 0.15), G(0.38, 0.86, 0.62, 0.93), G(0.48, 0.35, 0.52, 0.68)],
      side('JST11'),
    ],
    XIL21: [[G(S, 0.08, 0.4, 0.93), G(0.6, 0.08, 1 - S, 0.93), G(0.4, 0.08, 0.6, 0.15), G(0.4, 0.86, 0.6, 0.93)], side('JST11')],
    XIL26: [
      [G(S, 0.08, 0.4, 0.93), G(0.6, 0.08, 1 - S, 0.93), G(0.4, 0.08, 0.6, 0.15), G(0.4, 0.86, 0.6, 0.93), G(0.485, 0.35, 0.515, 0.68)],
      side('JST11'),
    ],
  }),
  ...m('Vaucluse', 'entrance', WHITE, {
    XV1: [R(0.13, 0.12, 0.2, 0.9)],
    XV4: grid('r', 2, 3, 0.2, 0.25, 0.8, 0.88, 0.1),
    XV9: grid('r', 1, 4, 0.36, 0.18, 0.64, 0.88, 0.1),
    XV10: hslots('r', 4, 0.2, 0.85, 0.035, 0.18, 0.82),
    XV14: [...grid('r', 2, 1, 0.18, 0.45, 0.82, 0.9, 0.1), ...grid('r', 2, 1, 0.18, 0.1, 0.82, 0.38, 0.1)],
    XV18: [R(0.15, 0.08, 0.85, 0.92), ...vgrooves(6, 0.25, 0.75, 0.1, 0.9)],
    XV20: hslots('r', 4, 0.18, 0.9, 0.12, 0.15, 0.85),
  }),
  ...m('Newington', 'entrance', WHITE, {
    XN1: [[G(0.15, 0.1, 0.2, 0.9)], side('XN9')],
    XN5: [hslots('g', 4, 0.25, 0.85, 0.025, 0.2, 0.8), side('XN11')],
    XN11: [hslots('g', 4, 0.25, 0.85, 0.025, 0.2, 0.8), SL],
    XN6: [[G(0.42, 0.12, 0.47, 0.88)], side('XN12')],
    XN12: [[G(0.45, 0.12, 0.55, 0.88)], SL],
    XN7: [grid('g', 1, 4, 0.4, 0.25, 0.6, 0.88, 0.1), side('XN9')],
    XN9: [[G(0.3, 0.1, 0.7, 0.9)], SL],
    XN14: [[G(0.25, 0.1, 0.75, 0.9)], { ...SL, sideliteWidth: 200 }],
    XN16: [hslots('g', 6, 0.35, 0.9, 0.022, 0.2, 0.8), side('XN11')],
  }),
  ...m('Regency', 'entrance', WHITE, {
    XR4: overPanel('p', 'p', 0.22),
    XR5: [overPanel('g', 'p', 0.22), side('XR6')],
    XR6: [overPanel('g', 'p', 0.22), SL],
  }),
  ...m('Nexus', 'entrance', WHITE, {
    NEX100: [G(S, 0.1, 1 - S, 0.93)],
    NEX30: vslots('g', 3, 0.22, 0.78, 0.08, 0.1, 0.92),
    NEX35: hslots('g', 4, 0.12, 0.9, 0.1, 0.2, 0.8),
    NEX36: hslots('g', 6, 0.1, 0.92, 0.06, 0.2, 0.8),
    NEX38: hslots('g', 8, 0.08, 0.92, 0.04, 0.2, 0.8),
    NEX40: [vslots('g', 4, 0.18, 0.82, 0.07, 0.1, 0.92), { note: 'Made in 1200 mm width only.' }],
  }),
  ...m('Vaucluse Premier', 'entrance', WHITE, {
    XVP11: fourPanel(),
    XVP12: [fourPanel('p', true), side('XVP13')],
    XVP13: [overPanel('g', 'p'), SL],
    XVP20: overPanel('p', 'p', 0.22),
    XVP22: [overPanel('g', 'p', 0.22), side('XVP13')],
  }),
  ...m('Carringbush', 'entrance', WHITE, {
    XCB1: [[G(S, 0.7, 1 - S, 0.93), ...grid('p', 2, 1, S, 0.08, 1 - S, 0.62, 0.07)], side('XCB2')],
    XCB2: [[G(0.2, 0.55, 0.8, 0.93), P(0.2, 0.08, 0.8, 0.47)], SL],
  }),
  ...m('Glass Opening', 'entrance', WHITE, {
    XF1: [G(S, 0.62, 1 - S, 0.92)],
    XF3: [G(S, 0.52, 1 - S, 0.92)],
    XF8: [G(S, 0.6, 1 - S, 0.92), R(S, 0.1, 1 - S, 0.45), ...vgrooves(7, 0.22, 0.78, 0.12, 0.43)],
  }),
];

// ---------- Internal ----------
const INTERNAL: HumeModel[] = [
  ...m('Hampton', 'internal', WHITE, {
    HAM2: [R(0.1, 0.05, 0.9, 0.95), H(0.4, 0.1, 0.9)],
    HAM4: [R(0.1, 0.05, 0.9, 0.95), ...hgrooves(3, 0.3, 0.7, 0.1, 0.9)],
    HAM5: [R(0.1, 0.05, 0.9, 0.95), H(0.8, 0.1, 0.9), V(0.5, 0.05, 0.8)],
    HAM10: [R(0.1, 0.05, 0.9, 0.95), V(0.22, 0.05, 0.95)],
    HAM6: [R(0.1, 0.05, 0.9, 0.95), ...hgrooves(8, 0.15, 0.85, 0.1, 0.9)],
  }),
  ...m('Humecraft', 'internal', WHITE, {
    HMC1: [P(S, 0.06, 1 - S, 0.94)],
    HMC2: overPanel('p', 'p', 0.25),
    HMC4: fourPanel(),
    HMC7: [P(S, 0.4, 1 - S, 0.94), P(S, 0.25, 1 - S, 0.33), P(S, 0.06, 1 - S, 0.2)],
    HMC8: [P(0.44, 0.08, 0.56, 0.92)],
    HMC10: hslots('p', 4, 0.2, 0.85, 0.04, 0.18, 0.82),
    HMC11: [G(S, 0.06, 1 - S, 0.94)],
  }),
  ...m('Sorrento', 'internal', WHITE, {
    SOR1: [R(0.43, 0.1, 0.57, 0.9)],
    SOR2: grid('r', 1, 3, 0.42, 0.15, 0.58, 0.88, 0.25),
    SOR5: hslots('r', 4, 0.25, 0.85, 0.03, 0.2, 0.8),
    SOR6: [R(0.45, 0.12, 0.52, 0.88)],
    SOR7: grid('r', 1, 4, 0.36, 0.2, 0.64, 0.88, 0.12),
    SOR8: [R(0.15, 0.4, 0.85, 0.92), R(0.15, 0.08, 0.85, 0.33)],
    SOR11: [R(0.15, 0.08, 0.85, 0.92)],
    SOR12: hslots('r', 4, 0.12, 0.92, 0.15, 0.15, 0.85),
    SOR22: [R(0.15, 0.35, 0.85, 0.92), ...vgrooves(7, 0.25, 0.75, 0.37, 0.9), R(0.15, 0.08, 0.85, 0.28)],
  }),
  ...m('Joinery (internal)', 'internal', SPM, {
    LIN1: [G(S, 0.1, 1 - S, 0.93)],
    LIN2: fourPanel(),
    LIN10: grid('g', 2, 5, S, 0.08, 1 - S, 0.93, 0.05),
    SAV2: fourPanel(),
    SAV3: fourPanel('p', true),
  }),
  ...m('Linear (internal)', 'internal', WHITE, {
    HLR210: [G(0.12, 0.08, 0.88, 0.94)],
    HLR230: hgrooves(4, 0.2, 0.8),
    HLR240: [V(0.24), ...hgrooves(4, 0.2, 0.8, 0.24, 1)],
    HLR270: [V(0.85), V(0.88)],
  }),
  ...m('Linear (internal)', 'internal', SPM, {
    HLR250: hgrooves(6, 0.15, 0.85),
    HLR400: [V(0.1), V(0.9), ...hgrooves(6, 0.15, 0.85, 0.1, 0.9)],
    HLR410: [...hgrooves(4, 0.55, 0.88), ...hgrooves(2, 0.2, 0.32)],
    HLR500: vgrooves(6, 0.12, 0.88),
    HLR600: hgrooves(10, 0.08, 0.92),
  }),
  ...m('Accent', 'internal', WHITE, {
    'HAG9 / PRE9': [V(0.15), V(0.19)],
    'HAG11 / PRE11': vgrooves(5, 0.15, 0.85),
    'HAG12 / PRE12': [R(0.15, 0.55, 0.85, 0.92), ...vgrooves(6, 0.25, 0.75, 0.57, 0.9)],
    'HAG14 / PRE14': hgrooves(12, 0.08, 0.92, 0.12, 0.88),
    'HAG18 / PRE18': hgrooves(14, 0.08, 0.92, 0.45, 0.55),
    'HA4 / PRE4': hgrooves(4, 0.2, 0.8),
    'HA5 / PRE5': [R(0.12, 0.06, 0.88, 0.94)],
    'HA40 / PRE40': hslots('r', 4, 0.35, 0.85, 0.025, 0.22, 0.78),
  }),
  ...m('Strata', 'internal', WHITE, {
    HST1: [],
    HST4: hgrooves(4, 0.2, 0.8, 0.25, 1),
    HST5: [V(0.45), V(0.48), V(0.51)],
    HST1M: [[V(0.12)], { note: 'Includes a metal strip.' }],
    HST4M: [[V(0.12), ...hgrooves(4, 0.2, 0.8, 0.25, 1)], { note: 'Includes a metal strip.' }],
  }),
  ...m('Moulded Panel', 'internal', WHITE, {
    'Oakfield OAK-G': fourPanel('p', true),
    'Oakfield OAK': fourPanel(),
    'Caprice CAP': overPanel('p', 'p', 0.3),
    'Pacific PAC': [...grid('p', 2, 1, S, 0.6, 1 - S, 0.94, 0.07), ...grid('p', 2, 1, S, 0.44, 1 - S, 0.54, 0.07), ...grid('p', 2, 1, S, 0.06, 1 - S, 0.38, 0.07)],
    'Denmark DEN': [P(S, 0.45, 1 - S, 0.94), P(S, 0.3, 1 - S, 0.39), P(S, 0.06, 1 - S, 0.24)],
    'Ascot ASC-G': fourPanel('p', true),
    'Ascot ASC': fourPanel(),
    'Hayman HAY': overPanel('p', 'p', 0.3),
  }),
];

export const HUME_MODELS: HumeModel[] = [...ENTRANCE, ...INTERNAL];
const BY_CODE = new Map(HUME_MODELS.map((x) => [x.code, x]));

/** Door-design key for a Hume model. */
export const humeKey = (code: string) => `hume:${code}`;

type Rect = [number, number, number, number];
/** Glass, raised panels and grooves in leaf millimetres for a Hume model (null if unknown). */
export function humeLayout(code: string, lw: number, lh: number): { glass: Rect[]; panels: Rect[]; grooves: Rect[] } | null {
  const mdl = BY_CODE.get(code);
  if (!mdl) return null;
  const glass: Rect[] = [];
  const panels: Rect[] = [];
  const grooves: Rect[] = [];
  const gw = 5; // groove width (mm)
  const routed = (x0: number, y0: number, x1: number, y1: number) =>
    grooves.push([x0, y0, x1, y0 + gw], [x0, y1 - gw, x1, y1], [x0, y0, x0 + gw, y1], [x1 - gw, y0, x1, y1]);
  for (const e of mdl.els) {
    if (e[0] === 'v') grooves.push([e[1] * lw - gw / 2, e[2] * lh, e[1] * lw + gw / 2, e[3] * lh]);
    else if (e[0] === 'h') grooves.push([e[2] * lw, e[1] * lh - gw / 2, e[3] * lw, e[1] * lh + gw / 2]);
    else {
      const r: Rect = [e[1] * lw, e[2] * lh, e[3] * lw, e[4] * lh];
      if (e[0] === 'g') glass.push(r);
      else if (e[0] === 'p') panels.push(r);
      else routed(...r);
    }
  }
  return { glass, panels, grooves };
}
