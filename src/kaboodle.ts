/**
 * Kaboodle Kitchen range (flat-pack kitchens sold through Bunnings), for the Kitchen designer mode.
 *
 * Where the data came from (fetched 2026-10-16):
 *  - kaboodle.com.au product pages (from /products/sitemap.xml): product names, Kaboodle model numbers (W-xxxxx),
 *    published carcass dimensions, door colour / range / finish / profile, benchtop finishes, thicknesses and lengths,
 *    handle sizes and model numbers, descriptions and product photos (a.storyblok.com).
 *  - bunnings.com.au search results and product pages ("kaboodle …"): AUD prices (VIC metro, as listed that day),
 *    cabinet widths that Kaboodle's site doesn't list on its own, and the panel / kickboard / island panel range
 *    (model numbers + sizes), which Kaboodle's site doesn't list as products. Bunnings photos are media.bunnings.com.au.
 *
 * Conventions / estimates (not published as such):
 *  - Cabinet prices are for the white melamine carcass only; doors, drawer fronts, panels, handles and legs are extra.
 *    Price-per-colour items (wine rack, microwave box, panels, kickboards) are given for one colour, as labelled.
 *  - depth includes the door: Kaboodle publishes carcass depths (base 560, wall 300, deep/medium wall 400); +20mm for
 *    door and buffers gives 580 / 320 / 420, which matches Kaboodle's base, wall and deep-wall end panel depths.
 *    Pantry depths (580) are as published. Corner units use width = depth = the length along each wall.
 *  - elevation: base and tall units on Kaboodle's recommended 145mm legs (kickboards are 145mm); benchtop at 865
 *    (145 + 720). Wall-hung units are top-aligned at 2200mm (= a 2055mm pantry on 145mm legs, Kaboodle's standard
 *    alignment), so a 720mm wall cabinet sits at 1480, medium 550 at 1650, slimline 360 at 1840 (estimate).
 *  - doors: 1 door up to 450mm wide, 2 from 600mm (Bunnings lists "2 x 300mm doors" for the 600 base etc.); rangehood,
 *    slimline and pantry door counts are estimates. Oven towers are Kaboodle's combinations (no single code/price).
 *  - The "600mm Dishwasher Space" is not a Kaboodle product: Kaboodle has no integrated dishwasher panel or cabinet.
 *  - Sink: Kaboodle only has dedicated farmhouse sink cabinets (600/800); the standard 600/800/900 base cabinets are
 *    repeated as sink cabinets because that is what Kaboodle uses under an inset sink.
 *  - Not included: customisable (cut-to-measure width) cabinets and open shelves, wireware, bins, hinges, sinks.
 *  - Door hex colours were averaged from Kaboodle's swatch images (very light renders were toned down slightly);
 *    handle colours are typical for the finish. Cut-to-measure benchtop lengths are a sample up to the 3600mm maximum.
 *
 * Counts: base 10, drawer 7, sink 5, cooktop 2, corner 2, dishwasher 1, wall 27, wall_corner 3, rangehood 4, tall 9, oven_tower 3, fridge 1, panel 14, kickboard 3, benchtop 5.
 */

export type KaboodleClass =
  | 'base'        // base cabinet with doors (and shelf)
  | 'drawer'      // base drawer unit (2/3/4 drawers)
  | 'sink'        // sink base cabinet
  | 'cooktop'     // cooktop / oven base cabinet (oven under bench)
  | 'corner'      // base corner (blind corner / L corner)
  | 'dishwasher'  // dishwasher space / panel (integrated dishwasher door) — if Kaboodle has it
  | 'wall'        // wall (overhead) cabinet
  | 'wall_corner' // wall corner cabinet
  | 'rangehood'   // rangehood cabinet / overhead above cooktop
  | 'tall'        // pantry / broom / tall cabinet
  | 'oven_tower'  // tall oven / microwave tower
  | 'fridge'      // over-fridge cabinet / fridge surround
  | 'panel'       // end panels, fillers, island back panels
  | 'kickboard'
  | 'benchtop';

export const KABOODLE_CLASSES: KaboodleClass[] = ['base', 'drawer', 'sink', 'cooktop', 'corner', 'dishwasher', 'wall', 'wall_corner', 'rangehood', 'tall', 'oven_tower', 'fridge', 'panel', 'kickboard', 'benchtop'];

export interface KaboodleProduct {
  cls: KaboodleClass;
  name: string;          // Kaboodle's product name
  code: string;          // Bunnings item number / Kaboodle SKU if seen, else ''
  group: string;         // sub-group shown in the list, e.g. "Base cabinets – 2 door"
  width: number;         // mm, overall incl. door
  depth: number;         // mm, incl. door (base ≈ 580, wall ≈ 300 — use the real ones)
  height: number;        // mm, carcass + door, EXCLUDING legs/benchtop (base ≈ 720)
  elevation: number;     // mm off the floor when installed: base/tall 150 (legs), wall cabinets typical 1500 (bottom of wall cabinet ≈ 1500 when bench is 900 and splashback 600), benchtop at top of base cabinets
  doors: number;         // number of doors on the front (0 for open/panel)
  drawers: number;       // number of drawers on the front
  price: string;         // as listed, e.g. "$149" (carcass/cabinet only if that's how it's sold), '' if unknown
  url: string;           // product page URL, or '' if unknown
  image: string;         // product photo URL, or ''
  description: string;   // one short sentence
}

/** Door / panel colours and styles (Kaboodle sells doors separately in ranges/finishes). */
export interface KaboodleDoor {
  name: string;          // e.g. "Matt White", "Classic White Shaker" – Kaboodle's names
  range: string;         // e.g. "Flat", "Shaker", "Gloss", "Woodgrain", "V-groove" … as Kaboodle groups them
  style: 'flat' | 'shaker' | 'vgroove' | 'gloss' | 'timber';
  hex: string;           // approximate colour, '#rrggbb'
  url: string;
  image: string;
}

export interface KaboodleBenchtop {
  name: string;
  material: string;      // e.g. "Laminate", "Timber", "Stone-look"
  hex: string;           // approximate colour
  thickness: number;     // mm (laminate ≈ 33)
  lengths: number[];     // available lengths mm
  depth: number;         // mm (≈ 600/650 standard, 900 island if available)
  price: string;
  url: string;
  image: string;
}

export interface KaboodleHandle {
  name: string;
  finish: string;
  hex: string;
  style: 'bar' | 'd' | 'knob' | 'cup' | 'edge' | 'none';
  length: number;        // mm (knob ≈ 30)
  price: string;
  url: string;
  image: string;
}

export const KABOODLE_HOME = 'https://www.kaboodle.com.au/';
const KB = 'https://kaboodle.com.au/products/';
const BN = 'https://www.bunnings.com.au/';
const SB = 'https://a.storyblok.com/f/188515/';
const BM = 'https://media.bunnings.com.au/api/public/content/';

/** Page path → URL: 'bn:' = Bunnings product page, otherwise a kaboodle.com.au/products/ path. */
const pageUrl = (p: string) => (!p ? '' : p.startsWith('bn:') ? BN + p.slice(3) : KB + p);
/** Image path → URL: 'bn:' = Bunnings media, otherwise a Kaboodle (Storyblok) asset path. */
const imageUrl = (p: string) => (!p ? '' : p.startsWith('bn:') ? BM + p.slice(3) : SB + p);
const hex = (h: string) => `#${h}`;

