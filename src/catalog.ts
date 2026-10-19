import { HUME_MODELS, humeKey } from './humeDoors';
import type { DoorDesign, GarageStyle, OpeningKind } from './types';

export interface ItemDef {
  type: string;
  name: string;
  category: string;
  width: number;
  depth: number;
  height: number;
  elevation?: number;
  color: string;
  /** The real product this is modelled on. */
  link?: ProductLink;
}

/** Category of items only placed from the kitchen designer (not listed in the main catalogue). */
export const KITCHEN_DESIGNER = 'Kitchen designer';

export interface ProductLink {
  url: string;
  /** Who sells / makes it, shown with the link. */
  label: string;
}

export interface OpeningDef {
  id: string;
  name: string;
  kind: OpeningKind;
  width: number;
  height: number;
  sill: number;
  color: string;
  style?: GarageStyle;
  design?: DoorDesign;
  panels?: number;
  panelWidth?: number;
}

export const OPENINGS: OpeningDef[] = [
  { id: 'door', name: 'Door', kind: 'door', width: 820, height: 2040, sill: 0, color: '#f4f1ea' },
  { id: 'door_wide', name: 'Wide door', kind: 'door', width: 920, height: 2040, sill: 0, color: '#f4f1ea' },
  { id: 'entrance_door', name: 'Entrance door (timber)', kind: 'door', width: 920, height: 2040, sill: 0, color: '#8a5a3c', design: 'savoy' },
  { id: 'entrance_ivy', name: 'Ivy Willow front door', kind: 'door', width: 920, height: 2040, sill: 0, color: '#f4f4ef', design: 'fpp_ivy_willow' },
  { id: 'entrance_hav44', name: 'Hume HAV44 entrance door', kind: 'door', width: 820, height: 2040, sill: 0, color: '#f4f4ef', design: 'hume_hav44' },
  { id: 'entrance_hamptons', name: 'Entrance door (Hamptons)', kind: 'door', width: 920, height: 2040, sill: 0, color: '#f4f4ef', design: 'joinery' },
  { id: 'double_door', name: 'Double door', kind: 'double_door', width: 1713, height: 2040, sill: 0, color: '#f4f1ea' }, // two 820 doors
  { id: 'sliding_door', name: 'Sliding glass door', kind: 'sliding_door', width: 2400, height: 2100, sill: 0, color: '#3a3f45' },
  // 3 × 1000 mm panels: 3000 mm overall (see stackerWidth).
  { id: 'stacker_door', name: 'Stacker door', kind: 'stacker_door', width: 3000, height: 2100, sill: 0, color: '#3a3f45', panels: 3, panelWidth: 1000 },
  { id: 'cavity_door', name: 'Cavity slider', kind: 'cavity_door', width: 820, height: 2040, sill: 0, color: '#f4f1ea' },
  { id: 'garage_door', name: 'Double garage door', kind: 'garage_door', width: 4800, height: 2100, sill: 0, color: '#e4e2d5', style: 'sectional' },
  { id: 'garage_single', name: 'Single garage door', kind: 'garage_door', width: 2400, height: 2100, sill: 0, color: '#e4e2d5', style: 'sectional' },
  { id: 'garage_roller', name: 'Roller door', kind: 'garage_door', width: 4800, height: 2100, sill: 0, color: '#4b4c46', style: 'roller' },
  { id: 'window', name: 'Window', kind: 'window', width: 1200, height: 1200, sill: 900, color: '#ffffff' },
  { id: 'window_wide', name: 'Large window', kind: 'window', width: 2400, height: 1500, sill: 600, color: '#ffffff' },
  { id: 'window_high', name: 'Highlight window', kind: 'window', width: 1500, height: 450, sill: 1650, color: '#ffffff' },
  { id: 'window_small', name: 'Bathroom window', kind: 'window', width: 600, height: 900, sill: 1200, color: '#ffffff' },
  { id: 'opening', name: 'Open archway', kind: 'opening', width: 1200, height: 2100, sill: 0, color: '#ffffff' },
];

const WOOD = '#b98a5e';
const WHITE = '#f3f1ec';
const STEEL = '#c4c8cc';
const FABRIC = '#7d8a96';

const ABI_HOME: ProductLink = { url: 'https://www.abiinteriors.com.au/', label: 'ABI Interiors' };
const PANASONIC_Z80: ProductLink = { url: 'https://www.panasonic.com/au/hvac/products/air-conditioner/rac/z-akr/cu-cs-z80ykr.html', label: 'Panasonic' };

export type FridgeStyle = 'french' | 'single' | 'top' | 'bottom' | 'side' | 'bar';

/** Common fridge layouts and sizes. 'fridge' is the standard French door (the type older designs used). */
export const FRIDGES: { type: string; name: string; style: FridgeStyle; width: number; depth: number; height: number; litres: string }[] = [
  { type: 'fridge_bar', name: 'Bar fridge', style: 'bar', width: 480, depth: 520, height: 840, litres: '~120 L' },
  { type: 'fridge_single', name: 'Single door fridge', style: 'single', width: 600, depth: 700, height: 1720, litres: '~380 L' },
  { type: 'fridge_top', name: 'Top mount fridge', style: 'top', width: 700, depth: 720, height: 1720, litres: '~400 L' },
  { type: 'fridge_bottom', name: 'Bottom mount fridge', style: 'bottom', width: 700, depth: 720, height: 1800, litres: '~420 L' },
  { type: 'fridge_slim_french', name: 'Slim French door fridge', style: 'french', width: 835, depth: 730, height: 1790, litres: '~500 L' },
  { type: 'fridge', name: 'French door fridge', style: 'french', width: 910, depth: 750, height: 1790, litres: '~650 L' },
  { type: 'fridge_side', name: 'Side by side fridge', style: 'side', width: 910, depth: 730, height: 1790, litres: '~600 L' },
];
export const FRIDGE_STYLE: Record<string, FridgeStyle> = Object.fromEntries(FRIDGES.map((f) => [f.type, f.style]));

