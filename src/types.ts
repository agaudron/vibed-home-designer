// All linear measurements are in millimetres. Plan coordinates: x to the right, y downwards.

export interface Vec {
  x: number;
  y: number;
}

export type FacadeFinish =
  | 'brick'
  | 'painted_brick'
  | 'render'
  | 'paint'
  | 'weatherboard'
  | 'vertical'
  | 'panel'
  | 'timber'
  | 'stone'
  | 'block'
  | 'colorbond';

/** External finish for the outside face of walls. */
export interface Facade {
  finish: FacadeFinish;
  color: string;
  /** Mortar / joint colour (brick and block). */
  mortar: string;
}

/** How an outside wall is built (sets its thickness and how it's drawn). */
export type Construction = 'brick_veneer' | 'double_brick' | 'clad_frame' | 'block' | 'colorbond_shed';

export interface Wall {
  id: string;
  start: Vec;
  end: Vec;
  thickness: number;
  height: number;
  color: string;
  /** Outside finish for this wall only (otherwise the house facade is used). */
  facade?: Facade | null;
  /** Construction of an outside wall (brick veneer etc.); null = plain wall. */
  construction?: Construction | null;
  /** Lining for each inside face of this wall (+normal side / −normal side); unset = the room's lining. */
  lining?: { pos?: LiningType | null; neg?: LiningType | null };
  /** Paint colour for one face only (+normal side / −normal side); unset = `color`. */
  sideColor?: { pos?: string; neg?: string };
}

export type OpeningKind =
  | 'door'
  | 'double_door'
  | 'sliding_door'
  | 'stacker_door'
  | 'cavity_door'
  | 'garage_door'
  | 'window'
  | 'opening';

/** Door leaf designs (entrance doors follow Hume ranges). */
/** Door leaf design id (see DOOR_DESIGNS in the catalog: Hume entrance/internal, Corinthian, generic). */
export type DoorDesign = string;

export type DressingType = 'roller' | 'roman' | 'venetian' | 'sheer' | 'blockout' | 'sheer_blockout';
export interface WindowDressing {
  type: DressingType;
  color: string;
  /** 0 = closed (blinds lowered, curtains drawn across), 1 = fully open. */
  open: number;
  /** Curtains: to the floor or just below the sill. */
  length?: 'floor' | 'sill';
  /** Roller / Roman blinds: light filtering or blockout fabric. */
  fabric?: 'light' | 'blockout';
  /** Which face of the wall, for windows in internal walls (+1 = the wall's normal side). */
  side?: 1 | -1;
}

export type GarageStyle = 'sectional' | 'sectional_windows' | 'roller' | 'tilt' | 'timber' | 'glass';

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  /** Distance along the wall from its start point to the centre of the opening. */
  offset: number;
  width: number;
  height: number;
  /** Height of the bottom of the opening above the floor (window sill). */
  sill: number;
  /** Hinge at the far end of the opening instead of the near end. */
  hingeEnd: boolean;
  /** Swing to the other side of the wall. */
  flip: boolean;
  color: string;
  /** Garage doors: which kind of door. */
  style?: GarageStyle;
  /** Hinged doors: leaf design, glass and jamb type. */
  design?: DoorDesign;
  glass?: 'clear' | 'translucent' | 'cathedral' | 'reeded' | 'frosted' | 'grey';
  /** Hinged doors: handle type, height to its centre (mm) and finish colour. */
  handle?: DoorHandleSpec;
  /** Curtains or blinds on the inside of a window / glass door. */
  dressing?: WindowDressing;
  /** Trim (architraves) round a hinged door or window; unset fields follow the house settings. */
  trim?: { type?: SkirtingType; width?: number };
  /**
   * Hinged doors: a door stop (ABI product slug), on the wall the door opens back to or on the floor; 'none' = no
   * stop even if the house has one. Unset on an interior door = the house door stop.
   */
  doorStop?: DoorStop;
  /** Windows: a sill (with trim under it) or, when false, no sill and the trim runs right round. Default true. */
  windowSill?: boolean;
  /** Stacker doors: number of sliding panels (2–4) and the width of each panel. */
  panels?: number;
  panelWidth?: number;
  jamb?: 'single' | 'double';
  /** Hinged door: fixed glazed sidelight panels beside the door (included in `width`). */
  sidelight?: { hinge: boolean; latch: boolean; width: number };
}

