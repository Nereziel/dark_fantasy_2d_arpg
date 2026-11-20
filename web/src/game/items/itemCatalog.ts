/**
 * Prompt 13 — independent, deterministic item catalog.
 * GPL-3.0-only. No UI, persistence, world or generator dependencies.
 *
 * Stable IDs are authoritative. Display code translates nameKey and grammarKey;
 * Czech affixes must be composed using locale-specific patterns, never by
 * concatenating English prefixes before base item names.
 */

export const EQUIPMENT_SLOTS = Object.freeze([
  'helmet', 'chest', 'gloves', 'boots', 'belt', 'amulet',
  'ring1', 'ring2', 'mainHand', 'offHand', 'relic', 'charm'
] as const);
export type CatalogSlot = (typeof EQUIPMENT_SLOTS)[number];

export const MAX_ITEM_LEVEL = 100;
export const MAX_SOCKETS = 6;
export const MAX_AFFIXES = 6;
const MAX_SELL_VALUE = 1_000_000_000;
const MAX_AFFIX_VALUE = 1_000_000;
const MAX_POWER_MAGNITUDE = 1_000_000;
const MAX_ID_LENGTH = 96;
const IDENTIFIER = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export const ITEM_RARITIES = Object.freeze({
  COMMON: Object.freeze({ rank: 0, maxAffixes: 0 }),
  UNCOMMON: Object.freeze({ rank: 1, maxAffixes: 2 }),
  RARE: Object.freeze({ rank: 2, maxAffixes: 4 }),
  EPIC: Object.freeze({ rank: 3, maxAffixes: 5 }),
  LEGENDARY: Object.freeze({ rank: 4, maxAffixes: 6 }),
  MYTHIC: Object.freeze({ rank: 5, maxAffixes: 6 })
} as const);
export type CatalogRarity = keyof typeof ITEM_RARITIES;

export interface WeaponDefinition {
  readonly twoHanded: boolean;
  readonly canMainHand: boolean;
  readonly canOffHand: boolean;
}
const weapon = (twoHanded: boolean, canMainHand: boolean, canOffHand: boolean): Readonly<WeaponDefinition> =>
  Object.freeze({ twoHanded, canMainHand, canOffHand });

/** Prompt 13 enumerates 13; SPEAR is the 14th required by Wave C. */
export const WEAPON_TYPES = Object.freeze({
  SWORD: weapon(false, true, true),
  GREATSWORD: weapon(true, true, false),
  AXE: weapon(false, true, true),
  GREATAXE: weapon(true, true, false),
  MACE: weapon(false, true, false),
  HAMMER: weapon(true, true, false),
  DAGGER: weapon(false, true, true),
  SPEAR: weapon(false, true, false),
  BOW: weapon(true, true, false),
  CROSSBOW: weapon(true, true, false),
  STAFF: weapon(true, true, false),
  WAND: weapon(false, true, false),
  SPELLBOOK: weapon(false, false, true),
  SHIELD: weapon(false, false, true)
} as const satisfies Record<string, Readonly<WeaponDefinition>>);
export type WeaponType = keyof typeof WEAPON_TYPES;

export type CatalogBaseCategory = 'weapon' | 'offhand' | 'armor' | 'accessory';
export interface CatalogItemBase {
  readonly id: string;
  readonly category: CatalogBaseCategory;
  readonly weaponType: WeaponType | null;
  readonly allowedSlots: readonly CatalogSlot[];
  readonly requiredLevel: number;
  readonly maxSockets: number;
  readonly sellValue: number;
  /** CS/EN key; translated strings must not be used as item IDs. */
  readonly nameKey: string;
  /** CS/EN grammatical forms and affix-order pattern lookup. */
  readonly grammarKey: string;
}

function base(id: string, category: CatalogBaseCategory, slots: readonly CatalogSlot[],
  weaponType: WeaponType | null, requiredLevel: number, maxSockets: number,
  sellValue: number): Readonly<CatalogItemBase> {
  return Object.freeze({
    id, category, weaponType, allowedSlots: Object.freeze([...slots]),
    requiredLevel, maxSockets, sellValue,
    nameKey: 'item.base.' + id + '.name',
    grammarKey: 'item.base.' + id + '.grammar'
  });
}

