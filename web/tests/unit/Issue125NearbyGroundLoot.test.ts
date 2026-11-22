import { describe, expect, it } from 'vitest';
import { nearbyGroundLoot } from '../../src/game/ui/nearbyGroundLoot';
import type { GroundItem } from '../../src/game/data/items';

const drop = (id: string, x: number, y: number): GroundItem =>
  ({ id, x, y, item: { id: 'gear-' + id, templateId: 'helm' } }) as GroundItem;

describe('Issue #125: natural ground-loot affordance', () => {
  it('exposes only nearby, finite, filter-visible drops and never mutates the list', () => {
    const input = [drop('outside', 250, 0), drop('near', 18, 0),
      drop('hidden', Number.NaN, 0), drop('edge', 180, 0)];
    const original = [...input];
    const visible = nearbyGroundLoot(input, { x: 0, y: 0 }, 180, 3);
    expect(visible.map(d => d.id)).toEqual(['near', 'edge']);
    expect(input).toEqual(original);
  });

  it('has deterministic nearest-first ordering with stable ID ties', () => {
    const drops = [drop('z', 0, 40), drop('b', 30, 0),
      drop('a', 0, -30), drop('c', 20, 0)];
    expect(nearbyGroundLoot(drops, { x: 0, y: 0 }, 100, 3)
      .map(d => d.id)).toEqual(['c', 'a', 'b']);
    expect(nearbyGroundLoot([...drops].reverse(), { x: 0, y: 0 }, 100, 3)
      .map(d => d.id)).toEqual(['c', 'a', 'b']);
  });

  it('fails closed on malformed positions, range, limits or duplicate IDs', () => {
    const drops = [drop('a', 0, 0), drop('a', 1, 0)];
    expect(nearbyGroundLoot(drops, { x: 0, y: 0 }, 80, 10)
      .map(d => d.id)).toEqual(['a']);
    for (const point of [{ x: Number.NaN, y: 0 }, { x: 0, y: Infinity }]) {
      expect(nearbyGroundLoot(drops, point)).toEqual([]);
    }
    expect(nearbyGroundLoot(drops, { x: 0, y: 0 }, -1)).toEqual([]);
    expect(nearbyGroundLoot(drops, { x: 0, y: 0 }, 200, 0)).toEqual([]);
    expect(nearbyGroundLoot(drops, { x: 0, y: 0 }, Infinity)).toEqual([]);
  });
});
