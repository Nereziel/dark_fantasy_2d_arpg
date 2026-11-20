/**
 * Aether & Ruin — Act I quest narrative and integration contracts (Prompt 21).
 * Pure data on top of the existing quest engine; no gameplay, reward or save authority.
 * All presentation strings are stable i18n keys, not translated copy.
 * GPL-3.0-only.
 */
import {
  FIRST_QUEST_ID, WARDEN_ID, validQuest, type QuestProgress
} from './firstQuest';
import { STARTER_QUEST_CATALOG, firstQuestLedger } from './starterQuestRegistry';
import {
  createQuestLedger, validateQuestCatalog, validateQuestLedger,
  type DialogueNode, type DialogueOption, type QuestCatalog, type QuestCategory,
  type QuestDefinition, type QuestLedger, type QuestRuntimeState
} from './questDialogue';

/** Order is canonical: one completed milestone unlocks the next. */
export const ACT_I_STORY_QUEST_IDS = [
  'trail_of_black_ash',
  'blighted_pack',
  'forgotten_graves',
  'morrow_gravebound',
  'seal_of_rot',
  'crypt_descent',
  'crypt_lord_fallen',
  'vesnas_report'
] as const;

export type ActIStoryQuestId = (typeof ACT_I_STORY_QUEST_IDS)[number];
export const ACT_I_NEXT_CHAPTER_FLAG_ID = 'act_ii_unlocked' as const;
export type ActIRegionHint = 'wilderness' | 'crypt' | 'town';
export type ActIEventTrigger =
  | 'exploration' | 'enemy_death' | 'evidence_interaction'
  | 'zone_entry' | 'npc_conversation';

/**
 * These are scene/event HANDOFF hints, never world coordinates or a world snapshot.
 * A new named miniboss Morrow is intentionally a future integrator spawn; the
 * crypt_lord enemy and warden_vesna NPC are already defined in the game.
 */
interface StoryBeat {
  readonly questId: ActIStoryQuestId;
  readonly prerequisiteQuestId: string;
  readonly category: QuestCategory;
  readonly objectiveId: string;
  readonly eventId: string;
  readonly targetCount: number;
  readonly markerId: string;
  readonly regionHint: ActIRegionHint;
  readonly npcTurnInHint: typeof WARDEN_ID | null;
  readonly trigger: ActIEventTrigger;
  readonly targetIdHint: string | null;
  readonly rewardGold: number;
  readonly rewardXp: number;
}

