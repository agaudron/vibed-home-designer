import { add, clampOpeningOffset, dist, dot, mul, norm, pointInPolygon, polygonArea, rad, rot, sub, uid, v, wallFrame } from './geometry';
import { exteriorSides } from './facade';
import type { Block, BlockSide, Design, FenceType, Garden, GardenArea, GardenAreaKind, GardenItem, Opening, Vec } from './types';

/**
 * Garden designer: the block of land and its fences, the yards round the house, garden areas (beds, lawns,
 * driveways, paths, paving, gravel, veggie patches) and what's planted or placed in them. Everything here is
 * plain data and geometry; gardenActions.ts changes the design.
 */

// ---------- surfaces ----------

export type SurfaceTexture = 'grass' | 'turf' | 'mulch' | 'soil' | 'gravel' | 'concrete' | 'aggregate' | 'pavers' | 'brick' | 'asphalt';

export interface Surface {
  name: string;
  color: string;
  tex: SurfaceTexture;
  /** Pavers: size of each paver (mm), length × width. */
  tile?: [number, number];
}

export const SURFACES: Record<string, Surface> = {
  buffalo: { name: 'Soft-leaf buffalo', color: '#5f8f3a', tex: 'grass' },
  kikuyu: { name: 'Kikuyu', color: '#6f9b3c', tex: 'grass' },
  couch: { name: 'Couch', color: '#76a146', tex: 'grass' },
  zoysia: { name: 'Zoysia', color: '#5a873a', tex: 'grass' },
  synthetic: { name: 'Synthetic turf', color: '#4d8f3a', tex: 'turf' },
  pine_bark: { name: 'Pine bark mulch', color: '#6a4a32', tex: 'mulch' },
  hardwood_chip: { name: 'Hardwood chip mulch', color: '#80603f', tex: 'mulch' },
  forest_blend: { name: 'Forest blend mulch', color: '#4f3a2a', tex: 'mulch' },
  sugar_cane: { name: 'Sugar cane mulch', color: '#c8b27a', tex: 'mulch' },
  pea_straw: { name: 'Pea straw', color: '#cdb37a', tex: 'mulch' },
  garden_soil: { name: 'Garden soil', color: '#4e3a2a', tex: 'soil' },
  bare: { name: 'Bare earth', color: '#8a7058', tex: 'soil' },
  concrete: { name: 'Plain concrete', color: '#bdb9b1', tex: 'concrete' },
  exposed: { name: 'Exposed aggregate', color: '#a59b8c', tex: 'aggregate' },
  charcoal: { name: 'Charcoal concrete', color: '#6e6b67', tex: 'concrete' },
  asphalt: { name: 'Asphalt', color: '#4a4a4b', tex: 'asphalt' },
  brick_pavers: { name: 'Brick pavers', color: '#9c5a42', tex: 'brick', tile: [230, 115] },
  concrete_pavers: { name: 'Concrete pavers', color: '#bcb5a8', tex: 'pavers', tile: [400, 400] },
  bluestone: { name: 'Bluestone', color: '#5f646b', tex: 'pavers', tile: [600, 300] },
  travertine: { name: 'Travertine', color: '#e2d6c0', tex: 'pavers', tile: [610, 406] },
  sandstone: { name: 'Sandstone', color: '#d6be94', tex: 'pavers', tile: [600, 600] },
  porcelain: { name: 'Porcelain pavers', color: '#cfccc5', tex: 'pavers', tile: [600, 600] },
  granite_dg: { name: 'Decomposed granite', color: '#c7b089', tex: 'gravel' },
  river_pebble: { name: 'River pebbles', color: '#a49d92', tex: 'gravel' },
  white_pebble: { name: 'White pebbles', color: '#e4e0d6', tex: 'gravel' },
  scoria: { name: 'Red scoria', color: '#7c3d2d', tex: 'gravel' },
  blue_metal: { name: 'Blue metal', color: '#7b7f84', tex: 'gravel' },
};

/** Surfaces water soaks into (for the permeable area estimate). */
export const isPermeable = (s: Surface) => s.tex !== 'concrete' && s.tex !== 'aggregate' && s.tex !== 'asphalt' && s.tex !== 'pavers' && s.tex !== 'brick';

export interface AreaKindSpec {
  name: string;
  surfaces: string[];
  surface: string;
  /** New areas of this kind are drawn curved. */
  curved: boolean;
  /** How far the surface stands above the ground (mm), so it sits on top of the yard. */
  rise: number;
  /** Can have edging. */
  edging: boolean;
  /** Depth used for the quantities (mm): mulch, gravel, concrete slab… */
  depth?: number;
  icon: string;
}

export const AREA_KINDS: Record<GardenAreaKind, AreaKindSpec> = {
  yard: { name: 'Yard', surfaces: ['buffalo', 'kikuyu', 'couch', 'zoysia', 'synthetic', 'bare', 'granite_dg'], surface: 'buffalo', curved: false, rise: 0, edging: false, icon: '▢' },
  lawn: { name: 'Lawn', surfaces: ['buffalo', 'kikuyu', 'couch', 'zoysia', 'synthetic'], surface: 'buffalo', curved: true, rise: 15, edging: true, icon: '◍' },
  bed: { name: 'Garden bed', surfaces: ['pine_bark', 'hardwood_chip', 'forest_blend', 'sugar_cane', 'river_pebble', 'garden_soil'], surface: 'pine_bark', curved: true, rise: 45, edging: true, depth: 75, icon: '❀' },
  veggie: { name: 'Veggie patch', surfaces: ['garden_soil', 'pea_straw', 'sugar_cane'], surface: 'garden_soil', curved: false, rise: 55, edging: true, depth: 75, icon: '🥕' },
  driveway: { name: 'Driveway', surfaces: ['exposed', 'concrete', 'charcoal', 'asphalt', 'brick_pavers', 'concrete_pavers', 'granite_dg'], surface: 'exposed', curved: false, rise: 20, edging: false, depth: 100, icon: '🚗' },
  path: { name: 'Path', surfaces: ['concrete_pavers', 'brick_pavers', 'bluestone', 'sandstone', 'concrete', 'exposed', 'granite_dg', 'river_pebble'], surface: 'concrete_pavers', curved: false, rise: 25, edging: false, depth: 100, icon: '┅' },
  paving: { name: 'Paving', surfaces: ['travertine', 'bluestone', 'sandstone', 'porcelain', 'concrete_pavers', 'brick_pavers', 'exposed'], surface: 'travertine', curved: false, rise: 25, edging: false, icon: '▦' },
  gravel: { name: 'Gravel / pebbles', surfaces: ['river_pebble', 'granite_dg', 'white_pebble', 'scoria', 'blue_metal'], surface: 'river_pebble', curved: true, rise: 20, edging: true, depth: 50, icon: '⁘' },
};

