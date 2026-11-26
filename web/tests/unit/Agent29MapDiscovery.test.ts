import { describe, expect, it } from 'vitest';
import { CAMP, CRYPT_GATE } from '../../src/game/world/generator';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../src/game/world/navigation';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import {
  MAP_CELL_SIZE, MAP_CELL_COUNT, MAX_REVEAL_RADIUS,
  activateMapWaypoint, createMapDiscovery, projectMap, restoreMapDiscovery,
  revealAtPosition, revealTravelSegment, validateMapDiscovery,
  type MapDiscoveryState, type MapResult, type MapWorldInput
} from '../../src/game/world/mapDiscovery';

const cache = new Map<number, ReturnType<typeof buildWilderness>>();
function fixture(seed = 0): MapWorldInput {
  let built = cache.get(seed);
  if (!built) {
    built = buildWilderness(seed);
    cache.set(seed, built);
  }
  return {
    seed, worldInstanceId: 'world-' + seed,
    features: built.features,
    waypoints: [{ id: 'town.waypoint', position: CAMP, presentationKey: 'town.waypoint.name' }]
  };
}
function ok<T>(result: MapResult<T>): T {
  if (!result.ok) throw Error('Unexpected ' + result.error);
  return result.value;
}
function initialized(seed = 0): MapDiscoveryState {
  return ok(createMapDiscovery(fixture(seed)));
}

