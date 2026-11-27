// GPL-3.0-only — shared deterministic event anchor and spawn contract.
import type {Point} from '../core/types';
import {CAMP,CAMP_RADIUS,type WorldLayout} from './generator';
import {ACTOR_RADIUS,canOccupy,findPath} from './navigation';
import type {WildernessFeature} from './wildernessFeatures';

const OFFSETS:readonly Readonly<Point>[]=[
  {x:-32,y:0},{x:32,y:0},{x:0,y:-34},{x:0,y:34},
  {x:-36,y:-28},{x:36,y:28},{x:36,y:-28},{x:-36,y:28},
  {x:-56,y:0},{x:56,y:0},{x:0,y:56},{x:0,y:-56},
  {x:-50,y:42},{x:50,y:-42}
];
export function worldEventHash(seed:number,id:string):number{
  let h=(seed ^ 0x9e3779b9)>>>0;
  for(const c of id)h=(Math.imul(h ^ c.charCodeAt(0),16777619))>>>0;
  h^=h>>>16;
  h=Math.imul(h,0x7feb352d)>>>0;
  h^=h>>>15;
  return h>>>0;
}
const distance=(a:Readonly<Point>,b:Readonly<Point>)=>Math.hypot(a.x-b.x,a.y-b.y);

/** Preserve the original greedy pair whenever successful. A failed first
 * candidate must not prevent finding a different valid pair at the same anchor.
 * This helper assumes a validated layout and finite feature geometry. */
export function eventSpawnPositions(seed:number,layout:Readonly<WorldLayout>,
  feature:WildernessFeature,all:readonly WildernessFeature[]):Point[]{
  const rotated=worldEventHash(seed ^ 0xa31eab2f,feature.id)%OFFSETS.length;
  const preferred=Array.from({length:OFFSETS.length},(_,i)=>OFFSETS[(rotated+i)%OFFSETS.length]!);
  const safe=(p:Point):boolean=>
    canOccupy(p,ACTOR_RADIUS,layout.obstacles)
    && distance(p,CAMP)>CAMP_RADIUS+100
    && distance(p,feature.position)<=75
    && !layout.encounterPositions.some(e=>distance(p,e)<75)
    && !all.some(f=>f.mandatory&&distance(p,f.position)<=f.radius+20)
    && findPath(feature.position,p,ACTOR_RADIUS,layout.obstacles).length>0
    && findPath(layout.camp,p,ACTOR_RADIUS,layout.obstacles).length>0;
  const points:Point[]=[];
  // Match the old successful selection and stop immediately after two spawns.
  for(const offset of preferred){
    const p={x:feature.position.x+offset.x,y:feature.position.y+offset.y};
    if(!safe(p))continue;
    points.push(p);
    if(points.length>1&&distance(points[0]!,p)>=ACTOR_RADIUS*2)return [points[0]!,p];
  }
  // Only failed legacy placements pay the bounded extra search cost.
  for(let i=0;i<24;i++){
    const theta=(i+rotated)*Math.PI/12;
    const p={x:feature.position.x+Math.round(72*Math.cos(theta)),
      y:feature.position.y+Math.round(72*Math.sin(theta))};
    if(safe(p)&&!points.some(q=>q.x===p.x&&q.y===p.y))points.push(p);
  }
  for(let i=0;i<points.length;i++)
    for(let j=i+1;j<points.length;j++)
      if(distance(points[i]!,points[j]!)>=ACTOR_RADIUS*2)return [points[i]!,points[j]!];
  return [];
}
