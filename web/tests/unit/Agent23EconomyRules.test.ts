import { describe, expect, it } from 'vitest';
import { createShopItem, getOffer, sellPrice, SHOP_OFFERS, temperCost } from '../../src/game/trade/commerce';
import { rollItemForBase, SeededRng, type Item } from '../../src/game/data/items';
import {
  planPurchase, planSale, planService, quotePurchase, quoteSale,
  quoteTempering, refreshOffers, selectVendorStock,
  type EconomyContext, type EconomyQuote
} from '../../src/game/trade/economyRules';

const context = (overrides: Partial<EconomyContext> = {}): EconomyContext => ({
  vendorId: 'merchant_bram', playerLevel: 1, gold: 75, seed: 712, epoch: 0,
  ...overrides
});
const belt = () => createShopItem(getOffer('belt')!, 'test-belt');
const quote = () => quotePurchase('belt');
const priceOf = (result: EconomyQuote): number => {
  if (!result.ok) throw new Error('Expected a valid quote');
  return result.price;
};

describe('Agent 23: compatibility with live merchant and blacksmith', () => {
  it('quotes all five canonical offers with exact legacy IDs and unchanged integer prices', () => {
    expect(SHOP_OFFERS.map(o => [o.id, o.price])).toEqual([
      ['belt', 32], ['shield', 45], ['helm', 50],
      ['broadsword', 65], ['hauberk', 72]
    ]);
    for (const offer of SHOP_OFFERS) {
      expect(quotePurchase(offer)).toMatchObject({
        ok: true, kind: 'purchase', currency: 'gold', vendorId: 'merchant_bram',
        sourceId: offer.id, price: offer.price, requiredLevel: 1
      });
      expect(quotePurchase(offer.id)).toEqual(quotePurchase(offer));
      const item = createShopItem(offer, 'trade-' + offer.id);
      const sale = quoteSale(item);
      expect(priceOf(sale)).toBe(sellPrice(item));
      expect(priceOf(sale)).toBeLessThan(offer.price);
      const temper = quoteTempering(item);
      expect(priceOf(temper)).toBe(temperCost(item));
    }
  });

  it('preserves legacy resale and tempering numbers for higher rarities, levels and upgrades', () => {
    for (const rarity of ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'] as const) {
      const rolled = rollItemForBase('greatsword', 'elite-' + rarity, 80, rarity, new SeededRng(109));
      expect(rolled).not.toBeNull();
      const item = { ...rolled!, upgrades: 2 };
      expect(priceOf(quoteSale(item))).toBe(sellPrice(item));
      expect(priceOf(quoteTempering(item))).toBe(temperCost(item));
    }
    expect(quoteTempering({ ...belt(), upgrades: 3 })).toEqual({
      ok: false, reason: 'MAX_UPGRADES'
    });
  });

  it('rejects missing or fabricated offers and malformed prices without changing original stock', () => {
    const before = SHOP_OFFERS.map(o => ({ ...o }));
    expect(quotePurchase(null)).toEqual({ ok: false, reason: 'UNKNOWN_OFFER' });
    expect(quotePurchase('not-an-offer')).toEqual({ ok: false, reason: 'UNKNOWN_OFFER' });
    expect(quotePurchase({ ...getOffer('belt')!, price: 1 })).toEqual({
      ok: false, reason: 'INVALID_OFFER'
    });
    for (const price of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(quotePurchase({ ...getOffer('belt')!, price })).toEqual({
        ok: false, reason: 'INVALID_PRICE'
      });
    }
    expect(SHOP_OFFERS).toEqual(before);
  });

  it('rejects absent/corrupt item values instead of allowing invalid gold creation', () => {
    expect(quoteSale(null)).toEqual({ ok: false, reason: 'INVALID_ITEM' });
    expect(quoteTempering(null)).toEqual({ ok: false, reason: 'INVALID_ITEM' });
    for (const item of [
      { ...belt(), level: NaN }, { ...belt(), level: Infinity },
      { ...belt(), level: -1 }, { ...belt(), level: 101 },
      { ...belt(), upgrades: 1.5 }, { ...belt(), upgrades: -1 },
      { ...belt(), rarity: '__proto__' }
    ]) {
      expect(quoteSale(item as Item)).toEqual({ ok: false, reason: 'INVALID_ITEM' });
      expect(quoteTempering(item as Item)).toEqual({ ok: false, reason: 'INVALID_ITEM' });
    }
  });
});

