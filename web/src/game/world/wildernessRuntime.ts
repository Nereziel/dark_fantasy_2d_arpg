/** Authoritative seed → walkable terrain → validated Act I landmarks.
 * Identical pure world assembly is used by simulation and renderer.
 * GPL-3.0-only.
 */
import { generateWildernessTerrain, makeWildernessTiles, routeClear, validateWildernessTerrain, type WildernessTerrainResult } from './wildernessTerrain';
import { planWildernessFeatures, type WildernessFeature } from './wildernessFeatures';
import type { WorldLayout } from './generator';
import { ACTOR_RADIUS, canOccupy, findPath } from './navigation';
import { planForestTrail } from './forestTrail';
import { planEnvironmentObjects } from './environmentInteractions';
import { planWorldEvents } from './worldEvents';
import { getTownManifest } from './townManifest';
import { WORLD_OBJECTS } from './interactables';
import { planSettlementStructures, type SettlementStructure, type StructureSite } from './settlementStructures';
import { planRegionalLandscape, type RegionalLandform } from './regionalLandscape';
import { planActOneTopology, regionalRoadClear, type RegionalSite, type RegionalTopology } from './regionalTopology';
import { planVillagePopulation, type VillagePopulation } from './villagePopulation';

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
  villages?: readonly VillagePopulation[];
  region?: Extract<RegionalTopology,{ok:true}> & {
    readonly forms: readonly RegionalLandform[];
    readonly usedLandscapeFallback: boolean;
  };
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

/** Extend the validated legacy runtime without altering previously placed
 * quest targets, events or props. Keep old roads for compatibility in this
 * migration slice; the regional graph is an additive shared road network.
 */
function withRegionalTopology(world: WildernessRuntimeWorld, allowLandscape = true): WildernessRuntimeWorld {
  const { layout, terrain, features } = world;
  const { seed } = layout;
  const env = planEnvironmentObjects(seed,layout,features);
  const events = planWorldEvents(seed,layout,features);
  const reserved = [
    ...getTownManifest().map(n=>n.position), ...WORLD_OBJECTS.map(o=>o.position),
    ...features.map(f=>f.position), ...env.map(o=>o.position),
    ...events.map(e=>e.position), ...events.flatMap(e=>e.enemySpawns.map(s=>s.position)),
    ...(world.structures??[]).map(s=>s.approach)
  ];
  const sites: RegionalSite[] = (world.structures??[])
    .filter(s=>s.kind==='cabin'||s.kind==='mine')
    .map(s=>({id:s.id.replaceAll('.','-'),kind:s.kind==='mine'?'mine':'cabin',
      position:s.approach,access:'trail'}));
  for (const feature of features.filter(f=>f.kind==='poi'||f.kind==='treasure')) {
    sites.push({id:feature.id.replaceAll('.','-'),kind:feature.kind==='poi'?'clearing':'ruin',
      position:feature.position,access:'offroad'});
  }
  const candidate=allowLandscape?planRegionalLandscape(layout,terrain.tiles,sites,reserved,terrain.roads):null;
  const accepted=candidate?.ok
    && JSON.stringify(planEnvironmentObjects(seed,candidate.layout,features))===JSON.stringify(env)
    && JSON.stringify(planWorldEvents(seed,candidate.layout,features))===JSON.stringify(events)
    && terrain.roads.every(road=>!routeClear(road.points,layout.obstacles)||routeClear(road.points,candidate.layout.obstacles))
      ?candidate:null;
  // Even if the macro landforms cannot be committed, retain a valid topology
  // on the original geometry. No fallback draws unchecked roads.
  const topology=accepted?accepted.topology:planActOneTopology(layout,terrain.tiles,sites,reserved);
  if(!topology.ok)return world;
  const next=accepted?accepted.layout:layout;
  const forms=accepted?accepted.forms:[];
  const painted=accepted?accepted.tiles:terrain.tiles;
  // Existing chunk/map pipeline requires the road- prefix.
  const newRoads=topology.roads.map(road=>({...road,id:'road-'+road.id,
    fromId:road.kind==='trail'?'road-'+road.fromId:road.fromId}));
  if(newRoads.some(road=>!regionalRoadClear(road.points,road.width,next.obstacles)))return world;
  const roads=[...terrain.roads,...newRoads];
  const marked=makeWildernessTiles(seed,roads);
  const tiles=marked.map((tile,i)=>{
    const center={x:tile.x+tile.width/2,y:tile.y+tile.height/2};
    if(topology.settlements.some(s=>Math.hypot(center.x-s.position.x,center.y-s.position.y)<=s.radius))
      return {...tile,terrainId:'town_clearing' as const,variant:0};
    if(tile.terrainId==='dirt_road'||tile.terrainId==='town_clearing')return tile;
    return painted[i]??tile;
  });
  return {...world,layout:next,terrain:{...terrain,layout:next,roads,tiles},
    region:{...topology,roads:newRoads,forms,usedLandscapeFallback:!accepted||accepted.usedFallback}};
}

