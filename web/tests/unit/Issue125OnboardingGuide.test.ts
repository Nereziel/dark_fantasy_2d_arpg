import { describe, expect, it } from 'vitest';
import {
  freshOnboarding, parseOnboarding, onboardingStorageKey,
  getOnboardingStep, observeOnboardingEvent, observeOnboardingSnapshot,
  nextOnboardingTip, skipOnboarding, resumeOnboarding
} from '../../src/game/ui/onboardingGuide';
import type { GameEvent, GameSnapshot } from '../../src/game/core/types';

const current = (status: 'available' | 'active' | 'ready' | 'completed' = 'active',
  zone: 'wilderness' | 'crypt' = 'wilderness') => ({ questStatus: status, zone });

describe('Issue #125: first-play guide is a read-only projection of the tutorial and quest', () => {
  it('offers Vesna only while quest is available, without revealing dungeon targets', () => {
    const p = freshOnboarding();
    expect(getOnboardingStep(p, current('available'))).toBe('warden');
    expect(getOnboardingStep(p, current('active'))).toBe('move');
    expect(getOnboardingStep(p, current('ready'))).toBe('return');
    expect(getOnboardingStep(p, current('completed'))).toBe('followup');
    expect(getOnboardingStep(p, current('completed', 'crypt'))).toBe('dungeon');
  });

  it('tracks actual movement, hero attacks, loot pickup and equipment without changing quest', () => {
    const p = freshOnboarding();
    const noMove = observeOnboardingSnapshot(p, {
      player: { x: 12, y: 12 }, equipment: {}
    }, { x: 10, y: 10 });
    expect(noMove).toBe(p);
    const moved = observeOnboardingSnapshot(p, {
      player: { x: 32, y: 12 }, equipment: {}
    }, { x: 10, y: 10 });
    expect(getOnboardingStep(moved, current())).toBe('attack');
    expect(getOnboardingStep(p, current())).toBe('move');

    const enemyHit: GameEvent = {
      type: 'damageResolved', sourceId: 'enemy-1', targetId: 'hero',
      damageType: 'physical', damage: 5, absorbed: 0, critical: false,
      dodged: false, blocked: false
    };
    expect(observeOnboardingEvent(moved, enemyHit, 'hero')).toBe(moved);
    const heroHit = { ...enemyHit, sourceId: 'hero', targetId: 'enemy-1' };
    const attacked = observeOnboardingEvent(moved, heroHit, 'hero');
    expect(getOnboardingStep(attacked, current())).toBe('loot');
    const picked = observeOnboardingEvent(attacked, { type: 'pickup', id: 'loot-1' }, 'hero');
    expect(getOnboardingStep(picked, current())).toBe('equip');
    const equipped = observeOnboardingSnapshot(picked, {
      player: { x: 32, y: 12 }, equipment: { MAIN_HAND: { id: 'sword' } }
    }, { x: 10, y: 10 });
    expect(getOnboardingStep(equipped, current())).toBe('objective');
    expect(getOnboardingStep(equipped, current('ready'))).toBe('return');
  });

  it('allows nonblocking Next tip without manufacturing game events or quest completion', () => {
    const p = freshOnboarding();
    const moved = nextOnboardingTip(p, current('active'));
    expect(getOnboardingStep(moved, current('active'))).toBe('attack');
    expect(getOnboardingStep(moved, current('available'))).toBe('warden');
    expect(getOnboardingStep(moved, current('ready'))).toBe('return');
    expect(moved.tip).toBe(1);
    const after = Array.from({ length: 30 }).reduce(
      progress => nextOnboardingTip(progress, current('active')), p
    );
    expect(after.tip).toBe(4);
    expect(getOnboardingStep(after, current('active'))).toBe('objective');
    expect(p.tip).toBe(0);
  });

  it('skips and resumes hints per character, and validates persisted data strictly', () => {
    const keyA = onboardingStorageKey('hero-aaa');
    const keyB = onboardingStorageKey('hero-bbb');
    expect(keyA).not.toBe(keyB);
    expect(onboardingStorageKey('../invalid id')).toBeNull();
    const skipped = skipOnboarding(freshOnboarding());
    expect(skipped.dismissed).toBe(true);
    expect(resumeOnboarding(skipped).dismissed).toBe(false);
    expect(parseOnboarding(JSON.stringify(skipped))).toEqual(skipped);
    for (const invalid of ['{', 'null', '{}', '[]',
      JSON.stringify({ ...skipped, version: 99 }),
      JSON.stringify({ ...skipped, tip: 999 }),
      JSON.stringify({ ...skipped, evidence: { moved: true } }),
      JSON.stringify({ ...skipped, dismissed: 'yes' })]) {
      expect(parseOnboarding(invalid)).toEqual(freshOnboarding());
    }
  });

  it('does not treat enemy casts or unrelated pickups as proof of player action', () => {
    const p = freshOnboarding();
    expect(observeOnboardingEvent(p, {
      type: 'enemyAttack', enemyId: 'enemy-1', hit: true
    }, 'hero')).toBe(p);
    expect(observeOnboardingEvent(p, {
      type: 'cast', skillId: 'fireball', x: 0, y: 0
    }, 'hero').evidence.attacked).toBe(true);
    const next = observeOnboardingEvent(p, { type: 'pickup', id: 'loot-1' }, 'hero');
    expect(next.evidence.pickedUp).toBe(true);
    expect(next.evidence.attacked).toBe(false);
  });
  it('starter equipment alone is not credited as an equipment tutorial action', () => {
    const p = freshOnboarding();
    const starter = observeOnboardingSnapshot(p, {
      player: { x: 20, y: 20 },
      equipment: { MAIN_HAND: { id: 'starter-sword' } }
    }, { x: 20, y: 20 }, ['starter-sword']);
    expect(starter).toBe(p);
    const changed = observeOnboardingSnapshot(starter, {
      player: { x: 20, y: 20 },
      equipment: { MAIN_HAND: { id: 'new-sword' } }
    }, { x: 20, y: 20 }, ['starter-sword']);
    expect(changed.evidence.equipped).toBe(true);
  });

});
