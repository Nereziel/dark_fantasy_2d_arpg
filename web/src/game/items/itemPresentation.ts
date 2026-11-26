// GPL-3.0-only — item detail presentation, no changes to item or combat rules.
import type { Item } from '../data/items';

export type ItemBaseProperty = { key: 'damage' | 'armor' | 'block'; value: string };

export function itemBaseProperties(item: Pick<Item, 'minDmg' | 'maxDmg' | 'armor' | 'block'>): ItemBaseProperty[] {
  const rows: ItemBaseProperty[] = [];
  if (item.minDmg !== 0 || item.maxDmg !== 0)
    rows.push({ key: 'damage', value: `${item.minDmg}–${item.maxDmg}` });
  if (item.armor !== 0) rows.push({ key: 'armor', value: String(item.armor) });
  if (item.block !== 0) rows.push({ key: 'block', value: `${item.block}%` });
  return rows;
}