const STORY_BEATS: readonly StoryBeat[] = [
  {
    questId: 'trail_of_black_ash', prerequisiteQuestId: FIRST_QUEST_ID,
    category: 'investigation', objectiveId: 'traced', eventId: 'corruption_traced',
    targetCount: 1, markerId: 'corruption_site', regionHint: 'wilderness',
    npcTurnInHint: null, trigger: 'exploration', targetIdHint: 'corruption_site',
    rewardGold: 45, rewardXp: 60
  },
  {
    questId: 'blighted_pack', prerequisiteQuestId: 'trail_of_black_ash',
    category: 'main', objectiveId: 'beasts', eventId: 'infected_beast_slain',
    targetCount: 3, markerId: 'infected_beast_den', regionHint: 'wilderness',
    npcTurnInHint: null, trigger: 'enemy_death', targetIdHint: 'corruptedBoar',
    rewardGold: 80, rewardXp: 110
  },
  {
    questId: 'forgotten_graves', prerequisiteQuestId: 'blighted_pack',
    category: 'exploration', objectiveId: 'discovered', eventId: 'graveyard_found',
    targetCount: 1, markerId: 'abandoned_graveyard', regionHint: 'wilderness',
    npcTurnInHint: null, trigger: 'exploration', targetIdHint: 'abandoned_graveyard',
    rewardGold: 65, rewardXp: 95
  },
  {
    questId: 'morrow_gravebound', prerequisiteQuestId: 'forgotten_graves',
    category: 'boss', objectiveId: 'morrow', eventId: 'morrow_gravebound_slain',
    targetCount: 1, markerId: 'gravebound_morrow', regionHint: 'wilderness',
    npcTurnInHint: null, trigger: 'enemy_death', targetIdHint: 'morrow_gravebound',
    rewardGold: 180, rewardXp: 210
  },
  {
    questId: 'seal_of_rot', prerequisiteQuestId: 'morrow_gravebound',
    category: 'investigation', objectiveId: 'proof', eventId: 'crypt_evidence_secured',
    targetCount: 1, markerId: 'crypt_evidence', regionHint: 'wilderness',
    npcTurnInHint: null, trigger: 'evidence_interaction', targetIdHint: 'crypt_evidence',
    rewardGold: 75, rewardXp: 115
  },
  {
    questId: 'crypt_descent', prerequisiteQuestId: 'seal_of_rot',
    category: 'dungeon', objectiveId: 'entered', eventId: 'crypt_gate_entered',
    targetCount: 1, markerId: 'crypt_entrance', regionHint: 'crypt',
    npcTurnInHint: null, trigger: 'zone_entry', targetIdHint: 'crypt',
    rewardGold: 110, rewardXp: 150
  },
  {
    questId: 'crypt_lord_fallen', prerequisiteQuestId: 'crypt_descent',
    category: 'boss', objectiveId: 'defeated', eventId: 'crypt_lord_slain',
    targetCount: 1, markerId: 'crypt_boss_chamber', regionHint: 'crypt',
    npcTurnInHint: null, trigger: 'enemy_death', targetIdHint: 'crypt_lord',
    rewardGold: 360, rewardXp: 425
  },
  {
    questId: 'vesnas_report', prerequisiteQuestId: 'crypt_lord_fallen',
    category: 'main', objectiveId: 'reported', eventId: 'act_i_report_delivered',
    targetCount: 1, markerId: WARDEN_ID, regionHint: 'town',
    npcTurnInHint: WARDEN_ID, trigger: 'npc_conversation', targetIdHint: WARDEN_ID,
    rewardGold: 280, rewardXp: 300
  }
];

/** Quest milestones are presentation/progression data, never executable transitions. */
export interface ActIMilestone {
  readonly questId: ActIStoryQuestId;
  readonly prerequisiteQuestId: string;
  readonly objectiveId: string;
  readonly eventId: string;
  readonly targetCount: number;
  readonly markerId: string;
  readonly regionHint: ActIRegionHint;
  /**
   * null = integrator may atomically finalize on a verified event;
   * warden_vesna = player returns to Vesna for the final turn-in.
   * Generic turnInQuest is ALWAYS the sole reward-plan producer.
   */
  readonly npcTurnInHint: typeof WARDEN_ID | null;
  readonly dialogueNodeId: string;
  /**
   * An integration-only campaign flag, set *after* the last turn-in commits.
   * The generic quest engine has no flag action. Never set it in this module.
   */
  readonly unlockFlagId: typeof ACT_I_NEXT_CHAPTER_FLAG_ID | null;
}

/**
 * Event type (eventId) and concrete occurrence identity (occurrenceId) differ.
 * The integrator must produce a new valid occurrenceId from an authoritative
 * world interaction, enemy death, zone entry or NPC conversation. Do not pass
 * a shared static ID or actor type as the occurrenceId. Unique IDs must stay
 * unique across reloads; questDialogue persists them in processedEventIds.
 */
export interface ActIEventContract {
  readonly questId: ActIStoryQuestId;
  readonly eventId: string;
  readonly objectiveId: string;
  readonly markerId: string;
  readonly regionHint: ActIRegionHint;
  readonly npcTurnInHint: typeof WARDEN_ID | null;
  readonly trigger: ActIEventTrigger;
  readonly targetIdHint: string | null;
  readonly occurrenceId: Readonly<{
    producer: 'integrator';
    uniqueness: 'concrete_occurrence';
    replay: 'persist_in_ledger';
  }>;
}