describe('Agent 23: immutable atomic transaction proposals', () => {
  it('plans exact purchase, sale and temper deltas without changing budgets or items', () => {
    const item = Object.freeze({ ...belt(), affixes: Object.freeze([]) }) as Item;
    const qBuy = quote();
    const qSale = quoteSale(item);
    const qTemper = quoteTempering(item);
    expect(planPurchase(qBuy, 75, 1)).toMatchObject({
      ok: true, kind: 'purchase', goldBefore: 75, goldAfter: 43,
      goldDelta: -32, price: 32, sourceId: 'belt'
    });
    expect(planSale(qSale, 43)).toMatchObject({
      ok: true, kind: 'sale', goldBefore: 43, goldAfter: 54,
      goldDelta: 11, price: 11, sourceId: 'test-belt'
    });
    expect(planService(qTemper, 43)).toMatchObject({
      ok: true, kind: 'temper', goldBefore: 43, goldAfter: 15,
      goldDelta: -28, price: 28
    });
    expect(item.upgrades).toBe(0);
    expect(item.affixes).toEqual([]);
    expect(Object.isFrozen(qSale)).toBe(true);
    expect(Object.isFrozen(planSale(qSale, 43))).toBe(true);
  });

  it('denies empty capacity, insufficient gold, out-of-stock and locked/favorite items', () => {
    expect(planPurchase(quote(), 75, 0)).toEqual({ ok: false, reason: 'INVENTORY_FULL' });
    expect(planPurchase(quote(), 31, 1)).toEqual({ ok: false, reason: 'INSUFFICIENT_GOLD' });
    expect(planPurchase(quote(), 100, 1, { available: false }))
      .toEqual({ ok: false, reason: 'OUT_OF_STOCK' });
    const sale = quoteSale(belt());
    expect(planSale(sale, 10, { locked: true })).toEqual({ ok: false, reason: 'LOCKED_ITEM' });
    expect(planSale(sale, 10, { favorite: true })).toEqual({ ok: false, reason: 'FAVORITE_ITEM' });
    expect(planSale(sale, 10, { owned: false })).toEqual({ ok: false, reason: 'MISSING_ITEM' });
    expect(planService(quoteTempering(belt()), 0))
      .toEqual({ ok: false, reason: 'INSUFFICIENT_GOLD' });
  });

  it('rejects invalid budgets, slots, levels, invalid flags and gold overflow atomically', () => {
    for (const gold of [-1, NaN, Infinity, -Infinity, 1.2, Number.MAX_SAFE_INTEGER + 1]) {
      expect(planPurchase(quote(), gold, 1)).toEqual({ ok: false, reason: 'INVALID_BUDGET' });
      expect(planSale(quoteSale(belt()), gold))
        .toEqual({ ok: false, reason: 'INVALID_BUDGET' });
      expect(planService(quoteTempering(belt()), gold))
        .toEqual({ ok: false, reason: 'INVALID_BUDGET' });
    }
    for (const slots of [-1, NaN, Infinity, 1.5]) {
      expect(planPurchase(quote(), 100, slots)).toEqual({
        ok: false, reason: 'INVALID_CAPACITY'
      });
    }
    expect(planPurchase(quote(), 100, 1, { playerLevel: 0 }))
      .toEqual({ ok: false, reason: 'INVALID_LEVEL' });
    expect(planService(quoteTempering({ ...belt(), level: 10, requiredLevel: 10 }), 200, {
      playerLevel: 1
    })).toEqual({ ok: false, reason: 'LEVEL_REQUIRED' });
    expect(planSale(quoteSale(belt()), 10, { favorite: 'yes' as never }))
      .toEqual({ ok: false, reason: 'INVALID_FLAGS' });
    expect(planSale(quoteSale(belt()), Number.MAX_SAFE_INTEGER))
      .toEqual({ ok: false, reason: 'GOLD_CAP' });
    expect(planSale(quoteSale(belt()), Number.MAX_SAFE_INTEGER - 11)).toMatchObject({
      ok: true, goldAfter: Number.MAX_SAFE_INTEGER
    });
  });

  it('never trusts tampered or mismatched quotes even when caller supplies them', () => {
    const purchase = quote();
    const sale = quoteSale(belt());
    const temper = quoteTempering(belt());
    expect(planPurchase(sale, 100, 1)).toEqual({ ok: false, reason: 'INVALID_QUOTE' });
    expect(planSale(purchase, 0)).toEqual({ ok: false, reason: 'INVALID_QUOTE' });
    expect(planService(purchase, 100)).toEqual({ ok: false, reason: 'INVALID_QUOTE' });
    expect(planPurchase({ ...purchase, price: -1 } as EconomyQuote, 75, 1))
      .toEqual({ ok: false, reason: 'INVALID_QUOTE' });
    expect(planPurchase({ ...purchase, price: 1 } as EconomyQuote, 75, 1))
      .toEqual({ ok: false, reason: 'INVALID_QUOTE' });
    expect(planSale({ ...sale, price: 99999 } as EconomyQuote, 0))
      .toEqual({ ok: false, reason: 'INVALID_QUOTE' });
    expect(planService({ ...temper, price: 0 } as EconomyQuote, 100))
      .toEqual({ ok: false, reason: 'INVALID_QUOTE' });
    expect(planPurchase({ ok: true, kind: 'purchase', price: NaN } as EconomyQuote, 100, 1))
      .toEqual({ ok: false, reason: 'INVALID_QUOTE' });
  });
});

