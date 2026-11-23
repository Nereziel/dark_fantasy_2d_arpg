/** Authoritative seed → walkable terrain → validated Act I landmarks.
 * Identical pure world assembly is used by simulation and renderer.
 * GPL-3.0-only.
 */
import { generateWildernessTerrain, makeWildernessTiles, routeClear, type WildernessTerrainResult } from './wildernessTerrain';
import { planWildernessFeatures, type WildernessFeature } from './wildernessFeatures';
import type { WorldLayout } from './generator';
import { ACTOR_RADIUS, canOccupy, findPath } from './navigation';
import { CORRUPTION_TRAIL_ID, planForestTrail } from './forestTrail';
import { planEnvironmentObjects } from './environmentInteractions';
import { planWorldEvents } from './worldEvents';

const STORY_ROAD_FEATURES: ReadonlySet<string> = new Set([
  'act1.corruption_site', 'act1.corrupted_forest', 'act1.abandoned_graveyard'
]);

function withStoryRoads(
  terrain: WildernessTerrainResult, features: readonly WildernessFeature[]
): WildernessTerrainResult {
  const { camp, obstacles } = terrain.layout;
  const storyRoads = features.filter(feature => STORY_ROAD_FEATURES.has(feature.id))
    .flatMap(feature => {
      for (const radius of [ACTOR_RADIUS, ACTOR_RADIUS + 4]) {
        const points = [{ ...camp }, ...findPath(camp, feature.position, radius, obstacles)];
        if (routeClear(points, obstacles)) return [{
          id: 'road-story-' + feature.id.slice('act1.'.length),
          from: { ...camp }, to: { ...feature.position }, width: 38, points
        }];
      }
      return [];
    });
  const site = features.find(feature => feature.id === 'act1.corruption_site');
  const trail = site && planForestTrail(terrain.layout, site.position);
  if (!trail) return { ...terrain, roads: [...terrain.roads, ...storyRoads] };

  const roads = [...terrain.roads, ...storyRoads.filter(road => road.id !== CORRUPTION_TRAIL_ID),
    ...trail.roads];
  const seed = terrain.layout.seed;
  const environment = planEnvironmentObjects(seed, terrain.layout, features);
  const events = planWorldEvents(seed, terrain.layout, features);
  const destinations = [
    ...features.map(feature => feature.position),
    ...environment.map(object => object.position),
    ...events.flatMap(event => event.enemySpawns.map(spawn => spawn.position))
  ];
  const edges = trail.edgeCandidates.filter(edge =>
    destinations.every(point => canOccupy(point, ACTOR_RADIUS + 30, [edge]))
    && roads.every(road => routeClear(road.points, [edge])));
  const layout = { ...terrain.layout, obstacles: [...obstacles, ...edges] };
  // Existing saves identify landmarks and world events by stable coordinates
  // and props by ID. Keep the pre-existing placements usable on the new roads.
  const unchanged = destinations.every(point =>
    findPath(camp, point, ACTOR_RADIUS, layout.obstacles).length > 0)
    && JSON.stringify(planEnvironmentObjects(seed, layout, features)) === JSON.stringify(environment)
    && JSON.stringify(planWorldEvents(seed, layout, features)) === JSON.stringify(events);
  return { ...terrain, layout: unchanged ? layout : terrain.layout,
    roads, tiles: makeWildernessTiles(seed, roads) };
}

export interface WildernessRuntimeWorld {
  layout: WorldLayout;
  terrain: WildernessTerrainResult;
  features: readonly WildernessFeature[];
  usedFeatureFallback: boolean;
}

/** A failed optional forest generation never removes critical quest destinations. */
export function buildWilderness(seed: number): WildernessRuntimeWorld {
  const initial = generateWildernessTerrain(seed);
  const plan = planWildernessFeatures(seed, initial.layout);
  if (plan.ok) {
    const terrain = withStoryRoads(initial, plan.features);
    return { layout: terrain.layout, terrain, features: plan.features, usedFeatureFallback: false };
  }
  // Deterministic tested seed-zero clearing, with the caller's session seed.
  // Revalidate the entire feature list on the fallback collision geometry.
  const safe = generateWildernessTerrain(0);
  const layout: WorldLayout = {
    seed, camp: { ...safe.layout.camp },
    obstacles: safe.layout.obstacles.map(wall => ({ ...wall })),
    encounterPositions: safe.layout.encounterPositions.map(point => ({ ...point }))
  };
  const retry = planWildernessFeatures(seed, layout);
  if (!retry.ok) throw new Error(
    'Wilderness has no reachable story layout: ' + plan.error.code + '/' + retry.error.code
  );
  const terrain = withStoryRoads({ ...safe, layout }, retry.features);
  return { layout: terrain.layout, terrain, features: retry.features, usedFeatureFallback: true };
}
