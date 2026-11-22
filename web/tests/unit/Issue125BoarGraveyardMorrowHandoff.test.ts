import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import type { EnemyUnit } from '../../src/game/enemies/enemies';
import { ACT_I_QUEST_CATALOG, createActIQuestLedger } from '../../src/game/quests/actIQuestChain';
import { FIRST_QUEST_ID } from '../../src/game/quests/firstQuest';
import { validateQuestLedger } from '../../src/game/quests/questDialogue';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';

function activeBlightedHunt(): GameSimulation {
  const game = new GameSimulation(0);
  const initial = game.snapshot();
  const first = { id: FIRST_QUEST_ID, status: 'completed' as const, defeated: 3 };
  const questLedger = { quests: createActIQuestLedger(first)!.quests.map(entry => {
    if (entry.questId === 'trail_of_black_ash') return {
      ...entry, status: 'completed' as const, rewardClaimed: true,
      counters: { traced: 1 }, processedEventIds: ['feature_act1_corruption_site']
    };
    if (entry.questId === 'blighted_pack') return {
      ...entry, status: 'active' as const
    };
    return entry;
  }) };
  expect(validateQuestLedger(ACT_I_QUEST_CATALOG, questLedger)).toBe(true);
  // Earlier combat is a valid test fixture, not a user-visible cheat bridge.
  const cleared = initial.enemies.map(unit => ({
    ...unit, actor: { ...unit.actor, health: 0, alive: false }, intent: null
  }));
  expect(game.restore({ ...initial, quest: first, questLedger,
    enemies: cleared, respawnTimer: 0, selectedTargetId: null })).toBe(true);
  return game;
}

function questStatus(game: GameSimulation, id: string) {
  return game.snapshot().questLedger?.quests.find(entry => entry.questId === id)?.status;
}

describe('Issue #125 — Blighted Pack → graveyard → Morrow handoff', () => {
  it('counts only actual boar deaths, grants one reward and opens the next reachable landmark', () => {
    const game = activeBlightedHunt();
    game.advance(100);
    const spawned = game.snapshot();
    expect(spawned.wave).toBe(3);
    expect(spawned.enemies.map(unit => unit.actor.type))
      .toEqual(['corruptedBoar', 'corruptedBoar', 'corruptedBoar']);
    expect(questStatus(game, 'blighted_pack')).toBe('active');
    expect(questStatus(game, 'forgotten_graves')).not.toBe('active');
    expect(game.restore(spawned)).toBe(true);

    const internal = game as unknown as {
      units: EnemyUnit[];
      defeatEnemy(unit: EnemyUnit): void;
    };
    for (let index = 0; index < 2; index++) {
      internal.defeatEnemy(internal.units[index]!);
      expect(questStatus(game, 'blighted_pack')).toBe('active');
      expect(questStatus(game, 'forgotten_graves')).not.toBe('active');
    }
    const beforeThird = game.snapshot();
    const third = internal.units[2]!;
    internal.defeatEnemy(third);
    const afterThird = game.snapshot();
    expect(questStatus(game, 'blighted_pack')).toBe('completed');
    expect(questStatus(game, 'forgotten_graves')).toBe('active');
    expect(afterThird.questLedger?.quests.find(q => q.questId === 'blighted_pack')
      ?.rewardClaimed).toBe(true);
    expect(afterThird.gold - beforeThird.gold).toBe(12 + beforeThird.level * 3 + 80);
    internal.defeatEnemy(third);
    expect(game.snapshot().gold).toBe(afterThird.gold);
    expect(game.snapshot().questLedger).toEqual(afterThird.questLedger);

    const marker = buildWilderness(0).features.find(f =>
      f.id === 'act1.abandoned_graveyard')!;
    // The quest discovery event remains proximity-gated and simulation-owned.
    const beforeArrival = game.snapshot();
    expect(game.restore({ ...beforeArrival,
      player: { ...beforeArrival.player, ...marker.position } })).toBe(true);
    expect(questStatus(game, 'forgotten_graves')).toBe('active');
    game.advance(50);
    const atGraves = game.snapshot();
    expect(questStatus(game, 'forgotten_graves')).toBe('completed');
    expect(questStatus(game, 'morrow_gravebound')).toBe('active');
    expect(atGraves.gold).toBe(beforeArrival.gold + 65);
    expect(atGraves.enemies.filter(e => e.actor.id === 'morrow_gravebound')).toHaveLength(1);
    expect(atGraves.miniBossStates?.morrow_gravebound).toBeDefined();
    game.advance(100);
    expect(questStatus(game, 'morrow_gravebound')).toBe('active');
    expect(game.snapshot().gold).toBe(atGraves.gold);
    expect(game.snapshot().enemies.filter(e => e.actor.id === 'morrow_gravebound')).toHaveLength(1);
    expect(game.restore(game.snapshot())).toBe(true);
  });
});
