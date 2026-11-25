// GPL-3.0-only — shared pure projection, simulation owns authorization.
import type {GameSnapshot,GameCommand,Point} from '../core/types';
import type {MapProjection,MapMarker} from './mapDiscovery';
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

/** Derive additional markers from already observed cells, not hidden geometry.
 * Do not alter the map world's fingerprint or persistent discovery schema.
 */
export function projectDiscoveredDungeonEntrances(projection:MapProjection,
  entrances:readonly ActIDungeonEntrance[]):MapProjection{
  const box=projection.viewport;
  const markers:MapMarker[]=[];
  const replaced=new Set<string>();
  for(const entry of entrances){
    if(entry.id==='crypt')continue;
    const p=entry.position;
    if(p.x<box.x||p.y<box.y||p.x>=box.x+box.width||p.y>=box.y+box.height)continue;
    if(!projection.cells.some(c=>c.visibility==='discovered'&&p.x>=c.x&&p.y>=c.y
      &&p.x<c.x+c.width&&p.y<c.y+c.height))continue;
    const id='dungeon-portal:'+entry.id;
    if(markers.some(m=>m.id===id))continue;
    const source=projection.markers.find(m=>m.id===entry.sourceId
      &&m.kind==='optionalPoi'&&m.position.x===p.x&&m.position.y===p.y);
    if(source)replaced.add(source.id);
    markers.push({id,kind:'dungeonEntrance',position:{...p},
      presentationKey:'dungeon.'+entry.id+'Name'});
  }
  if(!markers.length)return projection;
  const ids=new Set(markers.map(m=>m.id));
  return {...projection,markers:[...projection.markers.filter(m=>!replaced.has(m.id)&&!ids.has(m.id)),...markers]
    .sort((a,b)=>a.id.localeCompare(b.id))};
}
