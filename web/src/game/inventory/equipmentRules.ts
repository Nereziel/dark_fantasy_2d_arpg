/**
 * GPL-3.0-only — Pure, immutable inventory transactions for Prompt 15.
 *
 * This module deliberately uses the existing data/items.ts Item and Equipment
 * shapes. Handedness, requirements and item flags are external metadata until
 * the coordinator integrates the new catalog, commands and character save.
 */
import {
  createEquipment, deriveStats, isEquipmentSlot, isItem,
  type DerivedStats, type Equipment, type EquipmentSlot, type Item,
  type RarityId
} from '../data/items';
import { isClassId, type ClassId } from '../data/classes';
import { ITEM_BASES, WEAPON_TYPES } from '../items/itemCatalog';

const SLOTS = Object.keys(createEquipment()) as EquipmentSlot[];
const RARITY_ORDER: readonly RarityId[] = [
  'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'
];
const AFFIX_STATS = new Set([
  'armor', 'minDmg', 'maxDmg', 'blockChance', 'strength',
  'dexterity', 'vitality', 'critChance', 'moveSpeed',
  'intelligence', 'willpower', 'critDamage', 'attackSpeed', 'fireDamage',
  'physicalDamage', 'poisonDamage', 'fireResistance', 'coldResistance',
  'poisonResistance', 'maxHealth', 'resourceRegen', 'cooldownReduction',
  'skillRank', 'summonDamage', 'resource'
]);
const MAX_INVENTORY = 200;
const MAX_LEVEL = 10000;
const MAX_ID_LENGTH = 128;
const MAX_GEAR_VALUE = 10_000_000;
const MAX_AFFIX_VALUE = 1_000_000;

export interface ItemFlags {
  readonly locked: boolean;
  readonly favorite: boolean;
}

export interface InventoryState {
  readonly inventory: readonly (Item | null)[];
  readonly equipment: Readonly<Equipment>;
  /** Optional item-instance metadata keyed by stable Item.id, not slot. */
  readonly flags?: Readonly<Record<string, ItemFlags>>;
}

export interface EquipmentRules {
  /** Explicit character level, required whenever requiredLevelsById is set. */
  readonly playerLevel?: number;
  /** Required level per item INSTANCE. Never infer it from Item.level. */
  readonly requiredLevelsById?: Readonly<Record<string, number>>;
  /** Item instance IDs of two-handed main-hand weapons. */
  readonly twoHandedItemIds?: readonly string[];
}

export type InventoryError =
  | 'INVALID_STATE' | 'DUPLICATE_ID' | 'INVALID_RULES'
  | 'INVALID_INDEX' | 'EMPTY_SLOT' | 'INVALID_SLOT'
  | 'INCOMPATIBLE_SLOT' | 'INVENTORY_FULL' | 'HAND_CONFLICT'
  | 'LEVEL_REQUIRED' | 'PROTECTED_ITEM' | 'ITEM_NOT_FOUND'
  | 'INVALID_FILTER' | 'INVALID_CLASS';

export type PlanFailure = { readonly ok: false; readonly reason: InventoryError };
export type PlanResult = { readonly ok: true; readonly state: InventoryState } | PlanFailure;
export type DropResult =
  | { readonly ok: true; readonly state: InventoryState; readonly dropped: Item }
  | PlanFailure;

export interface InventoryFilter {
  readonly rarity?: RarityId;
  /** Ring queries accept either ring item template for RING_1/RING_2. */
  readonly slot?: EquipmentSlot;
  readonly templateId?: string;
  readonly favorite?: boolean;
  readonly locked?: boolean;
}

export interface InventoryMatch {
  readonly index: number;
  readonly item: Item;
  readonly flags: ItemFlags;
}

export type FilterResult =
  | { readonly ok: true; readonly matches: InventoryMatch[] }
  | PlanFailure;

type RawStats = Pick<Item, 'armor' | 'minDmg' | 'maxDmg' | 'block'>;
export interface StatProjection<T> {
  readonly before: T;
  readonly after: T;
  readonly delta: T;
}

