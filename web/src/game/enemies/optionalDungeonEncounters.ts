// GPL-3.0-only — distinct encounters using existing canonical monster families.
import type {Point} from '../core/types';
import {ENEMY_DEFINITIONS,PACK_SIZE,type EnemyType,type EnemyUnit} from './enemies';
import type {OptionalDungeonId} from '../world/optionalDungeonVisit';
import type {MonsterAction} from './monsterRuntime';
import {movementSegmentClear,type Obstacle} from '../world/navigation';

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

/** Only the canonical optional stage-one bosses get these actions. Reuse the
 * normal enemy intent/cooldown pipeline; no persistent boss state or RNG. */
const BOSS_ACTIONS:Readonly<Record<OptionalDungeonId,MonsterAction>>={
  mine:{id:'foremanSlam',kind:'damage',attack:'sweep',range:108,areaRadius:108,windup:1.4,cooldown:6,damage:42},
  cave:{id:'deepBoarCharge',kind:'damage',attack:'leap',range:190,areaRadius:70,windup:1.2,cooldown:5.5,damage:38}
};

export function optionalDungeonBossAction(id:OptionalDungeonId|undefined,stage:Stage,actor:string):MonsterAction|undefined{
  return id&&isOptionalDungeonBoss(id,stage,actor)?{...BOSS_ACTIONS[id]}:undefined;
}

/** A charge cannot cross a wall even when the locked destination is free. */
export function canResolveOptionalDungeonBossAction(action:MonsterAction,from:Point,to:Point,obstacles:readonly Obstacle[]):boolean{
  const distance=Math.hypot(to.x-from.x,to.y-from.y);
  if(!Number.isFinite(distance)||distance>action.range+0.5)return false;
  return action.id!=='deepBoarCharge'||movementSegmentClear(from,to,obstacles);
}