export const ITEMS: ItemDef[] = [
  // Kitchen
  { type: 'base_cabinet', name: 'Base cabinet', category: 'Kitchen', width: 600, depth: 600, height: 900, color: WHITE },
  { type: 'drawer_cabinet', name: 'Drawer cabinet', category: 'Kitchen', width: 600, depth: 600, height: 900, color: WHITE },
  { type: 'sink_cabinet', name: 'Sink cabinet', category: 'Kitchen', width: 900, depth: 600, height: 900, color: WHITE },
  { type: 'cooktop_cabinet', name: 'Cooktop & oven', category: 'Kitchen', width: 600, depth: 600, height: 900, color: WHITE },
  { type: 'corner_cabinet', name: 'Corner cabinet', category: 'Kitchen', width: 900, depth: 900, height: 900, color: WHITE },
  { type: 'dishwasher', name: 'Dishwasher', category: 'Kitchen', width: 600, depth: 600, height: 900, color: STEEL },
  { type: 'tall_cabinet', name: 'Pantry / tall cabinet', category: 'Kitchen', width: 600, depth: 600, height: 2250, color: WHITE },
  { type: 'oven_tower', name: 'Oven tower', category: 'Kitchen', width: 600, depth: 600, height: 2250, color: WHITE },
  { type: 'wall_cabinet', name: 'Wall cabinet', category: 'Kitchen', width: 600, depth: 350, height: 720, elevation: 1500, color: WHITE },
  { type: 'rangehood', name: 'Rangehood', category: 'Kitchen', width: 900, depth: 500, height: 900, elevation: 1550, color: STEEL },
  { type: 'island', name: 'Kitchen island', category: 'Kitchen', width: 2400, depth: 1000, height: 900, color: WHITE },
  // Fridges: typical Australian sizes (W × D × H, depth including handles). Check the actual model's cavity needs.
  ...FRIDGES.map((f) => ({ type: f.type, name: f.name, category: 'Fridges', width: f.width, depth: f.depth, height: f.height, color: STEEL })),
  { type: 'bar_stool', name: 'Bar stool', category: 'Kitchen', width: 420, depth: 420, height: 750, color: '#3b3b3b' },

  // Bedroom
  { type: 'bed_single', name: 'Single bed', category: 'Bedroom', width: 1000, depth: 2000, height: 1000, color: '#dfe5ea' },
  { type: 'bed_double', name: 'Double bed', category: 'Bedroom', width: 1450, depth: 2050, height: 1100, color: '#dfe5ea' },
  { type: 'bed_queen', name: 'Queen bed', category: 'Bedroom', width: 1600, depth: 2100, height: 1100, color: '#dfe5ea' },
  { type: 'bed_king', name: 'King bed', category: 'Bedroom', width: 1950, depth: 2100, height: 1100, color: '#dfe5ea' },
  { type: 'bedside', name: 'Bedside table', category: 'Bedroom', width: 450, depth: 400, height: 550, color: WOOD },
  { type: 'wardrobe', name: 'Wardrobe (sliding)', category: 'Bedroom', width: 2400, depth: 600, height: 2400, color: WHITE },
  { type: 'wardrobe_hinged', name: 'Wardrobe (hinged)', category: 'Bedroom', width: 1200, depth: 600, height: 2100, color: WOOD },
  { type: 'walkin_shelving', name: 'Walk-in robe shelving', category: 'Bedroom', width: 1800, depth: 450, height: 2100, color: WHITE },
  { type: 'dresser', name: 'Chest of drawers', category: 'Bedroom', width: 1200, depth: 500, height: 850, color: WOOD },
  { type: 'cot', name: 'Cot', category: 'Bedroom', width: 750, depth: 1350, height: 900, color: WHITE },

  // Living
  { type: 'sofa_3', name: '3-seat sofa', category: 'Living', width: 2200, depth: 950, height: 850, color: FABRIC },
  { type: 'sofa_2', name: '2-seat sofa', category: 'Living', width: 1650, depth: 950, height: 850, color: FABRIC },
  { type: 'sofa_corner', name: 'Corner sofa', category: 'Living', width: 2800, depth: 2000, height: 850, color: FABRIC },
  { type: 'armchair', name: 'Armchair', category: 'Living', width: 850, depth: 900, height: 850, color: '#a4785a' },
  { type: 'coffee_table', name: 'Coffee table', category: 'Living', width: 1200, depth: 600, height: 420, color: WOOD },
  { type: 'tv_unit', name: 'TV unit', category: 'Living', width: 1800, depth: 450, height: 500, color: '#4a4a4a' },
  { type: 'tv', name: 'Television', category: 'Living', width: 1450, depth: 80, height: 840, elevation: 600, color: '#111111' },
  { type: 'bookshelf', name: 'Bookshelf', category: 'Living', width: 900, depth: 350, height: 1800, color: WOOD },
  { type: 'fireplace', name: 'Fireplace', category: 'Living', width: 1200, depth: 450, height: 1100, color: '#5a5550' },
  { type: 'rug', name: 'Rug', category: 'Living', width: 2000, depth: 3000, height: 10, color: '#c9b79c' },
  { type: 'plant', name: 'Pot plant', category: 'Living', width: 500, depth: 500, height: 1300, color: '#4f7a4a' },
  { type: 'floor_lamp', name: 'Floor lamp', category: 'Living', width: 400, depth: 400, height: 1600, color: '#e8dcc0' },

  // Dining
  { type: 'dining_table', name: 'Dining table', category: 'Dining', width: 1800, depth: 900, height: 750, color: WOOD },
  { type: 'round_table', name: 'Round table', category: 'Dining', width: 1200, depth: 1200, height: 750, color: WOOD },
  { type: 'chair', name: 'Dining chair', category: 'Dining', width: 450, depth: 500, height: 900, color: '#6b5444' },
  // Upholstered banquette seating: seat 460 high, back to 900, 600 deep (seat + back cushion).
  { type: 'banquette', name: 'Banquette seat', category: 'Dining', width: 1800, depth: 600, height: 900, color: '#ece8df' },
  { type: 'banquette_l', name: 'Banquette seat (L corner)', category: 'Dining', width: 2000, depth: 1600, height: 900, color: '#ece8df' },
  // Harvey Norman "Lombardozzi" buffet, solid Tasmanian oak, 4 doors + 3 drawers; sold 1100 / 1580 / 2070 wide.
  // Depth and height weren't published where we could read them: 450 × 800 are typical for a buffet.
  { type: 'buffet_lombardozzi', name: 'Buffet (Lombardozzi, Tas oak)', category: 'Dining', width: 2070, depth: 450, height: 800, color: '#d8b385', link: { url: 'https://www.harveynorman.com.au/lombardozzi-buffet-tasmanian-oak.html', label: 'Harvey Norman' } },
  { type: 'sideboard', name: 'Sideboard', category: 'Dining', width: 1800, depth: 450, height: 800, color: WOOD },
  // Provincial Home Living "Rochester": 12-drawer buffet with a glazed hutch, natural oak (231 × 51 × 220 cm).
  { type: 'buffet_hutch', name: 'Buffet & hutch (Rochester)', category: 'Dining', width: 2310, depth: 510, height: 2200, color: '#c48d58', link: { url: 'https://www.provincialhomeliving.com.au/rochester-buffet-hutch-1117259923', label: 'Provincial Home Living' } },

  // Bathroom
  { type: 'toilet', name: 'Toilet', category: 'Bathroom', width: 400, depth: 700, height: 800, color: '#ffffff' },
  { type: 'vanity', name: 'Vanity', category: 'Bathroom', width: 900, depth: 460, height: 850, color: WOOD },
  { type: 'vanity_tl', name: 'Vanity (Timberline)', category: 'Bathroom', width: 900, depth: 460, height: 850, color: '#f4f4ef' },
  { type: 'double_vanity', name: 'Double vanity', category: 'Bathroom', width: 1500, depth: 460, height: 850, color: WOOD },
  { type: 'bath', name: 'Bath', category: 'Bathroom', width: 1700, depth: 760, height: 560, color: '#ffffff' },
  { type: 'shower', name: 'Shower', category: 'Bathroom', width: 900, depth: 900, height: 2000, color: '#e6ecef' },
  { type: 'mirror', name: 'Mirror cabinet', category: 'Bathroom', width: 900, depth: 150, height: 750, elevation: 1100, color: '#dfe7ec' },
  { type: 'towel_rail', name: 'Towel rail', category: 'Bathroom', width: 600, depth: 100, height: 800, elevation: 600, color: STEEL },

  // Laundry
  { type: 'washer', name: 'Washing machine', category: 'Laundry', width: 600, depth: 620, height: 850, color: '#ffffff' },
  { type: 'dryer', name: 'Dryer', category: 'Laundry', width: 600, depth: 620, height: 850, color: '#ffffff' },
  { type: 'laundry_tub', name: 'Laundry tub', category: 'Laundry', width: 600, depth: 520, height: 900, color: STEEL },

  // Skylights (VELUX): sit in the ceiling, with a light shaft up to the unit on the roof. Overall frame sizes from
  // VELUX Australia's size codes; see SKYLIGHT_SIZES.
  { type: 'skylight', name: 'VELUX skylight', category: 'Skylights', width: 780, depth: 1180, height: 200, color: '#4a4d50' },
  { type: 'sun_tunnel', name: 'VELUX Sun Tunnel', category: 'Skylights', width: 350, depth: 350, height: 200, color: '#f4f4f2', link: { url: 'https://www.velux.com.au/products/sun-tunnels', label: 'VELUX' } },

  // Garage storage: boltless steel shelving after Bunnings' Pinnacle 4-tier heavy duty unit (1830 H × 1820 W ×
  // 540 D, matte black frame, about 600 kg per shelf). Tiers are adjustable (2–6) in the panel.
  { type: 'shelving_rack', name: 'Heavy duty shelving (4 tier)', category: 'Garage', width: 1820, depth: 540, height: 1830, color: '#26282b', link: { url: 'https://www.bunnings.com.au/pinnacle-1830-x-1820-x-540mm-4-tier-heavy-duty-shelving-unit_p2582967', label: 'Bunnings' } },
  { type: 'shelving_rack_tall', name: 'Heavy duty shelving (5 tier, tall)', category: 'Garage', width: 1820, depth: 540, height: 2090, color: '#26282b', link: { url: 'https://www.bunnings.co.nz/pinnacle-2090-x-1820-x-540mm-5-tier-heavy-duty-adjustable-shelving-unit_p0853494', label: 'Bunnings NZ' } },
  { type: 'shelving_rack_narrow', name: 'Shelving, narrow (4 tier)', category: 'Garage', width: 900, depth: 450, height: 1830, color: '#26282b' },

  // ABI Interiors: one entry per kind of fixture; pick the actual ABI product (size, finish) in the panel.
  { type: 'abi_vanity', name: 'ABI vanity', category: 'ABI Interiors', width: 1164, depth: 450, height: 500, elevation: 350, color: '#c49a6c', link: ABI_HOME },
  { type: 'abi_basin', name: 'ABI basin', category: 'ABI Interiors', width: 500, depth: 400, height: 150, elevation: 850, color: '#f7f7f5', link: ABI_HOME },
  { type: 'abi_bath', name: 'ABI bath', category: 'ABI Interiors', width: 1700, depth: 750, height: 560, color: '#f7f7f5', link: ABI_HOME },
  { type: 'abi_toilet', name: 'ABI toilet', category: 'ABI Interiors', width: 380, depth: 680, height: 800, color: '#f7f7f5', link: ABI_HOME },
  { type: 'abi_sink', name: 'ABI kitchen / laundry sink', category: 'ABI Interiors', width: 800, depth: 500, height: 220, elevation: 680, color: '#b5b8bb', link: ABI_HOME },
  { type: 'abi_mirror', name: 'ABI mirror', category: 'ABI Interiors', width: 600, depth: 40, height: 900, elevation: 1100, color: '#b8955a', link: ABI_HOME },
  { type: 'abi_towel_rail', name: 'ABI towel rail', category: 'ABI Interiors', width: 600, depth: 100, height: 120, elevation: 1000, color: '#b8955a', link: ABI_HOME },
  { type: 'abi_shower', name: 'ABI shower', category: 'ABI Interiors', width: 250, depth: 300, height: 1000, elevation: 1100, color: '#b8955a', link: ABI_HOME },
  { type: 'abi_bath_filler', name: 'ABI bath filler', category: 'ABI Interiors', width: 250, depth: 250, height: 1000, color: '#b8955a', link: ABI_HOME },
  { type: 'abi_tap', name: 'ABI tap / mixer', category: 'ABI Interiors', width: 60, depth: 200, height: 250, elevation: 880, color: '#b8955a', link: ABI_HOME },
  { type: 'abi_accessory', name: 'ABI accessory', category: 'ABI Interiors', width: 150, depth: 100, height: 100, elevation: 1100, color: '#b8955a', link: ABI_HOME },

  // Solar: an array of panels that lies on the roof slope under it (2 × 5 Jinko Tiger Neo 440 W to start).
  { type: 'solar_array', name: 'Solar panels', category: 'Solar', width: 5750, depth: 3544, height: 40, color: '#111214' },

  // Heating & cooling: split system air conditioner, sized from Panasonic's 8.0 kW Z series (CS/CU-Z80YKR):
  // indoor 1040 W × 244 D × 295 H, outdoor 875 W × 320 D × 795 H. Resize for other capacities.
  { type: 'ac_indoor', name: 'Split system AC (indoor, 8 kW)', category: 'Heating & cooling', width: 1040, depth: 244, height: 295, elevation: 2200, color: '#f6f6f3', link: PANASONIC_Z80 },
  { type: 'ac_outdoor', name: 'Split system AC (outdoor, 8 kW)', category: 'Heating & cooling', width: 875, depth: 320, height: 795, color: '#e8e8e4', link: PANASONIC_Z80 },

  // Office
  { type: 'desk', name: 'Desk', category: 'Office', width: 1500, depth: 700, height: 750, color: WOOD },
  { type: 'office_chair', name: 'Office chair', category: 'Office', width: 650, depth: 650, height: 1050, color: '#2e2e2e' },
  { type: 'filing', name: 'Filing cabinet', category: 'Office', width: 450, depth: 600, height: 720, color: '#8a8f94' },

  // Outdoor (snap to the outside of a wall; height = deck height / veranda height at the house)
  { type: 'deck', name: 'Deck', category: 'Outdoor', width: 4800, depth: 3600, height: 300, color: '#9a6b4a' },
  { type: 'veranda', name: 'Veranda', category: 'Outdoor', width: 6000, depth: 3000, height: 2700, color: '#4b4c46' },
  { type: 'porch', name: 'Porch', category: 'Outdoor', width: 2400, depth: 1800, height: 2700, color: '#4b4c46' },
  { type: 'pergola', name: 'Pergola', category: 'Outdoor', width: 4000, depth: 3600, height: 2600, color: '#8a6a4f' },
  { type: 'patio', name: 'Patio / paving', category: 'Outdoor', width: 5000, depth: 3500, height: 80, color: '#bdb7ab' },
  // A single step (straight, or a corner step wrapping round a corner): add more one by one, one riser down each.
  { type: 'step', name: 'Step', category: 'Outdoor', width: 1500, depth: 300, height: 170, color: '#bdb7ab' },

  // Structure & other
  { type: 'stairs', name: 'Staircase', category: 'Structure', width: 1000, depth: 3600, height: 2700, color: WOOD },
  { type: 'column', name: 'Column', category: 'Structure', width: 300, depth: 300, height: 2700, color: '#e9e6df' },
  { type: 'bench_seat', name: 'Built-in bench', category: 'Structure', width: 1500, depth: 450, height: 450, color: WOOD },
  { type: 'box', name: 'Custom block', category: 'Structure', width: 1000, depth: 600, height: 900, color: '#c9c3b8' },
  { type: 'car', name: 'Car', category: 'Structure', width: 1850, depth: 4700, height: 1500, color: '#8c2f2f' },
  // Kaboodle units are placed from the kitchen designer (which product it is lives in the item's options).
  { type: 'cabinet', name: 'Custom cabinet', category: KITCHEN_DESIGNER, width: 600, depth: 600, height: 900, color: '#f3f2ee' },
  { type: 'kaboodle', name: 'Kaboodle cabinet', category: KITCHEN_DESIGNER, width: 600, depth: 600, height: 903, color: '#f4f4f2', link: { url: 'https://www.kaboodle.com.au/', label: 'Kaboodle' } },
];

