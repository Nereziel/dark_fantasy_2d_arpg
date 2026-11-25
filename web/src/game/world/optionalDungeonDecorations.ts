// GPL-3.0-only — original, purely visual floor decorations.
// Never create collision obstacles, interactables, loot or hidden geometry.
import type {Point} from '../core/types';
import {DUNGEON_TILE_SIZE,type ProceduralDungeonResult,type DungeonTile} from './proceduralDungeon';
import type {OptionalDungeonId} from './optionalDungeonVisit';

export type DungeonDecorationKind='rail'|'sleeper'|'supportFoot'|'crystal'|'moss';
export interface DungeonDecoration {
  readonly id:string;
  readonly tileId:string;
  readonly kind:DungeonDecorationKind;
  readonly color:number;
  readonly points:readonly Point[];
}
const TILE=DUNGEON_TILE_SIZE;
function hash(seed:number,x:number,y:number):number {
  let h=seed^Math.imul(x+1,0x9e3779b1)^Math.imul(y+1,0x85ebca6b);
  h=Math.imul(h^(h>>>16),0x7feb352d);
  return (h^(h>>>15))>>>0;
}
const rect=(x:number,y:number,w:number,h:number):Point[]=>[
  {x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}
];
export function planOptionalDungeonDecorations(dungeon:ProceduralDungeonResult,
  id:OptionalDungeonId|undefined):DungeonDecoration[]{
  if(id!=='mine'&&id!=='cave')return [];
  const result:DungeonDecoration[]=[];
  const floors=dungeon.tiles.filter(t=>t.kind==='floor');
  const floorKeys=new Set(floors.map(t=>t.x+':'+t.y));
  const doors=new Map(dungeon.doors.map(d=>[d.id,d]));
  const add=(tile:DungeonTile,kind:DungeonDecorationKind,color:number,points:readonly Point[])=>{
    if(!points.every(p=>p.x>=0&&p.y>=0&&p.x<=TILE&&p.y<=TILE))return;
    result.push({id:tile.id+'/decor/'+kind,tileId:tile.id,kind,color,
      points:points.map(p=>({x:tile.x+p.x,y:tile.y+p.y}))});
  };
  for(const tile of floors){
    const v=hash(dungeon.seed,tile.x,tile.y);
    const door=tile.doorId?doors.get(tile.doorId):undefined;
    if(id==='mine'&&door&&door.kind==='open'){
      const horizontal=Math.abs(door.portalA.x-door.portalB.x)>Math.abs(door.portalA.y-door.portalB.y);
      const center=horizontal?door.passage.y+door.passage.height/2:door.passage.x+door.passage.width/2;
      const offset=center-(horizontal?tile.y:tile.x);
      // Two parallel rails run along the real passage, not across a solid wall.
      const railOffset=[offset-12,offset+12].find(n=>n>=2&&n<=TILE-2);
      if(railOffset!==undefined){
        const start=railOffset<20?railOffset-2:0;
        const end=railOffset<20?TILE:railOffset+2;
        const transform=(p:Point)=>horizontal?p:{x:p.y,y:p.x};
        add(tile,'sleeper',0x34271d,rect(17,start,6,end-start).map(transform));
        add(tile,'rail',0x9f8c70,rect(0,railOffset-1,40,3).map(transform));
      }
      continue;
    }
    if(door||!tile.roomId)continue;
    const edge=[[-TILE,0],[TILE,0],[0,-TILE],[0,TILE]]
      .some(([dx,dy])=>!floorKeys.has((tile.x+dx!)+':'+(tile.y+dy!)));
    if(!edge||v%3===0)continue;
    if(id==='mine'){
      add(tile,'supportFoot',0x36291e,rect(8,8,24,24));
    }else{
      add(tile,'moss',0x526c49,[{x:4,y:12},{x:15,y:5},{x:33,y:11},{x:35,y:28},{x:16,y:35},{x:5,y:26}]);
      add(tile,'crystal',0x88b8a4,[{x:12,y:27},{x:19,y:8},{x:28,y:18},{x:25,y:31}]);
    }
  }
  return result;
}
