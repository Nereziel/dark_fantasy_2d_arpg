/**
 * Prompt 38 — collision-safe wilderness interactions, independent of the
 * original map fingerprint / chunk index. Pure: no rewards, timers or globals.
 * The central click resolver is shared with historic chests, crypt props and NPCs.
 * GPL-3.0-only.
 */
import type { Point } from '../core/types';
import type { WorldLayout } from './generator';
import { CAMP, CAMP_RADIUS } from './generator';
import { ACTOR_RADIUS, WORLD_HEIGHT, WORLD_WIDTH, canOccupy, findPath } from './navigation';
import type { WildernessFeature } from './wildernessFeatures';
import { MANDATORY_FEATURE_IDS } from './wildernessFeatures';
import { WORLD_OBJECTS } from './interactables';
import { NPC_POSITIONS } from './npcs';

export const ENVIRONMENT_IDS = [
  'env.chest','env.door','env.lockedDoor','env.lever',
  'env.shrineDamage','env.shrineArmor','env.shrineSpeed',
  'env.shrineRegeneration','env.shrineResource','env.shrineLoot',
  'env.trap','env.barrel','env.crate','env.hiddenWall','env.lore'
] as const;
export type EnvironmentObjectId = typeof ENVIRONMENT_IDS[number];
export type EnvironmentKind = 'chest'|'door'|'lockedDoor'|'lever'|'shrine'
  |'trap'|'barrel'|'crate'|'hiddenWall'|'lore';
export const SHRINE_BONUSES = [
  'damage','armor','speed','regeneration','resource','loot'
] as const;
export type ShrineBonus = typeof SHRINE_BONUSES[number];
export const SHRINE_DURATION_SECONDS=24;
export interface ShrineBlessing {
  readonly kind:ShrineBonus;
  readonly remaining:number;
}
export interface EnvironmentObject {
  readonly id:EnvironmentObjectId;
  readonly kind:EnvironmentKind;
  readonly zone:'wilderness';
  readonly position:Readonly<Point>;
  readonly hitRadius:number;
  readonly reach:number;
  readonly requiresId?:EnvironmentObjectId;
  readonly shrineBonus?:ShrineBonus;
}
interface Spec {
  readonly id:EnvironmentObjectId;readonly kind:EnvironmentKind;
  readonly anchor:Readonly<Point>;readonly requiresId?:EnvironmentObjectId;
  readonly shrineBonus?:ShrineBonus;
}
const SPECS:readonly Spec[]=[
  {id:'env.chest',kind:'chest',anchor:{x:710,y:900}},
  {id:'env.door',kind:'door',anchor:{x:810,y:1000}},
  {id:'env.lockedDoor',kind:'lockedDoor',anchor:{x:1120,y:1030},requiresId:'env.lever'},
  {id:'env.lever',kind:'lever',anchor:{x:1010,y:1130}},
  {id:'env.shrineDamage',kind:'shrine',anchor:{x:1080,y:260},shrineBonus:'damage'},
  {id:'env.shrineArmor',kind:'shrine',anchor:{x:1650,y:220},shrineBonus:'armor'},
  {id:'env.shrineSpeed',kind:'shrine',anchor:{x:1950,y:440},shrineBonus:'speed'},
  {id:'env.shrineRegeneration',kind:'shrine',anchor:{x:1800,y:930},shrineBonus:'regeneration'},
  {id:'env.shrineResource',kind:'shrine',anchor:{x:1710,y:1240},shrineBonus:'resource'},
  {id:'env.shrineLoot',kind:'shrine',anchor:{x:1190,y:1190},shrineBonus:'loot'},
  {id:'env.trap',kind:'trap',anchor:{x:1550,y:1120}},
  {id:'env.barrel',kind:'barrel',anchor:{x:1620,y:450}},
  {id:'env.crate',kind:'crate',anchor:{x:1180,y:390}},
  {id:'env.hiddenWall',kind:'hiddenWall',anchor:{x:1320,y:1030},requiresId:'env.lever'},
  {id:'env.lore',kind:'lore',anchor:{x:750,y:260}}
];
const distance=(a:Readonly<Point>,b:Readonly<Point>)=>Math.hypot(a.x-b.x,a.y-b.y);
const isSeed=(seed:unknown):seed is number=>typeof seed==='number'
  &&Number.isSafeInteger(seed)&&seed>=0&&seed<=0xffffffff;