export interface Item {
  id: string;
  type: string;
  name: string;
  /** Centre of the item footprint. */
  x: number;
  y: number;
  /** Degrees, clockwise in plan view. The item's back is its local -y side. */
  rotation: number;
  width: number;
  depth: number;
  height: number;
  /** Height of the item's base above the floor (e.g. wall cabinets). */
  elevation: number;
  color: string;
  /** Veranda/porch: covered by the main roof instead of its own (its outer edge acts like an outside wall). */
  underRoof?: boolean;
  /** Configurable items (e.g. Timberline vanities): their chosen options. */
  options?: Record<string, string | number>;
  /** Reshaped outdoor structures (decks, patios, open verandas): the outline's corners in the item's own frame. */
  corners?: [number, number][];
}

/**
 * A hinged door's handle. `product` is an ABI Interiors handle (slug); it sets the type, finish and pull length.
 * Unset on an interior door = the house handle.
 */
export interface DoorHandleSpec {
  type?: 'lever' | 'knob' | 'pull' | 'halfmoon' | 'flush' | 'none';
  height?: number;
  finish?: string;
  /** Pull handles: length (mm). */
  length?: number;
  product?: string;
}

export interface DoorStop {
  mount: 'wall' | 'floor' | 'none';
  product: string;
}

export interface KitchenStyle {
  /** Kaboodle door, benchtop and handle names (Kaboodle cabinetry). */
  door: string;
  benchtop: string;
  handle: string;
  /** Which cabinetry the kitchen designer offers: custom (made to measure) or Kaboodle; unset = custom unless it has Kaboodle units. */
  range?: 'custom' | 'kaboodle';
  /** Custom cabinetry finishes and heights (see cabinetry.ts); unset fields use the defaults. */
  custom?: Partial<CustomKitchenStyle>;
  /** Bulkhead filling from the top of the wall cabinets (and tall units) up to the ceiling. */
  bulkhead?: { on: boolean; finish?: 'plaster' | 'doors'; shadowline?: boolean; /** Cornice along it at the ceiling (default on). */ cornice?: boolean };
}

/** Custom cabinetry: door profile and colour, benchtop, handles, and the kick / bench / overhead heights (mm). */
export interface CustomKitchenStyle {
  profile: string;
  doorColor: string;
  bench: string;
  benchColor: string;
  benchT: number;
  handle: string;
  handleFinish: string;
  handleLen: number;
  kick: number;
  benchHeight: number;
  overheadTop: number;
}

/** Flooring sizes (mm): board / plank width, or tile width × length and grout joint width. */
export interface FloorSize {
  board?: number;
  tileW?: number;
  tileL?: number;
  grout?: number;
}

export type FloorFinish = 'timber' | 'hybrid' | 'tile' | 'large_tile' | 'carpet' | 'concrete';

/** Inside wall lining. */
export type LiningType = 'plaster' | 'vj' | 'vj_dado' | 'shiplap' | 'board_batten';

export type CorniceType = 'none' | 'square_set' | 'cove55' | 'cove90' | 'shadowline' | 'classic' | 'federation';
export type SkirtingType = 'none' | 'shadow' | 'square66' | 'square90' | 'square135' | 'pencil' | 'bullnose' | 'colonial' | 'lambs_tongue';

export interface Room {
  id: string;
  name: string;
  points: Vec[];
  /** Floor finish for this room; null = the house flooring. */
  floor: FloorFinish | null;
  /** Floor colour (with `floor`); null = default colour for the finish. */
  color: string | null;
  /** Cornice for this room; null/undefined = the house cornice. */
  cornice?: CorniceType | null;
  /** Skirting for this room; null/undefined = the house skirting. */
  skirting?: SkirtingType | null;
  /** Kitchen designer: the Kaboodle door, benchtop and handle chosen for this kitchen (names from the range). */
  kitchen?: KitchenStyle;
  /** Direction the boards run in this room (degrees, 0 = left–right on the plan); null = house direction. */
  floorDirection?: number | null;
  /** Board / tile sizes in this room (any left out follow the house flooring); null = the house sizes. */
  floorSize?: FloorSize | null;
  /** Wall lining in this room; null/undefined = the house lining. */
  wallLining?: LiningType | null;
}

export interface Dimension {
  id: string;
  a: Vec;
  b: Vec;
}

/**
 * Electrical: a power point, switch, light or fan (see ELEC_PRODUCTS in electrical.ts). Wall-mounted points sit on
 * a wall face and face out of it; ceiling ones hang from the ceiling.
 */
