/** Pure presentation filter. Never removes loot from GameSimulation or mutates drops.
 * All actual pickup actions continue to require the authoritative loot ID.
 * GPL-3.0-only.
 */
import { ITEM_BASES } from './itemCatalog';
import type { GroundItem, RarityId } from '../data/items';
import type { ItemFlags } from '../inventory/equipmentRules';

export type GroundLootCategory = 'all' | 'weapons' | 'armor' | 'accessories';
export interface GroundLootFilter {
  readonly minRarity: RarityId;
  readonly category: GroundLootCategory;
  readonly alwaysShowFavorites: boolean;
}
export const DEFAULT_GROUND_LOOT_FILTER: Readonly<GroundLootFilter> =
  Object.freeze({ minRarity:'COMMON', category:'all', alwaysShowFavorites:true });
const RARITY_LEVELS: readonly RarityId[] = [
  'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'
];
const CATEGORIES: readonly GroundLootCategory[] = ['all','weapons','armor','accessories'];

export function normalizeGroundLootFilter(raw: unknown): GroundLootFilter {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_GROUND_LOOT_FILTER };
  const prototype: unknown = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null)
    return { ...DEFAULT_GROUND_LOOT_FILTER };
  const input = raw as Partial<GroundLootFilter>;
  if (Object.keys(input).length !== 3 || !Object.hasOwn(input,'minRarity')
    || !Object.hasOwn(input,'category') || !Object.hasOwn(input,'alwaysShowFavorites')
    || !RARITY_LEVELS.includes(input.minRarity as RarityId)
    || !CATEGORIES.includes(input.category as GroundLootCategory)
    || typeof input.alwaysShowFavorites !== 'boolean') return { ...DEFAULT_GROUND_LOOT_FILTER };
  return {
    minRarity: input.minRarity!, category: input.category!,
    alwaysShowFavorites: input.alwaysShowFavorites
  };
}

export function filterVisibleGroundLoot(
  drops: readonly GroundItem[],
  flags: Readonly<Record<string, ItemFlags>>,
  filter: Readonly<GroundLootFilter>
): GroundItem[] {
  const options = normalizeGroundLootFilter(filter);
  const threshold = RARITY_LEVELS.indexOf(options.minRarity);
  return drops.filter(drop => {
    if (options.alwaysShowFavorites && Object.hasOwn(flags, drop.item.id)
      && flags[drop.item.id]?.favorite) return true;
    if (RARITY_LEVELS.indexOf(drop.item.rarity) < threshold) return false;
    if (options.category === 'all') return true;
    const base = Object.hasOwn(ITEM_BASES, drop.item.templateId)
      ? ITEM_BASES[drop.item.templateId as keyof typeof ITEM_BASES] : null;
    if (!base) return false;
    return options.category === 'weapons'
      ? base.category === 'weapon' || base.category === 'offhand'
      : options.category === 'armor' ? base.category === 'armor'
      : base.category === 'accessory';
  });
}
