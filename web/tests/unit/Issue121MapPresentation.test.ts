// Issue #121 — discovered-only terrain projection and map camera controls.
// GPL-3.0-only.
import { describe, expect, it } from 'vitest';
import { CAMP } from '../../src/game/world/generator';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import {
  createMapDiscovery, projectMap, projectVisibleTerrain, revealAtPosition,
  type MapResult
} from '../../src/game/world/mapDiscovery';

function value<T>(r: MapResult<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
const world = buildWilderness(42);
const input = {
  seed: 42, worldInstanceId: 'world-42-hero',
  features: world.features
};

describe('Issue #121 — terrain visibility, stable fog and camera projection', () => {
  it('does not serialize unknown terrain types or distant road segments', () => {
    const unseen = value(createMapDiscovery(input));
    const map = projectVisibleTerrain(
      value(projectMap(unseen, input, CAMP)), world.terrain
    );
    expect(map.roads).toHaveLength(0);
    expect(map.cells.every(c => c.terrainId === undefined)).toBe(true);
    expect(JSON.stringify(map)).not.toContain('dirt_road');
    expect(map.markers.some(m => m.kind === 'optionalPoi')).toBe(false);
  });
  it('reveals exact terrain tiles and only clipped roads inside discovered cells', () => {
    const discovered = value(createMapDiscovery(input, CAMP, 160));
    const base = value(projectMap(discovered, input, CAMP));
    const map = projectVisibleTerrain(base, world.terrain);
    expect(map.cells.some(c => c.visibility === 'discovered' && c.terrainId)).toBe(true);
    expect(map.cells.filter(c => c.visibility === 'unexplored')
      .every(c => c.terrainId === undefined)).toBe(true);
    const visible = new Map(map.cells.filter(c => c.visibility === 'discovered')
      .map(c => [c.id, c]));
    for (const road of map.roads) {
      const cell = visible.get(road.cellId);
      expect(cell).toBeDefined();
      if (!cell) continue;
      for (const point of [road.from, road.to]) {
        expect(point.x).toBeGreaterThanOrEqual(cell.x - 0.001);
        expect(point.x).toBeLessThanOrEqual(cell.x + cell.width + 0.001);
        expect(point.y).toBeGreaterThanOrEqual(cell.y - 0.001);
        expect(point.y).toBeLessThanOrEqual(cell.y + cell.height + 0.001);
      }
      expect(road.width).toBeGreaterThan(0);
    }
    // Projecting the same historical discovery is deterministic and does not
    // change any persisted revealed cell, fingerprint or world instance ID.
    expect(projectVisibleTerrain(base, world.terrain)).toEqual(map);
    expect(discovered.revealedCells).toEqual(
      value(revealAtPosition(discovered, CAMP, 160, input)).revealedCells
    );
  });
  it('zoom/pan is bounded, follows requested map center and cannot reveal POIs', () => {
    const discovered = value(createMapDiscovery(input, CAMP, 160));
    const center = { x: 800, y: 760 };
    const map = value(projectMap(discovered, input, CAMP, [], {
      mode: 'world', zoom: 2, center
    }));
    expect(map.viewport).toEqual({
      x: 250, y: 410, width: 1100, height: 700
    });
    expect(map.markers.some(m => m.kind === 'optionalPoi')).toBe(false);
    const edge = value(projectMap(discovered, input, CAMP, [], {
      zoom: 4, center: { x: 2199, y: 1399 }
    }));
    expect(edge.viewport.x + edge.viewport.width).toBe(2200);
    expect(edge.viewport.y + edge.viewport.height).toBe(1400);
    expect(projectMap(discovered, input, CAMP, [], {
      zoom: 2, center: { x: Infinity, y: 0 }
    })).toMatchObject({ ok: false, error: 'invalidViewport' });
    expect(map.cells.filter(c => c.visibility === 'discovered').length)
      .toBeLessThan(discovered.revealedCells.length + 1);
  });
});
