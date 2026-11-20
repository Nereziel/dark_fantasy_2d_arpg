import { describe, expect, it } from 'vitest';
import {
  ITEM_TEMPLATES, createEquipment,
  type Equipment, type Item, type EquipmentSlot
} from '../../src/game/data/items';
import {
  planEquip, planUnequip, planSwap, planDrop, sortInventory,
  filterInventory, compareEquipment, favoriteOrLockItem,
  type InventoryState
} from '../../src/game/inventory/equipmentRules';

function makeItem(id: string, templateId: string, rarity: Item['rarity'] = 'COMMON', level = 1): Item {
  const template = ITEM_TEMPLATES.find(entry => entry.id === templateId)!;
  if (!template) throw new Error('Invalid test template');
  return {
    id, templateId, slot: template.slot, rarity, level, icon: template.icon,
    armor: template.armor ?? 0, minDmg: template.minDmg ?? 0,
    maxDmg: template.maxDmg ?? 0, block: template.block ?? 0,
    affixes: [], upgrades: 0
  };
}

function state(inventory: Array<Item | null>, equipment: Equipment = createEquipment()): InventoryState {
  return { inventory, equipment, flags: {} };
}

function ids(items: readonly (Item | null)[]): Array<string | null> {
  return items.map(item => item?.id ?? null);
}

