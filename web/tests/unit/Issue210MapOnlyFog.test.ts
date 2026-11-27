// GPL-3.0-only — D5.3: seeded ground geometry and map-only fog.
import { describe, expect, it } from 'vitest';
import { CAMP } from '../../src/game/world/generator';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import {
  createMapDiscovery, projectMap, projectVisibleTerrain, revealAtPosition,
  type MapResult, type MapProjection
} from '../../src/game/world/mapDiscovery';
import { planTerrainChunks, wildernessGroundLayout } from '../../src/game/phaser/isometricTerrain';
import { planGroundResidency } from '../../src/game/phaser/isometricGroundResidency';
import { projectIsometric } from '../../src/game/phaser/isometricProjection';

function value<T>(result: MapResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function assertFog(map: MapProjection, known: ReadonlySet<string>, landmarks: ReadonlySet<string>) {
  const cells = new Map(map.cells.map(cell => [cell.id, cell]));
  for (const cell of map.cells) {
    expect(cell.visibility).toBe(known.has(cell.id) ? 'discovered' : 'unexplored');
    if (map.mode==='world'&&!known.has(cell.id)) expect(cell.terrainId).toBeUndefined();
    else expect(cell.terrainId).toBeDefined();
  }
  for (const road of map.roads ?? []) {
    if(map.mode==='world')expect(known.has(road.cellId)).toBe(true);
    const cell = cells.get(road.cellId);
    if(map.mode==='world')expect(cell?.visibility).toBe('discovered');
    if (!cell) throw new Error('Road outside map cells: ' + road.id);
    for (const point of [road.from, road.to]) {
      expect(point.x).toBeGreaterThanOrEqual(cell.x - 0.001);
      expect(point.y).toBeGreaterThanOrEqual(cell.y - 0.001);
      expect(point.x).toBeLessThanOrEqual(cell.x + cell.width + 0.001);
      expect(point.y).toBeLessThanOrEqual(cell.y + cell.height + 0.001);
    }
  }
  for (const marker of map.markers) {
    if (marker.kind === 'landmark' || marker.kind === 'optionalPoi' || marker.kind === 'dungeonEntrance')
      expect(landmarks.has(marker.id)).toBe(true);
  }
}

describe('D5.3 — map-only fog on seeded isometric terrain', () => {
  // Includes two historical natural-play diagnostic seeds, not a replay of
  // those browser failures. The test observes actual generated geometry.
  it.each([42, 546989644, 2683541248])('keeps ground independent of discovery (seed %i)', seed => {
    const world = buildWilderness(seed);
    const input = { seed, worldInstanceId: 'd5-' + seed, features: world.features };
    const empty = value(createMapDiscovery(input));
    const start = value(revealAtPosition(empty, CAMP, 160, input));
    const known = new Set(start.revealedCells);
    const landmarks = new Set(start.discoveredLandmarkIds);
    const before = JSON.stringify(start);
    const hidden = projectVisibleTerrain(value(projectMap(empty, input, CAMP)), world.terrain);
    expect(hidden.roads).toEqual([]);
    expect(hidden.cells.every(cell => cell.terrainId === undefined)).toBe(true);

    const full = projectVisibleTerrain(value(projectMap(start, input, CAMP)), world.terrain);
    expect(full.cells.some(cell => cell.visibility === 'unexplored')).toBe(true);
    expect(full.cells.some(cell => cell.visibility === 'discovered')).toBe(true);
    assertFog(full, known, landmarks);
    const mini = projectVisibleTerrain(value(projectMap(start, input, CAMP, [], { mode: 'minimap' })), world.terrain);
    assertFog(mini, known, landmarks);
    const fullById = new Map(full.cells.map(cell => [cell.id, cell]));
    for (const cell of mini.cells){
      const fullCell=fullById.get(cell.id)!;
      expect(cell.visibility).toBe(fullCell.visibility);
      expect(cell.terrainId).toBeDefined();
      if(fullCell.visibility==='discovered')expect(cell).toEqual(fullCell);
    }

    const ground = wildernessGroundLayout(world.terrain);
    const origin = { x: 1400, y: 100 };
    const chunks = planTerrainChunks(ground, origin);
    expect(chunks).toHaveLength(24);
    const tileIds = (tiles: readonly { x: number; y: number }[]) => new Set(tiles.map(t => t.x + '/' + t.y));
    expect(tileIds(chunks.flatMap(chunk => chunk.tiles))).toEqual(tileIds(world.terrain.tiles));
    expect(new Set(chunks.flatMap(chunk => chunk.roads.map(road => road.id))))
      .toEqual(new Set(world.terrain.roads.map(road => road.id)));

    // The camera can show an unexplored field. It must have ground art;
    // panning the map to the same field must not uncover its terrain.
    const unseen = full.cells.find(cell => cell.visibility === 'unexplored')!;
    const center = { x: unseen.x + unseen.width / 2, y: unseen.y + unseen.height / 2 };
    const projected = projectIsometric(center, 0, origin);
    const view = { x: projected.x - 240, y: projected.y - 160, width: 480, height: 320 };
    const resident = planGroundResidency(chunks, new Set(), view).load;
    expect(resident.some(chunk => chunk.tiles.some(tile => tile.x === unseen.x && tile.y === unseen.y))).toBe(true);
    expect(resident.length).toBeLessThan(chunks.length);
    const panned = projectVisibleTerrain(value(projectMap(start, input, CAMP, [], { zoom: 4, center })), world.terrain);
    assertFog(panned, known, landmarks);
    expect(panned.cells.find(cell => cell.id === unseen.id)?.visibility).toBe('unexplored');
    expect(JSON.stringify(start)).toBe(before);
  }, 30000);
});