// One row per product: class | name | code (Kaboodle model no.) | group | W | D | H | elevation | doors | drawers | price | page | image | description.
const ROWS = `
base|150mm Base Cabinet|W-51600|Base cabinets|150|580|720|145|1|0|$109|cabinets/base-cabinets/base-cabinets/150mm-base-cabinet-au|1600x1600/1472314e0d/kb-au-150mm-base-cabinets_1600x1600.png|Our 150mm base cabinet comes with solid 16mm backs, adjustable legs for easy levelling and an adjustable shelf with shelf supports.
base|200mm Base Cabinet|W-51601|Base cabinets|200|580|720|145|1|0|$107|cabinets/base-cabinets/base-cabinets/200mm-base-cabinet-au|1600x1600/53ecbbe0f9/kb-au-200mm-base-cabinets_1600x1600.png|Our 200mm base cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
base|300mm Base Cabinet|W-51602|Base cabinets|300|580|720|145|1|0|$113|cabinets/base-cabinets/base-cabinets/300mm-base-cabinet-au|1600x1600/679e4d100c/kb-au-300mm-base-cabinets_1600x1600.png|Our 300mm base cabinet comes with solid 16mm backs, adjustable legs for easy levelling and an adjustable shelf.
base|400mm Base Cabinet|W-51603|Base cabinets|400|580|720|145|1|0|$124|cabinets/base-cabinets/base-cabinets/400mm-base-cabinet-au|1600x1600/a5a049b42e/kb-au-400mm-base-cabinets_1600x1600.png|Our 400mm Base Cabinet comes with solid 16mm backs, adjustable legs for easy levelling and an adjustable shelf.
base|450mm Base Cabinet|W-51604|Base cabinets|450|580|720|145|1|0|$146|cabinets/base-cabinets/base-cabinets/450mm-base-cabinet-au|1600x1600/15199d59bf/kb-au-450mm-base-cabinets_1600x1600.png|Our 450mm base cabinet comes with a solid 16mm back, adjustable legs for easy levelling and an adjustable shelf.
base|600mm Base Cabinet|W-51605|Base cabinets|600|580|720|145|2|0|$151|cabinets/base-cabinets/base-cabinets/600mm-base-cabinet-au|1600x1600/2c16020dbc/kb-au-600mm-base-cabinets_1600x1600.png|Our 600mm base cabinet comes with solid 16mm backs, adjustable legs for easy levelling and an adjustable shelf with shelf supports.
base|800mm Base Cabinet|W-51606|Base cabinets|800|580|720|145|2|0|$178|cabinets/base-cabinets/base-cabinets/800mm-base-cabinet-au|1600x1600/7428fb2a5b/kb-au-800mm-base-cabinets_1600x1600.png|Our 800mm Base Cabinet comes with solid 16mm backs, adjustable legs for easy levelling and an adjustable shelf.
base|900mm Base Cabinet|W-51607|Base cabinets|900|580|720|145|2|0|$202|cabinets/base-cabinets/base-cabinets/900mm-base-cabinet-au|1600x1600/96324d159f/kb-au-900mm-base-cabinets_1600x1600.png|Our 900mm Base Cabinet comes with solid 16mm backs, adjustable legs for easy levelling and an adjustable shelf.
base|450mm 1 Door 1 Drawer Base Cabinet|W-51618|Base cabinets – door & drawer|450|580|720|145|1|1|$187|cabinets/base-cabinets/450mm-1-door-1-drawer-base-cabinet-au|1600x1600/711179a7fe/kb-au-450mm_1door_1drawerbase-cabinets_1600x1600.png|Our 450mm 1 door 1 drawer cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
base|150mm Wine Rack||Wine racks|150|320|720|145|0|0|$126 (Sea Salt)|cabinets/base-cabinets/base-cabinets/150mm-wine-rack-au|450x450/61a174f559/kb_anz_150mm-winerack-base-cabinet.png|Open 150mm wine rack, finished in your door colour; fits a base or wall run.
drawer|450mm 3 Drawer Base Cabinet|W-51614|Drawer cabinets|450|580|720|145|0|3|$253|cabinets/base-cabinets/drawer-cabinets/450mm-3-drawer-base-cabinet-au|1600x1600/03cd6d1f8a/kb-au-450mm_3drawer-base-cabinets_1600x1600.png|Our 450mm 3 drawer base cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
drawer|450mm 4 Drawer Base Cabinet|W-51617|Drawer cabinets|450|580|720|145|0|4|$243|cabinets/base-cabinets/drawer-cabinets/450mm-4-drawer-base-cabinet-au|1600x1600/f95062d42c/kb-au-450mm-4drawer-base-cabinets_1600x1600.png|Our 450mm 4 Drawer base ccabinet comes with solid 16mm backs, adjustable legs for easy levelling and timber drawer boxes as standard.
drawer|600mm 1 Drawer Base Cabinet|W-51611|Drawer cabinets|600|580|290|145|0|1|$216|cabinets/base-cabinets/drawer-cabinets/600mm-1-drawer-base-cabinet-au|1600x1600/94251cd2aa/kb-au-600mm_1drawer-base-cabinets_1600x1600.png|Single 290mm-high drawer unit, used under a cooktop/oven or inside an oven tower.
drawer|600mm 2 Drawer Base Cabinet|W-51612|Drawer cabinets|600|580|720|145|0|2|$270|cabinets/base-cabinets/drawer-cabinets/600mm-2-drawer-base-cabinet-au|1600x1600/958f469865/kb-au-600mm_2drawer-base-cabinets_1600x1600.png|Our 600mm 2 drawer cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
drawer|600mm 3 Drawer Base Cabinet|W-51615|Drawer cabinets|600|580|720|145|0|3|$343|cabinets/base-cabinets/drawer-cabinets/600mm-3-drawer-base-cabinet-au|1600x1600/37bba7aa10/kb-au-600mm_3drawer-base-cabinets_1600x1600.png|Our 600mm 3 drawer cabinet is part of our modular cabinet range.
drawer|900mm 2 Drawer Base Cabinet|W-51613|Drawer cabinets|900|580|720|145|0|2|$300|cabinets/base-cabinets/drawer-cabinets/900mm-2-drawer-base-cabinet-au|1600x1600/8386724797/kb-au-900mm_2drawer-base-cabinets_1600x1600.png|Our 900mm 2 drawer cabinet is part of our modular cabinet range.
drawer|900mm 3 Drawer Base Cabinet|W-51616|Drawer cabinets|900|580|720|145|0|3|$429|cabinets/base-cabinets/drawer-cabinets/900mm-3-drawer-base-cabinet-au|1600x1600/99a0218dbf/kb-nz-900mm_3drawer-base-cabinets_1600x1600.png|Our 900mm 3 drawer cabinet is part of our modular cabinet range.
sink|600mm Farmhouse Sink Cabinet|W-79959|Sink cabinets – farmhouse|600|580|460|145|2|0|$152|cabinets/base-cabinets/farmhouse-sink-cabinets/600mm-farmhouse-sink-cabinet-au|1600x1600/5c9feeb78d/kb-au-600mm-farmhouse-sink-base-cabinets_1600x1600.png|Reinforced, moisture-resistant 600mm cabinet for a Kaboodle 600mm farmhouse sink (the sink apron fills the space above).
sink|800mm Farmhouse Sink Cabinet|W-79960|Sink cabinets – farmhouse|800|580|460|145|2|0|$181|cabinets/base-cabinets/farmhouse-sink-cabinets/800mm-farmhouse-sink-cabinet-au|1600x1600/02a39d00a2/kb-au-800mm-farmhouse-sink-base-cabinets_1600x1600.png|Reinforced, moisture-resistant 800mm cabinet for a Kaboodle 800mm farmhouse sink (the sink apron fills the space above).
sink|600mm Base Cabinet (sink)|W-51605|Sink cabinets – standard base|600|580|720|145|2|0|$151|cabinets/base-cabinets/base-cabinets/600mm-base-cabinet-au|1600x1600/2c16020dbc/kb-au-600mm-base-cabinets_1600x1600.png|Kaboodle has no dedicated sink carcass: a standard 600mm base cabinet is used under an inset sink.
sink|800mm Base Cabinet (sink)|W-51606|Sink cabinets – standard base|800|580|720|145|2|0|$178|cabinets/base-cabinets/base-cabinets/800mm-base-cabinet-au|1600x1600/7428fb2a5b/kb-au-800mm-base-cabinets_1600x1600.png|Kaboodle has no dedicated sink carcass: a standard 800mm base cabinet is used under an inset sink.
sink|900mm Base Cabinet (sink)|W-51607|Sink cabinets – standard base|900|580|720|145|2|0|$202|cabinets/base-cabinets/base-cabinets/900mm-base-cabinet-au|1600x1600/96324d159f/kb-au-900mm-base-cabinets_1600x1600.png|Kaboodle has no dedicated sink carcass: a standard 900mm base cabinet is used under an inset sink.
cooktop|600mm Oven Cabinet|W-51609|Oven cabinets (under bench)|600|580|720|145|0|0|$130|cabinets/appliance-cabinets/oven-cabinets/600mm-oven-cabinet-au|1600x1600/20ad4fee68/kb-au_appliance_cabinets_600mm-underbench-oven-cabinet-1600x1600.png|Our 600mm Oven Cabinet comes with an open back for ventilation, adjustable legs for easy levelling and heat deflectors.
cooktop|900mm Oven Cabinet|W-51610|Oven cabinets (under bench)|900|580|720|145|0|0|$203|cabinets/appliance-cabinets/oven-cabinets/900mm-oven-cabinet-au|1600x1600/95b742e21d/kb-au_appliance_cabinets_900mm-underbench-oven-cabinet-1600x1600.png|Our 900mm oven cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store (usually within 7 days).
corner|900mm Corner Base Cabinet|W-51608|Corner base cabinets|900|900|720|145|2|0|$252|cabinets/base-cabinets/corner-base-cabinets/900mm-corner-base-cabinet-au|1600x1600/3ef72b98fb/kb-au-900mm-cornerbase-cabinets_1600x1600.png|L-shaped corner base cabinet, 900mm along each wall (560mm deep carcass), with a 2-pack bi-fold corner door.
corner|1000mm Blind Corner Base Cabinet|W-70106|Corner base cabinets|984|580|720|145|1|0|$222|cabinets/base-cabinets/corner-base-cabinets/1000mm-blind-corner-base-cabinet-au|1600x1600/14877a0466/kb-au-1000mm_blindcorner-base-cabinets_1600x1600.png|Blind corner base cabinet: 984mm wide but needs a 1000mm space; the blind side takes a blind corner base panel.
dishwasher|600mm Dishwasher Space||Appliance spaces (not a Kaboodle product)|600|580|720|145|0|0||||Not sold by Kaboodle: a 600mm gap for a freestanding or built-under dishwasher (no integrated dishwasher panel in the range).
wall|150mm Wall Cabinet|W-51619|Wall cabinets – 720mm|150|320|720|1480|1|0|$68.41|cabinets/wall-cabinets/wall-cabinets/150mm-wall-cabinet-au|1600x1600/9b038ac8cd/kb-au_wc_150mm_wall-cabinet-1600x1600.png|Our 150mm wall cabinet comes with solid 16mm backs, and an adjustable shelf with shelf supports to meet all your storage needs.
wall|200mm Wall Cabinet|W-51620|Wall cabinets – 720mm|200|320|720|1480|1|0|$74.41|cabinets/wall-cabinets/wall-cabinets/200mm-wall-cabinet-au|1600x1600/95b32f2b4d/kb-au_wc_200mm_wall-cabinet-1600x1600.png|Our 200mm wall cabinet is part of our modular cabinet range.
wall|300mm Wall Cabinet|W-51621|Wall cabinets – 720mm|300|320|720|1480|1|0|$99.20|cabinets/wall-cabinets/wall-cabinets/300mm-wall-cabinet-au|1600x1600/39de450c7f/kb-au_wc_300mm_wall-cabinet-1600x1600.png|Our 300mm wall cabinet is part of our modular cabinet range.
wall|400mm Wall Cabinet|W-51622|Wall cabinets – 720mm|400|320|720|1480|1|0|$102|cabinets/wall-cabinets/wall-cabinets/400mm-wall-cabinet-au|1600x1600/c8882e2c17/kb-au_wc_400mm_wall-cabinet-1600x1600.png|Our 400mm wall cabinet comes with solid 16mm backs, and an adjustable shelf with shelf supports to meet all your storage needs.
wall|450mm Wall Cabinet|W-51623|Wall cabinets – 720mm|450|320|720|1480|1|0|$119|cabinets/wall-cabinets/wall-cabinets/450mm-wall-cabinet-au|1600x1600/50f83fa944/kb-au_wc_450mm_wall-cabinet-1600x1600.png|Our 450mm wall cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
wall|600mm Wall Cabinet|W-51624|Wall cabinets – 720mm|600|320|720|1480|2|0|$124|cabinets/wall-cabinets/wall-cabinets/600mm-wall-cabinet-au|1600x1600/652ccacbc3/kb-au_wc_600mm_wall-cabinet-1600x1600.png|Our 600mm wall cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
wall|800mm Wall Cabinet|W-51625|Wall cabinets – 720mm|800|320|720|1480|2|0|$140|cabinets/wall-cabinets/wall-cabinets/800mm-wall-cabinet-au|1600x1600/627b0227ee/kb-au_wc_800mm_wall-cabinet-1600x1600.png|Our 800mm wall cabinet comes with solid 16mm backs, and an adjustable shelf with shelf supports to meet all your storage needs.
wall|900mm Wall Cabinet|W-51626|Wall cabinets – 720mm|900|320|720|1480|2|0|$168|cabinets/wall-cabinets/wall-cabinets/900mm-wall-cabinet-au|1600x1600/2ac8879e70/kb-au_wc_900mm_wall-cabinet-1600x1600.png|Our 900mm wall cabinet is part of our modular cabinet range.
wall|150mm Wine Wall Rack||Wine racks|150|320|720|1480|0|0||cabinets/wall-cabinets/wall-cabinets/150mm-wine-rack-wall-cabinet-au|450x450/d0989282f3/kb_anz_150mm-winerack-wall-cabinet.png|Open 150mm wine rack installed as a wall cabinet.
wall|300mm Medium Wall Cabinet|W-51882|Medium wall cabinets – 550mm (400 deep)|300|420|550|1650|1|0||cabinets/wall-cabinets/medium-wall-cabinets/300mm-medium-wall-cabinet-au|1600x1600/10ef9a2521/kb-au_wc_300mm_medium-wall-cabinet-1600x1600.png|Our 300mm medium wall cabinet is part of our modular cabinet range.
wall|400mm Medium Wall Cabinet|W-51883|Medium wall cabinets – 550mm (400 deep)|400|420|550|1650|1|0|$93.29|cabinets/wall-cabinets/medium-wall-cabinets/400mm-medium-wall-cabinet-au|1600x1600/c4fddc5fb1/kb-au_wc_400mm_medium-wall-cabinet-1600x1600.png|Our 400mm medium wall cabinet is part of our modular cabinet range.
wall|450mm Medium Wall Cabinet|W-51884|Medium wall cabinets – 550mm (400 deep)|450|420|550|1650|1|0|$101|cabinets/wall-cabinets/medium-wall-cabinets/450mm-medium-wall-cabinet-au|1600x1600/058185ce90/kb-au_wc_450mm_medium-wall-cabinet-1600x1600.png|Our 450mm medium wall cabinet is part of our modular cabinet range.
wall|600mm Medium Wall Cabinet|W-51885|Medium wall cabinets – 550mm (400 deep)|600|420|550|1650|2|0|$139|cabinets/wall-cabinets/medium-wall-cabinets/600mm-medium-wall-cabinet-au|1600x1600/86719647ee/kb-anz-versatility-600mm-medium-wall-cabinet-ld-1600x1600.png|Our 600mm medium wall cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
wall|800mm Medium Wall Cabinet|W-51886|Medium wall cabinets – 550mm (400 deep)|800|420|550|1650|2|0|$159|cabinets/wall-cabinets/medium-wall-cabinets/800mm-medium-wall-cabinet-au|1600x1600/4314d2e26f/kb-au_wc_800mm_medium-wall-cabinet-1600x1600.png|Our 800mm medium wall cabinet is part of our modular cabinet range.
wall|900mm Medium Wall Cabinet|W-51887|Medium wall cabinets – 550mm (400 deep)|900|420|550|1650|2|0|$172|cabinets/wall-cabinets/medium-wall-cabinets/900mm-medium-wall-cabinet-au|1600x1600/aa7d28cb09/kb-au_wc_900mm_medium-wall-cabinet-1600x1600.png|Our 900mm medium wall cabinet is part of our modular cabinet range.
wall|150mm Deep Wall Cabinet|W-51870|Deep wall cabinets – 720mm (400 deep)|150|420|720|1480|1|0|$86.49|cabinets/wall-cabinets/deep-wall-cabinets/150mm-deep-wall-cabinet-au|1600x1600/0ae2158325/kb-anz-versatility-150mm-deep-wall-cabinet-ld-1600x1600.png|Our 150mm deep wall cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
wall|200mm Deep Wall Cabinet|W-51871|Deep wall cabinets – 720mm (400 deep)|200|420|720|1480|1|0|$94.06|cabinets/wall-cabinets/deep-wall-cabinets/200mm-deep-wall-cabinet-au|1600x1600/a1b865de95/kb-anz-versatility-200mm-deep-wall-cabinet-ld-1600x1600.png|Our 200mm deep wall cabinet is part of our modular cabinet range.
wall|300mm Deep Wall Cabinet|W-51872|Deep wall cabinets – 720mm (400 deep)|300|420|720|1480|1|0|$126|cabinets/wall-cabinets/deep-wall-cabinets/300mm-deep-wall-cabinet-au|1600x1600/8c2613adf1/kb-anz-versatility-300mm-deep-wall-cabinet-ld-1600x1600.png|Our 300mm deep wall cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
wall|400mm Deep Wall Cabinet|W-51873|Deep wall cabinets – 720mm (400 deep)|400|420|720|1480|1|0|$129|cabinets/wall-cabinets/deep-wall-cabinets/400mm-deep-wall-cabinet-au|1600x1600/3e70e9cb12/kb-anz-versatility-400mm-deep-wall-cabinet-ld-1600x1600.png|Our 400mm deep wall cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
wall|450mm Deep Wall Cabinet|W-51874|Deep wall cabinets – 720mm (400 deep)|450|420|720|1480|1|0|$150|cabinets/wall-cabinets/deep-wall-cabinets/450mm-deep-wall-cabinet-au|1600x1600/59bf7ebca8/kb-anz-versatility-450mm-deep-wall-cabinet-ld-1600x1600.png|Our 450mm deep wall cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
wall|600mm Deep Wall Cabinet|W-51875|Deep wall cabinets – 720mm (400 deep)|600|420|720|1480|2|0|$157|cabinets/wall-cabinets/deep-wall-cabinets/600mm-deep-wall-cabinet-au|1600x1600/479cf14879/kb-anz-versatility-600mm-deep-wall-cabinet-ld-1600x1600.png|Our 600mm deep wall cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
wall|800mm Deep Wall Cabinet|W-51876|Deep wall cabinets – 720mm (400 deep)|800|420|720|1480|2|0|$177|cabinets/wall-cabinets/deep-wall-cabinets/800mm-deep-wall-cabinet-au|1600x1600/b3433bbb0d/kb-anz-versatility-800mm-deep-wall-cabinet-ld-1600x1600.png|Our 800mm deep wall cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
wall|900mm Deep Wall Cabinet|W-51877|Deep wall cabinets – 720mm (400 deep)|900|420|720|1480|2|0|$213|cabinets/wall-cabinets/deep-wall-cabinets/900mm-deep-wall-cabinet-au|1600x1600/c7cdf4278d/kb-anz-versatility-900mm-deep-wall-cabinet-ld-1600x1600.png|Our 900mm deep wall cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
wall|600mm Slimline Wall Cabinet|W-51629|Slimline wall cabinets – 360mm (over fridge / rangehood)|600|320|360|1840|1|0|$98.08|cabinets/wall-cabinets/slimline-wall-cabinets/600mm-slimline-wall-cabinet-au|1600x1600/466e3df8fb/kb-au_wc_600mm_slimline-wall-cabinet-1600x1600.png|Our 600mm slimline wall cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
wall|800mm Slimline Wall Cabinet|W-51630|Slimline wall cabinets – 360mm (over fridge / rangehood)|800|320|360|1840|1|0|$117|cabinets/wall-cabinets/slimline-wall-cabinets/800mm-slimline-wall-cabinet-au|1600x1600/669d4cfdfa/kb-au_wc_800mm_slimline-wall-cabinet-1600x1600.png|Our 800mm Slimline Cabinets come with solid 16mm backs and an adjustable shelf with shelf supports
wall|900mm Slimline Wall Cabinet|W-51631|Slimline wall cabinets – 360mm (over fridge / rangehood)|900|320|360|1840|1|0|$127|cabinets/wall-cabinets/slimline-wall-cabinets/900mm-slimline-wall-cabinet-au|1600x1600/1874d0870d/kb-au_wc_900mm_slimline-wall-cabinet-1600x1600.png|Our 900mm slimline wall cabinet come with solid 16mm backs.
wall|1000mm Slimline Wall Cabinet|W-51987|Slimline wall cabinets – 360mm (over fridge / rangehood)|1000|320|360|1840|1|0|$133|cabinets/wall-cabinets/slimline-wall-cabinets/100mm-slimline-wall-cabinet-au|1600x1600/9cf79f2c0b/kb-nz_wc_1000mm_slimline-wall-cabinet-1600x1600.png|Our 1000mm slimline wall cabinet come with solid 16mm backs.
wall_corner|Corner Wall Cabinet|W-51627|Corner wall cabinets|600|600|720|1480|2|0|$162|cabinets/wall-cabinets/corner-wall-cabinets/corner-wall-cabinet-au|1600x1600/1dd78c3ec7/kb-au_wc_600mm_corner-wall-cabinet-1600x1600.png|L-shaped corner wall cabinet, 600mm along each wall (300mm deep carcass), with a 2-pack corner door.
wall_corner|Deep Corner Wall Cabinet|W-51878|Corner wall cabinets|700|700|720|1480|2|0|$204|cabinets/wall-cabinets/deep-wall-cabinets/deep-corner-wall-cabinet-au|1600x1600/d5bf303292/kb-anz-versatility-600mm-deep-corner-wall-cabinet-ld-1600x1600.png|L-shaped deep (400mm) corner wall cabinet, 700mm along each wall.
wall_corner|Deep Fingerpull Corner Wall Cabinet|W-51879|Corner wall cabinets|700|700|700|1500|2|0|$197|cabinets/wall-cabinets/deep-wall-cabinets/deep-fingerpull-corner-wall-cabinet-au|1600x1600/b9124b0317/kb-anz-versatility-600mm-deep-corner-fingerpull-wall-cabinet-ld-1600x1600.png|Deep corner wall cabinet with a fingerpull (handle-free) bottom edge, 700mm along each wall.
rangehood|600mm Slideout Rangehood Cabinet|W-51628|Rangehood cabinets|600|320|600|1600|1|0|$96.95|cabinets/appliance-cabinets/rangehood-cabinets/600mm-slideout-rangehood-cabinet-au|1600x1600/bebd5d53e8/kb-au_appliance_cabinets_600mm-slideout-rangehood-cabinet-1600x1600.png|Our 600mm slideout rangehood cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
rangehood|900mm Slideout Rangehood Cabinet|W-51636|Rangehood cabinets|900|320|600|1600|1|0|$153|cabinets/appliance-cabinets/rangehood-cabinets/900mm-slideout-rangehood-cabinet-au|1600x1600/6da899054b/kb-au_appliance_cabinets_900mm-slideout-rangehood-cabinet-1600x1600.png|Our 900mm slideout rangehood cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
rangehood|600mm Medium Slideout Rangehood Cabinet|W-51888|Rangehood cabinets|600|320|550|1650|1|0|$96.95|cabinets/appliance-cabinets/rangehood-cabinets/600mm-medium-slideout-rangehood-cabinet|1600x1600/9971affc5d/kb-au_appliance_cabinets_600mm-medium-slideout-rangehood-cabinet-1600x1600.png|Our 600mm medium slideout cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
rangehood|900mm Medium Slideout Rangehood Cabinet|W-51889|Rangehood cabinets|900|320|550|1650|1|0|$150|cabinets/appliance-cabinets/rangehood-cabinets/900mm-medium-slideout-rangehood-cabinet|1600x1600/8a7934c0ea/kb-au_appliance_cabinets_900mm-medium-slideout-rangehood-cabinet-1600x1600.png|Our 900mm slideout rangehood cabinet is designed to suit a variety of 900mm slide out slideout rangehoods by simply installing the bottom panel at the required height.
tall|450mm Pantry Cabinet|W-51632|Pantry cabinets – 2055mm|450|580|2055|145|1|0|$334|cabinets/pantry-cabinets/pantry-cabinets/450mm-pantry-cabinet-au|1600x1600/f82c771a48/kb-au_pantries_450mm-pantry.png|Our 450mm pantry cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store
tall|600mm Pantry Cabinet|W-51633|Pantry cabinets – 2055mm|600|580|2055|145|1|0|$355|cabinets/pantry-cabinets/pantry-cabinets/600mm-pantry-cabinet-au|1600x1600/733a07f3f3/kb-au_pantries_600mm-pantry.png|Our 600mm pantry cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store .
tall|900mm Pantry Cabinet|W-51634|Pantry cabinets – 2055mm|900|580|2055|145|2|0|$522|cabinets/pantry-cabinets/pantry-cabinets/900mm-pantry-cabinet-au|1600x1600/c8a2fb34db/kb-au_pantries_900mm-pantry.png|Our 900mm pantry cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
tall|Corner Pantry Cabinet|W-51635|Pantry cabinets – 2200mm (tall)|1000|1000|2200|145|1|0|$1374|cabinets/pantry-cabinets/pantry-cabinets/corner-pantry-cabinet-au|1600x1600/0f48e6d4da/kb-au_pantries_corner-pantry.png|L-shaped corner pantry (980 x 980mm carcass, 566mm deep) that needs a 1000 x 1000mm space.
tall|1000mm Blind Corner Pantry Cabinet|W-70116|Pantry cabinets – 2055mm|1000|580|2055|145|1|0|$637|cabinets/pantry-cabinets/pantry-cabinets/1000mm-blind-corner-pantry-cabinet-au|1600x1600/94ba329ed7/kb-au_pantries_1000mm-blind-corner-pantry.png|Blind corner pantry, 1000mm wide; allow 1200mm for the blind corner pantry panel.
tall|1000mm Tall Blind Corner Pantry Cabinet|W-51896|Pantry cabinets – 2200mm (tall)|1000|580|2200|145|1|0|$681|cabinets/pantry-cabinets/pantry-cabinets/1000mm-tall-blind-corner-pantry-cabinet-au|1600x1600/7a3e67edf8/kb-anz-versatility-1000mm-blind-corner-pantry-ld-1600x1600.png|Tall blind corner pantry, 1000mm wide; allow 1250mm for the blind corner panel.
tall|450mm Tall Pantry Cabinet|W-51866|Pantry cabinets – 2200mm (tall)|450|580|2200|145|1|0|$386|cabinets/pantry-cabinets/tall-pantry-cabinets/450mm-tall-pantry-cabinet-au|1600x1600/97f8f40bb8/kb-anz-versatility-450mm-tall-pantry-ld-1600x1600.png|Our 450mm tall pantry cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
tall|600mm Tall Pantry Cabinet|W-51890|Pantry cabinets – 2200mm (tall)|600|580|2200|145|1|0|$407|cabinets/pantry-cabinets/tall-pantry-cabinets/600mm-tall-pantry-cabinet-au|1600x1600/bd180b5458/kb-anz-versatility-600mm-tall-pantry-ld-1600x1600.png|Our 600mm tall pantry cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
tall|900mm Tall Pantry Cabinet|W-51893|Pantry cabinets – 2200mm (tall)|900|580|2200|145|2|0|$590|cabinets/pantry-cabinets/tall-pantry-cabinets/900mm-tall-pantry-cabinet-au|1600x1600/e2a756763b/kb-anz-versatility-900mm-tall-pantry-ld-1600x1600.png|Our 900mm tall pantry cabinet is part of our modular cabinet range, available off the shelf from Bunnings or for quick delivery to store.
oven_tower|600mm High Oven Tower||Oven towers (combination)|600|580|2055|145|1|2||cabinets/appliance-cabinets/oven-cabinets/600mm-high-oven-tower-au|1600x1600/8fc90e0625/kb-au_appliance_cabinets_600mm-wall-oven-tower-1600x1600.png|Combination for a 600mm-high wall oven: 2 x 600mm 1-drawer cabinets, oven, microwave box and 600mm slimline cabinet between pantry end panels.
oven_tower|890mm High Oven Tower||Oven towers (combination)|600|580|2055|145|1|1||cabinets/appliance-cabinets/oven-cabinets/890mm-high-oven-tower-au|1600x1600/55902b50bb/kb-au_appliance_cabinets_890mm-high-oven-tower-1600x1600.png|Combination for an 890mm-high (double) wall oven: 1 x 600mm 1-drawer cabinet, oven, microwave box and 600mm slimline cabinet between pantry end panels.
oven_tower|600mm Microwave Box|W-57218|Oven towers (components)|600|520|430|1325|0|0|$154 (Sea Salt)|cabinets/appliance-cabinets/microwave-cabinets/microwave-cabinet-au|1600x1600/0af5085a79/kb-au_appliance_cabinets_600mm-microwave-box-1600x1600.png|Open 600mm microwave box, sold finished in each door colour; sits above the oven in an oven tower.
fridge|1000mm Fridge Cabinet|W-51985|Fridge cabinets|1000|420|500|1700|2|0|$194|cabinets/appliance-cabinets/fridge-cabinets/1000mm-fridge-cabinet-au|1600x1600/1c2ec01dc3/1000-fridge-cab-line-drawing-w-dimensions.jpg|1000mm over-fridge wall cabinet (400mm deep carcass); finish the cavity with two pantry end panels.
panel|Base end panel – Sea Salt|W-57208|Panels (Sea Salt)|18|580|864|0|0|0|$68.92|bn:kaboodle-sea-salt-base-cabinet-end-panel_p0193407|bn:9692db0c3404428fb719b2330f9df95d?v=97afd484|Covers the exposed end of a base run, floor to benchtop (incl. legs).
panel|Wall end panel – Sea Salt|W-57207|Panels (Sea Salt)|18|320|720|1480|0|0|$34.47|bn:kaboodle-sea-salt-wall-cabinet-end-panel_p0193406|bn:6427984b57ce4c04843adb6249f04336?v=b45cd5bd|Covers the exposed end of a 720mm wall cabinet.
panel|Deep wall end panel – Sea Salt|W-57278|Panels (Sea Salt)|18|420|720|1480|0|0|$45.69|bn:kaboodle-sea-salt-deep-wall-end-panel_p0463367|bn:8cf15b2ec758441f919a61d07aaf6834?v=86adf51e|End panel for 400mm-deep wall cabinets.
panel|Slimline end panel – Sea Salt|W-57206|Panels (Sea Salt)|18|320|360|1840|0|0|$23.85|bn:kaboodle-sea-salt-slimline-end-panel_p0193405|bn:4ca1af668952444f94bf658fdabf958e?v=218617b8|End panel for 360mm slimline wall cabinets.
panel|Pantry end panel – Sea Salt|W-57209|Panels (Sea Salt)|18|600|2200|0|0|0|$165|bn:kaboodle-sea-salt-pantry-end-panel_p0193408|bn:da46545fcf894beabf455d63e6ba9d82?v=d5716ff1|Floor-to-top end panel for a 2055mm pantry; also used either side of fridge and oven towers.
panel|Tall pantry end panel – Sea Salt|W-75213|Panels (Sea Salt)|18|600|2345|0|0|0|$178|bn:kaboodle-sea-salt-tall-pantry-end-panel_p0464038|bn:4951e232401c4bd29b40ecf7438599df?v=582842b0|Floor-to-top end panel for a 2200mm tall pantry.
panel|Base filler panel – Sea Salt|W-57212|Panels (Sea Salt)|100|18|720|145|0|0|$14.25|bn:kaboodle-sea-salt-base-filler-panel_p0193411|bn:b3e8f4d6a8ec4eb88cbc74cc57a8f71d?v=775bf0d3|100mm-wide filler to close gaps in a base run (trim to suit).
panel|Pantry filler panel – Sea Salt|W-57211|Panels (Sea Salt)|100|18|2055|145|0|0|$42.78|bn:kaboodle-sea-salt-pantry-filler-panel_p0193410|bn:a3507f6372f14382a2a6d1af305ac199?v=5d006cb4|100mm-wide filler for 2055mm pantries (trim to suit).
panel|Tall pantry filler panel – Sea Salt|W-75182|Panels (Sea Salt)|100|18|2200|145|0|0|$46.28|bn:kaboodle-sea-salt-tall-pantry-filler-panel_p0463981|bn:5f77a9f34d2840f9acc090fd65911a68?v=b85444de|100mm-wide filler for 2200mm tall pantries (trim to suit).
panel|Blind corner base panel – Sea Salt|W-57213|Panels (Sea Salt)|600|18|720|145|0|0|$49.92|bn:kaboodle-sea-salt-blind-corner-base-panel_p0193412|bn:a399671ab5e9414da011d170539a056d?v=a89e209c|Front panel that covers the blind side of a blind corner base cabinet.
panel|Blind corner pantry panel – Sea Salt|W-57210|Panels (Sea Salt)|600|18|2055|145|0|0|$159|bn:kaboodle-sea-salt-blind-corner-pantry-panel_p0193409|bn:ed87d4ba8e614677ba3e0dfc9da77470?v=0c06c95b|Front panel for the blind side of a 1000mm blind corner pantry.
panel|Tall blind corner pantry panel – Sea Salt|W-75220|Panels (Sea Salt)|650|18|2345|0|0|0|$171|bn:kaboodle-sea-salt-tall-blind-corner-pantry-panel_p0464022|bn:fa997ed0f2cf4459a1fcfb889de32543?v=51caa686|Front panel for the blind side of a tall blind corner pantry.
panel|Blind corner medium wall panel – Sea Salt|W-98758|Panels (Sea Salt)|449|18|549|1650|0|0|$44.14|bn:kaboodle-sea-salt-blind-corner-med-wall-panel_p0996431|bn:eb6231046ecb417394e1d60e60943144?v=1bd00597|Front panel for the blind side of a medium wall cabinet corner.
panel|1200mm Island Back Panel – Gloss White|W-51013|Panels (island)|1200|18|864|0|0|0|$243|bn:kaboodle-1200mm-gloss-white-island-back-panel_p2660482|bn:63c74ff6f53841128bb97ee422e043aa?v=ae69c7bd|Back panel for a run of base cabinets used as an island, floor to benchtop.
kickboard|2400mm Kickboard – Sea Salt|W-57221|Kickboards|2400|18|145|0|0|0|$60.61|bn:kaboodle-2400mm-sea-salt-kickboard_p0193421|bn:d0f9325698ab40c8a77f320cbc1d13c4?v=87d6f2f7|145mm-high kickboard that clips to the cabinet legs; cut to length.
kickboard|2400mm Kickboard – White Gloss|W-00421|Kickboards|2400|18|145|0|0|0|$75.05|bn:kaboodle-2400mm-white-gloss-kickboard_p2665387|bn:6fccae1b4fe346faabf5ab7917403c65?v=8662e38d|145mm-high kickboard that clips to the cabinet legs; cut to length.
kickboard|2400mm Kickboard – Aluminium Laminate|W-60025|Kickboards|2400|18|145|0|0|0|$93.89|bn:kaboodle-2400mm-aluminium-laminate_p0244164|bn:a9a582796def4515814a434f14800c1d?v=62a535f0|145mm-high kickboard that clips to the cabinet legs; cut to length.
benchtop|2400 x 600mm Laminate Benchtop||Benchtops|2400|600|38|865|0|0|$365|benchtops||Modular 38mm square-edge laminate benchtop for a standard 580mm-deep run (from $365 at Bunnings).
benchtop|2400 x 900mm Laminate Island Benchtop||Benchtops|2400|900|38|865|0|0|$516|benchtops||900mm-deep 38mm laminate benchtop for islands and breakfast bars (from $516).
benchtop|1200 x 600mm Laminate Benchtop||Benchtops|1200|600|38|865|0|0|$198|benchtops||Short 38mm modular benchtop (Black Granite, Pepper Leaf, Vanilla Cream).
benchtop|3600 x 600mm Cut-to-measure Benchtop||Benchtops|3600|600|38|865|0|0||benchtops||Customisable laminate benchtop cut to any length up to 3600mm (priced per metre).
benchtop|3600 x 600 x 33mm American Oak Benchtop||Benchtops|3600|600|33|865|0|0|$1049|benchtops||Solid American oak benchtop, 3600mm long.
`;

