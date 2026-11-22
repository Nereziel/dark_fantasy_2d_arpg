import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import type { EnemyUnit } from '../../src/game/enemies/enemies';
import { ACT_I_QUEST_CATALOG, createActIQuestLedger } from '../../src/game/quests/actIQuestChain';
import { FIRST_QUEST_ID } from '../../src/game/quests/firstQuest';
import { validateQuestLedger } from '../../src/game/quests/questDialogue';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { CRYPT_GATE } from '../../src/game/world/generator';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';

/** Earlier story beats are a validated fixture; transitions under test are
 * driven by the real simulated boss death, evidence command and gate action.
 * The separate Playwright test covers an unmodified new hero from the menu.
 */
function gameWithActiveMorrow(): GameSimulation {
  const game = new GameSimulation(0);
  const snapshot = game.snapshot();
  const first = { id: FIRST_QUEST_ID, status: 'completed' as const, defeated: 3 };
  const completed = new Set([
    FIRST_QUEST_ID, 'trail_of_black_ash', 'blighted_pack', 'forgotten_graves'
  ]);
  const initial = createActIQuestLedger(first)!;
  const questLedger = { quests: initial.quests.map(entry => {
    if (entry.questId === 'morrow_gravebound')
      return { ...entry, status: 'active' as const };
    if (!completed.has(entry.questId)) return entry;
    const quest = ACT_I_QUEST_CATALOG.quests.find(def => def.id === entry.questId)!;
    return { ...entry, status: 'completed' as const,
      counters: Object.fromEntries(quest.objectives.map(obj => [obj.id, obj.targetCount])),
      rewardClaimed: true, processedEventIds: ['completed_' + entry.questId] };
  }) };
  expect(validateQuestLedger(ACT_I_QUEST_CATALOG, questLedger)).toBe(true);
  expect(game.restore({ ...snapshot, quest: first, questLedger })).toBe(true);
  return game;
}

function questStatus(game: GameSimulation, questId: string) {
  return game.snapshot().questLedger?.quests.find(entry => entry.questId === questId)?.status;
}

function relocateFixture(game: GameSimulation, position: { x: number; y: number }): void {
  const previous = game.snapshot();
  expect(game.restore({ ...previous, player: { ...previous.player, ...position } })).toBe(true);
}

describe('Issue #125 — Morrow, evidence and crypt story handoff', () => {
  it('requires a boss defeat, deliberate evidence inspection and real gate action, then saves progression', () => {
    const game = gameWithActiveMorrow();
    const startGold = game.snapshot().gold;
    expect(questStatus(game, 'morrow_gravebound')).toBe('active');

    // Tick the ordinary simulation to spawn the unique story boss. A unit
    // test resolves its defeat through the existing damage/death handler.
    game.advance(100);
    const boss = (game as unknown as { units: EnemyUnit[] }).units
      .find(unit => unit.actor.id === 'morrow_gravebound');
    expect(boss?.actor.alive).toBe(true);
    (game as unknown as { defeatEnemy(unit: EnemyUnit): void }).defeatEnemy(boss!);
    expect(questStatus(game, 'morrow_gravebound')).toBe('completed');
    expect(questStatus(game, 'seal_of_rot')).toBe('active');
    const afterBoss = game.snapshot();
    expect(afterBoss.gold).toBeGreaterThan(startGold);
    expect(afterBoss.miniBossDefeatedIds).toContain('morrow_gravebound');

    const evidence = buildWilderness(0).features.find(feature =>
      feature.id === 'act1.evidence_lead')!;
    relocateFixture(game, evidence.position);
    game.advance(50);
    const atEvidence = game.snapshot();
    expect(questStatus(game, 'seal_of_rot')).toBe('active');
    expect(atEvidence.canInspectStoryEvidence).toBe(true);
    expect(questStatus(game, 'crypt_descent')).not.toBe('active');

    game.command({ type: 'inspectStoryEvidence' });
    const inspected = game.snapshot();
    expect(questStatus(game, 'seal_of_rot')).toBe('completed');
    expect(questStatus(game, 'crypt_descent')).toBe('active');
    expect(inspected.gold).toBe(atEvidence.gold + 75);
    expect(inspected.canInspectStoryEvidence).toBe(false);
    game.command({ type: 'inspectStoryEvidence' });
    expect(game.snapshot().gold).toBe(inspected.gold);

    // Put the test fixture at the canonical reachable portal; the portal
    // transition itself must use the public interaction command.
    relocateFixture(game, CRYPT_GATE);
    const beforeGate = game.snapshot();
    expect(beforeGate.zone).toBe('wilderness');
    game.command({ type: 'usePortal' });
    const insideCrypt = game.snapshot();
    expect(insideCrypt.zone).toBe('crypt');
    expect(questStatus(game, 'crypt_descent')).toBe('completed');
    expect(questStatus(game, 'crypt_lord_fallen')).toBe('active');
    expect(insideCrypt.gold).toBe(beforeGate.gold + 110);
    expect(insideCrypt.questLedger?.quests.find(q => q.questId === 'crypt_descent')
      ?.rewardClaimed).toBe(true);

    // The v11 character save intentionally stores only campaign progression:
    // the dungeon/session restarts on load, but claimed milestone rewards,
    // story order and equipment/gold persist.
    const record = createSaveRecord(game.character())!;
    expect(record.format).toBe(11);
    const loaded = new GameSimulation(42);
    expect(loaded.restoreCharacter(readSaveRecord(record)!, 0)).toBe(true);
    expect(loaded.snapshot().zone).toBe('wilderness');
    expect(questStatus(loaded, 'crypt_descent')).toBe('completed');
    expect(questStatus(loaded, 'crypt_lord_fallen')).toBe('active');
    expect(loaded.snapshot().gold).toBe(insideCrypt.gold);
    expect(loaded.snapshot().questLedger?.quests.find(q => q.questId === 'seal_of_rot')
      ?.rewardClaimed).toBe(true);
  });
});
