import { ITEM_MAP, OPENING_MAP } from './catalog';
import type { Design, Item, Opening, Room, Wall } from './types';

let n = 0;
const id = (p: string) => `${p}_sample${++n}`;

function wall(x1: number, y1: number, x2: number, y2: number, thickness: number): Wall {
  return { id: id('w'), start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, height: 2700, color: '#f2efe9' };
}

function opening(wallId: string, catalogId: string, offset: number, extra: Partial<Opening> = {}): Opening {
  const d = OPENING_MAP[catalogId];
  return {
    id: id('o'),
    wallId,
    kind: d.kind,
    offset,
    width: d.width,
    height: d.height,
    sill: d.sill,
    hingeEnd: false,
    flip: false,
    color: d.color,
    ...extra,
  };
}

function item(type: string, x: number, y: number, rotation: number, extra: Partial<Item> = {}): Item {
  const d = ITEM_MAP[type];
  return {
    id: id('i'),
    type,
    name: d.name,
    x,
    y,
    rotation,
    width: d.width,
    depth: d.depth,
    height: d.height,
    elevation: d.elevation ?? 0,
    color: d.color,
    ...extra,
  };
}

function room(name: string, pts: [number, number][], floor: Room['floor'], color: string): Room {
  return { id: id('r'), name, points: pts.map(([x, y]) => ({ x, y })), floor, color };
}

export function createSampleDesign(): Design {
  n = 0;
  const top = wall(0, 0, 12000, 0, 230);
  const right = wall(12000, 0, 12000, 9000, 230);
  const bottom = wall(12000, 9000, 0, 9000, 230);
  const left = wall(0, 9000, 0, 0, 230);
  const spine = wall(4000, 0, 4000, 9000, 110);
  const bedSplit = wall(0, 4500, 4000, 4500, 110);
  const bathSide = wall(6500, 0, 6500, 3000, 110);
  const bathFront = wall(4000, 3000, 6500, 3000, 110);

  const kitchenY = 115 + 300;
  return {
    app: 'home-designer',
    version: 1,
    name: 'Sample 2-bed home',
    settings: { snap: 50, wallThickness: 110, wallHeight: 2700, showDimensions: true, showRoomDimensions: true, wallColor: '#f2efe9', doorHeight: 2040, ceilingColor: '#ffffff', ceilingHeight: null, flooring: { finish: 'timber', color: '#c49a6c' }, cornice: 'cove90', skirting: 'pencil', skirtingColor: '#ffffff' },
    walls: [top, right, bottom, left, spine, bedSplit, bathSide, bathFront],
    openings: [
      opening(bottom.id, 'door_wide', 5000, { color: '#5b4636' }),
      opening(right.id, 'sliding_door', 6000),
      opening(top.id, 'window', 2000),
      opening(top.id, 'window', 9105, { width: 1800, height: 900, sill: 1100 }),
      opening(top.id, 'window_small', 5000),
      opening(left.id, 'window', 2250),
      opening(spine.id, 'door', 3700),
      opening(spine.id, 'door', 5300, { hingeEnd: true }),
      opening(bathFront.id, 'door', 1900, { flip: true }),
    ],
    rooms: [
      room('Bedroom 1', [[0, 0], [4000, 0], [4000, 4500], [0, 4500]], 'carpet', '#b9b2a6'),
      room('Bedroom 2', [[0, 4500], [4000, 4500], [4000, 9000], [0, 9000]], 'carpet', '#b9b2a6'),
      { ...room('Bathroom', [[4000, 0], [6500, 0], [6500, 3000], [4000, 3000]], 'tile', '#e4e2dc'), cornice: 'square_set', skirting: 'none' },
      { ...room('Kitchen / Living', [[6500, 0], [12000, 0], [12000, 9000], [4000, 9000], [4000, 3000], [6500, 3000]], 'timber', '#c49a6c'), floor: null, color: null },
    ],
    items: [
      // Bedroom 1
      item('bed_queen', 115 + 1050, 2250, 270),
      item('bedside', 115 + 200, 2250 - 1050, 270),
      item('bedside', 115 + 200, 2250 + 1050, 270),
      item('wardrobe', 3945 - 300, 1500, 90),
      // Bedroom 2
      item('bed_double', 2000, 8885 - 1025, 180),
      item('wardrobe', 1800, 4555 + 300, 0),
      item('desk', 400, 6000, 270, { width: 1200, depth: 600 }),
      // Bathroom
      item('bath', 4055 + 850, 115 + 380, 0),
      item('toilet', 6385 - 350, 1500, 90),
      item('vanity', 4600, 2945 - 230, 180),
      item('mirror', 4600, 2945 - 75, 180),
      // Kitchen run along the top wall
      item('fridge', 7000, 115 + 375, 0),
      item('tall_cabinet', 7755, kitchenY, 0),
      item('base_cabinet', 8355, kitchenY, 0),
      item('sink_cabinet', 9105, kitchenY, 0),
      item('dishwasher', 9855, kitchenY, 0),
      item('base_cabinet', 10455, kitchenY, 0),
      item('cooktop_cabinet', 11055, kitchenY, 0),
      item('drawer_cabinet', 11620, kitchenY, 0, { width: 530 }),
      item('wall_cabinet', 8355, 115 + 175, 0),
      item('rangehood', 11055, 115 + 250, 0, { width: 600 }),
      item('wall_cabinet', 10455, 115 + 175, 0),
      item('wall_cabinet', 11620, 115 + 175, 0, { width: 530 }),
      item('island', 9300, 2500, 0),
      item('bar_stool', 8700, 3250, 180),
      item('bar_stool', 9300, 3250, 180),
      item('bar_stool', 9900, 3250, 180),
      // Dining
      item('dining_table', 9600, 4700, 0),
      item('chair', 9150, 4000, 0),
      item('chair', 10050, 4000, 0),
      item('chair', 9150, 5400, 180),
      item('chair', 10050, 5400, 180),
      // Living
      item('rug', 6300, 6700, 90),
      item('tv_unit', 4055 + 225, 6700, 270),
      item('tv', 4055 + 40, 6700, 270),
      item('coffee_table', 6100, 6700, 90),
      item('sofa_3', 7700, 6700, 90),
      item('armchair', 6050, 8300, 180),
      item('plant', 11550, 8550, 0),
      item('floor_lamp', 8050, 8550, 0),
    ],
    dimensions: [{ id: id('d'), a: { x: 0, y: -700 }, b: { x: 12000, y: -700 } }],
    roof: null,
    facade: { finish: 'brick', color: '#9c4f3a', mortar: '#d9d4c7' },
  };
}