export const ITEM_MAP: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((d) => [d.type, d]));
export const OPENING_MAP: Record<string, OpeningDef> = Object.fromEntries(OPENINGS.map((d) => [d.id, d]));

export const CATEGORIES = Array.from(new Set(ITEMS.map((i) => i.category))).filter((c) => c !== KITCHEN_DESIGNER);

export const FLOOR_COLORS: Record<string, string> = {
  timber: '#c49a6c',
  hybrid: '#b89b78',
  tile: '#e4e2dc',
  large_tile: '#d9d6cf',
  carpet: '#b9b2a6',
  concrete: '#a9a8a4',
};

export const FLOOR_NAMES: Record<string, string> = {
  timber: 'Timber boards',
  hybrid: 'Hybrid / vinyl plank',
  tile: 'Tiles 600 × 600',
  large_tile: 'Large tiles 600 × 1200',
  carpet: 'Carpet',
  concrete: 'Polished concrete',
};

export const FLOOR_SWATCHES: Record<string, { name: string; hex: string }[]> = {
  timber: [
    { name: 'Blackbutt', hex: '#c49a6c' },
    { name: 'Spotted gum', hex: '#9a6b4a' },
    { name: 'Tasmanian oak', hex: '#d2b48c' },
    { name: 'Jarrah', hex: '#7a3b2a' },
    { name: 'Smoked oak', hex: '#6f5644' },
    { name: 'Whitewashed', hex: '#dccfbd' },
  ],
  hybrid: [
    { name: 'Natural oak', hex: '#b89b78' },
    { name: 'Coastal grey', hex: '#a9a39a' },
    { name: 'Light oak', hex: '#d1bb98' },
    { name: 'Walnut', hex: '#6e5340' },
  ],
  tile: [
    { name: 'Warm white', hex: '#e4e2dc' },
    { name: 'Light grey', hex: '#c9c8c4' },
    { name: 'Charcoal', hex: '#5a5a58' },
    { name: 'Sand', hex: '#d5c8af' },
  ],
  large_tile: [
    { name: 'Stone white', hex: '#d9d6cf' },
    { name: 'Concrete grey', hex: '#a7a6a2' },
    { name: 'Travertine', hex: '#d8c6a6' },
    { name: 'Black', hex: '#3a3a39' },
  ],
  carpet: [
    { name: 'Wool beige', hex: '#b9b2a6' },
    { name: 'Charcoal', hex: '#5c5b5a' },
    { name: 'Dove grey', hex: '#a6a5a2' },
    { name: 'Oatmeal', hex: '#cfc3ad' },
  ],
  concrete: [
    { name: 'Natural', hex: '#a9a8a4' },
    { name: 'Light', hex: '#c7c5c0' },
    { name: 'Charcoal', hex: '#6c6b68' },
  ],
};