export const surfaceOf = (a: Pick<GardenArea, 'kind' | 'surface'>): Surface => SURFACES[a.surface ?? ''] ?? SURFACES[AREA_KINDS[a.kind].surface];

export const EDGINGS: Record<string, { name: string; color: string; width: number; height: number }> = {
  steel: { name: 'Steel edging (weathered)', color: '#7a4a2c', width: 12, height: 100 },
  steel_black: { name: 'Steel edging (black)', color: '#2f3031', width: 12, height: 100 },
  brick: { name: 'Brick edging', color: '#9c5a42', width: 110, height: 60 },
  sleeper: { name: 'Timber sleeper', color: '#7a5c43', width: 75, height: 150 },
  mowing_strip: { name: 'Concrete mowing strip', color: '#bdb9b1', width: 150, height: 30 },
  stone: { name: 'Natural stone', color: '#a8a095', width: 150, height: 120 },
};

// ---------- fences ----------

export const FENCES: Record<FenceType, { name: string; height: number; color: string; colorbond?: boolean }> = {
  none: { name: 'No fence', height: 0, color: '#000000' },
  colorbond: { name: 'COLORBOND® steel fence', height: 1800, color: '#4b4c46', colorbond: true },
  paling: { name: 'Timber paling fence', height: 1800, color: '#9b7a58' },
  slat: { name: 'Horizontal slat screen', height: 1800, color: '#6f5440' },
  picket: { name: 'Picket fence', height: 1000, color: '#f4f2ec' },
  pool: { name: 'Glass pool fence', height: 1200, color: '#bcd6d9' },
  rendered: { name: 'Rendered front wall', height: 1200, color: '#e4e0d6' },
};

export const fenceOf = (s: BlockSide) => ({ ...FENCES[s.fence], height: s.height ?? FENCES[s.fence].height, color: s.color ?? FENCES[s.fence].color });

// ---------- plants and features ----------

export type GardenGroup = 'native' | 'tree' | 'veg' | 'raised' | 'letterbox' | 'feature';

export const GARDEN_GROUPS: { id: GardenGroup; name: string }[] = [
  { id: 'native', name: 'Native plants' },
  { id: 'tree', name: 'Trees' },
  { id: 'veg', name: 'Vegetables & herbs' },
  { id: 'raised', name: 'Raised garden beds' },
  { id: 'letterbox', name: 'Letterboxes' },
  { id: 'feature', name: 'Landscaping' },
];

/** How a plant is drawn. */
export type PlantForm =
  | 'shrub'
  | 'hedge'
  | 'grass'
  | 'strappy'
  | 'groundcover'
  | 'climber'
  | 'tree'
  | 'eucalypt'
  | 'palm'
  | 'columnar'
  | 'citrus'
  | 'veg'
  | 'tomato'
  | 'trellis';

export interface GardenSpec {
  id: string;
  name: string;
  group: GardenGroup;
  botanical?: string;
  /** Plants: fully grown spread and height. Features: their usual size. */
  width: number;
  depth: number;
  height: number;
  /** Foliage, or the feature's main colour. */
  color: string;
  /** Flowers or fruit. */
  flower?: string;
  form?: PlantForm;
  native?: boolean;
  note?: string;
  /** Round footprint (width = diameter). */
  round?: boolean;
  options?: Record<string, string | number>;
}

const plant = (id: string, name: string, group: GardenGroup, botanical: string, form: PlantForm, w: number, h: number, color: string, flower: string | undefined, note: string, native = group === 'native'): GardenSpec => ({
  id,
  name,
  group,
  botanical,
  form,
  width: w,
  depth: form === 'hedge' ? Math.round(w * 0.8) : w,
  height: h,
  color,
  flower,
  note,
  native,
  round: form !== 'hedge',
});

