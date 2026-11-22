import { describe, expect, it } from 'vitest';
import { GameBridge } from '../../src/game/bridge/GameBridge';
import { rollItemForBase, SeededRng } from '../../src/game/data/items';

/** The inventory UI sends these exact commands, not a separate client-side
 * equipment state. Validate the real bridge/simulation inventory round trip.
 */
describe('Inventory equip / unequip through GameBridge', () => {
  it('equips a purchased-type item and unequips into the exact bag index without duplication', () => {
    const bridge = new GameBridge();
    const initial = bridge.snapshot();
    const item = rollItemForBase('belt', 'inventory-bridge-belt', 1, 'COMMON',
      new SeededRng(42))!;
    expect(item).toBeTruthy();
    const inventory = [...initial.inventory];
    inventory[5] = item;
    expect(bridge.restore({ ...initial, inventory })).toBe(true);
    expect(bridge.previewEquipment(5, 'BELT')).not.toBeNull();

    bridge.command({ type: 'equip', index: 5, slot: 'BELT' });
    const equipped = bridge.snapshot();
    expect(equipped.equipment.BELT?.id).toBe(item.id);
    expect(equipped.inventory[5]).toBeNull();

    bridge.command({ type: 'unequipTo', slot: 'BELT', index: 17 });
    const unequipped = bridge.snapshot();
    expect(unequipped.equipment.BELT).toBeNull();
    expect(unequipped.inventory[17]?.id).toBe(item.id);
    expect(unequipped.inventory[5]).toBeNull();
    expect(unequipped.inventory.filter(entry => entry?.id === item.id)).toHaveLength(1);

    bridge.command({ type: 'equip', index: 17, slot: 'BELT' });
    expect(bridge.snapshot().equipment.BELT?.id).toBe(item.id);
    expect(bridge.snapshot().inventory[17]).toBeNull();
  });

  it('rejects invalid occupied destination without losing the equipped item', () => {
    const bridge = new GameBridge();
    const initial = bridge.snapshot();
    const belt = rollItemForBase('belt', 'inventory-belt-a', 1, 'COMMON',
      new SeededRng(43))!;
    const helmet = rollItemForBase('helm', 'inventory-helm-b', 1, 'COMMON',
      new SeededRng(44))!;
    const inventory = [...initial.inventory];
    inventory[5] = belt;
    inventory[17] = helmet;
    expect(bridge.restore({ ...initial, inventory })).toBe(true);
    bridge.command({ type: 'equip', index: 5, slot: 'BELT' });
    const before = bridge.snapshot();
    bridge.command({ type: 'unequipTo', slot: 'BELT', index: 17 });
    const after = bridge.snapshot();
    expect(after.equipment.BELT?.id).toBe(belt.id);
    expect(after.inventory[17]?.id).toBe(helmet.id);
    expect(after.inventory.map(entry => entry?.id))
      .toEqual(before.inventory.map(entry => entry?.id));
  });
});