/**
 * COLORBOND® steel roofing colours (standard range). Hex values are close screen approximations;
 * check physical samples before ordering.
 */
export const COLORBOND: { name: string; hex: string }[] = [
  { name: 'Surfmist', hex: '#e4e2d5' },
  { name: 'Classic Cream', hex: '#e9dcb8' },
  { name: 'Paperbark', hex: '#cabfa4' },
  { name: 'Evening Haze', hex: '#c5c2aa' },
  { name: 'Shale Grey', hex: '#bdbfba' },
  { name: 'Dune', hex: '#b1ada3' },
  { name: 'Windspray', hex: '#888b8a' },
  { name: 'Gully', hex: '#857e73' },
  { name: 'Wallaby', hex: '#7f7c78' },
  { name: 'Pale Eucalypt', hex: '#7c846a' },
  { name: 'Basalt', hex: '#6d6c6e' },
  { name: 'Jasper', hex: '#6c6153' },
  { name: 'Woodland Grey', hex: '#4b4c46' },
  { name: 'Ironstone', hex: '#3e434c' },
  { name: 'Deep Ocean', hex: '#364152' },
  { name: 'Cottage Green', hex: '#304c3c' },
  { name: 'Manor Red', hex: '#5e1d0e' },
  { name: 'Monument', hex: '#323233' },
  { name: 'Night Sky', hex: '#141414' },
];

export interface NamedColor {
  name: string;
  hex: string;
}

/**
 * Dulux® exterior colours (popular Australian range). Hex values are screen approximations; check a
 * Dulux colour chip before buying paint.
 */
export const DULUX: NamedColor[] = [
  { name: 'Vivid White', hex: '#f4f4ef' },
  { name: 'Lexicon Quarter', hex: '#eef0ee' },
  { name: 'Natural White', hex: '#efece2' },
  { name: 'Whisper White', hex: '#ece9df' },
  { name: 'White on White', hex: '#ecebe3' },
  { name: 'Antique White U.S.A.', hex: '#ede6d6' },
  { name: 'Hogs Bristle', hex: '#ddd3bb' },
  { name: 'Grey Pebble', hex: '#cdcac0' },
  { name: 'Tranquil Retreat', hex: '#d0cfc8' },
  { name: 'Timeless Grey', hex: '#c9c6bd' },
  { name: 'Silver Mist', hex: '#c4c6c4' },
  { name: 'Dieskau', hex: '#b2ab9f' },
  { name: 'Western Myall', hex: '#a19a8a' },
  { name: 'Malay Grey', hex: '#8c8c86' },
  { name: 'Ticking', hex: '#7c8186' },
  { name: 'Stepney', hex: '#6b6c69' },
  { name: 'Basalt', hex: '#6d6c6e' },
  { name: 'Woodland Grey', hex: '#4b4c46' },
  { name: 'Ironstone', hex: '#3e434c' },
  { name: 'Monument', hex: '#323233' },
  { name: 'Domino', hex: '#2f2e2c' },
  { name: 'Black', hex: '#1d1d1d' },
  { name: 'Bayside Blue', hex: '#5c6f7e' },
  { name: 'Mt Aspiring', hex: '#7a8a7e' },
  { name: 'Terrace Olive', hex: '#6f6b55' },
  { name: 'Manor Red', hex: '#5e1d0e' },
];

