// Issue #128 — non-color combat readability contract.
// Original project code: GPL-3.0-only.
import { describe, expect, it } from 'vitest';
import { planCombatReadability, type CombatReadabilityInput } from '../../src/game/phaser/combatReadabilityPlan';

const at = Object.freeze({ x: 120, y: 240 });

describe('Issue 128: readable combat geometry from authoritative events', () => {
  it('renders boss, miniboss and trap warnings as outlined rings with geometric markers', () => {
    const expected = { boss: 700, miniboss: 800, trap: 850 };
    for (const threat of ['boss', 'miniboss', 'trap'] as const) {
      const cue = planCombatReadability({
        type: 'telegraph', threat, position: at, radius: 68
      });
      expect(cue?.kind).toBe('warning');
      expect(cue?.ring).toBe(true);
      expect(cue?.radius).toBe(68);
      expect(cue?.durationMs).toBe(expected[threat]);
      expect(cue?.segments.length).toBeGreaterThanOrEqual(10);
      expect(cue?.strokeWidth).toBeGreaterThanOrEqual(3);
    }
  });

  it('uses distinct silhouettes for crit, block and dodge; regular hits keep existing VFX', () => {
    const sample = (outcome: 'hit' | 'blocked' | 'dodged', critical = false, damage = 42) =>
      planCombatReadability({ type: 'impact', position: at, outcome, critical, damage });
    const crit = sample('hit', true);
    const block = sample('blocked', false, 0);
    const dodge = sample('dodged', false, 0);
    expect(crit?.kind).toBe('critical');
    expect(block?.kind).toBe('blocked');
    expect(dodge?.kind).toBe('dodged');
    expect(new Set([crit, block, dodge].map(cue => JSON.stringify(cue?.segments))).size).toBe(3);
    expect([crit, block, dodge].every(cue => (cue?.segments.length ?? 0) >= 4)).toBe(true);
    expect(sample('hit')).toBeNull();
    expect(sample('hit', true, 0)).toBeNull();
    expect(sample('blocked', true, 40)?.kind).toBe('blocked');
    expect(sample('dodged', true, 100)?.kind).toBe('dodged');
  });

  it('bounds hostile radii and rejects nonfinite, malformed inputs', () => {
    const giant = planCombatReadability({
      type: 'telegraph', threat: 'boss', position: at, radius: Number.MAX_VALUE
    });
    expect(giant?.radius).toBe(140);
    const tiny = planCombatReadability({
      type: 'telegraph', threat: 'trap', position: at, radius: 1
    });
    expect(tiny?.radius).toBe(18);
    const invalid: CombatReadabilityInput[] = [
      { type: 'telegraph', threat: 'boss', position: at, radius: NaN },
      { type: 'telegraph', threat: 'boss', position: at, radius: -2 },
      { type: 'telegraph', threat: 'trap', position: at, radius: Infinity },
      { type: 'telegraph', threat: 'boss', position: { x: Infinity, y: 0 }, radius: 20 },
      { type: 'impact', position: at, outcome: 'hit', critical: true, damage: -1 },
      { type: 'impact', position: at, outcome: 'hit', critical: true, damage: Infinity },
      { type: 'impact', position: { x: NaN, y: 1 }, outcome: 'dodged', damage: 0 },
      { type: 'impact', position: at, outcome: 'unknown' as 'hit', damage: 0 }
    ];
    for (const input of invalid) expect(planCombatReadability(input)).toBeNull();
  });

  it('is immutable, deterministic and has bounded allocations for 40 actors', () => {
    const events: CombatReadabilityInput[] = Array.from({ length: 40 }, (_, i) => ({
      type: 'impact', position: { x: 30 + i * 20, y: 240 },
      damage: 10 + i, critical: true, outcome: 'hit'
    }));
    const inputBefore = JSON.stringify(events);
    const first = events.map(planCombatReadability);
    const second = events.map(planCombatReadability);
    expect(first).toEqual(second);
    expect(JSON.stringify(events)).toEqual(inputBefore);
    expect(first.filter(Boolean)).toHaveLength(40);
    for (const cue of first) {
      expect(cue).not.toBeNull();
      if (!cue) continue;
      expect(Object.isFrozen(cue)).toBe(true);
      expect(Object.isFrozen(cue.position)).toBe(true);
      expect(Object.isFrozen(cue.segments)).toBe(true);
      expect(cue.segments.length).toBeLessThanOrEqual(16);
      expect(cue.durationMs).toBeLessThanOrEqual(850);
      for (const line of cue.segments) {
        expect(Object.isFrozen(line)).toBe(true);
        expect([line.x1, line.y1, line.x2, line.y2].every(Number.isFinite)).toBe(true);
        expect([line.x1, line.y1, line.x2, line.y2].every(n => Math.abs(n) <= 160)).toBe(true);
      }
    }
  });
});
