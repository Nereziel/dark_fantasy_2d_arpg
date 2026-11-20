import { describe, expect, it } from 'vitest';
import {
  FIRST_QUEST_ID, WARDEN_ID, QUEST_REQUIRED_KILLS,
  QUEST_REWARD_GOLD, QUEST_REWARD_XP
} from '../../src/game/quests/firstQuest';
import {
  acceptQuest, advanceObjective, chooseDialogueOption, createQuestLedger,
  evaluateDialogue, failQuest, turnInQuest, validateQuestCatalog,
  validateQuestLedger, type QuestCatalog, type QuestLedger
} from '../../src/game/quests/questDialogue';

const sample = (): QuestCatalog => ({
  quests: [
    {
      id: FIRST_QUEST_ID, category: 'main',
      titleKey: 'quest.ashes.title', descriptionKey: 'quest.ashes.description',
      objectiveKey: 'quest.ashes.objective',
      prerequisites: [], objectives: [
        { id: 'defeated', eventId: 'enemy_defeated', targetCount: QUEST_REQUIRED_KILLS }
      ],
      reward: { gold: QUEST_REWARD_GOLD, xp: QUEST_REWARD_XP }
    },
    {
      id: 'herbalist_help', category: 'side',
      titleKey: 'quest.herbalist.title', descriptionKey: 'quest.herbalist.description',
      objectiveKey: 'quest.herbalist.objective',
      prerequisites: [FIRST_QUEST_ID],
      objectives: [{ id: 'gathered', eventId: 'herb_found', targetCount: 2 }],
      reward: { gold: 15, xp: 8 },
      failureEventId: 'herbalist_dead'
    },
    {
      id: 'crypt_vigil', category: 'boss',
      titleKey: 'quest.crypt.title', descriptionKey: 'quest.crypt.description',
      objectiveKey: 'quest.crypt.objective',
      prerequisites: ['herbalist_help'],
      objectives: [{ id: 'boss', eventId: 'boss_defeated', targetCount: 1 }],
      reward: { gold: 500, xp: 300 }
    }
  ],
  dialogueNodes: [
    {
      id: 'vesna.offer', npcId: WARDEN_ID, textKey: 'dialogue.vesna.offer',
      options: [
        {
          id: 'accept', textKey: 'dialogue.vesna.accept',
          action: { type: 'acceptQuest', questId: FIRST_QUEST_ID },
          whenLocked: 'disabled'
        },
        { id: 'details', textKey: 'dialogue.vesna.details', nextNodeId: 'vesna.details' },
        {
          id: 'collect', textKey: 'dialogue.vesna.collect',
          action: { type: 'turnInQuest', questId: FIRST_QUEST_ID },
          whenLocked: 'hidden'
        },
        {
          id: 'private', textKey: 'dialogue.vesna.private',
          conditions: [{ type: 'npcState', npcId: WARDEN_ID, stateId: 'trusted' }],
          nextNodeId: 'vesna.details', whenLocked: 'disabled'
        },
        {
          id: 'clue', textKey: 'dialogue.vesna.clue',
          conditions: [{ type: 'campaignFlag', flagId: 'found_clue', enabled: true }],
          nextNodeId: 'vesna.details', whenLocked: 'hidden'
        }
      ]
    },
    {
      id: 'vesna.details', npcId: WARDEN_ID, textKey: 'dialogue.vesna.detailsLine',
      options: [{ id: 'back', textKey: 'dialogue.common.back', nextNodeId: 'vesna.offer' }]
    }
  ]
});

const withLedger = () => {
  const catalog = sample();
  const ledger = createQuestLedger(catalog);
  expect(ledger).not.toBeNull();
  return { catalog, ledger: ledger! };
};

const status = (ledger: QuestLedger, questId: string = FIRST_QUEST_ID) =>
  ledger.quests.find(q => q.questId === questId)!;