export const GARDEN_CATALOG: GardenSpec[] = [
  // Australian natives
  plant('kangaroo_paw', 'Kangaroo paw', 'native', 'Anigozanthos cv.', 'strappy', 600, 900, '#5f7f4a', '#d9452b', 'Full sun, well-drained soil. Flowers spring to summer.'),
  plant('grevillea', 'Grevillea', 'native', "Grevillea 'Robyn Gordon'", 'shrub', 1500, 1200, '#6d7f55', '#d23a3a', 'Full sun. Flowers most of the year; birds love it.'),
  plant('lomandra', 'Lomandra', 'native', "Lomandra longifolia 'Tanika'", 'grass', 800, 700, '#6f8f4f', undefined, 'Tough, drought-hardy clumping grass. Sun or part shade.'),
  plant('dianella', 'Dianella (flax lily)', 'native', "Dianella revoluta 'Little Rev'", 'strappy', 500, 500, '#6f8c86', '#4b4fb5', 'Blue-grey strappy leaves. Great for borders and mass planting.'),
  plant('westringia', 'Coastal rosemary', 'native', 'Westringia fruticosa', 'shrub', 1500, 1500, '#8a9c80', '#f2f2f5', 'Clips into a low hedge or ball. Coastal and drought tolerant.'),
  plant('bottlebrush', 'Bottlebrush', 'native', "Callistemon 'Little John'", 'shrub', 1000, 1000, '#4f6b4a', '#c2232e', 'Compact, red brushes in spring. Sun.'),
  plant('banksia', 'Banksia', 'native', "Banksia spinulosa 'Birthday Candles'", 'shrub', 1000, 600, '#556b45', '#e09a2a', 'Dwarf banksia with golden candles in autumn–winter.'),
  plant('correa', 'Native fuchsia', 'native', 'Correa reflexa', 'shrub', 1000, 800, '#6f8662', '#e0748a', 'Bell flowers in winter. Part shade.'),
  plant('waratah', 'Waratah', 'native', 'Telopea speciosissima', 'shrub', 1500, 2000, '#4a6440', '#c8102e', 'NSW floral emblem. Needs excellent drainage.'),
  plant('lilly_pilly', 'Lilly pilly hedge', 'native', "Syzygium australe 'Resilience'", 'hedge', 1000, 2500, '#3f6b3a', '#b4473a', 'Dense screening hedge with red new growth. Plant about 1 m apart.'),
  plant('gymea_lily', 'Gymea lily', 'native', 'Doryanthes excelsa', 'strappy', 2000, 2000, '#5b7a45', '#c0262c', 'Huge rosette; flower spike can reach 4 m.'),
  plant('poa', 'Tussock grass', 'native', 'Poa labillardierei', 'grass', 800, 800, '#8a9a6b', undefined, 'Soft blue-green tussock. Very hardy.'),
  plant('hardenbergia', 'Purple coral pea', 'native', 'Hardenbergia violacea', 'climber', 1500, 2000, '#4b6b3a', '#6a3fa0', 'Climber for fences and trellis; purple flowers in late winter.'),
  plant('myoporum', 'Creeping boobialla', 'native', 'Myoporum parvifolium', 'groundcover', 1500, 150, '#5c8a3e', '#ffffff', 'Fast groundcover that smothers weeds.'),
  plant('pigface', 'Pigface', 'native', 'Carpobrotus glaucescens', 'groundcover', 1500, 150, '#6f9a5a', '#d84aa8', 'Succulent groundcover for sandy, sunny spots.'),
  plant('native_violet', 'Native violet', 'native', 'Viola hederacea', 'groundcover', 500, 100, '#4f7a3f', '#8a6ad0', 'Groundcover for shady, moist spots and between pavers.'),
  plant('brachyscome', 'Native daisy', 'native', 'Brachyscome multifida', 'groundcover', 500, 300, '#6b8f4f', '#b49ae0', 'Mauve daisies most of the year.'),

  // Trees
  plant('lemon_gum', 'Dwarf lemon-scented gum', 'tree', "Corymbia citriodora 'Scentuous'", 'eucalypt', 4000, 7000, '#7d9468', undefined, 'Native. Compact gum (about 6–8 m) with smooth white bark.', true),
  plant('water_gum', 'Water gum', 'tree', "Tristaniopsis laurina 'Luscious'", 'tree', 4000, 6000, '#3f6b3a', '#e8d34a', 'Native. Dense shade tree; non-invasive roots.', true),
  plant('tuckeroo', 'Tuckeroo', 'tree', 'Cupaniopsis anacardioides', 'tree', 5000, 7000, '#456b3e', undefined, 'Native street and shade tree. Coastal tolerant.', true),
  plant('native_frangipani', 'Native frangipani', 'tree', 'Hymenosporum flavum', 'columnar', 3000, 7000, '#4f7040', '#f0d060', 'Native. Narrow, with perfumed yellow flowers in spring.', true),
  plant('coast_banksia', 'Coast banksia', 'tree', 'Banksia integrifolia', 'tree', 4000, 8000, '#6f8466', '#e6d27a', 'Native. Silvery leaves; flowers feed birds in winter.', true),
  plant('weeping_bottlebrush', 'Weeping bottlebrush', 'tree', "Callistemon 'Kings Park Special'", 'tree', 3000, 4000, '#4f6b4a', '#c2232e', 'Native. Small tree covered in red brushes.', true),
  plant('bangalow_palm', 'Bangalow palm', 'tree', 'Archontophoenix cunninghamiana', 'palm', 3000, 8000, '#4f7a3a', undefined, 'Native palm for sheltered, moist spots.', true),
  plant('jacaranda', 'Jacaranda', 'tree', 'Jacaranda mimosifolia', 'tree', 8000, 10000, '#5e8a45', '#8f7ad6', 'Purple flowers in late spring. Needs room.', false),
  plant('crepe_myrtle', 'Crepe myrtle', 'tree', 'Lagerstroemia indica', 'tree', 3000, 4000, '#5b7d43', '#d35a9a', 'Summer flowers, autumn colour, smooth trunk.', false),
  plant('japanese_maple', 'Japanese maple', 'tree', 'Acer palmatum', 'tree', 3000, 3000, '#a63a2a', undefined, 'Feature tree for part shade; red foliage.', false),
  plant('ornamental_pear', 'Ornamental pear', 'tree', "Pyrus calleryana 'Capital'", 'columnar', 1500, 8000, '#4e7a3a', '#ffffff', 'Narrow and upright: good for screening along a fence.', false),
  plant('magnolia', 'Magnolia', 'tree', "Magnolia grandiflora 'Little Gem'", 'columnar', 2500, 5000, '#2f5a33', '#f7f3ea', 'Glossy evergreen with big white flowers.', false),
  plant('lemon', 'Lemon tree', 'tree', "Citrus limon 'Eureka'", 'citrus', 3000, 3500, '#3d6b35', '#f2d23a', 'Fruits most of the year. Full sun, feed regularly.', false),
  plant('lime', 'Lime tree', 'tree', "Citrus × latifolia 'Tahitian'", 'citrus', 2500, 3000, '#3a6a33', '#8bc34a', 'Full sun, sheltered from frost.', false),
  plant('olive', 'Olive tree', 'tree', 'Olea europaea', 'tree', 4000, 5000, '#8a957a', undefined, 'Silvery, drought hardy, Mediterranean look.', false),

  // Vegetables and herbs (the size of one plant, so they space themselves)
  plant('tomato', 'Tomato (staked)', 'veg', 'Solanum lycopersicum', 'tomato', 500, 1500, '#3f7a35', '#d23a2a', 'Plant 50–60 cm apart in full sun; stake or cage.', false),
  plant('lettuce', 'Lettuce', 'veg', 'Lactuca sativa', 'veg', 300, 250, '#8cc152', undefined, 'Plant 25–30 cm apart. Quick to grow.', false),
  plant('silverbeet', 'Silverbeet', 'veg', 'Beta vulgaris var. cicla', 'veg', 400, 500, '#3f7a33', '#e04040', 'Plant 30–40 cm apart. Pick leaves as you need them.', false),
  plant('capsicum', 'Capsicum', 'veg', 'Capsicum annuum', 'veg', 450, 700, '#3f7034', '#c62828', 'Plant 45 cm apart, warm months.', false),
  plant('zucchini', 'Zucchini', 'veg', 'Cucurbita pepo', 'veg', 1000, 600, '#3d6b30', '#f0c020', 'Sprawling: allow about 1 m each.', false),
  plant('beans', 'Climbing beans (trellis)', 'veg', 'Phaseolus vulgaris', 'trellis', 1200, 1800, '#4f8a3a', '#f4f4f0', 'Sow along a trellis, 10 cm apart.', false),
  plant('strawberry', 'Strawberries', 'veg', 'Fragaria × ananassa', 'veg', 300, 200, '#4f8a3a', '#d9302c', 'Plant 30 cm apart; great in raised beds.', false),
  plant('broccoli', 'Broccoli', 'veg', 'Brassica oleracea', 'veg', 600, 700, '#3f6b4f', undefined, 'Cool season. Plant 50–60 cm apart.', false),
  plant('carrots', 'Carrots (row)', 'veg', 'Daucus carota', 'veg', 300, 300, '#6aa84f', undefined, 'Sow in rows 20 cm apart; thin to 5 cm.', false),
  plant('basil', 'Basil', 'veg', 'Ocimum basilicum', 'veg', 300, 400, '#4f9a3a', undefined, 'Warm season herb; plant beside tomatoes.', false),
  plant('parsley', 'Parsley', 'veg', 'Petroselinum crispum', 'veg', 300, 300, '#3f8a35', undefined, 'Easy herb for sun or part shade.', false),
  plant('rosemary', 'Rosemary', 'veg', 'Salvia rosmarinus', 'shrub', 800, 900, '#6f8a6f', '#8fa0e0', 'Hardy herb shrub. Full sun.', false),

  // Raised beds
  {
    id: 'raised_timber',
    name: 'Timber raised bed',
    group: 'raised',
    width: 2400,
    depth: 1200,
    height: 400,
    color: '#7d5b40',
    note: 'Sleepers stacked 200 mm a course. Line treated pine with plastic if growing food.',
    options: { timber: 'hardwood', thick: 75, crop: 'mixed' },
  },
  {
    id: 'raised_birdies',
    name: 'Birdies raised bed',
    group: 'raised',
    width: 1500,
    depth: 800,
    height: 430,
    color: '#7c846a',
    note: 'Corrugated steel raised bed modelled on the Birdies range (rectangular or round). Check birdies.com.au for current sizes and colours.',
    options: { shape: 'rect', crop: 'mixed' },
  },

  // Letterboxes
  { id: 'letterbox_pier', name: 'Brick pier letterbox', group: 'letterbox', width: 450, depth: 450, height: 1150, color: '#9c4f3a', note: 'Masonry pier with the letterbox built in.', options: { finish: 'brick' } },
  { id: 'letterbox_post', name: 'Post-mounted letterbox', group: 'letterbox', width: 380, depth: 250, height: 1150, color: '#323233', note: 'Steel letterbox on a post.' },
  { id: 'letterbox_pillar', name: 'Pillar letterbox', group: 'letterbox', width: 300, depth: 300, height: 1050, color: '#4b4c46', note: 'Freestanding powder-coated steel pillar.' },

  // Landscaping features
  { id: 'stepping_stone', name: 'Stepping stone', group: 'feature', width: 500, depth: 500, height: 40, color: '#b9b2a6', round: true, note: 'Place a run of them for a path through a lawn or bed.' },
  { id: 'boulder', name: 'Feature boulder', group: 'feature', width: 900, depth: 700, height: 550, color: '#9a948a' },
  { id: 'retaining_wall', name: 'Retaining wall', group: 'feature', width: 3000, depth: 200, height: 600, color: '#6b5a48', options: { edge: 'sleeper' }, note: 'Walls over about 600 mm usually need engineering and council approval.' },
  { id: 'pot', name: 'Pot with shrub', group: 'feature', width: 600, depth: 600, height: 600, color: '#c9b79c', round: true },
  { id: 'birdbath', name: 'Bird bath', group: 'feature', width: 550, depth: 550, height: 750, color: '#c9c3b8', round: true },
  { id: 'fire_pit', name: 'Fire pit', group: 'feature', width: 900, depth: 900, height: 350, color: '#3a3a3a', round: true },
  { id: 'bench', name: 'Garden bench', group: 'feature', width: 1500, depth: 550, height: 800, color: '#8a6a4c' },
  { id: 'tank_slim', name: 'Slimline water tank', group: 'feature', width: 2400, depth: 520, height: 1800, color: '#4b4c46', note: 'About 2,000 L.' },
  { id: 'tank_round', name: 'Round water tank', group: 'feature', width: 1800, depth: 1800, height: 2000, color: '#4b4c46', round: true, note: 'About 5,000 L.' },
  { id: 'clothesline', name: 'Rotary clothesline', group: 'feature', width: 3000, depth: 3000, height: 2200, color: '#b8bcbf', round: true },
  { id: 'shed', name: 'Garden shed', group: 'feature', width: 2300, depth: 1500, height: 2000, color: '#7c846a' },
  { id: 'compost', name: 'Compost bin', group: 'feature', width: 700, depth: 700, height: 900, color: '#2f3b2f', round: true },
];

