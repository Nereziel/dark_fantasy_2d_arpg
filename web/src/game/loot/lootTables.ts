/**
 * Prompt 16 — pure, context-aware loot planning.
 *
 * This module returns references to item bases, rarities and item levels; it
 * never instantiates Item/GroundItem or modifies game/saved state.
 * Integration into defeatEnemy, inventory and Phaser is coordinator-owned.
 *
 * The roll is deliberately separate from bossGuaranteedLoot: callers must
 * combine a boss's curated guaranteed rewards and its random roll explicitly.
 */
import type { RarityId } from '../data/items';

export type LootRarity = RarityId;
export type LootItemBaseId =
  | 'broadsword' | 'shield' | 'hauberk' | 'helm' | 'gauntlets'
  | 'greaves' | 'belt' | 'bloodstone' | 'signet';
export type LootZone = 'wilderness' | 'crypt';
export type LootDifficulty = 'normal' | 'veteran' | 'nightmare' | 'hell';
export type LootTableId =
  | 'normal' | 'elite' | 'boss'
  | 'wilderness' | 'crypt'
  | 'veteran' | 'nightmare' | 'hell';
export type LootRandomSource = { next(): number };

export interface LootContext {
  /** Integer within [1, 1000]. Invalid required values reject the roll. */
  monsterLevel: number;
  playerLevel: number;
  /** Stable, case-sensitive modifier IDs, at most four distinct IDs counted. */
  eliteModifiers?: readonly string[];
  isBoss?: boolean;
  zone: LootZone;
  difficulty: LootDifficulty;
  /** Bonus percentage, sanitized to [0, 500]; invalid values become 0. */
  magicFind?: number;
  /**
   * Optional explicit table. When supplied, roll *only* this table:
   * do not automatically append zone/difficulty tables or silently fall back.
   */
  lootTableId?: LootTableId;
}

export interface LootEntry {
  readonly itemBaseId: LootItemBaseId;
  readonly rarity: LootRarity;
  readonly weight: number;
  readonly minMonsterLevel?: number;
  readonly minPlayerLevel?: number;
  readonly minDifficulty?: LootDifficulty;
}

/** Caller-owned projection; modifying it cannot change LOOT_TABLES. */
export interface EligibleLootEntry {
  itemBaseId: LootItemBaseId;
  rarity: LootRarity;
  weight: number;
  sourceTableId: LootTableId;
}

export interface LootRoll {
  itemBaseId: LootItemBaseId;
  rarity: LootRarity;
  itemLevel: number;
  tableId: LootTableId;
  guaranteed: boolean;
}

const MAX_LEVEL = 1000;
const MAX_ITEM_LEVEL = 100;
const MAX_MAGIC_FIND = 500;
const MAX_WEIGHT = 1_000_000;
const MAX_POOL_ENTRIES = 1024;
const MAX_MODIFIERS_INPUT = 128;
const MAX_ELITE_MODIFIERS = 4;

const DIFFICULTY_INDEX: Readonly<Record<LootDifficulty, number>> = Object.freeze({
  normal: 0, veteran: 1, nightmare: 2, hell: 3
});
const RARITY_RANK: Readonly<Record<LootRarity, number>> = Object.freeze({
  COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5
});
const ZONES: readonly LootZone[] = Object.freeze(['wilderness', 'crypt']);

function frozenTable(entries: readonly LootEntry[]): readonly LootEntry[] {
  return Object.freeze(entries.map(entry => Object.freeze({ ...entry })));
}

/**
 * Stable ID references use existing data/items.ts item template IDs, not
 * translated names or generated item instances. Region and difficulty tables
 * add modest weighted diversity to the tier's normal/elite/boss table.
 */
