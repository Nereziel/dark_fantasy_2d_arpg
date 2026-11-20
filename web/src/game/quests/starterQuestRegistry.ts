/** Integrator adapter for the current single-quest v9 character format.
 * Quest rules and dialogue transitions run through the generic Wave D engine.
 * When future quests require extra persistent records, version the save explicitly.
 * GPL-3.0-only.
 */
import {
  FIRST_QUEST_ID, WARDEN_ID, QUEST_REQUIRED_KILLS,
  QUEST_REWARD_GOLD, QUEST_REWARD_XP, validQuest, type QuestProgress
} from './firstQuest';
import {
  validateQuestCatalog, validateQuestLedger,
  type QuestCatalog, type QuestLedger
} from './questDialogue';

/** Stable IDs, language-independent conditions and presentation translation keys. */
export const STARTER_QUEST_CATALOG: QuestCatalog = {
  quests: [{
    id: FIRST_QUEST_ID,
    category: 'main',
    titleKey: 'quest.ashes.title',
    descriptionKey: 'quest.ashes.intro',
    objectiveKey: 'quest.ashes.objective',
    prerequisites: [],
    objectives: [{ id: 'defeated', eventId: 'enemy_defeated', targetCount: QUEST_REQUIRED_KILLS }],
    reward: { gold: QUEST_REWARD_GOLD, xp: QUEST_REWARD_XP }
  }],
  dialogueNodes: [
    {
      id: 'vesna.root', npcId: WARDEN_ID, textKey: 'dialogue.vesna.root',
      options: [
        {
          id: 'ask', textKey: 'dialogue.vesna.ask',
          nextNodeId: 'vesna.details'
        },
        {
          id: 'accept', textKey: 'quest.ashes.accept',
          action: { type: 'acceptQuest', questId: FIRST_QUEST_ID },
          whenLocked: 'disabled'
        },
        {
          id: 'turnIn', textKey: 'quest.ashes.turnIn',
          action: { type: 'turnInQuest', questId: FIRST_QUEST_ID },
          whenLocked: 'hidden'
        }
      ]
    },
    {
      id: 'vesna.details', npcId: WARDEN_ID, textKey: 'dialogue.vesna.details',
      options: [
        { id: 'back', textKey: 'dialogue.vesna.back', nextNodeId: 'vesna.root' },
        {
          id: 'accept', textKey: 'quest.ashes.accept',
          action: { type: 'acceptQuest', questId: FIRST_QUEST_ID },
          whenLocked: 'disabled'
        }
      ]
    }
  ]
};

if (!validateQuestCatalog(STARTER_QUEST_CATALOG)) {
  throw new Error('Invalid starter quest catalog');
}

/**
 * Adapt the one existing save-v9 quest rather than creating a second authority.
 * Event occurrence IDs are deliberately NOT persisted by the legacy DTO:
 * killed actors are already one-shot in authoritative combat, and count is 0..3.
 * Synthetic legacy IDs keep generic ledger validation satisfied. The first
 * quest completes permanently and rewards are impossible to reclaim after load.
 */
export function firstQuestLedger(quest: QuestProgress): QuestLedger | null {
  if (!validQuest(quest)) return null;
  const ledger: QuestLedger = {
    quests: [{
      questId: FIRST_QUEST_ID,
      status: quest.status,
      counters: { defeated: quest.defeated },
      processedEventIds: Array.from({ length: quest.defeated }, (_, index) => `legacy_${index + 1}`),
      rewardClaimed: quest.status === 'completed'
    }]
  };
  return validateQuestLedger(STARTER_QUEST_CATALOG, ledger) ? ledger : null;
}

/** Keep v9 character snapshots and existing HUD/quest journal contracts stable. */
export function firstQuestFromLedger(ledger: QuestLedger): QuestProgress | null {
  if (!validateQuestLedger(STARTER_QUEST_CATALOG, ledger)) return null;
  const state = ledger.quests[0];
  if (!state || state.questId !== FIRST_QUEST_ID || state.status === 'failed') return null;
  const quest: QuestProgress = {
    id: FIRST_QUEST_ID,
    status: state.status,
    defeated: state.counters.defeated ?? 0
  };
  return validQuest(quest) ? quest : null;
}
