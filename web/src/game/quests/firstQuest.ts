/** Campaign IDs are stable and language-independent. */
export const FIRST_QUEST_ID = 'ashes_at_gate' as const;
export const QUEST_REQUIRED_KILLS = 3;
export const QUEST_REWARD_GOLD = 150;
export const QUEST_REWARD_XP = 100;
export const WARDEN_ID = 'warden_vesna' as const;

export type QuestStatus = 'available' | 'active' | 'ready' | 'completed';
export interface QuestProgress {
  id: typeof FIRST_QUEST_ID;
  status: QuestStatus;
  defeated: number;
}

export const freshQuest = (): QuestProgress => ({
  id: FIRST_QUEST_ID,
  status: 'available',
  defeated: 0
});

export function validQuest(value: unknown): value is QuestProgress {
  if (!value || typeof value !== 'object') return false;
  const q = value as Partial<QuestProgress>;
  if (q.id !== FIRST_QUEST_ID || !Number.isInteger(q.defeated)
    || (q.defeated ?? -1) < 0 || (q.defeated ?? 4) > QUEST_REQUIRED_KILLS) return false;
  switch (q.status) {
    case 'available': return q.defeated === 0;
    case 'active': return q.defeated !== undefined && q.defeated < QUEST_REQUIRED_KILLS;
    case 'ready':
    case 'completed': return q.defeated === QUEST_REQUIRED_KILLS;
    default: return false;
  }
}
