import { describe, expect, it } from 'vitest';
import type { GameSnapshot } from '../../src/game/core/types';
import {
  freshOnboarding, getOnboardingStep, onboardingContextFromSnapshot,
  nextOnboardingTip, type OnboardingStep
} from '../../src/game/ui/onboardingGuide';

type Source = Pick<GameSnapshot,
  'zone' | 'quest' | 'questLedger' | 'level' | 'xp' | 'talentPoints'>;

function view(
  questStatus: GameSnapshot['quest']['status'],
  story?: { id: string; status: string },
  fields: Partial<Source> = {}
): Source {
  return {
    zone: 'wilderness',
    quest: { status: questStatus, defeated: questStatus === 'completed' ? 3 : 0 },
    questLedger: story ? {
      quests: [{ questId: story.id, status: story.status, counters: {},
        processedEventIds: [], rewardClaimed: false }]
    } : undefined,
    level: 2, xp: 20, talentPoints: 0,
    ...fields
  } as unknown as Source;
}

const step = (v: Source): OnboardingStep =>
  getOnboardingStep(freshOnboarding(), onboardingContextFromSnapshot(v));

describe('Issue #125 — Act I guidance honors active story and real progression', () => {
  it('replaces stale Vesna follow-up with the active, known story objective', () => {
    const current = onboardingContextFromSnapshot(view('completed',
      { id: 'trail_of_black_ash', status: 'active' }));
    expect(current.storyQuestId).toBe('trail_of_black_ash');
    expect(current.storyQuestStatus).toBe('active');
    expect(getOnboardingStep(freshOnboarding(), current)).toBe('story');
    expect(current.level).toBe(2);
    expect(current.xp).toBe(20);
    expect(current.xpRequired).toBe(170);
    expect(current.talentPoints).toBe(0);
  });

  it('recognizes a ready report to Vesna only from the authoritative story ledger', () => {
    expect(step(view('completed',
      { id: 'vesnas_report', status: 'ready' }))).toBe('storyReturn');
    expect(step(view('completed',
      { id: 'vesnas_report', status: 'active' }))).toBe('story');
    expect(step(view('completed',
      { id: 'vesnas_report', status: 'completed' }))).toBe('followup');
  });

  it('never tells players to report an automatically resolved wilderness objective to Vesna', () => {
    const automatic = onboardingContextFromSnapshot(view('completed',
      { id: 'trail_of_black_ash', status: 'ready' }));
    expect(getOnboardingStep(freshOnboarding(), automatic)).toBe('story');
    expect(step(view('completed',
      { id: 'blighted_pack', status: 'ready' }))).toBe('story');
    expect(step(view('completed',
      { id: 'vesnas_report', status: 'ready' }))).toBe('storyReturn');
  });

  it('does not expose undiscovered or unknown future quest names', () => {
    expect(step(view('completed'))).toBe('followup');
    expect(step(view('completed', { id: 'crypt_lord_fallen', status: 'available' })))
      .toBe('followup');
    expect(step(view('completed', { id: '__proto__', status: 'active' })))
      .toBe('followup');
    expect(step(view('completed', { id: 'secret_unreleased_quest', status: 'active' })))
      .toBe('followup');
    expect(step(view('available', { id: 'trail_of_black_ash', status: 'active' })))
      .toBe('warden');
  });

  it('prompts talents only for actually available points; does not award them', () => {
    const v = view('completed', { id: 'trail_of_black_ash', status: 'active' },
      { level: 5, xp: 42, talentPoints: 1 });
    const before = structuredClone(v);
    const ctx = onboardingContextFromSnapshot(v);
    expect(getOnboardingStep(freshOnboarding(), ctx)).toBe('talent');
    expect(ctx.talentPoints).toBe(1);
    expect(ctx.xpRequired).toBe(560);
    expect(v).toEqual(before);
    expect(step(view('completed', { id: 'trail_of_black_ash', status: 'active' },
      { level: 5, talentPoints: 0 }))).toBe('story');
  });

  it('preserves safety precedence for crypt and first quest return', () => {
    expect(step(view('completed', { id: 'crypt_lord_fallen', status: 'active' },
      { zone: 'crypt', talentPoints: 2 }))).toBe('dungeon');
    expect(step(view('ready', undefined, { talentPoints: 2 }))).toBe('return');
    expect(step(view('active'))).toBe('move');
    const progress = freshOnboarding();
    const context = onboardingContextFromSnapshot(view('completed',
      { id: 'trail_of_black_ash', status: 'active' }));
    expect(nextOnboardingTip(progress, context)).toBe(progress);
  });
});
