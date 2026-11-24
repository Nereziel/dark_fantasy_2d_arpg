// GPL-3.0-only
import type { Point } from '../core/types';
import { townEntry, type TownEntry } from './townManifest';
import { hasLineOfSight, type Obstacle } from './navigation';
import type { VillagePopulation } from './villagePopulation';

export function villageTownEntries(villages:readonly VillagePopulation[]|undefined):TownEntry[]{
  return (villages??[]).flatMap(v=>v.residents.map(n=>({
    id:n.id,role:n.role,position:{...n.position},interactionRange:72,collisionRadius:12,
    nameKey:'village.'+n.id+'.name',descriptionKey:'village.'+n.id+'.description',
    capability:n.role==='blacksmith'||n.role==='quest'?'planned' as const:'decorative' as const
  })));
}
export function resolveRegionalTownEntry(id:unknown,entries:readonly TownEntry[]):TownEntry|null {
  if(typeof id!=='string')return null;
  const entry=entries.find(n=>n.id===id);
  return entry?{...entry,position:{...entry.position}}:townEntry(id);
}
export function canReachRegionalTownEntry(hero:Readonly<Point>,entry:TownEntry,walls:readonly Obstacle[]):boolean{
  if(!Number.isFinite(hero.x)||!Number.isFinite(hero.y))return false;
  return Math.hypot(hero.x-entry.position.x,hero.y-entry.position.y)<=entry.interactionRange
    &&hasLineOfSight(hero,entry.position,walls);
}
