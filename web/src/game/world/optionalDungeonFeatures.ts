// GPL-3.0-only — derive interactable geometry from the validated interior.
import type {ProceduralDungeonResult} from './proceduralDungeon';
import type {CryptInteractable,CryptTrap} from './cryptTheme';
import type {OptionalDungeonId} from './optionalDungeonVisit';
import {optionalDungeonRewardId,type OptionalDungeonRewardId} from './optionalDungeonRewards';

export interface OptionalDungeonFeatures {
  readonly chest:CryptInteractable;
  readonly trap:CryptTrap;
  readonly gold:number;
}
export function planOptionalDungeonFeatures(dungeon:ProceduralDungeonResult,id:OptionalDungeonId):OptionalDungeonFeatures{
  const treasure=dungeon.rooms.find(r=>r.type==='treasure')!;
  const hazard=dungeon.rooms.find(r=>r.type==='trap')!;
  const prefix='crypt/optional/'+id;
  return {
    gold:id==='mine'?90:75,
    chest:{id:prefix+'/treasure',propId:prefix+'/chest',roomId:treasure.id,
      capability:'lootContainer',position:{...treasure.center},hitRadius:26,reach:60,
      hookId:prefix+'/treasure',eventKey:'crypt.open.treasure',
      requiresVisited:true,oneShot:true,initiallyVisible:true},
    trap:{id:prefix+'/trap',sourcePropId:prefix+'/hazard',roomId:hazard.id,
      kind:id==='mine'?'spike':'poison',trigger:{shape:'circle',center:{...hazard.center},radius:58},
      armingSeconds:0,telegraphSeconds:1.2,recoverySeconds:0,
      damage:{type:id==='mine'?'physical':'poison',maxBaseDamage:id==='mine'?25:20},
      hookId:prefix+'/trap',requiresVisited:true,oneShot:true}
  };
}
export function optionalDungeonChestProjection(plan:OptionalDungeonFeatures,id:OptionalDungeonId,
  claims:readonly OptionalDungeonRewardId[]):CryptInteractable[]{
  return claims.includes(optionalDungeonRewardId(id,'treasure')!)?[]:[structuredClone(plan.chest)];
}