export const GARDEN_MAP: Record<string, GardenSpec> = Object.fromEntries(GARDEN_CATALOG.map((s) => [s.id, s]));
const FALLBACK: GardenSpec = { id: 'boulder', name: 'Garden feature', group: 'feature', width: 600, depth: 600, height: 600, color: '#9a948a' };
export const specOf = (it: Pick<GardenItem, 'type'>) => GARDEN_MAP[it.type] ?? FALLBACK;
export const isPlant = (s: GardenSpec) => !!s.form;

/** Raised bed timbers. */
export const BED_TIMBERS: Record<string, { name: string; color: string }> = {
  hardwood: { name: 'Hardwood sleepers', color: '#7d5b40' },
  pine: { name: 'Treated pine sleepers', color: '#b39a6a' },
  cypress: { name: 'Cypress', color: '#c7a57a' },
  recycled: { name: 'Recycled hardwood', color: '#6a5544' },
  black: { name: 'Painted black', color: '#2c2c2c' },
};

/** Birdies-style corrugated steel: zinc-aluminium, plus COLORBOND®-style colours (see COLORBOND in catalog.ts). */
export const ZINCALUME = '#c9cbcc';
export const BIRDIES_RECT: [number, number][] = [
  [1200, 800],
  [1500, 800],
  [1800, 800],
  [2000, 1000],
  [2400, 1000],
];
export const BIRDIES_ROUND = [900, 1200, 1500];
export const BIRDIES_HEIGHTS = [{ h: 430, name: 'Original' }, { h: 730, name: 'Tall' }];

