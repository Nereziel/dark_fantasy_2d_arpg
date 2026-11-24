// GPL-3.0-only
import type { Point, ZoneId } from '../core/types';
import type { WildernessRuntimeWorld } from './wildernessRuntime';

export interface VillageSanctuary {
  readonly id:'north-village'|'east-village';
  readonly center:Readonly<Point>;
  readonly radius:number;
}

/** Empty or rejected settlements grant no protection. Geometry is derived
 * from the same runtime world as NPC placement, not persisted independently. */
export function villageSanctuaries(world:WildernessRuntimeWorld):VillageSanctuary[]{
  return (world.villages??[]).flatMap(village=>{
    const site=world.region?.settlements.find(s=>s.id===village.id);
    if(!site||!village.residents.length||!village.structures.length
      ||!Number.isFinite(site.radius)||site.radius<=0
      ||!Number.isFinite(site.position.x)||!Number.isFinite(site.position.y))return [];
    return [{id:village.id,center:{...site.position},radius:site.radius}];
  });
}

export function inVillageSanctuary(zone:ZoneId,point:Readonly<Point>,
  sanctuaries:readonly VillageSanctuary[]):boolean{
  return zone==='wilderness'&&Number.isFinite(point.x)&&Number.isFinite(point.y)
    &&sanctuaries.some(s=>Math.hypot(point.x-s.center.x,point.y-s.center.y)<=s.radius);
}
