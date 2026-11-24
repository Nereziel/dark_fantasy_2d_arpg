// GPL-3.0-only — pure macro landscape proposals using authoritative navigation.
import type { Point } from '../core/types';
import type { WorldLayout } from './generator';
import { ACTOR_RADIUS, WORLD_WIDTH, WORLD_HEIGHT, canOccupy, findPath, type Obstacle } from './navigation';
import { planActOneTopology, regionalRoadClear, type RegionalSite, type RegionalTopology } from './regionalTopology';
import type { TerrainTile, TerrainRoad } from './wildernessTerrain';

export interface RegionalLandform {
  readonly id:string;
  readonly kind:'ridge'|'forest-belt';
  readonly obstacles:readonly Obstacle[];
  readonly pass?:Point;
}
type ConnectedTopology=Extract<RegionalTopology,{ok:true}>;
export type RegionalLandscape =
  | {ok:true;layout:WorldLayout;tiles:TerrainTile[];forms:RegionalLandform[];
      topology:ConnectedTopology;usedFallback:boolean}
  | {ok:false;reason:'base-disconnected'|'protected-target-blocked';id:string};

const ATTEMPTS=8;
function mix(seed:number,salt:number):number {
  let h=Math.imul(seed^salt,0x9e3779b1);
  h=Math.imul(h^(h>>>16),0x85ebca6b);
  return (h^(h>>>13))>>>0;
}
function ridge(seed:number,attempt:number):RegionalLandform {
  const h=mix(seed,0x52494447+attempt);
  const x=760+(h%4)*80;
  const y=80+((h>>>3)%3)*40;
  const width=80+((h>>>6)%3)*40;
  const upper=240+((h>>>9)%4)*80;
  const gap=160+((h>>>13)%2)*80;
  const lower=240+((h>>>15)%3)*80;
  return {id:'regional-ridge',kind:'ridge',obstacles:[
    {id:'regional-rock-ridge-north',x,y,width,height:upper},
    {id:'regional-rock-ridge-south',x,y:y+upper+gap,width,height:lower}
  ],pass:{x:x+width/2,y:y+upper+gap/2}};
}
function belt(seed:number,attempt:number):RegionalLandform {
  const h=mix(seed,0x464f5245+attempt);
  const x=1160+(h%6)*80;
  const y=1030+((h>>>4)%3)*60;
  const width=80+((h>>>8)%2)*40;
  return {id:'regional-forest-belt',kind:'forest-belt',obstacles:[
    {id:'regional-forest-west',x,y,width,height:120},
    {id:'regional-forest-centre',x:x+width,y:y-40,width:120,height:160},
    {id:'regional-forest-east',x:x+width+120,y:y-20,width:80,height:140}
  ]};
}
function overlap(a:Obstacle,b:Obstacle):boolean {
  return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
}
function inside(w:Obstacle):boolean {
  return w.x>=0&&w.y>=0&&w.x+w.width<=WORLD_WIDTH&&w.y+w.height<=WORLD_HEIGHT;
}
function distance(p:Point,w:Obstacle):number {
  return Math.hypot(Math.max(w.x-p.x,0,p.x-w.x-w.width),
    Math.max(w.y-p.y,0,p.y-w.y-w.height));
}
/** Keep clearing/road tiles intact. Give whole connected landforms material
 * bands rather than scattering unrelated visual terrain over their footprints.
 */
function materialBands(tiles:readonly TerrainTile[],forms:readonly RegionalLandform[]):TerrainTile[] {
  return tiles.map(tile=>{
    if(tile.terrainId==='dirt_road'||tile.terrainId==='town_clearing')return {...tile};
    const p={x:tile.x+tile.width/2,y:tile.y+tile.height/2};
    for(const form of forms){
      const d=Math.min(...form.obstacles.map(w=>distance(p,w)));
      if(d<=80)return {...tile,terrainId:form.kind==='ridge'?'broken_stone':'dark_grass'};
      if(d<=160&&form.kind==='forest-belt')return {...tile,terrainId:'dead_leaves'};
    }
    return {...tile};
  });
}
function reachable(layout:WorldLayout,p:Point,radius=ACTOR_RADIUS):boolean {
  return canOccupy(p,radius,layout.obstacles)&&
    (Math.hypot(p.x-layout.camp.x,p.y-layout.camp.y)<1
    ||findPath(layout.camp,p,radius,layout.obstacles).length>0);
}
/** Add connected terrain forms before planning their roads. Each trial is
 * bounded and accepted only if protected positions, previously valid roads,
 * passes and the new trade graph remain usable. Retain original terrain when
 * no proposal fits; never promise connectivity in an invalid base world.
 */
export function planRegionalLandscape(base:WorldLayout,tiles:readonly TerrainTile[],
  sites:readonly RegionalSite[],reserved:readonly Readonly<Point>[],
  protectedRoads:readonly TerrainRoad[]=[]):RegionalLandscape {
  const original=planActOneTopology(base,tiles,sites,reserved);
  if(!original.ok)return {ok:false,reason:'base-disconnected',id:original.id};
  const targets=[base.camp,...base.encounterPositions,...reserved,...sites.map(s=>s.position)];
  if(targets.some(p=>!reachable(base,p)))return {ok:false,reason:'protected-target-blocked',id:'reserved'};
  const roads=protectedRoads.filter(r=>regionalRoadClear(r.points,r.width,base.obstacles));
  let layout:WorldLayout={...base,camp:{...base.camp},encounterPositions:base.encounterPositions.map(p=>({...p})),
    obstacles:base.obstacles.map(w=>({...w}))};
  let topology=original;
  const forms:RegionalLandform[]=[];
  for(const generate of [ridge,belt]){
    for(let attempt=0;attempt<ATTEMPTS;attempt++){
      const form=generate(base.seed,attempt);
      if(form.obstacles.some(w=>!inside(w)||layout.obstacles.some(b=>overlap(w,b)||w.id===b.id)))continue;
      // Do not shrink the original safe clearing or cover known destinations.
      if(form.obstacles.some(w=>distance(base.camp,w)<190
        ||targets.some(p=>distance(p,w)<ACTOR_RADIUS+24)))continue;
      const next:WorldLayout={...layout,obstacles:[...layout.obstacles,...form.obstacles]};
      const passes=[...forms,form].flatMap(f=>f.pass?[f.pass]:[]);
      // Reject cheap geometry failures before running multiple A* queries.
      if(roads.some(r=>!regionalRoadClear(r.points,r.width,next.obstacles))
        ||targets.some(p=>!reachable(next,p))||passes.some(p=>!reachable(next,p,42)))continue;
      const painted=materialBands(tiles,[...forms,form]);
      const planned=planActOneTopology(next,painted,sites,reserved);
      if(!planned.ok)continue;
      layout=next;topology=planned;forms.push(form);break;
    }
  }
  return {ok:true,layout,tiles:materialBands(tiles,forms),forms,topology,usedFallback:forms.length===0};
}
