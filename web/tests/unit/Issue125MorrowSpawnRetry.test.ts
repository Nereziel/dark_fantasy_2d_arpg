import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { ACT_I_QUEST_CATALOG, createActIQuestLedger } from '../../src/game/quests/actIQuestChain';
import { FIRST_QUEST_ID } from '../../src/game/quests/firstQuest';
import { validateQuestLedger } from '../../src/game/quests/questDialogue';
import { createMiniBossState, getMiniBossDefinition } from '../../src/game/enemies/miniBossRules';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
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