export const BRICK_COLORS: NamedColor[] = [
  { name: 'Classic red', hex: '#9c4f3a' },
  { name: 'Dark red', hex: '#7a3a2e' },
  { name: 'Terracotta', hex: '#b8673f' },
  { name: 'Tan blend', hex: '#b58b62' },
  { name: 'Cream', hex: '#d9c9a5' },
  { name: 'Limestone', hex: '#d8d2c2' },
  { name: 'Grey', hex: '#8f8c87' },
  { name: 'Charcoal', hex: '#4a4744' },
  { name: 'Chocolate', hex: '#5b3f31' },
];

export const MORTAR_COLORS: NamedColor[] = [
  { name: 'Natural', hex: '#bdb6a8' },
  { name: 'Off-white', hex: '#d9d4c7' },
  { name: 'Light grey', hex: '#a9a8a3' },
  { name: 'Charcoal', hex: '#4f4e4b' },
  { name: 'Cream', hex: '#d8c9a6' },
];

export const STONE_COLORS: NamedColor[] = [
  { name: 'Sandstone', hex: '#c7aa7b' },
  { name: 'Limestone', hex: '#cfc6b1' },
  { name: 'Grey slate', hex: '#7e7f7c' },
  { name: 'Bluestone', hex: '#5c6066' },
  { name: 'Granite', hex: '#9b9284' },
  { name: 'Charcoal', hex: '#4b4a48' },
];

export const TIMBER_COLORS: NamedColor[] = [
  { name: 'Natural cedar', hex: '#a86f43' },
  { name: 'Spotted gum', hex: '#9a6b4a' },
  { name: 'Blackbutt', hex: '#c49a6c' },
  { name: 'Silvered grey', hex: '#9c9a92' },
  { name: 'Charred black', hex: '#2b2a28' },
  { name: 'Merbau', hex: '#6e3b26' },
];

export const BLOCK_COLORS: NamedColor[] = [
  { name: 'Natural grey', hex: '#b9b5ad' },
  { name: 'Charcoal', hex: '#5a5856' },
  { name: 'Sandstone', hex: '#cbb592' },
  { name: 'Off-white', hex: '#dcd8cf' },
];

export const FACADE_PALETTES: Record<string, NamedColor[]> = {
  paint: DULUX,
  brick: BRICK_COLORS,
  stone: STONE_COLORS,
  timber: TIMBER_COLORS,
  block: BLOCK_COLORS,
  colorbond: COLORBOND,
};

export const GARAGE_STYLES: Record<GarageStyle, { name: string; color: string }> = {
  sectional: { name: 'Sectional (panel lift)', color: '#e4e2d5' },
  sectional_windows: { name: 'Sectional with windows', color: '#e4e2d5' },
  roller: { name: 'Roller door', color: '#4b4c46' },
  tilt: { name: 'Tilt door', color: '#bdbfba' },
  timber: { name: 'Timber-look slats', color: '#a86f43' },
  glass: { name: 'Glass & aluminium', color: '#323233' },
};

/**
 * Door leaf designs, grouped by brand. Each follows the typical look of a real range from Hume Doors or
 * Corinthian Doors; the model codes are examples from that range (from retailer listings) to check against
 * the maker's current catalogue — exact panel and glass layouts vary by model.
 * `layout` picks the 3D/2D leaf pattern; `use` sets leaf thickness (entrance 40 mm, internal 35 mm).
 */
export interface DoorDesignDef {
  name: string;
  group: string;
  models?: string;
  layout: string;
  glass: boolean;
  color: string;
  use: 'entrance' | 'internal';
  /** Glass choices offered (default: clear / translucent). */
  glassTypes?: string[];
  /** Layout for matching sidelights (default: plain glass over a kick panel). */
  sidelight?: string;
  /** Standard sidelight widths for this door. */
  sidelightWidths?: number[];
  /** Note shown with the design (sizes, where to check). */
  note?: string;
}

