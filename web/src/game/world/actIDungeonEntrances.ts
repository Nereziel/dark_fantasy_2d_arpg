// GPL-3.0-only — pure entrance and interior contracts; runtime owns transitions.
import type { Point } from '../core/types';
import { CRYPT_GATE } from './generator';
import { ACTOR_RADIUS, canOccupy, findPath } from './navigation';
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
 * is omitted; no unchecked coordinate is substituted.
 */
export function planActIDungeonEntrances(world:WildernessRuntimeWorld):ActIDungeonEntrance[]{
  const {layout}=world;
  if(!validSeed(layout.seed))throw new RangeError('Invalid Act I world seed');
  const reachable=(p:Readonly<Point>)=>canOccupy(p,ACTOR_RADIUS,layout.obstacles)
    &&findPath(layout.camp,p,ACTOR_RADIUS,layout.obstacles).length>0;
  const entries:ActIDungeonEntrance[]=[];
  const append=(id:ActIDungeonId,theme:DungeonTheme,p:Readonly<Point>,sourceId:string,required=false)=>{
    if(!reachable(p)||entries.some(e=>Math.hypot(e.position.x-p.x,e.position.y-p.y)<96))return false;
    entries.push({id,theme,position:{...p},returnPosition:{...p},sourceId,required,
      interiorSeed:dungeonInteriorSeed(layout.seed,id)});
    return true;
  };
  if(!append('crypt','corrupted_crypt',CRYPT_GATE,'act1.crypt_entrance',true))
    throw new RangeError('Required crypt entrance unreachable');
  const mine=world.structures?.find(s=>s.id==='wild.mine'&&s.kind==='mine');
  const minePoi=world.features.find(f=>f.id==='wild.poi.2'&&f.kind==='poi');
  if(!(mine&&append('mine','abandoned_mine',mine.approach,mine.id))&&minePoi)
    append('mine','abandoned_mine',minePoi.position,minePoi.id);
  const cave=world.features.find(f=>f.id==='wild.poi.3'&&f.kind==='poi');
  if(cave)append('cave','forest_cave',cave.position,cave.id);
  return entries;
}

/** Generate validated interior geometry lazily from a known dungeon identity.
 * This is not permission to enter: callers must resolve a published entrance
 * and authorize proximity in the current wilderness before switching zones.
 */
export function buildActIDungeonInterior(seed:number,id:ActIDungeonId):ProceduralDungeonResult{
  return generateProceduralDungeon(dungeonInteriorSeed(seed,id));
}
