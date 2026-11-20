import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { quotePurchase, quoteSale, quoteTempering, planPurchase, planSale, planService,
  selectVendorStock } from '../../src/game/trade/economyRules';
import { SHOP_OFFERS, sellPrice, temperCost } from '../../src/game/trade/commerce';
import { rollItem, SeededRng } from '../../src/game/data/items';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';

describe('Wave D economy integration', () => {
  it('routes existing merchant purchases through quotes and preserves 5 stable prices', () => {
    const sim = new GameSimulation();
    const stock = selectVendorStock({ vendorId: 'merchant_bram',
      playerLevel: 1, gold: 75, seed: 0, epoch: 0 });
    expect(stock.ok).toBe(true);
    if (!stock.ok) return;
    expect(stock.offers).toEqual(SHOP_OFFERS);
    for (const offer of stock.offers) {
      const quote = quotePurchase(offer);
      expect(quote.ok).toBe(true);
      if (quote.ok) expect(quote.price).toBe(offer.price);
    }
    sim.command({ type: 'buyItem', offerId: 'belt' });
    expect(sim.snapshot().gold).toBe(43);
    expect(sim.snapshot().inventory[0]?.id).toBe('trade-belt-1');
    sim.command({ type: 'buyItem', offerId: 'hauberk' });
    expect(sim.snapshot().gold).toBe(43);
    expect(sim.drainEvents()).toContainEqual({ type: 'tradeRejected', reason: 'funds' });
  });

  it('prevents gold exploits through locked/favorite sale and atomic forged-item plans', () => {
    const sim = new GameSimulation(0);
    sim.command({ type: 'buyItem', offerId: 'belt' });
    const item = sim.snapshot().inventory[0]!;
    const quote = quoteSale(item);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.price).toBe(sellPrice(item));
    expect(planSale(quote, 43, { owned: true, locked: true })).toEqual({
      ok: false, reason: 'LOCKED_ITEM'
    });
    sim.command({ type: 'setItemFlag', itemId: item.id, flag: 'locked', value: true });
    const protectedState = sim.snapshot();
    sim.command({ type: 'sellItem', index: 0 });
    expect(sim.snapshot().gold).toBe(43);
    expect(sim.snapshot().inventory[0]?.id).toBe(item.id);
    expect(sim.drainEvents()).toContainEqual({ type: 'tradeRejected', reason: 'protected' });
    expect(sim.snapshot().itemFlags?.[item.id]?.locked).toBe(true);
    sim.command({ type: 'setItemFlag', itemId: item.id, flag: 'locked', value: false });
    sim.command({ type: 'equip', index: 0 });
    const worn = sim.snapshot().equipment.BELT!;
    const temper = quoteTempering(worn);
    expect(temper.ok).toBe(true);
    if (!temper.ok) return;
    expect(temper.price).toBe(temperCost(worn));
    expect(planService(temper, 43, { playerLevel: 1 })).toMatchObject({
      ok: true, goldAfter: 15
    });
    sim.command({ type: 'temperItem', slot: 'BELT' });
    expect(sim.snapshot().equipment.BELT?.upgrades).toBe(1);
    expect(sim.snapshot().gold).toBe(15);
    sim.command({ type: 'temperItem', slot: 'BELT' });
    expect(sim.snapshot().gold).toBe(15);
  });

  it('rejects full inventory and preserves gold without releasing an item', () => {
    const sim = new GameSimulation(1);
    const before = sim.snapshot();
    const inventory = Array.from({ length: 24 }, (_, i) =>
      rollItem(i + 1, 1, new SeededRng(i + 4)));
    expect(sim.restore({ ...before, inventory, gold: 1000 })).toBe(true);
    const full = sim.snapshot();
    sim.command({ type: 'buyItem', offerId: 'belt' });
    expect(sim.snapshot()).toEqual(full);
    expect(sim.drainEvents()).toContainEqual({ type: 'tradeRejected', reason: 'inventory' });
    const quote = quotePurchase('belt');
    expect(planPurchase(quote, 1000, 0, { playerLevel: 1 }))
      .toEqual({ ok: false, reason: 'INVENTORY_FULL' });
  });

  it('preserves gold, item IDs and temper through character-only save/reload', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'buyItem', offerId: 'belt' });
    sim.command({ type: 'equip', index: 0 });
    sim.command({ type: 'temperItem', slot: 'BELT' });
    const record = createSaveRecord(sim.character());
    expect(record?.format).toBe(10);
    const next = new GameSimulation(9);
    expect(next.restoreCharacter(readSaveRecord(record)!, 33)).toBe(true);
    expect(next.snapshot().gold).toBe(15);
    expect(next.snapshot().equipment.BELT?.id).toBe('trade-belt-1');
    expect(next.snapshot().equipment.BELT?.upgrades).toBe(1);
    expect(JSON.stringify(record)).not.toContain('worldSeed');
  });
});