/** What's growing in a raised bed. */
export const CROPS: Record<string, { name: string; plants: string[] }> = {
  none: { name: 'Soil only', plants: [] },
  mixed: { name: 'Mixed vegetables', plants: ['lettuce', 'silverbeet', 'capsicum', 'basil', 'broccoli', 'parsley'] },
  tomatoes: { name: 'Tomatoes & basil', plants: ['tomato', 'basil'] },
  salad: { name: 'Salad greens', plants: ['lettuce', 'lettuce', 'parsley'] },
  herbs: { name: 'Herbs', plants: ['basil', 'parsley', 'rosemary'] },
  strawberries: { name: 'Strawberries', plants: ['strawberry'] },
  flowers: { name: 'Native flowers', plants: ['brachyscome', 'kangaroo_paw', 'dianella'] },
};

/** Where each plant in a raised bed goes (bed-local mm, centred) and which plant it is. */
export function cropLayout(it: GardenItem): { x: number; y: number; spec: GardenSpec }[] {
  const crop = CROPS[String(it.options?.crop ?? 'none')] ?? CROPS.none;
  if (!crop.plants.length) return [];
  const round = it.type === 'raised_birdies' && it.options?.shape === 'round';
  const pad = 120;
  const iw = it.width - 2 * pad;
  const id = it.depth - 2 * pad;
  const step = crop.plants.some((p) => GARDEN_MAP[p]?.width >= 500) ? 450 : 320;
  const nx = Math.max(1, Math.floor(iw / step) + 1);
  const ny = Math.max(1, Math.floor(id / step) + 1);
  const out: { x: number; y: number; spec: GardenSpec }[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x = nx === 1 ? 0 : -iw / 2 + (i * iw) / (nx - 1);
      const y = ny === 1 ? 0 : -id / 2 + (j * id) / (ny - 1);
      if (round && Math.hypot(x / (iw / 2 || 1), y / (id / 2 || 1)) > 1.02) continue;
      out.push({ x, y, spec: GARDEN_MAP[crop.plants[(i + j * nx) % crop.plants.length]] });
    }
  return out;
}

/** Litres of soil to fill a raised bed (inside its walls). */
export function bedSoilLitres(it: GardenItem): number {
  const t = it.type === 'raised_timber' ? Number(it.options?.thick ?? 75) : 25;
  const fill = Math.max(0, it.height - 50);
  if (it.type === 'raised_birdies' && it.options?.shape === 'round') return (Math.PI * ((it.width - 2 * t) / 2) ** 2 * fill) / 1e6;
  return (Math.max(0, it.width - 2 * t) * Math.max(0, it.depth - 2 * t) * fill) / 1e6;
}

// ---------- the garden on a design ----------

const EMPTY: Garden = { block: null, areas: [], items: [] };
export const gardenOf = (d: Design): Garden => d.garden ?? EMPTY;
/** How big plants are drawn (0.3 = just planted, 1 = fully grown). */
export const growthOf = (g: Garden) => Math.min(1, Math.max(0.2, g.growth ?? 1));
/** Size a plant is drawn at: its footprint and height scaled by the garden's growth setting. */
export const shownScale = (g: Garden, it: GardenItem) => (isPlant(specOf(it)) ? growthOf(g) : 1);

export function newGardenItem(type: string, x: number, y: number): GardenItem {
  const s = GARDEN_MAP[type] ?? FALLBACK;
  return {
    id: uid('g'),
    type: s.id,
    x: Math.round(x),
    y: Math.round(y),
    rotation: 0,
    width: s.width,
    depth: s.depth,
    height: s.height,
    ...(s.options ? { options: { ...s.options } } : {}),
  };
}

export function nextAreaName(g: Garden, kind: GardenAreaKind): string {
  const base = AREA_KINDS[kind].name;
  const used = new Set(g.areas.map((a) => a.name));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export function newArea(g: Garden, kind: GardenAreaKind, points: Vec[], extra: Partial<GardenArea> = {}): GardenArea {
  return { id: uid('ga'), kind, name: nextAreaName(g, kind), points: points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })), curved: AREA_KINDS[kind].curved, ...extra };
}

// ---------- outlines ----------

function signedArea(pts: Vec[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * A closed curve through the points (Catmull-Rom). At a sharp corner the curve leaves along the straight line to
 * the next point, so a run between two sharp corners stays straight.
 */
export function smoothOutline(pts: Vec[], sharp: number[] = []): Vec[] {
  const n = pts.length;
  if (n < 3) return pts;
  const isSharp = new Set(sharp);
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const s1 = isSharp.has(i);
    const s2 = isSharp.has((i + 1) % n);
    out.push(p1);
    if (s1 && s2) continue;
    const p0 = s1 ? sub(mul(p1, 2), p2) : pts[(i - 1 + n) % n];
    const p3 = s2 ? sub(mul(p2, 2), p1) : pts[(i + 2) % n];
    const steps = Math.max(3, Math.min(16, Math.round(dist(p1, p2) / 250)));
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, b: number, cc: number, d: number) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      out.push(v(c(p0.x, p1.x, p2.x, p3.x), c(p0.y, p1.y, p2.y, p3.y)));
    }
  }
  return out;
}

/** The outline an area is drawn with: its points, or a smooth curve through them. */
export const outlineOf = (a: Pick<GardenArea, 'points' | 'curved' | 'sharp'>): Vec[] => (a.curved ? smoothOutline(a.points, a.sharp) : a.points);
export const areaOf = (a: Pick<GardenArea, 'points' | 'curved' | 'sharp'>) => polygonArea(outlineOf(a));
export function perimeterOf(pts: Vec[]) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length]);
  return s;
}

/** Outward normal of side i of a polygon (whichever way round its points go). */
export function outwardNormal(pts: Vec[], i: number): Vec {
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  const e = norm(sub(b, a));
  return signedArea(pts) > 0 ? v(e.y, -e.x) : v(-e.y, e.x);
}

