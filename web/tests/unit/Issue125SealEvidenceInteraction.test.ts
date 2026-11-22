import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { ACT_I_QUEST_CATALOG, createActIQuestLedger } from '../../src/game/quests/actIQuestChain';
import { FIRST_QUEST_ID } from '../../src/game/quests/firstQuest';
import { validateQuestLedger } from '../../src/game/quests/questDialogue';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';

function gameAtEvidence() {
  const game = new GameSimulation(0);
  const original = game.snapshot();
  const starter = { id: FIRST_QUEST_ID, status: 'completed' as const, defeated: 3 };
  const ledger = createActIQuestLedger(starter)!;
  const cleared = new Set([
    FIRST_QUEST_ID, 'trail_of_black_ash', 'blighted_pack',
    'forgotten_graves', 'morrow_gravebound'
  ]);
  const prepared = { quests: ledger.quests.map(entry => {
    if (entry.questId === 'seal_of_rot') return { ...entry, status: 'active' as const };
    if (!cleared.has(entry.questId)) return entry;
    const quest = ACT_I_QUEST_CATALOG.quests.find(q => q.id === entry.questId)!;
    return { ...entry, status: 'completed' as const, rewardClaimed: true,
      counters: Object.fromEntries(quest.objectives.map(objective => [
        objective.id, objective.targetCount
      ])), processedEventIds: ['fixture_' + entry.questId] };
  }) };
  expect(validateQuestLedger(ACT_I_QUEST_CATALOG, prepared)).toBe(true);
  expect(game.restore({ ...original, quest: starter, questLedger: prepared })).toBe(true);
  const marker = buildWilderness(0).features.find(item =>
    item.id === 'act1.evidence_lead')!;
  return { game, marker };
}

describe('Issue #125 — Seal of Rot requires a deliberate evidence interaction', () => {
  it('does not finish by walking onto the evidence; inspect is range/quest/paused gated', () => {
    const { game, marker } = gameAtEvidence();
    const before = game.snapshot();
    expect(before.questLedger?.quests.find(q => q.questId === 'seal_of_rot')?.status)
      .toBe('active');
    expect(before.canInspectStoryEvidence).toBe(false);
    game.command({ type: 'inspectStoryEvidence' });
    expect(game.snapshot().gold).toBe(before.gold);

    expect(game.restore({ ...before, player: {
      ...before.player, x: marker.position.x, y: marker.position.y
    } })).toBe(true);
    game.advance(50);
    expect(game.snapshot().questLedger?.quests.find(q => q.questId === 'seal_of_rot')?.status)
      .toBe('active');
    expect(game.snapshot().canInspectStoryEvidence).toBe(true);

    game.command({ type: 'pause', value: true });
    expect(game.snapshot().canInspectStoryEvidence).toBe(false);
    game.command({ type: 'inspectStoryEvidence' });
    expect(game.snapshot().questLedger?.quests.find(q => q.questId === 'seal_of_rot')?.status)
      .toBe('active');
    game.command({ type: 'pause', value: false });
    game.command({ type: 'inspectStoryEvidence' });
    const completed = game.snapshot();
    expect(completed.questLedger?.quests.find(q => q.questId === 'seal_of_rot')?.status)
      .toBe('completed');
    expect(completed.questLedger?.quests.find(q => q.questId === 'crypt_descent')?.status)
      .toBe('active');
    expect(completed.canInspectStoryEvidence).toBe(false);
    expect(completed.gold).toBe(before.gold + 75);

    game.command({ type: 'inspectStoryEvidence' });
    game.advance(50);
    expect(game.snapshot().gold).toBe(completed.gold);
    expect(game.snapshot().questLedger).toEqual(completed.questLedger);
  });
});