describe('Agent 23: deterministic stock and refresh contracts', () => {
  it('preserves the five original offers, their order and prices for the active merchant', () => {
    const result = selectVendorStock(context());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers).toEqual(SHOP_OFFERS);
    expect(result.offers).not.toBe(SHOP_OFFERS);
    expect(Object.isFrozen(result.offers)).toBe(true);
    expect(selectVendorStock(context({ seed: 0, epoch: 99 }))).toEqual({
      ...result, seed: 0, epoch: 99
    });
    const smith = selectVendorStock(context({ vendorId: 'smith_odan' }));
    expect(smith.ok && smith.offers).toEqual([]);
  });

  it('selects future vendor preview stock reproducibly from explicit seed and epoch', () => {
    const input = context({ vendorId: 'traveling_vendor', seed: 17, epoch: 3 });
    const a = selectVendorStock(input);
    const b = selectVendorStock({ ...input });
    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.offers).toHaveLength(3);
    const ids = new Set(a.offers.map(offer => offer.id));
    expect(ids.size).toBe(3);
    for (const offer of a.offers) expect(offer).toEqual(getOffer(offer.id));
    const epochs = Array.from({ length: 10 }, (_, epoch) =>
      selectVendorStock({ ...input, epoch }));
    expect(epochs.every(r => r.ok)).toBe(true);
    expect(new Set(epochs.map(r => JSON.stringify(r.ok && r.offers.map(o => o.id)))).size)
      .toBeGreaterThan(1);
    expect(refreshOffers(input, 4)).toEqual(selectVendorStock({ ...input, epoch: 4 }));
  });

  it('validates vendor, seed, epoch, gold and category; rejects duplicate and fabricated stock', () => {
    expect(selectVendorStock(context({ vendorId: 'not-a-vendor' })))
      .toEqual({ ok: false, reason: 'UNKNOWN_VENDOR' });
    for (const patch of [
      { playerLevel: 0 }, { playerLevel: 101 }, { playerLevel: NaN },
      { gold: -1 }, { gold: Infinity }, { seed: -1 },
      { seed: NaN }, { epoch: Infinity }, { epoch: -1 }, { epoch: 1.4 },
      { category: 'invalid' as never }
    ]) expect(selectVendorStock(context(patch))).toEqual({
      ok: false, reason: 'INVALID_CONTEXT'
    });
    expect(selectVendorStock(context(), [...SHOP_OFFERS, SHOP_OFFERS[0]])).toEqual({
      ok: false, reason: 'DUPLICATE_STOCK'
    });
    expect(selectVendorStock(context(), [{ ...SHOP_OFFERS[0], price: 1 }]))
      .toEqual({ ok: false, reason: 'INVALID_STOCK' });
    expect(selectVendorStock(context(), [{ ...SHOP_OFFERS[0], id: 'bogus' as never }]))
      .toEqual({ ok: false, reason: 'INVALID_STOCK' });
    expect(refreshOffers(context(), 0)).toEqual({ ok: false, reason: 'INVALID_EPOCH' });
    expect(refreshOffers(context(), 2)).toEqual({ ok: false, reason: 'INVALID_EPOCH' });
    expect(refreshOffers(context(), NaN)).toEqual({ ok: false, reason: 'INVALID_EPOCH' });
  });

  it('filters item categories without new price formulas and never mutates inputs', () => {
    const input = Object.freeze(context({ category: 'weapon' }));
    const original = SHOP_OFFERS.map(o => ({ ...o }));
    const result = selectVendorStock(input);
    expect(result.ok && result.offers.map(offer => offer.id)).toEqual(['broadsword']);
    expect(input.category).toBe('weapon');
    expect(SHOP_OFFERS).toEqual(original);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
