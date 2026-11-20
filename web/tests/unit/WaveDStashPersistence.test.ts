import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { planStashDeposit, planStashWithdraw, validateStashContents, STASH_SIZE } from '../../src/game/inventory/stashRules';
import { createSaveRecord, readSaveRecord, migrateV9Character } from '../../src/persistence/SaveRepository';
import { townEntry } from '../../src/game/world/townManifest';
import { rollItem, SeededRng } from '../../src/game/data/items';

function atStash(sim: GameSimulation): void {
  const s = sim.snapshot();
  const pos = townEntry('stash_camp')!.position;
  expect(sim.restore({ ...s, player: { ...s.player, ...pos } })).toBe(true);
}

describe('Wave D persistent, safe 24-slot camp stash', () => {
  it('stores and retrieves real items at the camp without duplication, while the dialog pauses combat', () => {
    const sim = new GameSimulation(2);
    sim.command({ type: 'buyItem', offerId: 'belt' });
    const item = sim.snapshot().inventory[0]!;
    atStash(sim);
    sim.command({ type: 'pause', value: true });
    sim.command({ type: 'stashDeposit', index: 0 });
    const deposited = sim.snapshot();
    expect(deposited.inventory[0]).toBeNull();
    expect(deposited.stash?.[0]?.id).toBe(item.id);
    expect(deposited.gold).toBe(43);
    sim.command({ type: 'stashDeposit', index: 0 });
    expect(sim.snapshot()).toEqual(deposited);
    sim.command({ type: 'stashWithdraw', index: 0 });
    expect(sim.snapshot().inventory[0]).toEqual(item);
    expect(sim.snapshot().stash?.every(slot => slot === null)).toBe(true);
    sim.command({ type: 'stashWithdraw', index: 0 });
    expect(sim.snapshot().inventory.filter(Boolean)).toHaveLength(1);
    expect(sim.drainEvents().filter(event => event.type === 'stashUpdated')).toHaveLength(2);
  });

  it('refuses remote, invalid indices, locked/favorite and full-capacity moves with zero item loss', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'buyItem', offerId: 'belt' });
    const remote = sim.snapshot();
    sim.command({ type: 'stashDeposit', index: 0 });
    expect(sim.snapshot()).toEqual(remote);
    atStash(sim);
    for (const index of [-1, 24, NaN, Infinity, 0.5, 777]) sim.command({ type: 'stashDeposit', index });
    expect(sim.snapshot().inventory[0]).toEqual(remote.inventory[0]);
    const id = sim.snapshot().inventory[0]!.id;
    sim.command({ type: 'setItemFlag', itemId: id, flag: 'locked', value: true });
    sim.command({ type: 'stashDeposit', index: 0 });
    expect(sim.snapshot().inventory[0]?.id).toBe(id);
    sim.command({ type: 'setItemFlag', itemId: id, flag: 'locked', value: false });
    sim.command({ type: 'setItemFlag', itemId: id, flag: 'favorite', value: true });
    sim.command({ type: 'stashDeposit', index: 0 });
    expect(sim.snapshot().inventory[0]?.id).toBe(id);
    sim.command({ type: 'setItemFlag', itemId: id, flag: 'favorite', value: false });

    const s = sim.snapshot();
    const filled = Array.from({ length: STASH_SIZE }, (_, i) => rollItem(i + 10, 1, new SeededRng(i + 20)));
    expect(sim.restore({ ...s, stash: filled })).toBe(true);
    const before = sim.snapshot();
    sim.command({ type: 'stashDeposit', index: 0 });
    expect(sim.snapshot()).toEqual(before);
  });

  it('keeps all item metadata and IDs through save v11, new world and load', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'buyItem', offerId: 'belt' });
    atStash(sim);
    sim.command({ type: 'stashDeposit', index: 0 });
    const stored = sim.snapshot().stash![0]!;
    const saved = createSaveRecord(sim.character());
    expect(saved?.format).toBe(11);
    expect(saved?.character.stash?.[0]).toEqual(stored);
    expect(JSON.stringify(saved)).not.toMatch(/worldSeed|projectiles|enemyCooldown|player":/);
    const loaded = readSaveRecord(saved);
    expect(loaded?.stash?.[0]).toEqual(stored);
    const next = new GameSimulation();
    expect(next.restoreCharacter(loaded!, 3188)).toBe(true);
    expect(next.snapshot().worldSeed).toBe(3188);
    expect(next.snapshot().stash?.[0]).toEqual(stored);
    atStash(next);
    next.command({ type: 'stashWithdraw', index: 0 });
    expect(next.snapshot().inventory[0]?.id).toBe(stored.id);
    expect(next.snapshot().stash?.[0]).toBeNull();
  });

  it('never reuses a purchased ID when an earlier copy is stored in the stash', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'buyItem', offerId: 'belt' });
    atStash(sim);
    sim.command({ type: 'stashDeposit', index: 0 });
    const first = sim.snapshot().stash?.[0]?.id;
    expect(first).toBe('trade-belt-1');
    sim.command({ type: 'buyItem', offerId: 'belt' });
    expect(sim.snapshot().inventory[0]?.id).toBe('trade-belt-2');
    expect(sim.snapshot().stash?.[0]?.id).toBe(first);
    expect(sim.snapshot().gold).toBe(11);
    expect(createSaveRecord(sim.character())).not.toBeNull();
  });

  it('will not withdraw if the bag is full, even when stash has a valid item', () => {
    const base = new GameSimulation().snapshot();
    const inventory = Array.from({ length: 24 }, (_, i) =>
      rollItem(i + 100, 1, new SeededRng(i + 700)));
    const saved = rollItem(200, 1, new SeededRng(45));
    const state = { inventory, equipment: base.equipment,
      stash: [saved, ...Array(STASH_SIZE - 1).fill(null)] };
    expect(validateStashContents(state)).toBe(true);
    const planned = planStashWithdraw(state, 0);
    expect(planned).toEqual({ ok: false, reason: 'INVENTORY_FULL' });
    expect(state.inventory.every(Boolean)).toBe(true);
    expect(state.stash[0]).toBe(saved);
  });

  it('migrates v9 character data to an empty stash without altering old inventory, quest or gold', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'buyItem', offerId: 'belt' });
    const character = sim.character();
    const { stash: _oldStash, ...legacy } = character;
    const read = readSaveRecord({ format: 9, characterId: 'hero', character: legacy });
    expect(read?.stash).toEqual(Array(STASH_SIZE).fill(null));
    expect(read?.inventory).toEqual(character.inventory);
    expect(read?.equipment).toEqual(character.equipment);
    expect(read?.gold).toBe(character.gold);
    expect(read?.quest).toEqual(character.quest);
    expect(migrateV9Character(legacy)?.stash).toEqual(Array(STASH_SIZE).fill(null));
  });

  it('rejects duplicate IDs across bag and stash, malformed stash and overflow without mutating live data', () => {
    const sim = new GameSimulation();
    sim.command({ type: 'buyItem', offerId: 'belt' });
    const s = sim.snapshot(), item = s.inventory[0]!;
    const forged = { ...s, stash: [item, ...Array(STASH_SIZE - 1).fill(null)] };
    expect(sim.restore(forged)).toBe(false);
    expect(sim.snapshot()).toEqual(s);
    const progress = sim.character();
    const { stash: _missing, ...withoutStash } = progress;
    expect(readSaveRecord({ format: 10, characterId: 'hero', character: withoutStash })).toBeNull();
    expect(createSaveRecord({ ...progress, stash: forged.stash })).toBeNull();
    expect(readSaveRecord({ format: 10, characterId: 'hero',
      character: { ...progress, stash: forged.stash } })).toBeNull();
    const incomplete = [...Array(STASH_SIZE).fill(null)]; incomplete.pop();
    expect(createSaveRecord({ ...progress, stash: incomplete })).toBeNull();
    const state = { inventory: s.inventory, equipment: s.equipment,
      stash: Array(STASH_SIZE).fill(null), flags: s.itemFlags };
    expect(validateStashContents(state)).toBe(true);
    const immutable = Object.freeze({ ...state, inventory: Object.freeze([...s.inventory]),
      stash: Object.freeze([...state.stash]) });
    expect(planStashDeposit(immutable, 0).ok).toBe(true);
    expect(immutable.inventory[0]).toEqual(item);
    expect(immutable.stash[0]).toBeNull();
    expect(planStashWithdraw(immutable, -1)).toEqual({ ok: false, reason: 'INVALID_INDEX' });
  });
});
