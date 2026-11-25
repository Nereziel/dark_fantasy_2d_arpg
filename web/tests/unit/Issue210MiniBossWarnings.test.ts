// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { miniBossWarnings, projectMiniBossFootprint } from '../../src/game/phaser/isometricMiniBossWarnings';
import { unprojectIsometric } from '../../src/game/phaser/isometricProjection';
import { createMiniBossState, MINI_BOSS_DEFINITIONS, type MiniBossId } from '../../src/game/enemies/miniBossRules';
import type { EnemyUnit } from '../../src/game/enemies/enemies';
import type { Point } from '../../src/game/core/types';

const origin = { x: 1600, y: 100 };
const boss = { x: 600, y: 500 };
const locked = { x: 800, y: 500 };
const world = (points: readonly Point[]) => points.map(p => unprojectIsometric(p, 0, origin));
function contains(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a.y > p.y) !== (b.y > p.y)
      && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

describe('C2.3 miniboss warning geometry mirrors canonical miniBossHit', () => {
  it('uses the locked point rather than the caster or moving hero for a circle', () => {
    const polygon = world(projectMiniBossFootprint('circle', boss, locked, 220, 110, origin));
    expect(polygon).toHaveLength(48);
    for (const p of polygon) expect(Math.hypot(p.x - locked.x, p.y - locked.y)).toBeCloseTo(110, 8);
    expect(contains(locked, polygon)).toBe(true);
    expect(contains(boss, polygon)).toBe(false);
  });
  it.each(['line', 'cone'] as const)('clips %s to the same circular range gate, including the minimum cone width', shape => {
    const range = 130, radius = 43;
    const polygon = world(projectMiniBossFootprint(shape, boss, locked, range, radius, origin));
    for (const p of polygon) {
      const along = p.x - boss.x, side = Math.abs(p.y - boss.y);
      expect(along).toBeGreaterThanOrEqual(-1e-8);
      expect(Math.hypot(along, side)).toBeLessThanOrEqual(range + 1e-8);
      expect(side).toBeLessThanOrEqual((shape === 'line' ? radius : Math.max(18, along * .58)) + 1e-8);
    }
    // Compare interior/exterior samples away from tessellation boundaries.
    for (let along = -10; along <= 140; along += 5) {
      for (let side = -140; side <= 140; side += 5) {
        const limit = shape === 'line' ? radius : Math.max(18, along * .58);
        if (Math.abs(along) <= 2 || Math.abs(Math.hypot(along, side) - range) <= 2
          || Math.abs(Math.abs(side) - limit) <= 2) continue;
        const expected = along >= 0 && Math.hypot(along, side) <= range && Math.abs(side) <= limit;
        expect(contains({ x: boss.x + along, y: boss.y + side }, polygon)).toBe(expected);
      }
    }
    expect(contains({ x: boss.x + 5, y: boss.y + 16 }, polygon)).toBe(true);
    expect(contains({ x: boss.x + 129, y: boss.y + 42 }, polygon)).toBe(false);
  });
  it('rotates the footprint to the actual locked direction and rejects degenerate aim', () => {
    const polygon = world(projectMiniBossFootprint('line', boss, { x: boss.x, y: boss.y - 100 }, 240, 43, origin));
    expect(contains({ x: boss.x + 20, y: boss.y - 100 }, polygon)).toBe(true);
    expect(contains({ x: boss.x + 100, y: boss.y }, polygon)).toBe(false);
    expect(projectMiniBossFootprint('line', boss, boss, 240, 43, origin)).toEqual([]);
    expect(projectMiniBossFootprint('cone', boss, locked, NaN, 43, origin)).toEqual([]);
  });
});

describe('snapshot miniboss warnings', () => {
  it.each(Object.keys(MINI_BOSS_DEFINITIONS) as MiniBossId[])('renders every catalog ability for %s only during windup', id => {
    const def = MINI_BOSS_DEFINITIONS[id];
    const initial = createMiniBossState(id, id)!;
    const actor: EnemyUnit = { actor: { ...boss, id, type: def.enemyType, health: 100, maxHealth: 100, alive: true },
      intent: null, effects: [], cooldown: 0 };
    for (const ability of def.abilities) {
      const windup = { ...initial, stage: 'windup' as const, activeAbilityId: ability.id,
        lockedPoint: locked, remainingSeconds: ability.windupSeconds / 2 };
      const snapshot = { enemies: [actor], miniBossStates: { [id]: windup } };
      const before = JSON.stringify(snapshot);
      const warnings = miniBossWarnings(snapshot, origin);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({ enemyId: id, shape: ability.shape, progress: .5,
        harmful: !['support', 'summon'].includes(ability.effect) });
      expect(warnings[0]!.points.length).toBeGreaterThan(2);
      expect(JSON.stringify(snapshot)).toBe(before);
      expect(miniBossWarnings({ ...snapshot, enemies: [] }, origin)).toEqual([]);
      expect(miniBossWarnings({ ...snapshot, enemies: [{ ...actor, actor: { ...actor.actor, alive: false } }] }, origin)).toEqual([]);
      expect(miniBossWarnings({ ...snapshot, miniBossStates: { [id]: { ...windup, stage: 'recovery' } } }, origin)).toEqual([]);
      expect(miniBossWarnings({ ...snapshot, miniBossStates: { [id]: { ...windup, remainingSeconds: 0 } } }, origin)).toEqual([]);
    }
  });
});
