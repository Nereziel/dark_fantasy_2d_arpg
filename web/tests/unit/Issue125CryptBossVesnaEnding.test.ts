import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import type { EnemyUnit } from '../../src/game/enemies/enemies';
import { ACT_I_QUEST_CATALOG, createActIQuestLedger } from '../../src/game/quests/actIQuestChain';
import { FIRST_QUEST_ID } from '../../src/game/quests/firstQuest';
import { validateQuestLedger } from '../../src/game/quests/questDialogue';
import { CRYPT_GATE } from '../../src/game/world/generator';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';

/** A validated earlier-quest fixture starts just before the actual crypt
 * portal. All tested transitions are driven by the simulation. Rendering,
 * enemy damage input and travel from the town remain separate E2E work.
 */
function cryptReady(): GameSimulation {
  const game = new GameSimulation(0);
  const initial = game.snapshot();
  const first = { id: FIRST_QUEST_ID, status: 'completed' as const, defeated: 3 };
  const cleared = new Set([
    FIRST_QUEST_ID, 'trail_of_black_ash', 'blighted_pack',
    'forgotten_graves', 'morrow_gravebound', 'seal_of_rot'
  ]);
  const ledger = createActIQuestLedger(first)!;
  const prepared = { quests: ledger.quests.map(entry => {
    if (entry.questId === 'crypt_descent') {
      return { ...entry, status: 'active' as const };
    }
    if (!cleared.has(entry.questId)) return entry;
    const definition = ACT_I_QUEST_CATALOG.quests.find(q => q.id === entry.questId)!;
    return { ...entry, status: 'completed' as const, rewardClaimed: true,
      counters: Object.fromEntries(definition.objectives.map(objective => [
        objective.id, objective.targetCount
      ])), processedEventIds: ['previous_' + entry.questId] };
  }) };
  expect(validateQuestLedger(ACT_I_QUEST_CATALOG, prepared)).toBe(true);
  expect(game.restore({ ...initial, quest: first, questLedger: prepared,
    player: { ...initial.player, ...CRYPT_GATE } })).toBe(true);
  return game;
}

function questStatus(game: GameSimulation, id: string) {
  return game.snapshot().questLedger?.quests.find(quest => quest.questId === id)?.status;
}

function killActive(game: GameSimulation, filter?: (unit: EnemyUnit) => boolean): number {
  const internal = game as unknown as {
    units: EnemyUnit[];
    defeatEnemy: (unit: EnemyUnit) => void;
  };
  const selected = internal.units.filter(unit => unit.actor.alive && (!filter || filter(unit)));
  selected.forEach(unit => internal.defeatEnemy(unit));
  return selected.length;
}

describe('Issue #125 — Hollow King boss and Vesna report handoff', () => {
  it('clears the crypt in two real simulation waves, reports to Vesna and preserves Act II unlock exactly once', () => {
    const game = cryptReady();
    const beforeGate = game.snapshot();
    expect(questStatus(game, 'crypt_descent')).toBe('active');
    expect(questStatus(game, 'crypt_lord_fallen')).not.toBe('active');
    game.command({ type: 'questTurnIn', questId: 'vesnas_report' });
    expect(game.snapshot().gold).toBe(beforeGate.gold);

    game.command({ type: 'usePortal' });
    expect(game.snapshot().zone).toBe('crypt');
    expect(questStatus(game, 'crypt_descent')).toBe('completed');
    expect(questStatus(game, 'crypt_lord_fallen')).toBe('active');
    expect(questStatus(game, 'vesnas_report')).not.toBe('active');

    // The boss is NOT spawned or defeated by entering the crypt: guards must
    // be removed before the authored second stage may begin.
    expect(game.snapshot().dungeonStage).toBe(0);
    expect(killActive(game)).toBe(3);
    expect(questStatus(game, 'crypt_lord_fallen')).toBe('active');
    for (let i = 0; i < 40 && game.snapshot().dungeonStage === 0; i++) {
      game.advance(100);
    }
    const arena = game.snapshot();
    expect(arena.dungeonStage).toBe(1);
    expect(arena.enemies.map(unit => unit.actor.id)).toContain('crypt_lord-4');
    expect(questStatus(game, 'crypt_lord_fallen')).toBe('active');

    // Unit-level defeat uses the same authoritative enemy-death handler as
    // combat; no quest event injection, forged reward or ledger mutation.
    expect(killActive(game, unit => unit.actor.id === 'crypt_lord-4')).toBe(1);
    const defeated = game.snapshot();
    expect(questStatus(game, 'crypt_lord_fallen')).toBe('completed');
    const gemDrop = game.drainEvents().find(event => event.type === 'gemLoot');
    expect(gemDrop?.gemId).toMatch(/^rune\.(ash|ward|focus)\.1$/);
    expect(defeated.gems?.[gemDrop!.gemId]).toBe(1);
    expect(questStatus(game, 'vesnas_report')).toBe('active');
    const bossGold = defeated.gold;
    expect(killActive(game, unit => unit.actor.id === 'crypt_lord-4')).toBe(0);
    expect(game.snapshot().gold).toBe(bossGold);
    game.command({ type: 'questTurnIn', questId: 'vesnas_report' });
    expect(questStatus(game, 'vesnas_report')).toBe('active');
    expect(game.snapshot().actIIUnlocked).toBe(false);

    expect(killActive(game)).toBe(2);
    game.advance(100);
    expect(game.snapshot().dungeonCleared).toBe(true);
    const clearedGold = game.snapshot().gold;
    game.advance(100);
    expect(game.snapshot().gold).toBe(clearedGold);

    // Return through the same playable portal, then talk to Vesna in the
    // camp. Being near her is not itself permission to skip the dialogue.
    game.command({ type: 'usePortal' });
    expect(game.snapshot().zone).toBe('wilderness');
    game.command({ type: 'questTurnIn', questId: 'vesnas_report' });
    expect(questStatus(game, 'vesnas_report')).toBe('active');
    game.command({ type: 'interactNpc', npcId: 'warden_vesna' });
    expect(questStatus(game, 'vesnas_report')).toBe('ready');
    const beforeReport = game.snapshot().gold;
    game.command({ type: 'questTurnIn', questId: 'vesnas_report' });
    const finished = game.snapshot();
    expect(questStatus(game, 'vesnas_report')).toBe('completed');
    expect(finished.actIIUnlocked).toBe(true);
    expect(finished.gold).toBe(beforeReport + 280);
    expect(finished.questLedger?.quests.at(-1)?.rewardClaimed).toBe(true);
    game.command({ type: 'questTurnIn', questId: 'vesnas_report' });
    game.command({ type: 'interactNpc', npcId: 'warden_vesna' });
    expect(game.snapshot().gold).toBe(finished.gold);

    const saved = createSaveRecord(game.character());
    expect(saved?.format).toBe(11);
    const loaded = new GameSimulation(42);
    expect(loaded.restoreCharacter(readSaveRecord(saved)!, 0)).toBe(true);
    expect(loaded.snapshot().actIIUnlocked).toBe(true);
    expect(loaded.snapshot().gems?.[gemDrop!.gemId]).toBe(1);
    expect(questStatus(loaded, 'crypt_lord_fallen')).toBe('completed');
    expect(questStatus(loaded, 'vesnas_report')).toBe('completed');
    expect(loaded.snapshot().gold).toBe(finished.gold);
  });
});
