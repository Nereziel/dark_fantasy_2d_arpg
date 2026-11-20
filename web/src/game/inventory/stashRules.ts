/**
 * Immutable, fail-closed town stash transfers.
 * Character-owned item instances only; no world state, RNG or currency.
 * GPL-3.0-only.
 */
import { isItem, type Equipment, type Item } from '../data/items';
import { planSwap, type ItemFlags } from './equipmentRules';

export const STASH_SIZE = 24;

export interface StashContents {
  readonly inventory: readonly (Item | null)[];
  readonly equipment: Readonly<Equipment>;
  readonly stash: readonly (Item | null)[];
  readonly flags?: Readonly<Record<string, ItemFlags>>;
}
export type StashError =
  | 'INVALID_STATE' | 'DUPLICATE_ID' | 'INVALID_INDEX'
  | 'EMPTY_SLOT' | 'STASH_FULL' | 'INVENTORY_FULL' | 'PROTECTED_ITEM';
export type StashPlan = { readonly ok: true; readonly state: StashContents }
  | { readonly ok: false; readonly reason: StashError };

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
      Object.hasOwn(value, i) && (value[i] === null || isItem(value[i]))
    );
}
function validIndex(value: number, length: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value < length;
}

/** Reuse authoritative equipment/flag validation; additionally reject cross-container duplicates. */
export function validateStashContents(value: unknown): value is StashContents {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Partial<StashContents>;
  if (!completeArray(state.inventory, 24) || !completeArray(state.stash, STASH_SIZE)
    || !state.equipment || typeof state.equipment !== 'object' || Array.isArray(state.equipment)
    || !planSwap({ inventory: state.inventory, equipment: state.equipment,
      ...(state.flags !== undefined ? { flags: state.flags } : {}) }, 0, 0).ok) return false;
  const all = [
    ...state.inventory, ...Object.values(state.equipment), ...state.stash
  ].filter((item): item is Item => item !== null);
  return all.length === new Set(all.map(item => item.id)).size
    && state.stash.every(item => item === null || (
      typeof item.id === 'string' && item.id.length <= 128
    ));
}

function reject(reason: StashError): StashPlan { return { ok: false, reason }; }
function copyState(state: StashContents): {
  inventory: (Item | null)[]; stash: (Item | null)[];
  equipment: Equipment; flags: Record<string, ItemFlags>
} {
  return {
    inventory: state.inventory.map(cloneItem),
    stash: state.stash.map(cloneItem),
    equipment: Object.fromEntries(Object.entries(state.equipment)
      .map(([id, item]) => [id, cloneItem(item)])) as Equipment,
    flags: Object.fromEntries(Object.entries(state.flags ?? {})
      .map(([id, flags]) => [id, { ...flags }]))
  };
}

export function planStashDeposit(state: StashContents, bagIndex: number): StashPlan {
  if (!validateStashContents(state)) return reject('INVALID_STATE');
  if (!validIndex(bagIndex, state.inventory.length)) return reject('INVALID_INDEX');
  const item = state.inventory[bagIndex];
  if (!item) return reject('EMPTY_SLOT');
  if (state.flags?.[item.id]?.locked || state.flags?.[item.id]?.favorite)
    return reject('PROTECTED_ITEM');
  const index = state.stash.findIndex(slot => slot === null);
  if (index < 0) return reject('STASH_FULL');
  const next = copyState(state);
  next.stash[index] = next.inventory[bagIndex];
  next.inventory[bagIndex] = null;
  delete next.flags[item.id]; // unprotected default metadata; never leave an orphan
  return { ok: true, state: next };
}

export function planStashWithdraw(state: StashContents, stashIndex: number): StashPlan {
  if (!validateStashContents(state)) return reject('INVALID_STATE');
  if (!validIndex(stashIndex, state.stash.length)) return reject('INVALID_INDEX');
  const item = state.stash[stashIndex];
  if (!item) return reject('EMPTY_SLOT');
  const index = state.inventory.findIndex(slot => slot === null);
  if (index < 0) return reject('INVENTORY_FULL');
  const next = copyState(state);
  next.inventory[index] = next.stash[stashIndex];
  next.stash[stashIndex] = null;
  return { ok: true, state: next };
}
