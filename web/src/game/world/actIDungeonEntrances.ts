// GPL-3.0-only — pure entrance and interior contracts; runtime owns transitions.
import type { Point } from '../core/types';
import { CRYPT_GATE } from './generator';
import { ACTOR_RADIUS, canOccupy, findMovementPath } from './navigation';
import { ACT_I_DUNGEON_ENTRANCE_SPACING } from './wildernessFeatures';
import { generateProceduralDungeon, type ProceduralDungeonResult } from './proceduralDungeon';
import type { WildernessRuntimeWorld } from './wildernessRuntime';

export const ACT_I_DUNGEON_IDS=['crypt','mine','cave'] as const;
export type ActIDungeonId=typeof ACT_I_DUNGEON_IDS[number];
type DungeonTheme='corrupted_crypt'|'abandoned_mine'|'forest_cave';
export interface ActIDungeonEntrance {
  readonly id:ActIDungeonId;
  readonly theme:DungeonTheme;
  readonly position:Readonly<Point>;
  readonly returnPosition:Readonly<Point>;
  readonly interiorSeed:number;
  readonly sourceId:string;
  readonly required:boolean;
}
const DOMAIN:Readonly<Record<ActIDungeonId,number>>={
  crypt:0,mine:0x4d494e45,cave:0x43415645
};
function validSeed(seed:number):boolean{
  return Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff;
}
function validId(id:unknown):id is ActIDungeonId{
  return ACT_I_DUNGEON_IDS.some(value=>value===id);
}

/** Distinct bijective uint32 domains within a session; legacy crypt seed unchanged. */
export function dungeonInteriorSeed(seed:number,id:unknown):number{
  if(!validSeed(seed)||!validId(id))throw new RangeError('Invalid Act I dungeon identity');
  return (seed^DOMAIN[id])>>>0;
}

/** Resolve optional entries only from actual final world anchors. No geometry,
 * discovery, combat or world state changes. An unavailable optional entrance
 * is omitted only if no compatible pair of actual anchors exists (e.g. an
 * incomplete fixture); no unchecked coordinate is substituted.
 */
export function planActIDungeonEntrances(world:WildernessRuntimeWorld):ActIDungeonEntrance[]{
  const {layout}=world;
  if(!validSeed(layout.seed))throw new RangeError('Invalid Act I world seed');
  const reachable=(p:Readonly<Point>)=>canOccupy(p,ACTOR_RADIUS,layout.obstacles)
    &&findMovementPath(layout.camp,p,ACTOR_RADIUS,layout.obstacles).length>0;
  const entries:ActIDungeonEntrance[]=[];
  const append=(id:ActIDungeonId,theme:DungeonTheme,p:Readonly<Point>,sourceId:string,required=false)=>{
    if(!reachable(p)||entries.some(e=>Math.hypot(e.position.x-p.x,e.position.y-p.y)<ACT_I_DUNGEON_ENTRANCE_SPACING))return false;
    entries.push({id,theme,position:{...p},returnPosition:{...p},sourceId,required,
      interiorSeed:dungeonInteriorSeed(layout.seed,id)});
    return true;
  };
  if(!append('crypt','corrupted_crypt',CRYPT_GATE,'act1.crypt_entrance',true))
    throw new RangeError('Required crypt entrance unreachable');
  type Anchor={sourceId:string;position:Readonly<Point>};
  const mine=world.structures?.find(s=>s.id==='wild.mine'&&s.kind==='mine');
  const pois:Anchor[]=world.features.filter(f=>f.kind==='poi')
    .map(f=>({sourceId:f.id,position:f.position}));
  const mineStructure:Anchor|undefined=mine?{sourceId:mine.id,position:mine.approach}:undefined;
  const minePoi=pois.find(p=>p.sourceId==='wild.poi.2');
  const cavePoi=pois.find(p=>p.sourceId==='wild.poi.3');
  const ordered=(...groups:(Anchor|undefined)[]):Anchor[]=>{
    const seen=new Set<string>();
    return groups.filter((p):p is Anchor=>p!==undefined)
      .filter(p=>{if(seen.has(p.sourceId))return false;seen.add(p.sourceId);return true;});
  };
  const separated=(a:Readonly<Point>,b:Readonly<Point>)=>
    Math.hypot(a.x-b.x,a.y-b.y)>=ACT_I_DUNGEON_ENTRANCE_SPACING;
  const legal=(p:Anchor)=>separated(p.position,CRYPT_GATE)&&reachable(p.position);
  const mineCandidates=ordered(mineStructure,minePoi,...pois.filter(p=>p!==cavePoi),cavePoi).filter(legal);
  const caveCandidates=ordered(cavePoi,...pois.filter(p=>p!==minePoi),minePoi).filter(legal);
  // Select the two entrances together. A mine structure must not consume
  // the only valid cave approach; prefer the authored cave and then mine.
  for(const cave of caveCandidates){
    const other=mineCandidates.find(p=>p.sourceId!==cave.sourceId&&separated(p.position,cave.position));
    if(!other)continue;
    append('mine','abandoned_mine',other.position,other.sourceId);
    append('cave','forest_cave',cave.position,cave.sourceId);
    return entries;
  }
  // For a deliberately incomplete fixture, keep only safe authored entries.
  // The strict runtime-world seed sweep rejects incomplete generated worlds.
  const fallbackMine=mineCandidates.find(p=>p===mineStructure||p===minePoi);
  if(fallbackMine)append('mine','abandoned_mine',fallbackMine.position,fallbackMine.sourceId);
  if(cavePoi)append('cave','forest_cave',cavePoi.position,cavePoi.sourceId);
  return entries;
}

/** Generate validated interior geometry lazily from a known dungeon identity.
 * This is not permission to enter: callers must resolve a published entrance
 * and authorize proximity in the current wilderness before switching zones.
 */
export function buildActIDungeonInterior(seed:number,id:ActIDungeonId):ProceduralDungeonResult{
  return generateProceduralDungeon(dungeonInteriorSeed(seed,id));
}
