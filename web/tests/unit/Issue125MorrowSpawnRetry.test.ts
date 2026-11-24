import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { ACT_I_QUEST_CATALOG, createActIQuestLedger } from '../../src/game/quests/actIQuestChain';
import { FIRST_QUEST_ID } from '../../src/game/quests/firstQuest';
import { validateQuestLedger } from '../../src/game/quests/questDialogue';
import { createMiniBossState, getMiniBossDefinition } from '../../src/game/enemies/miniBossRules';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { planWorldEvents } from '../../src/game/world/worldEvents';
import type { EnemyUnit } from '../../src/game/enemies/enemies';

function morrowHunt() {
  const game = new GameSimulation(0);
  const start = game.snapshot();
  const starter = { id: FIRST_QUEST_ID, status: 'completed' as const, defeated: 3 };
  const ledger = createActIQuestLedger(starter)!;
  const completed = new Set([
    FIRST_QUEST_ID, 'trail_of_black_ash', 'blighted_pack', 'forgotten_graves'
  ]);
  const prepared = { quests: ledger.quests.map(entry => {
    if (entry.questId === 'morrow_gravebound') return { ...entry, status: 'active' as const };
    if (!completed.has(entry.questId)) return entry;
    const definition = ACT_I_QUEST_CATALOG.quests.find(q => q.id === entry.questId)!;
    return { ...entry, status: 'completed' as const, rewardClaimed: true,
      counters: Object.fromEntries(definition.objectives.map(o => [o.id, o.targetCount])),
      processedEventIds: ['completed_' + entry.questId] };
  }) };
  expect(validateQuestLedger(ACT_I_QUEST_CATALOG, prepared)).toBe(true);
  expect(game.restore({ ...start, quest: starter, questLedger: prepared })).toBe(true);
  return game;
}

function optionalBoss(id: 'bandit_captain' | 'brood_mother',
  point: { x: number; y: number }, alive: boolean): EnemyUnit {
  const def = getMiniBossDefinition(id)!;
  return {
    actor: { id, type: def.enemyType, ...point,
      maxHealth: def.baseHealth, health: alive ? def.baseHealth : 0, alive },
    cooldown: 0.7, intent: null, effects: [], abilityCooldowns: {}
  };
}

