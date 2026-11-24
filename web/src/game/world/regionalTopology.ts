// GPL-3.0-only — pure regional topology over existing collision geometry.
import type { Point } from '../core/types';
import type { WorldLayout } from './generator';
import { ACTOR_RADIUS, WORLD_WIDTH, WORLD_HEIGHT, canOccupy, findPath, type Obstacle } from './navigation';
import type { TerrainRoad, TerrainTile } from './wildernessTerrain';

export type SettlementId = 'camp'|'north-village'|'east-village';
export interface RegionalSettlement {
  readonly id:SettlementId;
  readonly anchor:Readonly<Point>;
  readonly position:Point;
  readonly radius:number;
  readonly nameKey:string;
}
export interface RegionalSite {
  readonly id:string;
  readonly kind:'cabin'|'mine'|'cave'|'shrine'|'clearing'|'ruin';
  readonly position:Readonly<Point>;
  readonly access:'trail'|'offroad';
}
export interface RegionalRoad extends TerrainRoad {
  readonly kind:'trade'|'trail';
  readonly fromId:string;
  readonly toId:string;
}
export type RegionalTopology =
  | {ok:true; settlements:readonly RegionalSettlement[]; roads:readonly RegionalRoad[];
      offroadIds:readonly string[]; unconnectedTrailIds:readonly string[]}
  | {ok:false; reason:'settlement-blocked'|'trade-disconnected'|'site-unreachable'; id:string};

const ANCHORS:readonly {id:SettlementId;position:Point;radius:number}[]=[
  {id:'north-village',position:{x:1120,y:230},radius:72},
  {id:'east-village',position:{x:1910,y:960},radius:72}
];
const OFFSETS:readonly Point[]=[
  {x:0,y:0},{x:40,y:0},{x:-40,y:0},{x:0,y:40},{x:0,y:-40},
  {x:40,y:40},{x:-40,y:40},{x:40,y:-40},{x:-40,y:-40},
  {x:80,y:0},{x:-80,y:0},{x:0,y:80},{x:0,y:-80},
  {x:80,y:80},{x:-80,y:80},{x:80,y:-80},{x:-80,y:-80}
];
// Only used when the original local placement fails. Search bounded
// concentric 40-unit bands, keeping each village in its authored region.
const FALLBACK_OFFSETS:readonly Point[][]=Array.from({length:4},(_,i)=>{
  const radius=120+i*40;
  const points:Point[]=[];
  for(let y=-radius;y<=radius;y+=40)for(let x=-radius;x<=radius;x+=40){
    const distance=Math.hypot(x,y);
    if(distance>radius-40&&distance<=radius
      &&!OFFSETS.some(p=>p.x===x&&p.y===y))points.push({x,y});
  }
  return points;
});
const finite=(p:Readonly<Point>)=>Number.isFinite(p.x)&&Number.isFinite(p.y);
const dist=(a:Readonly<Point>,b:Readonly<Point>)=>Math.hypot(a.x-b.x,a.y-b.y);
function hash(seed:number,id:string):number {
  let h=seed^0x52454749;
  for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),0x01000193);
  return (h^(h>>>16))>>>0;
}

/** Exact segment vs rectangle enlarged by the larger of road half-width
 * and actor radius. Conservative square clearance includes rounded end caps.
 */