export const DOOR_DESIGNS: Record<string, DoorDesignDef> = {
  flush: { name: 'Flush (plain)', group: 'Generic', layout: 'flush', glass: false, color: '#f4f1ea', use: 'internal' },
  shaker: { name: 'Shaker (single recessed panel)', group: 'Generic', layout: 'shaker', glass: false, color: '#f4f1ea', use: 'internal' },

  savoy: { name: 'Savoy — timber, vertical glass panel', group: 'Hume — quick styles', models: 'Hume Savoy range, e.g. XS24, XS28', layout: 'savoy', glass: true, color: '#8a5a3c', use: 'entrance' },
  linear: { name: 'Linear — grooved, slim glass strip', group: 'Hume — quick styles', models: 'Hume Linear range, e.g. XLR160, XLR310, XLR320', layout: 'linear', glass: true, color: '#3e434c', use: 'entrance' },
  newington: { name: 'Newington — stacked glass slots', group: 'Hume — quick styles', models: 'Hume Newington range, e.g. XN1, XN5, XN6', layout: 'newington', glass: true, color: '#f4f4ef', use: 'entrance' },
  vaucluse: { name: 'Vaucluse — panels with top glass', group: 'Hume — quick styles', models: 'Hume Vaucluse range, e.g. XV1, XV9', layout: 'vaucluse', glass: true, color: '#f4f4ef', use: 'entrance' },
  joinery: { name: 'Joinery (Hamptons) — glazed lites over a panel', group: 'Hume — quick styles', models: 'Hume Joinery range, e.g. JST1', layout: 'joinery', glass: true, color: '#f4f4ef', use: 'entrance' },
  haven: { name: 'Haven (Hamptons) — large framed glass', group: 'Hume — quick styles', models: 'Hume Haven range', layout: 'haven', glass: true, color: '#f4f4ef', use: 'entrance' },
  // Hume Haven HAV44 (catalogue Jul 2022): 2 × 2 glass lites with slim glazing bars over one routed bottom panel.
  hume_hav44: {
    name: 'HAV44 — 4 glass lites over a panel',
    group: 'Hume entrance — Haven',
    models: 'Hume Haven HAV44 (matching sidelite HAV45)',
    layout: 'hav44',
    glass: true,
    color: '#f4f4ef',
    use: 'entrance',
    glassTypes: ['translucent', 'clear', 'cathedral', 'grey'],
    sidelight: 'hav45',
    sidelightWidths: [400],
    note: 'Standard 2040 × 820 × 40 (custom 1990–2400 high × 805–1200 wide). HAV45 sidelite 400 wide (custom 330–500). Solid HMR MDF core, DuraXP primed faces for painting, BAL12.5. Optional V-groove faces.',
  },

  hume_accent: { name: 'Accent — routed grooves', group: 'Hume — quick styles', models: 'Hume Accent range, e.g. HA4, HA5', layout: 'accent', glass: false, color: '#f4f4ef', use: 'internal' },
  hume_accent_glazed: { name: 'Accent glazed — grooves with glass', group: 'Hume — quick styles', models: 'Hume Accent range, e.g. HAG6, HAG9', layout: 'accent_glass', glass: true, color: '#f4f4ef', use: 'internal' },
  hume_linear_int: { name: 'Linear — horizontal grooves', group: 'Hume — quick styles', models: 'Hume Linear internal range, e.g. HLR230, HLR400', layout: 'grooves_h', glass: false, color: '#f4f4ef', use: 'internal' },
  hume_hayman: { name: 'Moulded Panel — Hayman two panel', group: 'Hume — quick styles', models: 'Hume Moulded Panel range, Hayman', layout: 'panels2', glass: false, color: '#f4f4ef', use: 'internal' },
  hume_ham1_glass: {
    name: 'HAM1 — shaker frame, glass panel',
    group: 'Hume internal — Hampton',
    models: 'Hume Hampton HAM1 (glazed, clear or translucent)',
    layout: 'ham1_glass',
    glass: true,
    color: '#f4f4ef',
    use: 'internal',
    note: 'Internal sizes 2040/2340 high × 520–920 wide, 35 mm.',
  },
  hume_ham1_panel: {
    name: 'HAM1 — shaker frame, MDF panel',
    group: 'Hume internal — Hampton',
    models: 'Hume Hampton HAM1 (primed MDF)',
    layout: 'ham1_panel',
    glass: false,
    color: '#f4f4ef',
    use: 'internal',
    note: 'Internal sizes 2040/2340 high × 520–920 wide, 35 mm.',
  },
  hume_oakfield: { name: 'Oakfield — oak veneer', group: 'Hume — quick styles', models: 'Hume Oakfield range, e.g. HC2', layout: 'veneer', glass: false, color: '#c8a77c', use: 'internal' },

  cor_madison: { name: 'Madison — routed panels', group: 'Corinthian — internal', models: 'Corinthian Madison internal, e.g. PMADIN4', layout: 'madison', glass: false, color: '#f4f4ef', use: 'internal' },
  cor_moda: { name: 'Moda — glazed insert', group: 'Corinthian — internal', models: 'Corinthian Moda, e.g. PMOD1GC (clear glass)', layout: 'moda', glass: true, color: '#f4f4ef', use: 'internal' },
  cor_motive: { name: 'Motive — routed lines', group: 'Corinthian — internal', models: 'Corinthian Motive, e.g. MOTP2', layout: 'motive', glass: false, color: '#f4f4ef', use: 'internal' },
  cor_impressions: { name: 'Impressions — moulded six panel', group: 'Corinthian — internal', models: 'Corinthian Impressions range', layout: 'panels6', glass: false, color: '#f4f4ef', use: 'internal' },
  fpp_ivy_willow: {
    name: 'Ivy Willow — four lites over a panel',
    group: 'Front Porch Properties',
    models: 'Front Porch Properties Ivy Willow (solid hardwood, 40 mm)',
    layout: 'ivy',
    glass: true,
    color: '#f4f4ef',
    use: 'entrance',
    glassTypes: ['clear', 'cathedral', 'reeded'],
    sidelight: 'ivy_side',
    sidelightWidths: [350, 420],
    note: 'Sizes 2040/2100/2340 high × 820–1200 wide. Matching “Ivy Willow Sidelites / Side Panels” 350 or 420 mm wide (custom 360–800).',
  },
  fpp_ivy_breeze: {
    name: 'Ivy Willow Breeze — 2-in-1 with built-in screen',
    group: 'Front Porch Properties',
    models: 'Front Porch Properties Breeze, Ivy Willow design',
    layout: 'ivy_breeze',
    glass: true,
    color: '#a9845a',
    use: 'entrance',
    glassTypes: ['clear', 'cathedral', 'reeded'],
    sidelight: 'ivy_side',
    sidelightWidths: [350, 420],
    note: 'Glass panels open on black mini hinges to a built-in security screen. Sizes 2040/2340 high × 820–1200 wide. Round or egg knob handles only.',
  },
  fpp_oaklands: {
    name: 'Oaklands — four lites over VJ panelling',
    group: 'Front Porch Properties',
    models: 'Front Porch Properties Oaklands',
    layout: 'oaklands',
    glass: true,
    color: '#9aa58c',
    use: 'entrance',
    glassTypes: ['clear', 'cathedral', 'reeded'],
    sidelight: 'oaklands_side',
    sidelightWidths: [350, 420],
    note: 'Sizes 2040/2100/2340 high × 770–1200 wide. Available with a matching sidelite / side panel.',
  },
  fpp_oaklands_breeze: {
    name: 'Oaklands Breeze — 2-in-1 with built-in screen',
    group: 'Front Porch Properties',
    models: 'Front Porch Properties Breeze, Oaklands design',
    layout: 'oaklands_breeze',
    glass: true,
    color: '#9aa58c',
    use: 'entrance',
    glassTypes: ['clear', 'cathedral', 'reeded'],
    sidelight: 'oaklands_side',
    sidelightWidths: [350, 420],
  },
  fpp_arch: {
    name: 'Arch Ivy Willow — arched, four lites over a panel',
    group: 'Front Porch Properties',
    models: 'Front Porch Properties Arch Ivy Willow',
    layout: 'ivy_arch',
    glass: true,
    color: '#a7b8a6',
    use: 'entrance',
    glassTypes: ['clear', 'cathedral', 'reeded', 'frosted'],
    note: 'Sizes 2040 × 820 or 920. Finishes: raw Meranti, primed or raw white oak.',
  },
  cor_madison_entry: { name: 'Madison — routed panels with glass', group: 'Corinthian — entrance', models: 'Corinthian Madison entrance range', layout: 'madison_glass', glass: true, color: '#f4f4ef', use: 'entrance' },
};

/**
 * Timberline vanities (Australian maker). Range names and widths are from Timberline stockists; each range's
 * exact door style, finishes and tops vary by model, so the look is set with the options below — check the
 * Timberline catalogue or a dealer for the model you're specifying.
 */
export const TIMBERLINE = {
  ranges: [
    'Kansas', 'Bargo', 'Grange', 'Henley', 'Carlo', 'Nevada', 'Nevada Plus', 'Emmett', 'Colby', 'Elwood', 'Ainsworth', 'Billie',
    'Sutherland House Regency', 'Sutherland House Farmhouse', 'Sutherland House Deco', 'Sutherland House Retro',
  ],
  widths: [450, 600, 750, 900, 1050, 1200, 1500, 1800, 2100],
  mounting: { wall: 'Wall-hung', legs: 'Floor-standing on legs', kick: 'On a kickboard' } as Record<string, string>,
  fronts: { drawers: 'Drawers', doors: 'Doors' } as Record<string, string>,
  style: { shaker: 'Shaker', vgroove: 'V-groove', fluted: 'Fluted', slab: 'Flat slab (handleless)', curved: 'Curved (deco)' } as Record<string, string>,
  basin: { above: 'Above-counter basin', under: 'Undercounter basin', integrated: 'Integrated basin top' } as Record<string, string>,
  top: { stone: 'Stone top', silk: 'Silksurface top' } as Record<string, string>,
  colors: [
    { name: 'Satin white', hex: '#f4f4ef' },
    { name: 'Warm white', hex: '#ece6da' },
    { name: 'Light oak', hex: '#c9a77c' },
    { name: 'Natural oak', hex: '#a9845a' },
    { name: 'Walnut', hex: '#6e5340' },
    { name: 'Sage', hex: '#9aa58c' },
    { name: 'Navy', hex: '#2f3b52' },
    { name: 'Matte black', hex: '#2a2a2a' },
  ],
  tops: [
    { name: 'White stone', hex: '#f2f1ed' },
    { name: 'Grey stone', hex: '#c9c8c3' },
    { name: 'Carrara look', hex: '#e8e6e1' },
    { name: 'Black stone', hex: '#3a3a39' },
  ],
};