export interface EquipmentComparison {
  readonly base: StatProjection<RawStats>;
  readonly derived: StatProjection<DerivedStats>;
}

export type ComparisonResult =
  | { readonly ok: true; readonly comparison: EquipmentComparison }
  | PlanFailure;

type MutableInventoryState = {
  inventory: (Item | null)[];
  equipment: Equipment;
  flags: Record<string, ItemFlags>;
};

const fail = (reason: InventoryError): PlanFailure => ({ ok: false, reason });

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isStableId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
    && value.length <= MAX_ID_LENGTH && value.trim() === value;
}

function validItem(item: unknown): item is Item {
  if (!isItem(item)) return false;
  return isStableId(item.id) && isStableId(item.templateId)
    && RARITY_ORDER.includes(item.rarity)
    && item.level <= MAX_LEVEL
    && item.armor <= MAX_GEAR_VALUE && item.minDmg <= MAX_GEAR_VALUE
    && item.maxDmg <= MAX_GEAR_VALUE && item.block <= MAX_GEAR_VALUE
    && item.maxDmg >= item.minDmg
    && item.affixes.every(affix =>
      isStableId(affix.id) && AFFIX_STATS.has(affix.stat)
      && affix.value <= MAX_AFFIX_VALUE);
}

function validRules(rules?: EquipmentRules): boolean {
  if (rules === undefined) return true;
  if (!isRecord(rules)) return false;
  const playerLevel: unknown = rules.playerLevel;
  if (playerLevel !== undefined &&
    (typeof playerLevel !== 'number' || !Number.isSafeInteger(playerLevel)
      || playerLevel < 1 || playerLevel > MAX_LEVEL)) return false;
  if (rules.requiredLevelsById !== undefined) {
    if (!isRecord(rules.requiredLevelsById) || rules.playerLevel === undefined) return false;
    for (const [id, level] of Object.entries(rules.requiredLevelsById)) {
      if (!isStableId(id) || typeof level !== 'number'
        || !Number.isSafeInteger(level) || level < 1 || level > MAX_LEVEL) return false;
    }
  }
  if (rules.twoHandedItemIds !== undefined) {
    const ids = rules.twoHandedItemIds;
    if (!Array.isArray(ids) || ids.length > MAX_INVENTORY + SLOTS.length
      || !ids.every(isStableId) || new Set(ids).size !== ids.length) return false;
  }
  return true;
}

function ringSlot(slot: EquipmentSlot): boolean {
  return slot === 'RING_1' || slot === 'RING_2';
}

function compatibleSlot(item: Item, slot: EquipmentSlot): boolean {
  if (item.slot === slot || (ringSlot(item.slot) && ringSlot(slot))) return true;
  const base = ITEM_BASES[item.templateId as keyof typeof ITEM_BASES];
  return slot === 'OFF_HAND' && item.slot === 'MAIN_HAND' && !!base?.weaponType
    && WEAPON_TYPES[base.weaponType].canOffHand;
}

function isTwoHanded(item: Item | null, rules?: EquipmentRules): boolean {
  if (item === null) return false;
  const base = ITEM_BASES[item.templateId as keyof typeof ITEM_BASES];
  return (rules?.twoHandedItemIds?.includes(item.id) ?? false)
    || (base?.weaponType ? WEAPON_TYPES[base.weaponType].twoHanded : false);
}

