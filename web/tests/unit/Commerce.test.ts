import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import {
  SHOP_OFFERS, canTemper, createShopItem, getOffer, sellPrice,
  temperCost, temperItem
} from '../../src/game/trade/commerce';
import {
  BLACKSMITH_ID, MERCHANT_ID, MERCHANT_POSITION, NPC_POSITIONS, nearNpc
} from '../../src/game/world/npcs';
import { createSaveRecord, readSaveRecord, validateCharacter } from '../../src/persistence/SaveRepository';
import { rollItem, SeededRng } from '../../src/game/data/items';

describe('camp merchant and blacksmith', () => {
  it('has deterministic prices, valid stock and fixed NPC positions within camp', () => {
    expect(SHOP_OFFERS.length).toBeGreaterThanOrEqual(4);
    const ids = new Set<string>();
    for (const offer of SHOP_OFFERS) {
      expect(ids.has(offer.id)).toBe(false);
      ids.add(offer.id);
      const item = createShopItem(offer, 'preview');
      expect(item.upgrades).toBe(0);
      expect(item.rarity).toBe('COMMON');
      expect(item.templateId).toBe(offer.templateId);
      expect(offer.price).toBeGreaterThan(sellPrice(item));
      expect(getOffer(offer.id)).toEqual(offer);
    }
    expect(getOffer('invalid')).toBeUndefined();
    expect(nearNpc({ x: 390, y: 470 }, MERCHANT_ID)).toBe(true);
    expect(nearNpc({ x: 390, y: 470 }, BLACKSMITH_ID)).toBe(true);
    expect(NPC_POSITIONS[MERCHANT_ID]).toEqual(MERCHANT_POSITION);
  });

  it('buys and sells a real inventory item with currency validation, even while paused', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'pause', value: true });
    sim.command({ type: 'buyItem', offerId: 'belt' });
    const purchased = sim.snapshot();
    expect(purchased.gold).toBe(43);
    expect(purchased.inventory.filter(Boolean)).toHaveLength(1);
    expect(purchased.inventory[0]).toMatchObject({
      templateId: 'belt', upgrades: 0, armor: 8
    });
    sim.command({ type: 'buyItem', offerId: 'hauberk' }); // unaffordable
    expect(sim.snapshot()).toEqual(purchased);
    sim.command({ type: 'buyItem', offerId: 'INVALID' as 'belt' }); // unknown offer
    expect(sim.snapshot()).toEqual(purchased);
    sim.command({ type: 'sellItem', index: -1 });
    sim.command({ type: 'sellItem', index: 24 });
    expect(sim.snapshot()).toEqual(purchased);
    const proceeds = sellPrice(purchased.inventory[0]!);
    sim.command({ type: 'sellItem', index: 0 });
    expect(sim.snapshot().gold).toBe(43 + proceeds);
    expect(sim.snapshot().inventory.every(item => item === null)).toBe(true);
    sim.command({ type: 'sellItem', index: 0 });
    expect(sim.snapshot().gold).toBe(43 + proceeds);
  });

  it('blocks buying or selling remotely and rejects full inventories', () => {
    const sim = new GameSimulation(0);
    const base = sim.snapshot();
    const bag = Array.from({ length: 24 }, (_, index) =>
      rollItem(index + 1, 1, new SeededRng(index + 10)));
    expect(sim.restore({ ...base, inventory: bag, gold: 2000 })).toBe(true);
    const full = sim.snapshot();
    sim.command({ type: 'buyItem', offerId: 'belt' });
    expect(sim.snapshot()).toEqual(full);
    const farAway = { ...full, player: { ...full.player, x: 850, y: 520 } };
    expect(sim.restore(farAway)).toBe(true);
    const far = sim.snapshot();
    sim.command({ type: 'buyItem', offerId: 'belt' });
    sim.command({ type: 'sellItem', index: 0 });
    sim.command({ type: 'temperItem', slot: 'MAIN_HAND' });
    expect(sim.snapshot()).toEqual(far);
  });

  it('tempers equipped gear up to three times with scaling costs and persistent bonuses', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'buyItem', offerId: 'belt' });
    sim.command({ type: 'equip', index: 0 });
    const equipped = sim.snapshot();
    expect(equipped.equipment.BELT).not.toBeNull();
    const item = equipped.equipment.BELT!;
    expect(temperCost(item)).toBe(28);
    expect(canTemper(item)).toBe(true);
    sim.command({ type: 'temperItem', slot: 'BELT' });
    const forged = sim.snapshot();
    expect(forged.gold).toBe(15);
    expect(forged.equipment.BELT?.armor).toBe(item.armor + 4);
    expect(forged.equipment.BELT?.upgrades).toBe(1);
    sim.command({ type: 'temperItem', slot: 'BELT' }); // insufficient money
    expect(sim.snapshot()).toEqual(forged);
    const rich = { ...forged, gold: 800 };
    expect(sim.restore(rich)).toBe(true);
    sim.command({ type: 'temperItem', slot: 'BELT' });
    sim.command({ type: 'temperItem', slot: 'BELT' });
    const maxed = sim.snapshot();
    expect(maxed.equipment.BELT?.upgrades).toBe(3);
    expect(maxed.equipment.BELT?.armor).toBe(item.armor + 12);
    expect(maxed.gold).toBe(800 - temperCost(forged.equipment.BELT!)
      - temperCost({ ...forged.equipment.BELT!, upgrades: 2 }));
    sim.command({ type: 'temperItem', slot: 'BELT' });
    expect(sim.snapshot()).toEqual(maxed);
    expect(temperItem(maxed.equipment.BELT!)).toBeNull();
    expect(canTemper(maxed.equipment.BELT!)).toBe(false);

    const save = createSaveRecord(sim.character());
    expect(save?.format).toBe(11);
    expect(JSON.stringify(save)).not.toContain('worldSeed');
    const next = new GameSimulation(3190);
    expect(next.restoreCharacter(readSaveRecord(save)!, 4188)).toBe(true);
    expect(next.snapshot().worldSeed).toBe(4188);
    expect(next.snapshot().equipment.BELT).toEqual(maxed.equipment.BELT);
    expect(next.snapshot().gold).toBe(maxed.gold);
    expect(next.snapshot().enemies.every(unit => unit.actor.alive)).toBe(true);
  });

  it('validates forged gear and rules out missing/invalid upgrade levels on saved items', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'buyItem', offerId: 'belt' });
    const character = sim.character();
    const corrupted = { ...character,
      inventory: character.inventory.map((item, i) =>
        i === 0 && item ? { ...item, upgrades: 4 } : item) };
    expect(validateCharacter(corrupted)).toBeNull();
    const missing = { ...character,
      inventory: character.inventory.map((item, i) =>
        i === 0 && item ? { ...item, upgrades: undefined } : item) };
    expect(validateCharacter(missing)).toBeNull();
    expect(createSaveRecord(corrupted)).toBeNull();
  });

  it('purchases unique IDs after loading, even if older purchases are equipped', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'buyItem', offerId: 'belt' });
    sim.command({ type: 'equip', index: 0 });
    const progress = sim.character();
    const next = new GameSimulation(1);
    expect(next.restoreCharacter(progress, 2)).toBe(true);
    next.command({ type: 'buyItem', offerId: 'belt' });
    const state = next.snapshot();
    expect(state.inventory[0]?.id).not.toBe(state.equipment.BELT?.id);
    expect(state.inventory[0]?.id).toBe('trade-belt-2');
  });
});