export const VANITY_DEFAULTS: Record<string, string | number> = {
  range: 'Kansas',
  mounting: 'wall',
  fronts: 'drawers',
  style: 'shaker',
  basin: 'above',
  bowls: 1,
  top: 'stone',
  topColor: '#f2f1ed',
};

/**
 * Dulux® colours for interiors: popular interior whites and neutrals, then the wider Dulux range used
 * elsewhere. Hex values are screen approximations — check a Dulux colour chip before buying paint.
 */
export const DULUX_INTERIOR: NamedColor[] = [
  { name: 'Hogs Bristle Quarter', hex: '#e8e1d0' },
  { name: 'Hogs Bristle Half', hex: '#e2dac6' },
  { name: 'Grey Pebble Quarter', hex: '#e6e4dd' },
  { name: 'Grey Pebble Half', hex: '#dedbd3' },
  { name: 'Lexicon Half', hex: '#e6eae8' },
  { name: 'Snowy Mountains Half', hex: '#e3e7e3' },
  { name: 'Terrace White', hex: '#ebe6d7' },
  ...DULUX,
];

/** Natural timber stains for doors (with the Dulux paint colours). */
export const TIMBER_STAINS: NamedColor[] = [
  { name: 'Blackbutt stain', hex: '#c49a6c' },
  { name: 'Cedar stain', hex: '#a86f43' },
  { name: 'Merbau / Kwila stain', hex: '#8a5a3c' },
  { name: 'Walnut stain', hex: '#5b4636' },
];

/** Banquette options and upholstery. */
export const BANQUETTE_DEFAULTS = { back: 'channel', fabric: '#cfc6b4', seatHeight: 460, corner: 'left' } as Record<string, string | number>;
export const BANQUETTE_BACKS: Record<string, string> = {
  channel: 'Channel tufted (vertical)',
  plain: 'Plain cushion',
  buttoned: 'Buttoned',
  timber: 'No cushion (timber back)',
};
export const UPHOLSTERY: { hex: string; name: string }[] = [
  { hex: '#e9e3d6', name: 'Bouclé cream' },
  { hex: '#cfc6b4', name: 'Natural linen' },
  { hex: '#a9a397', name: 'Stone' },
  { hex: '#9caf88', name: 'Sage velvet' },
  { hex: '#5c6b55', name: 'Olive' },
  { hex: '#2f3f56', name: 'Navy' },
  { hex: '#b5654a', name: 'Terracotta' },
  { hex: '#a0673e', name: 'Tan leather' },
  { hex: '#5a3a2a', name: 'Chocolate leather' },
  { hex: '#4a4c4f', name: 'Charcoal' },
  { hex: '#2a2a2a', name: 'Black leather' },
];

/** VELUX skylights: models and standard sizes (overall frame, width × length in mm; length runs up the roof). */
export const SKYLIGHT_MODELS: Record<string, string> = {
  FS: 'FS — fixed',
  VS: 'VS — manual opening',
  VSE: 'VSE — electric opening',
  VSS: 'VSS — solar opening',
};
export const SKYLIGHT_SIZES: Record<string, [number, number]> = {
  C01: [550, 700],
  C04: [550, 980],
  C08: [550, 1400],
  M02: [780, 780],
  M04: [780, 980],
  M06: [780, 1180],
  M08: [780, 1400],
  S01: [1140, 700],
  S06: [1140, 1180],
};
/** Sun Tunnel tube diameters (mm). */
export const SUN_TUNNEL_SIZES = [250, 350];
export const SKYLIGHT_DEFAULTS = { model: 'VS', size: 'M06' } as Record<string, string | number>;

/** Curtains and blinds for windows. */
export const DRESSINGS: Record<string, { name: string; kind: 'blind' | 'curtain'; color: string }> = {
  roller: { name: 'Roller blind', kind: 'blind', color: '#e9e5dc' },
  roman: { name: 'Roman blind', kind: 'blind', color: '#d8d0c0' },
  venetian: { name: 'Venetian blind (50 mm slats)', kind: 'blind', color: '#f2f0ea' },
  sheer: { name: 'Sheer curtains', kind: 'curtain', color: '#f6f4ee' },
  blockout: { name: 'Blockout curtains', kind: 'curtain', color: '#a9a397' },
  sheer_blockout: { name: 'Sheer + blockout curtains (double track)', kind: 'curtain', color: '#8c8f86' },
};
export const DRESSING_FABRICS: { hex: string; name: string }[] = [
  { hex: '#ffffff', name: 'White' },
  { hex: '#f6f4ee', name: 'Ivory' },
  { hex: '#e9e5dc', name: 'Linen' },
  { hex: '#d8d0c0', name: 'Oatmeal' },
  { hex: '#a9a397', name: 'Stone' },
  { hex: '#8c8f86', name: 'Pewter' },
  { hex: '#9caf88', name: 'Sage' },
  { hex: '#4a4c4f', name: 'Charcoal' },
  { hex: '#2f3f56', name: 'Navy' },
  { hex: '#b8865b', name: 'Timber look' },
];

/** Timberline's page for a vanity range (their address for most ranges is the name; Colby's differs). */
function timberlineUrl(range: string) {
  const slug = range === 'Colby' ? 'colby-vanity' : range.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `https://timberline.com.au/products/vanities/${slug}/`;
}
const VELUX_SKYLIGHT_PAGES: Record<string, string> = {
  FS: 'pitched-roof-fixed-skylight',
  VS: 'pitched-roof-manual-skylight',
  VSE: 'pitched-roof-electrical-skylight',
  VSS: 'pitched-roof-solar-skylight',
};

/** The real product an item is modelled on, if any (following its chosen range / model where that matters). */
export function productLink(it: { type: string; options?: Record<string, string | number> }): ProductLink | null {
  if (it.type === 'vanity_tl') {
    const range = String(it.options?.range ?? VANITY_DEFAULTS.range);
    return { url: timberlineUrl(range), label: `Timberline — ${range}` };
  }
  if (it.type === 'skylight') {
    const model = String(it.options?.model ?? SKYLIGHT_DEFAULTS.model);
    return { url: `https://www.velux.com.au/products/pitched-roof-skylights/${VELUX_SKYLIGHT_PAGES[model] ?? ''}`, label: `VELUX ${model}` };
  }
  if (it.type === 'solar_array') {
    const p = SOLAR_PANELS[String(it.options?.panel ?? SOLAR_DEFAULTS.panel)];
    return p ? { url: p.url, label: p.brand } : null;
  }
  if (it.type.startsWith('abi_') && it.options?.slug)
    return { url: `https://www.abiinteriors.com.au/product/${it.options.slug}/`, label: 'ABI Interiors' };
  return ITEM_MAP[it.type]?.link ?? null;
}