export const ACT_I_MILESTONES: readonly ActIMilestone[] = STORY_BEATS.map(beat => ({
  questId: beat.questId,
  prerequisiteQuestId: beat.prerequisiteQuestId,
  objectiveId: beat.objectiveId,
  eventId: beat.eventId,
  targetCount: beat.targetCount,
  markerId: beat.markerId,
  regionHint: beat.regionHint,
  npcTurnInHint: beat.npcTurnInHint,
  dialogueNodeId: `vesna.act1.${beat.questId}`,
  unlockFlagId: beat.questId === 'vesnas_report' ? ACT_I_NEXT_CHAPTER_FLAG_ID : null
}));

const OCCURRENCE_ID_POLICY = Object.freeze({
  producer: 'integrator',
  uniqueness: 'concrete_occurrence',
  replay: 'persist_in_ledger'
} as const);

export const ACT_I_EVENT_CONTRACTS: readonly ActIEventContract[] = STORY_BEATS.map(beat => ({
  questId: beat.questId,
  eventId: beat.eventId,
  objectiveId: beat.objectiveId,
  markerId: beat.markerId,
  regionHint: beat.regionHint,
  npcTurnInHint: beat.npcTurnInHint,
  trigger: beat.trigger,
  targetIdHint: beat.targetIdHint,
  occurrenceId: OCCURRENCE_ID_POLICY
}));

/** Data-only lookup. Unknown, malformed and forged event IDs never match. */
export function getActIEventContract(
  questId: unknown, eventId: unknown
): ActIEventContract | undefined {
  if (typeof questId !== 'string' || typeof eventId !== 'string') return undefined;
  return ACT_I_EVENT_CONTRACTS.find(
    contract => contract.questId === questId && contract.eventId === eventId
  );
}

function copyStarterNode(node: DialogueNode): DialogueNode {
  return {
    ...node,
    ...(node.conditions ? { conditions: node.conditions.map(condition => ({ ...condition })) } : {}),
    options: node.options.map(option => ({
      ...option,
      ...(option.conditions ? { conditions: option.conditions.map(condition => ({ ...condition })) } : {}),
      ...(option.action ? { action: { ...option.action } } : {})
    }))
  };
}

const QUESTS: QuestDefinition[] = [
  ...STARTER_QUEST_CATALOG.quests.map(quest => ({
    ...quest,
    prerequisites: [...quest.prerequisites],
    objectives: quest.objectives.map(objective => ({ ...objective })),
    reward: { ...quest.reward }
  })),
  ...STORY_BEATS.map(beat => {
    const keyPrefix = `quest.actI.${beat.questId}`;
    return {
      id: beat.questId,
      category: beat.category,
      titleKey: `${keyPrefix}.title`,
      descriptionKey: `${keyPrefix}.description`,
      objectiveKey: `${keyPrefix}.objective`,
      prerequisites: [beat.prerequisiteQuestId],
      objectives: [{
        id: beat.objectiveId, eventId: beat.eventId, targetCount: beat.targetCount
      }],
      reward: { gold: beat.rewardGold, xp: beat.rewardXp }
    };
  })
];

/** Only add a link to the old root; preserve its old choices and details node. */
const starterDialogue: DialogueNode[] = STARTER_QUEST_CATALOG.dialogueNodes.map(node => {
  const copy = copyStarterNode(node);
  if (copy.id === 'vesna.root') {
    copy.options.push({
      id: 'actI',
      textKey: 'dialogue.vesna.actI.open',
      conditions: [{ type: 'questStatus', questId: FIRST_QUEST_ID, status: 'completed' }],
      nextNodeId: 'vesna.act1.hub',
      whenLocked: 'hidden'
    });
  }
  return copy;
});

/**
 * Existing dialogue evaluator handles AND-only predicates, so represent
 * available/active/ready as separate options rather than inventing an OR DSL.
 * 8 quests × 3 options = the engine's allowed 24 options per node.
 */
