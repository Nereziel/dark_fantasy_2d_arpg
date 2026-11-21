// Issue #123 stage 2: real catalog 2H/offhand and gem/rune presentation IDs.
// GPL-3.0-only.
import { describe, expect, it } from 'vitest';
import { createEquipment, rollItemForBase, SeededRng } from '../../src/game/data/items';
import { GEM_BASES, GEM_IDS, baseOf, isGemId, tierOf } from '../../src/game/gems/gemCatalog';
import { planEquip, type InventoryState } from '../../src/game/inventory/equipmentRules';

const roll = (id: string, base: 'broadsword' | 'greatsword' | 'shield' | 'helm', seed: number) => {
  const item = rollItemForBase(base, id, 8, 'COMMON', new SeededRng(seed));
  if (!item) throw new Error('Missing item template: ' + base);
  return item;
};

describe('Issue 123: real two-handed catalog transactions', () => {
  const sword = roll('main-one', 'broadsword', 1);
  const shield = roll('off-shield', 'shield', 2);
  const greatsword = roll('main-two', 'greatsword', 3);

  const startingState = (withFreeCell: boolean): InventoryState => ({
    inventory: withFreeCell
      ? [greatsword, null, roll('bag-helm', 'helm', 4)]
      : [greatsword, roll('bag-helm', 'helm', 4)],
    equipment: { ...createEquipment(), MAIN_HAND: sword, OFF_HAND: shield },
    flags: {}
  });

  it('recognizes actual greatsword metadata and displaces both hands without losing IDs', () => {
    expect(greatsword.twoHanded).toBe(true);
    expect(shield.slot).toBe('OFF_HAND');
    const state = startingState(true);
    const before = structuredClone(state);
    const plan = planEquip(state, 0, 'MAIN_HAND', { playerLevel: 8 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.state.equipment.MAIN_HAND?.id).toBe(greatsword.id);
    expect(plan.state.equipment.OFF_HAND).toBeNull();
    expect(plan.state.inventory.map(item => item?.id ?? null))
      .toEqual([sword.id, shield.id, 'bag-helm']);
    expect(state).toEqual(before);
  });

  it('rejects full-bag displacement atomically and bars shields while two-handing', () => {
    const full = startingState(false);
    const before = structuredClone(full);
    expect(planEquip(full, 0, 'MAIN_HAND', { playerLevel: 8 }))
      .toEqual({ ok: false, reason: 'INVENTORY_FULL' });
    expect(full).toEqual(before);

    const equipped: InventoryState = {
      inventory: [shield, null],
      equipment: { ...createEquipment(), MAIN_HAND: greatsword },
      flags: {}
    };
    expect(planEquip(equipped, 0, 'OFF_HAND', { playerLevel: 8 }))
      .toEqual({ ok: false, reason: 'HAND_CONFLICT' });
  });

  it('enforces the actual required level in the same transaction contract', () => {
    expect(greatsword.requiredLevel).toBeGreaterThan(1);
    const state: InventoryState = { inventory: [greatsword], equipment: createEquipment(), flags: {} };
    expect(planEquip(state, 0, undefined, {
      playerLevel: 1, requiredLevelsById: { [greatsword.id]: greatsword.requiredLevel! }
    })).toEqual({ ok: false, reason: 'LEVEL_REQUIRED' });
  });
});

describe('Issue 123: each gem and rune tier keeps a stable artwork identity', () => {
  it('provides three valid tiers for all six distinct visual families', () => {
    expect(GEM_BASES).toHaveLength(6);
    expect(GEM_IDS).toHaveLength(18);
    expect(new Set(GEM_BASES.map(base => base.id)).size).toBe(6);
    for (const definition of GEM_BASES) {
      for (const tier of [1, 2, 3] as const) {
        const id = `${definition.id}.${tier}`;
        expect(isGemId(id), id).toBe(true);
        if (!isGemId(id)) continue;
        expect(tierOf(id)).toBe(tier);
        expect(baseOf(id).id).toBe(definition.id);
      }
    }
    expect(GEM_IDS.filter(id => id.startsWith('gem.'))).toHaveLength(9);
    expect(GEM_IDS.filter(id => id.startsWith('rune.'))).toHaveLength(9);
  });
});
