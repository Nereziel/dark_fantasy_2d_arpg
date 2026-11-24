import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { ACT_I_QUEST_CATALOG, createActIQuestLedger } from '../../src/game/quests/actIQuestChain';
import { validateQuestLedger } from '../../src/game/quests/questDialogue';
import { FIRST_QUEST_ID } from '../../src/game/quests/firstQuest';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';

describe('Act I authoritative quest progression integration', () => {
  it('requires actual exploration and preserves a discovered site across save/reload', () => {
    const game = new GameSimulation(0);
    const historic = { id: FIRST_QUEST_ID, status: 'completed' as const, defeated: 3 };
    expect(game.restoreCharacter({
      ...game.character(), quest: historic, questLedger: createActIQuestLedger(historic)!
    }, 0)).toBe(true);
    game.command({ type: 'questAccept', questId: 'trail_of_black_ash' });
    expect(game.snapshot().questLedger?.quests[1]?.status).toBe('active');

    const marker = buildWilderness(0).features.find(item => item.id === 'act1.corruption_site')!;
    const before = game.snapshot();
    expect(game.restore({ ...before, player: { ...before.player,
      x: marker.position.x, y: marker.position.y } })).toBe(true);
    game.advance(16.667);
    const after = game.snapshot();
    expect(after.questLedger?.quests[1]?.status).toBe('completed');
    expect(after.questLedger?.quests[2]?.status).toBe('active');
    expect(after.gold).toBe(before.gold + 45);
    game.advance(16.667);
    expect(game.snapshot().gold).toBe(after.gold);
    const saved = createSaveRecord(game.character());
    expect(saved?.format).toBe(11);
    const restored = new GameSimulation(3);
    expect(restored.restoreCharacter(readSaveRecord(saved)!, 42)).toBe(true);
    expect(restored.snapshot().questLedger?.quests[1]?.rewardClaimed).toBe(true);
    expect(restored.snapshot().questLedger?.quests[2]?.status).toBe('active');
    expect(restored.snapshot().gold).toBe(after.gold);
  });

  it('requires Vesna in town for the final report and pays once after unlocking Act II', () => {
    const game = new GameSimulation(42);
    const snapshot = game.snapshot();
    const ledger = createActIQuestLedger(snapshot.quest)!;
    const prepared = { quests: ledger.quests.map(entry => {
      const definition = ACT_I_QUEST_CATALOG.quests.find(quest => quest.id === entry.questId)!;
      if (entry.questId === 'vesnas_report') return { ...entry, status: 'active' as const };
      return {
        ...entry, status: 'completed' as const,
        counters: Object.fromEntries(definition.objectives.map(o => [o.id, o.targetCount])),
        processedEventIds: ['fixture_' + entry.questId], rewardClaimed: true
      };
    }) };
    expect(validateQuestLedger(ACT_I_QUEST_CATALOG, prepared)).toBe(true);
    expect(game.restore({
      ...snapshot,
      quest: { id: FIRST_QUEST_ID, status: 'completed', defeated: 3 },
      questLedger: prepared
    })).toBe(true);
    game.command({ type: 'questTurnIn', questId: 'vesnas_report' });
    expect(game.snapshot().actIIUnlocked).toBe(false);
    game.command({ type: 'interactNpc', npcId: 'warden_vesna' });
    expect(game.snapshot().questLedger?.quests.find(q => q.questId === 'vesnas_report')?.status).toBe('ready');
    const beforeClaim = game.snapshot().gold;
    game.command({ type: 'questTurnIn', questId: 'vesnas_report' });
    expect(game.snapshot().actIIUnlocked).toBe(true);
    expect(game.snapshot().gold).toBe(beforeClaim + 280);
    game.command({ type: 'questTurnIn', questId: 'vesnas_report' });
    expect(game.snapshot().gold).toBe(beforeClaim + 280);
    const saved = createSaveRecord(game.character())!;
    const loaded = new GameSimulation(7);
    expect(loaded.restoreCharacter(readSaveRecord(saved)!, 7)).toBe(true);
    expect(loaded.snapshot().actIIUnlocked).toBe(true);
    expect(loaded.snapshot().gold).toBe(beforeClaim + 280);
  });
});
