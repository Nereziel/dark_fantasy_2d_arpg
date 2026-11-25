// GPL-3.0-only — presentation geometry; no collision or door commands.
import type { Point } from '../core/types';
import { isometricFootprint, projectIsometric, type IsometricRect } from './isometricProjection';
import { createIsometricPrism, type IsometricOccluder } from './isometricOcclusion';

/** Structural counterpart of the settlement planner's kind/entrance/variant fields.
 * No runtime dependency on its separate integration branch.
 */
export interface BuildingAppearance {
  readonly kind:'house'|'smithy'|'cabin'|'mine';
  readonly entranceSide:'south'|'east'|'north'|'west';
  readonly variant:number;
}
export interface BuildingPaint {
  readonly points:readonly Point[];
  readonly color:number;
  readonly layer:'wall'|'roof'|'door'|'detail';
  readonly opaque:boolean;
}
export interface BuildingPaintGroup {
  readonly kind:'facade'|'roof';
  readonly paint:readonly BuildingPaint[];
  readonly occluder:IsometricOccluder;
}
export interface BuildingArt {
  readonly base:readonly Point[];
  readonly layers:readonly BuildingPaintGroup[];
  readonly paint:readonly BuildingPaint[];
  readonly occluder:IsometricOccluder;
}

const STYLES = {
  house:{height:48,rise:24,wall:0x86735c,roof:0x62443e,trim:0x40342c},
  smithy:{height:56,rise:18,wall:0x72716a,roof:0x444e54,trim:0x302c28},
  cabin:{height:38,rise:26,wall:0x70543b,roof:0x414f3b,trim:0x3d3025},
  mine:{height:34,rise:14,wall:0x565650,roof:0x666357,trim:0x332b24}
} as const;
function shade(rgb:number,n:number):number {
  const c=(v:number)=>Math.max(0,Math.min(255,v+n));
  return (c(rgb>>>16&255)<<16)|(c(rgb>>>8&255)<<8)|c(rgb&255);
}
function lerp(a:Readonly<Point>,b:Readonly<Point>,t:number):Point {
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
}

/** Solid exterior art. The same primary convex faces are used for rendering,
 * hit testing and the existing hero cutaway; the roof is not a walkable floor.
 */
export function planBuildingArt(rect:Readonly<IsometricRect>, appearance:BuildingAppearance,
  origin:Readonly<Point>):BuildingArt {
  const style=STYLES[appearance.kind];
  if(!style||!Number.isInteger(appearance.variant)||appearance.variant<0||appearance.variant>3
    ||!['south','east','north','west'].includes(appearance.entranceSide))
    throw new RangeError('Invalid building appearance');
  const tint=appearance.variant*5-7;
  const base=isometricFootprint(rect,0,origin);
  const prism=createIsometricPrism(rect,style.height,origin);
  const paint:BuildingPaint[]=[];
  const add=(layer:BuildingPaint['layer'],points:readonly Point[],color:number,opaque=true)=>{
    paint.push({layer,points,color:shade(color,tint),opaque});
  };
  const front=prism.faces.slice(0,2);
  add('wall',front[0]!,shade(style.wall,-19));
  add('wall',front[1]!,style.wall);
  // Ground-to-eaves facade: wall planks or masonry courses and lower trim.
  for(let side=0;side<2;side++){
    const [a,b,c,d]=front[side]!;
    for(const t of [.13,.36,.60,.84]){
      add('detail',[lerp(a!,d!,t),lerp(b!,c!,t),lerp(b!,c!,t+.025),lerp(a!,d!,t+.025)],
        shade(style.wall,-30),false);
    }
    const visibleDoor=appearance.entranceSide===(side===0?'east':'south');
    if(visibleDoor){
      const half=appearance.kind==='mine'?.32:.17;
      const l=lerp(a!,b!,.5-half),r=lerp(a!,b!,.5+half);
      const topL=lerp(d!,c!,.5-half),topR=lerp(d!,c!,.5+half);
      const h=appearance.kind==='mine'?.78:.65;
      add('detail',[l,r,lerp(r,topR,h+.09),lerp(l,topL,h+.09)],style.trim,false);
      add('door',[lerp(l,r,.08),lerp(l,r,.92),
        lerp(lerp(l,r,.92),lerp(topL,topR,.92),h),
        lerp(lerp(l,r,.08),lerp(topL,topR,.08),h)],0x1f2020,false);
    }else{
      const window=(center:number)=>{
        const l=lerp(a!,b!,center-.10),r=lerp(a!,b!,center+.10);
        const lt=lerp(d!,c!,center-.10),rt=lerp(d!,c!,center+.10);
        add('detail',[lerp(l,lt,.47),lerp(r,rt,.47),lerp(r,rt,.72),lerp(l,lt,.72)],style.trim,false);
        add('detail',[lerp(l,lt,.52),lerp(r,rt,.52),lerp(r,rt,.64),lerp(l,lt,.64)],0xa08b54,false);
      };
      if(appearance.kind!=='mine') {window(.30);window(.70);}
    }
  }
  const facadePaint=paint.slice();
  const top=prism.faces[2]!;
  const ridge0=projectIsometric({x:rect.x,y:rect.y+rect.height/2},style.height+style.rise,origin);
  const ridge1=projectIsometric({x:rect.x+rect.width,y:rect.y+rect.height/2},style.height+style.rise,origin);
  // Two roof slopes and visible gable, all planar convex faces.
  add('roof',[top[0]!,top[1]!,ridge1,ridge0],shade(style.roof,-18));
  add('wall',[top[1]!,top[2]!,ridge1],shade(style.wall,-12));
  add('roof',[ridge0,ridge1,top[2]!,top[3]!],style.roof);
  // Repeating narrow strips follow the roof plane, no new blocking silhouette.
  for(const t of [.20,.40,.60,.80]){
    add('detail',[lerp(ridge0,top[3]!,t),lerp(ridge1,top[2]!,t),
      lerp(ridge1,top[2]!,t+.025),lerp(ridge0,top[3]!,t+.025)],shade(style.roof,-22),false);
  }
  add('detail',[ridge0,ridge1,lerp(ridge1,top[2]!,.045),lerp(ridge0,top[3]!,.045)],shade(style.roof,22),false);
  const group=(kind:BuildingPaintGroup['kind'],faces:readonly BuildingPaint[]):BuildingPaintGroup=>({
    kind,paint:faces,occluder:{depth:prism.depth,faces:faces.filter(p=>p.opaque).map(p=>p.points)}
  });
  // Keep roof slopes, gable and trim in one independent painter group.
  // The common ground-depth key and insertion order preserve original layering.
  const layers=[group('facade',facadePaint),group('roof',paint.slice(facadePaint.length))];
  return {base,paint,layers,occluder:{depth:prism.depth,faces:paint.filter(p=>p.opaque).map(p=>p.points)}};
}