export const KABOODLE_PRODUCTS: KaboodleProduct[] = ROWS.trim()
  .split('\n')
  .map((row) => {
    const [cls, name, code, group, w, dp, h, el, doors, drawers, price, page, image, description] = row.split('|');
    return {
      cls: cls as KaboodleClass,
      name,
      code,
      group,
      width: Number(w),
      depth: Number(dp),
      height: Number(h),
      elevation: Number(el),
      doors: Number(doors),
      drawers: Number(drawers),
      price,
      url: page === 'benchtops' ? KB + 'benchtops' : pageUrl(page),
      image: imageUrl(image),
      description: description ?? '',
    };
  });

// One row per colour + profile: name | range · profile | style | hex | page | image | finish.
const DOOR_ROWS = `
Almond Oak|Designer · Modern|timber|eddbbe|doors-and-panels/colour/timber-and-woodgrain/almond-oak-au|1600x1600/70c7fe425f/kb_almond-oak_swatch_a5_rgb.png|Textured Woodgrain
Antique White|Everyday · Modern|flat|fcf8ec|doors-and-panels/colour/white-and-neutral/antique-white-au|1600x1600/d00e670c69/kb_antiquewhite_dp_1600x1600.png|Matt
Berry Blue|Premium · Modern|flat|383e4e|doors-and-panels/colour/blue-and-earthy/berry-blue-au|1600x1600/d17bc23bb4/kb_berryblue_dp_1600x1600.png|Textured Matt
Black Olive|Premium · Modern|flat|090c0b|doors-and-panels/colour/dark-and-moody/black-olive-au|1600x1600/0c047cfc55/kb_blackolive_dp_1600x1600.png|Silk
Blackberry|Designer · Modern|flat|151515|doors-and-panels/colour/dark-and-moody/blackberry-au|1600x1600/359881298b/kb_blackberry_1600x1600.jpg|Matt
Buttermilk|Everyday · Modern|gloss|f7f3e8|doors-and-panels/colour/white-and-neutral/buttermilk-au|1600x1600/c92fbc3eda/kb_buttermilk_dp_1600x1600.png|Gloss
Cajun Oak|Designer · Modern|timber|ba9976|doors-and-panels/colour/timber-and-woodgrain/cajun-oak-au|1600x1600/fbaf4d40fa/kb_cajun-oak_swatch_a5_rgb.png|Textured Woodgrain
Cannellini|Trends · Modern|flat|e4d9c7|doors-and-panels/colour/trends-range/cannellini-au|1600x1600/ed44f254ee/kb_cannellini_swatch_lr.png|Matt
Cardamom|Premium · Modern|flat|ada89c|doors-and-panels/colour/white-and-neutral/cardamom-au|1600x1600/5ef57ad2c2/kb_cardamom_dp_1600x1600.png|Matt
Cremasala|Premium · Modern|flat|d2cbc3|doors-and-panels/colour/white-and-neutral/cremasala-au|1600x1600/530820a38f/kb_cremasala_dp_1600x1600.png|Matt
Danish Blue|Premium · Modern|flat|889fa8|doors-and-panels/colour/blue-and-earthy/danish-blue-au|1600x1600/1a265fa1fc/kb_danishblue_dp_1600x1600.png|Matt
Egg White|Premium · Modern|gloss|f6f5f1|doors-and-panels/colour/white-and-neutral/egg-white-au|1600x1600/1bee862aa0/kb_eggwhite_dp_1600x1600.png|Gloss
Feta Whip V|Designer · Modern|flat|f8f8f5|doors-and-panels/colour/white-and-neutral/feta-whip-v-au|1600x1600/8d28d7e91a/kb_fetawhip_dp_1600x1600.png|Soft Touch Matt
Five Spice|Classic · Modern|flat|b5b1ab|doors-and-panels/colour/white-and-neutral/five-spice-au|1600x1600/b1bb516c0b/kb_fivespice_dp_1600x1600.png|Matt
Gloss White|Everyday · Modern|gloss|f8f8f6|doors-and-panels/colour/white-and-neutral/gloss-white-au|1600x1600/1147da487d/kb_glosswhite_dp_1600x1600.png|Gloss
Grey Fig|Premium · Modern|flat|565856|doors-and-panels/colour/dark-and-moody/grey-fig-au|1600x1600/d35878ee11/kb_greyfig_dp_1600x1600.png|Matt
Hazelnut V|Designer · Modern|timber|ab8d6c|doors-and-panels/colour/timber-and-woodgrain/hazelnut-v-au|1600x1600/5b16127ece/kb_hazelnutv_dp_1600x1600.png|Textured Woodgrain
Honey Oak|Designer · Modern|timber|e7d2a9|doors-and-panels/colour/timber-and-woodgrain/honey-oak-au|1600x1600/28324107ec/kb_honey-oak_swatch_a5_rgb.png|Textured Woodgrain
Juniper|Trends · Modern|flat|506576|doors-and-panels/colour/trends-range/juniper-au|1600x1600/ba97028816/kb_juniper_swatch_lr.png|Matt
Kaleo|Premium · Modern|flat|8d9a9a|doors-and-panels/colour/blue-and-earthy/kaleo-au|1600x1600/80694ebf7a/kb_kaleo_dp_1600x1600.png|Matt
Licorice Twist|Designer · Modern|timber|15181a|doors-and-panels/colour/timber-and-woodgrain/licorice-twist-au|1600x1600/8d786e726c/kb_licoricetwist_dp_1600x1600.png|Textured Woodgrain
Luminess Metallic|Everyday · Modern|gloss|3b3d40|doors-and-panels/colour/dark-and-moody/luminess-metallic-au|1600x1600/b0a6ac79c5/kb_luminessmetallic_dp_1600x1600.png|Metallic Gloss
Macaroon|Premium · Modern|flat|f1ece4|doors-and-panels/colour/white-and-neutral/macaroon-au|1600x1600/cede3ffa61/kb_macaroon_dp_1600x1600.png|Silk
Maplenut|Designer · Modern|timber|a89781|doors-and-panels/colour/timber-and-woodgrain/maplenut-au|1600x1600/ac454ee94e/kb_maplenut_1600x1600.jpg|Matt
Matchamisu|Premium · Modern|flat|57625e|doors-and-panels/colour/blue-and-earthy/matchamisu-au|1600x1600/494cd0561e/kb_matchamisu_dp_1600x1600.png|Matt
Midnight Plum|Designer · Modern|flat|151e25|doors-and-panels/colour/blue-and-earthy/midnight-plum-au|1600x1600/258f9a9468/kb_midnight-plum_swatch_a5_rgb.png|Matt
Molasses V|Designer · Modern|flat|101013|doors-and-panels/colour/dark-and-moody/molasses-v-au|1600x1600/1bdeb29c92/kb_molassesv_dp_1600x1600.png|Soft Touch Matt
Nougat Truffle|Premium · Modern|flat|efe9e0|doors-and-panels/colour/white-and-neutral/nougat-truffle-au|1600x1600/4276e7ed85/kb_noughattruffle_dp_1600x1600.png|Matt
Oak Latte|Classic · Modern|timber|be9d6a|doors-and-panels/colour/timber-and-woodgrain/oak-latte-au|1600x1600/5efa7c5d0f/kb_oaklatte_dp_1600x1600.png|Textured Woodgrain
Olive Grove|Premium · Modern|flat|8a8170|doors-and-panels/colour/blue-and-earthy/olive-grove-au|1600x1600/f996a9e14c/kb_olivegrove_dp_1600x1600.png|Matt
Oyster|Trends · Modern|flat|a6a8a7|doors-and-panels/colour/trends-range/oyster-au|1600x1600/c546e20bff/kb_oyster_swatch_lr.png|Matt
Pistachio|Trends · Modern|flat|c5c7ba|doors-and-panels/colour/trends-range/pistachio-au|1600x1600/d413cb9497/kb_pistachio_swatch_lr.png|Matt
Poppy Seed|Premium · Modern|flat|2c3339|doors-and-panels/colour/blue-and-earthy/poppy-seed-au|1600x1600/41f23817ab/kb_poppyseed_dp_1600x1600.png|Textured Matt
Portacini|Premium · Modern|flat|a59a92|doors-and-panels/colour/white-and-neutral/portacini-au|1600x1600/df36f02eac/kb_portacini_dp_1600x1600.png|Matt
Provincial White|Everyday · Modern|flat|f6f5f1|doors-and-panels/colour/white-and-neutral/provincial-white-au|1600x1600/da40810f2f/kb_provincialwhite_dp_1600x1600.png|Matt
Raw Board|Paint Your Own · Modern|flat|9e8c7a|doors-and-panels/colour/blue-and-earthy/raw-board-au|1600x1600/8fb8a8a822/kb_rawboard_dp_1600x1600.png|Raw Board
Saltbush|Trends · Modern|flat|6e7261|doors-and-panels/colour/trends-range/saltbush-au|1600x1600/61abc07d5b/kb_saltbush_swatch_lr.png|Matt
Sea Salt|Classic · Modern|flat|f4f4f1|doors-and-panels/colour/white-and-neutral/sea-salt-au|1600x1600/861d308c43/kb_seasalt_dp_1600x1600.png|Matt
Sesame Salt|Premium · Modern|flat|e1e1df|doors-and-panels/colour/white-and-neutral/sesame-salt-au|1600x1600/a9d1bd6a04/kb_sesame-salt_swatch_a5_rgb.png|Matt
Silver Ash|Designer · Modern|timber|c4b2a4|doors-and-panels/colour/timber-and-woodgrain/silver-ash-au|1600x1600/eedc04fe78/kb_silver-ash_swatch_a5_rgb.png|Textured Woodgrain
Smoked Grey|Premium · Modern|flat|807d7d|doors-and-panels/colour/dark-and-moody/smoked-grey-au|1600x1600/9dd916d63b/kb_smokedgrey_dp_1600x1600.png|Matt
Toasted Clove|Designer · Modern|flat|4f4f4d|doors-and-panels/colour/dark-and-moody/toasted-clove-au|1600x1600/9da81915f7/kb_toasted-clove_swatch_a5_rgb.png|Matt
Truffle Oak|Trends · Modern|timber|312c28|doors-and-panels/colour/trends-range/truffle-oak-au|1600x1600/e7a2d11258/kb_truffleoak_swatch-2_hr.png|Textured Woodgrain
Vanilla Essence|Premium · Modern|flat|faf8f3|doors-and-panels/colour/white-and-neutral/vanilla-essence-au|1600x1600/1886ae68cc/kb_vanillaessence_dp_1600x1600.png|Matt
Walnut|Designer · Modern|timber|685542|doors-and-panels/colour/timber-and-woodgrain/walnut|1600x1600/8bb41271f3/kb_walnut_dp_1600x1600.png|Textured Woodgrain
White Pepper|Designer · Modern|flat|cfcdc6|doors-and-panels/colour/white-and-neutral/white-pepper-au|1600x1600/c1e7624b3e/kb_whitepepper_dp_1600x1600.png|Matt
Wild Garlic|Designer · Modern|flat|e8e4db|doors-and-panels/colour/white-and-neutral/wild-garlic-au|1600x1600/545f7251ab/kb_wildgarlic_dp_1600x1600.png|Matt
Antique White Heritage|Everyday · Heritage|shaker|fcf8ec|doors-and-panels/colour/white-and-neutral/antique-white-au|1600x1600/d00e670c69/kb_antiquewhite_dp_1600x1600.png|Matt
Berry Blue Heritage|Premium · Heritage|shaker|383e4e|doors-and-panels/colour/blue-and-earthy/berry-blue-au|1600x1600/d17bc23bb4/kb_berryblue_dp_1600x1600.png|Textured Matt
Black Olive Heritage|Premium · Heritage|shaker|090c0b|doors-and-panels/colour/dark-and-moody/black-olive-au|1600x1600/0c047cfc55/kb_blackolive_dp_1600x1600.png|Silk
Cannellini Heritage|Trends · Heritage|shaker|e4d9c7|doors-and-panels/colour/trends-range/cannellini-au|1600x1600/ed44f254ee/kb_cannellini_swatch_lr.png|Matt
Cardamom Heritage|Premium · Heritage|shaker|ada89c|doors-and-panels/colour/white-and-neutral/cardamom-au|1600x1600/5ef57ad2c2/kb_cardamom_dp_1600x1600.png|Matt
Cremasala Heritage|Premium · Heritage|shaker|d2cbc3|doors-and-panels/colour/white-and-neutral/cremasala-au|1600x1600/530820a38f/kb_cremasala_dp_1600x1600.png|Matt
Danish Blue Heritage|Premium · Heritage|shaker|889fa8|doors-and-panels/colour/blue-and-earthy/danish-blue-au|1600x1600/1a265fa1fc/kb_danishblue_dp_1600x1600.png|Matt
Gloss White Heritage|Everyday · Heritage|shaker|f8f8f6|doors-and-panels/colour/white-and-neutral/gloss-white-au|1600x1600/1147da487d/kb_glosswhite_dp_1600x1600.png|Gloss
Grey Fig Heritage|Premium · Heritage|shaker|565856|doors-and-panels/colour/dark-and-moody/grey-fig-au|1600x1600/d35878ee11/kb_greyfig_dp_1600x1600.png|Matt
Kaleo Heritage|Premium · Heritage|shaker|8d9a9a|doors-and-panels/colour/blue-and-earthy/kaleo-au|1600x1600/80694ebf7a/kb_kaleo_dp_1600x1600.png|Matt
Macaroon Heritage|Premium · Heritage|shaker|f1ece4|doors-and-panels/colour/white-and-neutral/macaroon-au|1600x1600/cede3ffa61/kb_macaroon_dp_1600x1600.png|Silk
Matchamisu Heritage|Premium · Heritage|shaker|57625e|doors-and-panels/colour/blue-and-earthy/matchamisu-au|1600x1600/494cd0561e/kb_matchamisu_dp_1600x1600.png|Matt
Nougat Truffle Heritage|Premium · Heritage|shaker|efe9e0|doors-and-panels/colour/white-and-neutral/nougat-truffle-au|1600x1600/4276e7ed85/kb_noughattruffle_dp_1600x1600.png|Matt
Olive Grove Heritage|Premium · Heritage|shaker|8a8170|doors-and-panels/colour/blue-and-earthy/olive-grove-au|1600x1600/f996a9e14c/kb_olivegrove_dp_1600x1600.png|Matt
Pistachio Heritage|Trends · Heritage|shaker|c5c7ba|doors-and-panels/colour/trends-range/pistachio-au|1600x1600/d413cb9497/kb_pistachio_swatch_lr.png|Matt
Poppy Seed Heritage|Premium · Heritage|shaker|2c3339|doors-and-panels/colour/blue-and-earthy/poppy-seed-au|1600x1600/41f23817ab/kb_poppyseed_dp_1600x1600.png|Textured Matt
Portacini Heritage|Premium · Heritage|shaker|a59a92|doors-and-panels/colour/white-and-neutral/portacini-au|1600x1600/df36f02eac/kb_portacini_dp_1600x1600.png|Matt
Provincial White Heritage|Everyday · Heritage|shaker|f6f5f1|doors-and-panels/colour/white-and-neutral/provincial-white-au|1600x1600/da40810f2f/kb_provincialwhite_dp_1600x1600.png|Matt
Raw Board Heritage|Paint Your Own · Heritage|shaker|9e8c7a|doors-and-panels/colour/blue-and-earthy/raw-board-au|1600x1600/8fb8a8a822/kb_rawboard_dp_1600x1600.png|Raw Board
Saltbush Heritage|Trends · Heritage|shaker|6e7261|doors-and-panels/colour/trends-range/saltbush-au|1600x1600/61abc07d5b/kb_saltbush_swatch_lr.png|Matt
Sesame Salt Heritage|Premium · Heritage|shaker|e1e1df|doors-and-panels/colour/white-and-neutral/sesame-salt-au|1600x1600/a9d1bd6a04/kb_sesame-salt_swatch_a5_rgb.png|Matt
Smoked Grey Heritage|Premium · Heritage|shaker|807d7d|doors-and-panels/colour/dark-and-moody/smoked-grey-au|1600x1600/9dd916d63b/kb_smokedgrey_dp_1600x1600.png|Matt
Vanilla Essence Heritage|Premium · Heritage|shaker|faf8f3|doors-and-panels/colour/white-and-neutral/vanilla-essence-au|1600x1600/1886ae68cc/kb_vanillaessence_dp_1600x1600.png|Matt
Antique White Country|Everyday · Country|shaker|fcf8ec|doors-and-panels/colour/white-and-neutral/antique-white-au|1600x1600/d00e670c69/kb_antiquewhite_dp_1600x1600.png|Matt
Berry Blue Country|Premium · Country|shaker|383e4e|doors-and-panels/colour/blue-and-earthy/berry-blue-au|1600x1600/d17bc23bb4/kb_berryblue_dp_1600x1600.png|Textured Matt
Black Olive Country|Premium · Country|shaker|090c0b|doors-and-panels/colour/dark-and-moody/black-olive-au|1600x1600/0c047cfc55/kb_blackolive_dp_1600x1600.png|Silk
Cannellini Country|Trends · Country|shaker|e4d9c7|doors-and-panels/colour/trends-range/cannellini-au|1600x1600/ed44f254ee/kb_cannellini_swatch_lr.png|Matt
Cardamom Country|Premium · Country|shaker|ada89c|doors-and-panels/colour/white-and-neutral/cardamom-au|1600x1600/5ef57ad2c2/kb_cardamom_dp_1600x1600.png|Matt
Cremasala Country|Premium · Country|shaker|d2cbc3|doors-and-panels/colour/white-and-neutral/cremasala-au|1600x1600/530820a38f/kb_cremasala_dp_1600x1600.png|Matt
Danish Blue Country|Premium · Country|shaker|889fa8|doors-and-panels/colour/blue-and-earthy/danish-blue-au|1600x1600/1a265fa1fc/kb_danishblue_dp_1600x1600.png|Matt
Grey Fig Country|Premium · Country|shaker|565856|doors-and-panels/colour/dark-and-moody/grey-fig-au|1600x1600/d35878ee11/kb_greyfig_dp_1600x1600.png|Matt
Kaleo Country|Premium · Country|shaker|8d9a9a|doors-and-panels/colour/blue-and-earthy/kaleo-au|1600x1600/80694ebf7a/kb_kaleo_dp_1600x1600.png|Matt
Macaroon Country|Premium · Country|shaker|f1ece4|doors-and-panels/colour/white-and-neutral/macaroon-au|1600x1600/cede3ffa61/kb_macaroon_dp_1600x1600.png|Silk
Matchamisu Country|Premium · Country|shaker|57625e|doors-and-panels/colour/blue-and-earthy/matchamisu-au|1600x1600/494cd0561e/kb_matchamisu_dp_1600x1600.png|Matt
Nougat Truffle Country|Premium · Country|shaker|efe9e0|doors-and-panels/colour/white-and-neutral/nougat-truffle-au|1600x1600/4276e7ed85/kb_noughattruffle_dp_1600x1600.png|Matt
Olive Grove Country|Premium · Country|shaker|8a8170|doors-and-panels/colour/blue-and-earthy/olive-grove-au|1600x1600/f996a9e14c/kb_olivegrove_dp_1600x1600.png|Matt
Pistachio Country|Trends · Country|shaker|c5c7ba|doors-and-panels/colour/trends-range/pistachio-au|1600x1600/d413cb9497/kb_pistachio_swatch_lr.png|Matt
Poppy Seed Country|Premium · Country|shaker|2c3339|doors-and-panels/colour/blue-and-earthy/poppy-seed-au|1600x1600/41f23817ab/kb_poppyseed_dp_1600x1600.png|Textured Matt
Portacini Country|Premium · Country|shaker|a59a92|doors-and-panels/colour/white-and-neutral/portacini-au|1600x1600/df36f02eac/kb_portacini_dp_1600x1600.png|Matt
Provincial White Country|Everyday · Country|shaker|f6f5f1|doors-and-panels/colour/white-and-neutral/provincial-white-au|1600x1600/da40810f2f/kb_provincialwhite_dp_1600x1600.png|Matt
Raw Board Country|Paint Your Own · Country|shaker|9e8c7a|doors-and-panels/colour/blue-and-earthy/raw-board-au|1600x1600/8fb8a8a822/kb_rawboard_dp_1600x1600.png|Raw Board
Saltbush Country|Trends · Country|shaker|6e7261|doors-and-panels/colour/trends-range/saltbush-au|1600x1600/61abc07d5b/kb_saltbush_swatch_lr.png|Matt
Sesame Salt Country|Premium · Country|shaker|e1e1df|doors-and-panels/colour/white-and-neutral/sesame-salt-au|1600x1600/a9d1bd6a04/kb_sesame-salt_swatch_a5_rgb.png|Matt
Smoked Grey Country|Premium · Country|shaker|807d7d|doors-and-panels/colour/dark-and-moody/smoked-grey-au|1600x1600/9dd916d63b/kb_smokedgrey_dp_1600x1600.png|Matt
Vanilla Essence Country|Premium · Country|shaker|faf8f3|doors-and-panels/colour/white-and-neutral/vanilla-essence-au|1600x1600/1886ae68cc/kb_vanillaessence_dp_1600x1600.png|Matt
Antique White Alpine|Everyday · Alpine|shaker|fcf8ec|doors-and-panels/colour/white-and-neutral/antique-white-au|1600x1600/d00e670c69/kb_antiquewhite_dp_1600x1600.png|Matt
Berry Blue Alpine|Premium · Alpine|shaker|383e4e|doors-and-panels/colour/blue-and-earthy/berry-blue-au|1600x1600/d17bc23bb4/kb_berryblue_dp_1600x1600.png|Textured Matt
Black Olive Alpine|Premium · Alpine|shaker|090c0b|doors-and-panels/colour/dark-and-moody/black-olive-au|1600x1600/0c047cfc55/kb_blackolive_dp_1600x1600.png|Silk
Cannellini Alpine|Trends · Alpine|shaker|e4d9c7|doors-and-panels/colour/trends-range/cannellini-au|1600x1600/ed44f254ee/kb_cannellini_swatch_lr.png|Matt
Cardamom Alpine|Premium · Alpine|shaker|ada89c|doors-and-panels/colour/white-and-neutral/cardamom-au|1600x1600/5ef57ad2c2/kb_cardamom_dp_1600x1600.png|Matt
Cremasala Alpine|Premium · Alpine|shaker|d2cbc3|doors-and-panels/colour/white-and-neutral/cremasala-au|1600x1600/530820a38f/kb_cremasala_dp_1600x1600.png|Matt
Danish Blue Alpine|Premium · Alpine|shaker|889fa8|doors-and-panels/colour/blue-and-earthy/danish-blue-au|1600x1600/1a265fa1fc/kb_danishblue_dp_1600x1600.png|Matt
Grey Fig Alpine|Premium · Alpine|shaker|565856|doors-and-panels/colour/dark-and-moody/grey-fig-au|1600x1600/d35878ee11/kb_greyfig_dp_1600x1600.png|Matt
Kaleo Alpine|Premium · Alpine|shaker|8d9a9a|doors-and-panels/colour/blue-and-earthy/kaleo-au|1600x1600/80694ebf7a/kb_kaleo_dp_1600x1600.png|Matt
Macaroon Alpine|Premium · Alpine|shaker|f1ece4|doors-and-panels/colour/white-and-neutral/macaroon-au|1600x1600/cede3ffa61/kb_macaroon_dp_1600x1600.png|Silk
Matchamisu Alpine|Premium · Alpine|shaker|57625e|doors-and-panels/colour/blue-and-earthy/matchamisu-au|1600x1600/494cd0561e/kb_matchamisu_dp_1600x1600.png|Matt
Nougat Truffle Alpine|Premium · Alpine|shaker|efe9e0|doors-and-panels/colour/white-and-neutral/nougat-truffle-au|1600x1600/4276e7ed85/kb_noughattruffle_dp_1600x1600.png|Matt
Olive Grove Alpine|Premium · Alpine|shaker|8a8170|doors-and-panels/colour/blue-and-earthy/olive-grove-au|1600x1600/f996a9e14c/kb_olivegrove_dp_1600x1600.png|Matt
Pistachio Alpine|Trends · Alpine|shaker|c5c7ba|doors-and-panels/colour/trends-range/pistachio-au|1600x1600/d413cb9497/kb_pistachio_swatch_lr.png|Matt
Poppy Seed Alpine|Premium · Alpine|shaker|2c3339|doors-and-panels/colour/blue-and-earthy/poppy-seed-au|1600x1600/41f23817ab/kb_poppyseed_dp_1600x1600.png|Textured Matt
Portacini Alpine|Premium · Alpine|shaker|a59a92|doors-and-panels/colour/white-and-neutral/portacini-au|1600x1600/df36f02eac/kb_portacini_dp_1600x1600.png|Matt
Provincial White Alpine|Everyday · Alpine|shaker|f6f5f1|doors-and-panels/colour/white-and-neutral/provincial-white-au|1600x1600/da40810f2f/kb_provincialwhite_dp_1600x1600.png|Matt
Raw Board Alpine|Paint Your Own · Alpine|shaker|9e8c7a|doors-and-panels/colour/blue-and-earthy/raw-board-au|1600x1600/8fb8a8a822/kb_rawboard_dp_1600x1600.png|Raw Board
Saltbush Alpine|Trends · Alpine|shaker|6e7261|doors-and-panels/colour/trends-range/saltbush-au|1600x1600/61abc07d5b/kb_saltbush_swatch_lr.png|Matt
Sesame Salt Alpine|Premium · Alpine|shaker|e1e1df|doors-and-panels/colour/white-and-neutral/sesame-salt-au|1600x1600/a9d1bd6a04/kb_sesame-salt_swatch_a5_rgb.png|Matt
Smoked Grey Alpine|Premium · Alpine|shaker|807d7d|doors-and-panels/colour/dark-and-moody/smoked-grey-au|1600x1600/9dd916d63b/kb_smokedgrey_dp_1600x1600.png|Matt
Vanilla Essence Alpine|Premium · Alpine|shaker|faf8f3|doors-and-panels/colour/white-and-neutral/vanilla-essence-au|1600x1600/1886ae68cc/kb_vanillaessence_dp_1600x1600.png|Matt
Berry Blue V-groove|Premium · V-groove|vgroove|383e4e|doors-and-panels/colour/blue-and-earthy/berry-blue-au|1600x1600/d17bc23bb4/kb_berryblue_dp_1600x1600.png|Textured Matt
Black Olive V-groove|Premium · V-groove|vgroove|090c0b|doors-and-panels/colour/dark-and-moody/black-olive-au|1600x1600/0c047cfc55/kb_blackolive_dp_1600x1600.png|Silk
Cannellini V-groove|Trends · V-groove|vgroove|e4d9c7|doors-and-panels/colour/trends-range/cannellini-au|1600x1600/ed44f254ee/kb_cannellini_swatch_lr.png|Matt
Cardamom V-groove|Premium · V-groove|vgroove|ada89c|doors-and-panels/colour/white-and-neutral/cardamom-au|1600x1600/5ef57ad2c2/kb_cardamom_dp_1600x1600.png|Matt
Cremasala V-groove|Premium · V-groove|vgroove|d2cbc3|doors-and-panels/colour/white-and-neutral/cremasala-au|1600x1600/530820a38f/kb_cremasala_dp_1600x1600.png|Matt
Danish Blue V-groove|Premium · V-groove|vgroove|889fa8|doors-and-panels/colour/blue-and-earthy/danish-blue-au|1600x1600/1a265fa1fc/kb_danishblue_dp_1600x1600.png|Matt
Grey Fig V-groove|Premium · V-groove|vgroove|565856|doors-and-panels/colour/dark-and-moody/grey-fig-au|1600x1600/d35878ee11/kb_greyfig_dp_1600x1600.png|Matt
Kaleo V-groove|Premium · V-groove|vgroove|8d9a9a|doors-and-panels/colour/blue-and-earthy/kaleo-au|1600x1600/80694ebf7a/kb_kaleo_dp_1600x1600.png|Matt
Macaroon V-groove|Premium · V-groove|vgroove|f1ece4|doors-and-panels/colour/white-and-neutral/macaroon-au|1600x1600/cede3ffa61/kb_macaroon_dp_1600x1600.png|Silk
Matchamisu V-groove|Premium · V-groove|vgroove|57625e|doors-and-panels/colour/blue-and-earthy/matchamisu-au|1600x1600/494cd0561e/kb_matchamisu_dp_1600x1600.png|Matt
Nougat Truffle V-groove|Premium · V-groove|vgroove|efe9e0|doors-and-panels/colour/white-and-neutral/nougat-truffle-au|1600x1600/4276e7ed85/kb_noughattruffle_dp_1600x1600.png|Matt
Olive Grove V-groove|Premium · V-groove|vgroove|8a8170|doors-and-panels/colour/blue-and-earthy/olive-grove-au|1600x1600/f996a9e14c/kb_olivegrove_dp_1600x1600.png|Matt
Pistachio V-groove|Trends · V-groove|vgroove|c5c7ba|doors-and-panels/colour/trends-range/pistachio-au|1600x1600/d413cb9497/kb_pistachio_swatch_lr.png|Matt
Poppy Seed V-groove|Premium · V-groove|vgroove|2c3339|doors-and-panels/colour/blue-and-earthy/poppy-seed-au|1600x1600/41f23817ab/kb_poppyseed_dp_1600x1600.png|Textured Matt
Portacini V-groove|Premium · V-groove|vgroove|a59a92|doors-and-panels/colour/white-and-neutral/portacini-au|1600x1600/df36f02eac/kb_portacini_dp_1600x1600.png|Matt
Provincial White V-groove|Everyday · V-groove|vgroove|f6f5f1|doors-and-panels/colour/white-and-neutral/provincial-white-au|1600x1600/da40810f2f/kb_provincialwhite_dp_1600x1600.png|Matt
Raw Board V-groove|Paint Your Own · V-groove|vgroove|9e8c7a|doors-and-panels/colour/blue-and-earthy/raw-board-au|1600x1600/8fb8a8a822/kb_rawboard_dp_1600x1600.png|Raw Board
Saltbush V-groove|Trends · V-groove|vgroove|6e7261|doors-and-panels/colour/trends-range/saltbush-au|1600x1600/61abc07d5b/kb_saltbush_swatch_lr.png|Matt
Sesame Salt V-groove|Premium · V-groove|vgroove|e1e1df|doors-and-panels/colour/white-and-neutral/sesame-salt-au|1600x1600/a9d1bd6a04/kb_sesame-salt_swatch_a5_rgb.png|Matt
Smoked Grey V-groove|Premium · V-groove|vgroove|807d7d|doors-and-panels/colour/dark-and-moody/smoked-grey-au|1600x1600/9dd916d63b/kb_smokedgrey_dp_1600x1600.png|Matt
Vanilla Essence V-groove|Premium · V-groove|vgroove|faf8f3|doors-and-panels/colour/white-and-neutral/vanilla-essence-au|1600x1600/1886ae68cc/kb_vanillaessence_dp_1600x1600.png|Matt
Antique White 6 Panel Glass|Everyday · 6 Panel Glass|shaker|fcf8ec|doors-and-panels/colour/white-and-neutral/antique-white-au|1600x1600/d00e670c69/kb_antiquewhite_dp_1600x1600.png|Matt
`;

