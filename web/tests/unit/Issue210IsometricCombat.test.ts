// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { projectCombatCircle, projectCombatCone, combatHealthBar } from '../../src/game/phaser/isometricCombat';
import { unprojectIsometric, projectIsometric } from '../../src/game/phaser/isometricProjection';

const origin = { x: 1400, y: 100 };
const center = { x: 460, y: 500 };

describe('Issue #210: combat presentation geometry', () => {
  it('projects the actual ground-space circle instead of approximating range in screen space', () => {
    const polygon = projectCombatCircle(center, 80, origin);
    expect(polygon).toHaveLength(48);
    for (const vertex of polygon) {
      const world = unprojectIsometric(vertex, 0, origin);
      expect(Math.hypot(world.x - center.x, world.y - center.y)).toBeCloseTo(80, 8);
    }
    expect(polygon[0]).toEqual(projectIsometric({ x: 540, y: 500 }, 0, origin));
  });

  it('keeps a cone apex and both exact boundary angles in Cartesian space', () => {
    const polygon = projectCombatCone(center, 100, Math.PI / 4, 90, origin);
    expect(polygon[0]).toEqual(projectIsometric(center, 0, origin));
    expect(unprojectIsometric(polygon[1]!, 0, origin).x).toBeCloseTo(560, 8);
    const end = unprojectIsometric(polygon.at(-1)!, 0, origin);
    expect(end.x).toBeCloseTo(460, 8);
    expect(end.y).toBeCloseTo(600, 8);
    for (const vertex of polygon.slice(1)) {
      const world = unprojectIsometric(vertex, 0, origin);
      expect(Math.hypot(world.x - center.x, world.y - center.y)).toBeCloseTo(100, 8);
    }
  });

  it('clamps health without distorting the upright screen-space bar', () => {
    const bar = combatHealthBar(center, 25, 100, origin);
    const p = projectIsometric(center, 54, origin);
    expect(bar).toEqual({ x: p.x - 26, y: p.y, width: 52, height: 8, fraction: 0.25 });
    expect(combatHealthBar(center, -10, 100, origin).fraction).toBe(0);
    expect(combatHealthBar(center, 200, 100, origin).fraction).toBe(1);
    expect(combatHealthBar(center, 1, 0, origin).fraction).toBe(0);
    expect(combatHealthBar(center, NaN, 10, origin).fraction).toBe(0);
  });

  it('rejects invalid ground geometry', () => {
    expect(() => projectCombatCircle(center, -1, origin)).toThrow(RangeError);
    expect(() => projectCombatCircle(center, Infinity, origin)).toThrow(RangeError);
    expect(() => projectCombatCone(center, 10, NaN, 90, origin)).toThrow(RangeError);
    expect(() => projectCombatCone(center, 10, 0, 361, origin)).toThrow(RangeError);
  });
});
