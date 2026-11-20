import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createActIQuestLedger } from '../../src/game/quests/actIQuestChain';
import { FIRST_QUEST_ID, WARDEN_ID, QUEST_REWARD_GOLD } from '../../src/game/quests/firstQuest';
import { validateQuestCatalog, evaluateDialogue, chooseDialogueOption,
  acceptQuest, advanceObjective, turnInQuest } from '../../src/game/quests/questDialogue';
import { STARTER_QUEST_CATALOG, firstQuestLedger,
  firstQuestFromLedger } from '../../src/game/quests/starterQuestRegistry';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';

describe('Wave D generic quest runtime and branching dialogue integration', () => {
  it('validates starter quest as reusable typed catalogue and round-trips v9 state', () => {
    expect(validateQuestCatalog(STARTER_QUEST_CATALOG)).toBe(true);
    for (const status of ['available', 'active', 'ready', 'completed'] as const) {
      const defeated = status === 'available' ? 0 : status === 'active' ? 2 : 3;
      const quest = { id: FIRST_QUEST_ID, status, defeated } as const;
      const ledger = firstQuestLedger(quest);
      expect(ledger).not.toBeNull();
      expect(firstQuestFromLedger(ledger!)).toEqual(quest);
      expect(ledger!.quests[0]?.rewardClaimed).toBe(status === 'completed');
    }
  });

  it('reactively gates two dialogue paths and refuses stale choices', () => {
    const base = firstQuestLedger({ id: FIRST_QUEST_ID, status: 'available', defeated: 0 })!;
    const context = { npcId: WARDEN_ID };
    const root = evaluateDialogue(STARTER_QUEST_CATALOG, base, 'vesna.root', context)!;
    expect(root.textKey).toBe('dialogue.vesna.root');
    expect(root.options.map(option => option.id)).toContain('ask');
    expect(root.options.find(option => option.id === 'accept')?.enabled).toBe(true);
    expect(root.options.some(option => option.id === 'turnIn')).toBe(false);
    expect(chooseDialogueOption(STARTER_QUEST_CATALOG, base, 'vesna.root', 'ask', context))
      .toEqual({ nextNodeId: 'vesna.details', action: null });
    expect(evaluateDialogue(STARTER_QUEST_CATALOG, base, 'vesna.details', context)!.textKey)
      .toBe('dialogue.vesna.details');

    const active = acceptQuest(STARTER_QUEST_CATALOG, base, FIRST_QUEST_ID)!.ledger;
    expect(evaluateDialogue(STARTER_QUEST_CATALOG, active, 'vesna.root', context)!
      .options.some(option => option.id === 'accept')).toBe(false);
    expect(evaluateDialogue(STARTER_QUEST_CATALOG, active, 'vesna.root', context)!
      .options.find(option => option.id === 'history')?.enabled).toBe(false);
    expect(chooseDialogueOption(STARTER_QUEST_CATALOG, active, 'vesna.root', 'accept', context))
      .toBeNull();

    const ready = advanceObjective(STARTER_QUEST_CATALOG, active, FIRST_QUEST_ID,
      'enemy_defeated', 'enemy_1', 3)!.ledger;
    expect(evaluateDialogue(STARTER_QUEST_CATALOG, ready, 'vesna.root', context)!
      .options.find(option => option.id === 'turnIn')?.enabled).toBe(true);
    expect(chooseDialogueOption(STARTER_QUEST_CATALOG, ready, 'vesna.root', 'turnIn', context))
      .toEqual({ nextNodeId: null, action: { type: 'turnInQuest', questId: FIRST_QUEST_ID } });
    const claimed = turnInQuest(STARTER_QUEST_CATALOG, ready, FIRST_QUEST_ID)!;
    expect(claimed.rewardPlan?.gold).toBe(QUEST_REWARD_GOLD);
    expect(turnInQuest(STARTER_QUEST_CATALOG, claimed.ledger, FIRST_QUEST_ID)!.rewardPlan)
      .toBeNull();
  });

  it('runs the authoritative acceptance and exact-once turn-in through character-only saves', () => {
    const sim = new GameSimulation(1);
    sim.command({ type: 'questAccept' });
    expect(sim.snapshot().quest.status).toBe('active');
    const ready = { ...sim.snapshot(),
      quest: { id: FIRST_QUEST_ID, status: 'ready' as const, defeated: 3 },
      questLedger: createActIQuestLedger({ id: FIRST_QUEST_ID, status: 'ready', defeated: 3 })! };
    expect(sim.restore(ready)).toBe(true);
    sim.command({ type: 'questTurnIn' });
    expect(sim.snapshot().quest.status).toBe('completed');
    expect(sim.snapshot().gold).toBe(ready.gold + QUEST_REWARD_GOLD);
    const paid = sim.snapshot();
    sim.command({ type: 'questTurnIn' });
    expect(sim.snapshot().gold).toBe(paid.gold);
    expect(sim.snapshot().xp).toBe(paid.xp);
    const record = createSaveRecord(sim.character());
    expect(record?.format).toBe(11);
    expect(JSON.stringify(record)).not.toContain('worldSeed');
    const loaded = new GameSimulation();
    expect(loaded.restoreCharacter(readSaveRecord(record)!, 1007)).toBe(true);
    loaded.command({ type: 'questTurnIn' });
    expect(loaded.snapshot().gold).toBe(paid.gold);
    expect(loaded.snapshot().quest.status).toBe('completed');
  });

  it('rejects forged or impossible first-quest ledgers without paying rewards', () => {
    expect(firstQuestLedger({ id: FIRST_QUEST_ID, status: 'ready', defeated: 1 })).toBeNull();
    expect(firstQuestLedger({ id: FIRST_QUEST_ID, status: 'active', defeated: 3 })).toBeNull();
    const sim = new GameSimulation();
    const before = sim.snapshot();
    sim.command({ type: 'questTurnIn' });
    expect(sim.snapshot()).toEqual(before);
  });
});