export interface ElecPoint {
  id: string;
  /** Catalogue product id. */
  product: string;
  /** Plan position (mm): the wall face for wall-mounted points. */
  x: number;
  y: number;
  /** Degrees, clockwise in plan: wall-mounted points face their local +y (out of the wall). */
  rotation: number;
  /** Height of the centre above the floor (wall-mounted points). */
  height: number;
  /** Plate colour (Iconic colour id); unset = the house plate colour. */
  finish?: string;
  /** Your own name for it, e.g. "Pendants over island". */
  label?: string;
  /** Lights: beam angle (degrees) and colour temperature (K); unset = the product's. */
  beam?: number;
  cct?: number;
  /** Switches, dimmers and fan controls: the lights / fans each gang turns on, by id. */
  gangs?: string[][];
}

export interface Settings {
  snap: number;
  wallThickness: number;
  wallHeight: number;
  showDimensions: boolean;
  showRoomDimensions: boolean;
  /** Green clearance measurements (gaps to walls / items) while selecting, dragging and placing. Off by default. */
  showClearances?: boolean;
  /** Each room's side lengths drawn along its walls (the room's overall size and area always show). Off by default. */
  showRoomSides?: boolean;
  /** Each interior door's size written in its doorway (width, and height if it isn't the house door height). Off by default. */
  showDoorSizes?: boolean;
  /** Dimension strings round the outside of the house: each room's internal size along each side, and the overall size. */
  showOutsideDims?: boolean;
  /** With the outside dimensions: label the wall thicknesses too (default on). */
  outsideDimWalls?: boolean;
  /** With the outside dimensions: a line of window positions and sizes closest to the house (default on). */
  outsideDimWindows?: boolean;
  /** Colour of walls in 3D. */
  wallColor: string;
  /** Height of hinged / cavity doors. */
  doorHeight: number;
  /** Ceiling colour (walk-through). */
  ceilingColor: string;
  /** Ceiling height; null = height of the tallest outside wall. */
  ceilingHeight: number | null;
  /** House flooring (rooms can override). */
  flooring: { finish: FloorFinish; color: string; direction?: number; size?: FloorSize };
  /** House cornice and skirting (rooms can override). */
  cornice: CorniceType;
  skirting: SkirtingType;
  skirtingColor: string;
  /** Width of the trim (architraves) round windows, mm; 0 = none. Unset = 66 mm. */
  windowTrim?: number;
  /** House handle for interior hinged doors (doors without their own handle follow it). */
  interiorHandle?: DoorHandleSpec | null;
  /** House door stop for interior hinged doors (doors without their own door stop setting follow it). */
  interiorDoorStop?: DoorStop | null;
  /** House style for interior doors (doors on inside walls without their own design follow it). */
  interiorDoor?: { design: DoorDesign; glass?: Opening['glass']; color: string; jamb: 'single' | 'double' };
  /** Inside wall lining for the house (rooms can override). */
  wallLining?: LiningType;
  /** Last construction applied to the outside walls. */
  construction?: Construction | null;
  /** The outside wall at the front of the house; the walk-through starts out in front of it. */
  frontWallId?: string | null;
  /** Height of the house floor above the ground around it (mm, e.g. a house on stumps); unset = 0. */
  floorLevel?: number;
  /** House style for switch and power point plates (Clipsal Iconic): range and colour ids. */
  electrical?: { range: string; finish: string };
}

export type RoofStyle = 'hip' | 'gable' | 'flat' | 'skillion';

export interface Roof {
  style: RoofStyle;
  /** Degrees. */
  pitch: number;
  /** Eaves overhang beyond the outside face of the walls. */
  overhang: number;
  /** Height of the top of the walls the roof sits on; null = tallest wall. */
  eaveHeight: number | null;
  /** Visible thickness of the roof edge (fascia). */
  fascia: number;
  color: string;
  /** Skillion only: which way the roof rises, in 90° steps relative to the building. */
  skillionDir: 0 | 90 | 180 | 270;
  /** Hip/gable: bring every main wing's ridge to the same height (steeper pitch on narrower wings). */
  levelRidges?: boolean;
  /** Roofing: COLORBOND® steel sheet or tiles (default steel). */
  material?: RoofMaterial;
  /** Sheet or tile profile. */
  profile?: RoofProfile;
  /** Gutters along the eaves (and downpipes). */
  gutter?: { style: GutterStyle | 'none'; color: string; downpipes: boolean };
  /** Eave lining (Villaboard / fibre-cement soffit) under the eaves; unset = shown, white. */
  soffit?: { show: boolean; color: string };
  /** Fascia board colour; unset = matches the gutters (or the roof with no gutters). */
  fasciaColor?: string;
  /** Extra areas the roof is pulled out over (patios, carports…), as plan rectangles. */
  extensions?: RoofExtension[];
}

