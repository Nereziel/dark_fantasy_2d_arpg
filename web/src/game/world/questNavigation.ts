// GPL-3.0-only — read-only zone routing and observed-cell map presentation.
import type { Point } from '../core/types';
import { ACTOR_RADIUS, canOccupy, findPath, type Obstacle } from './navigation';
import { DUNGEON_TILE_SIZE,type ProceduralDungeonResult } from './proceduralDungeon';
import { MAP_CELL_SIZE, projectMap, mapCellPainted, type MapDiscoveryState, type MapWorldInput,
  type MapProjection, type MapProjectionOptions, type MapQuestHint, type MapViewport } from './mapDiscovery';
export type QuestArea='wilderness'|'crypt'|'mine'|'cave';
export type QuestLeg='enter'|'exit'|'objective';
export function questTravelLeg(current:QuestArea,destination:QuestArea):QuestLeg{
  if(current===destination)return 'objective';
  return current==='wilderness'?'enter':'exit';
}
const cell=(p:Point)=>'fog/'+Math.floor(p.x/MAP_CELL_SIZE)+'/'+Math.floor(p.y/MAP_CELL_SIZE);
/** No unexplored coordinates in the emitted route. Only a continuous known
 * prefix, never a straight fallback through obstacles or unknown geometry. */
export function knownQuestRoute(from:Point,to:Point,obstacles:readonly Obstacle[],revealed:readonly string[],path?:readonly Point[]):Point[]{
  const known=new Set(revealed);
  if(!known.has(cell(from)))return [];
  const points=path??findPath(from,to,ACTOR_RADIUS,obstacles);
  if(!points.length)return [];
  const route:Point[]=[{...from}];
  let a=from;
  for(const b of points){
    const dx=b.x-a.x,dy=b.y-a.y;
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/6));
    // Split at every cell boundary, not merely regular samples.
    const cuts=new Set<number>([0,1]);
    for(let i=1;i<steps;i++)cuts.add(i/steps);
    for(const [v,d] of [[a.x,dx],[a.y,dy]] as const){
      if(!d)continue;
      for(let edge=(Math.floor(Math.min(v,v+d)/MAP_CELL_SIZE)+1)*MAP_CELL_SIZE;edge<Math.max(v,v+d);edge+=MAP_CELL_SIZE)
        cuts.add((edge-v)/d);
    }
    const ts=[...cuts].sort((x,y)=>x-y);
    const point=(t:number)=>({x:a.x+dx*t,y:a.y+dy*t});
    for(let i=1;i<ts.length;i++){
      const before=ts[i-1]!,after=ts[i]!,mid=point((before+after)/2),end=point(after);
      if(!known.has(cell(mid))||!canOccupy(mid,ACTOR_RADIUS,obstacles)||!canOccupy(end,ACTOR_RADIUS,obstacles))
        return route.length>1?route:[];
      if(!known.has(cell(end))){
        const safe=point(Math.max(before,after-1e-6));
        if(known.has(cell(safe))&&Math.hypot(safe.x-a.x,safe.y-a.y)>0.01)route.push(safe);
        return route.length>1?route:[];
      }
      // Keep only real waypoints and a final known prefix point, not all samples.
      if(i===ts.length-1)route.push(end);
      else if(!known.has(cell(point((after+ts[i+1]!)/2)))){
        route.push(end);return route;
      }
    }
    a=b;
  }
  return route.length>1?route:[];
}
/** Build the ordinary dungeon silhouette from the canonical tiles. Hidden
 * rooms and their passages are filled as solid wall, not marked as secret.
 * Cached by the simulation for the current interior. */
export function publicDungeonMinimapWalls(dungeon:ProceduralDungeonResult):MapViewport[]{
  const secret=new Set(dungeon.rooms.filter(r=>r.type==='secret').map(r=>r.id));
  const hidden=new Set(dungeon.doors.filter(d=>d.kind==='hidden').map(d=>d.id));
  const solid=dungeon.tiles.filter(t=>t.kind==='wall'||secret.has(t.roomId??'')||hidden.has(t.doorId??''))
    .sort((a,b)=>a.y-b.y||a.x-b.x);
  const result:{x:number;y:number;width:number;height:number}[]=[];
  for(const tile of solid){
    const last=result.at(-1);
    if(last&&last.y===tile.y&&last.x+last.width===tile.x)last.width+=DUNGEON_TILE_SIZE;
    else result.push({x:tile.x,y:tile.y,width:DUNGEON_TILE_SIZE,height:DUNGEON_TILE_SIZE});
  }
  return result;
}
export function projectDungeonMap(state:MapDiscoveryState,world:MapWorldInput,player:Point,
  obstacles:readonly Obstacle[],hint:MapQuestHint|null,mode:'world'|'minimap',
  options:Pick<MapProjectionOptions,'zoom'|'center'>,area:Exclude<QuestArea,'wilderness'>,
  route:readonly Point[]=[],localWalls:readonly MapViewport[]=obstacles):MapProjection|null{
  const base=projectMap(state,world,player,hint?[hint]:[],{...options,mode,trackedQuestId:hint?.id});
  if(!base.ok)return null;
  const p=base.value;
  const walls:MapViewport[]=[];
  for(const c of p.cells){
    if(!mapCellPainted(mode,c))continue;
    for(const w of mode==='minimap'?localWalls:obstacles){
      const x=Math.max(w.x,c.x),y=Math.max(w.y,c.y);
      const width=Math.min(w.x+w.width,c.x+c.width)-x,height=Math.min(w.y+w.height,c.y+c.height)-y;
      if(width>0&&height>0)walls.push({x,y,width,height});
    }
  }
  return {...p,area,walls,navigationRoute:route,markers:p.markers.filter(m=>m.kind!=='town')};
}
