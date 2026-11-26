// GPL-3.0-only — read-only NPC quest presentation, no gameplay authority.
import type { QuestCatalog, QuestLedger } from './questDialogue';

export function presentedNpcQuest(catalog: QuestCatalog, ledger: QuestLedger | null | undefined) {
  if (!ledger) return null;
  for (const status of ['ready', 'active', 'available'] as const) {
    for (const definition of catalog.quests) {
      const state = ledger.quests.find(q => q.questId === definition.id);
      if (state?.status !== status) continue;
      if (status === 'available' && !definition.prerequisites.every(id =>
        ledger.quests.some(q => q.questId === id && q.status === 'completed'))) continue;
      return { definition, state };
    }
  }
  return null;
}

export function questOfferMarker(status: string | undefined): string {
  return status === 'available' ? '!' : status === 'ready' ? '?' : '';
}