function intersects(a:Readonly<Point>,b:Readonly<Point>,wall:Obstacle,r:number):boolean {
  const start=[a.x,a.y], delta=[b.x-a.x,b.y-a.y];
  const lo=[wall.x-r,wall.y-r],hi=[wall.x+wall.width+r,wall.y+wall.height+r];
  let near=0,far=1;
  for(let k=0;k<2;k++){
    if(Math.abs(delta[k]!)<1e-9){
      if(start[k]!<lo[k]!||start[k]!>hi[k]!)return false;
    }else{
      const t0=(lo[k]!-start[k]!)/delta[k]!,t1=(hi[k]!-start[k]!)/delta[k]!;
      near=Math.max(near,Math.min(t0,t1));far=Math.min(far,Math.max(t0,t1));
      if(near>far)return false;
    }
  }
  return near<=far;
}
export function regionalRoadClear(points:readonly Readonly<Point>[],width:number,
  obstacles:readonly Obstacle[]):boolean {
  if(!Number.isFinite(width)||width<=0||points.length<2||points.some(p=>!finite(p)))return false;
  const r=Math.max(width/2,ACTOR_RADIUS);
  if(points.some(p=>!canOccupy(p,r,obstacles)))return false;
  for(let i=1;i<points.length;i++){
    if(obstacles.some(w=>intersects(points[i-1]!,points[i]!,w,r)))return false;
  }
  return true;
}
function safePath(a:Point,b:Point,width:number,obstacles:readonly Obstacle[]):Point[]|null {
  const radius=Math.max(width/2,ACTOR_RADIUS)+2;
  if(!canOccupy(a,radius,obstacles)||!canOccupy(b,radius,obstacles))return null;
  const path=findPath(a,b,radius,obstacles);
  const points=[{...a},...path];
  return path.length&&regionalRoadClear(points,width,obstacles)?points:null;
}
const MATERIAL_COST:Record<TerrainTile['terrainId'],number>={
  dirt_road:.85,town_clearing:1,dark_grass:1.05,dead_leaves:1.1,broken_stone:1.4,corrupted_soil:1.7
};
function routeCost(points:readonly Point[],tiles:readonly TerrainTile[]):number {
  let cost=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1]!,b=points[i]!,length=dist(a,b),steps=Math.max(1,Math.ceil(length/40));
    for(let k=0;k<steps;k++){
      const t=(k+.5)/steps,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
      const tile=tiles.find(q=>x>=q.x&&x<q.x+q.width&&y>=q.y&&y<q.y+q.height);
      cost+=length/steps*(tile?MATERIAL_COST[tile.terrainId]:1);
    }
  }
  return cost+Math.max(0,points.length-2)*8;
}
/** Try seeded modest bends first, score feasible candidates by terrain cost.
 * Straight/nav-only route is a safe fallback, never an unchecked line.
 */
function route(seed:number,id:string,a:Point,b:Point,width:number,
  obstacles:readonly Obstacle[],tiles:readonly TerrainTile[]):Point[]|null {
  const length=dist(a,b);
  if(length<1)return null;
  const random=hash(seed,id),sign=random%2===0?1:-1;
  const bend=Math.min(160,Math.max(40,length*(.12+(random%9)*.01)));
  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  const nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
  const candidates:Point[][]=[];
  for(const factor of [sign,sign*.6,-sign]){
    const via={x:Math.round(mid.x+nx*bend*factor),y:Math.round(mid.y+ny*bend*factor)};
    const first=safePath(a,via,width,obstacles);
    if(!first)continue;
    const second=safePath(via,b,width,obstacles);
    if(!second)continue;
    const combined=[...first,...second.slice(1)];
    if(regionalRoadClear(combined,width,obstacles))candidates.push(combined);
  }
  const direct=safePath(a,b,width,obstacles);
  candidates.sort((p,q)=>routeCost(p,tiles)-routeCost(q,tiles));
  // Permit a gentle bend without an excessive detour.
  return candidates.length&&(!direct||routeCost(candidates[0]!,tiles)<=routeCost(direct,tiles)*1.35)
    ?candidates[0]!:direct;
}
function nearestPoint(roads:readonly RegionalRoad[],target:Readonly<Point>):{road:RegionalRoad;point:Point}|null {
  let best:{road:RegionalRoad;point:Point}|null=null,bestDistance=Infinity;
  for(const road of roads)for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1]!,b=road.points[i]!,dx=b.x-a.x,dy=b.y-a.y;
    const square=dx*dx+dy*dy;
    if(!square)continue;
    const t=Math.max(0,Math.min(1,((target.x-a.x)*dx+(target.y-a.y)*dy)/square));
    const point={x:a.x+dx*t,y:a.y+dy*t},d=dist(point,target);
    if(d<bestDistance){bestDistance=d;best={road,point};}
  }
  return best;
}

