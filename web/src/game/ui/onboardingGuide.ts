/** Optional first-play guidance; no quest, world, simulation or save authority.
 * Progress persists only as browser-local presentation preferences per hero.
 * GPL-3.0-only.
 */
import type { GameEvent } from '../core/types';
import type { QuestStatus } from '../quests/firstQuest';
import type { GameSnapshot } from '../core/types';
import { ACT_I_MILESTONES, ACT_I_STORY_QUEST_IDS, type ActIStoryQuestId } from '../quests/actIQuestChain';
import { xpRequiredForLevel } from '../progression/progressionRules';

export type OnboardingStep =
  | 'warden' | 'move' | 'attack' | 'loot' | 'equip'
  | 'objective' | 'return' | 'followup' | 'dungeon'
  | 'story' | 'storyReturn' | 'talent';

export interface OnboardingEvidence {
  moved: boolean;
  attacked: boolean;
  pickedUp: boolean;
  equipped: boolean;
}
export interface OnboardingProgress {
  version: 1;
  dismissed: boolean;
  /** Manually reviewed skill tip index, independent of quest progression. */
  tip: number;
  evidence: OnboardingEvidence;
}
export type OnboardingContext = {
  questStatus: QuestStatus;
  zone: 'wilderness' | 'crypt';
  /** Only a quest currently active/ready in the authoritative ledger. */
  storyQuestId?: ActIStoryQuestId | null;
  storyQuestStatus?: 'active' | 'ready' | null;
  talentPoints?: number;
  level?: number;
  xp?: number;
  xpRequired?: number;
};

/**
 * The UI gets only existing campaign ledger state. Never derive a marker
 * or next quest from the static story order or undiscovered world data.
 */
export function onboardingContextFromSnapshot(
  view: Pick<GameSnapshot,
    'quest' | 'zone' | 'questLedger' | 'level' | 'xp' | 'talentPoints'>
): OnboardingContext {
  const story = view.quest.status === 'completed'
    ? view.questLedger?.quests.find(entry =>
      (entry.status === 'active' || entry.status === 'ready')
      && ACT_I_STORY_QUEST_IDS.some(id => id === entry.questId))
    : undefined;
  const level = Number.isSafeInteger(view.level) && view.level >= 1 && view.level <= 100
    ? view.level : 1;
  const xpRequired = xpRequiredForLevel(level);
  const xp = Number.isSafeInteger(view.xp) && view.xp >= 0
    && (xpRequired === 0 ? view.xp === 0 : view.xp < xpRequired) ? view.xp : 0;
  return {
    questStatus: view.quest.status,
    zone: view.zone,
    storyQuestId: story?.questId as ActIStoryQuestId | undefined,
    storyQuestStatus: story?.status as 'active' | 'ready' | undefined,
    talentPoints: typeof view.talentPoints === 'number'
      && Number.isSafeInteger(view.talentPoints) && view.talentPoints >= 0
      ? view.talentPoints : 0,
    level, xp, xpRequired
  };
}
const SEQUENCE: readonly (keyof OnboardingEvidence)[] = [
  'moved', 'attacked', 'pickedUp', 'equipped'
];
const HINTS = ['move', 'attack', 'loot', 'equip', 'objective'] as const;
const PREFIX = 'aether-ruin-onboarding-v1:';

export function freshOnboarding(): OnboardingProgress {
  return {
    version: 1, dismissed: false, tip: 0,
    evidence: { moved: false, attacked: false, pickedUp: false, equipped: false }
  };
}

export function onboardingStorageKey(characterId: string): string | null {
  if (typeof characterId !== 'string'
    || !/^[A-Za-z0-9_-]{1,128}$/.test(characterId)) return null;
  return PREFIX + characterId;
}

export function parseOnboarding(raw: string | null): OnboardingProgress {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return freshOnboarding();
    const candidate = value as Partial<OnboardingProgress>;
    if (candidate.version !== 1 || typeof candidate.dismissed !== 'boolean'
      || !Number.isInteger(candidate.tip) || candidate.tip === undefined
      || candidate.tip < 0 || candidate.tip > 4
      || !candidate.evidence || typeof candidate.evidence !== 'object'
      || Array.isArray(candidate.evidence)
      || SEQUENCE.some(name => typeof candidate.evidence?.[name] !== 'boolean')) {
      return freshOnboarding();
    }
    return {
      version: 1, dismissed: candidate.dismissed, tip: candidate.tip,
      evidence: {
        moved: candidate.evidence.moved,
        attacked: candidate.evidence.attacked,
        pickedUp: candidate.evidence.pickedUp,
        equipped: candidate.evidence.equipped
      }
    };
  } catch {
    return freshOnboarding();
  }
}