/** Legacy names are preserved where available for an explicit adapter. */
export const ITEM_BASES = Object.freeze({
  broadsword: base('broadsword', 'weapon', ['mainHand', 'offHand'], 'SWORD', 1, 2, 45),
  greatsword: base('greatsword', 'weapon', ['mainHand'], 'GREATSWORD', 8, 3, 130),
  axe: base('axe', 'weapon', ['mainHand', 'offHand'], 'AXE', 1, 2, 42),
  greataxe: base('greataxe', 'weapon', ['mainHand'], 'GREATAXE', 8, 3, 145),
  mace: base('mace', 'weapon', ['mainHand'], 'MACE', 1, 2, 44),
  hammer: base('hammer', 'weapon', ['mainHand'], 'HAMMER', 8, 3, 140),
  dagger: base('dagger', 'weapon', ['mainHand', 'offHand'], 'DAGGER', 1, 1, 38),
  spear: base('spear', 'weapon', ['mainHand'], 'SPEAR', 2, 2, 55),
  bow: base('bow', 'weapon', ['mainHand'], 'BOW', 2, 3, 65),
  crossbow: base('crossbow', 'weapon', ['mainHand'], 'CROSSBOW', 5, 3, 95),
  staff: base('staff', 'weapon', ['mainHand'], 'STAFF', 4, 3, 88),
  wand: base('wand', 'weapon', ['mainHand'], 'WAND', 1, 2, 51),
  spellbook: base('spellbook', 'offhand', ['offHand'], 'SPELLBOOK', 3, 1, 58),
  shield: base('shield', 'offhand', ['offHand'], 'SHIELD', 1, 2, 52),
  helm: base('helm', 'armor', ['helmet'], null, 1, 1, 28),
  hauberk: base('hauberk', 'armor', ['chest'], null, 1, 3, 68),
  gauntlets: base('gauntlets', 'armor', ['gloves'], null, 1, 1, 25),
  greaves: base('greaves', 'armor', ['boots'], null, 1, 1, 26),
  belt: base('belt', 'armor', ['belt'], null, 1, 1, 22),
  bloodstone: base('bloodstone', 'accessory', ['amulet'], null, 1, 0, 48),
  signet: base('signet', 'accessory', ['ring1', 'ring2'], null, 1, 0, 35),
  relic: base('relic', 'accessory', ['relic'], null, 10, 0, 150),
  charm: base('charm', 'accessory', ['charm'], null, 1, 0, 40)
} as const satisfies Record<string, CatalogItemBase>);
export type CatalogTemplateId = keyof typeof ITEM_BASES;

export const AFFIX_STATS = Object.freeze([
  'armor', 'minDamage', 'maxDamage', 'blockChance', 'strength',
  'dexterity', 'intelligence', 'vitality', 'willpower', 'critChance',
  'moveSpeed', 'attackSpeed', 'resistance', 'health', 'resource'
] as const);
export type CatalogAffixStat = (typeof AFFIX_STATS)[number];
export interface CatalogAffix {
  readonly id: string;
  readonly stat: CatalogAffixStat;
  readonly value: number;
  readonly tier: number;
}
export interface CatalogLegendaryPower {
  readonly id: string;
  readonly magnitude: number;
}
export interface CatalogItem {
  readonly instanceId: string;
  readonly templateId: CatalogTemplateId;
  readonly itemLevel: number;
  readonly requiredLevel: number;
  readonly rarity: CatalogRarity;
  /** Socket contents are stable gem instance IDs, or null for an empty socket. */
  readonly sockets: readonly (string | null)[];
  readonly affixes: readonly CatalogAffix[];
  readonly legendaryPower: CatalogLegendaryPower | null;
  readonly sellValue: number;
}
export type CatalogEquipment = Readonly<Partial<Record<CatalogSlot, CatalogItem | null>>>;
export type EquipFailure = 'INVALID_ITEM' | 'INVALID_SLOT' | 'INVALID_EQUIPMENT' |
  'SLOT_MISMATCH' | 'SLOT_OCCUPIED' | 'DUPLICATE_INSTANCE' | 'TWO_HANDED_CONFLICT';
export type EquipCompatibility = Readonly<{ ok: true } | { ok: false; reason: EquipFailure }>;

const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_ID_LENGTH && IDENTIFIER.test(value);
const boundedInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const boundedNumber = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && Object.getOwnPropertySymbols(value).length === 0
    && expected.every(key => own(value, key));
}
const isSlot = (slot: unknown): slot is CatalogSlot =>
  typeof slot === 'string' && EQUIPMENT_SLOTS.some(candidate => candidate === slot);
const isRarity = (rarity: unknown): rarity is CatalogRarity =>
  typeof rarity === 'string' && own(ITEM_RARITIES, rarity);

/** Invalid inputs are rejected explicitly; no fallback item or random roll. */
export function instantiateItemBase(templateId: string, instanceId: string, itemLevel: number): CatalogItem | null {
  if (typeof templateId !== 'string' || !own(ITEM_BASES, templateId)
      || !validId(instanceId) || !boundedInt(itemLevel, 1, MAX_ITEM_LEVEL)) return null;
  const definition = ITEM_BASES[templateId as CatalogTemplateId];
  if (itemLevel < definition.requiredLevel) return null;
  return Object.freeze({
    instanceId, templateId: templateId as CatalogTemplateId, itemLevel,
    requiredLevel: definition.requiredLevel, rarity: 'COMMON' as const,
    sockets: Object.freeze([] as (string | null)[]),
    affixes: Object.freeze([] as CatalogAffix[]), legendaryPower: null,
    sellValue: definition.sellValue
  });
}

