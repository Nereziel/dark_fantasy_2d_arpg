// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/game/core/types';
import { planIsometricImpact } from '../../src/game/phaser/isometricImpactFeedback';
import { projectIsometric } from '../../src/game/phaser/isometricProjection';

const point = { x: 320, y: 480 };
const origin = { x: 1400, y: 100 };
const hit: Extract<GameEvent, { type: 'damageResolved' }> = {
  type: 'damageResolved', sourceId: 'hero', targetId: 'enemy',
  damageType: 'physical', damage: 47, absorbed: 0,
  critical: true, dodged: false, blocked: false
};
const preferences = { floatingCombatText: true, reducedMotion: false };

describe('Issue #210 isometric impact feedback', () => {
  it('projects upright text and flash at the real target, retaining actual damage and critical emphasis', () => {
    const cues = planIsometricImpact(hit, point, origin, preferences);
    const label = cues.find(cue => cue.type === 'floatText');
    expect(label).toMatchObject({ position: projectIsometric(point, 42, origin),
      content: { kind: 'damage', amount: 47 }, emphasis: 'critical', rise: 32 });
    expect(cues.find(cue => cue.type === 'impactFlash')?.position).toEqual(projectIsometric(point, 20, origin));
    expect(cues.some(cue => cue.type === 'particles')).toBe(true);
  });

  it('retains localized dodge and block messages, with no invented health damage', () => {
    const dodge = planIsometricImpact({ ...hit, damage: 0, dodged: true }, point, origin, preferences);
    expect(dodge).toHaveLength(1);
    expect(dodge[0]).toMatchObject({ type: 'floatText', content: { kind: 'message', key: 'combat.dodged' } });
    const blocked = planIsometricImpact({ ...hit, damage: 0, blocked: true }, point, origin, preferences);
    expect(blocked.find(cue => cue.type === 'floatText')).toMatchObject({
      content: { kind: 'message', key: 'combat.blocked' }
    });
    const shield = planIsometricImpact({ ...hit, damage: 0, absorbed: 25 }, point, origin, preferences);
    expect(shield.some(cue => cue.type === 'floatText')).toBe(false);
  });

  it('respects reduced motion and text preferences without hiding the hit flash', () => {
    const reduced = planIsometricImpact(hit, point, origin, { ...preferences, reducedMotion: true });
    expect(reduced.map(cue => cue.type)).toEqual(['impactFlash', 'floatText']);
    expect(reduced.find(cue => cue.type === 'floatText')).toMatchObject({ rise: 0 });
    const hidden = planIsometricImpact(hit, point, origin, { ...preferences, floatingCombatText: false });
    expect(hidden.some(cue => cue.type === 'floatText')).toBe(false);
    expect(hidden.some(cue => cue.type === 'impactFlash')).toBe(true);
  });

  it('rejects invalid or damage-free non-contact events without altering inputs', () => {
    expect(planIsometricImpact({ ...hit, damage: NaN }, point, origin, preferences)).toEqual([]);
    expect(planIsometricImpact(hit, { x: NaN, y: 0 }, origin, preferences)).toEqual([]);
    expect(planIsometricImpact({ ...hit, damage: 0 }, point, origin, preferences)).toEqual([]);
    expect(hit.damage).toBe(47);
    expect(point).toEqual({ x: 320, y: 480 });
  });
});