export const KABOODLE_DOORS: KaboodleDoor[] = DOOR_ROWS.trim()
  .split('\n')
  .map((row) => {
    const [name, range, style, h, page, image] = row.split('|');
    return { name, range, style: style as KaboodleDoor['style'], hex: hex(h), url: pageUrl(page), image: imageUrl(image) };
  });

/** Door finish (matt, gloss, textured woodgrain …) by door name. */
export const KABOODLE_DOOR_FINISH: Record<string, string> = Object.fromEntries(
  DOOR_ROWS.trim().split('\n').map((row) => { const c = row.split('|'); return [c[0], c[6]]; }),
);

// name | material | hex | thickness | lengths | depth | price | page | image | widths available (600 standard, 900+ island).
const BENCHTOP_ROWS = `
Bamboo|Bamboo|ae8d68|35|2400|600|$620|benchtops/timber-bamboo/bamboo-au|1600x1600/96e54d70d3/kb_bamboo_bt_1600x1600.png|600,900
Basalt|Laminate – Concrete-look (cut to measure)|4c4b49|38|1200,1800,2400,3000,3600|600|$229/m|benchtops/concrete-look/basalt-au|1600x1600/451452abb2/kb_basalt_bt_1600x1600.png|600,900
Lady Grey|Laminate – Concrete-look (cut to measure)|c2c1bd|38|1200,1800,2400,3000,3600|600|$375/m|benchtops/concrete-look/lady-grey-au|1600x1600/c299db9362/kb-lady_grey-1600x1600.png|600,900
Molasses|Laminate – Solid colour (cut to measure)|0c0d12|28|1200,1800,2400,3000,3600|600||benchtops/solid-colour/molasses-au|1600x1600/e447fe8b7a/kb_molasses_bt_1600x1600.png|900
Alabaster|Laminate – Stone-look|e6e6e5|38|2400|600|$469|benchtops/stone-look/alabaster-au|1600x1600/312c3f69eb/kb-alabaster-1600x1600.png|600,900
Almond Brittle|Laminate – Stone-look|e2e1db|38|2400|600|$493|benchtops/stone-look/almond-brittle-au|1600x1600/21eec2b257/kb_almondbrittle_bt_1600x1600.png|600,900
Black Granite|Laminate – Stone-look|0f1010|38|1200,2400|600|$365|benchtops/stone-look/black-granite-au|1600x1600/1caff6d12e/kb_blackgranite_bt_1600x1600.png|600,900
Burnt Brittle|Laminate – Stone-look|616263|38|2400|600|$365|benchtops/stone-look/burnt-brittle-au|1600x1600/725cdbcc99/kb_burntbrittle_bt_1600x1600.png|600,900
Pepper Leaf|Laminate – Stone-look|b7b0a2|38|1200,2400|600|$365|benchtops/stone-look/pepper-leaf-au|1600x1600/33815143f8/kb_pepperleaf_bt_1600x1600.png|600,900
Torrone|Laminate – Stone-look|cbc7bd|38|2400|600|$365|benchtops/stone-look/torrone-au|1600x1600/7420920dbb/kb-anz-swatch-image-torrone-bt-hr.png|600,900
Vanilla Cream|Laminate – Stone-look|dddddc|38|1200,2400|600|$365|benchtops/stone-look/vanilla-cream-au|1600x1600/92f2d7110b/kb_vanillacream_bt_1600x1600.png|600,900
Biancoccino|Laminate – Stone-look (cut to measure)|f0f1ef|38|1200,1800,2400,3000,3600|600|$291/m|benchtops/stone-look/biancoccino-au|200x200/1c2b1bc40c/kb_biancoccino_bt_200_200.png|600,900,1200
Black Pudding|Laminate – Stone-look (cut to measure)|4c4b4b|38|1200,1800,2400,3000,3600|600|$375/m|benchtops/stone-look/black-pudding-au|1600x1600/7c8a405749/kb_blackpudding_bt_1600x1600.png|600,900
Blaklava|Laminate – Stone-look (cut to measure)|5c5c5b|38|1200,1800,2400,3000,3600|600|$229/m|benchtops/stone-look/blaklava-au|1600x1600/3a253c7d0e/kb_blaklava_bt_1600x1600.png|600,900
Calcutta Gloss|Laminate – Stone-look (cut to measure)|f7f7f6|38|1200,1800,2400,3000,3600|600||benchtops/stone-look/calcutta-gloss-au|1600x1600/cec37da1a3/kb_calcuttagloss_bt_1600x1600.png|600,900,1200
Coconutty|Laminate – Stone-look (cut to measure)|eeece3|38|1200,1800,2400,3000,3600|600|$229/m|benchtops/stone-look/coconutty-au|1600x1600/4250bb7099/kb_coconutty_bt_1600x1600.png|600,900
Crackle Crush|Laminate – Stone-look (cut to measure)|dbdad5|38|1200,1800,2400,3000,3600|600||benchtops/stone-look/crackle-crush-au|1600x1600/f4ea9b2ed2/kb_cracklecrush_bt_1600x1600.png|600,900
Crackle Crush Gloss|Laminate – Stone-look (cut to measure)|dbdad5|38|1200,1800,2400,3000,3600|600||benchtops/stone-look/crackle-crush-gloss-au|1600x1600/f4ea9b2ed2/kb_cracklecrush_bt_1600x1600.png|600,900,1200
Marbellino|Laminate – Stone-look (cut to measure)|aaa5a1|38|1200,1800,2400,3000,3600|600||benchtops/stone-look/marbellino-au|1600x1600/d0d688b97f/kb_marbellino_bt_1600x1600.png|600,900
Mayonella|Laminate – Stone-look (cut to measure)|f7f7f7|38|1200,1800,2400,3000,3600|600||benchtops/stone-look/mayonella-au|1600x1600/2ce9e0e86e/kb_mayonella_bt_1600x1600.png|600,900,1200
Oyster Swirl|Laminate – Stone-look (cut to measure)|b4b2aa|38|1200,1800,2400,3000,3600|600|$375/m|benchtops/stone-look/oyster-swirl-au|1600x1600/e0e0435e7b/kb_oysterswirl_bt_1600x1600.png|600,900,1200
Salt Pan|Laminate – Stone-look (cut to measure)|d1ccc7|38|1200,1800,2400,3000,3600|600|$318/m|benchtops/stone-look/salt-pan-au|1600x1600/ca72d39e1f/kb-anz-digital-saltpan-swatch-1600x1600-ret-v1.jpg|600,900
Soyanut|Laminate – Stone-look (cut to measure)|3d3c3c|38|1200,1800,2400,3000,3600|600|$247/m|benchtops/stone-look/soyanut-au|1600x1600/544bbdf9b0/kb_soyanut_bt_1600x1600.png|600,900,1200
Tapioca|Laminate – Stone-look (cut to measure)|e6e1db|38|1200,1800,2400,3000,3600|600|$247/m|benchtops/stone-look/tapioca-au|1600x1600/0927190c83/kb_tapioca_bt_1600x1600.png|600,900
Terrazzola|Laminate – Stone-look (cut to measure)|b6b2b3|38|1200,1800,2400,3000,3600|600|$291/m|benchtops/stone-look/terrazzola-au|1600x1600/7366029244/kb_terrazzola_bt_1600x1600.png|600,900,1200
Terrine|Laminate – Stone-look (cut to measure)|b5aea9|38|1200,1800,2400,3000,3600|600|$245/m|benchtops/stone-look/terrine-au|1600x1600/7bc9fcad91/kb_terrine_bt_1600x1600.png|600,900
Travertine|Laminate – Stone-look (cut to measure)|d7ccbf|38|1200,1800,2400,3000,3600|600|$291/m|benchtops/stone-look/travertine-au|1600x1600/6c09bb223e/kb-anz-swatch-image-travertine-bt-hr.png|600,900
Apricot Ash|Laminate – Timber-look|a28f7a|38|2400|600|$365|benchtops/timber-look/apricot-ash-au|1600x1600/b91ef66376/kb-anz-swatch-image-apricot-ash-bt-hr.jpg|600,900
Cinnamon Oak|Laminate – Timber-look|968167|38|2400|600|$365|benchtops/timber-look/cinnamon-oak-au|1600x1600/9b0706f257/kb-anz-swatch-image-cinnamon-oak-bt-hr.jpg|600,900
Hickory Maple|Laminate – Timber-look|c29572|38|2400|600|$469|benchtops/timber-look/hickory-maple-au|1600x1600/18d4726921/kb_hickorymaple_bt_1600x1600.png|600,900
Smoked Oak|Laminate – Timber-look|b19e88|38|2400|600|$365|benchtops/timber-look/smoked-oak-au|1600x1600/5bd8bccb63/kb_smokedoak_bt_1600x1600.png|600,900
Bambucha|Laminate – Timber-look (cut to measure)|d1ab83|38|1200,1800,2400,3000,3600|600|$375/m|benchtops/timber-look/bambucha-au|1600x1600/f8e869a613/kb_bambucha_bt_1600x1600.png|600,900
Cacao Oak|Laminate – Timber-look (cut to measure)|927247|38|1200,1800,2400,3000,3600|600|$450/m|benchtops/timber-look/cacao-oak-au|1600x1600/f8b9e6a8c0/kb-cacao_oak-1600x1600.png|600,900
Hazelnut|Laminate – Timber-look (cut to measure)|ac8e6d|38|1200,1800,2400,3000,3600|600|$458/m|benchtops/timber-look/hazelnut-au|1600x1600/bb9e807b69/kb_hazelnut_bt_1600x1600.png|600,900
Honeywood|Laminate – Timber-look (cut to measure)|c9a47e|38|1200,1800,2400,3000,3600|600|$229/m|benchtops/timber-look/honeywood-au|1600x1600/bc9309de93/kb_honeywood_bt_1600x1600.png|600,900
American Oak|Timber|d0b394|33|2400,3600|600|$723|benchtops/timber-bamboo/american-oak-au|1600x1600/98f3c2842b/kb_americanoak_bt_1600x1600.png|600,900
European Beech|Timber|d7b090|32|2400|600|$465|benchtops/timber-bamboo/european-beech-au|1600x1600/6a2304860b/european-beech-swatch-1600x1600.png|600,900
European Oak|Timber|cead8c|32|2400|600|$744|benchtops/timber-bamboo/european-oak-au|1600x1600/b71c48fe4e/european-oak-swatch-1600x1600.png|600,900
Hevea|Timber|bfa99b|36|2400|600|$407|benchtops/timber-bamboo/hevea-au|1600x1600/290af7ab09/kb_hevea_bt_1600x1600.png|600,900
`;

