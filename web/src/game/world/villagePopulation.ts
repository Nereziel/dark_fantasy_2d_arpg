// GPL-3.0-only — village population manifest; not a service authorization.
import type { Point } from '../core/types';
import type { WorldLayout } from './generator';
import { ACTOR_RADIUS, canOccupy, findPath, type Obstacle } from './navigation';
import { planSettlementStructures, type SettlementStructure, type StructureRoad, type StructureSite } from './settlementStructures';
import { regionalRoadClear, type RegionalSettlement } from './regionalTopology';

export interface VillageResident {
  readonly id:string;
  readonly role:'healer'|'civilian'|'blacksmith'|'quest';
  readonly position:Point;
  readonly capability:'planned';
}
export interface VillagePopulation {
  readonly id:Exclude<RegionalSettlement['id'],'camp'>;
  readonly structures:readonly SettlementStructure[];
  readonly residents:readonly VillageResident[];
}
export interface VillagePlan {
  readonly villages:readonly VillagePopulation[];
  readonly obstacles:readonly Obstacle[];
  readonly skipped:readonly string[];
}
const OFFSETS:readonly Point[]=[
  {x:40,y:0},{x:0,y:40},{x:-40,y:0},{x:0,y:-40},
  {x:40,y:40},{x:-40,y:40},{x:40,y:-40},{x:-40,y:-40}
];
const distance=(a:Readonly<Point>,b:Readonly<Point>)=>Math.hypot(a.x-b.x,a.y-b.y);

/** Plan each village atomically. A missing building or either planned
 * resident rejects that village only; prior settlements stay unchanged.
 */
export function planVillagePopulation(layout:WorldLayout,settlements:readonly RegionalSettlement[],
  roads:readonly StructureRoad[],reserved:readonly Readonly<Point>[]):VillagePlan {
  if(settlements.length>3||new Set(settlements.map(s=>s.id)).size!==settlements.length)
    throw new RangeError('Invalid village manifest');
  let obstacles=layout.obstacles.map(o=>({...o}));
  const villages:VillagePopulation[]=[],skipped:string[]=[];
  const protectedPoints=[...reserved,...settlements.map(s=>s.position)];
  const clearRoads=roads.filter(r=>regionalRoadClear(r.points,r.width,layout.obstacles));
  for(const settlement of settlements){
    if(settlement.id==='camp')continue;
    const id=settlement.id,p=settlement.position,north=id==='north-village';
    if(!canOccupy(p,ACTOR_RADIUS,obstacles)){skipped.push(id);continue;}
    const sites:StructureSite[]=[
      {id:id.replaceAll('-','')+'.house',kind:'house',anchor:{x:p.x-108,y:p.y-90}},
      {id:id.replaceAll('-','')+'.service',kind:north?'house':'smithy',anchor:{x:p.x+108,y:p.y+90}}
    ];
    const localLayout={...layout,obstacles};
    const usable=(plan:ReturnType<typeof planSettlementStructures>)=>
      plan.structures.length>0
      && (north || plan.structures.some(s=>s.kind==='smithy'))
      && clearRoads.every(r=>regionalRoadClear(r.points,r.width,plan.obstacles));
    let plan=planSettlementStructures(localLayout,roads,protectedPoints,sites);
    // Preserve the original layout whenever possible. A forge is a required
    // service in the east village: try alternative quadrants before rejecting
    // it, never advertise a blacksmith at a missing building.
    if(!north&&!usable(plan)){
      for(const [dx,dy] of [[-108,-90],[-108,90],[108,-90],[108,90]] as const){
        const service:StructureSite={...sites[1]!,anchor:{x:p.x+dx,y:p.y+dy}};
        const house:StructureSite={...sites[0]!,anchor:{x:p.x-dx,y:p.y-dy}};
        const candidate=planSettlementStructures(localLayout,roads,protectedPoints,[service,house]);
        if(usable(candidate)){plan=candidate;break;}
      }
    }
    if(!usable(plan)){skipped.push(id);continue;}
    const roles:VillageResident['role'][]=north?['healer','civilian']:['blacksmith','quest'];
    const residents:VillageResident[]=[];
    for(const role of roles){
      const rotation=(layout.seed+residents.length*3+(north?0:5))%OFFSETS.length;
      for(let i=0;i<OFFSETS.length;i++){
        const o=OFFSETS[(i+rotation)%OFFSETS.length]!,position={x:p.x+o.x,y:p.y+o.y};
        if(distance(p,position)>settlement.radius
          ||[...protectedPoints,...residents.map(n=>n.position),...plan.structures.map(s=>s.approach)]
            .some(q=>distance(q,position)<32)
          ||!canOccupy(position,ACTOR_RADIUS+8,plan.obstacles)
          ||!findPath(layout.camp,position,ACTOR_RADIUS,plan.obstacles).length)continue;
        residents.push({id:id+'-'+role,role,position,capability:'planned'});break;
      }
    }
    if(residents.length!==roles.length){skipped.push(id);continue;}
    villages.push({id,structures:plan.structures,residents});
    obstacles=[...plan.obstacles];
    protectedPoints.push(...residents.map(n=>n.position),...plan.structures.map(s=>s.approach));
  }
  return {villages,obstacles,skipped};
}