export const LOOT_TABLES: Readonly<Record<LootTableId, readonly LootEntry[]>> =
  Object.freeze({
    normal: frozenTable([
      { itemBaseId: 'broadsword', rarity: 'COMMON', weight: 390 },
      { itemBaseId: 'helm', rarity: 'COMMON', weight: 260 },
      { itemBaseId: 'shield', rarity: 'UNCOMMON', weight: 145 },
      { itemBaseId: 'greaves', rarity: 'UNCOMMON', weight: 115 },
      { itemBaseId: 'belt', rarity: 'RARE', weight: 70, minMonsterLevel: 4 },
      { itemBaseId: 'gauntlets', rarity: 'EPIC', weight: 19, minMonsterLevel: 12, minPlayerLevel: 6 },
      { itemBaseId: 'bloodstone', rarity: 'LEGENDARY', weight: 1, minMonsterLevel: 25, minPlayerLevel: 15 }
    ]),
    elite: frozenTable([
      { itemBaseId: 'helm', rarity: 'COMMON', weight: 120 },
      { itemBaseId: 'shield', rarity: 'UNCOMMON', weight: 205 },
      { itemBaseId: 'greaves', rarity: 'UNCOMMON', weight: 155 },
      { itemBaseId: 'broadsword', rarity: 'RARE', weight: 215, minMonsterLevel: 4 },
      { itemBaseId: 'hauberk', rarity: 'RARE', weight: 135, minMonsterLevel: 4 },
      { itemBaseId: 'gauntlets', rarity: 'EPIC', weight: 140, minMonsterLevel: 12, minPlayerLevel: 6 },
      { itemBaseId: 'bloodstone', rarity: 'LEGENDARY', weight: 30, minMonsterLevel: 25, minPlayerLevel: 15 }
    ]),
    boss: frozenTable([
      { itemBaseId: 'shield', rarity: 'COMMON', weight: 10 },
      { itemBaseId: 'greaves', rarity: 'UNCOMMON', weight: 80 },
      { itemBaseId: 'hauberk', rarity: 'RARE', weight: 180, minMonsterLevel: 4 },
      { itemBaseId: 'broadsword', rarity: 'RARE', weight: 150, minMonsterLevel: 4 },
      { itemBaseId: 'gauntlets', rarity: 'EPIC', weight: 255, minMonsterLevel: 12, minPlayerLevel: 6 },
      { itemBaseId: 'bloodstone', rarity: 'EPIC', weight: 145, minMonsterLevel: 12, minPlayerLevel: 6 },
      { itemBaseId: 'signet', rarity: 'LEGENDARY', weight: 180, minMonsterLevel: 25, minPlayerLevel: 15 }
    ]),
    wilderness: frozenTable([
      { itemBaseId: 'greaves', rarity: 'COMMON', weight: 60 },
      { itemBaseId: 'belt', rarity: 'UNCOMMON', weight: 35 },
      { itemBaseId: 'broadsword', rarity: 'RARE', weight: 25, minMonsterLevel: 5 },
      { itemBaseId: 'gauntlets', rarity: 'EPIC', weight: 9, minMonsterLevel: 15, minPlayerLevel: 8 }
    ]),
    crypt: frozenTable([
      { itemBaseId: 'hauberk', rarity: 'COMMON', weight: 45 },
      { itemBaseId: 'bloodstone', rarity: 'UNCOMMON', weight: 30 },
      { itemBaseId: 'signet', rarity: 'RARE', weight: 30, minMonsterLevel: 5 },
      { itemBaseId: 'hauberk', rarity: 'EPIC', weight: 10, minMonsterLevel: 15, minPlayerLevel: 8 }
    ]),
    veteran: frozenTable([
      { itemBaseId: 'helm', rarity: 'UNCOMMON', weight: 20, minDifficulty: 'veteran' },
      { itemBaseId: 'shield', rarity: 'RARE', weight: 38, minDifficulty: 'veteran', minMonsterLevel: 5 },
      { itemBaseId: 'gauntlets', rarity: 'EPIC', weight: 22, minDifficulty: 'veteran', minMonsterLevel: 12, minPlayerLevel: 6 }
    ]),
    nightmare: frozenTable([
      { itemBaseId: 'shield', rarity: 'RARE', weight: 35, minDifficulty: 'nightmare', minMonsterLevel: 8 },
      { itemBaseId: 'hauberk', rarity: 'EPIC', weight: 55, minDifficulty: 'nightmare', minMonsterLevel: 15, minPlayerLevel: 8 },
      { itemBaseId: 'signet', rarity: 'LEGENDARY', weight: 20, minDifficulty: 'nightmare', minMonsterLevel: 25, minPlayerLevel: 15 }
    ]),
    hell: frozenTable([
      { itemBaseId: 'broadsword', rarity: 'RARE', weight: 30, minDifficulty: 'hell', minMonsterLevel: 8 },
      { itemBaseId: 'hauberk', rarity: 'EPIC', weight: 70, minDifficulty: 'hell', minMonsterLevel: 15, minPlayerLevel: 8 },
      { itemBaseId: 'bloodstone', rarity: 'LEGENDARY', weight: 60, minDifficulty: 'hell', minMonsterLevel: 25, minPlayerLevel: 15 }
    ])
  });