describe('Agent 29 — map discovery, fog of war and pure projections', () => {
  it('begins with no explored wilderness, but always knows the town marker', () => {
    const state = initialized();
    expect(state).toMatchObject({
      version: 1, worldSeed: 0, worldInstanceId: 'world-0',
      width: WORLD_WIDTH, height: WORLD_HEIGHT, cellSize: 80,
      revealedCells: [], discoveredLandmarkIds: [],
      discoveredWaypointIds: [], activatedWaypointIds: [], lastObservedPosition: null
    });
    const map = ok(projectMap(state, fixture(), CAMP));
    expect(map.markers.map(marker => marker.id)).toContain('town.camp');
    expect(map.markers.map(marker => marker.id)).toContain('player');
    expect(map.markers.some(marker => marker.kind === 'optionalPoi')).toBe(false);
    expect(map.markers.some(marker => marker.kind === 'dungeonEntrance')).toBe(false);
    expect(map.markers.some(marker => marker.kind === 'waypoint')).toBe(false);
    expect(map.cells.every(cell => cell.visibility === 'unexplored')).toBe(true);
    expect(map.cells).toHaveLength(MAP_CELL_COUNT);
    expect(map.cells[0]).toMatchObject({ id: 'fog/0/0', x: 0, y: 0, width: 80, height: 80 });
  });

  it('uses a stable 80-pixel grid, including partial world-edge cells', () => {
    expect(MAP_CELL_SIZE).toBe(80);
    expect(MAP_CELL_COUNT).toBe(28 * 18);
    const state = ok(revealAtPosition(initialized(), { x: 2199.5, y: 1399.5 }, 0, fixture()));
    expect(state.revealedCells).toEqual(['fog/27/17']);
    const map = ok(projectMap(state, fixture(), { x: 2199.5, y: 1399.5 }));
    expect(map.cells.at(-1)).toMatchObject({
      id: 'fog/27/17', x: 2160, y: 1360, width: 40, height: 40,
      visibility: 'discovered'
    });
    expect(map.cells.every(cell => cell.x + cell.width <= WORLD_WIDTH
      && cell.y + cell.height <= WORLD_HEIGHT)).toBe(true);
  });

  it('reveals a bounded actual starting area, not the entire known camp radius', () => {
    const state = ok(createMapDiscovery(fixture(), CAMP, 80));
    expect(state.lastObservedPosition).toEqual(CAMP);
    expect(state.revealedCells.length).toBeGreaterThan(0);
    expect(state.revealedCells.length).toBeLessThan(10);
    expect(state.revealedCells).not.toContain('fog/20/10');
    const map = ok(projectMap(state, fixture(), CAMP));
    expect(map.cells.some(cell => cell.visibility === 'unexplored')).toBe(true);
  });

  it('is deterministic, immutable and idempotent for the same observation', () => {
    const before = initialized(42);
    const frozen = Object.freeze(before);
    const first = ok(revealAtPosition(frozen, CAMP, 90, fixture(42)));
    const again = ok(revealAtPosition(first, CAMP, 90, fixture(42)));
    expect(again).toEqual(first);
    expect(before.revealedCells).toEqual([]);
    expect(before.lastObservedPosition).toBeNull();
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.revealedCells)).toBe(true);
    expect(Object.isFrozen(first.lastObservedPosition)).toBe(true);
    expect(first).toEqual(ok(revealAtPosition(initialized(42), CAMP, 90, fixture(42))));
  });

  it('reveals verified short travel steps, but never interpolates a teleport', () => {
    const world = fixture(1);
    const start = ok(createMapDiscovery(world, CAMP, 16));
    const end = { x: CAMP.x + 120, y: CAMP.y };
    const walked = ok(revealTravelSegment(start, CAMP, end, 24, world));
    const teleport = ok(revealAtPosition(start, end, 24, world));
    expect(walked.revealedCells.length).toBeGreaterThan(teleport.revealedCells.length);
    expect(walked.lastObservedPosition).toEqual(end);
    expect(revealTravelSegment(start, CAMP, { x: 2100, y: 1300 }, 24, world))
      .toMatchObject({ ok: false, error: 'invalidSegment' });
    const teleported = ok(revealAtPosition(start, { x: 2100, y: 1300 }, 24, world));
    expect(teleported.revealedCells).not.toContain('fog/15/10');
    expect(teleported.lastObservedPosition).toEqual({ x: 2100, y: 1300 });
  });

  it.each([0, 1, 42, 0xffffffff])('does not pre-reveal seeded procedural POI for seed %s', seed => {
    const world = fixture(seed);
    const state = initialized(seed);
    const map = ok(projectMap(state, world, CAMP));
    expect(map.markers.some(marker => marker.id.startsWith('wild.'))).toBe(false);
    expect(map.markers.some(marker => marker.id === 'act1.crypt_entrance')).toBe(false);
    const optional = world.features.find(feature => feature.id.startsWith('wild.'));
    expect(optional).toBeDefined();
    const visited = ok(revealAtPosition(state, optional!.position, 40, world));
    const projected = ok(projectMap(visited, world, optional!.position));
    expect(visited.discoveredLandmarkIds).toContain(optional!.id);
    expect(projected.markers.some(marker => marker.id === optional!.id)).toBe(true);
    for (const feature of world.features) {
      if (!visited.discoveredLandmarkIds.includes(feature.id)) {
        expect(projected.markers.some(marker => marker.id === feature.id)).toBe(false);
      }
    }
  });

  it('exposes only the selected discovered destination for off-minimap navigation', () => {
    const world=fixture();
    const target=world.features.find(f=>f.id==='act1.crypt_entrance')!;
    const hints=[{id:'crypt_descent',featureId:target.id,status:'active' as const}];
    const options={mode:'minimap' as const,trackedQuestId:'crypt_descent'};
    expect(ok(projectMap(initialized(),world,CAMP,hints,options)).navigationTarget).toBeUndefined();
    const discovered=ok(revealAtPosition(initialized(),target.position,80,world));
    expect(ok(projectMap(discovered,world,CAMP,hints,options)).navigationTarget?.position).toEqual(target.position);
    expect(ok(projectMap(discovered,world,CAMP,hints,{...options,trackedQuestId:'other'})).navigationTarget).toBeUndefined();
    expect(ok(projectMap(discovered,world,CAMP,[{...hints[0]!,status:'complete'}],options)).navigationTarget).toBeUndefined();
  });

  it('hides unknown dungeon entrances and quest destinations, including exact coordinates', () => {
    const world = fixture(0);
    const state = initialized();
    const hidden = ok(projectMap(state, world, CAMP, [
      { id: 'crypt_descent', featureId: 'act1.crypt_entrance', presentationKey: 'quest.crypt', status: 'active' },
      { id: 'find_graveyard', featureId: 'act1.abandoned_graveyard', status: 'complete' }
    ]));
    expect(hidden.markers.some(marker => marker.kind === 'quest')).toBe(false);
    expect(hidden.hints).toEqual([
      { id: 'crypt_descent', presentationKey: 'quest.crypt', status: 'active' },
      { id: 'find_graveyard', status: 'complete' }
    ]);
    expect(JSON.stringify(hidden.hints)).not.toContain(String(CRYPT_GATE.x));
    const discovered = ok(revealAtPosition(state, CRYPT_GATE, 60, world));
    const visible = ok(projectMap(discovered, world, CRYPT_GATE, [
      { id: 'crypt_descent', featureId: 'act1.crypt_entrance', status: 'active' }
    ]));
    expect(visible.markers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'act1.crypt_entrance', kind: 'dungeonEntrance' }),
      expect.objectContaining({ id: 'quest/crypt_descent', kind: 'quest' })
    ]));
    expect(visible.hints).toHaveLength(0);
  });

  it('projects one authoritative discovery state to both world map and cropped zoomed minimap', () => {
    const world = fixture(0);
    const state = ok(revealAtPosition(initialized(), CAMP, 140, world));
    const full = ok(projectMap(state, world, CAMP));
    const mini = ok(projectMap(state, world, CAMP, [], {
      mode: 'minimap', viewport: { x: 110, y: 240, width: 640, height: 480 }, zoom: 2
    }));
    expect(mini.mode).toBe('minimap');
    expect(mini.viewport).toMatchObject({ width: 320, height: 240 });
    expect(mini.cells.length).toBeLessThan(full.cells.length);
    for (const cell of mini.cells) {
      expect(full.cells.find(other => other.id === cell.id)?.visibility).toBe(cell.visibility);
    }
    const markerIds = full.markers.map(marker => marker.id);
    expect(mini.markers.every(marker => markerIds.includes(marker.id))).toBe(true);
    expect(mini.markers.map(marker => marker.id)).toContain('town.camp');
    expect(mini.markers.map(marker => marker.id)).toContain('player');
    expect(projectMap(state, world, CAMP, [], { mode: 'minimap' }).ok).toBe(true);
  });

  it('keeps waypoints hidden until physically discovered; activation is only metadata', () => {
    const world = fixture(0);
    const initial = initialized();
    expect(activateMapWaypoint(initial, 'town.waypoint', world))
      .toMatchObject({ ok: false, error: 'unknownWaypoint' });
    const discovered = ok(revealAtPosition(initial, CAMP, 32, world));
    expect(discovered.discoveredWaypointIds).toContain('town.waypoint');
    const active = ok(activateMapWaypoint(discovered, 'town.waypoint', world));
    expect(active.activatedWaypointIds).toEqual(['town.waypoint']);
    expect(ok(activateMapWaypoint(active, 'town.waypoint', world))).toEqual(active);
    expect(ok(projectMap(active, world, CAMP)).markers)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        id: 'town.waypoint', kind: 'waypoint', activated: true
      })]));
  });

  it('refuses mismatched world seed, instance or changed feature manifest', () => {
    const world = fixture(0);
    const discovered = ok(revealAtPosition(initialized(), CAMP, 55, world));
    expect(validateMapDiscovery(discovered, world)).toBe(true);
    const wrongInstance = { ...world, worldInstanceId: 'different' };
    const wrongSeed = fixture(1);
    const wrongContent = { ...world, features: world.features.map(feature =>
      feature.id === 'act1.crypt_entrance'
        ? { ...feature, position: { x: feature.position.x + 1, y: feature.position.y } }
        : feature) };
    for (const otherWorld of [wrongInstance, wrongSeed, wrongContent]) {
      expect(validateMapDiscovery(discovered, otherWorld)).toBe(false);
      expect(revealAtPosition(discovered, CAMP, 20, otherWorld).ok).toBe(false);
      expect(projectMap(discovered, otherWorld, CAMP).ok).toBe(false);
      expect(restoreMapDiscovery(discovered, otherWorld).ok).toBe(false);
    }
    expect(validateMapDiscovery(discovered, world)).toBe(true);
  });

  it('rejects malformed external state and forged IDs, duplicates and oversized arrays', () => {
    const state = initialized();
    const invalid: unknown[] = [
      null, {}, { ...state, version: 77 }, { ...state, cellSize: 40 },
      { ...state, revealedCells: ['fog/28/0'] },
      { ...state, revealedCells: ['fog/00/0'] },
      { ...state, revealedCells: ['fog/0/0', 'fog/0/0'] },
      { ...state, revealedCells: ['__proto__'] },
      { ...state, revealedCells: Array.from({ length: 505 }, (_, index) => 'fog/' + index + '/0') },
      { ...state, discoveredLandmarkIds: ['wild.poi.999999999999'] },
      { ...state, discoveredLandmarkIds: ['__proto__'] },
      { ...state, activatedWaypointIds: ['town.waypoint'] },
      { ...state, worldInstanceId: '../escape' },
      { ...state, lastObservedPosition: { x: Number.NaN, y: 20 } }
    ];
    for (const value of invalid) {
      expect(validateMapDiscovery(value), JSON.stringify(value)?.slice(0, 80)).toBe(false);
      expect(restoreMapDiscovery(value, fixture()).ok).toBe(false);
    }
    const forged = { ...state, discoveredLandmarkIds: ['wild.poi.1'] };
    expect(validateMapDiscovery(forged, fixture())).toBe(false);
  });

  it('rejects invalid seeds, coordinates, radii, segments, viewports and quest inputs safely', () => {
    const world = fixture(0), state = initialized();
    for (const seed of [-1, 0.5, 4294967296, Number.NaN, Infinity, -Infinity]) {
      expect(createMapDiscovery({ ...world, seed }).ok).toBe(false);
    }
    for (const worldInstanceId of ['', '__proto__', '../bad', 'x'.repeat(100)]) {
      expect(createMapDiscovery({ ...world, worldInstanceId }).ok).toBe(false);
    }
    for (const position of [
      { x: -1, y: 20 }, { x: WORLD_WIDTH, y: 0 },
      { x: 10, y: WORLD_HEIGHT }, { x: NaN, y: 20 }, { x: Infinity, y: 0 }
    ]) {
      expect(revealAtPosition(state, position, 20, world).ok).toBe(false);
      expect(projectMap(state, world, position).ok).toBe(false);
    }
    for (const radius of [-1, Infinity, NaN, MAX_REVEAL_RADIUS + 1]) {
      expect(revealAtPosition(state, CAMP, radius, world).ok).toBe(false);
    }
    for (const options of [
      { zoom: 0 }, { zoom: Infinity }, { zoom: 100 },
      { viewport: { x: -1, y: 0, width: 200, height: 200 } },
      { viewport: { x: 0, y: 0, width: 100000, height: 200 } },
      { viewport: { x: 0, y: 0, width: 0, height: 10 } }
    ]) {
      expect(projectMap(state, world, CAMP, [], options).ok).toBe(false);
    }
    expect(projectMap(state, world, CAMP, [
      { id: '__proto__', status: 'active' }
    ]).ok).toBe(false);
    expect(projectMap(state, world, CAMP, Array.from({ length: 300 }, (_, i) =>
      ({ id: 'q' + i, status: 'active' as const }))).ok).toBe(false);
    expect(createMapDiscovery({ ...world, features: [...world.features, world.features[0]!] }).ok).toBe(false);
  });

  it('supports JSON round-trips, deep-copy restore and order-independent world manifests', () => {
    const world = fixture(42);
    const state = ok(revealAtPosition(initialized(42), CAMP, 100, world));
    const restored = ok(restoreMapDiscovery(JSON.parse(JSON.stringify(state)), world));
    expect(restored).toEqual(state);
    expect(restored).not.toBe(state);
    expect(Object.isFrozen(restored.revealedCells)).toBe(true);
    const reversed = { ...world, features: [...world.features].reverse() };
    expect(validateMapDiscovery(restored, reversed)).toBe(true);
    expect(ok(projectMap(restored, reversed, CAMP))).toEqual(ok(projectMap(state, world, CAMP)));
    expect(ok(revealAtPosition(restored, CAMP, 100, reversed))).toEqual(state);
  });
});
