/**
 * Prompt 02: reusable, renderer-independent character statistic model.
 *
 * All values are calculated on demand from class bases and equipped gear.
 * Neither the save DTO nor the UI stores or mutates derived numbers.
 */
import { CLASSES, type ClassId, type PrimaryStats } from '../data/classes';
import type { Equipment } from '../data/items';
import { levelGrowth, MAX_LEVEL } from '../progression/progressionRules';

export interface DerivedStats extends PrimaryStats {
  maxHealth: number;
  healthRegen: number;
  maxResource: number;
  resourceRegen: number;
  armor: number;
  physicalResist: number;
  fireResist: number;
  frostResist: number;
  lightningResist: number;
  poisonResist: number;
  shadowResist: number;
  holyResist: number;
  critChance: number;
  critDamage: number;
  damageMin: number;
  damageMax: number;
  attackSpeed: number;
  moveSpeed: number;
  dodgeChance: number;
  blockChance: number;
  cooldownReduction: number;
  lifeSteal: number;
  magicFind: number;
  goldFind: number;
}

export type DerivedStatKey = keyof DerivedStats;

/** Percentage bounds are always applied centrally. */
const percent = (value: number, max = 75): number =>
  Number(Math.max(0, Math.min(max, value)).toFixed(1));

export function deriveStats(classId: ClassId, equipment: Equipment, level = 1): DerivedStats {
  const klass = CLASSES[classId];
  // Keep class bases immutable. Equipment and affixes are additive inputs.
  const primary: PrimaryStats = { ...klass.primary };
  // Advancement is reconstructed from level: no duplicated primary stat state in saves.
  const boundedLevel = Number.isSafeInteger(level) ? Math.max(1, Math.min(MAX_LEVEL, level)) : 1;
  for (let target = 2; target <= boundedLevel; target++) {
    const growth = levelGrowth(classId, target)!.primary;
    primary.strength += growth.strength;
    primary.dexterity += growth.dexterity;
    primary.intelligence += growth.intelligence;
    primary.vitality += growth.vitality;
    primary.willpower += growth.willpower;
  }
  let armor = 0, minDmg = 4, maxDmg = 8, block = 0, crit = 0, move = 0;
  for (const item of Object.values(equipment)) {
    if (!item) continue;
    armor += item.armor;
    minDmg += item.minDmg;
    maxDmg += item.maxDmg;
    block += item.block;
    for (const affix of item.affixes) {
      switch (affix.stat) {
        case 'armor': armor += affix.value; break;
        case 'minDmg': minDmg += affix.value; break;
        case 'maxDmg': maxDmg += affix.value; break;
        case 'blockChance': block += affix.value; break;
        case 'critChance': crit += affix.value; break;
        case 'moveSpeed': move += affix.value; break;
        case 'strength': primary.strength += affix.value; break;
        case 'dexterity': primary.dexterity += affix.value; break;
        case 'vitality': primary.vitality += affix.value; break;
      }
    }
  }
  const { strength, dexterity, intelligence, vitality, willpower } = primary;
  armor += Math.round(5 + strength * 1.8 + vitality * 0.4);
  return {
    ...primary,
    maxHealth: Math.round(50 + vitality * 12 + strength * 2),
    healthRegen: Number((0.5 + vitality * 0.07).toFixed(2)),
    maxResource: klass.resourceMax + (boundedLevel - 1) * 2,
    resourceRegen: klass.regenRate + (boundedLevel - 1) * 0.04,
    armor,
    physicalResist: Math.round(100 * armor / (armor + 250)),
    fireResist: percent(willpower * 0.24 + intelligence * 0.12),
    frostResist: percent(willpower * 0.25 + vitality * 0.1),
    lightningResist: percent(willpower * 0.28 + dexterity * 0.08),
    poisonResist: percent(vitality * 0.25 + willpower * 0.12),
    shadowResist: percent(willpower * 0.32 + intelligence * 0.1),
    holyResist: percent(willpower * 0.26 + strength * 0.08),
    critChance: percent(5 + dexterity * 0.2 + crit),
    critDamage: 70, // Existing combat calculation is a 1.7x critical multiplier.
    damageMin: minDmg + Math.floor((boundedLevel - 1) * 0.5),
    damageMax: Math.max(minDmg, maxDmg) + Math.floor((boundedLevel - 1) * 0.7),
    attackSpeed: Number((1 + dexterity * 0.008).toFixed(2)),
    moveSpeed: Number((100 + dexterity * 0.25 + move).toFixed(1)),
    dodgeChance: percent(dexterity * 0.12, 40),
    blockChance: percent(block, 60),
    cooldownReduction: 0,
    lifeSteal: 0,
    magicFind: 0,
    goldFind: 0
  };
}

/**
 * Display groups for the first in-game character sheet.
 * Current base resistances, dodge, and other secondary stats are inspection
 * projections; actual defensive mechanics belong to combat prompt 06.
 */
export const STAT_GROUPS: readonly {
  id: 'primary' | 'offense' | 'defense' | 'utility';
  stats: readonly DerivedStatKey[];
}[] = [
  { id: 'primary', stats: [
    'strength', 'dexterity', 'intelligence', 'vitality', 'willpower'
  ] },
  { id: 'offense', stats: [
    'damageMin', 'damageMax', 'attackSpeed', 'critChance', 'critDamage'
  ] },
  { id: 'defense', stats: [
    'maxHealth', 'healthRegen', 'armor', 'physicalResist',
    'fireResist', 'frostResist', 'lightningResist', 'poisonResist',
    'shadowResist', 'holyResist', 'dodgeChance', 'blockChance'
  ] },
  { id: 'utility', stats: [
    'maxResource', 'resourceRegen', 'moveSpeed',
    'cooldownReduction', 'lifeSteal', 'magicFind', 'goldFind'
  ] }
];

export const PERCENT_STATS: ReadonlySet<DerivedStatKey> = new Set<DerivedStatKey>([
  'physicalResist', 'fireResist', 'frostResist', 'lightningResist',
  'poisonResist', 'shadowResist', 'holyResist', 'critChance', 'critDamage',
  'dodgeChance', 'blockChance', 'cooldownReduction', 'lifeSteal',
  'magicFind', 'goldFind'
]);
