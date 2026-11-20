/**
 * Immutable, fail-closed, three-tab town stash.
 * Tab 0 maps directly onto the historical 24-slot `stash` array. Tabs 1–2
 * are optional character-owned data; an account-owned storage adapter can use
 * these same pure planners in the future without introducing network writes.
 * No world state, RNG, currency, storage API or UI dependency.
 * GPL-3.0-only.
 */
import { isItem, type Equipment, type Item, type RarityId } from '../data/items';
import { planSwap, type ItemFlags } from './equipmentRules';

export const STASH_SIZE = 24;
export const STASH_TAB_COUNT = 3;
export type StashTabIndex = 0 | 1 | 2;
export type StashTabs = [Array<Item | null>, Array<Item | null>];
export type StashCategory = 'weapon' | 'armor' | 'accessory';
export type StashSort = 'rarity' | 'level' | 'name';

export interface StashContents {
  readonly inventory: readonly (Item | null)[];
  readonly equipment: Readonly<Equipment>;
  /** The original v11 stash; always tab zero. */
  readonly stash: readonly (Item | null)[];
  /** Additional tabs only. Absent on legacy save records. */
  readonly stashTabs?: readonly (readonly (Item | null)[])[];
  readonly flags?: Readonly<Record<string, ItemFlags>>;
}
export type StashError =
  | 'INVALID_STATE' | 'DUPLICATE_ID' | 'INVALID_INDEX'
  | 'EMPTY_SLOT' | 'STASH_FULL' | 'INVENTORY_FULL' | 'PROTECTED_ITEM';
export type StashPlan = { readonly ok: true; readonly state: StashContents }
  | { readonly ok: false; readonly reason: StashError };

export function emptyStashTabs(): StashTabs {
  return [Array<Item | null>(STASH_SIZE).fill(null),
    Array<Item | null>(STASH_SIZE).fill(null)];
}
function cloneItem(item: Item | null): Item | null {
  return item === null ? null : {
    ...item, affixes: item.affixes.map(affix => ({ ...affix })),
    ...(item.sockets ? { sockets: [...item.sockets] } : {}),
    ...(item.legendaryPower ? { legendaryPower: { ...item.legendaryPower } } : {})
  };
}
function completeArray(value: unknown, size: number): value is (Item | null)[] {
  return Array.isArray(value) && value.length === size
    && Array.from({ length: size }).every((_, i) =>
      Object.hasOwn(value, i) && (value[i] === null || isItem(value[i])));
}
export function validStashTab(tab: unknown): tab is StashTabIndex {
  return Number.isSafeInteger(tab) && (tab === 0 || tab === 1 || tab === 2);
}
function validIndex(value: unknown, length: number): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number'
    && value >= 0 && value < length;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Reuse equipment/flag validation; forbid item duplicates across all three tabs. */
export function validateStashContents(value: unknown): value is StashContents {
  if (!isRecord(value)) return false;
  const state = value as unknown as Partial<StashContents>;
  if (!completeArray(state.inventory, STASH_SIZE)
    || !completeArray(state.stash, STASH_SIZE)
    || (state.stashTabs !== undefined && (!Array.isArray(state.stashTabs)
      || state.stashTabs.length !== STASH_TAB_COUNT - 1
      || !Object.hasOwn(state.stashTabs, 0) || !Object.hasOwn(state.stashTabs, 1)
      || !state.stashTabs.every(tab => completeArray(tab, STASH_SIZE))))
    || !state.equipment || !isRecord(state.equipment)
    || !planSwap({ inventory: state.inventory, equipment: state.equipment,
      ...(state.flags !== undefined ? { flags: state.flags } : {}) }, 0, 0).ok) return false;

  const all = [
    ...state.inventory, ...Object.values(state.equipment), ...state.stash,
    ...(state.stashTabs ?? []).flat()
  ].filter((item): item is Item => item !== null);
  return all.length === new Set(all.map(item => item.id)).size
    && all.every(item => typeof item.id === 'string' && item.id.length <= 128);
}
function reject(reason: StashError): StashPlan { return { ok: false, reason }; }

type MutableContents = {
  inventory: (Item | null)[];
  stash: (Item | null)[];
  stashTabs: StashTabs;
  equipment: Equipment;
  flags: Record<string, ItemFlags>;
};
function copyState(state: StashContents): MutableContents {
  const extra = state.stashTabs ?? emptyStashTabs();
  return {
    inventory: state.inventory.map(cloneItem),
    stash: state.stash.map(cloneItem),
    stashTabs: [extra[0]!.map(cloneItem), extra[1]!.map(cloneItem)],
    equipment: Object.fromEntries(Object.entries(state.equipment)
      .map(([id, item]) => [id, cloneItem(item)])) as Equipment,
    flags: Object.fromEntries(Object.entries(state.flags ?? {})
      .map(([id, flags]) => [id, { ...flags }]))
  };
}
function tabSlots(state: StashContents, tab: StashTabIndex): readonly (Item | null)[] {
  return tab === 0 ? state.stash : (state.stashTabs ?? emptyStashTabs())[tab - 1]!;
}
function mutableTab(state: MutableContents, tab: StashTabIndex): (Item | null)[] {
  return tab === 0 ? state.stash : state.stashTabs[tab - 1]!;
}

