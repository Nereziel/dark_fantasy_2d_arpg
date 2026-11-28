// GPL-3.0-only — #207 B2a. Tactical homes follow stable identity, never array order.
import type {Point} from '../core/types';
import {PACK_SIZE,type EnemyType} from './enemies';
import type {WorldEventPlan} from '../world/worldEvents';
import type {WildernessPopulation} from '../world/wildernessPopulation';

interface HomeUnit {
  readonly actor:Readonly<Point>&{readonly id:string;readonly type:EnemyType};
  readonly summoned?:boolean;
}
interface HomeContext {
  readonly wave:number;
  readonly positions:readonly Readonly<Point>[];
  readonly events?:readonly WorldEventPlan[];
  readonly population?:WildernessPopulation;
  /** Legacy crypt positions already include their stage-specific geometry. */
  readonly crypt?:boolean;
}
export interface EnemyHome {
  readonly origin:Point;
  readonly patrolSlot:number;
}
/** Population and event homes are exact immutable spawn coordinates. Only
 * legacy canonical IDs use the wave offset, while summons keep the old
 * self-origin fallback until their explicit lifetime is integrated. */
export function resolveEnemyHome(unit:HomeUnit,context:HomeContext):EnemyHome|undefined{
  const {actor}=unit;
  for(const group of context.population?.groups??[]){
    const index=group.members.findIndex(m=>m.id===actor.id);
    if(index>=0){
      const member=group.members[index]!;
      return member.type===actor.type?{origin:{...member.spawn},patrolSlot:index}:undefined;
    }
  }
  for(const event of context.events??[]){
    const index=event.enemySpawns.findIndex(m=>m.id===actor.id);
    if(index>=0){
      const member=event.enemySpawns[index]!;
      return member.type===actor.type?{origin:{...member.position},patrolSlot:index}:undefined;
    }
  }
  if(!Number.isSafeInteger(context.wave)||context.wave<0)return undefined;
  if(unit.summoned){
    const match=/^summon-([0-9]+)-([0-9]+)$/.exec(actor.id);
    const slot=match?Number(match[2]):0;
    return {origin:{x:actor.x,y:actor.y},patrolSlot:Number.isSafeInteger(slot)?slot:0};
  }
  for(let slot=0;slot<PACK_SIZE;slot++){
    if(actor.id!==actor.type+'-'+(context.wave*PACK_SIZE+slot+1))continue;
    const p=context.positions[slot];
    return p?{origin:{x:p.x,y:p.y+(context.crypt?0:(context.wave%2)*25)},patrolSlot:slot}:undefined;
  }
  return undefined;
}
