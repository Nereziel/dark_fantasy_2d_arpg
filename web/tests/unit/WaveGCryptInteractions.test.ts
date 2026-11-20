import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createWorldRecord, readWorldRecord } from '../../src/persistence/WorldProgressRepository';
import { buildCryptWorld } from '../../src/game/world/dungeonRuntime';

function enterCrypt(sim: GameSimulation): void {
  sim.command({ type: 'usePortal' });
  for (let i = 0; i < 240 && sim.snapshot().zone !== 'crypt'; i++) sim.advance(16.667);
  expect(sim.snapshot().zone).toBe('crypt');
}

describe('Wave G crypt interactable and trap integration', () => {
  it('uses authoritative reachable click targets and commits one chest reward', () => {
    const sim = new GameSimulation(42);
    enterCrypt(sim);
    const chest = sim.cryptInteractables().find(value => value.capability === 'lootContainer');
    expect(chest).toBeDefined();
    const before = sim.snapshot();
    expect(sim.restore({
      ...before,
      player: { ...before.player, x: chest!.position.x, y: chest!.position.y }
    })).toBe(true);
    const gold = sim.snapshot().gold;
    sim.command({ type: 'interactCrypt', id: chest!.id });
    expect(sim.snapshot().gold).toBeGreaterThan(gold);
    expect(sim.cryptInteractables().some(prop => prop.id === chest!.id)).toBe(false);
    expect(sim.drainEvents().filter(e => e.type === 'cryptInteract' && e.id === chest!.id))
      .toHaveLength(1);
    sim.command({ type: 'interactCrypt', id: chest!.id });
    expect(sim.snapshot().gold).toBeGreaterThan(gold);
    expect(sim.drainEvents().filter(e => e.type === 'cryptInteract')).toHaveLength(0);
    const world = sim.worldProgress()!;
    expect(world.cryptUsedPropIds).toContain(chest!.id);
    const restored = new GameSimulation(42);
    expect(restored.restoreWorldProgress(readWorldRecord(createWorldRecord(world))!)).toBe(true);
    enterCrypt(restored);
    expect(restored.cryptInteractables().some(prop => prop.id === chest!.id)).toBe(false);
    expect(restored.character().quest).toEqual(sim.character().quest);
    expect(JSON.stringify(restored.character())).not.toContain('cryptUsedPropIds');
  });

  it('telegraphs a one-shot trap and allows escape before impact', () => {
    const sim = new GameSimulation(1);
    enterCrypt(sim);
    const trap = buildCryptWorld(1).theme.traps[0]!;
    expect(trap).toBeDefined();
    const snap = sim.snapshot();
    expect(sim.restore({
      ...snap,
      player: { ...snap.player, x: trap.trigger.center.x, y: trap.trigger.center.y }
    })).toBe(true);
    sim.advance(16.667);
    expect(sim.drainEvents().filter(e => e.type === 'cryptTrapWindup' && e.id === trap.id))
      .toHaveLength(1);
    // A deliberate dodge/retreat while the warning is active avoids the attack.
    const snapshot = sim.snapshot();
    const escaped = { x: snapshot.player.x + 80, y: snapshot.player.y };
    // A clear retreat must not require modifying or disabling collision rules.
    const safe = buildCryptWorld(1).layout;
    const occupied = safe.obstacles.some(o => escaped.x + 18 > o.x && escaped.x - 18 < o.x + o.width
      && escaped.y + 18 > o.y && escaped.y - 18 < o.y + o.height);
    if (!occupied) {
      sim.command({ type: 'move', destination: escaped });
      for (let i = 0; i < 90; i++) sim.advance(16.667);
    } else {
      for (let i = 0; i < 90; i++) sim.advance(16.667);
    }
    const traps = sim.snapshot().cryptTriggeredTrapIds ?? [];
    expect(traps).toContain(trap.id);
    const world = sim.worldProgress()!;
    expect(world.cryptTriggeredTrapIds).toContain(trap.id);
    expect(sim.drainEvents().filter(e => e.type === 'cryptTrapWindup' && e.id === trap.id))
      .toHaveLength(0);
  });

  it('rejects forged crypt facts in world records and simulation snapshots', () => {
    const sim = new GameSimulation(42);
    enterCrypt(sim);
    const before = sim.snapshot();
    expect(sim.restore({ ...before, cryptUsedPropIds: ['forged/chest'] })).toBe(false);
    expect(sim.snapshot()).toEqual(before);
    const world = sim.worldProgress()!;
    expect(readWorldRecord({ format: 1, characterId: 'hero', progress: {
      ...world, cryptUsedPropIds: ['x', 'x']
    } })).toBeNull();
    expect(new GameSimulation(42).restoreWorldProgress({
      ...world, cryptUsedPropIds: ['crypt/fake']
    })).toBe(false);
  });
});
