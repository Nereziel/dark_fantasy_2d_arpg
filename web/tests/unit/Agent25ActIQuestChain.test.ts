import { describe, expect, it } from 'vitest';
import {
  FIRST_QUEST_ID, QUEST_REQUIRED_KILLS, QUEST_REWARD_GOLD, QUEST_REWARD_XP,
  WARDEN_ID, freshQuest, type QuestProgress
} from '../../src/game/quests/firstQuest';
import { firstQuestLedger, STARTER_QUEST_CATALOG } from '../../src/game/quests/starterQuestRegistry';
import {
  acceptQuest, advanceObjective, chooseDialogueOption, createQuestLedger, evaluateDialogue,
  turnInQuest, validateQuestCatalog, validateQuestLedger,
  type QuestLedger, type QuestCatalog
} from '../../src/game/quests/questDialogue';
import {
  ACT_I_QUEST_CATALOG, ACT_I_STORY_QUEST_IDS, ACT_I_MILESTONES, ACT_I_EVENT_CONTRACTS,
  ACT_I_NEXT_CHAPTER_FLAG_ID, createActIQuestLedger, getActIEventContract
} from '../../src/game/quests/actIQuestChain';

const expectedIds = [
  'trail_of_black_ash', 'blighted_pack', 'forgotten_graves', 'morrow_gravebound',
  'seal_of_rot', 'crypt_descent', 'crypt_lord_fallen', 'vesnas_report'
] as const;

