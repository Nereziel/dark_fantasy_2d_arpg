/**
 * Prompt 42: pure collision-aware Rogue combat geometry, backstab and traps.
 * No RNG, Phaser, UI, save mutation or enemy damage here. GPL-3.0-only.
 */
import {canOccupy,hasLineOfSight,ACTOR_RADIUS,type Obstacle} from '../world/navigation';
import type {Point} from '../core/types';
export interface RogueTarget extends Point{readonly id:string;readonly alive:boolean}
export interface RogueTrap extends Point{
 readonly id:string;readonly ownerId:string;readonly zone:'wilderness'|'crypt';
 readonly remaining:number;readonly radius:number;readonly damage:number;
}
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const point=(p:unknown):p is Point=>{
 if(!p||typeof p!=='object')return false;
 const v=p as Partial<Point>;
 return finite(v.x)&&finite(v.y)&&v.x>=0&&v.x<=2200&&v.y>=0&&v.y<=1400;
};
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const ID=/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,90}$/;
const owner=(id:unknown):id is string=>typeof id==='string'
  &&ID.test(id)&&!['__proto__','prototype','constructor'].includes(id);
const zone=(s:unknown):s is 'wilderness'|'crypt'=>s==='wilderness'||s==='crypt';
function obstaclesOk(v:unknown):v is readonly Obstacle[]{
 return Array.isArray(v)&&v.length<=600&&v.every(o=>o&&owner(o.id)
   &&point({x:o.x,y:o.y})&&finite(o.width)&&finite(o.height)
   &&o.width>0&&o.height>0&&o.x+o.width<=2200&&o.y+o.height<=1400);
}
/** Directional spray, deterministic target order and bounded one-hit-per-target. */
export function planRogueMultishot(from:Point,aim:Point,targets:readonly RogueTarget[],
 range:number,angle:number,walls:readonly Obstacle[],maxHits:number):string[]{
 if(!point(from)||!point(aim)||dist(from,aim)<1
   ||!finite(range)||range<=0||range>600||!finite(angle)||angle<=0||angle>Math.PI
   ||!Number.isSafeInteger(maxHits)||maxHits<1||maxHits>12
   ||!obstaclesOk(walls)||!Array.isArray(targets)||targets.length>256)return [];
 const dx=(aim.x-from.x)/dist(from,aim),dy=(aim.y-from.y)/dist(from,aim);
 return targets.filter(e=>e&&owner(e.id)&&point({x:e.x,y:e.y})&&e.alive
   &&dist(from,e)<=range&&dist(from,e)>0
   &&((e.x-from.x)*dx+(e.y-from.y)*dy)/dist(from,e)>=Math.cos(angle/2)
   &&hasLineOfSight(from,e,walls))
   .sort((a,b)=>dist(from,a)-dist(from,b)||a.id.localeCompare(b.id))
   .slice(0,maxHits).map(e=>e.id);
}
/** Enemy facing is toward its last telegraphed strike location; behind is a bonus. */
export function planRogueBackstab(from:Point,target:Point,
 facing:Point,stealth:boolean):number{
 if(!point(from)||!point(target)||!finite(facing.x)||!finite(facing.y)
   ||typeof stealth!=='boolean')return 1;
 const d=dist(from,target),f=Math.hypot(facing.x,facing.y);
 const rear=d>0.1&&f>0.1
   &&((from.x-target.x)*facing.x+(from.y-target.y)*facing.y)/(d*f)<-0.32;
 return rear&&stealth?2.35:rear?1.85:stealth?1.65:1;
}
/** Never teleport through walls or farther than the cast's range. */
export function planRogueStep(from:Point,target:Point,range:number,
 walls:readonly Obstacle[]):Point|null{
 if(!point(from)||!point(target)||!finite(range)||range<45||range>400
   ||dist(from,target)>range||dist(from,target)<1||!obstaclesOk(walls))return null;
 const d=dist(from,target),dx=(target.x-from.x)/d,dy=(target.y-from.y)/d;
 const proposals=[
   {x:target.x+dx*46,y:target.y+dy*46},
   {x:target.x+dy*45,y:target.y-dx*45},
   {x:target.x-dy*45,y:target.y+dx*45}
 ];
 return proposals.find(p=>canOccupy(p,ACTOR_RADIUS,walls)
   &&hasLineOfSight(from,p,walls))??null;
}
export function createRogueTrap(ownerId:unknown,sequence:unknown,
 mapZone:unknown,position:unknown,walls:readonly Obstacle[]):RogueTrap|null{
 if(!owner(ownerId)||!Number.isSafeInteger(sequence)||typeof sequence!=='number'
   ||sequence<1||sequence>100000000||!zone(mapZone)||!point(position)
   ||!obstaclesOk(walls)||!canOccupy(position,ACTOR_RADIUS,walls))return null;
 return {id:'rogue-trap.'+ownerId+'.'+sequence,ownerId,zone:mapZone,
   x:position.x,y:position.y,remaining:18,radius:58,damage:1.25};
}
export function validRogueTraps(value:unknown):value is readonly RogueTrap[]{
 if(!Array.isArray(value)||value.length>3)return false;
 const ids=new Set<string>();
 for(const trap of value as RogueTrap[]){
   if(!trap||!owner(trap.ownerId)||!owner(trap.id)||ids.has(trap.id)
     ||!trap.id.startsWith('rogue-trap.'+trap.ownerId+'.')
     ||!/^[1-9][0-9]{0,8}$/.test(trap.id.slice(('rogue-trap.'+trap.ownerId+'.').length))
     ||!zone(trap.zone)||!point({x:trap.x,y:trap.y})
     ||!finite(trap.remaining)||trap.remaining<=0||trap.remaining>18
     ||trap.radius!==58||trap.damage!==1.25)return false;
   ids.add(trap.id);
 }
 return true;
}
export function tickRogueTraps(input:unknown,dt:unknown,mapZone:unknown,
 enemies:readonly RogueTarget[],walls:readonly Obstacle[]):
 {traps:RogueTrap[];hits:{trapId:string;id:string;power:number}[]}|null{
 if(!validRogueTraps(input)||!finite(dt)||dt<=0||dt>1
   ||!zone(mapZone)||!obstaclesOk(walls)||!Array.isArray(enemies)
   ||enemies.length>256)return null;
 const traps:RogueTrap[]=[],hits:{trapId:string;id:string;power:number}[]=[];
 for(const t of input){
   if(t.zone!==mapZone||t.remaining<=dt)continue;
   const targets=enemies.filter(e=>e&&owner(e.id)&&point({x:e.x,y:e.y})&&e.alive
     &&dist(t,e)<=t.radius&&hasLineOfSight(t,e,walls))
     .sort((a,b)=>dist(t,a)-dist(t,b)||a.id.localeCompare(b.id));
   if(targets.length){
     const enemy=targets[0]!;
     hits.push({trapId:t.id,id:enemy.id,power:t.damage});
   }else traps.push({...t,remaining:t.remaining-dt});
 }
 return {traps,hits};
}
