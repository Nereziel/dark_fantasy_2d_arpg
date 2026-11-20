import type { Item } from '../data/items';
import { formatItemNameSegments, type RolledAffix } from './affixGeneration';

/**
 * Render generated item names in their language's grammatical order. The
 * translated base-name fallback retains legacy v8/shop wording and is also
 * used for items with no procedural affixes. Never draws RNG or edits an item.
 */
export function itemDisplayName(item: Item, language: string, translatedBase: string): string {
  if (!item || typeof translatedBase !== 'string'
      || item.affixes.length === 0
      || item.affixes.some(affix => affix.kind === undefined || affix.tier === undefined))
    return translatedBase;
  try {
    const result = formatItemNameSegments(item.templateId,
      item.affixes as RolledAffix[], language === 'cs' ? 'cs' : 'en');
    return result.text ?? translatedBase;
  } catch {
    return translatedBase;
  }
}