const hubOptions: DialogueOption[] = STORY_BEATS.flatMap(beat => {
  const questId = beat.questId;
  const nodeId = `vesna.act1.${questId}`;
  const prefix = `dialogue.vesna.actI.${questId}`;
  return [
    {
      id: `${questId}_offer`, textKey: `${prefix}.offer`,
      conditions: [{ type: 'questAvailable', questId }],
      nextNodeId: nodeId
    },
    {
      id: `${questId}_active`, textKey: `${prefix}.active`,
      conditions: [{ type: 'questStatus', questId, status: 'active' }],
      nextNodeId: nodeId
    },
    {
      id: `${questId}_ready`, textKey: `${prefix}.ready`,
      conditions: [{ type: 'questStatus', questId, status: 'ready' }],
      nextNodeId: nodeId
    }
  ];
});

const storyDialogue: DialogueNode[] = [
  {
    id: 'vesna.act1.hub', npcId: WARDEN_ID,
    textKey: 'dialogue.vesna.actI.hub',
    options: hubOptions
  },
  ...STORY_BEATS.map(beat => ({
    id: `vesna.act1.${beat.questId}`,
    npcId: WARDEN_ID,
    textKey: `dialogue.vesna.actI.${beat.questId}.briefing`,
    options: [
      {
        id: 'back', textKey: 'dialogue.vesna.actI.back',
        nextNodeId: 'vesna.act1.hub'
      },
      {
        id: 'accept', textKey: `quest.actI.${beat.questId}.accept`,
        action: { type: 'acceptQuest' as const, questId: beat.questId },
        whenLocked: 'hidden' as const
      },
      {
        id: 'turnIn', textKey: `quest.actI.${beat.questId}.turnIn`,
        action: { type: 'turnInQuest' as const, questId: beat.questId },
        whenLocked: 'hidden' as const
      }
    ]
  }))
];

/**
 * Starter catalog retained as its first quest and two original Vesna nodes.
 * Generic QuestCatalog, QuestLedger, and rewardPlan remain the sole authority.
 */
export const ACT_I_QUEST_CATALOG: QuestCatalog = {
  quests: QUESTS,
  dialogueNodes: [...starterDialogue, ...storyDialogue]
};

if (!validateQuestCatalog(ACT_I_QUEST_CATALOG)) {
  throw new Error('Invalid Act I quest catalog');
}

function copyState(state: QuestRuntimeState): QuestRuntimeState {
  return {
    questId: state.questId,
    status: state.status,
    counters: { ...state.counters },
    processedEventIds: [...state.processedEventIds],
    rewardClaimed: state.rewardClaimed
  };
}

/**
 * Pure in-memory expansion of legacy QuestProgress or the single-quest ledger.
 * Accepts an already-valid full ledger for safe JSON rehydration. Corrupted or
 * partial ledgers are never silently reset (that could re-enable rewards).
 *
 * NO SAVE FORMAT CHANGE: the coordinator must version character-only save and
 * atomically persist the resulting ledger together with claimed rewards.
 */
export function createActIQuestLedger(source: QuestProgress | QuestLedger | unknown): QuestLedger | null {
  if (validateQuestLedger(ACT_I_QUEST_CATALOG, source)) {
    return { quests: source.quests.map(copyState) };
  }

  let previous: QuestLedger | null = null;
  if (validateQuestLedger(STARTER_QUEST_CATALOG, source)) {
    previous = source;
  } else if (validQuest(source)) {
    previous = firstQuestLedger(source);
  }
  if (!previous) return null;

  const baseline = createQuestLedger(ACT_I_QUEST_CATALOG);
  if (!baseline || previous.quests.length !== 1 || previous.quests[0].questId !== FIRST_QUEST_ID) {
    return null;
  }
  const expanded: QuestLedger = {
    quests: baseline.quests.map(entry =>
      entry.questId === FIRST_QUEST_ID ? copyState(previous.quests[0]) : copyState(entry)
    )
  };
  return validateQuestLedger(ACT_I_QUEST_CATALOG, expanded) ? expanded : null;
}