interface NormalizedContext {
  monsterLevel: number;
  playerLevel: number;
  eliteModifierCount: number;
  isBoss: boolean;
  zone: LootZone;
  difficulty: LootDifficulty;
  magicFind: number;
  lootTableId?: LootTableId;
}

function ownKey<T extends object>(record: T, key: unknown): key is keyof T {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(record, key);
}

function validLevel(level: unknown): level is number {
  return Number.isSafeInteger(level) && (level as number) >= 1 && (level as number) <= MAX_LEVEL;
}

/**
 * Reject invalid structural context. Only optional magic find has a forgiving
 * documented clamp; malformed table IDs are never substituted with defaults.
 */
function normalizeContext(input: Readonly<LootContext>): NormalizedContext | null {
  if (!input || typeof input !== 'object') return null;
  if (!validLevel(input.monsterLevel) || !validLevel(input.playerLevel)) return null;
  if (!ZONES.includes(input.zone) || !ownKey(DIFFICULTY_INDEX, input.difficulty)) return null;
  if (input.isBoss !== undefined && typeof input.isBoss !== 'boolean') return null;
  if (input.lootTableId !== undefined && !ownKey(LOOT_TABLES, input.lootTableId)) return null;
  if (input.eliteModifiers !== undefined && !Array.isArray(input.eliteModifiers)) return null;

  const modifiers = input.eliteModifiers ?? [];
  if (modifiers.length > MAX_MODIFIERS_INPUT
    || modifiers.some(id => typeof id !== 'string' || id.length < 1 || id.length > 64)) return null;

  const rawMagicFind = input.magicFind ?? 0;
  const magicFind = Number.isFinite(rawMagicFind)
    ? Math.min(MAX_MAGIC_FIND, Math.max(0, rawMagicFind))
    : 0;

  return {
    monsterLevel: input.monsterLevel,
    playerLevel: input.playerLevel,
    eliteModifierCount: Math.min(MAX_ELITE_MODIFIERS, new Set(modifiers).size),
    isBoss: input.isBoss ?? false,
    zone: input.zone,
    difficulty: input.difficulty,
    magicFind,
    lootTableId: input.lootTableId
  };
}

/** No eligibility may weaken the tier/level or difficulty requirements. */
function eligible(entry: LootEntry, context: NormalizedContext): boolean {
  return context.monsterLevel >= (entry.minMonsterLevel ?? 1)
    && context.playerLevel >= (entry.minPlayerLevel ?? 1)
    && DIFFICULTY_INDEX[context.difficulty] >= DIFFICULTY_INDEX[entry.minDifficulty ?? 'normal'];
}

function resolveTableIds(context: NormalizedContext): readonly LootTableId[] {
  if (context.lootTableId) return [context.lootTableId];
  const primary: LootTableId = context.isBoss ? 'boss'
    : context.eliteModifierCount > 0 ? 'elite' : 'normal';
  return context.difficulty === 'normal'
    ? [primary, context.zone]
    : [primary, context.zone, context.difficulty];
}

/**
 * Returns finite positive weights. Higher item ranks receive stronger magic
 * find, difficulty and elite-modifier bonuses; rank/level gates still apply.
 */
function effectiveWeight(entry: LootEntry, context: NormalizedContext): number {
  const rankBonus = RARITY_RANK[entry.rarity] - 1;
  const magicBonus = context.magicFind / 100 * rankBonus * 0.22;
  const difficultyBonus = DIFFICULTY_INDEX[context.difficulty] * rankBonus * 0.10;
  const eliteBonus = context.eliteModifierCount * Math.max(0, rankBonus - 1) * 0.12;
  return Math.min(MAX_WEIGHT, entry.weight * (1 + magicBonus + difficultyBonus + eliteBonus));
}