function validateState(input: InventoryState, rules?: EquipmentRules): InventoryError | null {
  if (!validRules(rules)) return 'INVALID_RULES';
  if (!isRecord(input) || !Array.isArray(input.inventory)
    || input.inventory.length < 1 || input.inventory.length > MAX_INVENTORY
    || !isRecord(input.equipment)) return 'INVALID_STATE';

  const equipment = input.equipment;
  if (Object.keys(equipment).length !== SLOTS.length
    || !SLOTS.every(slot => Object.hasOwn(equipment, slot))) return 'INVALID_STATE';

  const seen = new Set<string>();
  const recordItem = (item: unknown): InventoryError | null => {
    if (item === null) return null;
    if (!validItem(item)) return 'INVALID_STATE';
    if (seen.has(item.id)) return 'DUPLICATE_ID';
    seen.add(item.id);
    return null;
  };

  for (let index = 0; index < input.inventory.length; index++) {
    if (!Object.hasOwn(input.inventory, index)) return 'INVALID_STATE';
    const problem = recordItem(input.inventory[index]);
    if (problem) return problem;
  }
  for (const slot of SLOTS) {
    const item = equipment[slot];
    const problem = recordItem(item);
    if (problem) return problem;
    if (item !== null && !compatibleSlot(item, slot)) return 'INVALID_STATE';
  }

  if (isTwoHanded(equipment.MAIN_HAND, rules) && equipment.OFF_HAND !== null) {
    return 'INVALID_STATE';
  }

  if (input.flags !== undefined) {
    if (!isRecord(input.flags) || Object.keys(input.flags).length > seen.size) {
      return 'INVALID_STATE';
    }
    for (const [id, flags] of Object.entries(input.flags)) {
      if (!seen.has(id) || !isRecord(flags)
        || typeof flags.locked !== 'boolean'
        || typeof flags.favorite !== 'boolean') return 'INVALID_STATE';
    }
  }
  return null;
}

function cloneItem(item: Item | null): Item | null {
  return item === null ? null : {
    ...item,
    affixes: item.affixes.map(affix => ({ ...affix }))
  };
}

function cloneEquipment(equipment: Readonly<Equipment>): Equipment {
  const copy = createEquipment();
  for (const slot of SLOTS) copy[slot] = cloneItem(equipment[slot]);
  return copy;
}

function cloneState(input: InventoryState): MutableInventoryState {
  return {
    inventory: input.inventory.map(cloneItem),
    equipment: cloneEquipment(input.equipment),
    // Object.fromEntries avoids a __proto__ assignment on untrusted item IDs.
    flags: Object.fromEntries(
      Object.entries(input.flags ?? {}).map(([id, flags]) => [id, { ...flags }])
    ) as Record<string, ItemFlags>
  };
}

function validIndex(index: unknown, inventory: readonly (Item | null)[]): index is number {
  return Number.isSafeInteger(index) && (index as number) >= 0
    && (index as number) < inventory.length;
}

/** Equip an inventory item into its canonical slot, or a selected ring slot. */
export function planEquip(
  input: InventoryState,
  index: number,
  targetSlot?: EquipmentSlot,
  rules?: EquipmentRules
): PlanResult {
  const error = validateState(input, rules);
  if (error) return fail(error);
  if (!validIndex(index, input.inventory)) return fail('INVALID_INDEX');

  const incoming = input.inventory[index];
  if (incoming === null) return fail('EMPTY_SLOT');
  const slot = targetSlot === undefined ? incoming.slot : targetSlot;
  if (!isEquipmentSlot(slot)) return fail('INVALID_SLOT');
  if (!compatibleSlot(incoming, slot)) return fail('INCOMPATIBLE_SLOT');
  if (slot === 'OFF_HAND' && isTwoHanded(input.equipment.MAIN_HAND, rules)) {
    return fail('HAND_CONFLICT');
  }

  const requirements = rules?.requiredLevelsById;
  if (requirements && Object.hasOwn(requirements, incoming.id)
    && (rules?.playerLevel ?? 0) < requirements[incoming.id]!) {
    return fail('LEVEL_REQUIRED');
  }

  const draft = cloneState(input);
  const displaced = draft.equipment[slot];
  draft.equipment[slot] = draft.inventory[index];
  draft.inventory[index] = displaced;

  if (slot === 'MAIN_HAND' && isTwoHanded(draft.equipment.MAIN_HAND, rules)
    && draft.equipment.OFF_HAND !== null) {
    const freeIndex = draft.inventory.findIndex(item => item === null);
    if (freeIndex < 0) return fail('INVENTORY_FULL');
    draft.inventory[freeIndex] = draft.equipment.OFF_HAND;
    draft.equipment.OFF_HAND = null;
  }

  return { ok: true, state: draft };
}

