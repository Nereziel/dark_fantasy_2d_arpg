import {
  ITEM_TEMPLATES, type EquipmentSlot, type Item, type RarityId
} from '../data/items';

/** Camp commerce uses fixed, server-independent stock; transient stock is not saved. */
export type ShopOfferId = 'broadsword' | 'shield' | 'helm' | 'belt' | 'hauberk';

export interface ShopOffer {
  id: ShopOfferId;
  templateId: ShopOfferId;
  price: number;
}

export const SHOP_OFFERS: readonly ShopOffer[] = [
  { id: 'belt', templateId: 'belt', price: 32 },
  { id: 'shield', templateId: 'shield', price: 45 },
  { id: 'helm', templateId: 'helm', price: 50 },
  { id: 'broadsword', templateId: 'broadsword', price: 65 },
  { id: 'hauberk', templateId: 'hauberk', price: 72 }
];

const RARITY_PRICE: Record<RarityId, number> = {
  COMMON: 0, UNCOMMON: 8, RARE: 23, EPIC: 48, LEGENDARY: 95
};

const SMITH_SLOTS: readonly EquipmentSlot[] = [
  'MAIN_HAND', 'OFF_HAND', 'HELMET', 'CHEST', 'GLOVES', 'BELT', 'BOOTS'
];

export function getOffer(id: string): ShopOffer | undefined {
  return SHOP_OFFERS.find(offer => offer.id === id);
}

export function createShopItem(offer: ShopOffer, uniqueId: string): Item {
  const template = ITEM_TEMPLATES.find(t => t.id === offer.templateId);
  if (!template) throw new Error('Unknown stock template');
  return {
    id: uniqueId, templateId: template.id, slot: template.slot,
    rarity: 'COMMON', level: 1, icon: template.icon,
    armor: template.armor ?? 0,
    minDmg: template.minDmg ?? 0, maxDmg: template.maxDmg ?? 0,
    block: template.block ?? 0, affixes: [], upgrades: 0
  };
}

/** The resale value is always lower than a new merchant item. */
export function sellPrice(item: Item): number {
  return Math.max(3, 6 + item.level * 5
    + RARITY_PRICE[item.rarity] + item.upgrades * 9);
}

export function canTemper(item: Item): boolean {
  return SMITH_SLOTS.includes(item.slot) && item.upgrades < 3;
}

export function temperCost(item: Item): number {
  return 20 + item.level * 8 + item.upgrades * 18;
}

/** Pure forge operation; old object is not mutated. */
export function temperItem(item: Item): Item | null {
  if (!canTemper(item)) return null;
  return {
    ...item,
    upgrades: item.upgrades + 1,
    minDmg: item.slot === 'MAIN_HAND' ? item.minDmg + 2 : item.minDmg,
    maxDmg: item.slot === 'MAIN_HAND' ? item.maxDmg + 3 : item.maxDmg,
    armor: item.slot !== 'MAIN_HAND' ? item.armor + 4 : item.armor,
    affixes: item.affixes.map(affix => ({ ...affix }))
  };
}