const state = (ledger: QuestLedger, id: string) => ledger.quests.find(q => q.questId === id)!;
const parsed = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) {
      freezeDeep((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

describe('Agent 25: Act I quest-chain data and compatibility', () => {
  it('extends the original catalog without duplicating or modifying ashes_at_gate or Vesna', () => {
    expect(ACT_I_STORY_QUEST_IDS).toEqual(expectedIds);
    expect(validateQuestCatalog(ACT_I_QUEST_CATALOG)).toBe(true);
    expect(ACT_I_QUEST_CATALOG.quests).toHaveLength(9);
    expect(ACT_I_QUEST_CATALOG.quests.filter(q => q.id === FIRST_QUEST_ID)).toHaveLength(1);
    expect(ACT_I_QUEST_CATALOG.quests[0]).toEqual(STARTER_QUEST_CATALOG.quests[0]);
    expect(ACT_I_QUEST_CATALOG.quests[0].objectives).toEqual([
      { id: 'defeated', eventId: 'enemy_defeated', targetCount: QUEST_REQUIRED_KILLS }
    ]);
    expect(ACT_I_QUEST_CATALOG.quests[0].reward).toEqual({
      gold: QUEST_REWARD_GOLD, xp: QUEST_REWARD_XP
    });
    const originalRoot = STARTER_QUEST_CATALOG.dialogueNodes.find(node => node.id === 'vesna.root')!;
    const newRoot = ACT_I_QUEST_CATALOG.dialogueNodes.find(node => node.id === 'vesna.root')!;
    expect(newRoot.npcId).toBe(WARDEN_ID);
    expect(newRoot.options.slice(0, originalRoot.options.length)).toEqual(originalRoot.options);
    expect(ACT_I_QUEST_CATALOG.dialogueNodes.some(node => node.id === 'vesna.details')).toBe(true);
    expect(validateQuestCatalog(STARTER_QUEST_CATALOG)).toBe(true);
  });

  it('defines eight narrative stages with an acyclic story gate and meaningful translation keys', () => {
    expect(ACT_I_MILESTONES).toHaveLength(expectedIds.length);
    expect(ACT_I_MILESTONES.map(m => m.questId)).toEqual(expectedIds);
    const quests = ACT_I_QUEST_CATALOG.quests;
    for (const [i, milestone] of ACT_I_MILESTONES.entries()) {
      const quest = quests.find(q => q.id === milestone.questId)!;
      expect(quest).toBeDefined();
      expect(quest.category).toMatch(/^(main|exploration|investigation|boss|dungeon)$/);
      const expectedPrerequisite = i === 0 ? FIRST_QUEST_ID : expectedIds[i - 1];
      expect(milestone.prerequisiteQuestId).toBe(expectedPrerequisite);
      expect(quest.prerequisites).toEqual([expectedPrerequisite]);
      expect(quest.objectives).toEqual([{
        id: milestone.objectiveId, eventId: milestone.eventId, targetCount: milestone.targetCount
      }]);
      for (const key of [quest.titleKey, quest.descriptionKey, quest.objectiveKey]) {
        expect(key).toMatch(/^quest\.actI\.[a-z_]+\.(title|description|objective)$/);
      }
      expect(quest.descriptionKey).not.toEqual(quest.objectiveKey);
      expect(milestone.dialogueNodeId).toBe('vesna.act1.' + milestone.questId);
      expect(ACT_I_QUEST_CATALOG.dialogueNodes.some(node => node.id === milestone.dialogueNodeId)).toBe(true);
      expect(quest.reward.gold).toBeGreaterThanOrEqual(0);
      expect(quest.reward.xp).toBeGreaterThan(0);
    }
    expect(ACT_I_MILESTONES.at(-1)?.unlockFlagId).toBe(ACT_I_NEXT_CHAPTER_FLAG_ID);
    expect(ACT_I_MILESTONES.slice(0, -1).every(m => m.unlockFlagId === null)).toBe(true);
  });

  it('supplies an exact two-way mapping of unique event kinds to quest objectives and POI markers', () => {
    expect(ACT_I_EVENT_CONTRACTS).toHaveLength(8);
    expect(new Set(ACT_I_EVENT_CONTRACTS.map(c => c.eventId)).size).toBe(8);
    expect(new Set(ACT_I_EVENT_CONTRACTS.map(c => c.questId)).size).toBe(8);
    expect(new Set(ACT_I_EVENT_CONTRACTS.map(c => c.markerId)).size).toBe(8);
    for (const c of ACT_I_EVENT_CONTRACTS) {
      const milestone = ACT_I_MILESTONES.find(m => m.questId === c.questId)!;
      expect(milestone).toBeDefined();
      expect(c).toMatchObject({
        questId: milestone.questId, eventId: milestone.eventId,
        objectiveId: milestone.objectiveId, markerId: milestone.markerId,
        regionHint: milestone.regionHint, npcTurnInHint: milestone.npcTurnInHint
      });
      expect(c.occurrenceId).toEqual({
        producer: 'integrator', uniqueness: 'concrete_occurrence', replay: 'persist_in_ledger'
      });
      expect(getActIEventContract(c.questId, c.eventId)).toBe(c);
    }
    expect(ACT_I_EVENT_CONTRACTS.find(c => c.questId === 'vesnas_report')?.npcTurnInHint)
      .toBe(WARDEN_ID);
    expect(ACT_I_EVENT_CONTRACTS.find(c => c.questId === 'crypt_lord_fallen')?.targetIdHint)
      .toBe('crypt_lord');
    expect(ACT_I_EVENT_CONTRACTS.find(c => c.questId === 'morrow_gravebound')?.targetIdHint)
      .toBe('morrow_gravebound');
    expect(ACT_I_EVENT_CONTRACTS.find(c => c.questId === 'crypt_descent')?.regionHint)
      .toBe('crypt');
    for (const malformed of [null, '', '__proto__', 0, NaN, Infinity, {}, ['trail_of_black_ash']]) {
      expect(getActIEventContract(malformed, 'corruption_traced')).toBeUndefined();
      expect(getActIEventContract('trail_of_black_ash', malformed)).toBeUndefined();
    }
    expect(getActIEventContract('trail_of_black_ash', 'graveyard_found')).toBeUndefined();
    expect(getActIEventContract(FIRST_QUEST_ID, 'enemy_defeated')).toBeUndefined();
  });

  it.each([
    ['available', 0, false],
    ['active', 0, false],
    ['active', 1, false],
    ['active', 2, false],
    ['ready', 3, false],
    ['completed', 3, true]
  ] as const)('migrates legacy %s/%i without losing counters or claimed rewards', (status, defeated, claimed) => {
    const progress: QuestProgress = { id: FIRST_QUEST_ID, status, defeated };
    const copy = parsed(progress);
    const ledger = createActIQuestLedger(freezeDeep(progress))!;
    expect(ledger).not.toBeNull();
    expect(validateQuestLedger(ACT_I_QUEST_CATALOG, ledger)).toBe(true);
    expect(state(ledger, FIRST_QUEST_ID)).toEqual({
      questId: FIRST_QUEST_ID, status, counters: { defeated },
      processedEventIds: Array.from({ length: defeated }, (_, i) => 'legacy_' + (i + 1)),
      rewardClaimed: claimed
    });
    expect(ledger.quests.slice(1).every(q => q.status === 'available' && !q.rewardClaimed
      && q.processedEventIds.length === 0 && Object.values(q.counters).every(v => v === 0))).toBe(true);
    expect(progress).toEqual(copy);
    if (claimed) {
      expect(turnInQuest(ACT_I_QUEST_CATALOG, ledger, FIRST_QUEST_ID))
        .toMatchObject({ changed: false, rewardPlan: null });
    }
  });

  it('upgrades legacy firstQuestLedger and preserves full ledgers on rehydration without aliasing', () => {
    const old = freezeDeep(firstQuestLedger({ id: FIRST_QUEST_ID, status: 'completed', defeated: 3 })!);
    const migrated = createActIQuestLedger(old)!;
    expect(state(migrated, FIRST_QUEST_ID)).toEqual(state(old, FIRST_QUEST_ID));
    expect(validateQuestLedger(ACT_I_QUEST_CATALOG, migrated)).toBe(true);
    expect(acceptQuest(ACT_I_QUEST_CATALOG, migrated, expectedIds[0])?.changed).toBe(true);
    const full = freezeDeep(createActIQuestLedger({ id: FIRST_QUEST_ID, status: 'active', defeated: 1 })!);
    const after = createActIQuestLedger(parsed(full))!;
    expect(after).toEqual(full);
    expect(after).not.toBe(full);
    expect(after.quests[0]).not.toBe(full.quests[0]);
    expect(after.quests[0].counters).not.toBe(full.quests[0].counters);
    expect(after.quests[0].processedEventIds).not.toBe(full.quests[0].processedEventIds);
    expect(createActIQuestLedger(parsed(after))).toEqual(after);
  });

  it('walks from the original quest through each stage with unique occurrences and once-only rewards', () => {
    let ledger = createActIQuestLedger(freshQuest())!;
    expect(acceptQuest(ACT_I_QUEST_CATALOG, ledger, expectedIds[0])).toBeNull();
    for (const id of expectedIds) expect(acceptQuest(ACT_I_QUEST_CATALOG, ledger, id)).toBeNull();
    ledger = acceptQuest(ACT_I_QUEST_CATALOG, ledger, FIRST_QUEST_ID)!.ledger;
    ledger = advanceObjective(ACT_I_QUEST_CATALOG, ledger, FIRST_QUEST_ID,
      'enemy_defeated', 'starter_legacy_3', QUEST_REQUIRED_KILLS)!.ledger;
    const starterReward = turnInQuest(ACT_I_QUEST_CATALOG, ledger, FIRST_QUEST_ID)!;
    expect(starterReward.rewardPlan).toEqual({
      questId: FIRST_QUEST_ID, gold: QUEST_REWARD_GOLD, xp: QUEST_REWARD_XP
    });
    ledger = starterReward.ledger;
    for (const [index, milestone] of ACT_I_MILESTONES.entries()) {
      const quest = ACT_I_QUEST_CATALOG.quests.find(q => q.id === milestone.questId)!;
      if (index < ACT_I_MILESTONES.length - 1) {
        expect(acceptQuest(ACT_I_QUEST_CATALOG, ledger, expectedIds[index + 1])).toBeNull();
      }
      ledger = acceptQuest(ACT_I_QUEST_CATALOG, ledger, milestone.questId)!.ledger;
      expect(state(ledger, milestone.questId).status).toBe('active');
      expect(advanceObjective(ACT_I_QUEST_CATALOG, ledger, milestone.questId,
        'other_unrelated_event', 'irrelevant_' + index)!.changed).toBe(false);
      const wrongKind = ACT_I_MILESTONES[(index + 1) % ACT_I_MILESTONES.length].eventId;
      expect(advanceObjective(ACT_I_QUEST_CATALOG, ledger, milestone.questId,
        wrongKind, 'wrong_' + index)!.changed).toBe(false);
      expect(turnInQuest(ACT_I_QUEST_CATALOG, ledger, milestone.questId)).toBeNull();
      for (let n = 0; n < milestone.targetCount; n++) {
        const occurrence = 'act1_' + index + '_' + n;
        const next = advanceObjective(ACT_I_QUEST_CATALOG, ledger, milestone.questId,
          milestone.eventId, occurrence)!;
        expect(next.changed).toBe(true);
        ledger = next.ledger;
        expect(advanceObjective(ACT_I_QUEST_CATALOG, ledger, milestone.questId,
          milestone.eventId, occurrence)!.changed).toBe(false);
      }
      expect(state(ledger, milestone.questId).status).toBe('ready');
      expect(state(ledger, milestone.questId).counters[milestone.objectiveId])
        .toBe(milestone.targetCount);
      const reward = turnInQuest(ACT_I_QUEST_CATALOG, ledger, milestone.questId)!;
      expect(reward.rewardPlan).toEqual({
        questId: milestone.questId, gold: quest.reward.gold, xp: quest.reward.xp
      });
      ledger = reward.ledger;
      expect(state(ledger, milestone.questId)).toMatchObject({
        status: 'completed', rewardClaimed: true
      });
      expect(turnInQuest(ACT_I_QUEST_CATALOG, ledger, milestone.questId))
        .toMatchObject({ changed: false, rewardPlan: null });
      expect(advanceObjective(ACT_I_QUEST_CATALOG, ledger, milestone.questId,
        milestone.eventId, 'replayed_' + index)!.changed).toBe(false);
      expect(validateQuestLedger(ACT_I_QUEST_CATALOG, ledger)).toBe(true);
    }
    const roundTripped = parsed(ledger);
    expect(validateQuestLedger(ACT_I_QUEST_CATALOG, roundTripped)).toBe(true);
    for (const q of roundTripped.quests) {
      expect(q.rewardClaimed).toBe(true);
      expect(turnInQuest(ACT_I_QUEST_CATALOG, roundTripped, q.questId)!.rewardPlan).toBeNull();
    }
  });

  it('offers new quest branches through Vesna without losing original dialogue nodes', () => {
    const context = { npcId: WARDEN_ID };
    const newGame = createActIQuestLedger(freshQuest())!;
    expect(evaluateDialogue(ACT_I_QUEST_CATALOG, newGame, 'vesna.root', context)?.options
      .some(o => o.id === 'actI')).toBe(false);
    const oldDetails = evaluateDialogue(ACT_I_QUEST_CATALOG, newGame, 'vesna.details', context);
    expect(oldDetails?.id).toBe('vesna.details');

    const completed = createActIQuestLedger({
      id: FIRST_QUEST_ID, status: 'completed', defeated: QUEST_REQUIRED_KILLS
    })!;
    const root = evaluateDialogue(ACT_I_QUEST_CATALOG, completed, 'vesna.root', context)!;
    expect(root.options.some(o => o.id === 'actI' && o.enabled)).toBe(true);
    expect(chooseDialogueOption(ACT_I_QUEST_CATALOG, completed, 'vesna.root', 'actI', context))
      .toEqual({ nextNodeId: 'vesna.act1.hub', action: null });
    const hub = evaluateDialogue(ACT_I_QUEST_CATALOG, completed, 'vesna.act1.hub', context)!;
    expect(hub.options.map(o => o.id)).toContain(expectedIds[0] + '_offer');
    expect(hub.options.map(o => o.id)).not.toContain(expectedIds[1] + '_offer');
    expect(chooseDialogueOption(ACT_I_QUEST_CATALOG, completed, 'vesna.act1.hub',
      expectedIds[0] + '_offer', context))
      .toEqual({ nextNodeId: 'vesna.act1.' + expectedIds[0], action: null });
    expect(evaluateDialogue(ACT_I_QUEST_CATALOG, completed,
      'vesna.act1.' + expectedIds[0], { npcId: 'merchant_bram' })).toBeNull();
    const detail = evaluateDialogue(ACT_I_QUEST_CATALOG, completed,
      'vesna.act1.' + expectedIds[0], context)!;
    expect(detail.options.find(o => o.id === 'accept')?.action)
      .toEqual({ type: 'acceptQuest', questId: expectedIds[0] });
    const active = acceptQuest(ACT_I_QUEST_CATALOG, completed, expectedIds[0])!.ledger;
    expect(evaluateDialogue(ACT_I_QUEST_CATALOG, active, 'vesna.act1.hub', context)?.options
      .some(o => o.id === expectedIds[0] + '_active')).toBe(true);
    expect(evaluateDialogue(ACT_I_QUEST_CATALOG, active,
      'vesna.act1.' + expectedIds[0], context)?.options.some(o => o.id === 'accept')).toBe(false);
    expect(evaluateDialogue(ACT_I_QUEST_CATALOG, active,
      'vesna.act1.' + expectedIds[0], context)?.options.some(o => o.id === 'turnIn')).toBe(false);
  });

  it('rejects malformed legacy or full ledgers and invalid replay/counter inputs without mutation', () => {
    const badLegacy: unknown[] = [
      null, {}, [], { id: '__proto__', status: 'completed', defeated: 3 },
      { id: FIRST_QUEST_ID, status: 'completed', defeated: 2 },
      { id: FIRST_QUEST_ID, status: 'available', defeated: 2 },
      { id: FIRST_QUEST_ID, status: 'active', defeated: 3 },
      ...[-1, NaN, Infinity, -Infinity, 1.5, 4, Number.MAX_SAFE_INTEGER].map(defeated =>
        ({ id: FIRST_QUEST_ID, status: 'active', defeated }))
    ];
    for (const input of badLegacy) expect(createActIQuestLedger(input)).toBeNull();
    const full = createActIQuestLedger(freshQuest())!;
    const invalids = [
      (l: QuestLedger) => { (l.quests[1] as { status: string }).status = 'completed'; },
      (l: QuestLedger) => { (l.quests[1].counters as Record<string, number>)[ACT_I_MILESTONES[0].objectiveId] = NaN; },
      (l: QuestLedger) => { (l.quests[1].counters as Record<string, number>)[ACT_I_MILESTONES[0].objectiveId] = Infinity; },
      (l: QuestLedger) => { (l.quests[1].counters as Record<string, number>)[ACT_I_MILESTONES[0].objectiveId] = -1; },
      (l: QuestLedger) => { (l.quests[0] as { rewardClaimed: boolean }).rewardClaimed = true; },
      (l: QuestLedger) => { (l.quests[1] as { questId: string }).questId = '__proto__'; },
      (l: QuestLedger) => { (l.quests[1] as unknown as { processedEventIds: string[] }).processedEventIds = ['x', 'x']; },
      (l: QuestLedger) => { (l.quests[1] as unknown as { processedEventIds: string[] }).processedEventIds = ['bad id']; }
    ];
    for (const corrupt of invalids) {
      const candidate = parsed(full);
      corrupt(candidate);
      expect(validateQuestLedger(ACT_I_QUEST_CATALOG, candidate)).toBe(false);
      expect(createActIQuestLedger(candidate)).toBeNull();
    }
    const before = parsed(full);
    const active = acceptQuest(ACT_I_QUEST_CATALOG,
      createActIQuestLedger({ id: FIRST_QUEST_ID, status: 'completed', defeated: 3 })!,
      ACT_I_STORY_QUEST_IDS[0])!.ledger;
    for (const bad of [0, -1, 1.5, NaN, Infinity, 100000000000]) {
      expect(advanceObjective(ACT_I_QUEST_CATALOG, active, ACT_I_STORY_QUEST_IDS[0],
        ACT_I_MILESTONES[0].eventId, 'valid_occurrence', bad)).toBeNull();
    }
    for (const occurrence of ['', '__proto__', 'bad id', 'x'.repeat(200)]) {
      expect(advanceObjective(ACT_I_QUEST_CATALOG, active, ACT_I_STORY_QUEST_IDS[0],
        ACT_I_MILESTONES[0].eventId, occurrence)).toBeNull();
    }
    expect(full).toEqual(before);
  });

  it('uses only serializable, language-independent identifiers and does not mutate frozen snapshots', () => {
    const catalog = freezeDeep(ACT_I_QUEST_CATALOG);
    const before = parsed(catalog);
    const old = freezeDeep({ id: FIRST_QUEST_ID, status: 'completed', defeated: 3 } as QuestProgress);
    const ledger = freezeDeep(createActIQuestLedger(old)!);
    expect(validateQuestCatalog(catalog)).toBe(true);
    const next = acceptQuest(catalog, ledger, expectedIds[0])!;
    expect(next.ledger).not.toBe(ledger);
    expect(next.ledger.quests).not.toBe(ledger.quests);
    expect(ledger.quests[1].status).toBe('available');
    expect(next.ledger.quests[1].status).toBe('active');
    expect(catalog).toEqual(before);
    expect(JSON.stringify(ACT_I_MILESTONES)).not.toMatch(/xCoord|yCoord|worldSeed|position/i);
    expect(JSON.stringify(ACT_I_EVENT_CONTRACTS)).not.toMatch(/coordinate|localizationText/i);
    expect(JSON.parse(JSON.stringify(next.ledger))).toEqual(next.ledger);
  });
});
