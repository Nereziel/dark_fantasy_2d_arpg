// GPL-3.0-only — distinct encounters using existing canonical monster families.
import type {Point} from '../core/types';
import {ENEMY_DEFINITIONS,PACK_SIZE,type EnemyType,type EnemyUnit,type EnemyIntent} from './enemies';
import type {OptionalDungeonId} from '../world/optionalDungeonVisit';
import type {MonsterAction} from './monsterRuntime';
import {ACTOR_RADIUS,canOccupy,hasLineOfSight,movementSegmentClear,type Obstacle} from '../world/navigation';

type Stage=0|1;
const ROSTERS:Readonly<Record<OptionalDungeonId,readonly [readonly EnemyType[],readonly EnemyType[]]>>={
  mine:[['banditFighter','banditArcher','banditRogue'],['fanatic','cultHealer','banditArcher']],
  cave:[['spider','wolf','ghoul'],['corruptedBoar','spider','wolf']]
};
// Historical claim IDs are persisted in world v1; never change them when
// replacing the monsters occupying the corresponding encounter positions.
const REWARD_SLOTS=['skeleton-1','wolf-2','wraith-3','crypt_lord-4','skeleton-5','wraith-6'] as const;

export function optionalDungeonRoster(id:OptionalDungeonId,stage:Stage):readonly EnemyType[]{
  return ROSTERS[id][stage];
}
function actorId(type:EnemyType,stage:Stage,index:number):string{
  return type+'-'+(stage*PACK_SIZE+index+1);
}
export function optionalDungeonRewardSlot(id:OptionalDungeonId,stage:Stage,actor:string):string|null{
  const index=optionalDungeonRoster(id,stage).findIndex((type,i)=>actorId(type,stage,i)===actor);
  return index<0?null:REWARD_SLOTS[stage*PACK_SIZE+index]??null;
}
export function isOptionalDungeonBoss(id:OptionalDungeonId|undefined,stage:Stage,actor:string):boolean{
  return !!id&&stage===1&&actor===actorId(optionalDungeonRoster(id,1)[0]!,1,0);
}

export function createOptionalDungeonPack(id:OptionalDungeonId,stage:Stage,level:number,positions:readonly Point[]):EnemyUnit[]{
  return optionalDungeonRoster(id,stage).map((type,index)=>{
    const def=ENEMY_DEFINITIONS[type],position=positions[index]!;
    const boss=stage===1&&index===0;
    const health=Math.round(boss
      ? Math.max(420,def.health*2.5)+Math.max(0,level-1)*32
      : def.health*1.35+Math.max(0,level-1)*18);
    return {actor:{id:actorId(type,stage,index),type,level,...position,health,maxHealth:health,alive:true},
      intent:null,cooldown:.65+index*.3,effects:[],abilityCooldowns:{}};
  });
}

/** Boss-only actions use the normal EnemyIntent telegraph and ability timers.
 * Optional dungeon identity and canonical actor ID are both required. */
const BOSS_ACTIONS:Readonly<Record<OptionalDungeonId,MonsterAction>>={
  mine:{id:'foremanSmash',kind:'damage',attack:'sweep',range:120,areaRadius:120,
    windup:1.35,cooldown:6,damage:45},
  cave:{id:'depthsCharge',kind:'damage',attack:'leap',range:220,areaRadius:72,
    windup:1.45,cooldown:7,damage:48}
};
export function optionalDungeonBossAction(id:OptionalDungeonId|undefined,stage:Stage,actor:string):MonsterAction|undefined{
  if(!id||!isOptionalDungeonBoss(id,stage,actor))return undefined;
  return {...BOSS_ACTIONS[id]};
}

export function canStartOptionalBossAttack(action:MonsterAction,actor:Point,target:Point,
  obstacles:readonly Obstacle[]):boolean{
  return Math.hypot(actor.x-target.x,actor.y-target.y)<=action.range
    &&canOccupy(actor,ACTOR_RADIUS,obstacles)&&canOccupy(target,ACTOR_RADIUS,obstacles)
    &&hasLineOfSight(actor,target,obstacles)
    &&(action.attack!=='leap'||movementSegmentClear(actor,target,obstacles));
}

/** Resolve the committed warning, never retarget to the hero's new position.
 * A charge is a bounded swept move to the warned landing circle, not a
 * damaging corridor. If obstructed, cancel both movement and damage. */
export function resolveOptionalBossImpact(action:MonsterAction,actor:Point,intent:EnemyIntent,
  target:Point,obstacles:readonly Obstacle[]):{destination?:Point;hit:boolean}{
  if(intent.abilityId!==action.id||intent.pattern!==action.attack
    ||intent.radius!==action.areaRadius||intent.total!==action.windup)return {hit:false};
  if(action.attack==='leap'){
    if(Math.hypot(actor.x-intent.x,actor.y-intent.y)>action.range
      ||!movementSegmentClear(actor,intent,obstacles))return {hit:false};
    const destination={x:intent.x,y:intent.y};
    return {destination,hit:Math.hypot(target.x-destination.x,target.y-destination.y)<=intent.radius
      &&hasLineOfSight(destination,target,obstacles)};
  }
  // If another effect displaced the foreman during the warning, cancel
  // rather than applying a remote strike from its old location.
  if(Math.hypot(actor.x-intent.x,actor.y-intent.y)>1)return {hit:false};
  return {hit:Math.hypot(target.x-intent.x,target.y-intent.y)<=intent.radius
    &&hasLineOfSight(actor,target,obstacles)};
}
