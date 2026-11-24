// GPL-3.0-only — data-only proposal; integration owns collision and gameplay.
import type { Point } from '../core/types';
import type { WorldLayout } from './generator';
import { ACTOR_RADIUS, WORLD_WIDTH, WORLD_HEIGHT, canOccupy, findPath, type Obstacle } from './navigation';

export type StructureKind = 'house' | 'smithy' | 'cabin' | 'mine';
export interface StructureSite {
  readonly id: string;
  readonly kind: StructureKind;
  readonly anchor: Readonly<Point>;
}
export interface StructureRoad {
  readonly id: string;
  readonly width: number;
  readonly points: readonly Readonly<Point>[];
}
export interface SettlementStructure {
  readonly id: string;
  readonly kind: StructureKind;
  readonly obstacle: Obstacle;
  /** Exterior destination, not an interior or dungeon transition. */
  readonly approach: Point;
  readonly entranceSide: 'south' | 'east' | 'north' | 'west';
  readonly variant: number;
}
export interface StructurePlan {
  readonly structures: readonly SettlementStructure[];
  readonly obstacles: readonly Obstacle[];
  readonly skipped: readonly string[];
}

const SIZES: Record<StructureKind, readonly [number,number]> = {
  house:[72,64],smithy:[88,68],cabin:[56,48],mine:[76,56]
};
const OFFSETS: readonly Point[] = [
  {x:0,y:0},{x:48,y:0},{x:-48,y:0},{x:0,y:48},{x:0,y:-48},
  {x:48,y:48},{x:-48,y:48},{x:48,y:-48},{x:-48,y:-48},
  {x:96,y:0},{x:-96,y:0},{x:0,y:96},{x:0,y:-96}
];
const finitePoint=(p:Readonly<Point>)=>Number.isFinite(p.x)&&Number.isFinite(p.y);
function hash(seed:number,id:string):number {
  let h=seed>>>0;
  for(let i=0;i<id.length;i++) h=Math.imul(h^id.charCodeAt(i),0x01000193);
  return (h^(h>>>16))>>>0;
}
function overlaps(a:Obstacle,b:Obstacle,gap:number):boolean {
  return a.x < b.x+b.width+gap && a.x+a.width+gap > b.x
    && a.y < b.y+b.height+gap && a.y+a.height+gap > b.y;
}

/** Conservative segment/expanded rectangle intersection (includes end caps). */
function crossesRoad(b:Obstacle,road:StructureRoad):boolean {
  const margin=road.width/2+ACTOR_RADIUS;
  const lo=[b.x-margin,b.y-margin],hi=[b.x+b.width+margin,b.y+b.height+margin];
  for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1]!,end=road.points[i]!;
    const p=[a.x,a.y],d=[end.x-a.x,end.y-a.y];
    let near=0,far=1;
    for(let k=0;k<2;k++){
      if(Math.abs(d[k]!)<1e-9){
        if(p[k]!<lo[k]!||p[k]!>hi[k]!){near=2;break}
      }else{
        const t0=(lo[k]!-p[k]!)/d[k]!,t1=(hi[k]!-p[k]!)/d[k]!;
        near=Math.max(near,Math.min(t0,t1));far=Math.min(far,Math.max(t0,t1));
      }
    }
    if(near<=far)return true;
  }
  return false;
}
function approaches(b:Obstacle):readonly {side:SettlementStructure['entranceSide'];point:Point}[]{
  const gap=ACTOR_RADIUS+12;
  return [
    {side:'south',point:{x:b.x+b.width/2,y:b.y+b.height+gap}},
    {side:'east',point:{x:b.x+b.width+gap,y:b.y+b.height/2}},
    {side:'north',point:{x:b.x+b.width/2,y:b.y-gap}},
    {side:'west',point:{x:b.x-gap,y:b.y+b.height/2}}
  ];
}

/** Bounded deterministic placement near caller-authored anchors. Existing
 * roads, NPC/quest/event/spawn destinations and all earlier entrances stay
 * reachable. Optional structures are skipped if no safe site exists.
 * Callers supply ALL protected destinations; this module never mutates layout.
 */