describe('Issue #125 — recoverable Morrow spawn on graveyard progression', () => {
  it('spawns missing Morrow on an ordinary tick after reloading an active quest', () => {
    const game = morrowHunt();
    expect(game.snapshot().enemies.some(unit => unit.actor.id === 'morrow_gravebound')).toBe(false);
    const before = game.snapshot().gold;
    game.advance(16.667);
    const after = game.snapshot();
    expect(after.enemies.filter(unit => unit.actor.id === 'morrow_gravebound')).toHaveLength(1);
    expect(after.miniBossStates?.morrow_gravebound).toBeDefined();
    expect(after.gold).toBe(before);
    game.advance(16.667);
    expect(game.snapshot().enemies.filter(unit => unit.actor.id === 'morrow_gravebound')).toHaveLength(1);
    expect(game.restore(game.snapshot())).toBe(true);
  });

  it('gives the required Morrow spawn precedence over a full living optional miniboss roster', () => {
    const game = morrowHunt();
    const initial = game.snapshot();
    const pos = buildWilderness(0).features.find(f => f.id === 'wild.encounter.1')!.position;
    const first = optionalBoss('bandit_captain', pos, true);
    const second = optionalBoss('brood_mother', pos, true);
    expect(game.restore({
      ...initial,
      player: { ...initial.player, ...pos },
      enemies: [...initial.enemies, first, second],
      miniBossStates: {
        bandit_captain: createMiniBossState('bandit_captain', 'bandit_captain')!,
        brood_mother: createMiniBossState('brood_mother', 'brood_mother')!
      }
    })).toBe(true);
    const gold = game.snapshot().gold;
    game.advance(16.667);
    const after = game.snapshot();
    // The fixed five-enemy pack and exactly one optional must survive. A
    // temporary optional encounter may be streamed out, never marked slain.
    expect(after.enemies).toHaveLength(initial.enemies.length + 2);
    expect(after.enemies.filter(unit => unit.actor.id === 'morrow_gravebound')).toHaveLength(1);
    expect(after.enemies.slice(0, initial.enemies.length).map(unit => unit.actor.id))
      .toEqual(initial.enemies.map(unit => unit.actor.id));
    expect(after.enemies.filter(unit => unit.actor.id === 'bandit_captain'
      || unit.actor.id === 'brood_mother')).toHaveLength(1);
    expect(after.miniBossDefeatedIds).not.toContain('bandit_captain');
    expect(after.miniBossDefeatedIds).not.toContain('brood_mother');
    expect(after.gold).toBe(gold);
    expect(game.restore(after)).toBe(true);
    game.advance(16.667);
    expect(game.snapshot().enemies.filter(unit => unit.actor.id === 'morrow_gravebound'))
      .toHaveLength(1);
  });

  it('spawns Morrow while both optional world-event guards are still alive', () => {
    const game = morrowHunt();
    const world = buildWilderness(0);
    const plan = planWorldEvents(0, world.layout, world.features)[0]!;
    const eventGame = new GameSimulation(0);
    const start = eventGame.snapshot();
    expect(eventGame.restore({ ...start, player: { ...start.player, ...plan.position } }))
      .toBe(true);
    eventGame.advance(150);
    const eventSnapshot = eventGame.snapshot();
    expect(eventSnapshot.worldEvents).toContainEqual(
      expect.objectContaining({ id: plan.id, status: 'active', remaining: 2 }));
    const hunt = game.snapshot();
    expect(game.restore({ ...eventSnapshot, quest: hunt.quest, questLedger: hunt.questLedger }))
      .toBe(true);
    const internal = game as unknown as { units: EnemyUnit[]; defeatEnemy(unit: EnemyUnit): void };
    const before = game.snapshot();
    game.advance(16.667);
    const after = game.snapshot();

    expect(after.enemies.filter(unit => unit.actor.id === 'morrow_gravebound')).toHaveLength(1);
    expect(after.enemies.slice(0, before.enemies.length).map(unit => unit.actor.id))
      .toEqual(before.enemies.map(unit => unit.actor.id));
    expect(after.gold).toBe(before.gold);
    expect(after.worldEvents).toEqual(before.worldEvents);
    expect(game.restore(after)).toBe(true);

    for (const guard of internal.units.filter(unit => unit.actor.id.startsWith('world-event.'))) {
      internal.defeatEnemy(guard);
    }
    expect(game.worldProgress()?.worldFacts.entries).toContainEqual(expect.objectContaining({
      kind: 'eventCompleted', entityId: plan.id
    }));
    expect(game.snapshot().enemies.some(unit => unit.actor.id === 'morrow_gravebound')).toBe(true);
    expect(game.restore(game.snapshot())).toBe(true);
  });

  it('reclaims only a dead optional miniboss slot, retaining the living encounter and the story boss', () => {
    const game = morrowHunt();
    const before = game.snapshot();
    const marker = buildWilderness(0).features.find(f => f.id === 'wild.encounter.1')!;
    const pos = marker.position;
    const first = optionalBoss('bandit_captain', pos, false);
    const second = optionalBoss('brood_mother', pos, true);
    const miniBossStates = {
      bandit_captain: createMiniBossState('bandit_captain', 'bandit_captain')!,
      brood_mother: createMiniBossState('brood_mother', 'brood_mother')!
    };
    expect(game.restore({
      ...before,
      player: { ...before.player, ...pos },
      enemies: [...before.enemies, first, second],
      miniBossStates
    })).toBe(true);
    game.advance(16.667);
    const after = game.snapshot();
    expect(after.enemies).toHaveLength(5);
    expect(after.enemies.some(unit => unit.actor.id === 'bandit_captain')).toBe(false);
    expect(after.enemies.some(unit => unit.actor.id === 'brood_mother' && unit.actor.alive))
      .toBe(true);
    expect(after.enemies.filter(unit => unit.actor.id === 'morrow_gravebound')).toHaveLength(1);
    expect(after.miniBossStates?.bandit_captain).toBeUndefined();
    expect(after.miniBossStates?.morrow_gravebound).toBeDefined();
    expect(game.restore(after)).toBe(true);
    expect(game.snapshot().questLedger?.quests.find(q => q.questId === 'morrow_gravebound')
      ?.status).toBe('active');
  });
});
