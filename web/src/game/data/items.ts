/** Item templates, rarities and affixes ported from the original ItemGenerator. */
export { deriveStats } from '../stats/deriveStats';
import type { ClassId } from './classes';
import { ITEM_BASES, ITEM_RARITIES, WEAPON_TYPES, type WeaponType, type CatalogTemplateId } from '../items/itemCatalog';
import { classLootBase } from '../items/classWeapons';
import { rollAffixes, type AffixStat } from '../items/affixGeneration';
import { isGemId } from '../gems/gemCatalog';
export type { DerivedStats } from '../stats/deriveStats';

export type EquipmentSlot = 'HELMET' | 'AMULET' | 'CHEST' | 'MAIN_HAND' | 'OFF_HAND' |
  'GLOVES' | 'BELT' | 'BOOTS' | 'RING_1' | 'RING_2' | 'RELIC' | 'CHARM';
export type RarityId = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';
export type ItemStat = 'armor' | 'minDmg' | 'maxDmg' | 'blockChance' | AffixStat | 'resource' | 'willpower';
export interface ItemAffix { id: string; stat: ItemStat; value: number; tier?: number; kind?: 'prefix' | 'suffix' }
export interface Item {
  id: string;
  templateId: string;
  slot: EquipmentSlot;
  rarity: RarityId;
  level: number;
  icon: string;
  armor: number;
  minDmg: number;
  maxDmg: number;
  block: number;
  affixes: ItemAffix[];
  /** Permanent blacksmith tempering level (0–3). */
  upgrades: number;
  /** Catalog-driven permanent metadata. Old v8 items omit these fields. */
  requiredLevel?: number;
  weaponType?: WeaponType;
  twoHanded?: boolean;
  sockets?: Array<string | null>;
  legendaryPower?: { id: string; magnitude: number } | null;
}
export interface GroundItem { id: string; x: number; y: number; item: Item }
export type Equipment = Record<EquipmentSlot, Item | null>;

interface ItemTemplate {
  id: string; slot: EquipmentSlot; icon: string;
  armor?: number; minDmg?: number; maxDmg?: number; block?: number;
}
interface AffixDefinition {
  id: string; stat: ItemStat; min: number; max: number; floating?: boolean;
}
export const ITEM_TEMPLATES: readonly ItemTemplate[] = [
  { id: 'broadsword', slot: 'MAIN_HAND', icon: '⚔', minDmg: 10, maxDmg: 18 },
  { id: 'shield', slot: 'OFF_HAND', icon: '⬡', armor: 14, block: 12 },
  { id: 'hauberk', slot: 'CHEST', icon: '♜', armor: 28 },
  { id: 'helm', slot: 'HELMET', icon: '♟', armor: 16 },
  { id: 'gauntlets', slot: 'GLOVES', icon: '✊', armor: 10 },
  { id: 'greaves', slot: 'BOOTS', icon: '❖', armor: 12 },
  { id: 'belt', slot: 'BELT', icon: '◈', armor: 8 },
  { id: 'bloodstone', slot: 'AMULET', icon: '◇' },
  { id: 'signet', slot: 'RING_1', icon: '◉' },
  { id: 'greatsword', slot: 'MAIN_HAND', icon: '⚔', minDmg: 21, maxDmg: 37 },
  { id: 'axe', slot: 'MAIN_HAND', icon: '⚒', minDmg: 12, maxDmg: 21 },
  { id: 'greataxe', slot: 'MAIN_HAND', icon: '⚒', minDmg: 24, maxDmg: 41 },
  { id: 'mace', slot: 'MAIN_HAND', icon: '✦', minDmg: 11, maxDmg: 19 },
  { id: 'hammer', slot: 'MAIN_HAND', icon: '⚒', minDmg: 23, maxDmg: 40 },
  { id: 'dagger', slot: 'MAIN_HAND', icon: '⚔', minDmg: 7, maxDmg: 14 },
  { id: 'spear', slot: 'MAIN_HAND', icon: '⚔', minDmg: 13, maxDmg: 23 },
  { id: 'bow', slot: 'MAIN_HAND', icon: '➳', minDmg: 13, maxDmg: 24 },
  { id: 'crossbow', slot: 'MAIN_HAND', icon: '➳', minDmg: 17, maxDmg: 29 },
  { id: 'staff', slot: 'MAIN_HAND', icon: '⚚', minDmg: 12, maxDmg: 22 },
  { id: 'wand', slot: 'MAIN_HAND', icon: '✧', minDmg: 8, maxDmg: 17 },
  { id: 'spellbook', slot: 'OFF_HAND', icon: '▣', minDmg: 2, maxDmg: 5 },
  { id: 'relic', slot: 'RELIC', icon: '✧' },
  { id: 'charm', slot: 'CHARM', icon: '◇' }
];
export const RARITIES: Record<RarityId, { mult: number; color: string; affixes: number }> = {
  COMMON: { mult: 1, color: '#a1aab4', affixes: 0 },
  UNCOMMON: { mult: 1.25, color: '#53b481', affixes: 1 },
  RARE: { mult: 1.6, color: '#e3bc61', affixes: 3 },
  EPIC: { mult: 2, color: '#c58ee2', affixes: 4 },
  LEGENDARY: { mult: 2.6, color: '#f6a35b', affixes: 5 },
  MYTHIC: { mult: 3.25, color: '#f16f9c', affixes: 6 }
};
const PREFIXES: readonly AffixDefinition[] = [
  { id: 'stalwart', stat: 'armor', min: 8, max: 22 },
  { id: 'savage', stat: 'minDmg', min: 4, max: 10 },
  { id: 'fiery', stat: 'strength', min: 2, max: 6 },
  { id: 'brisk', stat: 'moveSpeed', min: 3, max: 8 },
  { id: 'vampiric', stat: 'vitality', min: 3, max: 7 }
];
const SUFFIXES: readonly AffixDefinition[] = [
  { id: 'falcon', stat: 'critChance', min: 1.5, max: 4, floating: true },
  { id: 'titan', stat: 'vitality', min: 4, max: 9 },
  { id: 'warding', stat: 'blockChance', min: 2.5, max: 6, floating: true },
  { id: 'haste', stat: 'moveSpeed', min: 3, max: 8 },
  { id: 'bear', stat: 'strength', min: 3, max: 8 }
];

