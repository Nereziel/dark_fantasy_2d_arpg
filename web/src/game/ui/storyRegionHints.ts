/** Non-spoiler directions for the *currently active* Act I objective.
 * These are deliberately broad narrative regions, never procedural
 * coordinates, a hidden map marker, or a navigation command.
 */
import type { ActIStoryQuestId } from '../quests/actIQuestChain';

const ACTIVE_REGION_HINTS: Readonly<Partial<Record<ActIStoryQuestId, string>>> =
  Object.freeze({
    trail_of_black_ash: 'quest.actI.regionTrail',
    blighted_pack: 'quest.actI.regionBoars',
    forgotten_graves: 'quest.actI.regionGraves',
    morrow_gravebound: 'quest.actI.regionMorrow',
    seal_of_rot: 'quest.actI.regionSeal',
    crypt_descent: 'quest.actI.regionCrypt',
    vesnas_report: 'quest.actI.regionReport'
  });

/** No future-quest hints, even when called with forged/unknown IDs. */
export function activeStoryRegionHint(questId: unknown, status: unknown): string | null {
  if (status !== 'active' || typeof questId !== 'string') return null;
  return Object.hasOwn(ACTIVE_REGION_HINTS, questId)
    ? ACTIVE_REGION_HINTS[questId as ActIStoryQuestId] ?? null : null;
}
