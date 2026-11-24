import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';
import { createActIQuestLedger } from '../../src/game/quests/actIQuestChain';
import { FIRST_QUEST_ID, QUEST_REWARD_GOLD, QUEST_REWARD_XP } from '../../src/game/quests/firstQuest';

describe('Wave E Act I quest runtime and character-only save v11', () => {
  it('starts all quests in one ledger and retains the historical quest API', () => {
    const game = new GameSimulation(0);
    expect(game.snapshot().questLedger?.quests).toHaveLength(11);
    expect(game.snapshot().quest.id).toBe(FIRST_QUEST_ID);
    game.command({ type: 'questAccept' });
    expect(game.snapshot().quest.status).toBe('active');
    expect(game.snapshot().questLedger?.quests[0].status).toBe('active');
    // A repeated accept does not mint rewards or restart the counter.
    const before = game.character();
    game.command({ type: 'questAccept' });
    expect(game.character()).toEqual(before);
  });

  it('saves the complete ledger in v11 and migrates a historic v10 character without losing items', () => {
    const game = new GameSimulation(42);
    const saved = createSaveRecord(game.character(), 456);
    expect(saved?.format).toBe(11);
    expect(saved?.character.questLedger?.quests).toHaveLength(11);
    expect(saved && readSaveRecord(saved)).toEqual(saved?.character);
    const { questLedger: _dropLedger, ...oldCharacter } = saved!.character;
    const legacy = { ...saved!, format: 10, character: oldCharacter };
    const loaded = readSaveRecord(legacy);
    expect(loaded?.quest.id).toBe(FIRST_QUEST_ID);
    expect(loaded?.questLedger?.quests).toHaveLength(11);
    expect(loaded?.stash).toEqual(oldCharacter.stash);
    expect(readSaveRecord({ ...saved!, character: oldCharacter })).toBeNull();
    expect(readSaveRecord({ ...saved!, character: { ...saved!.character, questLedger: { quests: [] } } }))
      .toBeNull();
  });

  it('preserves already-claimed starter rewards on migration and rejects replay', () => {
    const game = new GameSimulation(0);
    const old = { id: FIRST_QUEST_ID, status: 'completed' as const, defeated: 3 };
    const ledger = createActIQuestLedger(old);
    expect(ledger).not.toBeNull();
    const previous = game.character();
    const ok = game.restoreCharacter({ ...previous, quest: old, questLedger: ledger! });
    expect(ok).toBe(true);
    const gold = game.snapshot().gold;
    const xp = game.snapshot().xp;
    game.command({ type: 'questTurnIn' });
    expect(game.snapshot().gold).toBe(gold);
    expect(game.snapshot().xp).toBe(xp);
    expect(ledger?.quests[0].rewardClaimed).toBe(true);
    expect(QUEST_REWARD_GOLD).toBe(150);
    expect(QUEST_REWARD_XP).toBe(100);
  });
});