/** Local, serializable LCG. Seed and state survive game saves. */
export class SeededRng {
  constructor(public state = 0x49ac127b) {}
  next(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }
  index(length: number): number {
    return Math.floor(this.next() * length);
  }
}
export function createEquipment(): Equipment {
  return {
    HELMET: null, AMULET: null, CHEST: null, MAIN_HAND: null,
    OFF_HAND: null, GLOVES: null, BELT: null, BOOTS: null,
    RING_1: null, RING_2: null, RELIC: null, CHARM: null
  };
}
/** One catalog-backed generator shared by kills, chests and curated boss rewards. */
export function rollItemForBase(
  templateId: string, instanceId: string, itemLevel: number, rarity: RarityId, rng: SeededRng,
  classId?: ClassId
): Item | null {
  const template = ITEM_TEMPLATES.find(entry => entry.id === templateId);
  const base = Object.hasOwn(ITEM_BASES, templateId)
    ? ITEM_BASES[templateId as keyof typeof ITEM_BASES] : null;
  if (!template || !base || !Number.isSafeInteger(itemLevel)
      || itemLevel < base.requiredLevel || itemLevel > 100
      || typeof instanceId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(instanceId)
      || !Object.hasOwn(RARITIES, rarity) || !rng || typeof rng.next !== 'function') return null;
  const weaponType = base.weaponType ?? undefined;
  const hand = weaponType ? WEAPON_TYPES[weaponType] : undefined;
  const tags = (templateId === 'shield' ? ['shield']
    : base.category === 'accessory' ? ['jewelry']
      : base.category === 'armor' ? ['armor']
        : ['weapon', ...(['WAND','STAFF','SPELLBOOK'].includes(weaponType ?? '') ? ['caster']
          : ['BOW','CROSSBOW'].includes(weaponType ?? '') ? ['ranged'] : ['melee'])]) as
    Array<'weapon' | 'armor' | 'jewelry' | 'shield' | 'caster' | 'ranged' | 'melee' | 'paladin'
      | 'mage.fire' | 'mage.frost' | 'mage.lightning' | 'mage.arcane'>;
  // Paladin-exclusive affixes are eligible on melee weapons only; other classes
  // keep their exact historical deterministic RNG progression.
  if (classId === 'PALADIN' && tags.includes('weapon') && tags.includes('melee'))
    tags.push('paladin');
  // Only Mage caster equipment may roll school-specialized affixes.
  if (classId === 'MAGE' && tags.includes('weapon') && tags.includes('caster'))
    tags.push('mage.fire', 'mage.frost', 'mage.lightning', 'mage.arcane');
  // MYTHIC shares the top tier but retains its separate rarity and six-affix cap.
  const rolled = rollAffixes({
    rarity: rarity === 'MYTHIC' ? 'LEGENDARY' : rarity,
    itemLevel, tags,
    ...(classId==='PALADIN'?{preferredStats:['strength','vitality','resourceRegen'] as const}
      :classId==='MAGE'?{preferredStats:['intelligence','resourceRegen','fireDamage','skillRank'] as const}
      :{})
  }, rng);
  const mult = RARITIES[rarity].mult;
  const socketCount = Math.min(base.maxSockets,
    rarity === 'MYTHIC' ? 3 : rarity === 'LEGENDARY' ? 2 : rarity === 'RARE' || rarity === 'EPIC' ? 1 : 0);
  return {
    id: instanceId, templateId, slot: template.slot, rarity, level: itemLevel, icon: template.icon,
    armor: Math.round((template.armor ?? 0) * mult),
    minDmg: Math.round((template.minDmg ?? 0) * mult),
    maxDmg: Math.round((template.maxDmg ?? 0) * mult),
    block: template.block ?? 0,
    affixes: rolled.map(affix => ({ id: affix.id, stat: affix.stat,
      value: affix.value, tier: affix.tier, kind: affix.kind })),
    upgrades: 0, requiredLevel: base.requiredLevel,
    ...(weaponType ? { weaponType, twoHanded: hand?.twoHanded ?? false } : {}),
    sockets: Array<string | null>(socketCount).fill(null),
    legendaryPower: rarity === 'LEGENDARY' || rarity === 'MYTHIC'
      ? { id: 'power.' + templateId, magnitude: Math.round(itemLevel * mult + 5) } : null
  };
}

