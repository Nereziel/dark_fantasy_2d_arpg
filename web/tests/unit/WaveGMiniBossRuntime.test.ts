import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { MINI_BOSS_IDS, getMiniBossDefinition } from '../../src/game/enemies/miniBossRules';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { createWorldRecord, readWorldRecord } from '../../src/persistence/WorldProgressRepository';

function visitOptionalBoss(seed: number, featureId: string): GameSimulation {
  const sim = new GameSimulation(seed);
  const marker = buildWilderness(seed).features.find(feature => feature.id === featureId)!;
  expect(marker).toBeDefined();
  const start = sim.snapshot();
  expect(sim.restore({ ...start, player: {
    ...start.player, x: marker.position.x, y: marker.position.y
  } })).toBe(true);
  for (let i = 0; i < 5; i++) sim.advance(16.667);
  return sim;
}

describe('Wave G authoritative mini boss integration', () => {
  it.each([
    ['wild.encounter.1', 'bandit_captain'],
    ['wild.encounter.2', 'brood_mother'],
    ['wild.poi.1', 'corrupted_knight']
  ])('spawns a unique typed mini boss at seeded %s', (feature, id) => {
    const sim = visitOptionalBoss(42, feature);
    expect(sim.snapshot().enemies.some(unit => unit.actor.id === id && unit.actor.alive)).toBe(true);
    expect(sim.snapshot().miniBossStates?.[id]?.bossId).toBe(id);
    expect(sim.snapshot().enemies.find(unit => unit.actor.id === id)?.actor.maxHealth)
      .toBeGreaterThan(240);
    expect(sim.restore(structuredClone(sim.snapshot()))).toBe(true);
  });

  it('produces readable telegraph/impact and changing phase from combat ticks', () => {
    const sim = visitOptionalBoss(42, 'wild.encounter.1');
    const messages = sim.drainEvents();
    for (let i = 0; i < 140; i++) {
      sim.advance(16.667);
      messages.push(...sim.drainEvents());
    }
    expect(messages.some(event => event.type === 'miniBossCue'
      && event.bossId === 'bandit_captain' && event.kind === 'intro')).toBe(true);
    expect(messages.some(event => event.type === 'miniBossCue'
      && event.bossId === 'bandit_captain' && event.kind === 'telegraph')).toBe(true);
    expect(messages.some(event => event.type === 'miniBossCue'
      && event.bossId === 'bandit_captain' && event.kind === 'impact')).toBe(true);
  });

  it('commits a unique boss kill and guaranteed reward without gold or loot replay', () => {
    const sim = visitOptionalBoss(0, 'wild.encounter.1');
    const before = sim.snapshot();
    const unit = before.enemies.find(enemy => enemy.actor.id === 'bandit_captain')!;
    const weakened = {
      ...before,
      enemies: before.enemies.map(enemy => enemy.actor.id === 'bandit_captain'
        ? { ...enemy, actor: { ...enemy.actor, health: 1 }, cooldown: 6, intent: null }
        : { ...enemy, cooldown: 6, intent: null })
    };
    expect(sim.restore(weakened)).toBe(true);
    const gold = sim.snapshot().gold;
    sim.command({ type: 'attack', targetId: unit.actor.id });
    for (let i = 0; i < 140 && sim.snapshot().enemies.find(enemy =>
      enemy.actor.id === unit.actor.id)?.actor.alive; i++) sim.advance(16.667);
    const dead = sim.snapshot();
    expect(dead.enemies.find(enemy => enemy.actor.id === unit.actor.id)?.actor.alive).toBe(false);
    expect(dead.miniBossDefeatedIds).toContain('bandit_captain');
    expect(dead.gold).toBeGreaterThan(gold + 45);
    const afterGold = dead.gold;
    for (let i = 0; i < 70; i++) sim.advance(16.667);
    expect(sim.snapshot().gold).toBe(afterGold);
    const world = sim.worldProgress()!;
    expect(world.miniBossDefeatedIds).toContain('bandit_captain');
    expect(readWorldRecord(createWorldRecord(world))?.miniBossDefeatedIds)
      .toContain('bandit_captain');
    const resumed = new GameSimulation(0);
    expect(resumed.restoreWorldProgress(world)).toBe(true);
    expect(resumed.worldProgress()?.miniBossDefeatedIds).toContain('bandit_captain');
  });

  it('rejects forged reward facts and incompatible mini boss snapshot states', () => {
    const sim = visitOptionalBoss(42, 'wild.encounter.1');
    const before = sim.snapshot();
    expect(sim.restore({ ...before, miniBossStates: {
      ...before.miniBossStates, fake: before.miniBossStates!.bandit_captain!
    } })).toBe(false);
    expect(sim.snapshot()).toEqual(before);
    const record = createWorldRecord(sim.worldProgress()!)!;
    expect(readWorldRecord({ ...record, progress: { ...record.progress,
      miniBossDefeatedIds: ['bandit_captain', 'bandit_captain']
    } })).toBeNull();
    expect(MINI_BOSS_IDS).toContain('morrow_gravebound');
    expect(getMiniBossDefinition('morrow_gravebound')?.questEventId)
      .toBe('morrow_gravebound_slain');
  });
});
