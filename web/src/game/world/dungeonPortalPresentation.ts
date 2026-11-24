// GPL-3.0-only — shared pure projection, simulation owns authorization.
import type {GameSnapshot,GameCommand,Point} from '../core/types';
import {CRYPT_GATE,CRYPT_EXIT} from './generator';
import {dungeonInteriorSeed,type ActIDungeonEntrance} from './actIDungeonEntrances';

type View=Pick<GameSnapshot,'zone'|'worldSeed'|'dungeonId'>;
export interface DungeonPortalTarget {
  kind:'INTERACTABLE';
  id:string;
  position:Point;
  hitRadius:number;
}
export function dungeonRenderSeed(view:View):number{
  return view.zone==='crypt'&&view.dungeonId
    ? dungeonInteriorSeed(view.worldSeed,view.dungeonId):view.worldSeed;
}
export function dungeonPortalTargets(view:View,entrances:readonly ActIDungeonEntrance[]):DungeonPortalTarget[]{
  // All current procedural interiors preserve the validated fixed exit.
  const targets:DungeonPortalTarget[]=[{kind:'INTERACTABLE',id:'crypt-portal',
    position:{...(view.zone==='wilderness'?CRYPT_GATE:CRYPT_EXIT)},hitRadius:64}];
  if(view.zone==='wilderness')for(const e of entrances){
    if(e.id!=='crypt')targets.push({kind:'INTERACTABLE',id:'dungeon-portal:'+e.id,
      position:{...e.position},hitRadius:48});
  }
  return targets;
}
export function dungeonPortalCommand(id:string):GameCommand|null{
  if(id==='crypt-portal')return {type:'usePortal'};
  if(id==='dungeon-portal:mine')return {type:'usePortal',dungeonId:'mine'};
  if(id==='dungeon-portal:cave')return {type:'usePortal',dungeonId:'cave'};
  return null;
}
