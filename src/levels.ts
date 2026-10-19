import { exteriorSides } from './facade';
import { pointInPolygon } from './geometry';
import type { Design, Item, Vec } from './types';

/**
 * Levels: the house floor is height 0 and the ground around the house is `floorLevel` below it (a house on
 * stumps or a raised slab). Decks, patios and outside stairs and steps stand on the ground, so a deck can sit
 * lower than the house floor.
 */

export const floorLevelOf = (d: Design) => Math.max(0, d.settings.floorLevel ?? 0);

/** Items that stand on the ground rather than the house floor. */
const GROUND_ITEMS = new Set(['deck', 'patio']);
/** Stand on the ground when they're outside the house. */
const OUTSIDE_ITEMS = new Set(['stairs', 'step']);

/** Inside the outside walls (or in a room, for plans that aren't closed in). */
export function insideHouse(d: Design, p: Vec): boolean {
  const sides = exteriorSides(d.walls);
  if (sides.floor.some((r) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1)) return true;
  return d.rooms.some((r) => pointInPolygon(p, r.points));
}

/** Height (relative to the house floor) an item's base stands on: the ground for decks, patios and outside stairs. */
export function itemBase(d: Design, it: Item): number {
  const L = floorLevelOf(d);
  if (!L) return 0;
  if (GROUND_ITEMS.has(it.type) || (OUTSIDE_ITEMS.has(it.type) && !insideHouse(d, it))) return -L;
  return 0;
}

export const isGroundItem = (type: string) => GROUND_ITEMS.has(type);

/** A deck's surface relative to the house floor (negative = below it). */
export const deckLevel = (d: Design, it: Item) => itemBase(d, it) + Math.max(22, it.height);