/** A rectangle of plan the main roof also covers, as if its outer edge were an outside wall. */
export interface RoofExtension {
  id: string;
  /** Centre (mm). */
  x: number;
  y: number;
  width: number;
  depth: number;
  /** Degrees. */
  rotation: number;
}

export type RoofMaterial = 'colorbond' | 'concrete_tile' | 'terracotta_tile';
export type RoofProfile = 'corrugated' | 'trapezoidal' | 'kliplok' | 'flat_tile' | 'wave_tile';
export type GutterStyle = 'quad' | 'half_round' | 'square_line' | 'fascia' | 'ogee';

export interface Design {
  app: 'home-designer';
  version: 1;
  name: string;
  walls: Wall[];
  openings: Opening[];
  items: Item[];
  rooms: Room[];
  dimensions: Dimension[];
  /** Power points, switches and lights (the electrical plan). */
  electrical: ElecPoint[];
  settings: Settings;
  roof: Roof | null;
  /** Default outside finish for the house. */
  facade: Facade;
  /** Garden designer: the block of land, its yards and garden areas, plants and landscaping. */
  garden?: Garden;
}

/** Areas you outline in the garden designer (see AREA_KINDS in garden.ts). */
export type GardenAreaKind = 'yard' | 'bed' | 'lawn' | 'driveway' | 'path' | 'paving' | 'gravel' | 'veggie';

export interface GardenArea {
  id: string;
  kind: GardenAreaKind;
  name: string;
  points: Vec[];
  /** Draw the outline as a smooth curve through its points; `sharp` lists the corners that stay sharp. */
  curved?: boolean;
  sharp?: number[];
  /** Surface finish id (see SURFACES in garden.ts); unset = the kind's default. */
  surface?: string;
  /** Yards: which part of the block. */
  zone?: 'front' | 'back' | 'side';
  /** Beds, lawns and veggie patches: edging round the outside (see EDGINGS); unset = none. */
  edging?: string;
}

/** A plant, tree, raised bed, letterbox or other feature in the garden (see GARDEN_CATALOG in garden.ts). */
export interface GardenItem {
  id: string;
  type: string;
  /** Centre of the footprint. */
  x: number;
  y: number;
  /** Degrees, clockwise in plan. */
  rotation: number;
  width: number;
  depth: number;
  height: number;
  color?: string;
  options?: Record<string, string | number>;
}

export type FenceType = 'none' | 'colorbond' | 'paling' | 'slat' | 'picket' | 'pool' | 'rendered';

export interface BlockSide {
  fence: FenceType;
  /** Fence height (mm); unset = the fence type's usual height. */
  height?: number;
  /** Fence colour; unset = the fence type's default. */
  color?: string;
}

/** The block of land: its boundary, the fence along each side, and which side faces the street. */
export interface Block {
  points: Vec[];
  /** One per boundary side: side i runs from points[i] to points[i + 1]. */
  sides: BlockSide[];
  /** Index of the side that faces the street. */
  street: number;
}

export interface Garden {
  block: Block | null;
  areas: GardenArea[];
  items: GardenItem[];
  /** How grown plants are drawn: 0.3 = just planted … 1 = fully grown. Unset = fully grown. */
  growth?: number;
}

export type EntityKind = 'wall' | 'opening' | 'item' | 'room' | 'dimension' | 'roof' | 'facade' | 'electric' | 'block' | 'garden-area' | 'garden-item';

export interface Selection {
  kind: EntityKind;
  id: string;
}

export type Tool =
  | { kind: 'select' }
  | { kind: 'wall' }
  | { kind: 'room' }
  | { kind: 'floor' }
  | { kind: 'measure' }
  | { kind: 'place'; itemType: string; preset?: Partial<Item> }
  | { kind: 'opening'; catalogId: string }
  /** Electrical page: place a product, or pick the lights one gang of a switch turns on. */
  | { kind: 'elec'; product: string }
  | { kind: 'elec-link'; switchId: string; gang: number }
  /**
   * Garden designer: outline an area (or the block itself) by clicking its corners, or drop a ready-made shape;
   * place a plant or feature.
   */
  | { kind: 'garden-area'; area: GardenAreaKind | 'block'; curved?: boolean; shape?: string }
  | { kind: 'garden-item'; itemType: string };

export type ViewMode = '2d' | 'split' | '3d';
