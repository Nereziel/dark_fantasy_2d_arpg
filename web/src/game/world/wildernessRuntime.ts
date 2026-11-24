/** Authoritative seed → walkable terrain → validated Act I landmarks.
 * Identical pure world assembly is used by simulation and renderer.
 * GPL-3.0-only.
 */
import { generateWildernessTerrain, makeWildernessTiles, routeClear, type WildernessTerrainResult } from './wildernessTerrain';
import { planWildernessFeatures, type WildernessFeature } from './wildernessFeatures';
import type { WorldLayout } from './generator';
import { ACTOR_RADIUS, canOccupy, findPath } from './navigation';
import { planForestTrail } from './forestTrail';
import { planEnvironmentObjects } from './environmentInteractions';
import { planWorldEvents } from './worldEvents';
import { getTownManifest } from './townManifest';
import { WORLD_OBJECTS } from './interactables';
import { planSettlementStructures, type SettlementStructure, type StructureSite } from './settlementStructures';

const STORY_ROAD_FEATURES: ReadonlySet<string> = new Set([
  'act1.corruption_site', 'act1.corrupted_forest', 'act1.abandoned_graveyard'
]);

function withStoryRoads(
  terrain: WildernessTerrainResult, features: readonly WildernessFeature[]
): WildernessTerrainResult {
  const { camp, obstacles } = terrain.layout;
  const site = features.find(feature => feature.id === 'act1.corruption_site');
  const trail = site && planForestTrail(terrain.layout, site.position);
  const storyRoads = features.filter(feature => STORY_ROAD_FEATURES.has(feature.id)
    && !(trail && feature === site))
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
  if (!trail) return { ...terrain, roads: [...terrain.roads, ...storyRoads] };

  const roads = [...terrain.roads, ...storyRoads, ...trail.roads];
  const seed = terrain.layout.seed;
  const environment = planEnvironmentObjects(seed, terrain.layout, features);
  const events = planWorldEvents(seed, terrain.layout, features);
  const destinations = [
    camp,
    ...terrain.layout.encounterPositions,
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
  const unchanged = features.every(feature =>
    findPath(camp, feature.position, ACTOR_RADIUS, layout.obstacles).length > 0)
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
  /** Optional for compatibility with existing fixture world manifests. */
  structures?: readonly SettlementStructure[];
}

/** A failed optional forest generation never removes critical quest destinations. */
function generateWilderness(seed: number): WildernessRuntimeWorld {
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

/** Exterior-only structures, accepted as a single collision-safe extension of
 * the already validated world. Existing story, environment and event positions
 * must not move even when a new candidate changes a placement search result.
 */
function withSettlementStructures(world: WildernessRuntimeWorld): WildernessRuntimeWorld {
  const { layout, terrain, features } = world;
  const { seed, camp } = layout;
  const env = planEnvironmentObjects(seed, layout, features);
  const events = planWorldEvents(seed, layout, features);
  const reserved = [
    ...getTownManifest().map(n=>n.position), ...WORLD_OBJECTS.map(o=>o.position),
    ...features.map(f=>f.position), ...env.map(o=>o.position),
    ...events.map(e=>e.position), ...events.flatMap(e=>e.enemySpawns.map(s=>s.position))
  ];
  // Keep the original town centre open; cluster exterior buildings near its rim.
  const sites: StructureSite[] = [
    {id:'camp.house',kind:'house',anchor:{x:camp.x-150,y:camp.y-100}},
    {id:'camp.smithy',kind:'smithy',anchor:{x:camp.x+190,y:camp.y+80}},
    {id:'camp.storehouse',kind:'house',anchor:{x:camp.x-150,y:camp.y+125}}
  ];
  for (const [i,poi] of features.filter(f=>f.kind==='poi').slice(0,2).entries()) {
    sites.push({id:'wild.'+(i===0?'cabin':'mine'),kind:i===0?'cabin':'mine',
      anchor:{x:poi.position.x+100,y:poi.position.y-55}});
  }
  const plan = planSettlementStructures(layout,terrain.roads,reserved,sites);
  const next: WorldLayout = {...layout,obstacles:[...plan.obstacles]};
  const unchanged = JSON.stringify(planEnvironmentObjects(seed,next,features)) === JSON.stringify(env)
    && JSON.stringify(planWorldEvents(seed,next,features)) === JSON.stringify(events)
    && terrain.roads.every(road=>!routeClear(road.points,layout.obstacles)||routeClear(road.points,next.obstacles));
  if (!unchanged) return {...world,structures:[]};
  return {...world,layout:next,terrain:{...terrain,layout:next},structures:plan.structures};
}

const recentWorlds = new Map<number, WildernessRuntimeWorld>();
const MAX_CACHED_WORLDS = 8;

/** The renderer, simulation and save validation all request the same layout. */
export function buildWilderness(seed: number): WildernessRuntimeWorld {
  const cached = recentWorlds.get(seed);
  if (cached) return structuredClone(cached);
  const world = withSettlementStructures(generateWilderness(seed));
  if (recentWorlds.size >= MAX_CACHED_WORLDS) {
    recentWorlds.delete(recentWorlds.keys().next().value!);
  }
  recentWorlds.set(seed, world);
  return structuredClone(world);
}
