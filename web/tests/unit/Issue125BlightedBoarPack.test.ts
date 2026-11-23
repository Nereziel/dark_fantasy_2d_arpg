import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { ACT_I_QUEST_CATALOG, createActIQuestLedger } from '../../src/game/quests/actIQuestChain';
import { validateQuestLedger } from '../../src/game/quests/questDialogue';
import { FIRST_QUEST_ID } from '../../src/game/quests/firstQuest';
import { createBlightedPack, createPack } from '../../src/game/enemies/enemies';
import { generateWorld } from '../../src/game/world/generator';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { createMiniBossState, getMiniBossDefinition } from '../../src/game/enemies/miniBossRules';

function huntingSimulation() {
  const game = new GameSimulation(0);
  const current = game.snapshot();
  const starter = { id: FIRST_QUEST_ID, status: 'completed' as const, defeated: 3 };
  const original = createActIQuestLedger(starter)!;
  const questLedger = { quests: original.quests.map(entry => {
    if (entry.questId === 'trail_of_black_ash') return {
      ...entry, status: 'completed' as const, counters: { traced: 1 },
      processedEventIds: ['feature_act1_corruption_site'], rewardClaimed: true
    };
    if (entry.questId === 'blighted_pack') return { ...entry, status: 'active' as const };
    return entry;
  }) };
  expect(validateQuestLedger(ACT_I_QUEST_CATALOG, questLedger)).toBe(true);
  const spent = current.enemies.map(unit => ({
    ...unit, actor: { ...unit.actor, health: 0, alive: false }, intent: null
  }));
  expect(game.restore({
    ...current, quest: starter, questLedger,
    enemies: spent, selectedTargetId: null, respawnTimer: 0
  })).toBe(true);
  return game;
}

describe('Issue #125 — one coherent corrupted boar quest pack', () => {
  it('uses canonical reachable spawn points, stable IDs and normal HP scaling', () => {
    for (const seed of [0, 42, 901]) {
      const positions = generateWorld(seed).encounterPositions;
      const wolvesAndMages = createPack(3, 4, positions);
      const boars = createBlightedPack(3, 4, positions);
      expect(wolvesAndMages.map(unit => unit.actor.type))
        .toEqual(['spider', 'corruptedBoar', 'skeletonMage']);
      expect(boars).toHaveLength(3);
      expect(boars.map(unit => unit.actor.type))
        .toEqual(['corruptedBoar', 'corruptedBoar', 'corruptedBoar']);
      expect(new Set(boars.map(unit => unit.actor.id)).size).toBe(3);
      expect(boars.map(unit => [unit.actor.x, unit.actor.y]))
        .toEqual(wolvesAndMages.map(unit => [unit.actor.x, unit.actor.y]));
      expect(boars.every(unit => unit.actor.alive
        && unit.actor.health === unit.actor.maxHealth && unit.actor.health > 0))
        .toBe(true);
      expect(createBlightedPack(3, 4, positions)).toEqual(boars);
    }
  });

  it('spawns the mandatory hunt with a living optional boss still in the world', () => {
    const game = huntingSimulation();
    const initial = game.snapshot();
    const marker = buildWilderness(0).features.find(feature =>
      feature.id === 'wild.encounter.1')!;
    const def = getMiniBossDefinition('bandit_captain')!;
    const boss = {
      actor: {
        id: 'bandit_captain', type: def.enemyType, ...marker.position,
        health: def.baseHealth, maxHealth: def.baseHealth, alive: true
      },
      cooldown: 0.9, intent: null, effects: [], abilityCooldowns: {}
    };
    const miniBossState = createMiniBossState('bandit_captain', 'bandit_captain')!;
    expect(game.restore({
      ...initial,
      player: { ...initial.player, ...marker.position },
      enemies: [...initial.enemies, boss],
      selectedTargetId: 'bandit_captain',
      miniBossStates: { bandit_captain: miniBossState }
    })).toBe(true);
    const gold = game.snapshot().gold;

    game.advance(100);
    const hunt = game.snapshot();
    expect(hunt.wave).toBe(3);
    expect(hunt.enemies.slice(0, 3).map(unit => unit.actor.type))
      .toEqual(['corruptedBoar', 'corruptedBoar', 'corruptedBoar']);
    expect(hunt.enemies.find(unit => unit.actor.id === 'bandit_captain')?.actor.alive)
      .toBe(true);
    expect(hunt.miniBossStates?.bandit_captain).toBeDefined();
    expect(hunt.miniBossDefeatedIds).not.toContain('bandit_captain');
    expect(hunt.selectedTargetId).toBe('bandit_captain');
    expect(hunt.gold).toBe(gold);
    expect(game.restore(hunt)).toBe(true);

    // The mandatory pack may not be replaced every tick while its boars live.
    game.advance(100);
    expect(game.snapshot().enemies.map(unit => unit.actor.id))
      .toEqual(hunt.enemies.map(unit => unit.actor.id));
  });

  it('spawns three actual boars when the hunt is active, without breaking snapshot validation', () => {
    const game = huntingSimulation();
    game.advance(100);
    const hunt = game.snapshot();
    expect(hunt.wave).toBe(3);
    expect(hunt.enemies.slice(0, 3).map(unit => unit.actor.type))
      .toEqual(['corruptedBoar', 'corruptedBoar', 'corruptedBoar']);
    expect(game.restore(hunt)).toBe(true);

    // A single forged boar in a normal mixed pack is never a valid snapshot.
    const forged = { ...hunt, enemies: hunt.enemies.map((unit, index) =>
      index === 1 ? { ...unit, actor: { ...unit.actor, type: 'skeleton' as const,
        id: 'skeleton-' + (hunt.wave * 3 + index + 1) } } : unit) };
    expect(game.restore(forged)).toBe(false);
    expect(game.snapshot().enemies.slice(0, 3).map(unit => unit.actor.type))
      .toEqual(['corruptedBoar', 'corruptedBoar', 'corruptedBoar']);

    // Invalid untrusted quest ledgers must be rejected, never throw during the
    // extra story-wave validation before the canonical restore checks run.
    const malformed = { ...hunt, questLedger: { quests: { invalid: true } } } as unknown as typeof hunt;
    expect(() => game.restore(malformed)).not.toThrow();
    expect(game.restore(malformed)).toBe(false);

    // Ordinary non-quest waves continue to use the existing enemy roster.
    expect(createPack(3, game.snapshot().level)
      .map(unit => unit.actor.type)).toEqual(['spider', 'corruptedBoar', 'skeletonMage']);
  });
});