describe('Agent 19: pure inventory and equipment plans', () => {
  it('equips, replaces and unequips with no item loss or reference sharing', () => {
    const first = makeItem('weapon-one', 'broadsword');
    const second = makeItem('weapon-two', 'broadsword');
    const initial = state([first, second, null]);
    const original = structuredClone(initial);
    const equipFirst = planEquip(initial, 0);
    expect(equipFirst.ok).toBe(true);
    if (!equipFirst.ok) return;
    expect(ids(equipFirst.state.inventory)).toEqual([null, 'weapon-two', null]);
    expect(equipFirst.state.equipment.MAIN_HAND?.id).toBe('weapon-one');
    const equipSecond = planEquip(equipFirst.state, 1);
    expect(equipSecond.ok).toBe(true);
    if (!equipSecond.ok) return;
    expect(ids(equipSecond.state.inventory)).toEqual([null, 'weapon-one', null]);
    expect(equipSecond.state.equipment.MAIN_HAND?.id).toBe('weapon-two');
    const unequip = planUnequip(equipSecond.state, 'MAIN_HAND');
    expect(unequip.ok).toBe(true);
    if (!unequip.ok) return;
    expect(ids(unequip.state.inventory)).toEqual(['weapon-two', 'weapon-one', null]);
    expect(unequip.state.equipment.MAIN_HAND).toBeNull();
    expect(initial).toEqual(original);
    expect(unequip.state.inventory[0]).not.toBe(first);
    expect(equipFirst.state.equipment.MAIN_HAND).not.toBe(first);
  });

  it('rejects invalid indices, empty slots and incompatible equipment slots', () => {
    const s = state([makeItem('helm', 'helm'), null]);
    for (const index of [-1, 2, 1.25, Number.NaN, Infinity]) {
      expect(planEquip(s, index)).toEqual({ ok: false, reason: 'INVALID_INDEX' });
      expect(planSwap(s, 0, index)).toEqual({ ok: false, reason: 'INVALID_INDEX' });
      expect(planDrop(s, index)).toEqual({ ok: false, reason: 'INVALID_INDEX' });
    }
    expect(planEquip(s, 1)).toEqual({ ok: false, reason: 'EMPTY_SLOT' });
    expect(planEquip(s, 0, 'MAIN_HAND')).toEqual({ ok: false, reason: 'INCOMPATIBLE_SLOT' });
    expect(planEquip(s, 0, 'UNKNOWN' as EquipmentSlot)).toEqual({ ok: false, reason: 'INVALID_SLOT' });
    expect(planUnequip(s, 'HELMET')).toEqual({ ok: false, reason: 'EMPTY_SLOT' });
    expect(planUnequip(s, 'OTHER' as EquipmentSlot)).toEqual({ ok: false, reason: 'INVALID_SLOT' });
  });

  it('uses distinct ring slots while allowing rings to replace either ring', () => {
    const s = state([
      makeItem('ring-1', 'signet'), makeItem('ring-2', 'signet'),
      makeItem('ring-3', 'signet')
    ]);
    const one = planEquip(s, 0, 'RING_1');
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    const two = planEquip(one.state, 1, 'RING_2');
    expect(two.ok).toBe(true);
    if (!two.ok) return;
    expect(two.state.equipment.RING_1?.id).toBe('ring-1');
    expect(two.state.equipment.RING_2?.id).toBe('ring-2');
    const three = planEquip(two.state, 2, 'RING_1');
    expect(three.ok).toBe(true);
    if (!three.ok) return;
    expect(three.state.equipment.RING_1?.id).toBe('ring-3');
    expect(three.state.equipment.RING_2?.id).toBe('ring-2');
    expect(three.state.inventory[2]?.id).toBe('ring-1');
  });

  it('unequips to the first empty inventory slot, rejecting a full inventory atomically', () => {
    const equipment = createEquipment();
    equipment.HELMET = makeItem('equipped-helm', 'helm');
    const full = state([makeItem('ring', 'signet')], equipment);
    const before = structuredClone(full);
    expect(planUnequip(full, 'HELMET')).toEqual({ ok: false, reason: 'INVENTORY_FULL' });
    expect(full).toEqual(before);
    const partial = state([makeItem('ring', 'signet'), null], equipment);
    const result = planUnequip(partial, 'HELMET');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ids(result.state.inventory)).toEqual(['ring', 'equipped-helm']);
  });

  it('moves offhand gear atomically when equipping a two-handed main-hand item', () => {
    const equipment = createEquipment();
    equipment.MAIN_HAND = makeItem('old-one-hand', 'broadsword');
    equipment.OFF_HAND = makeItem('old-shield', 'shield');
    const incoming = makeItem('new-two-hand', 'broadsword');
    const initial = state([incoming, null, makeItem('ring', 'signet')], equipment);
    const snapshot = structuredClone(initial);
    const result = planEquip(initial, 0, 'MAIN_HAND', { twoHandedItemIds: ['new-two-hand'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.equipment.MAIN_HAND?.id).toBe('new-two-hand');
    expect(result.state.equipment.OFF_HAND).toBeNull();
    expect(ids(result.state.inventory)).toEqual(['old-one-hand', 'old-shield', 'ring']);
    expect(initial).toEqual(snapshot);
  });

  it('rejects two-handed replacement when displaced main and offhand cannot both fit', () => {
    const equipment = createEquipment();
    equipment.MAIN_HAND = makeItem('old-one-hand', 'broadsword');
    equipment.OFF_HAND = makeItem('old-shield', 'shield');
    const initial = state([
      makeItem('new-two-hand', 'broadsword'), makeItem('ring', 'signet')
    ], equipment);
    const snapshot = structuredClone(initial);
    expect(planEquip(initial, 0, 'MAIN_HAND', { twoHandedItemIds: ['new-two-hand'] }))
      .toEqual({ ok: false, reason: 'INVENTORY_FULL' });
    expect(initial).toEqual(snapshot);
  });

  it('lets a two-hander move a lone offhand item into its freed source cell', () => {
    const equipment = createEquipment();
    equipment.OFF_HAND = makeItem('shield', 'shield');
    const result = planEquip(state([makeItem('big-sword', 'broadsword')], equipment), 0,
      'MAIN_HAND', { twoHandedItemIds: ['big-sword'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ids(result.state.inventory)).toEqual(['shield']);
    expect(result.state.equipment.OFF_HAND).toBeNull();
  });

  it('prohibits an offhand while a two-handed weapon is equipped', () => {
    const equipment = createEquipment();
    equipment.MAIN_HAND = makeItem('two-hand', 'broadsword');
    const initial = state([makeItem('offhand', 'shield')], equipment);
    expect(planEquip(initial, 0, 'OFF_HAND', { twoHandedItemIds: ['two-hand'] }))
      .toEqual({ ok: false, reason: 'HAND_CONFLICT' });
  });

  it('rejects malformed pre-existing dual-hand state rather than normalizing it silently', () => {
    const equipment = createEquipment();
    equipment.MAIN_HAND = makeItem('two-hand', 'broadsword');
    equipment.OFF_HAND = makeItem('shield', 'shield');
    const initial = state([null], equipment);
    expect(planSwap(initial, 0, 0, { twoHandedItemIds: ['two-hand'] }))
      .toEqual({ ok: false, reason: 'INVALID_STATE' });
  });

  it('enforces explicit character level requirements but does not confuse item level with them', () => {
    const sword = makeItem('sword', 'broadsword', 'RARE', 50);
    const initial = state([sword]);
    expect(planEquip(initial, 0, undefined, {
      playerLevel: 5, requiredLevelsById: { sword: 6 }
    })).toEqual({ ok: false, reason: 'LEVEL_REQUIRED' });
    expect(planEquip(initial, 0, undefined, {
      playerLevel: 6, requiredLevelsById: { sword: 6 }
    }).ok).toBe(true);
    expect(planEquip(initial, 0).ok).toBe(true);
    expect(planEquip(initial, 0, undefined, {
      playerLevel: Infinity
    })).toEqual({ ok: false, reason: 'INVALID_RULES' });
    expect(planEquip(initial, 0, undefined, {
      playerLevel: 5, requiredLevelsById: { sword: Number.NaN }
    })).toEqual({ ok: false, reason: 'INVALID_RULES' });
  });

  it('swaps inventory cells including empty positions without losing references in the source', () => {
    const initial = state([makeItem('ring', 'signet'), null, makeItem('helm', 'helm')]);
    const original = structuredClone(initial);
    const result = planSwap(initial, 0, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ids(result.state.inventory)).toEqual([null, 'ring', 'helm']);
    expect(initial).toEqual(original);
    expect(planSwap(initial, 1, 1).ok).toBe(true);
  });

  it('protects favorited or locked items against dropping; dropping clears flags', () => {
    const initial = state([makeItem('ring', 'signet'), null]);
    const locked = favoriteOrLockItem(initial, 'ring', 'locked', true);
    expect(locked.ok).toBe(true);
    if (!locked.ok) return;
    expect(planDrop(locked.state, 0)).toEqual({ ok: false, reason: 'PROTECTED_ITEM' });
    const favored = favoriteOrLockItem(locked.state, 'ring', 'favorite', true);
    expect(favored.ok).toBe(true);
    if (!favored.ok) return;
    expect(planDrop(favored.state, 0)).toEqual({ ok: false, reason: 'PROTECTED_ITEM' });
    const unlock = favoriteOrLockItem(favored.state, 'ring', 'locked', false);
    expect(unlock.ok).toBe(true);
    if (!unlock.ok) return;
    expect(planDrop(unlock.state, 0)).toEqual({ ok: false, reason: 'PROTECTED_ITEM' });
    const unfavorite = favoriteOrLockItem(unlock.state, 'ring', 'favorite', false);
    expect(unfavorite.ok).toBe(true);
    if (!unfavorite.ok) return;
    const dropped = planDrop(unfavorite.state, 0);
    expect(dropped.ok).toBe(true);
    if (!dropped.ok) return;
    expect(dropped.dropped.id).toBe('ring');
    expect(dropped.state.inventory[0]).toBeNull();
    expect(dropped.state.flags).toEqual({});
    expect(initial.inventory[0]?.id).toBe('ring');
  });

  it('sorts deterministically by rarity, level, template and stable item ID', () => {
    const items = [
      makeItem('common', 'helm', 'COMMON', 25),
      makeItem('rare-low', 'broadsword', 'RARE', 2),
      null,
      makeItem('rare-high-b', 'signet', 'RARE', 10),
      makeItem('rare-high-a', 'signet', 'RARE', 10),
      makeItem('legend', 'shield', 'LEGENDARY', 1)
    ];
    const initial = state(items);
    const before = structuredClone(initial);
    const first = sortInventory(initial);
    const second = sortInventory(initial);
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    if (!first.ok) return;
    expect(ids(first.state.inventory))
      .toEqual(['legend', 'rare-high-a', 'rare-high-b', 'rare-low', 'common', null]);
    expect(initial).toEqual(before);
    expect(first.state.inventory.length).toBe(items.length);
  });

  it('filters with stable original indices and detached item projections', () => {
    const initial = state([
      makeItem('rare-ring', 'signet', 'RARE'),
      makeItem('common-helm', 'helm', 'COMMON'), null
    ]);
    const favored = favoriteOrLockItem(initial, 'rare-ring', 'favorite', true);
    expect(favored.ok).toBe(true);
    if (!favored.ok) return;
    const result = filterInventory(favored.state, { rarity: 'RARE', favorite: true, slot: 'RING_2' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matches.map(entry => [entry.index, entry.item.id]))
      .toEqual([[0, 'rare-ring']]);
    expect(result.matches[0]?.flags.favorite).toBe(true);
    expect(result.matches[0]?.item).not.toBe(initial.inventory[0]);
    expect(filterInventory(initial, { rarity: 'FAKE' as Item['rarity'] }))
      .toEqual({ ok: false, reason: 'INVALID_FILTER' });
    expect(filterInventory(initial, { favorite: 'yes' as unknown as boolean }))
      .toEqual({ ok: false, reason: 'INVALID_FILTER' });
  });

  it('projects pure base and derived differences with the existing stat derivation', () => {
    const before = createEquipment();
    const after = createEquipment();
    const belt = makeItem('belt', 'belt');
    after.BELT = { ...belt, armor: 8, affixes: [{ id: 'vit', stat: 'vitality', value: 4 }] };
    const source = structuredClone(after);
    const compare = compareEquipment('WARRIOR', before, after);
    expect(compare.ok).toBe(true);
    if (!compare.ok) return;
    expect(compare.comparison.base.delta.armor).toBe(8);
    expect(compare.comparison.derived.delta.vitality).toBe(4);
    expect(compare.comparison.derived.delta.maxHealth).toBe(48);
    expect(compare.comparison.derived.delta.armor).toBeGreaterThanOrEqual(8);
    expect(after).toEqual(source);
  });

  it('rejects duplicates, corrupted slots and malformed state before any mutation', () => {
    const dup = makeItem('same-id', 'helm');
    const equipment = createEquipment();
    equipment.HELMET = dup;
    const duplicate = state([dup], equipment);
    expect(planEquip(duplicate, 0)).toEqual({ ok: false, reason: 'DUPLICATE_ID' });
    const misplaced = createEquipment();
    misplaced.OFF_HAND = makeItem('sword', 'broadsword');
    expect(sortInventory(state([null], misplaced)))
      .toEqual({ ok: false, reason: 'INVALID_STATE' });
    expect(planSwap(null as unknown as InventoryState, 0, 0))
      .toEqual({ ok: false, reason: 'INVALID_STATE' });
    const invalid = state([makeItem('broken', 'helm')]);
    (invalid.inventory[0] as Item).armor = Number.POSITIVE_INFINITY;
    expect(planDrop(invalid, 0)).toEqual({ ok: false, reason: 'INVALID_STATE' });
    expect(favoriteOrLockItem(state([null]), 'unknown', 'locked', true))
      .toEqual({ ok: false, reason: 'ITEM_NOT_FOUND' });
  });

  it('survives JSON roundtrip and retains item identities, flags and deterministic behavior', () => {
    const original = state([makeItem('sword', 'broadsword'), makeItem('shield', 'shield'), null]);
    const equip = planEquip(original, 0);
    expect(equip.ok).toBe(true);
    if (!equip.ok) return;
    const locked = favoriteOrLockItem(equip.state, 'sword', 'favorite', true);
    expect(locked.ok).toBe(true);
    if (!locked.ok) return;
    const restored = JSON.parse(JSON.stringify(locked.state)) as InventoryState;
    expect(restored).toEqual(locked.state);
    expect(planUnequip(restored, 'MAIN_HAND')).toEqual(planUnequip(locked.state, 'MAIN_HAND'));
    expect(filterInventory(restored)).toEqual(filterInventory(locked.state));
  });

  it('rejects invalid flags and duplicate two-handed metadata', () => {
    const initial = state([makeItem('sword', 'broadsword')]);
    expect(favoriteOrLockItem(initial, 'sword', 'locked', 'true' as unknown as boolean))
      .toEqual({ ok: false, reason: 'INVALID_RULES' });
    expect(planEquip(initial, 0, undefined, { twoHandedItemIds: ['sword', 'sword'] }))
      .toEqual({ ok: false, reason: 'INVALID_RULES' });
    const withOrphan = { ...initial, flags: { stranger: { locked: true, favorite: false } } };
    expect(sortInventory(withOrphan)).toEqual({ ok: false, reason: 'INVALID_STATE' });
  });
});