/**
 * Fully deterministic list in tier → region → difficulty order.
 * No RNG is consumed. The returned array/entries are fresh caller-owned data.
 */
export function eligibleLootEntries(context: Readonly<LootContext>): EligibleLootEntry[] {
  const normalized = normalizeContext(context);
  if (!normalized) return [];

  const pool: EligibleLootEntry[] = [];
  for (const tableId of resolveTableIds(normalized)) {
    for (const entry of LOOT_TABLES[tableId]) {
      if (!eligible(entry, normalized) || !Number.isFinite(entry.weight) || entry.weight <= 0) continue;
      const weight = effectiveWeight(entry, normalized);
      if (!Number.isFinite(weight) || weight <= 0) continue;
      pool.push({ itemBaseId: entry.itemBaseId, rarity: entry.rarity, weight, sourceTableId: tableId });
    }
  }
  return pool;
}

/**
 * Single-pass weighted selection. Ignore non-finite/non-positive weights,
 * cap each finite positive weight at 1e6, reject pools longer than 1024,
 * and accept inclusive RNG endpoints: 0 = first, 1 = last eligible.
 * Invalid rolls return null. Does not mutate the input array.
 */
export function selectWeightedLootEntry<T extends Readonly<{ weight: number }>>(
  entries: readonly T[], unitRoll: number
): T | null {
  if (!Array.isArray(entries) || entries.length > MAX_POOL_ENTRIES
    || !Number.isFinite(unitRoll) || unitRoll < 0 || unitRoll > 1) return null;

  const valid: Array<{ entry: T; weight: number }> = [];
  let total = 0;
  for (const entry of entries) {
    const raw = entry?.weight;
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const weight = Math.min(MAX_WEIGHT, raw);
    valid.push({ entry, weight });
    total += weight;
  }
  if (total <= 0 || valid.length === 0) return null;
  if (unitRoll === 1) return valid[valid.length - 1]!.entry;

  const target = total * unitRoll;
  let cumulative = 0;
  for (const { entry, weight } of valid) {
    cumulative += weight;
    if (target < cumulative) return entry;
  }
  // Floating-point boundary overshoot: never loop/retry or draw a second RNG.
  return valid[valid.length - 1]!.entry;
}

function itemLevel(context: NormalizedContext): number {
  return Math.min(MAX_ITEM_LEVEL, Math.max(context.monsterLevel, Math.ceil(context.playerLevel * 0.85)));
}

/** Uses one RNG draw for a non-empty eligible pool, never for an empty pool. */
export function rollLootTable(
  context: Readonly<LootContext>, rng: LootRandomSource
): LootRoll | null {
  const normalized = normalizeContext(context);
  if (!normalized) return null;
  const entries = eligibleLootEntries(context);
  if (entries.length === 0 || !rng || typeof rng.next !== 'function') return null;
  const chosen = selectWeightedLootEntry(entries, rng.next());
  if (!chosen) return null;
  return {
    itemBaseId: chosen.itemBaseId,
    rarity: chosen.rarity,
    itemLevel: itemLevel(normalized),
    tableId: chosen.sourceTableId,
    guaranteed: false
  };
}

/**
 * Curated boss drops are additive to the random roll; this function uses no
 * RNG. Normal/veteran guarantee one epic item per zone; nightmare/hell at
 * monster level >=25 and player level >=15 add a legendary zone-specific drop.
 */
export function bossGuaranteedLoot(context: Readonly<LootContext>): LootRoll[] {
  const normalized = normalizeContext(context);
  if (!normalized || !normalized.isBoss) return [];
  const level = itemLevel(normalized);
  const drops: LootRoll[] = [{
    itemBaseId: normalized.zone === 'crypt' ? 'bloodstone' : 'broadsword',
    rarity: 'EPIC',
    itemLevel: level,
    tableId: 'boss',
    guaranteed: true
  }];
  if (DIFFICULTY_INDEX[normalized.difficulty] >= 2
    && normalized.monsterLevel >= 25 && normalized.playerLevel >= 15) {
    drops.push({
      itemBaseId: normalized.zone === 'crypt' ? 'signet' : 'hauberk',
      rarity: 'LEGENDARY', itemLevel: level, tableId: 'boss', guaranteed: true
    });
  }
  return drops;
}
