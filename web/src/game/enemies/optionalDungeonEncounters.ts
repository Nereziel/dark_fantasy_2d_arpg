// GPL-3.0-only — distinct encounters using existing canonical monster families.
import type {Point} from '../core/types';
import {ENEMY_DEFINITIONS,PACK_SIZE,type EnemyType,type EnemyUnit} from './enemies';
import type {OptionalDungeonId} from '../world/optionalDungeonVisit';

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
    return {actor:{id:actorId(type,stage,index),type,...position,health,maxHealth:health,alive:true},
      intent:null,cooldown:.65+index*.3,effects:[],abilityCooldowns:{}};
  });
}