/** Legacy generator API preserved for existing callers and deterministic tests. */
export function rollItem(killIndex: number, level: number, rng: SeededRng, classId?:ClassId): Item {
  const validLevel = Number.isSafeInteger(level) ? Math.min(100, Math.max(1, level)) : 1;
  const available = ITEM_TEMPLATES.filter(template =>
    ITEM_BASES[template.id as keyof typeof ITEM_BASES].requiredLevel <= validLevel);
  const template = available[rng.index(available.length)]!;
  const chance = rng.next();
  const rarity: RarityId = chance < 0.45 ? 'COMMON' : chance < 0.75 ? 'UNCOMMON'
    : chance < 0.90 ? 'RARE' : chance < 0.98 ? 'EPIC'
      : chance < (validLevel >= 60 ? 0.997 : 1) ? 'LEGENDARY' : 'MYTHIC';
  const id=classId?classLootBase(classId,template.id as CatalogTemplateId,validLevel):template.id;
  return rollItemForBase(id, 'loot-' + killIndex, validLevel, rarity, rng,classId)!;
}

export function isEquipmentSlot(value: unknown): value is EquipmentSlot {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(createEquipment(), value);
}
export function isItem(value: unknown): value is Item {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<Item>;
  const base = typeof v.templateId === 'string' && Object.hasOwn(ITEM_BASES, v.templateId)
    ? ITEM_BASES[v.templateId as keyof typeof ITEM_BASES] : null;
  return !!base && typeof v.id === 'string' && v.id.length > 0
    && ITEM_TEMPLATES.some(t => t.id === v.templateId && t.slot === v.slot)
    && typeof v.rarity === 'string' && Object.hasOwn(RARITIES, v.rarity)
    && Number.isSafeInteger(v.level) && (v.level ?? 0) >= 1
    && typeof v.icon === 'string'
    && Number.isSafeInteger(v.upgrades) && (v.upgrades ?? -1) >= 0 && (v.upgrades ?? 4) <= 3
    && [v.armor, v.minDmg, v.maxDmg, v.block].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)
    && Array.isArray(v.affixes) && v.affixes.length <= 6
    && v.affixes.length <= ITEM_RARITIES[v.rarity as RarityId].maxAffixes
    && v.affixes.every((_, index) => Object.hasOwn(v.affixes!, index))
    && v.affixes.every((a: ItemAffix) => typeof a?.id === 'string'
      && typeof a.stat === 'string' && Number.isFinite(a.value) && a.value >= 0
      && (a.tier === undefined || (Number.isSafeInteger(a.tier) && a.tier >= 1 && a.tier <= 6))
      && (a.kind === undefined || a.kind === 'prefix' || a.kind === 'suffix'))
    && (v.requiredLevel === undefined || (Number.isSafeInteger(v.requiredLevel)
      && v.requiredLevel >= base.requiredLevel && v.requiredLevel <= 100))
    && (v.weaponType === undefined || v.weaponType === base.weaponType)
    && (v.twoHanded === undefined || v.twoHanded === (base.weaponType
      ? WEAPON_TYPES[base.weaponType].twoHanded : false))
    && (v.sockets === undefined || (Array.isArray(v.sockets)
      && v.sockets.length <= (ITEM_BASES[v.templateId as keyof typeof ITEM_BASES]?.maxSockets ?? 0)
      && v.sockets.every((gem, index) => Object.hasOwn(v.sockets!, index)
        && (gem === null || isGemId(gem)))))
    && (v.legendaryPower === undefined || v.legendaryPower === null
      || (v.legendaryPower.id === 'power.' + v.templateId
        && Number.isFinite(v.legendaryPower.magnitude)
        && v.legendaryPower.magnitude >= 0 && v.legendaryPower.magnitude <= 1_000_000));
}