const frozen = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) frozen((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
};

describe('Agent 24: quest registry, branching dialogue and character-only progress', () => {
  it('validates multiple categories, DAG prerequisites and stable first-quest compatibility', () => {
    const catalog = sample();
    expect(validateQuestCatalog(catalog)).toBe(true);
    expect(catalog.quests.map(q => q.category)).toEqual(['main', 'side', 'boss']);
    expect(catalog.quests[0].id).toBe('ashes_at_gate');
    expect(catalog.dialogueNodes[0].npcId).toBe('warden_vesna');
    expect(catalog.quests[0].objectives[0].targetCount).toBe(3);
    expect(catalog.quests[0].reward).toEqual({ gold: 150, xp: 100 });

    const ledger = createQuestLedger(catalog)!;
    expect(validateQuestLedger(catalog, ledger)).toBe(true);
    expect(status(ledger)).toMatchObject({
      questId: FIRST_QUEST_ID, status: 'available', rewardClaimed: false,
      counters: { defeated: 0 }, processedEventIds: []
    });
    const stored = JSON.parse(JSON.stringify(ledger));
    expect(validateQuestLedger(catalog, stored)).toBe(true);
    expect(JSON.stringify(stored)).not.toMatch(/worldSeed|position|enemy|dialogueNode|npcStates/i);
  });

  it('completes available → active → ready → completed with one reward proposal', () => {
    const { catalog, ledger } = withLedger();
    const accepted = acceptQuest(catalog, ledger, FIRST_QUEST_ID)!;
    expect(accepted.changed).toBe(true);
    expect(accepted.rewardPlan).toBeNull();
    expect(status(accepted.ledger).status).toBe('active');
    expect(acceptQuest(catalog, accepted.ledger, FIRST_QUEST_ID)!.changed).toBe(false);

    const a = advanceObjective(catalog, accepted.ledger, FIRST_QUEST_ID, 'enemy_defeated', 'enemy-001')!;
    const b = advanceObjective(catalog, a.ledger, FIRST_QUEST_ID, 'enemy_defeated', 'enemy-002')!;
    const c = advanceObjective(catalog, b.ledger, FIRST_QUEST_ID, 'enemy_defeated', 'enemy-003')!;
    expect(status(b.ledger)).toMatchObject({ status: 'active', counters: { defeated: 2 } });
    expect(status(c.ledger)).toMatchObject({ status: 'ready', counters: { defeated: 3 } });
    expect(turnInQuest(catalog, b.ledger, FIRST_QUEST_ID)).toBeNull();

    const claimed = turnInQuest(catalog, c.ledger, FIRST_QUEST_ID)!;
    expect(claimed.changed).toBe(true);
    expect(claimed.rewardPlan).toEqual({
      questId: FIRST_QUEST_ID, gold: QUEST_REWARD_GOLD, xp: QUEST_REWARD_XP
    });
    expect(status(claimed.ledger)).toMatchObject({
      status: 'completed', rewardClaimed: true, counters: { defeated: 3 }
    });
    const repeat = turnInQuest(catalog, claimed.ledger, FIRST_QUEST_ID)!;
    expect(repeat.changed).toBe(false);
    expect(repeat.rewardPlan).toBeNull();
    expect(advanceObjective(catalog, claimed.ledger, FIRST_QUEST_ID, 'enemy_defeated', 'enemy-004')!.changed).toBe(false);
    expect(validateQuestLedger(catalog, claimed.ledger)).toBe(true);
  });

  it('requires completed prerequisites and supports quest failure only by explicit policy', () => {
    const { catalog, ledger } = withLedger();
    expect(acceptQuest(catalog, ledger, 'herbalist_help')).toBeNull();
    expect(acceptQuest(catalog, ledger, 'crypt_vigil')).toBeNull();
    expect(failQuest(catalog, ledger, FIRST_QUEST_ID, 'enemy_defeated')).toBeNull();

    let state = acceptQuest(catalog, ledger, FIRST_QUEST_ID)!.ledger;
    state = advanceObjective(catalog, state, FIRST_QUEST_ID, 'enemy_defeated', 'enemy-1', 5)!.ledger;
    state = turnInQuest(catalog, state, FIRST_QUEST_ID)!.ledger;
    const side = acceptQuest(catalog, state, 'herbalist_help')!;
    expect(side.changed).toBe(true);
    expect(acceptQuest(catalog, side.ledger, 'crypt_vigil')).toBeNull();
    expect(failQuest(catalog, side.ledger, 'herbalist_help', 'wrong_event')).toBeNull();

    const failed = failQuest(catalog, side.ledger, 'herbalist_help', 'herbalist_dead')!;
    expect(status(failed.ledger, 'herbalist_help').status).toBe('failed');
    expect(acceptQuest(catalog, failed.ledger, 'herbalist_help')).toBeNull();
    expect(turnInQuest(catalog, failed.ledger, 'herbalist_help')).toBeNull();
    expect(failQuest(catalog, failed.ledger, 'herbalist_help', 'herbalist_dead')!.changed).toBe(false);
  });

  it('clamps objective increments, deduplicates occurrence IDs, ignores unrelated events', () => {
    const { catalog, ledger } = withLedger();
    const active = acceptQuest(catalog, ledger, FIRST_QUEST_ID)!.ledger;
    expect(advanceObjective(catalog, active, FIRST_QUEST_ID, 'herb_found', 'herb-1')!.changed).toBe(false);
    const a = advanceObjective(catalog, active, FIRST_QUEST_ID, 'enemy_defeated', 'kill-A', 2)!;
    expect(status(a.ledger).counters.defeated).toBe(2);
    const dup = advanceObjective(catalog, a.ledger, FIRST_QUEST_ID, 'enemy_defeated', 'kill-A', 1)!;
    expect(dup.changed).toBe(false);
    expect(status(dup.ledger).counters.defeated).toBe(2);
    const finished = advanceObjective(catalog, a.ledger, FIRST_QUEST_ID, 'enemy_defeated', 'kill-B', 999)!;
    expect(status(finished.ledger)).toMatchObject({ status: 'ready', counters: { defeated: 3 } });
    expect(status(finished.ledger).processedEventIds).toEqual(['kill-A', 'kill-B']);
  });

  it('evaluates two dialogue branches with hidden/disabled options, exact i18n keys and live reevaluation', () => {
    const { catalog, ledger } = withLedger();
    const context = { npcId: WARDEN_ID, npcStates: { [WARDEN_ID]: 'neutral' }, campaignFlags: [] };
    const available = evaluateDialogue(catalog, ledger, 'vesna.offer', context)!;
    expect(available.textKey).toBe('dialogue.vesna.offer');
    expect(available.options.map(o => o.id)).toEqual(['accept', 'details', 'private']);
    expect(available.options.find(o => o.id === 'accept')?.enabled).toBe(true);
    expect(available.options.find(o => o.id === 'private')?.enabled).toBe(false);
    expect(chooseDialogueOption(catalog, ledger, 'vesna.offer', 'private', context)).toBeNull();
    expect(chooseDialogueOption(catalog, ledger, 'vesna.offer', 'not-an-option', context)).toBeNull();
    expect(chooseDialogueOption(catalog, ledger, 'vesna.offer', 'details', context))
      .toEqual({ nextNodeId: 'vesna.details', action: null });
    expect(evaluateDialogue(catalog, ledger, 'vesna.details', context)!.textKey)
      .toBe('dialogue.vesna.detailsLine');

    const active = acceptQuest(catalog, ledger, FIRST_QUEST_ID)!.ledger;
    const after = evaluateDialogue(catalog, active, 'vesna.offer', context)!;
    expect(after.options.find(o => o.id === 'accept')?.enabled).toBe(false);

    const trusted = { npcId: WARDEN_ID, npcStates: { [WARDEN_ID]: 'trusted' }, campaignFlags: ['found_clue'] };
    expect(evaluateDialogue(catalog, active, 'vesna.offer', trusted)!.options.map(o => o.id))
      .toContain('clue');
    expect(chooseDialogueOption(catalog, active, 'vesna.offer', 'private', trusted))
      .toEqual({ nextNodeId: 'vesna.details', action: null });

    const ready = advanceObjective(catalog, active, FIRST_QUEST_ID, 'enemy_defeated', 'boss-1', 3)!.ledger;
    const readyView = evaluateDialogue(catalog, ready, 'vesna.offer', trusted)!;
    expect(readyView.options.find(o => o.id === 'collect')?.enabled).toBe(true);
    expect(chooseDialogueOption(catalog, ready, 'vesna.offer', 'collect', trusted))
      .toEqual({ nextNodeId: null, action: { type: 'turnInQuest', questId: FIRST_QUEST_ID } });
    expect(evaluateDialogue(catalog, ready, 'vesna.offer', { npcId: 'merchant_bram' })).toBeNull();
    expect(evaluateDialogue(catalog, ready, 'missing', trusted)).toBeNull();
  });

  it('rejects duplicate/cyclic/unknown prerequisites and invalid dialogue references', () => {
    const bad = (change: (c: QuestCatalog) => void) => {
      const c = sample();
      change(c);
      expect(validateQuestCatalog(c)).toBe(false);
      expect(createQuestLedger(c)).toBeNull();
    };
    bad(c => { c.quests.push({ ...c.quests[0] }); });
    bad(c => { c.quests[0].prerequisites.push('no_such_quest'); });
    bad(c => { c.quests[0].prerequisites.push('crypt_vigil'); }); // 3-node cycle
    bad(c => { c.quests[0].prerequisites.push(FIRST_QUEST_ID); });
    bad(c => { c.quests[0].objectives.push({ ...c.quests[0].objectives[0] }); });
    bad(c => { c.dialogueNodes[0].options[0].nextNodeId = 'missing'; });
    bad(c => { c.dialogueNodes[0].options[0].action = { type: 'acceptQuest', questId: 'missing' }; });
    bad(c => { c.dialogueNodes[0].options[0].conditions = [{ type: 'questStatus', questId: 'missing', status: 'ready' }]; });
  });

  it('rejects forged/prototype quest IDs, malformed targets/rewards and dangerous oversized catalogs', () => {
    const bad = (change: (c: QuestCatalog) => void) => {
      const c = sample(); change(c);
      expect(validateQuestCatalog(c)).toBe(false);
    };
    for (const id of ['__proto__', 'constructor', 'prototype', '', 'hasOwnProperty', 'bad ID']) {
      bad(c => { c.quests[0].id = id; });
    }
    for (const targetCount of [0, -1, 0.2, NaN, Infinity, Number.MAX_VALUE]) {
      bad(c => { c.quests[0].objectives[0].targetCount = targetCount; });
    }
    for (const value of [-1, NaN, Infinity, Number.MAX_VALUE]) {
      bad(c => { c.quests[0].reward.gold = value; });
      bad(c => { c.quests[0].reward.xp = value; });
    }
    bad(c => { c.quests[0].category = 'unknown' as QuestCatalog['quests'][number]['category']; });
    bad(c => { c.dialogueNodes[0].options[0].id = '__proto__'; });
    bad(c => { c.dialogueNodes[0].options[0].textKey = ''; });
    bad(c => { c.quests = Array.from({ length: 130 }, (_, i) => ({ ...c.quests[0], id: 'q'+i, prerequisites: [] })); });
    expect(validateQuestCatalog(null)).toBe(false);
    expect(validateQuestCatalog([])).toBe(false);
  });

  it('rejects invalid inputs and forged ledger states; does not grant phantom rewards', () => {
    const { catalog, ledger } = withLedger();
    for (const id of ['__proto__', 'missing', '', 'constructor']) {
      expect(acceptQuest(catalog, ledger, id)).toBeNull();
      expect(turnInQuest(catalog, ledger, id)).toBeNull();
      expect(failQuest(catalog, ledger, id, 'x')).toBeNull();
    }
    const active = acceptQuest(catalog, ledger, FIRST_QUEST_ID)!.ledger;
    for (const amount of [0, -2, 0.5, NaN, Infinity, 1e15]) {
      expect(advanceObjective(catalog, active, FIRST_QUEST_ID, 'enemy_defeated', 'id', amount)).toBeNull();
    }
    for (const occurrenceId of ['', '__proto__', 'bad id', 'x'.repeat(200)]) {
      expect(advanceObjective(catalog, active, FIRST_QUEST_ID, 'enemy_defeated', occurrenceId)).toBeNull();
    }
    expect(advanceObjective(catalog, active, FIRST_QUEST_ID, 'enemy_defeated', 'x', 3)!.changed).toBe(true);
    const forged = JSON.parse(JSON.stringify(active)) as QuestLedger;
    (forged.quests[0] as { counters: Record<string, number> }).counters.defeated = Infinity;
    expect(validateQuestLedger(catalog, forged)).toBe(false);
    expect(turnInQuest(catalog, forged, FIRST_QUEST_ID)).toBeNull();
    const forgedComplete = JSON.parse(JSON.stringify(active)) as QuestLedger;
    (forgedComplete.quests[0] as { status: string }).status = 'completed';
    expect(validateQuestLedger(catalog, forgedComplete)).toBe(false);
    expect(turnInQuest(catalog, forgedComplete, FIRST_QUEST_ID)).toBeNull();
  });

  it('fails closed on event replay-log capacity rather than evicting dedupe IDs', () => {
    const c = sample();
    c.quests[0].objectives[0].targetCount = 1000;
    const start = acceptQuest(c, createQuestLedger(c)!, FIRST_QUEST_ID)!.ledger;
    const forged = JSON.parse(JSON.stringify(start)) as QuestLedger;
    const record = forged.quests[0] as unknown as { processedEventIds: string[]; counters: Record<string, number> };
    record.processedEventIds = Array.from({ length: 256 }, (_, i) => 'old_'+i);
    record.counters.defeated = 256;
    expect(validateQuestLedger(c, forged)).toBe(true);
    expect(advanceObjective(c, forged, FIRST_QUEST_ID, 'enemy_defeated', 'fresh')).toBeNull();
    expect(advanceObjective(c, forged, FIRST_QUEST_ID, 'enemy_defeated', 'old_5')!.changed).toBe(false);
  });

  it('does not mutate frozen catalog, original ledger or transient dialogue context', () => {
    const catalog = frozen(sample());
    const ledger = frozen(createQuestLedger(catalog)!);
    const context = frozen({ npcId: WARDEN_ID, campaignFlags: ['found_clue'], npcStates: { [WARDEN_ID]: 'trusted' } });
    expect(validateQuestCatalog(catalog)).toBe(true);
    expect(evaluateDialogue(catalog, ledger, 'vesna.offer', context)).not.toBeNull();
    const next = acceptQuest(catalog, ledger, FIRST_QUEST_ID)!;
    expect(next.ledger).not.toBe(ledger);
    expect(status(ledger).status).toBe('available');
    expect(status(next.ledger).status).toBe('active');
    expect(validateQuestLedger(catalog, next.ledger)).toBe(true);
  });
});