/** First macro layer. Caller still owns terrain generation, fallback/retry,
 * protected quest/service placement, and runtime integration.
 */
export function planActOneTopology(layout:WorldLayout,tiles:readonly TerrainTile[],
  sites:readonly RegionalSite[],reserved:readonly Readonly<Point>[]=[]):RegionalTopology {
  if(!Number.isInteger(layout.seed)||layout.seed<0||layout.seed>0xffffffff
    ||!finite(layout.camp)||layout.obstacles.length>512||tiles.length>4096||sites.length>64||reserved.length>512
    ||reserved.some(p=>!finite(p))||new Set(sites.map(s=>s.id)).size!==sites.length
    ||sites.some(s=>! /^[a-z][a-z0-9-]{0,48}$/.test(s.id)||!finite(s.position)
      ||!['trail','offroad'].includes(s.access))
    ||layout.obstacles.some(w=>!finite(w)||!Number.isFinite(w.width)||!Number.isFinite(w.height)
      ||w.width<=0||w.height<=0||w.x<0||w.y<0||w.x+w.width>WORLD_WIDTH||w.y+w.height>WORLD_HEIGHT))
    throw new RangeError('Invalid regional topology inputs');
  const {seed,obstacles,camp}=layout;
  const settlements:RegionalSettlement[]=[{id:'camp',anchor:{...camp},position:{...camp},radius:165,nameKey:'region.camp'}];
  for(const spec of ANCHORS){
    const random=hash(seed,spec.id);
    let position:Point|undefined;
    const protectedPoints=[...reserved,...sites.map(s=>s.position),...layout.encounterPositions];
    for(const offsets of [OFFSETS,...FALLBACK_OFFSETS]){
      const rotation=random%offsets.length;
      for(let i=0;i<offsets.length;i++){
        const offset=offsets[(rotation+i)%offsets.length]!;
        const p={x:spec.position.x+offset.x,y:spec.position.y+offset.y};
        if(!canOccupy(p,spec.radius+ACTOR_RADIUS,obstacles)
          ||protectedPoints.some(q=>dist(p,q)<spec.radius+24)
          ||settlements.some(s=>dist(p,s.position)<spec.radius+s.radius+24)
          ||!safePath(camp,p,40,obstacles))continue;
        position=p;break;
      }
      if(position)break;
    }
    if(!position)return {ok:false,reason:'settlement-blocked',id:spec.id};
    settlements.push({id:spec.id,anchor:{...spec.position},position,radius:spec.radius,nameKey:'region.'+spec.id});
  }
  const roads:RegionalRoad[]=[];
  for(let i=1;i<settlements.length;i++){
    const a=settlements[i-1]!,b=settlements[i]!,id='trade-'+a.id+'-'+b.id;
    const points=route(seed,id,a.position,b.position,40,obstacles,tiles);
    if(!points)return {ok:false,reason:'trade-disconnected',id:b.id};
    roads.push({id,kind:'trade',fromId:a.id,toId:b.id,from:{...a.position},to:{...b.position},width:40,points});
  }
  const offroadIds:string[]=[],unconnectedTrailIds:string[]=[];
  for(const site of sites){
    if(!canOccupy(site.position,ACTOR_RADIUS,obstacles)
      ||!findPath(camp,{...site.position},ACTOR_RADIUS,obstacles).length)
      return {ok:false,reason:'site-unreachable',id:site.id};
    if(site.access==='offroad'){offroadIds.push(site.id);continue;}
    const junction=nearestPoint(roads.filter(r=>r.kind==='trade'),site.position);
    const id='trail-'+site.id;
    const points=junction&&route(seed,id,junction.point,{...site.position},24,obstacles,tiles);
    if(!junction||!points){unconnectedTrailIds.push(site.id);continue;}
    roads.push({id,kind:'trail',fromId:junction.road.id,toId:site.id,from:junction.point,to:{...site.position},width:24,points});
  }
  return {ok:true,settlements,roads,offroadIds,unconnectedTrailIds};
}