/** Deposit into the first empty slot in the selected tab; default is legacy tab 0. */
export function planStashDeposit(state: StashContents, bagIndex: number, tab: number = 0): StashPlan {
  if (!validateStashContents(state)) return reject('INVALID_STATE');
  if (!validStashTab(tab) || !validIndex(bagIndex, state.inventory.length))
    return reject('INVALID_INDEX');
  const item = state.inventory[bagIndex];
  if (!item) return reject('EMPTY_SLOT');
  if (state.flags?.[item.id]?.locked || state.flags?.[item.id]?.favorite)
    return reject('PROTECTED_ITEM');
  const target = tabSlots(state, tab);
  const index = target.findIndex(slot => slot === null);
  if (index < 0) return reject('STASH_FULL');
  const next = copyState(state);
  mutableTab(next, tab)[index] = next.inventory[bagIndex];
  next.inventory[bagIndex] = null;
  delete next.flags[item.id]; // never retain orphaned metadata
  return { ok: true, state: next };
}

/** Return an item to the first empty inventory slot; never drop a full-bag item. */
export function planStashWithdraw(state: StashContents, stashIndex: number, tab: number = 0): StashPlan {
  if (!validateStashContents(state)) return reject('INVALID_STATE');
  if (!validStashTab(tab) || !validIndex(stashIndex, STASH_SIZE))
    return reject('INVALID_INDEX');
  const item = tabSlots(state, tab)[stashIndex];
  if (!item) return reject('EMPTY_SLOT');
  const index = state.inventory.findIndex(slot => slot === null);
  if (index < 0) return reject('INVENTORY_FULL');
  const next = copyState(state);
  next.inventory[index] = mutableTab(next, tab)[stashIndex];
  mutableTab(next, tab)[stashIndex] = null;
  return { ok: true, state: next };
}

/** Move between two tabs atomically without routing via the backpack. */
export function planStashMove(
  state: StashContents, fromTab: number, index: number, toTab: number
): StashPlan {
  if (!validateStashContents(state)) return reject('INVALID_STATE');
  if (!validStashTab(fromTab) || !validStashTab(toTab) || fromTab === toTab
    || !validIndex(index, STASH_SIZE)) return reject('INVALID_INDEX');
  const item = tabSlots(state, fromTab)[index];
  if (!item) return reject('EMPTY_SLOT');
  const destination = tabSlots(state, toTab).findIndex(slot => slot === null);
  if (destination < 0) return reject('STASH_FULL');
  const next = copyState(state);
  mutableTab(next, toTab)[destination] = mutableTab(next, fromTab)[index];
  mutableTab(next, fromTab)[index] = null;
  return { ok: true, state: next };
}
const rarityOrder: readonly RarityId[] =
  ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
const rarityRank = (id: RarityId): number => rarityOrder.indexOf(id);
function compareItems(a: Item, b: Item, sort: StashSort): number {
  if (sort === 'level' && a.level !== b.level) return b.level - a.level;
  if (sort === 'name') {
    const byName = a.templateId.localeCompare(b.templateId, 'en');
    if (byName) return byName;
  }
  const byRarity = rarityRank(b.rarity) - rarityRank(a.rarity);
  if (byRarity) return byRarity;
  if (a.level !== b.level) return b.level - a.level;
  return a.templateId.localeCompare(b.templateId, 'en') || a.id.localeCompare(b.id, 'en');
}

/** Canonical mutation: compact and sort one tab, preserving entire item instances. */
export function planStashSort(state: StashContents, tab: number): StashPlan {
  if (!validateStashContents(state)) return reject('INVALID_STATE');
  if (!validStashTab(tab)) return reject('INVALID_INDEX');
  const next = copyState(state);
  const slots = mutableTab(next, tab);
  const items = slots.filter((item): item is Item => item !== null);
  items.sort((a,b) => compareItems(a,b,'rarity'));
  for (let i = 0; i < STASH_SIZE; i++) slots[i] = items[i] ?? null;
  return { ok: true, state: next };
}

export interface StashFilter {
  readonly category?: StashCategory;
  readonly rarity?: RarityId;
  readonly query?: string;
  readonly sort?: StashSort;
}
export interface StashViewEntry { readonly index: number; readonly item: Item }
/** Pure view projection. Index refers to the real underlying slot, never a sorted view position. */
export function projectStashItems(
  slots: readonly (Item | null)[], filter: StashFilter = {}
): StashViewEntry[] {
  const rawFilter: unknown = filter;
  if (!completeArray(slots, STASH_SIZE) || !isRecord(rawFilter)
    || (filter.rarity !== undefined && !rarityOrder.includes(filter.rarity))
    || (filter.category !== undefined && !['weapon','armor','accessory'].includes(filter.category))
    || (filter.sort !== undefined && !['rarity','level','name'].includes(filter.sort))
    || (filter.query !== undefined
      && (typeof filter.query !== 'string' || filter.query.length > 64))) return [];
  const query = (filter.query ?? '').trim().toLocaleLowerCase('en');
  return slots.flatMap((item,index): StashViewEntry[] => {
    if (!item || (filter.rarity !== undefined && item.rarity !== filter.rarity)
      || (query && !item.templateId.toLocaleLowerCase('en').includes(query))) return [];
    const category: StashCategory = item.slot === 'MAIN_HAND' || item.slot === 'OFF_HAND'
      ? (item.templateId === 'shield' || item.templateId === 'spellbook' ? 'armor' : 'weapon')
      : item.slot === 'AMULET' || item.slot === 'RING_1' || item.slot === 'RING_2'
        || item.slot === 'RELIC' || item.slot === 'CHARM' ? 'accessory' : 'armor';
    return filter.category !== undefined && category !== filter.category ? [] : [{index,item}];
  }).sort((a,b) => compareItems(a.item,b.item,filter.sort ?? 'rarity') || a.index - b.index);
}
