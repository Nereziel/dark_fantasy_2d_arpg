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

  it('allows paused inventory swaps, sort, flags and protected drops without unpausing gameplay', () => {
    const bridge = new GameBridge();
    const initial = bridge.snapshot();
    const first = rollItemForBase('belt', 'pause-belt-a', 1, 'COMMON', new SeededRng(46))!;
    const second = rollItemForBase('belt', 'pause-belt-b', 1, 'COMMON', new SeededRng(47))!;
    const inventory = [...initial.inventory];
    inventory[0] = first;
    inventory[1] = second;
    expect(bridge.restore({ ...initial, inventory })).toBe(true);
    bridge.command({ type: 'pause', value: true });
    expect(bridge.snapshot().paused).toBe(true);

    bridge.command({ type: 'swapInventory', fromIndex: 0, toIndex: 1 });
    expect(bridge.snapshot().inventory[0]?.id).toBe(second.id);
    expect(bridge.snapshot().inventory[1]?.id).toBe(first.id);

    bridge.command({ type: 'sortInventory' });
    expect(bridge.snapshot().inventory[0]?.id).toBe(first.id);
    expect(bridge.snapshot().inventory[1]?.id).toBe(second.id);
    bridge.command({ type: 'setItemFlag', itemId: first.id, flag: 'locked', value: true });
    expect(bridge.snapshot().itemFlags?.[first.id]?.locked).toBe(true);

    const beforeProtected = bridge.snapshot();
    bridge.command({ type: 'dropInventory', index: 0 });
    expect(bridge.snapshot().inventory[0]?.id).toBe(first.id);
    expect(bridge.snapshot().groundLoot).toEqual(beforeProtected.groundLoot);

    bridge.command({ type: 'setItemFlag', itemId: first.id, flag: 'locked', value: false });
    bridge.command({ type: 'dropInventory', index: 0 });
    expect(bridge.snapshot().inventory[0]).toBeNull();
    expect(bridge.snapshot().groundLoot.some(drop => drop.item.id === first.id)).toBe(true);
    expect(bridge.snapshot().paused).toBe(true);

    // A paused inventory does not let a queued movement/combat escape when
    // the user closes the modal.
    const beforeMovement = bridge.snapshot().player;
    bridge.command({ type: 'move', destination: { x: 620, y: 480 } });
    bridge.tick(1000);
    bridge.command({ type: 'pause', value: false });
    bridge.tick(500);
    expect(bridge.snapshot().player.x).toBe(beforeMovement.x);
    expect(bridge.snapshot().player.y).toBe(beforeMovement.y);
  });

  it('explains level, incompatible slot and invalid index using the same read-only equip planner', () => {
    const bridge = new GameBridge();
    const start = bridge.snapshot();
    const base = rollItemForBase('belt', 'high-level-belt', 1, 'COMMON',
      new SeededRng(78))!;
    const highLevel = { ...base, requiredLevel: start.level + 8 };
    const inventory = [...start.inventory];
    inventory[5] = highLevel;
    expect(bridge.restore({ ...start, inventory })).toBe(true);
    bridge.command({ type: 'pause', value: true });
    const before = bridge.snapshot();

    expect(bridge.equipmentPlacementError(5, 'BELT')).toBe('LEVEL_REQUIRED');
    expect(bridge.equipmentPlacementError(5, 'HELMET')).toBe('INCOMPATIBLE_SLOT');
    expect(bridge.equipmentPlacementError(999, 'BELT')).toBe('INVALID_INDEX');
    expect(bridge.equipmentPlacementError(6, 'BELT')).toBe('EMPTY_SLOT');
    expect(bridge.snapshot()).toEqual(before);

    bridge.command({ type: 'equip', index: 5, slot: 'BELT' });
    expect(bridge.snapshot().inventory[5]?.id).toBe(highLevel.id);
    expect(bridge.snapshot().equipment.BELT).toBeNull();
    expect(bridge.snapshot().paused).toBe(true);

    const available = { ...highLevel, requiredLevel: start.level };
    expect(bridge.restore({ ...before, inventory: [
      ...before.inventory.slice(0, 5), available, ...before.inventory.slice(6)
    ] })).toBe(true);
    expect(bridge.equipmentPlacementError(5, 'BELT')).toBeNull();
    expect(bridge.previewEquipment(5, 'BELT')).not.toBeNull();
  });

  it('explains full-bag unequip and occupied exact destinations without changing any item', () => {
    const bridge = new GameBridge();
    const start = bridge.snapshot();
    const belt = rollItemForBase('belt', 'full-bag-equipped-belt', 1, 'COMMON',
      new SeededRng(88))!;
    // 24 occupied cells: all item instance IDs are unique and valid.
    const inventory = start.inventory.map((_, index) =>
      rollItemForBase('helm', 'full-bag-item-' + index, 1, 'COMMON',
        new SeededRng(100 + index))!);
    expect(bridge.restore({ ...start, inventory,
      equipment: { ...start.equipment, BELT: belt } })).toBe(true);
    bridge.command({ type: 'pause', value: true });
    const full = bridge.snapshot();

    expect(bridge.equipmentRemovalError('BELT')).toBe('INVENTORY_FULL');
    expect(bridge.equipmentRemovalError('BELT', 17)).toBe('SLOT_OCCUPIED');
    expect(bridge.equipmentRemovalError('BELT', -1)).toBe('INVALID_INDEX');
    expect(bridge.equipmentRemovalError('RELIC')).toBe('EMPTY_SLOT');
    expect(bridge.snapshot()).toEqual(full);
    bridge.command({ type: 'unequip', slot: 'BELT' });
    expect(bridge.snapshot()).toEqual(full);

    // A single free cell changes the exact planner result, not the item
    // identity. Re-equip/unequip still work while the inventory is paused.
    bridge.command({ type: 'dropInventory', index: 17 });
    expect(bridge.snapshot().inventory[17]).toBeNull();
    expect(bridge.equipmentRemovalError('BELT')).toBeNull();
    expect(bridge.equipmentRemovalError('BELT', 17)).toBeNull();
    const before = bridge.snapshot().inventory.filter(item => item !== null).length;
    bridge.command({ type: 'unequip', slot: 'BELT' });
    expect(bridge.snapshot().equipment.BELT).toBeNull();
    expect(bridge.snapshot().inventory[17]?.id).toBe(belt.id);
    expect(bridge.snapshot().inventory.filter(item => item !== null)).toHaveLength(before + 1);
    expect(bridge.snapshot().paused).toBe(true);
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
