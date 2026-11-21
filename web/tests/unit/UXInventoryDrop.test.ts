import { describe, it, expect } from 'vitest';
import { createEquipment, rollItemForBase, SeededRng } from '../../src/game/data/items';
import { planEquip, planUnequipAt } from '../../src/game/inventory/equipmentRules';

function fixture() {
  const dagger = rollItemForBase('dagger', 'ux-dagger-one', 1, 'COMMON', new SeededRng(24))!;
  const bow = rollItemForBase('bow', 'ux-bow-two', 5, 'COMMON', new SeededRng(25))!;
  const equipment = createEquipment();
  equipment.MAIN_HAND = dagger;
  const inventory = Array(24).fill(null);
  inventory[3] = bow;
  return { equipment, inventory, dagger, bow };
}

describe('Diablo-like inventory drag/drop uses authoritative immutable plans', () => {
  it('moves equipped gear into the exact requested empty bag cell', () => {
    const state = fixture();
    const plan = planUnequipAt(state, 'MAIN_HAND', 17);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.state.inventory[17]?.id).toBe(state.dagger.id);
    expect(plan.state.inventory[3]?.id).toBe(state.bow.id);
    expect(plan.state.equipment.MAIN_HAND).toBeNull();
    expect(state.inventory[17]).toBeNull();
    expect(state.equipment.MAIN_HAND?.id).toBe(state.dagger.id);
  });
  it('rejects occupied, invalid and empty slots without mutation', () => {
    const state = fixture();
    expect(planUnequipAt(state, 'MAIN_HAND', 3)).toMatchObject({ ok: false, reason: 'SLOT_OCCUPIED' });
    expect(planUnequipAt(state, 'MAIN_HAND', -1)).toMatchObject({ ok: false, reason: 'INVALID_INDEX' });
    expect(planUnequipAt(state, 'MAIN_HAND', 24)).toMatchObject({ ok: false, reason: 'INVALID_INDEX' });
    expect(planUnequipAt(state, 'HELMET', 17)).toMatchObject({ ok: false, reason: 'EMPTY_SLOT' });
    expect(state.inventory[3]?.id).toBe(state.bow.id);
  });
  it('swaps bag gear into occupied equipment via the existing transactional plan', () => {
    const state = fixture();
    const plan = planEquip(state, 3, 'MAIN_HAND');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.state.equipment.MAIN_HAND?.id).toBe(state.bow.id);
    expect(plan.state.inventory[3]?.id).toBe(state.dagger.id);
    expect(state.equipment.MAIN_HAND?.id).toBe(state.dagger.id);
  });
});
