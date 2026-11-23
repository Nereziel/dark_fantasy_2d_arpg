import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { CAMP } from '../../src/game/world/generator';
import { createMapDiscovery, revealAtPosition } from '../../src/game/world/mapDiscovery';
import { getTownManifest } from '../../src/game/world/townManifest';
import { createChunkIndex, createWorldFactLedger, makeWorldFact } from '../../src/game/world/chunkStreaming';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { generateWildernessTerrain, routeClear, validateWildernessTerrain } from '../../src/game/world/wildernessTerrain';
import { planWildernessFeatures } from '../../src/game/world/wildernessFeatures';

describe('Act I forest trail', () => {
  it('builds three distinct traversable routes with walkable side loops and collision edges', () => {
    const worlds = [0, 1, 2].map(buildWilderness);
    const signatures = worlds.map(world => {
      const { roads } = world.terrain;
      const main = roads.find(road => road.id === 'road-story-corruption_site')!;
      const side = roads.find(road => road.id === 'road-forest-side')!;
      const site = world.features.find(feature => feature.id === 'act1.corruption_site');
      expect(main.to).toEqual(site?.position);
      expect(main.points).toContainEqual(side.from);
      expect(main.points).toContainEqual(side.to);
      expect(side.from).not.toEqual(side.to);
      expect(routeClear(main.points, world.layout.obstacles)).toBe(true);
      expect(routeClear([...main.points].reverse(), world.layout.obstacles)).toBe(true);
      expect(routeClear(side.points, world.layout.obstacles)).toBe(true);
      const edges = world.layout.obstacles.filter(wall => wall.id.startsWith('trail-edge-'));
      expect(edges.length).toBeGreaterThan(0);
      expect(validateWildernessTerrain(world.terrain)).toEqual([]);
      return edges.map(wall => wall.id).join(',');
    });
    expect(new Set(signatures).size).toBe(3);
  });

  it('replays the same topology and retains historic story and save identities', () => {
    const seed = 7919;
    const oldTerrain = generateWildernessTerrain(seed);
    const original = planWildernessFeatures(seed, oldTerrain.layout);
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    const world = buildWilderness(seed);
    expect(world.features).toEqual(original.features);
    expect(buildWilderness(seed)).toEqual(world);
    const independentlyLoaded = buildWilderness(seed);
    independentlyLoaded.layout.obstacles.length = 0;
    expect(buildWilderness(seed)).toEqual(world);

    const waypoint = getTownManifest().find(entry => entry.role === 'waypoint')!;
    const mapInput = { seed, worldInstanceId: 'world-' + seed + '-hero',
      features: original.features, waypoints: [
        { id: 'town.waypoint', position: waypoint.position, presentationKey: waypoint.nameKey }
      ] };
    const initial = createMapDiscovery(mapInput, CAMP, 105);
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    const site = original.features.find(feature => feature.id === 'act1.corruption_site')!;
    const explored = revealAtPosition(initial.value, site.position, 100, mapInput);
    expect(explored.ok).toBe(true);
    if (!explored.ok) return;

    const oldIndex = createChunkIndex({ layout: oldTerrain.layout, terrain: oldTerrain,
      features: original.features, usedFeatureFallback: false });
    const ledger = createWorldFactLedger(oldIndex, 'hero');
    const oldFact = makeWorldFact(oldIndex, ledger.worldInstanceId, 'chestOpened', 'field-chest');
    const savedWorld = { version: 1 as const, seed, mapDiscovery: explored.value,
      worldFacts: { ...ledger, entries: [oldFact] } };
    const reloaded = new GameSimulation(seed);
    expect(reloaded.restoreWorldProgress(savedWorld)).toBe(true);
    expect(reloaded.worldProgress()?.mapDiscovery).toEqual(explored.value);
    expect(reloaded.worldProgress()?.worldFacts).toEqual(savedWorld.worldFacts);
    expect(reloaded.snapshot().interactables.some(object => object.id === 'field-chest')).toBe(false);
  });
});
