import { describe, expect, it } from 'vitest';
import { GameBridge } from '../../src/game/bridge/GameBridge';
import { rollItemForBase, SeededRng } from '../../src/game/data/items';

const ring = (id: string, armor: number, seed: number) => ({
  ...rollItemForBase('signet', id, 1, 'COMMON', new SeededRng(seed))!,
  armor
});

/** A preview is a promise about the resulting authoritative equip command,
 * not about the item's canonical RING_1 template when RING_2 is selected.
 */
describe('Inventory ring equip / comparison slot parity', () => {
  it('previews the free second ring socket and does not falsely project replacing the first ring', () => {
    const bridge = new GameBridge();
    const initial = bridge.snapshot();
    const first = ring('ring-preview-first', 18, 201);
    const second = ring('ring-preview-second', 2, 202);
    const inventory = [...initial.inventory];
    inventory[7] = second;
    expect(bridge.restore({ ...initial, inventory, equipment: {
      ...initial.equipment, RING_1: first
    } })).toBe(true);
    bridge.command({ type: 'pause', value: true });

    const before = bridge.snapshot();
    const projectedRight = bridge.previewEquipment(7, 'RING_2');
    const projectedReplacement = bridge.previewEquipment(7, 'RING_1');
    expect(projectedRight).not.toBeNull();
    expect(projectedRight).not.toEqual(projectedReplacement);
    expect(bridge.previewEquipment(7)).toEqual(projectedRight);
    expect(bridge.equipmentPlacementError(7)).toBeNull();
    expect(bridge.snapshot()).toEqual(before);

    bridge.command({ type: 'equip', index: 7 });
    const equipped = bridge.snapshot();
    expect(equipped.equipment.RING_1?.id).toBe(first.id);
    expect(equipped.equipment.RING_2?.id).toBe(second.id);
    expect(equipped.inventory[7]).toBeNull();
    expect(equipped.paused).toBe(true);
    for (const [stat, delta] of Object.entries(projectedRight!)) {
      const key = stat as keyof typeof projectedRight;
      expect(equipped.stats[key] - before.stats[key]).toBeCloseTo(delta as number, 2);
    }
  });

  it('respects explicit ring choice, and defaults to the first ring slot if both are occupied', () => {
    const bridge = new GameBridge();
    const original = bridge.snapshot();
    const first = ring('ring-choice-first', 5, 203);
    const second = ring('ring-choice-second', 8, 204);
    const next = ring('ring-choice-next', 11, 205);
    const inventory = [...original.inventory];
    inventory[3] = next;
    expect(bridge.restore({ ...original, inventory, equipment: {
      ...original.equipment, RING_1: first, RING_2: second
    } })).toBe(true);
    const before = bridge.snapshot();
    expect(bridge.previewEquipment(3)).toEqual(bridge.previewEquipment(3, 'RING_1'));
    expect(bridge.previewEquipment(3)).not.toEqual(bridge.previewEquipment(3, 'RING_2'));
    expect(bridge.snapshot()).toEqual(before);
    bridge.command({ type: 'equip', index: 3 });
    expect(bridge.snapshot().equipment.RING_1?.id).toBe(next.id);
    expect(bridge.snapshot().equipment.RING_2?.id).toBe(second.id);
    expect(bridge.snapshot().inventory[3]?.id).toBe(first.id);
  });
});