/** The part of a polygon on the side of a line where dot(p, n) >= c (Sutherland–Hodgman). */
export function clipHalfPlane(poly: Vec[], n: Vec, c: number): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = dot(p, n) - c;
    const dq = dot(q, n) - c;
    if (dp >= 0) out.push(p);
    if ((dp >= 0) !== (dq >= 0)) out.push(add(p, mul(sub(q, p), dp / (dp - dq))));
  }
  // Drop repeated points.
  return out.filter((p, i) => dist(p, out[(i + 1) % out.length]) > 1);
}

/** Distance along a ray to where it first leaves (or meets) a polygon's boundary; null if it never does. */
export function rayToBoundary(p: Vec, dir: Vec, poly: Vec[]): number | null {
  let best: number | null = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const e = sub(poly[(i + 1) % poly.length], a);
    const den = dir.x * e.y - dir.y * e.x;
    if (Math.abs(den) < 1e-9) continue;
    const ap = sub(a, p);
    const t = (ap.x * e.y - ap.y * e.x) / den;
    const s = (ap.x * dir.y - ap.y * dir.x) / den;
    if (t > 1 && s >= 0 && s <= 1 && (best === null || t < best)) best = t;
  }
  return best;
}

// ---------- editing outlines ----------

/** Add a corner before `index` (sharp corners after it keep their place). */
export function insertPoint<T extends Pick<GardenArea, 'points' | 'sharp'>>(a: T, index: number, p: Vec): T {
  const points = [...a.points.slice(0, index), { x: Math.round(p.x), y: Math.round(p.y) }, ...a.points.slice(index)];
  return { ...a, points, ...(a.sharp ? { sharp: a.sharp.map((s) => (s >= index ? s + 1 : s)) } : {}) };
}

export function removePoint<T extends Pick<GardenArea, 'points' | 'sharp'>>(a: T, index: number): T {
  if (a.points.length <= 3) return a;
  const points = a.points.filter((_, i) => i !== index);
  return { ...a, points, ...(a.sharp ? { sharp: a.sharp.filter((s) => s !== index).map((s) => (s > index ? s - 1 : s)) } : {}) };
}

export function toggleSharp(a: GardenArea, index: number): GardenArea {
  const sharp = new Set(a.sharp ?? []);
  if (sharp.has(index)) sharp.delete(index);
  else sharp.add(index);
  return { ...a, sharp: [...sharp].sort((x, y) => x - y) };
}

/** Ready-made garden bed shapes (control points on a unit square, sharp corners, size). */
export const BED_SHAPES: { id: string; name: string; w: number; d: number; pts: [number, number][]; sharp: number[]; curved: boolean }[] = [
  { id: 'kidney', name: 'Kidney', w: 3200, d: 1800, curved: true, sharp: [], pts: [[-0.5, 0.05], [-0.35, -0.42], [0, -0.5], [0.38, -0.4], [0.5, 0], [0.32, 0.45], [0.05, 0.3], [-0.2, 0.42]] },
  { id: 'round', name: 'Round', w: 1800, d: 1800, curved: true, sharp: [], pts: circlePts(8) },
  { id: 'oval', name: 'Oval', w: 3000, d: 1600, curved: true, sharp: [], pts: circlePts(8) },
  { id: 'corner', name: 'Corner', w: 2500, d: 2500, curved: true, sharp: [0, 1, 4], pts: [[-0.5, -0.5], [0.5, -0.5], [0.366, 0], [0, 0.366], [-0.5, 0.5]] },
  { id: 'border', name: 'Wavy border', w: 5000, d: 1200, curved: true, sharp: [0, 1, 2, 6], pts: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.3], [0.25, 0.5], [0, 0.2], [-0.25, 0.5], [-0.5, 0.3]] },
  { id: 'rect', name: 'Rectangle', w: 2400, d: 1200, curved: false, sharp: [], pts: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] },
];

function circlePts(n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => [0.5 * Math.cos((i / n) * 2 * Math.PI), 0.5 * Math.sin((i / n) * 2 * Math.PI)] as [number, number]);
}

/** A ready-made shape centred on c. */
export function shapeAt(shapeId: string, c: Vec): Pick<GardenArea, 'points' | 'curved' | 'sharp'> {
  const s = BED_SHAPES.find((x) => x.id === shapeId) ?? BED_SHAPES[0];
  return {
    points: s.pts.map(([x, y]) => v(Math.round(c.x + x * s.w), Math.round(c.y + y * s.d))),
    curved: s.curved,
    ...(s.sharp.length ? { sharp: [...s.sharp] } : {}),
  };
}

// ---------- the block of land ----------

export const BLOCK_SHAPES: { id: string; name: string; hint: string }[] = [
  { id: 'rect', name: 'Rectangle', hint: 'A standard block' },
  { id: 'corner', name: 'Corner', hint: 'Corner block with a splayed (cut-off) corner on the street' },
  { id: 'battleaxe', name: 'Battle-axe', hint: 'Rear block reached by a driveway “handle” from the street' },
  { id: 'wedge', name: 'Wedge', hint: 'Cul-de-sac / pie-shaped block: narrow at the street, wide at the back' },
  { id: 'angled', name: 'Angled rear', hint: 'Rear boundary on an angle' },
  { id: 'irregular', name: 'Irregular', hint: 'Five-sided block with a kinked side boundary' },
];

/**
 * A block shape W wide (frontage) and D deep, in its own frame: x across the street frontage (centred), y going
 * back from the street (y = 0). Side 0 is always the street. `setback` is how far back the house goes.
 */
export function blockShape(shape: string, W: number, D: number): { pts: Vec[]; setback: number } {
  const h = W / 2;
  switch (shape) {
    case 'corner': {
      const s = Math.min(3000, W / 3, D / 3);
      return { pts: [v(-h, 0), v(h - s, 0), v(h, s), v(h, D), v(-h, D)], setback: 6000 };
    }
    case 'battleaxe': {
      const hw = Math.min(4000, W / 3);
      const dh = Math.round(D * 0.4);
      return { pts: [v(-h, 0), v(-h + hw, 0), v(-h + hw, dh), v(h, dh), v(h, D), v(-h, D)], setback: dh + 3000 };
    }
    case 'wedge':
      return { pts: [v(-h * 0.55, 0), v(h * 0.55, 0), v(h, D), v(-h, D)], setback: 7000 };
    case 'angled':
      return { pts: [v(-h, 0), v(h, 0), v(h, D - W * 0.2), v(-h, D + W * 0.15)], setback: 6000 };
    case 'irregular':
      return { pts: [v(-h, 0), v(h, 0), v(h + W * 0.1, D * 0.5), v(h - W * 0.05, D), v(-h, D)], setback: 6000 };
    default:
      return { pts: [v(-h, 0), v(h, 0), v(h, D), v(-h, D)], setback: 6000 };
  }
}

