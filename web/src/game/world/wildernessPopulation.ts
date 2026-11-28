// GPL-3.0-only — Issue #207 A. Pure final-world ordinary population manifest.
// Runtime activation, leash, HP, death and rewards belong to later slices.
import type {Point} from '../core/types';
import type {EnemyType} from '../enemies/enemies';
import {CAMP_RADIUS} from './generator';
import {ACTOR_RADIUS,canOccupy,findPath} from './navigation';
import {createChunkIndex,chunkForPoint,chunkId,chunkSeed,type ChunkId} from './chunkStreaming';
import {getTownManifest} from './townManifest';
import {WORLD_OBJECTS} from './interactables';
import {planActIDungeonEntrances} from './actIDungeonEntrances';
import {planEnvironmentObjects} from './environmentInteractions';
import {planWorldEvents} from './worldEvents';
import type {TerrainId} from './wildernessTerrain';
import type {WildernessRuntimeWorld} from './wildernessRuntime';

export const MAX_WILDERNESS_GROUPS=14;
export interface PopulationReservation {
  readonly position:Readonly<Point>;
  readonly radius:number;
}
export interface PopulationMember {
  readonly id:string;
  readonly type:EnemyType;
  readonly spawn:Point;
}
export interface PopulationGroup {
  readonly id:string;
  readonly homeChunkId:ChunkId;
  readonly anchor:Point;
  readonly terrainId:TerrainId;
  readonly territoryRadius:number;
  readonly members:readonly PopulationMember[];
}
export interface WildernessPopulation {
  readonly seed:number;
  readonly groups:readonly PopulationGroup[];
}
const distance=(a:Readonly<Point>,b:Readonly<Point>)=>Math.hypot(a.x-b.x,a.y-b.y);
const TERRITORY_RADIUS=96;
const GROUP_SEPARATION=160;
const MEMBER_SEPARATION=ACTOR_RADIUS*2+8;
const ROSTERS:Readonly<Record<Exclude<TerrainId,'town_clearing'>,readonly EnemyType[]>>={
  dark_grass:['wolf','spider','corruptedBoar'],
  dead_leaves:['wolf','ghoul','zombie','spider'],
  corrupted_soil:['fanatic','cultMage','cultHealer','corruptedBoar'],
  broken_stone:['skeleton','skeletonArcher','skeletonMage','wraith'],
  dirt_road:['banditFighter','banditArcher','banditRogue']
};
function mix(n:number):number{
  n=Math.imul(n^(n>>>16),0x7feb352d);
  n=Math.imul(n^(n>>>15),0x846ca68b);
  return (n^(n>>>16))>>>0;
}
/** Protect the authoritative authored and procedural interaction locations.
 * Radii protect spawn positions, not future movement; B must enforce leashes
 * and safe-zone rules separately. Legacy encounters remain reserved until C. */
export function populationReservations(world:WildernessRuntimeWorld):PopulationReservation[]{
  const {layout,features}=world;
  const result:PopulationReservation[]=[];
  const reserve=(position:Readonly<Point>,radius:number)=>{
    result.push({position:{...position},radius});
  };
  reserve(layout.camp,CAMP_RADIUS+100);
  for(const s of world.region?.settlements??[])reserve(s.position,s.radius+100);
  for(const n of getTownManifest())reserve(n.position,110);
  for(const village of world.villages??[])
    for(const resident of village.residents)reserve(resident.position,110);
  for(const structure of world.structures??[])reserve(structure.approach,85);
  for(const object of WORLD_OBJECTS)if(object.zone==='wilderness')reserve(object.position,100);
  for(const entry of planActIDungeonEntrances(world))reserve(entry.position,120);
  for(const position of layout.encounterPositions)reserve(position,85);
  // Optional encounter anchors 1/2 are occupied by named minibosses.
  // Reserve their spawn area too; ordinary population may use nearby terrain.
  for(const feature of features)
    reserve(feature.position,feature.radius+(feature.mandatory?80:55));
  for(const object of planEnvironmentObjects(layout.seed,layout,features))reserve(object.position,85);
  for(const event of planWorldEvents(layout.seed,layout,features)){
    reserve(event.position,event.triggerRadius+30);
    for(const spawn of event.enemySpawns)reserve(spawn.position,75);
  }
  return result;
}

