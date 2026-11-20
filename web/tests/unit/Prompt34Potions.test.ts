import { describe, expect, it } from 'vitest';
import {
  POTION_IDS, POTIONS, freshPotions, isPotionCharges, isPotionState,
  planPotionUse, planPotionRefill, advancePotions, selectPotion
} from '../../src/game/consumables/potionRules';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';

function player() {
  return { health: 40, maxHealth: 100, resource: 10, maxResource: 100, alive: true, paused: false };
}

describe('Prompt 34 — deterministic consumables', () => {
  it('defines bounded charges and canonical ids', () => {
    expect(POTION_IDS).toEqual(['healing', 'resource', 'resistance', 'fury']);
    const state = freshPotions();
    expect(isPotionState(state)).toBe(true);
    expect(isPotionCharges(state.charges)).toBe(true);
    expect(state.selected).toBe('healing');
    expect(state.charges.healing).toBeGreaterThan(0);
    for (const bad of [null, [], { healing: -1 }, { ...state.charges, healing: Infinity },
      { ...state.charges, healing: 1.2 }, { ...state.charges, healing: 9999 },
      { ...state.charges, __proto__: null, broken: 4 }, JSON.parse('{"__proto__":2}')]) {
      expect(isPotionCharges(bad)).toBe(false);
    }
    expect(selectPotion(state, '__proto__' as 'healing')).toBeNull();
    expect(selectPotion(state, 'fury')?.selected).toBe('fury');
    expect(state.selected).toBe('healing');
  });

  it('heals only missing health, spends once and rejects instant repeats', () => {
    const original = freshPotions();
    const used = planPotionUse(original, 'healing', player());
    expect(used?.health).toBeGreaterThan(40);
    expect(used?.health).toBeLessThanOrEqual(100);
    expect(used?.state.charges.healing).toBe(original.charges.healing - 1);
    expect(used?.state.cooldown).toBe(POTIONS.healing.cooldown);
    expect(original.charges.healing).toBe(freshPotions().charges.healing);
    expect(used && planPotionUse(used.state, 'healing', player())).toBeNull();
    expect(planPotionUse(original, 'healing', { ...player(), health: 100 })).toBeNull();
    expect(planPotionUse(original, 'healing', { ...player(), alive: false })).toBeNull();
    expect(planPotionUse(original, 'healing', { ...player(), paused: true })).toBeNull();
    expect(planPotionUse(original, 'healing', { ...player(), health: NaN })).toBeNull();
  });

  it('restores class resource without overfilling, expires cooldown and buffs', () => {
    const state = freshPotions();
    const resource = planPotionUse(state, 'resource', player());
    expect(resource?.resource).toBeGreaterThan(10);
    expect(resource?.resource).toBeLessThanOrEqual(100);
    expect(planPotionUse(state, 'resource', { ...player(), resource: 100 })).toBeNull();
    const ward = planPotionUse(state, 'resistance', player())!;
    expect(ward.state.buffs.resistance).toBe(POTIONS.resistance.duration);
    expect(ward.state.charges.resistance).toBe(state.charges.resistance - 1);
    const cleared = advancePotions(ward.state, 200)!;
    expect(cleared.cooldown).toBe(0);
    expect(cleared.buffs.resistance).toBe(0);
    const fury = planPotionUse(cleared, 'fury', player())!;
    expect(fury.state.buffs.fury).toBe(POTIONS.fury.duration);
    expect(advancePotions(fury.state, 0)).toBeNull();
    expect(advancePotions(fury.state, Infinity)).toBeNull();
    expect(isPotionState({ ...fury.state, cooldown: -2 })).toBe(false);
    expect(isPotionState({ ...fury.state, buffs: { resistance: 0, fury: NaN } })).toBe(false);
  });

  it('refills only one missing charge for an exact price with an atomic plan', () => {
    const state = freshPotions();
    expect(planPotionRefill(state, 'healing', 500)).toBeNull();
    const used = planPotionUse(state, 'healing', player())!;
    const before = used.state.charges.healing;
    expect(planPotionRefill(used.state, 'healing', 0)).toBeNull();
    const refilled = planPotionRefill(used.state, 'healing', 500)!;
    expect(refilled.goldSpent).toBe(POTIONS.healing.refillGold);
    expect(refilled.state.charges.healing).toBe(before + 1);
    expect(used.state.charges.healing).toBe(before);
    expect(planPotionRefill(refilled.state, 'healing', 500)).toBeNull();
    expect(planPotionRefill(used.state, '__proto__' as 'healing', 500)).toBeNull();
  });
});

describe('Prompt 34 — authoritative simulation and character-only save v11', () => {
  it('consumes a resistance potion in combat time and persists remaining charges', () => {
    const sim = new GameSimulation(71);
    sim.command({ type: 'selectPotion', potionId: 'resistance' });
    sim.command({ type: 'usePotion' });
    const snapshot = sim.snapshot();
    expect(snapshot.potions?.selected).toBe('resistance');
    expect(snapshot.potions?.buffs.resistance).toBeGreaterThan(0);
    expect(snapshot.potions?.cooldown).toBeGreaterThan(0);
    expect(snapshot.potions?.charges.resistance).toBe(freshPotions().charges.resistance - 1);
    sim.command({ type: 'usePotion' });
    expect(sim.snapshot().potions?.charges).toEqual(snapshot.potions?.charges);
    const character = sim.character();
    expect(character.potionCharges?.resistance).toBe(snapshot.potions?.charges.resistance);
    const record = createSaveRecord(character);
    expect(record?.format).toBe(11);
    const restored = readSaveRecord(record);
    expect(restored?.potionCharges).toEqual(character.potionCharges);
    const next = new GameSimulation(71);
    expect(next.restoreCharacter(restored!)).toBe(true);
    expect(next.snapshot().potions?.charges).toEqual(character.potionCharges);
    expect(next.snapshot().potions?.buffs.resistance).toBe(0);
    expect(next.snapshot().potions?.cooldown).toBeGreaterThan(0);
  });

  it('rejects forged snapshots and invalid character charge ledgers', () => {
    const sim = new GameSimulation();
    const baseline = sim.snapshot();
    expect(sim.restore({ ...baseline, potions: { ...freshPotions(), cooldown: Infinity } })).toBe(false);
    expect(sim.restore({ ...baseline, potions: { ...freshPotions(), charges: { ...freshPotions().charges, healing: -1 } } })).toBe(false);
    expect(sim.snapshot().potions).toEqual(baseline.potions);
    expect(new GameSimulation().restoreCharacter({ ...sim.character(),
      potionCharges: { ...freshPotions().charges, healing: -4 } })).toBe(false);
    expect(new GameSimulation().restoreCharacter({ ...sim.character(),
      potionSelected: '__proto__' as 'healing' })).toBe(false);
    expect(new GameSimulation().restoreCharacter({ ...sim.character(),
      potionCooldown: Infinity })).toBe(false);
  });

  it('handles older saves without a potion ledger and keeps v11 compatibility', () => {
    const sim = new GameSimulation();
    const legacy = sim.character();
    delete legacy.potionCharges;
    delete legacy.potionSelected;
    delete legacy.potionCooldown;
    const next = new GameSimulation();
    expect(next.restoreCharacter(legacy)).toBe(true);
    expect(next.snapshot().potions?.charges).toEqual(freshPotions().charges);
    expect(readSaveRecord(createSaveRecord(legacy))?.potionCharges).toBeUndefined();
  });
});