/** Unequip into the first empty bag cell. A full bag leaves everything intact. */
export function planUnequip(
  input: InventoryState,
  slot: EquipmentSlot,
  rules?: EquipmentRules
): PlanResult {
  const error = validateState(input, rules);
  if (error) return fail(error);
  if (!isEquipmentSlot(slot)) return fail('INVALID_SLOT');
  if (input.equipment[slot] === null) return fail('EMPTY_SLOT');
  const freeIndex = input.inventory.findIndex(item => item === null);
  if (freeIndex < 0) return fail('INVENTORY_FULL');
  const draft = cloneState(input);
  draft.inventory[freeIndex] = draft.equipment[slot];
  draft.equipment[slot] = null;
  return { ok: true, state: draft };
}

/** Bag-to-bag swap, including exchanges with empty cells. */
export function planSwap(
  input: InventoryState,
  fromIndex: number,
  toIndex: number,
  rules?: EquipmentRules
): PlanResult {
  const error = validateState(input, rules);
  if (error) return fail(error);
  if (!validIndex(fromIndex, input.inventory) || !validIndex(toIndex, input.inventory)) {
    return fail('INVALID_INDEX');
  }
  const draft = cloneState(input);
  [draft.inventory[fromIndex], draft.inventory[toIndex]] =
    [draft.inventory[toIndex]!, draft.inventory[fromIndex]!];
  return { ok: true, state: draft };
}

/**
 * Drop from bag only. Locked or favorited items are protected; the caller may
 * submit the detached dropped item to the authoritative world command later.
 */