export const KABOODLE_BENCHTOPS: KaboodleBenchtop[] = BENCHTOP_ROWS.trim()
  .split('\n')
  .map((row) => {
    const [name, material, h, t, lengths, depth, price, page, image] = row.split('|');
    return {
      name,
      material,
      hex: hex(h),
      thickness: Number(t),
      lengths: lengths.split(',').map(Number),
      depth: Number(depth),
      price,
      url: pageUrl(page),
      image: imageUrl(image),
    };
  });

/** Benchtop widths (front-to-back depths) Kaboodle offers per finish, e.g. [600, 900] — 900/1200 suit islands. */
export const KABOODLE_BENCHTOP_WIDTHS: Record<string, number[]> = Object.fromEntries(
  BENCHTOP_ROWS.trim().split('\n').map((row) => { const c = row.split('|'); return [c[0], c[9].split(',').map(Number)]; }),
);

// name | finish | hex | style | overall length | price | Kaboodle model no. | page | image.
const HANDLE_ROWS = `
Bar Stainless Steel 128mm|Stainless Steel|c4c6c8|bar|204|$14.41|W-50403|accessories/kitchen-handles/d-shape-handles/bar-handle-stainless-steel-au|1500x1500/d60f07d854/kb-anz-content-migration-handles-1600x1600-bar-handle.png
Bar Stainless Steel 192mm|Stainless Steel|c4c6c8|bar|260|$15.85|W-50404|accessories/kitchen-handles/d-shape-handles/bar-handle-stainless-steel-au|1500x1500/d60f07d854/kb-anz-content-migration-handles-1600x1600-bar-handle.png
Cabo Amber Gold 128mm|Amber Gold|c8a063|d|142|$15.97|W-50473|accessories/kitchen-handles/d-shape-handles/cabo-handle-amber-gold-au|1500x1500/b370e7fa1a/kb-anz-cabo-brushedgold-handles-1500x1500.png
Cabo Amber Gold 96mm|Amber Gold|c8a063|d|110|$13.84|W-50471|accessories/kitchen-handles/d-shape-handles/cabo-handle-amber-gold-au|1500x1500/b370e7fa1a/kb-anz-cabo-brushedgold-handles-1500x1500.png
Cabo Brushed Nickel 128mm|Brushed Nickel|b6b4ae|d|142|$14.63|W-50472|accessories/kitchen-handles/d-shape-handles/cabo-handle-brushed-nickel-au|1500x1500/8386a683af/kb-anz-cabo-brushednickel-handles-family-1500x1500.png
Cabo Brushed Nickel 96mm|Brushed Nickel|b6b4ae|d|110|$12.50|W-50470|accessories/kitchen-handles/d-shape-handles/cabo-handle-brushed-nickel-au|1500x1500/8386a683af/kb-anz-cabo-brushednickel-handles-family-1500x1500.png
Cali Brushed Nickel 128mm|Brushed Nickel|b6b4ae|d|153|$8.26|W-50449|accessories/kitchen-handles/d-shape-handles/cali-brushed-nickel-au|1600x1600/bb3ee660a4/kb-anz-content-migration-handles-1600x1600.png
Cali Brushed Nickel 160mm|Brushed Nickel|b6b4ae|d|193|$9.60|W-50450|accessories/kitchen-handles/d-shape-handles/cali-brushed-nickel-au|1600x1600/bb3ee660a4/kb-anz-content-migration-handles-1600x1600.png
Cali Brushed Nickel 192mm|Brushed Nickel|b6b4ae|d|224|$11.17|W-50451|accessories/kitchen-handles/d-shape-handles/cali-brushed-nickel-au|1600x1600/bb3ee660a4/kb-anz-content-migration-handles-1600x1600.png
Cali Brushed Nickel 96mm|Brushed Nickel|b6b4ae|d|121|$7.26|W-50448|accessories/kitchen-handles/d-shape-handles/cali-brushed-nickel-au|1600x1600/bb3ee660a4/kb-anz-content-migration-handles-1600x1600.png
Cali Matt Black 128mm|Matt Black|1f1f1f|d|153|$7.04|W-50453|accessories/kitchen-handles/d-shape-handles/cali-matt-black-au|1500x1500/36edd8b807/kb-anz-cali-mattblack-handle-1500x1500.png
Cali Matt Black 160mm|Matt Black|1f1f1f|d|193|$8.03|W-50454|accessories/kitchen-handles/d-shape-handles/cali-matt-black-au|1500x1500/36edd8b807/kb-anz-cali-mattblack-handle-1500x1500.png
Cali Matt Black 192mm|Matt Black|1f1f1f|d|224|$10.84|W-50455|accessories/kitchen-handles/d-shape-handles/cali-matt-black-au|1500x1500/36edd8b807/kb-anz-cali-mattblack-handle-1500x1500.png
Cali Matt Black 96mm|Matt Black|1f1f1f|d|121|$6.25|W-50452|accessories/kitchen-handles/d-shape-handles/cali-matt-black-au|1500x1500/36edd8b807/kb-anz-cali-mattblack-handle-1500x1500.png
Cali White 128mm|White|f2f2f0|d|153|$7.36|W-50634|accessories/kitchen-handles/d-shape-handles/cali-white-au|1500x1500/4b5ed3582a/kb-anz-cali-white-handles-1500x1500.png
Cali White 160mm|White|f2f2f0|d|193|$8.43|W-50635|accessories/kitchen-handles/d-shape-handles/cali-white-au|1500x1500/4b5ed3582a/kb-anz-cali-white-handles-1500x1500.png
Cali White 192mm|White|f2f2f0|d|224|$11.10|W-50648|accessories/kitchen-handles/d-shape-handles/cali-white-au|1500x1500/4b5ed3582a/kb-anz-cali-white-handles-1500x1500.png
Cali White 96mm|White|f2f2f0|d|121|$6.53|W-50633|accessories/kitchen-handles/d-shape-handles/cali-white-au|1500x1500/4b5ed3582a/kb-anz-cali-white-handles-1500x1500.png
Jerico Brushed Gold 160mm|Brushed Gold|c9a865|d|220|$44.62|W-50626|accessories/kitchen-handles/d-shape-handles/jerico-brushed-gold-handle-au|1500x1500/a968fa8c24/kb-anz-jerico-brushedgold-handles-1500x1500.png
Jerico Matt Black 160mm|Matt Black|1f1f1f|d|220|$44.62|W-50627|accessories/kitchen-handles/d-shape-handles/jerico-matt-black-handle-au|1500x1500/8eec5adffe/kb-anz-jerico-mattblack-handles-1500x1500.png
Pasto Brushed Nickel 128mm|Brushed Nickel|b6b4ae|d|137|$10.27|W-50462|accessories/kitchen-handles/d-shape-handles/pasto-brushed-nickel-au|1500x1500/714ae01c7e/kb-anz-pasto-brishednickel-handles-family-1500x1500.png
Pasto Brushed Nickel 160mm|Brushed Nickel|b6b4ae|d|169|$11.84|W-50465|accessories/kitchen-handles/d-shape-handles/pasto-brushed-nickel-au|1500x1500/714ae01c7e/kb-anz-pasto-brishednickel-handles-family-1500x1500.png
Pasto Brushed Nickel 96mm|Brushed Nickel|b6b4ae|d|105|$8.93|W-50459|accessories/kitchen-handles/d-shape-handles/pasto-brushed-nickel-au|1500x1500/714ae01c7e/kb-anz-pasto-brishednickel-handles-family-1500x1500.png
Pasto Chrome 128mm|Chrome|d6d9dc|d|137|$12.72|W-50463|accessories/kitchen-handles/d-shape-handles/pasto-chrome-au|1500x1500/314af67412/kb-anz-pasto-chrome-handles-1500x1500.png
Pasto Chrome 160mm|Chrome|d6d9dc|d|169|$14.06|W-50466|accessories/kitchen-handles/d-shape-handles/pasto-chrome-au|1500x1500/314af67412/kb-anz-pasto-chrome-handles-1500x1500.png
Pasto Chrome 96mm|Chrome|d6d9dc|d|105|$10.94|W-50460|accessories/kitchen-handles/d-shape-handles/pasto-chrome-au|1500x1500/314af67412/kb-anz-pasto-chrome-handles-1500x1500.png
Pasto Matt Black 128mm|Matt Black|1f1f1f|d|137|$6.81|W-50464|accessories/kitchen-handles/d-shape-handles/pasto-matt-black-au|1500x1500/b6c41d5709/kb-anz-pasto-mattblack-handles-1500x1500.png
Pasto Matt Black 160mm|Matt Black|1f1f1f|d|169|$9.27|W-50467|accessories/kitchen-handles/d-shape-handles/pasto-matt-black-au|1500x1500/b6c41d5709/kb-anz-pasto-mattblack-handles-1500x1500.png
Pasto Matt Black 96mm|Matt Black|1f1f1f|d|105|$5.80|W-50461|accessories/kitchen-handles/d-shape-handles/pasto-matt-black-au|1500x1500/b6c41d5709/kb-anz-pasto-mattblack-handles-1500x1500.png
Pasto White 128mm|White|f2f2f0|d|137|$9.27|W-50631|accessories/kitchen-handles/d-shape-handles/pasto-white-au|1500x1500/3ff64f7ee5/kb-anz-pasto-white-handle-1500x1500.png
Pasto White 160mm|White|f2f2f0|d|169|$10.66|W-50632|accessories/kitchen-handles/d-shape-handles/pasto-white-au|1500x1500/3ff64f7ee5/kb-anz-pasto-white-handle-1500x1500.png
Pasto White 96mm|White|f2f2f0|d|105|$8.26|W-50630|accessories/kitchen-handles/d-shape-handles/pasto-white-au|1500x1500/3ff64f7ee5/kb-anz-pasto-white-handle-1500x1500.png
Round Bar Brushed Stainless Steel 128mm|Brushed Stainless Steel|bfc1c3|bar|140|$12.28|W-50421|accessories/kitchen-handles/d-shape-handles/round-bar-brushed-stainless-steel-au|1500x1500/0320f6be34/kb-anz-roundbar-handles-1500x1500.png
Round Bar Brushed Stainless Steel 192mm|Brushed Stainless Steel|bfc1c3|bar|204|$13.73|W-50422|accessories/kitchen-handles/d-shape-handles/round-bar-brushed-stainless-steel-au|1500x1500/0320f6be34/kb-anz-roundbar-handles-1500x1500.png
Round Bar Brushed Stainless Steel 96mm|Brushed Stainless Steel|bfc1c3|bar|108|$8.83|W-50420|accessories/kitchen-handles/d-shape-handles/round-bar-brushed-stainless-steel-au|1500x1500/0320f6be34/kb-anz-roundbar-handles-1500x1500.png
Salento Matt Black 160mm|Matt Black|1f1f1f|d|225|$12.28|W-50444|accessories/kitchen-handles/d-shape-handles/salento-matt-black-au|1500x1500/e756ffc068/kb-anz-solento-mattblack-handles-1500x1500.png
Salento Matt Black 192mm|Matt Black|1f1f1f|d|257|$14.06|W-50446|accessories/kitchen-handles/d-shape-handles/salento-matt-black-au|1500x1500/e756ffc068/kb-anz-solento-mattblack-handles-1500x1500.png
Salento Matt Black 96mm|Matt Black|1f1f1f|d|162|$9.71|W-50442|accessories/kitchen-handles/d-shape-handles/salento-matt-black-au|1500x1500/e756ffc068/kb-anz-solento-mattblack-handles-1500x1500.png
Salento Worn Gold 160mm|Worn Gold|a98a55|d|225|$12.28|W-50445|accessories/kitchen-handles/d-shape-handles/salento-worn-gold-au|1500x1500/8d2030d08b/kb-anz-solento-worngold-handles-1500x1500.png
Salento Worn Gold 192mm|Worn Gold|a98a55|d|257|$14.06|W-50447|accessories/kitchen-handles/d-shape-handles/salento-worn-gold-au|1500x1500/8d2030d08b/kb-anz-solento-worngold-handles-1500x1500.png
Salento Worn Gold 96mm|Worn Gold|a98a55|d|162|$9.71|W-50443|accessories/kitchen-handles/d-shape-handles/salento-worn-gold-au|1500x1500/8d2030d08b/kb-anz-solento-worngold-handles-1500x1500.png
T-pull Brushed Stainless Steel 128mm|Brushed Stainless Steel|bfc1c3|bar|260|$11.28|W-50401|accessories/kitchen-handles/d-shape-handles/t-pull-brushed-stainless-steel-au|1500x1500/8f08cc523a/kb-anz-t-pull-brushed-handles-1500x1500.png
T-pull Brushed Stainless Steel 96mm|Brushed Stainless Steel|bfc1c3|bar|220|$9.60|W-50400|accessories/kitchen-handles/d-shape-handles/t-pull-brushed-stainless-steel-au|1500x1500/8f08cc523a/kb-anz-t-pull-brushed-handles-1500x1500.png
Antique Bow Brushed Bronze 96mm|Brushed Bronze|7a634a|d|160|$8.03|W-50408|accessories/kitchen-handles/rounded-handles/antique-bow-brushed-bronze-au|1500x1500/927c27ae4c/kb-anz-antqiue-bow-brushedbroze-handles-1500x1500.png
Antique Bow Matt Black 96mm|Matt Black|1f1f1f|d|160||W-50435|accessories/kitchen-handles/rounded-handles/antique-bow-matt-black-au|1500x1500/15fddceefb/kb-anz-antqiue-bow-mattblack-handles-1500x1500.png
Bolivar Matt Black 128mm|Matt Black|1f1f1f|d|133|$5.70|W-50457|accessories/kitchen-handles/rounded-handles/bolivar-matt-black-au|1500x1500/479855eedf/kb-anz-bolivar-mattblack-handles-1500x1500.png
Bolivar Matt Black 160mm|Matt Black|1f1f1f|d|166|$6.70|W-50458|accessories/kitchen-handles/rounded-handles/bolivar-matt-black-au|1500x1500/479855eedf/kb-anz-bolivar-mattblack-handles-1500x1500.png
Bolivar Matt Black 96mm|Matt Black|1f1f1f|d|101|$4.91|W-50456|accessories/kitchen-handles/rounded-handles/bolivar-matt-black-au|1500x1500/479855eedf/kb-anz-bolivar-mattblack-handles-1500x1500.png
Casco Cup Brushed Nickel 64mm|Brushed Nickel|b6b4ae|cup|82|$7.14|W-50399|accessories/kitchen-handles/rounded-handles/casco-cup-brushed-nickel-au|1500x1500/359152bab0/kb-anz-cascocup-mbrushednickel-handles-1500x1500.png
Casco Cup Matt Black 64mm|Matt Black|1f1f1f|cup|82|$8.26|W-50398|accessories/kitchen-handles/rounded-handles/casco-cup-matt-black-au|1500x1500/fa5c8dc06a/kb-anz-cascocup-mattblack-handles-1500x1500.png
Classic Bow Nickel Plated 96mm|Nickel Plated|c9c8c3|d|175|$3.91|W-50409|accessories/kitchen-handles/rounded-handles/classic-bow-nickel-plated-au|1500x1500/01d537a095/kb-anz-classicbow-nickelplated-handle-1500x1500.png
Cup Brushed Nickel 64mm|Brushed Nickel|b6b4ae|cup|96|$7.93|W-50430|accessories/kitchen-handles/rounded-handles/cup-handle-brushed-nickel-au|1500x1500/15fa42b3af/kb-anz-cup-brushednickel-handles-1500x1500.png
Cup Matt Black 64mm|Matt Black|1f1f1f|cup|96|$8.16|W-50431|accessories/kitchen-handles/rounded-handles/cup-matt-black-au|1500x1500/38f97b6aff/kb-anz-cup-mattblack-handles-1500x15001.png
Jardin Brushed Gold 96mm|Brushed Gold|c9a865|d|150|$44.62|W-50623|accessories/kitchen-handles/rounded-handles/jardin-brushed-gold-handle-au|1500x1500/58818958dc/1-kb-anz-jardin-brushedgold-handles-1500x1500.png
Jardin Matt Black 96mm|Matt Black|1f1f1f|d|150|$44.62|W-50624|accessories/kitchen-handles/rounded-handles/jardin-matt-black-handle-au|1500x1500/3f65552fd1/1-kb-anz-jardin-mattblack-handles-1500x1500.png
Jardin Matt White 96mm|Matt White|f2f2f0|d|150|$44.62|W-50625|accessories/kitchen-handles/rounded-handles/jardin-matt-white-handle-au|1500x1500/2f7262f29c/1-kb-anz-jardin-mattwhite-handles-1500x1500.png
Turbo Brushed Nickel 128mm|Brushed Nickel|b6b4ae|d|145|$10.94|W-50469|accessories/kitchen-handles/rounded-handles/turbo-handle-brushed-nickel-au|1500x1500/4651bfc696/kb-anz-turbo-brushednickel-handles-1500x1500.png
Turbo Matt Black 128mm|Matt Black|1f1f1f|d|145|$12.50|W-50468|accessories/kitchen-handles/rounded-handles/turbo-handle-matt-black-au|1500x1500/d7d1dd233d/kb-anz-turbo-mattblack-handles-1500x1500.png
Vela Brushed Amber Gold 128mm|Brushed Amber Gold|c8a063|d|185|$14.63|W-50478|accessories/kitchen-handles/rounded-handles/vela-brushed-amber-gold-au|1500x1500/a6f1649ba7/kb-anz-vela-brushedgold-handles-1500x1500.png
Vela Brushed Amber Gold 96mm|Brushed Amber Gold|c8a063|d|138|$10.61|W-50477|accessories/kitchen-handles/rounded-handles/vela-brushed-amber-gold-au|1500x1500/a6f1649ba7/kb-anz-vela-brushedgold-handles-1500x1500.png
Vela Brushed Nickel 128mm|Brushed Nickel|b6b4ae|d|185|$12.72||accessories/kitchen-handles/rounded-handles/vela-brushed-nickel-au|1500x1500/7df3f17ae0/kb-anz-vela-brushednickel-handles-1500x1500.png
Vela Brushed Nickel 96mm|Brushed Nickel|b6b4ae|d|138|$9.04|W-50476|accessories/kitchen-handles/rounded-handles/vela-brushed-nickel-au|1500x1500/7df3f17ae0/kb-anz-vela-brushednickel-handles-1500x1500.png
Discreet Grip Polished Stainless Steel 160mm|Polished Stainless Steel|d8dadc|edge|260|$14.51|W-50407|accessories/kitchen-handles/discreet-handles/discreet-grip-polished-stainless-steel-au|1500x1500/9b0760cbb6/kb-anz-discreetgrip-sm-polished-handles-1500x1500.png
Discreet Grip Polished Stainless Steel 16mm|Polished Stainless Steel|d8dadc|edge|110|$6.70|W-50406|accessories/kitchen-handles/discreet-handles/discreet-grip-polished-stainless-steel-au|1500x1500/9b0760cbb6/kb-anz-discreetgrip-sm-polished-handles-1500x1500.png
Extrudo Aluminium 120mm|Aluminium|c9cbcd|edge|120|$6.81|W-50638|accessories/kitchen-handles/discreet-handles/extrudo-aluminium-au|1500x1500/7e923cc168/kb-anz-extrudo-aluminium-handles-1500x1500.png
Extrudo Aluminium 200mm|Aluminium|c9cbcd|edge|200|$9.04|W-50640|accessories/kitchen-handles/discreet-handles/extrudo-aluminium-au|1500x1500/7e923cc168/kb-anz-extrudo-aluminium-handles-1500x1500.png
Extrudo Aluminium 300mm|Aluminium|c9cbcd|edge|300|$11.05|W-50641|accessories/kitchen-handles/discreet-handles/extrudo-aluminium-au|1500x1500/7e923cc168/kb-anz-extrudo-aluminium-handles-1500x1500.png
Extrudo Aluminium 500mm|Aluminium|c9cbcd|edge|500|$14.45|W-50642|accessories/kitchen-handles/discreet-handles/extrudo-aluminium-au|1500x1500/7e923cc168/kb-anz-extrudo-aluminium-handles-1500x1500.png
Extrudo Matt Black 120mm|Matt Black|1f1f1f|edge|120|$6.64|W-50643|accessories/kitchen-handles/discreet-handles/extrudo-matt-black-au|1500x1500/958e41f9e1/kb-anz-extrudo-mattblack-handles-1500x1500.png
Extrudo Matt Black 200mm|Matt Black|1f1f1f|edge|200|$8.65|W-50645|accessories/kitchen-handles/discreet-handles/extrudo-matt-black-au|1500x1500/958e41f9e1/kb-anz-extrudo-mattblack-handles-1500x1500.png
Extrudo Matt Black 300mm|Matt Black|1f1f1f|edge|300|$10.94|W-50646|accessories/kitchen-handles/discreet-handles/extrudo-matt-black-au|1500x1500/958e41f9e1/kb-anz-extrudo-mattblack-handles-1500x1500.png
Extrudo Matt Black 500mm|Matt Black|1f1f1f|edge|500|$14.29|W-50647|accessories/kitchen-handles/discreet-handles/extrudo-matt-black-au|1500x1500/958e41f9e1/kb-anz-extrudo-mattblack-handles-1500x1500.png
Plaza Brass 128mm|Brass|c9a865|edge|150|$10.61|W-50397|accessories/kitchen-handles/discreet-handles/plaza-brass-au|1500x1500/34ae442118/kb-anz-plaza-brass-handle-1500x1500.png
Plaza Brass 64mm|Brass|c9a865|edge|80|$7.49|W-50393|accessories/kitchen-handles/discreet-handles/plaza-brass-au|1500x1500/34ae442118/kb-anz-plaza-brass-handle-1500x1500.png
Plaza Brass 96mm|Brass|c9a865|edge|120|$9.04|W-50395|accessories/kitchen-handles/discreet-handles/plaza-brass-au|1500x1500/34ae442118/kb-anz-plaza-brass-handle-1500x1500.png
Plaza Matt Black 128mm|Matt Black|1f1f1f|edge|150|$9.60|W-50396|accessories/kitchen-handles/discreet-handles/plaza-matt-black-au|1500x1500/24b1e6c449/kb-anz-plaza-mattblack-handle-1500x1500.png
Plaza Matt Black 350mm|Matt Black|1f1f1f|edge|350|$17.86|W-50636|accessories/kitchen-handles/discreet-handles/plaza-matt-black-au|1500x1500/24b1e6c449/kb-anz-plaza-mattblack-handle-1500x1500.png
Plaza Matt Black 64mm|Matt Black|1f1f1f|edge|80|$6.70|W-50392|accessories/kitchen-handles/discreet-handles/plaza-matt-black-au|1500x1500/24b1e6c449/kb-anz-plaza-mattblack-handle-1500x1500.png
Plaza Matt Black 96mm|Matt Black|1f1f1f|edge|120|$7.70|W-50394|accessories/kitchen-handles/discreet-handles/plaza-matt-black-au|1500x1500/24b1e6c449/kb-anz-plaza-mattblack-handle-1500x1500.png
Plaza White 128mm|White|f2f2f0|edge|150|$9.60|W-50591|accessories/kitchen-handles/discreet-handles/plaza-white-au|1500x1500/7761a14b97/kb-anz-plaza-white-handle-1500x1500.png
Plaza White 350mm|White|f2f2f0|edge|350|$17.86|W-50637|accessories/kitchen-handles/discreet-handles/plaza-white-au|1500x1500/7761a14b97/kb-anz-plaza-white-handle-1500x1500.png
Plaza White 64mm|White|f2f2f0|edge|80|$6.70|W-50589|accessories/kitchen-handles/discreet-handles/plaza-white-au|1500x1500/7761a14b97/kb-anz-plaza-white-handle-1500x1500.png
Plaza White 96mm|White|f2f2f0|edge|120|$7.70|W-50590|accessories/kitchen-handles/discreet-handles/plaza-white-au|1500x1500/7761a14b97/kb-anz-plaza-white-handle-1500x1500.png
Cabo Brushed Amber Gold|Brushed Amber Gold|c8a063|knob|31|$8.60|W-50475|accessories/kitchen-handles/doorknob-handles/cabo-brushed-amber-gold-au|1500x1500/f806b2be8f/kb-anz-caboknob-brushedgold-handles-1500x1500.pnG
Cabo Brushed Nickel|Brushed Nickel|b6b4ae|knob|31|$7.81|W-50474|accessories/kitchen-handles/doorknob-handles/cabo-brushed-nickel-au|1500x1500/c777691371/kb-anz-caboknob-brushednickel-handles-1500x1500.png
Grip Brushed Nickel|Brushed Nickel|b6b4ae|knob|16|$4.70|W-50411|accessories/kitchen-handles/doorknob-handles/grip-brushed-nickel-au|1500x1500/c53c44f35e/kb-anz-gripknob-brushednickel-handle-1500x1500.png
Iza Brushed Nickel|Brushed Nickel|b6b4ae|knob|30|$6.03|W-50483|accessories/kitchen-handles/doorknob-handles/iza-brushed-nickel-au|1500x1500/7212ff49ea/kb-anz-izaknob-brushednickel-handles-1500x1500.png
Iza Matt Black|Matt Black|1f1f1f|knob|30|$6.03|W-50482|accessories/kitchen-handles/doorknob-handles/iza-matt-black-au|1500x1500/0924950549/kb-anz-izaknob-mattblack-handles-1500x1500-png-png.png
Jerico Brushed Gold|Brushed Gold|c9a865|knob|18|$16.72|W-50628|accessories/kitchen-handles/doorknob-handles/jerico-brushed-gold-knob-au|1500x1500/f75eb769d9/kb-anz-jerico-knob-brushed-gold-handles-1500x1500.png
Jerico Matt Black|Matt Black|1f1f1f|knob|18|$16.72|W-50629|accessories/kitchen-handles/doorknob-handles/jerico-matt-black-knob-au|1500x1500/ed78ab46c5/kb-anz-jerico-knob-mattblack-handles-1500x1500.png
Mushroom Brushed Nickel|Brushed Nickel|b6b4ae|knob|28|$4.70|W-50410|accessories/kitchen-handles/doorknob-handles/mushroom-brushed-nickel-au|1500x1500/3eeb77f4fc/kb-anz-mushroomknob-brushednickel-handle-1500x1500.png
Mushroom Matt Black|Matt Black|1f1f1f|knob|28|$5.58|W-50434|accessories/kitchen-handles/doorknob-handles/mushroom-matt-black-au|1500x1500/f5829dce5b/kb-anz-mushroom-mattblack-1500x1500.png
Turbo Brushed Nickel|Brushed Nickel|b6b4ae|knob|31|$6.59|W-50481|accessories/kitchen-handles/doorknob-handles/turbo-brushed-nickel-au|1500x1500/ad8104e806/kb-anz-turboknob-brushednickel-handles-1500x1500.png
Turbo Matt Black|Matt Black|1f1f1f|knob|31|$6.59|W-50480|accessories/kitchen-handles/doorknob-handles/turbo-matt-black-au|1500x1500/6c045b26fb/kb-anz-turboknob-mattblack-handles-1500x1500.png
`;

export const KABOODLE_HANDLES: KaboodleHandle[] = HANDLE_ROWS.trim()
  .split('\n')
  .map((row) => {
    const [name, finish, h, style, length, price, , page, image] = row.split('|');
    return { name, finish, hex: hex(h), style: style as KaboodleHandle['style'], length: Number(length), price, url: pageUrl(page), image: imageUrl(image) };
  });

/** Kaboodle model number per handle name (e.g. "Pasto Chrome 128mm" → "W-50463"), '' if not published. */
export const KABOODLE_HANDLE_CODES: Record<string, string> = Object.fromEntries(
  HANDLE_ROWS.trim().split('\n').map((row) => { const c = row.split('|'); return [c[0], c[6]]; }),
);