/** One ordinary group per suitable chunk, capped globally. Existing tile
 * centers and a fixed finite local offset search replace random retries.
 * Invalid or incomplete slots are skipped, never spawned in unsafe terrain. */
export function planWildernessPopulation(world:WildernessRuntimeWorld):WildernessPopulation{
  const index=createChunkIndex(world);
  const {layout,features}=world;
  const reservations=populationReservations(world);
  const groups:PopulationGroup[]=[];
  const occupied:Point[]=[];
  const safe=(p:Point)=>reservations.every(r=>distance(p,r.position)>=r.radius)
    &&canOccupy(p,ACTOR_RADIUS,layout.obstacles);
  const reachable=(from:Point,to:Point)=>findPath(from,to,ACTOR_RADIUS,layout.obstacles).length>0;
  // Stable per-chunk priority avoids always filling the northwest first.
  const chunks=[...index.chunks].sort((a,b)=>
    mix(chunkSeed(index.seed,a.id)^0x504f5055)-mix(chunkSeed(index.seed,b.id)^0x504f5055)
    ||a.id.localeCompare(b.id));
  for(const chunk of chunks){
    if(groups.length>=MAX_WILDERNESS_GROUPS)break;
    const seed=mix(chunkSeed(index.seed,chunk.id)^0x47525031);
    const desired=2+seed%3;
    const belongs=(p:Point)=>{
      const coord=chunkForPoint(p);
      return coord!==null&&chunkId(coord)===chunk.id;
    };
    // Prefer local non-story encounter POIs, then deterministic terrain cells.
    const candidates=chunk.tiles.filter(t=>t.terrainId!=='town_clearing').map(t=>({
      anchor:{x:Math.round(t.x+t.width/2),y:Math.round(t.y+t.height/2)},
      terrainId:t.terrainId as Exclude<TerrainId,'town_clearing'>,
      rank:mix(seed^Math.imul(t.x+1,73856093)^Math.imul(t.y+1,19349663))
    })).filter(c=>belongs(c.anchor));
    const affinity=features.filter(f=>!f.mandatory&&f.kind==='encounterZone');
    const nearPoi=(p:Point)=>affinity.some(f=>distance(f.position,p)<=100)?0:1;
    candidates.sort((a,b)=>nearPoi(a.anchor)-nearPoi(b.anchor)||a.rank-b.rank);
    let fallback:PopulationGroup|undefined;
    for(const candidate of candidates){
      const {anchor,terrainId}=candidate;
      if(!safe(anchor)||groups.some(g=>distance(g.anchor,anchor)<GROUP_SEPARATION)
        ||!reachable(layout.camp,anchor))continue;
      const id='population-'+chunk.coord.cx+'-'+chunk.coord.cy+'-1';
      const roster=ROSTERS[terrainId];
      const members:PopulationMember[]=[];
      // Two rings, rotated per chunk. Prefer full size; retain first valid
      // smaller group as fallback if local geometry is cramped.
      for(const radius of [48,76]){
        for(let i=0;i<12&&members.length<desired;i++){
          const theta=(i+seed%12)*Math.PI/6;
          const spawn={x:anchor.x+Math.round(radius*Math.cos(theta)),
            y:anchor.y+Math.round(radius*Math.sin(theta))};
          if(!belongs(spawn)||!safe(spawn)
            ||occupied.some(p=>distance(p,spawn)<MEMBER_SEPARATION)
            ||members.some(m=>distance(m.spawn,spawn)<MEMBER_SEPARATION)
            ||!reachable(anchor,spawn)||!reachable(layout.camp,spawn))continue;
          const slot=members.length;
          members.push({id:id+'-'+(slot+1),type:roster[(seed+slot)%roster.length]!,spawn});
        }
        if(members.length===desired)break;
      }
      if(members.length<2)continue;
      const group:PopulationGroup={id,homeChunkId:chunk.id,anchor,terrainId,
        territoryRadius:TERRITORY_RADIUS,members};
      if(!fallback||members.length>fallback.members.length)fallback=group;
      if(members.length===desired)break;
    }
    if(fallback){
      groups.push(fallback);
      occupied.push(...fallback.members.map(m=>m.spawn));
    }
  }
  return {seed:index.seed,groups:groups.sort((a,b)=>a.id.localeCompare(b.id))};
}
