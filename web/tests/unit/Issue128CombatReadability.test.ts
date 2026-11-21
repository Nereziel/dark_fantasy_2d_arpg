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

  it('projects real boss cone sectors rather than a misleading circular danger ring', () => {
    const radius = 108;
    const angle = Math.PI / 6;
    const arcDegrees = 85;
    const cue = planCombatReadability({
      type: 'telegraph', threat: 'boss', position: at, radius,
      shape: 'cone', angleRadians: angle, arcDegrees
    });
    expect(cue?.ring).toBe(false);
    expect(cue?.sector).toEqual({
      fromRadians: angle - 85 * Math.PI / 360,
      toRadians: angle + 85 * Math.PI / 360
    });
    expect(cue?.radius).toBe(radius);
    expect(cue?.segments.length).toBeGreaterThan(8);
    expect(cue?.segments.length).toBeLessThanOrEqual(20);
    // Every mark is confined to its real sector, not outside the danger area.
    for (const line of cue?.segments ?? []) {
      for (const [x, y] of [[line.x1, line.y1], [line.x2, line.y2]]) {
        const distance = Math.hypot(x, y);
        expect(distance).toBeLessThanOrEqual(radius + 1e-8);
        if (distance > 0.01) {
          const deviation = Math.atan2(Math.sin(Math.atan2(y, x) - angle),
            Math.cos(Math.atan2(y, x) - angle));
          expect(Math.abs(deviation)).toBeLessThanOrEqual(arcDegrees * Math.PI / 360 + 1e-8);
        }
      }
    }
  });

  it('supports the actual king cone attacks and does not invent missing geometry', () => {
    for (const [radius, arcDegrees] of [[108,85],[112,35],[116,42]]) {
      const cue = planCombatReadability({
        type: 'telegraph', threat: 'boss', position: at, radius,
        shape: 'cone', angleRadians: -2.4, arcDegrees
      });
      expect(cue?.sector?.toRadians).toBeCloseTo(-2.4 + arcDegrees * Math.PI / 360);
      expect(cue?.ring).toBe(false);
    }
    const invalid: CombatReadabilityInput[] = [
      { type: 'telegraph', threat: 'boss', position: at, radius: 108,
        shape: 'cone', angleRadians: Infinity, arcDegrees: 85 },
      { type: 'telegraph', threat: 'boss', position: at, radius: 108,
        shape: 'cone', angleRadians: 0, arcDegrees: 0 },
      { type: 'telegraph', threat: 'boss', position: at, radius: 108,
        shape: 'cone', angleRadians: 0, arcDegrees: 361 },
      { type: 'telegraph', threat: 'boss', position: at, radius: 108,
        shape: 'cone' },
      { type: 'telegraph', threat: 'boss', position: at, radius: 108,
        shape: 'arc' as 'circle' }
    ];
    for (const value of invalid) expect(planCombatReadability(value)).toBeNull();
    expect(planCombatReadability({ type: 'telegraph', threat: 'boss',
      position: at, radius: 60, shape: 'circle' })?.ring).toBe(true);
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


describe('Issue 128 stage 2B: authoritative miniboss footprints', () => {
  const origin = Object.freeze({ x: 300, y: 400 });

  it('projects the Morrow line as the exact full-range corridor, not a circle', () => {
    const cue = planCombatReadability({
      type: 'telegraph', threat: 'miniboss', shape: 'line',
      position: { x: 400, y: 400 }, origin, range: 240, radius: 43,
      durationSeconds: 0.85
    });
    expect(cue).toMatchObject({
      kind: 'warning', ring: false, position: origin, radius: 43, durationMs: 850
    });
    expect(cue?.sector).toBeUndefined();
    const poly = cue?.polygon ?? [];
    expect(poly).toHaveLength(19);
    expect(poly[0]).toEqual({ x: 0, y: 43 });
    expect(poly[1]?.x).toBeCloseTo(Math.sqrt(240 ** 2 - 43 ** 2));
    expect(poly[1]?.y).toBeCloseTo(43);
    expect(poly[9]?.x).toBeCloseTo(240);
    expect(poly[9]?.y).toBeCloseTo(0);
    expect(poly[18]).toEqual({ x: 0, y: -43 });
    // Corners outside the radial limit must NOT be falsely highlighted.
    for (const p of poly) {
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(240 + 1e-8);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(43 + 1e-8);
    }
    expect(cue?.segments.length).toBeGreaterThanOrEqual(4);
    expect(cue?.segments.length).toBeLessThanOrEqual(16);
  });

  it('projects mini-boss cone side width as max(18, along*0.58)', () => {
    const cue = planCombatReadability({
      type: 'telegraph', threat: 'miniboss', shape: 'cone',
      position: { x: 300, y: 500 }, origin, range: 130, radius: 95,
      durationSeconds: 0.75
    });
    expect(cue).toMatchObject({
      kind: 'warning', ring: false, position: origin, durationMs: 750
    });
    expect(cue?.sector).toBeUndefined();
    const poly = cue?.polygon ?? [];
    expect(poly).toHaveLength(21);
    // The first section is a constant-width 18px corridor, not a triangle.
    expect(poly[0]).toMatchObject({ x: -18, y: 0 });
    expect(poly[20]).toMatchObject({ x: 18, y: 0 });
    expect(poly[1]?.x).toBeCloseTo(-18);
    expect(poly[1]?.y).toBeCloseTo(18 / 0.58);
    expect(poly[19]?.x).toBeCloseTo(18);
    expect(poly[19]?.y).toBeCloseTo(18 / 0.58);
    const cross = 130 / Math.hypot(1, 0.58);
    expect(poly[2]?.x).toBeCloseTo(-cross * 0.58);
    expect(poly[2]?.y).toBeCloseTo(cross);
    // The far tip reaches full range but has ZERO lateral width.
    expect(poly[10]?.x).toBeCloseTo(0);
    expect(poly[10]?.y).toBeCloseTo(130);
    for (const p of poly) {
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(130 + 1e-8);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(Math.max(18, p.y * 0.58) + 1e-8);
    }
  });

  it('preserves circular miniboss markers and rejects incomplete/stale direction data', () => {
    const circle = planCombatReadability({
      type: 'telegraph', threat: 'miniboss', shape: 'circle',
      position: { x: 410, y: 390 }, radius: 82
    });
    expect(circle?.ring).toBe(true);
    expect(circle?.polygon).toBeUndefined();

    const invalid: CombatReadabilityInput[] = [
      { type: 'telegraph', threat: 'miniboss', shape: 'line',
        position: at, radius: 43, range: 240 },
      { type: 'telegraph', threat: 'miniboss', shape: 'cone',
        position: at, radius: 95, origin, range: -1 },
      { type: 'telegraph', threat: 'miniboss', shape: 'line',
        position: origin, origin, radius: 43, range: 240 },
      { type: 'telegraph', threat: 'miniboss', shape: 'line',
        position: at, origin: { x: NaN, y: 400 }, radius: 43, range: 240 },
      { type: 'telegraph', threat: 'miniboss', shape: 'line',
        position: at, origin, radius: 43, range: Infinity },
      { type: 'telegraph', threat: 'miniboss', shape: 'cone',
        position: at, origin, radius: 95, range: 1e8 },
      { type: 'telegraph', threat: 'miniboss', shape: 'cone',
        position: at, origin, radius: 95, range: 130, durationSeconds: NaN },
      { type: 'telegraph', threat: 'boss', shape: 'line',
        position: at, origin, radius: 95, range: 130 }
    ];
    for (const event of invalid) expect(planCombatReadability(event)).toBeNull();
  });

  it('is bounded and deterministic for 40 simultaneous miniboss warning plans', () => {
    const inputs: CombatReadabilityInput[] = Array.from({ length: 40 }, (_, i) => ({
      type: 'telegraph', threat: 'miniboss', shape: i % 2 ? 'cone' : 'line',
      position: { x: 200 + i * 5, y: 160 },
      origin: { x: 200 + i * 5, y: 100 },
      range: 130 + i, radius: 55
    }));
    const before = JSON.stringify(inputs);
    const cues = inputs.map(planCombatReadability);
    expect(cues).toEqual(inputs.map(planCombatReadability));
    expect(JSON.stringify(inputs)).toBe(before);
    for (const [index, cue] of cues.entries()) {
      expect(cue).not.toBeNull();
      if (!cue) continue;
      expect(cue.polygon?.length).toBeGreaterThanOrEqual(4);
      expect(cue.polygon?.length).toBeLessThanOrEqual(24);
      expect(cue.segments.length).toBeLessThanOrEqual(16);
      expect(Object.isFrozen(cue)).toBe(true);
      expect(Object.isFrozen(cue.polygon)).toBe(true);
      for (const p of cue.polygon ?? []) {
        expect(Object.isFrozen(p)).toBe(true);
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        const range = (inputs[index] as Extract<CombatReadabilityInput, { type: 'telegraph' }>).range!;
        expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(range + 1e-8);
      }
    }
  });
});
