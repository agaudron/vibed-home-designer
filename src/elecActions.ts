import { allGangKeys, gangKey, unlinkedInRoom } from './electrical';
import { store } from './store';
import type { ElecPoint } from './types';

/** Electrical page actions (kept out of electrical.ts, which the store uses to read saved files). */

export function updateElec(id: string, fn: (e: ElecPoint) => ElecPoint) {
  store.update((d) => ({ ...d, electrical: d.electrical.map((e) => (e.id === id ? fn(e) : e)) }));
}

/** Add a light to one gang of a switch, or take it off if it's already there. */
export function toggleLink(switchId: string, gang: number, lightId: string) {
  updateElec(switchId, (e) => {
    const gangs = (e.gangs ?? []).map((g, i) => (i !== gang ? g : g.includes(lightId) ? g.filter((x) => x !== lightId) : [...g, lightId]));
    return { ...e, gangs };
  });
}

export function linkRoomLights(switchId: string, gang: number) {
  const sw = store.state.design.electrical.find((e) => e.id === switchId);
  if (!sw) return;
  const add = unlinkedInRoom(store.state.design, sw);
  if (!add.length) {
    store.flash('Every light in this room is already on this switch');
    return;
  }
  updateElec(switchId, (e) => ({ ...e, gangs: (e.gangs ?? []).map((g, i) => (i === gang ? [...g, ...add] : g)) }));
  store.flash(`Added ${add.length} light${add.length === 1 ? '' : 's'} to switch ${gang + 1}`);
}

/** Pick the lights one gang of a switch turns on, by clicking them in the plan. */
export function startLinking(switchId: string, gang: number) {
  store.set({ tool: { kind: 'elec-link', switchId, gang }, selection: { kind: 'electric', id: switchId }, electric: true });
}

export function openElectrical() {
  store.set({ electric: true, kitchen: null, hideCatalog: false, tool: { kind: 'select' }, selection: null });
}

export function closeElectrical() {
  store.set({ electric: false, lightDemo: null, tool: { kind: 'select' } });
}

/** Light spread demo: shows each light's pool of light, and the switches turn them on and off. Starts all on. */
export function toggleLightDemo() {
  const on = store.state.lightDemo ? null : allGangKeys(store.state.design);
  store.set({ lightDemo: on, electric: true, tool: { kind: 'select' } });
}

export function setGangs(keys: string[], on: boolean) {
  const cur = store.state.lightDemo;
  if (!cur) return;
  const next = new Set(cur);
  keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
  store.set({ lightDemo: [...next] });
}

/** Flick a switch in the demo: one gang, or a whole plate (all off if any are on, else all on). */
export function flickSwitch(sw: ElecPoint, gang?: number) {
  const cur = new Set(store.state.lightDemo ?? []);
  const keys = gang === undefined ? (sw.gangs ?? []).map((_, i) => gangKey(sw.id, i)) : [gangKey(sw.id, gang)];
  setGangs(keys, !keys.some((k) => cur.has(k)));
}