function validInputs(seed:number,layout:unknown,features:unknown):layout is WorldLayout {
  if(!isSeed(seed)||!layout||typeof layout!=='object'
    ||!Array.isArray(features)||features.length<7||features.length>200)return false;
  const world=layout as Partial<WorldLayout>;
  return world.seed===seed&&!!world.camp&&world.camp.x===CAMP.x&&world.camp.y===CAMP.y
    &&Array.isArray(world.obstacles)&&world.obstacles.length>0&&world.obstacles.length<=512
    &&world.obstacles.every(o=>o&&typeof o.id==='string'
      &&[o.x,o.y,o.width,o.height].every(Number.isFinite)
      &&o.width>0&&o.height>0)
    &&Array.isArray(world.encounterPositions)
    &&world.encounterPositions.length>0&&world.encounterPositions.length<=128
    &&world.encounterPositions.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))
    &&MANDATORY_FEATURE_IDS.every(id=>features.some((f:WildernessFeature)=>f.id===id))
    &&features.every((f:WildernessFeature)=>f&&f.position
      &&Number.isFinite(f.position.x)&&Number.isFinite(f.position.y)
      &&Number.isFinite(f.radius)&&f.radius>0&&f.radius<=150);
}
function validPlacement(p:Point,layout:WorldLayout,features:readonly WildernessFeature[],
  placed:readonly EnvironmentObject[]):boolean {
  if(!canOccupy(p,ACTOR_RADIUS,layout.obstacles)
    ||p.x<60||p.x>WORLD_WIDTH-60||p.y<60||p.y>WORLD_HEIGHT-60
    ||distance(p,CAMP)<CAMP_RADIUS+92
    ||Object.values(NPC_POSITIONS).some(n=>distance(p,n)<100)
    ||layout.encounterPositions.some(e=>distance(p,e)<95)
    ||features.some(f=>f.mandatory&&distance(p,f.position)<=f.radius+27)
    ||WORLD_OBJECTS.some(o=>distance(p,o.position)<o.hitRadius+50)
    ||placed.some(o=>distance(p,o.position)<78))return false;
  return findPath(CAMP,p,ACTOR_RADIUS,layout.obstacles).length>0;
}
function candidates(anchor:Readonly<Point>,seed:number,index:number):Point[] {
  const places:Point[]=[{x:anchor.x,y:anchor.y}];
  const shift=((seed>>>4)+index*7)%16;
  for(const radius of [58,116,174,232,290,348,406]){
    for(let i=0;i<24;i++){
      const theta=(i+shift%24)*Math.PI/12;
      places.push({x:Math.round(anchor.x+Math.cos(theta)*radius),
        y:Math.round(anchor.y+Math.sin(theta)*radius)});
    }
  }
  return places;
}
/** Invalid layouts fail closed. Existing terrain, roads, NPCs and story points stay untouched. */
export function planEnvironmentObjects(seed:number,layout:Readonly<WorldLayout>,
  features:readonly WildernessFeature[]):EnvironmentObject[] {
  if(!validInputs(seed,layout,features))return [];
  const placed:EnvironmentObject[]=[];
  for(const [index,spec] of SPECS.entries()){
    const candidate=candidates(spec.anchor,seed,index)
      .find(p=>validPlacement(p,layout,features,placed));
    if(!candidate)return []; // Never ship a partially dependent door/lever catalog.
    placed.push({
      id:spec.id,kind:spec.kind,zone:'wilderness',
      position:candidate,hitRadius:spec.kind==='shrine'?30:26,
      reach:spec.kind==='shrine'?64:58,
      ...(spec.requiresId?{requiresId:spec.requiresId}:{}),
      ...(spec.shrineBonus?{shrineBonus:spec.shrineBonus}:{})
    });
  }
  return placed;
}
export function validEnvironmentUsedIds(value:unknown):value is EnvironmentObjectId[] {
  return Array.isArray(value)&&value.length<=ENVIRONMENT_IDS.length
    &&value.every(id=>typeof id==='string'
      &&(ENVIRONMENT_IDS as readonly string[]).includes(id))
    &&new Set(value).size===value.length;
}
export function validShrineBlessings(value:unknown):value is ShrineBlessing[] {
  if(!Array.isArray(value)||value.length>SHRINE_BONUSES.length)return false;
  const seen=new Set<string>();
  return value.every(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item)
      ||typeof item.kind!=='string'
      ||!(SHRINE_BONUSES as readonly string[]).includes(item.kind)
      ||seen.has(item.kind)
      ||typeof item.remaining!=='number'||!Number.isFinite(item.remaining)
      ||item.remaining<=0||item.remaining>SHRINE_DURATION_SECONDS)return false;
    seen.add(item.kind);
    return Object.keys(item).length===2;
  });
}
export function visibleEnvironmentObjects(all:readonly EnvironmentObject[],
  used:readonly EnvironmentObjectId[]):EnvironmentObject[] {
  if(!Array.isArray(all)||!validEnvironmentUsedIds(used))return [];
  const consumed=new Set(used);
  return all.filter(obj=>!consumed.has(obj.id)
    &&(obj.kind!=='hiddenWall'||!!obj.requiresId&&consumed.has(obj.requiresId)))
    .map(obj=>({...obj,position:{...obj.position}}));
}
export function planEnvironmentInteraction(id:unknown,all:readonly EnvironmentObject[],
  used:readonly EnvironmentObjectId[]):EnvironmentObject|null {
  if(typeof id!=='string'||!(ENVIRONMENT_IDS as readonly string[]).includes(id)
    ||!validEnvironmentUsedIds(used)||!Array.isArray(all)
    ||used.includes(id as EnvironmentObjectId))return null;
  const obj=all.find(entry=>entry.id===id);
  return obj&&(!obj.requiresId||used.includes(obj.requiresId))?obj:null;
}