/** Populate the already connected regional clearings without changing any
 * quest or existing service positions. Resident capabilities remain planned.
 */
function withVillagePopulation(world: WildernessRuntimeWorld): WildernessRuntimeWorld {
  if(!world.region)return world;
  const {layout,terrain,features}=world;
  const seed=layout.seed;
  const env=planEnvironmentObjects(seed,layout,features);
  const events=planWorldEvents(seed,layout,features);
  const reserved=[
    ...getTownManifest().map(n=>n.position),...WORLD_OBJECTS.map(o=>o.position),
    ...features.map(f=>f.position),...env.map(o=>o.position),
    ...events.map(e=>e.position),...events.flatMap(e=>e.enemySpawns.map(s=>s.position)),
    ...(world.structures??[]).map(s=>s.approach),
    ...world.region.forms.flatMap(f=>f.pass?[f.pass]:[])
  ];
  const plan=planVillagePopulation(layout,world.region.settlements,terrain.roads,reserved);
  const next:WorldLayout={...layout,obstacles:[...plan.obstacles]};
  if(JSON.stringify(planEnvironmentObjects(seed,next,features))!==JSON.stringify(env)
    ||JSON.stringify(planWorldEvents(seed,next,features))!==JSON.stringify(events)
    ||terrain.roads.some(r=>routeClear(r.points,layout.obstacles)&&!routeClear(r.points,next.obstacles))
    ||world.region.forms.some(f=>f.pass&&!canOccupy(f.pass,42,next.obstacles)))
    return {...world,villages:[]};
  return {...world,layout:next,terrain:{...terrain,layout:next},villages:plan.villages,
    structures:[...(world.structures??[]),...plan.villages.flatMap(v=>v.structures)]};
}

/** Publish the regional graph only after both settlements are populated.
 * Pruning roads is a presentation change: protected geometry and all
 * pedestrian destinations stay unchanged. A failed validation keeps legacy.
 */
function withRegionalRoadNetwork(world: WildernessRuntimeWorld): WildernessRuntimeWorld {
  if(!world.region||world.villages?.length!==2)return world;
  const {terrain,layout}=world;
  const roads=terrain.roads.filter(r=>r.id==='road-crypt-gate'||r.id==='road-forest-side'
    ||r.id.startsWith('road-story-')||/^road-(trade|trail)-/.test(r.id));
  const marked=makeWildernessTiles(layout.seed,roads);
  const tiles=marked.map((tile,i)=>{
    const previous=terrain.tiles[i];
    if(previous?.terrainId==='town_clearing')return previous;
    if(tile.terrainId==='dirt_road'||tile.terrainId==='town_clearing')return tile;
    // Reuse macro material bands only when they were not a removed road.
    return previous&&previous.terrainId!=='dirt_road'?previous:tile;
  });
  const regional:WildernessTerrainResult={...terrain,roads,tiles,roadNetwork:'regional'};
  if(validateWildernessTerrain(regional).length)return world;
  return {...world,terrain:regional};
}

const recentWorlds = new Map<number, WildernessRuntimeWorld>();
const MAX_CACHED_WORLDS = 8;

/** The renderer, simulation and save validation all request the same layout. */
export function buildWilderness(seed: number): WildernessRuntimeWorld {
  const cached = recentWorlds.get(seed);
  if (cached) return structuredClone(cached);
  const base=withSettlementStructures(generateWilderness(seed));
  let world=withVillagePopulation(withRegionalTopology(base));
  // Mandatory populated settlements outrank optional macro landforms.
  // Retry at most once, keeping the better population and original world on
  // a tie. Both proposals use the same seed and protected story geometry.
  if((world.villages?.length??0)<2 && world.region?.forms.length){
    const fallback=withVillagePopulation(withRegionalTopology(base,false));
    if((fallback.villages?.length??0)>(world.villages?.length??0))world=fallback;
  }
  if (recentWorlds.size >= MAX_CACHED_WORLDS) {
    recentWorlds.delete(recentWorlds.keys().next().value!);
  }
  const published=withRegionalRoadNetwork(world);
  recentWorlds.set(seed, published);
  return structuredClone(published);
}