/** Strict JSON-safe schema; never accepts nested arbitrary objects or cycles. */
export function validateCatalogItem(value: unknown): value is CatalogItem {
  if (!record(value) || !exactKeys(value, [
    'instanceId', 'templateId', 'itemLevel', 'requiredLevel', 'rarity',
    'sockets', 'affixes', 'legendaryPower', 'sellValue'
  ])) return false;
  const { instanceId, templateId, itemLevel, requiredLevel, rarity,
    sockets, affixes, legendaryPower, sellValue } = value;
  if (!validId(instanceId) || typeof templateId !== 'string' || !own(ITEM_BASES, templateId)
      || !boundedInt(itemLevel, 1, MAX_ITEM_LEVEL)
      || !boundedInt(requiredLevel, 1, itemLevel)
      || !isRarity(rarity) || !boundedInt(sellValue, 0, MAX_SELL_VALUE)) return false;
  const definition = ITEM_BASES[templateId as CatalogTemplateId];
  if (requiredLevel < definition.requiredLevel
      || !Array.isArray(sockets) || sockets.length > definition.maxSockets || sockets.length > MAX_SOCKETS
      || !Array.isArray(affixes) || affixes.length > MAX_AFFIXES
      || affixes.length > ITEM_RARITIES[rarity].maxAffixes) return false;
  const gems = new Set<string>();
  for (let index = 0; index < sockets.length; index++) {
    if (!own(sockets, String(index))) return false;
    const gem: unknown = sockets[index];
    if (gem === null) continue;
    if (!validId(gem) || gems.has(gem)) return false;
    gems.add(gem);
  }
  const affixIds = new Set<string>();
  for (let index = 0; index < affixes.length; index++) {
    if (!own(affixes, String(index))) return false;
    const affix: unknown = affixes[index];
    if (!record(affix) || !exactKeys(affix, ['id', 'stat', 'value', 'tier'])
        || !validId(affix.id) || affixIds.has(affix.id)
        || typeof affix.stat !== 'string' || !AFFIX_STATS.some(stat => stat === affix.stat)
        || !boundedNumber(affix.value, 0, MAX_AFFIX_VALUE)
        || !boundedInt(affix.tier, 1, 10)) return false;
    affixIds.add(affix.id);
  }
  if (legendaryPower !== null) {
    if (rarity !== 'LEGENDARY' && rarity !== 'MYTHIC') return false;
    if (!record(legendaryPower) || !exactKeys(legendaryPower, ['id', 'magnitude'])
        || !validId(legendaryPower.id)
        || !boundedNumber(legendaryPower.magnitude, 0, MAX_POWER_MAGNITUDE)) return false;
  }
  return true;
}

function supportsSlot(item: CatalogItem, slot: CatalogSlot): boolean {
  const definition = ITEM_BASES[item.templateId];
  if (!definition.allowedSlots.includes(slot)) return false;
  const weaponType = definition.weaponType;
  if (weaponType === null) return true;
  const weapon = WEAPON_TYPES[weaponType];
  return slot === 'mainHand' ? weapon.canMainHand : slot === 'offHand' && weapon.canOffHand;
}
function isTwoHanded(item: CatalogItem): boolean {
  const kind = ITEM_BASES[item.templateId].weaponType;
  return kind !== null && WEAPON_TYPES[kind].twoHanded;
}

/** Pure equipment gate. An atomic swap/replacement is an integrator command, not a silent side effect. */
export function equipmentCompatibility(item: CatalogItem, slot: CatalogSlot,
  equipment: CatalogEquipment): EquipCompatibility {
  if (!validateCatalogItem(item)) return { ok: false, reason: 'INVALID_ITEM' };
  if (!isSlot(slot)) return { ok: false, reason: 'INVALID_SLOT' };
  if (!record(equipment)) return { ok: false, reason: 'INVALID_EQUIPMENT' };
  const equipped = new Map<CatalogSlot, CatalogItem>();
  const usedIds = new Set<string>();
  for (const [key, current] of Object.entries(equipment)) {
    if (!isSlot(key) || (current !== null && !validateCatalogItem(current))) {
      return { ok: false, reason: 'INVALID_EQUIPMENT' };
    }
    if (current === null) continue;
    if (!supportsSlot(current, key) || usedIds.has(current.instanceId)) {
      return { ok: false, reason: 'INVALID_EQUIPMENT' };
    }
    usedIds.add(current.instanceId);
    equipped.set(key, current);
  }
  const mainHand = equipped.get('mainHand');
  const offHand = equipped.get('offHand');
  if (mainHand && offHand && isTwoHanded(mainHand)) {
    return { ok: false, reason: 'INVALID_EQUIPMENT' };
  }
  if (!supportsSlot(item, slot)) return { ok: false, reason: 'SLOT_MISMATCH' };
  if ([...equipped].some(([equippedSlot, current]) =>
    equippedSlot !== slot && current.instanceId === item.instanceId)) {
    return { ok: false, reason: 'DUPLICATE_INSTANCE' };
  }
  if (equipped.has(slot)) return { ok: false, reason: 'SLOT_OCCUPIED' };
  if ((slot === 'mainHand' && isTwoHanded(item) && offHand)
      || (slot === 'offHand' && mainHand && isTwoHanded(mainHand))) {
    return { ok: false, reason: 'TWO_HANDED_CONFLICT' };
  }
  return { ok: true };
}
