// GPL-3.0-only — derive interactable geometry from the validated interior.
import {SeededRng,rollItemForBase,type Item} from '../data/items';
import type {ClassId} from '../data/classes';
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
      damage:{type:id==='mine'?'physical':'poison',maxBaseDamage:id==='mine'?25:20,...(id==='cave'?{statusId:'poisoned' as const,maxDurationSeconds:3}:{})},
      hookId:prefix+'/trap',requiresVisited:true,oneShot:true}
  };
}
export function optionalDungeonChestProjection(plan:OptionalDungeonFeatures,id:OptionalDungeonId,
  claims:readonly OptionalDungeonRewardId[]):CryptInteractable[]{
  return claims.includes(optionalDungeonRewardId(id,'treasure')!)?[]:[structuredClone(plan.chest)];
}

/** Seed-domain loot independent of the live combat RNG. Level is fixed at claim. */
export function rollOptionalDungeonTreasure(seed:number,id:OptionalDungeonId,level:number,classId:ClassId):Item|null{
  const rng=new SeededRng((seed^(id==='mine'?0x7f4d494e:0x7f434156))>>>0);
  const bases=id==='mine'?['helm','hauberk','gauntlets','belt']:['greaves','bloodstone','signet','charm'];
  return rollItemForBase(bases[rng.index(bases.length)]!,'optional-chest-'+seed+'-'+id,
    level,'UNCOMMON',rng,classId);
}
