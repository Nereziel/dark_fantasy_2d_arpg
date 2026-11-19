import { describe, expect, it } from 'vitest';
import {
  planCombatVfx, type CombatVfxCue, type CombatVfxEvent
} from '../../src/game/phaser/combatVfxPlan';

const at = Object.freeze({ x: 120, y: 240 });
const impact = (extra: Partial<Extract<CombatVfxEvent, { type: 'impact' }>> = {}): CombatVfxEvent => ({
  type: 'impact', position: at, damage: 24, ...extra
});
const kinds = (event: CombatVfxEvent): string[] => planCombatVfx(event).map(cue => cue.type);
const cueOf = <T extends CombatVfxCue['type']>(
  cues: readonly CombatVfxCue[], type: T
): Extract<CombatVfxCue, { type: T }> | undefined =>
  cues.find((cue): cue is Extract<CombatVfxCue, { type: T }> => cue.type === type);

describe('Agent 09: passive, deterministic combat VFX plans', () => {
  it('describes a normal melee impact with damage but no critical or strong-hit feedback', () => {
    const cues = planCombatVfx(impact());
    expect(cues.map(cue => cue.type)).toEqual(['impactFlash', 'particles', 'weaponTrail', 'floatText']);
    expect(cueOf(cues, 'particles')).toMatchObject({ style: 'impact', poolKey: 'combat.particles' });
    expect(cueOf(cues, 'floatText')).toMatchObject({
      poolKey: 'combat.floatText', content: { kind: 'damage', amount: 24 }, emphasis: 'normal'
    });
    expect(cueOf(cues, 'screenShake')).toBeUndefined();
    expect(cueOf(cues, 'knockbackCue')).toBeUndefined();
  });

  it('makes critical hits distinct without embedding localized display strings', () => {
    const normal = planCombatVfx(impact());
    const critical = planCombatVfx(impact({ critical: true }));
    expect(cueOf(critical, 'floatText')).toMatchObject({
      content: { kind: 'damage', amount: 24 }, emphasis: 'critical'
    });
    const normalFlash = cueOf(normal, 'impactFlash');
    const criticalFlash = cueOf(critical, 'impactFlash');
    expect(normalFlash).toBeDefined();
    expect(criticalFlash).toBeDefined();
    expect(criticalFlash!.intensity).toBeGreaterThan(normalFlash!.intensity);
    expect(JSON.stringify(critical)).not.toContain('"text":');
  });

  it('uses localization tokens for blocked and dodged attacks, never fictitious damage', () => {
    const blocked = planCombatVfx(impact({ outcome: 'blocked', damage: 0 }));
    expect(cueOf(blocked, 'floatText')).toMatchObject({
      content: { kind: 'message', key: 'combat.blocked' }, emphasis: 'blocked'
    });
    expect(blocked.some(cue => cue.type === 'impactFlash')).toBe(true);
    expect(blocked.some(cue => cue.type === 'floatText' && cue.content.kind === 'damage')).toBe(false);

    const dodged = planCombatVfx(impact({ outcome: 'dodged', damage: 0, critical: true, strong: true }));
    expect(dodged).toHaveLength(1);
    expect(cueOf(dodged, 'floatText')).toMatchObject({
      content: { kind: 'message', key: 'combat.dodged' }, emphasis: 'dodged'
    });
    expect(kinds(impact({ damage: 0 }))).toEqual([]);
  });

  it('shows absorbed impacts without claiming that health was damaged', () => {
    const shielded = planCombatVfx(impact({ damage: 0, absorbed: 14 }));
    expect(cueOf(shielded, 'impactFlash')).toBeDefined();
    expect(cueOf(shielded, 'particles')).toBeDefined();
    expect(cueOf(shielded, 'floatText')).toBeUndefined();
  });

  it('distinguishes projectile impact from a melee swing and avoids weapon trails', () => {
    const cues = planCombatVfx(impact({ delivery: 'projectile', damage: 12 }));
    expect(cueOf(cues, 'particles')).toMatchObject({ style: 'projectile' });
    expect(cueOf(cues, 'weaponTrail')).toBeUndefined();
    expect(cueOf(cues, 'impactFlash')).toBeDefined();
    expect(cueOf(cues, 'floatText')).toMatchObject({ content: { kind: 'damage', amount: 12 } });
  });

  it('plans strong-hit shake and purely visual normalized knockback', () => {
    const normal = planCombatVfx(impact({ direction: { x: 3, y: 4 } }));
    const strong = planCombatVfx(impact({ strong: true, direction: { x: 3, y: 4 } }));
    expect(cueOf(normal, 'screenShake')).toBeUndefined();
    const shake = cueOf(strong, 'screenShake');
    const knockback = cueOf(strong, 'knockbackCue');
    expect(shake).toBeDefined();
    expect(shake!.intensity).toBeGreaterThan(0);
    expect(knockback).toBeDefined();
    expect(knockback!.direction.x).toBeCloseTo(0.6);
    expect(knockback!.direction.y).toBeCloseTo(0.8);
    expect(knockback!.distance).toBeGreaterThan(0);
    expect(knockback!.distance).toBeLessThanOrEqual(24);
  });

  it('provides a death animation hook with an ID, never a simulation death command', () => {
    const cues = planCombatVfx({ type: 'death', position: at, actorId: 'crypt-guardian-1' });
    expect(cues.map(cue => cue.type)).toEqual(['deathHook', 'particles']);
    expect(cueOf(cues, 'deathHook')).toMatchObject({
      poolKey: 'combat.death', actorId: 'crypt-guardian-1'
    });
    expect(cueOf(cues, 'particles')).toMatchObject({ style: 'death' });
  });

  it('rejects malformed positions, damage, directions and optional numbers', () => {
    const invalid: CombatVfxEvent[] = [
      impact({ position: { x: Number.NaN, y: 1 } }),
      impact({ position: { x: Infinity, y: 1 } }),
      impact({ position: { x: 1_000_001, y: 1 } }),
      impact({ damage: Number.NaN }),
      impact({ damage: -1 }),
      impact({ absorbed: -5 }),
      impact({ intensity: Number.POSITIVE_INFINITY }),
      impact({ direction: { x: 1, y: Number.NaN } }),
      { type: 'death', actorId: ' ', position: at },
      { type: 'death', actorId: 'e', position: { x: -Infinity, y: 1 } }
    ];
    for (const event of invalid) expect(planCombatVfx(event)).toEqual([]);
  });

  it('bounds particle counts, cue durations and intensity under extreme finite input', () => {
    const cues = planCombatVfx(impact({
      damage: 1e15, intensity: 1e15, critical: true, strong: true,
      direction: { x: 1e308, y: -1e308 }
    }));
    expect(cues.length).toBeGreaterThan(0);
    for (const cue of cues) {
      expect(Number.isFinite(cue.position.x) && Number.isFinite(cue.position.y)).toBe(true);
      expect(Number.isFinite(cue.durationMs)).toBe(true);
      expect(cue.durationMs).toBeGreaterThan(0);
      expect(cue.durationMs).toBeLessThanOrEqual(900);
      if ('intensity' in cue) {
        expect(cue.intensity).toBeGreaterThanOrEqual(0);
        expect(cue.intensity).toBeLessThanOrEqual(1);
      }
      if (cue.type === 'particles') {
        expect(Number.isInteger(cue.count)).toBe(true);
        expect(cue.count).toBeLessThanOrEqual(32);
      }
    }
  });

  it('does not mutate frozen inputs and returns immutable detached, repeatable plans', () => {
    const position = Object.freeze({ x: 10, y: 20 });
    const direction = Object.freeze({ x: 0, y: 5 });
    const event = Object.freeze({
      type: 'impact' as const, position, direction, damage: 30, strong: true
    });
    const a = planCombatVfx(event);
    const b = planCombatVfx(event);
    expect(a).toEqual(b);
    expect(Object.isFrozen(a)).toBe(true);
    for (const cue of a) {
      expect(Object.isFrozen(cue)).toBe(true);
      expect(Object.isFrozen(cue.position)).toBe(true);
      if (cue.type === 'knockbackCue') expect(Object.isFrozen(cue.direction)).toBe(true);
      if (cue.type === 'floatText') expect(Object.isFrozen(cue.content)).toBe(true);
      expect(cue.position).not.toBe(position);
    }
    expect(position).toEqual({ x: 10, y: 20 });
    expect(direction).toEqual({ x: 0, y: 5 });
  });
});