export function planSettlementStructures(layout:WorldLayout, roads:readonly StructureRoad[],
  reserved:readonly Readonly<Point>[], sites:readonly StructureSite[]):StructurePlan {
  if(!Number.isInteger(layout.seed)||layout.seed<0||layout.seed>0xffffffff
    ||!finitePoint(layout.camp)||sites.length>24||reserved.length>512||roads.length>128
    ||new Set(sites.map(s=>s.id)).size!==sites.length
    ||new Set(sites.map(s=>s.id.replaceAll('.','-'))).size!==sites.length
    ||sites.some(s=>! /^[a-z][a-z0-9.]{0,63}$/.test(s.id)||!Object.hasOwn(SIZES,s.kind)||!finitePoint(s.anchor))
    ||reserved.some(p=>!finitePoint(p))
    ||roads.some(r=>!Number.isFinite(r.width)||r.width<=0||r.points.length<2
      ||r.points.length>512||r.points.some(p=>!finitePoint(p))))
    throw new RangeError('Invalid structure placement inputs');
  const obstacles=layout.obstacles.map(b=>({...b}));
  const structures:SettlementStructure[]=[],skipped:string[]=[];
  const protectedPoints=[layout.camp,...layout.encounterPositions,...reserved].map(p=>({...p}));
  const clear=(point:Point,walls:readonly Obstacle[])=>canOccupy(point,ACTOR_RADIUS,walls)
    &&(Math.hypot(point.x-layout.camp.x,point.y-layout.camp.y)<1
      ||findPath(layout.camp,point,ACTOR_RADIUS,walls).length>0);
  // Never worsen a malformed or already unreachable layout.
  if(protectedPoints.some(p=>!clear(p,obstacles)))return {structures,obstacles,skipped:sites.map(s=>s.id)};
  for(const site of sites){
    const random=hash(layout.seed,site.id);
    const [width,height]=SIZES[site.kind];
    let placed=false;
    for(let i=0;i<OFFSETS.length;i++){
      const offset=OFFSETS[(i+random%OFFSETS.length)%OFFSETS.length]!;
      const x=Math.round(site.anchor.x+offset.x-width/2);
      const y=Math.round(site.anchor.y+offset.y-height/2);
      const obstacle={id:'structure-'+site.id.replaceAll('.','-'),x,y,width,height};
      if(x<ACTOR_RADIUS||y<ACTOR_RADIUS||x+width>WORLD_WIDTH-ACTOR_RADIUS
        ||y+height>WORLD_HEIGHT-ACTOR_RADIUS
        ||obstacles.some(b=>b.id===obstacle.id||overlaps(obstacle,b,ACTOR_RADIUS*2))
        ||roads.some(road=>crossesRoad(obstacle,road))
        // The extra buffer is relative to the NEW building only.
        // canOccupy also applies world bounds, incorrectly rejecting all
        // buildings when an unrelated protected point is near the map edge.
        ||protectedPoints.some(p=>p.x+ACTOR_RADIUS+18>obstacle.x
          &&p.x-ACTOR_RADIUS-18<obstacle.x+obstacle.width
          &&p.y+ACTOR_RADIUS+18>obstacle.y
          &&p.y-ACTOR_RADIUS-18<obstacle.y+obstacle.height))continue;
      const trial=[...obstacles,obstacle];
      const doors=approaches(obstacle);
      let entrance:typeof doors[number]|undefined;
      for(let d=0;d<doors.length;d++){
        const door=doors[(d+(random>>>8)%doors.length)%doors.length]!;
        if(clear(door.point,trial)){entrance=door;break;}
      }
      if(!entrance||protectedPoints.some(p=>!clear(p,trial)))continue;
      structures.push({id:site.id,kind:site.kind,obstacle,approach:entrance.point,
        entranceSide:entrance.side,variant:(random>>>16)%4});
      obstacles.push(obstacle);protectedPoints.push(entrance.point);
      placed=true;break;
    }
    if(!placed)skipped.push(site.id);
  }
  return {structures,obstacles,skipped};
}