/** Corners of the house: walls and rooms (what the block and yards fit round). */
export function housePoints(d: Design): Vec[] {
  return [...d.walls.flatMap((w) => [w.start, w.end]), ...d.rooms.flatMap((r) => r.points)];
}

/** The direction the front of the house faces (out of the front wall); towards the bottom of the plan if unset. */
export function frontDirection(d: Design): Vec {
  const w = d.walls.find((x) => x.id === d.settings.frontWallId);
  if (w) {
    const sd = exteriorSides(d.walls).map.get(w.id);
    const f = wallFrame(w);
    if (sd?.pos !== sd?.neg) return mul(f.n, sd?.pos ? 1 : -1);
  }
  return v(0, 1);
}

/** A block of the given shape and size with the house sitting in it, set back from the street. */
export function blockAroundHouse(d: Design, shape: string, W: number, D: number): Block {
  const { pts, setback } = blockShape(shape, W, D);
  const n = frontDirection(d);
  const t = v(-n.y, n.x);
  const hp = housePoints(d);
  let centre = v(0, 0);
  let front = 0;
  if (hp.length) {
    const along = hp.map((p) => dot(p, t));
    const out = hp.map((p) => dot(p, n));
    const mid = (Math.min(...along) + Math.max(...along)) / 2;
    front = Math.max(...out);
    centre = add(mul(t, mid), mul(n, front));
  }
  // Street line: `setback` in front of the house, then back into the block.
  const origin = add(centre, mul(n, hp.length ? setback : 0));
  const world = pts.map((p) => add(add(origin, mul(t, -p.x)), mul(n, -p.y)));
  return {
    points: world.map((p) => v(Math.round(p.x), Math.round(p.y))),
    sides: world.map((_, i) => ({ fence: i === 0 ? 'none' : 'colorbond' })),
    street: 0,
  };
}

/** Rebuild the block with each side as given: keeps the fences on sides that still exist. */
export function withBlockPoints(b: Block, points: Vec[], insertedAt?: number, removedAt?: number): Block {
  let sides = b.sides;
  let street = b.street;
  if (insertedAt !== undefined) {
    // The new corner splits side insertedAt - 1 into two, both keeping its fence.
    const split = (insertedAt - 1 + b.points.length) % b.points.length;
    sides = [...sides.slice(0, split + 1), { ...sides[split] }, ...sides.slice(split + 1)];
    if (street > split) street++;
  } else if (removedAt !== undefined) {
    // The sides either side of the corner become one, keeping the first one's fence.
    sides = sides.filter((_, i) => i !== removedAt);
    if (removedAt === 0 && street === 0) street = points.length - 1;
    else if (street >= removedAt && street > 0) street--;
  }
  while (sides.length < points.length) sides = [...sides, { fence: 'none' }];
  return { points, sides: sides.slice(0, points.length), street: Math.min(street, points.length - 1) };
}

/** Is the whole house inside the block? */
export function houseFits(d: Design, b: Block): boolean {
  return housePoints(d).every((p) => pointInPolygon(p, b.points));
}

