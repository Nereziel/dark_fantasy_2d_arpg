/** Item templates, rarities and affixes ported from the original ItemGenerator. */
import type { ClassId, PrimaryStats } from './classes';
import { CLASSES } from './classes';

export type EquipmentSlot = 'HELMET' | 'AMULET' | 'CHEST' | 'MAIN_HAND' | 'OFF_HAND' |
  'GLOVES' | 'BELT' | 'BOOTS' | 'RING_1' | 'RING_2';
export type RarityId = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export type ItemStat = 'armor' | 'minDmg' | 'maxDmg' | 'blockChance' | 'strength' |
  'dexterity' | 'vitality' | 'critChance' | 'moveSpeed';
export interface ItemAffix { id: string; stat: ItemStat; value: number }
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
  { id: 'signet', slot: 'RING_1', icon: '◉' }
];
export const RARITIES: Record<RarityId, { mult: number; color: string; affixes: number }> = {
  COMMON: { mult: 1, color: '#a1aab4', affixes: 0 },
  UNCOMMON: { mult: 1.25, color: '#53b481', affixes: 1 },
  RARE: { mult: 1.6, color: '#e3bc61', affixes: 3 },
  EPIC: { mult: 2, color: '#c58ee2', affixes: 4 },
  LEGENDARY: { mult: 2.6, color: '#f6a35b', affixes: 5 }
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
    OFF_HAND: null, GLOVES: null, BELT: null, BOOTS: null, RING_1: null, RING_2: null
  };
}
export function rollItem(killIndex: number, level: number, rng: SeededRng): Item {
  const template = ITEM_TEMPLATES[rng.index(ITEM_TEMPLATES.length)]!;
  const chance = rng.next();
  const rarity: RarityId =
    chance < 0.45 ? 'COMMON' : chance < 0.75 ? 'UNCOMMON'
      : chance < 0.90 ? 'RARE' : chance < 0.98 ? 'EPIC' : 'LEGENDARY';
  const rules = RARITIES[rarity];
  const used = new Set<string>();
  const affixes: ItemAffix[] = [];
  for (let i = 0; i < rules.affixes; i++) {
    const pool = i % 2 === 0 ? PREFIXES : SUFFIXES;
    const definition = pool[rng.index(pool.length)]!;
    if (used.has(definition.id)) continue;
    used.add(definition.id);
    const raw = (definition.min + rng.next() * (definition.max - definition.min)) * (1 + level * 0.15);
    affixes.push({
      id: definition.id, stat: definition.stat,
      value: definition.floating ? Number(raw.toFixed(1)) : Math.round(raw)
    });
  }
  return {
    id: 'loot-' + killIndex,
    templateId: template.id,
    slot: template.slot,
    rarity,
    level,
    icon: template.icon,
    armor: Math.round((template.armor ?? 0) * rules.mult),
    minDmg: Math.round((template.minDmg ?? 0) * rules.mult),
    maxDmg: Math.round((template.maxDmg ?? 0) * rules.mult),
    block: template.block ?? 0,
    affixes
  };
}
export interface DerivedStats extends PrimaryStats {
  maxHealth: number;
  armor: number;
  physicalResist: number;
  critChance: number;
  damageMin: number;
  damageMax: number;
  attackSpeed: number;
  moveSpeed: number;
}
export function deriveStats(classId: ClassId, equipment: Equipment): DerivedStats {
  const base = CLASSES[classId].primary;
  const primary: PrimaryStats = { ...base };
  let armor = 0, minDmg = 4, maxDmg = 8, block = 0, crit = 0, move = 0;
  for (const item of Object.values(equipment)) {
    if (!item) continue;
    armor += item.armor;
    minDmg += item.minDmg;
    maxDmg += item.maxDmg;
    block += item.block;
    for (const affix of item.affixes) {
      if (affix.stat === 'armor') armor += affix.value;
      if (affix.stat === 'minDmg') minDmg += affix.value;
      if (affix.stat === 'maxDmg') maxDmg += affix.value;
      if (affix.stat === 'critChance') crit += affix.value;
      if (affix.stat === 'moveSpeed') move += affix.value;
      if (affix.stat === 'strength') primary.strength += affix.value;
      if (affix.stat === 'dexterity') primary.dexterity += affix.value;
      if (affix.stat === 'vitality') primary.vitality += affix.value;
    }
  }
  const { strength, dexterity, vitality } = primary;
  armor += Math.round(5 + strength * 1.8 + vitality * 0.4);
  return {
    ...primary,
    maxHealth: Math.round(50 + vitality * 12 + strength * 2),
    armor,
    physicalResist: Math.round(100 * armor / (armor + 250)),
    critChance: Number(Math.min(75, 5 + dexterity * 0.2 + crit).toFixed(1)),
    damageMin: minDmg,
    damageMax: Math.max(minDmg, maxDmg),
    attackSpeed: Number((1 + dexterity * 0.008).toFixed(2)),
    moveSpeed: Number((100 + dexterity * 0.25 + move).toFixed(1))
  };
}
export function isEquipmentSlot(value: unknown): value is EquipmentSlot {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(createEquipment(), value);
}
export function isItem(value: unknown): value is Item {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<Item>;
  return typeof v.id === 'string' && v.id.length > 0
    && ITEM_TEMPLATES.some(t => t.id === v.templateId && t.slot === v.slot)
    && typeof v.rarity === 'string' && v.rarity in RARITIES
    && Number.isSafeInteger(v.level) && (v.level ?? 0) >= 1
    && typeof v.icon === 'string'
    && [v.armor, v.minDmg, v.maxDmg, v.block].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)
    && Array.isArray(v.affixes) && v.affixes.length <= 5
    && v.affixes.every((a: ItemAffix) => typeof a?.id === 'string'
      && typeof a.stat === 'string' && Number.isFinite(a.value) && a.value >= 0);
}