function tipIndex(progress: OnboardingProgress): number {
  let index = Math.max(0, Math.min(4, progress.tip));
  while (index < SEQUENCE.length && progress.evidence[SEQUENCE[index]!]) index++;
  return index;
}

/** Only an explicitly NPC-gated, currently ready quest warrants a Vesna return.
 * Automatic exploration, combat and crypt milestones do not require dialogue.
 */
export function storyNeedsWardenTurnIn(questId: unknown): boolean {
  return typeof questId === 'string' && ACT_I_MILESTONES.some(
    beat => beat.questId === questId && beat.npcTurnInHint !== null
  );
}

/** Quest status always takes precedence; never leak a crypt hint before entry. */
export function getOnboardingStep(
  progress: OnboardingProgress, context: OnboardingContext
): OnboardingStep {
  if (context.zone === 'crypt') return 'dungeon';
  if (context.questStatus === 'available') return 'warden';
  if (context.questStatus === 'ready') return 'return';
  if (Number.isSafeInteger(context.talentPoints) && (context.talentPoints ?? 0) > 0)
    return 'talent';
  if (context.questStatus === 'completed') {
    if (context.storyQuestId && context.storyQuestStatus === 'ready')
      return storyNeedsWardenTurnIn(context.storyQuestId) ? 'storyReturn' : 'story';
    if (context.storyQuestId && context.storyQuestStatus === 'active') return 'story';
    return 'followup';
  }
  return HINTS[tipIndex(progress)] ?? 'objective';
}

export function nextOnboardingTip(
  progress: OnboardingProgress, context: OnboardingContext
): OnboardingProgress {
  if (context.questStatus !== 'active' || context.zone !== 'wilderness') return progress;
  const current = tipIndex(progress);
  if (current >= 4) return progress;
  return { ...progress, tip: current + 1 };
}

export function skipOnboarding(progress: OnboardingProgress): OnboardingProgress {
  return progress.dismissed ? progress : { ...progress, dismissed: true };
}
export function resumeOnboarding(progress: OnboardingProgress): OnboardingProgress {
  return !progress.dismissed ? progress : { ...progress, dismissed: false };
}

function record(progress: OnboardingProgress, key: keyof OnboardingEvidence): OnboardingProgress {
  if (progress.evidence[key]) return progress;
  return { ...progress, evidence: { ...progress.evidence, [key]: true } };
}

/** Only authoritative player events count, never speculative UI clicks. */
export function observeOnboardingEvent(
  progress: OnboardingProgress, event: GameEvent, playerId: string
): OnboardingProgress {
  if (event.type === 'pickup') return record(progress, 'pickedUp');
  if (event.type === 'cast') return record(progress, 'attacked');
  if (event.type === 'damageResolved' && event.sourceId === playerId
    && event.targetId !== playerId) return record(progress, 'attacked');
  return progress;
}

/** Only actual motion/equipment in a snapshot count; no world mutation. */
export function observeOnboardingSnapshot(
  progress: OnboardingProgress,
  view: { player: { x: number; y: number }; equipment: unknown },
  origin: { x: number; y: number },
  /** Optional baseline prevents starter gear being mistaken for an equip action. */
  initialEquipmentIds: readonly string[] = []
): OnboardingProgress {
  let next = progress;
  if (!next.evidence.moved && Number.isFinite(origin.x) && Number.isFinite(origin.y)
    && Number.isFinite(view.player.x) && Number.isFinite(view.player.y)
    && Math.hypot(view.player.x - origin.x, view.player.y - origin.y) >= 14) {
    next = record(next, 'moved');
  }
  if (!next.evidence.equipped && view.equipment && typeof view.equipment === 'object'
    && !Array.isArray(view.equipment)) {
    const equippedIds = Object.values(view.equipment)
      .filter((item): item is { id: string } =>
        !!item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string')
      .map(item => item.id);
    if (equippedIds.some(id => !initialEquipmentIds.includes(id))) {
      next = record(next, 'equipped');
    }
  }
  return next;
}