/** House footprint (mm²): inside the outside walls, walls included; or the rooms if the walls aren't closed. */
export function houseFootprint(d: Design): number {
  const sides = exteriorSides(d.walls);
  if (sides.enclosed && sides.inside.length) return sides.inside.reduce((s, r) => s + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
  return d.rooms.reduce((s, r) => s + polygonArea(r.points), 0);
}

/**
 * Front, back and side yards: the block cut up round the house. Front is between the house and the street, back is
 * behind it, and the side yards run down each side of the house (named as seen from the street).
 */
export function makeYards(d: Design, b: Block): Omit<GardenArea, 'id'>[] {
  const pts = b.points;
  const hp = housePoints(d);
  if (!hp.length) return [{ kind: 'yard', name: 'Yard', points: pts, zone: 'front' }];
  const n = outwardNormal(pts, b.street);
  const t = v(-n.y, n.x);
  const along = hp.map((p) => dot(p, t));
  const out = hp.map((p) => dot(p, n));
  const a0 = Math.min(...along);
  const a1 = Math.max(...along);
  const b0 = Math.min(...out);
  const b1 = Math.max(...out);
  const mid = clipHalfPlane(clipHalfPlane(pts, n, b0), mul(n, -1), -b1);
  const yards: Omit<GardenArea, 'id'>[] = [
    { kind: 'yard', name: 'Front yard', zone: 'front', points: clipHalfPlane(pts, n, b1) },
    { kind: 'yard', name: 'Back yard', zone: 'back', points: clipHalfPlane(pts, mul(n, -1), -b0) },
    { kind: 'yard', name: 'Side yard (left)', zone: 'side', points: clipHalfPlane(mid, t, a1) },
    { kind: 'yard', name: 'Side yard (right)', zone: 'side', points: clipHalfPlane(mid, mul(t, -1), -a0) },
  ];
  return yards
    .filter((y) => y.points.length >= 3 && polygonArea(y.points) > 0.5e6)
    .map((y) => ({ ...y, points: y.points.map((p) => v(Math.round(p.x), Math.round(p.y))) }));
}

/** An outside door or garage door, the way out of it, and where its wall's outside face is. */
function wayOut(d: Design, o: Opening) {
  const w = d.walls.find((x) => x.id === o.wallId);
  if (!w) return null;
  const sd = exteriorSides(d.walls).map.get(w.id);
  if (!sd || sd.pos === sd.neg) return null;
  const f = wallFrame(w);
  const n = mul(f.n, sd.pos ? 1 : -1);
  const c = add(w.start, mul(f.u, clampOpeningOffset(o, f.length)));
  return { start: add(c, mul(n, w.thickness / 2)), n, u: f.u };
}

/** A strip from a door out to the block boundary (or `fallback` long if there's no block). */
function stripFrom(d: Design, o: Opening, width: number, fallback: number): Vec[] | null {
  const way = wayOut(d, o);
  if (!way) return null;
  const b = gardenOf(d).block;
  const len = Math.min(40000, (b && rayToBoundary(way.start, way.n, b.points)) || fallback);
  const hw = mul(way.u, width / 2);
  const end = add(way.start, mul(way.n, len));
  return [sub(way.start, hw), add(way.start, hw), add(end, hw), sub(end, hw)];
}

/** A driveway from the garage door out to the street (or 6 m out with no block). */
export function drivewayFromGarage(d: Design): Vec[] | null {
  const g = d.openings.find((o) => o.kind === 'garage_door' && wayOut(d, o));
  return g ? stripFrom(d, g, g.width + 600, 6000) : null;
}

/** A path from the front door out to the street: the door on the front wall, else the outside door facing the street. */
export function pathFromFrontDoor(d: Design): Vec[] | null {
  const doors = d.openings.filter((o) => (o.kind === 'door' || o.kind === 'double_door') && wayOut(d, o));
  if (!doors.length) return null;
  const n = frontDirection(d);
  const front = doors.find((o) => o.wallId === d.settings.frontWallId) ?? [...doors].sort((a, b) => dot(wayOut(d, b)!.n, n) - dot(wayOut(d, a)!.n, n))[0];
  return stripFrom(d, front, 1200, 4000);
}

/**
 * Fence runs along the block's sides, with gaps where a driveway or path crosses the boundary (gates and the
 * driveway opening).
 */
export function fenceRuns(g: Garden): { side: number; a: Vec; b: Vec }[] {
  const b = g.block;
  if (!b) return [];
  const crossings = g.areas.filter((a) => a.kind === 'driveway' || a.kind === 'path').map(outlineOf);
  const out: { side: number; a: Vec; b: Vec }[] = [];
  b.points.forEach((p, i) => {
    if ((b.sides[i]?.fence ?? 'none') === 'none') return;
    const q = b.points[(i + 1) % b.points.length];
    const inward = mul(outwardNormal(b.points, i), -150);
    const L = dist(p, q);
    const steps = Math.max(1, Math.ceil(L / 100));
    let runStart: number | null = null;
    for (let k = 0; k <= steps; k++) {
      const at = add(p, mul(sub(q, p), k / steps));
      const open = crossings.some((c) => pointInPolygon(add(at, inward), c));
      if (!open && runStart === null) runStart = k;
      if ((open || k === steps) && runStart !== null) {
        const end = open ? k - 1 : k;
        if (end > runStart) out.push({ side: i, a: add(p, mul(sub(q, p), runStart / steps)), b: add(p, mul(sub(q, p), end / steps)) });
        runStart = null;
      }
    }
  });
  return out;
}

/** Where the street is: a strip just outside the street side of the block. */
export function streetStrip(b: Block): { a: Vec; b: Vec; n: Vec } | null {
  if (b.points.length < 3) return null;
  const a = b.points[b.street];
  const c = b.points[(b.street + 1) % b.points.length];
  return { a, b: c, n: outwardNormal(b.points, b.street) };
}

/** Turn an item's local point into plan coordinates. */
export const gardenLocal = (it: GardenItem, p: Vec): Vec => add(v(it.x, it.y), rot(p, rad(it.rotation)));

// ---------- loading saved files ----------

const num = (x: unknown, d: number) => (typeof x === 'number' && isFinite(x) ? x : d);
const vec = (p: any): Vec => ({ x: num(p?.x, 0), y: num(p?.y, 0) });
const AREA_KIND_SET = new Set(Object.keys(AREA_KINDS));
const FENCE_SET = new Set(Object.keys(FENCES));

/** Fill in defaults and drop malformed entries (older files have no garden). */
export function normaliseGarden(raw: unknown): Garden | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as any;
  const block: Block | null =
    r.block && Array.isArray(r.block.points) && r.block.points.length >= 3
      ? (() => {
          const points = r.block.points.map(vec);
          const sides = points.map((_: Vec, i: number) => {
            const s = Array.isArray(r.block.sides) ? r.block.sides[i] : null;
            return {
              fence: FENCE_SET.has(s?.fence) ? s.fence : 'none',
              ...(typeof s?.height === 'number' ? { height: s.height } : {}),
              ...(typeof s?.color === 'string' ? { color: s.color } : {}),
            } as BlockSide;
          });
          return { points, sides, street: Math.min(points.length - 1, Math.max(0, Math.round(num(r.block.street, 0)))) };
        })()
      : null;
  const areas: GardenArea[] = (Array.isArray(r.areas) ? r.areas : [])
    .filter((a: any) => a && AREA_KIND_SET.has(a.kind) && Array.isArray(a.points) && a.points.length >= 3)
    .map((a: any) => ({
      id: String(a.id),
      kind: a.kind,
      name: String(a.name ?? AREA_KINDS[a.kind as GardenAreaKind].name),
      points: a.points.map(vec),
      ...(a.curved ? { curved: true } : {}),
      ...(Array.isArray(a.sharp) ? { sharp: a.sharp.filter((n: unknown) => typeof n === 'number') } : {}),
      ...(typeof a.surface === 'string' ? { surface: a.surface } : {}),
      ...(a.zone === 'front' || a.zone === 'back' || a.zone === 'side' ? { zone: a.zone } : {}),
      ...(typeof a.edging === 'string' ? { edging: a.edging } : {}),
    }));
  const items: GardenItem[] = (Array.isArray(r.items) ? r.items : [])
    .filter((i: any) => i && typeof i.type === 'string')
    .map((i: any) => {
      const s = specOf(i);
      return {
        id: String(i.id),
        type: String(i.type),
        x: num(i.x, 0),
        y: num(i.y, 0),
        rotation: num(i.rotation, 0),
        width: num(i.width, s.width),
        depth: num(i.depth, s.depth),
        height: num(i.height, s.height),
        ...(typeof i.color === 'string' ? { color: i.color } : {}),
        ...(i.options && typeof i.options === 'object' ? { options: { ...i.options } } : {}),
      };
    });
  return { block, areas, items, ...(typeof r.growth === 'number' ? { growth: r.growth } : {}) };
}