/** Roofing materials, their profiles and (for tiles) colours. COLORBOND® steel uses the COLORBOND palette. */
export const ROOF_MATERIALS: Record<string, { name: string; profiles: string[] }> = {
  colorbond: { name: 'COLORBOND® steel', profiles: ['corrugated', 'trapezoidal', 'kliplok'] },
  concrete_tile: { name: 'Concrete tiles', profiles: ['flat_tile', 'wave_tile'] },
  terracotta_tile: { name: 'Terracotta tiles', profiles: ['flat_tile', 'wave_tile'] },
};
export const ROOF_PROFILES: Record<string, string> = {
  corrugated: 'Corrugated',
  trapezoidal: 'Trapezoidal rib (Trimdek®-style)',
  kliplok: 'Concealed-fix wide rib (Klip-Lok®-style)',
  flat_tile: 'Flat profile',
  wave_tile: 'Wave profile (Marseille / Roman)',
};
export const TILE_COLOURS: { hex: string; name: string }[] = [
  { hex: '#3a3c3e', name: 'Charcoal' },
  { hex: '#232425', name: 'Black / Eclipse' },
  { hex: '#62686c', name: 'Slate grey' },
  { hex: '#8a8d8f', name: 'Granite' },
  { hex: '#a2958a', name: 'Mushroom' },
  { hex: '#8f857a', name: 'Shale' },
  { hex: '#c9b28f', name: 'Sandstone' },
  { hex: '#e2ded6', name: 'White / Ice' },
  { hex: '#7a3b2a', name: 'Red brown' },
  { hex: '#b5583a', name: 'Terracotta red' },
  { hex: '#c9774a', name: 'Natural terracotta' },
  { hex: '#4c3a33', name: 'Chocolate' },
];
/** COLORBOND® gutter styles (cross-sections drawn in 3D). */
export const GUTTER_STYLES: Record<string, string> = {
  quad: 'Quad',
  half_round: 'Half Round',
  square_line: 'Square Line',
  fascia: 'Fascia / Hi-front',
  ogee: 'Ogee (OG)',
};

/** Solar panels (from each maker's datasheet): size is long side × short side × thickness in mm. */
export interface SolarPanel {
  brand: string;
  model: string;
  code: string;
  watts: number;
  long: number;
  short: number;
  thick: number;
  kg: number;
  efficiency: number;
  /** Frame and cell colours for the 3D model. */
  frame: string;
  cells: string;
  url: string;
  brandUrl: string;
}
export const SOLAR_PANELS: Record<string, SolarPanel> = {
  jinko_tiger_neo_440: {
    brand: 'Jinko Solar',
    model: 'Tiger Neo 440 W (all black)',
    code: 'JKM440N-54HL4R-B',
    watts: 440,
    long: 1762,
    short: 1134,
    thick: 30,
    kg: 21,
    efficiency: 22.02,
    frame: '#111214',
    cells: '#15171c',
    url: 'https://www.jinkosolar.com/en/site/tigerneo',
    brandUrl: 'https://jinkosolar.com.au/',
  },
  trina_vertex_s_plus_445: {
    brand: 'Trina Solar',
    model: 'Vertex S+ 445 W (black frame)',
    code: 'TSM-445NEG9R.28',
    watts: 445,
    long: 1762,
    short: 1134,
    thick: 30,
    kg: 21,
    efficiency: 22.3,
    frame: '#151617',
    cells: '#1a2333',
    url: 'https://www.trinasolar.com/au/',
    brandUrl: 'https://www.trinasolar.com/au/',
  },
  sunpower_maxeon_7_445: {
    brand: 'SunPower',
    model: 'Maxeon 7 445 W',
    code: 'SPR-MAX7-445',
    watts: 445,
    long: 1787,
    short: 1035,
    thick: 40,
    kg: 20.7,
    efficiency: 24.1,
    frame: '#121314',
    cells: '#101318',
    url: 'https://www.sunpowerglobal.com/au',
    brandUrl: 'https://www.sunpowerglobal.com/au',
  },
};
export const SOLAR_DEFAULTS = { panel: 'jinko_tiger_neo_440', rows: 2, cols: 5, orient: 'portrait' } as Record<string, string | number>;
/** Gap between panels on the rails (mm). */
export const SOLAR_GAP = 20;
/** Plan size of an array: [across, up the roof] in mm. */
export function solarArraySize(o: Record<string, string | number>): [number, number] {
  const p = SOLAR_PANELS[String(o.panel)] ?? SOLAR_PANELS.jinko_tiger_neo_440;
  const portrait = o.orient !== 'landscape';
  const pw = portrait ? p.short : p.long;
  const pl = portrait ? p.long : p.short;
  const cols = Number(o.cols) || 1;
  const rows = Number(o.rows) || 1;
  return [cols * pw + (cols - 1) * SOLAR_GAP, rows * pl + (rows - 1) * SOLAR_GAP];
}

// Every Hume Doors catalogue model (entrance and internal), grouped by range. Sidelites appear with their doors.
for (const mdl of HUME_MODELS) {
  if (mdl.sideliteOnly) continue;
  const lites = mdl.els.filter((e) => e[0] === 'g').length;
  const panels = mdl.els.filter((e) => e[0] === 'p').length;
  const grooved = mdl.els.some((e) => e[0] === 'v' || e[0] === 'h' || e[0] === 'r');
  const desc = [
    lites ? `${lites} glass ${lites === 1 ? 'lite' : 'lites'}` : '',
    panels ? `${panels} ${panels === 1 ? 'panel' : 'panels'}` : '',
    grooved && !lites && !panels ? 'routed / grooved' : '',
    !lites && !panels && !grooved ? 'plain' : '',
  ]
    .filter(Boolean)
    .join(', ');
  DOOR_DESIGNS[humeKey(mdl.code)] = {
    name: `${mdl.code} — ${desc}`,
    group: `Hume ${mdl.use === 'entrance' ? 'entrance' : 'internal'} — ${mdl.range}`,
    models: `Hume ${mdl.range} ${mdl.code}`,
    layout: humeKey(mdl.code),
    glass: !!mdl.glass,
    color: mdl.color,
    use: mdl.use,
    glassTypes: mdl.use === 'entrance' ? ['translucent', 'clear', 'cathedral', 'grey'] : ['clear', 'translucent'],
    ...(mdl.sidelite ? { sidelight: humeKey(mdl.sidelite), sidelightWidths: [HUME_MODELS.find((x) => x.code === mdl.sidelite)?.sideliteWidth ?? mdl.sideliteWidth ?? 400] } : {}),
    note: [mdl.note, mdl.sidelite ? `Matching sidelite: ${mdl.sidelite}.` : '', 'Drawn from Hume’s July 2022 catalogue; check exact details, sizes and options with Hume.']
      .filter(Boolean)
      .join(' '),
  };
}