export function planDrop(
  input: InventoryState,
  index: number,
  rules?: EquipmentRules
): DropResult {
  const error = validateState(input, rules);
  if (error) return fail(error);
  if (!validIndex(index, input.inventory)) return fail('INVALID_INDEX');
  const item = input.inventory[index];
  if (item === null) return fail('EMPTY_SLOT');
  const flags = Object.hasOwn(input.flags ?? {}, item.id) ? input.flags![item.id] : undefined;
  if (flags?.locked || flags?.favorite) return fail('PROTECTED_ITEM');
  const draft = cloneState(input);
  const dropped = cloneItem(item)!;
  draft.inventory[index] = null;
  delete draft.flags[item.id];
  return { ok: true, state: draft, dropped };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Stable, locale-independent sort: rarity DESC, level DESC, template ID, item ID. */
export function sortInventory(
  input: InventoryState,
  rules?: EquipmentRules
): PlanResult {
  const error = validateState(input, rules);
  if (error) return fail(error);
  const draft = cloneState(input);
  const occupied = draft.inventory.filter((item): item is Item => item !== null);
  occupied.sort((left, right) =>
    RARITY_ORDER.indexOf(right.rarity) - RARITY_ORDER.indexOf(left.rarity)
    || right.level - left.level
    || compareText(left.templateId, right.templateId)
    || compareText(left.id, right.id));
  draft.inventory = [
    ...occupied,
    ...Array<null>(input.inventory.length - occupied.length).fill(null)
  ];
  return { ok: true, state: draft };
}

function validFilter(filter: InventoryFilter): boolean {
  if (!isRecord(filter)) return false;
  if (filter.rarity !== undefined &&
    (typeof filter.rarity !== 'string'
      || !RARITY_ORDER.some(rarity => rarity === filter.rarity))) return false;
  if (filter.slot !== undefined && !isEquipmentSlot(filter.slot)) return false;
  if (filter.templateId !== undefined && !isStableId(filter.templateId)) return false;
  if (filter.favorite !== undefined && typeof filter.favorite !== 'boolean') return false;
  if (filter.locked !== undefined && typeof filter.locked !== 'boolean') return false;
  return true;
}

/** Returns an indexed, detached read-only view; filtering never reorders slots. */
export function filterInventory(
  input: InventoryState,
  filter: InventoryFilter = {},
  rules?: EquipmentRules
): FilterResult {
  const error = validateState(input, rules);
  if (error) return fail(error);
  if (!validFilter(filter)) return fail('INVALID_FILTER');
  const matches: InventoryMatch[] = [];
  for (let index = 0; index < input.inventory.length; index++) {
    const item = input.inventory[index];
    if (item === null) continue;
    const flags = Object.hasOwn(input.flags ?? {}, item.id) ? input.flags![item.id] : undefined;
    const projection = { locked: flags?.locked ?? false, favorite: flags?.favorite ?? false };
    if (filter.rarity !== undefined && item.rarity !== filter.rarity) continue;
    if (filter.slot !== undefined && !compatibleSlot(item, filter.slot)) continue;
    if (filter.templateId !== undefined && item.templateId !== filter.templateId) continue;
    if (filter.favorite !== undefined && projection.favorite !== filter.favorite) continue;
    if (filter.locked !== undefined && projection.locked !== filter.locked) continue;
    matches.push({ index, item: cloneItem(item)!, flags: projection });
  }
  return { ok: true, matches };
}

/** Set explicit metadata; equipping or sorting an item preserves the flags. */
export function favoriteOrLockItem(
  input: InventoryState,
  itemId: string,
  flag: 'favorite' | 'locked',
  value: boolean,
  rules?: EquipmentRules
): PlanResult {
  const error = validateState(input, rules);
  if (error) return fail(error);
  if (!isStableId(itemId) || (flag !== 'favorite' && flag !== 'locked')
    || typeof value !== 'boolean') return fail('INVALID_RULES');
  const exists = input.inventory.some(item => item?.id === itemId)
    || SLOTS.some(slot => input.equipment[slot]?.id === itemId);
  if (!exists) return fail('ITEM_NOT_FOUND');

  const draft = cloneState(input);
  const old = Object.hasOwn(draft.flags, itemId)
    ? draft.flags[itemId]! : { locked: false, favorite: false };
  const next: ItemFlags = { ...old, [flag]: value };
  if (!next.locked && !next.favorite) delete draft.flags[itemId];
  else Object.defineProperty(draft.flags, itemId, {
    value: next, writable: true, configurable: true, enumerable: true
  });
  return { ok: true, state: draft };
}

function rawEquipmentStats(equipment: Readonly<Equipment>): RawStats {
  const result: RawStats = { armor: 0, minDmg: 0, maxDmg: 0, block: 0 };
  for (const slot of SLOTS) {
    const item = equipment[slot];
    if (item === null) continue;
    result.armor += item.armor;
    result.minDmg += item.minDmg;
    result.maxDmg += item.maxDmg;
    result.block += item.block;
  }
  return result;
}

function statDifference<T extends object>(before: T, after: T): T {
  return Object.fromEntries(
    (Object.keys(before) as Array<keyof T>).map(key => [
      key, (after[key] as number) - (before[key] as number)
    ])
  ) as T;
}

/**
 * Comparison-only projection. No Player.stats mutation: source-of-truth
 * derives all numeric stats from the equipment snapshot supplied by the owner.
 */
export function compareEquipment(
  classId: ClassId,
  before: Equipment,
  after: Equipment,
  rules?: EquipmentRules
): ComparisonResult {
  if (!isClassId(classId)) return fail('INVALID_CLASS');
  const beforeError = validateState({ inventory: [null], equipment: before }, rules);
  if (beforeError) return fail(beforeError);
  const afterError = validateState({ inventory: [null], equipment: after }, rules);
  if (afterError) return fail(afterError);

  const baseBefore = rawEquipmentStats(before);
  const baseAfter = rawEquipmentStats(after);
  const derivedBefore = deriveStats(classId, cloneEquipment(before));
  const derivedAfter = deriveStats(classId, cloneEquipment(after));
  return {
    ok: true,
    comparison: {
      base: {
        before: baseBefore, after: baseAfter,
        delta: statDifference(baseBefore, baseAfter)
      },
      derived: {
        before: derivedBefore, after: derivedAfter,
        delta: statDifference(derivedBefore, derivedAfter)
      }
    }
  };
}
