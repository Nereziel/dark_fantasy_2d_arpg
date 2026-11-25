// GPL-3.0-only — original deterministic presentation; never alters collision.
import type { Point, ZoneId } from '../core/types';
import type { OptionalDungeonId } from '../world/optionalDungeonVisit';
import { optionalDungeonVisualStyle } from '../world/optionalDungeonVisuals';
import { isometricDepth, isometricFootprint, projectIsometric, type IsometricRect } from './isometricProjection';
import { createIsometricPrism, type IsometricOccluder } from './isometricOcclusion';

export type ObstacleMaterial = 'forest' | 'rock' | 'ruin' | 'timber' | 'crypt' | 'mine' | 'cave';
export interface PropPaint {
  readonly points: readonly Point[];
  readonly color: number;
  /** Every opaque polygon also participates in pointer occlusion and cutaway. */
  readonly opaque: boolean;
}
export interface ObstacleArt {
  readonly base: readonly Point[];
  readonly paint: readonly PropPaint[];
  readonly occluder: IsometricOccluder;
}

export function obstacleMaterial(id: string, zone: ZoneId, dungeonId?: OptionalDungeonId): ObstacleMaterial {
  if (zone === 'crypt') return dungeonId ?? 'crypt';
  if (id.includes('barricade')) return 'timber';
  if (id.includes('ruin') || id.includes('shrine') || id.includes('tower') || id.includes('wall')) return 'ruin';
  if (id.includes('ravine') || id.includes('rock')) return 'rock';
  return 'forest';
}

function mix(a: Readonly<Point>, b: Readonly<Point>, t: number): Point {
  return { x: a.x+(b.x-a.x)*t, y: a.y+(b.y-a.y)*t };
}
function shade(rgb: number, n: number): number {
  const c = (v: number) => Math.max(0,Math.min(255,v+n));
  return (c(rgb>>>16&255)<<16)|(c(rgb>>>8&255)<<8)|c(rgb&255);
}
function variation(seed: number, rect: IsometricRect): number {
  let h=seed^Math.imul(Math.round(rect.x)+1,0x9e3779b1)^Math.imul(Math.round(rect.y)+1,0x85ebca6b);
  h=Math.imul(h^(h>>>16),0x7feb352d);
  return (h^(h>>>15))>>>0;
}

/** Draw commands are built only on zone/seed rebuild. Convex primary surfaces
 * define the same silhouette for art, pointer blocking and local hero cutaway.
 * The source rect remains the authoritative simulation collision footprint.
 */
export function planObstacleArt(rect: IsometricRect, material: ObstacleMaterial,
  seed: number, origin: Readonly<Point>): ObstacleArt {
  const base=isometricFootprint(rect,0,origin);
  const paint: PropPaint[]=[];
  const v=variation(seed,rect);
  const tint=v%11-5;
  const add=(points:readonly Point[],color:number,opaque=true)=>{
    paint.push({points,color:shade(color,tint),opaque});
  };
  const depth=isometricDepth({x:rect.x+rect.width,y:rect.y+rect.height});
  const center=projectIsometric({x:rect.x+rect.width/2,y:rect.y+rect.height/2},0,origin);
  if (material==='forest') {
    // Dark undergrowth delineates the entire non-walkable footprint.
    add(base,0x202e23);
    const trunkWidth=Math.max(4,Math.min(14,rect.width*.25,rect.height*.25));
    const trunk=createIsometricPrism({x:rect.x+(rect.width-trunkWidth)/2,
      y:rect.y+(rect.height-trunkWidth)/2,width:trunkWidth,height:trunkWidth},38,origin);
    add(trunk.faces[0]!,0x302c25);add(trunk.faces[1]!,0x504035);add(trunk.faces[2]!,0x6c5840);
    const halfWidth=Math.max(11,(rect.width+rect.height)*.40);
    const height=70+v%17;
    const crown=(w:number,y:number,h:number):readonly Point[]=>[
      {x:center.x,y:y-h},{x:center.x+w,y:y+h*.30},
      {x:center.x+w*.72,y:y+h},{x:center.x-w*.72,y:y+h},
      {x:center.x-w,y:y+h*.30}];
    const lower=crown(halfWidth,center.y-height*.40,height*.30);
    const upper=crown(halfWidth*.75,center.y-height*.73,height*.28);
    add(lower,0x293d30);
    add([lower[0]!,lower[1]!,lower[2]!,{x:center.x,y:lower[2]!.y}],0x354b36,false);
    add(upper,0x41543a);
    add([upper[0]!,upper[3]!,upper[4]!],0x536348,false);
  } else if (material==='rock') {
    add(base,0x35352f);
    const height=23+v%17;
    const top=base.map(p=>{const q=mix(p,center,.28);return{x:q.x,y:q.y-height}});
    add([base[1]!,base[2]!,top[2]!,top[1]!],0x3e4141);
    add([base[2]!,base[3]!,top[3]!,top[2]!],0x55564f);
    add(top,0x737368);
    add([top[0]!,top[1]!,mix(top[1]!,top[2]!,.45),centerOf(top)],0x89877a,false);
  } else {
    const timber=material==='timber';
    const style=optionalDungeonVisualStyle(material==='mine'||material==='cave'?material:undefined);
    const height=material==='crypt'||style?44:timber?40:40+v%13;
    const prism=createIsometricPrism(rect,height,origin);
    add(prism.faces[0]!,style?.wallFaces[0]??(timber?0x433326:0x383b3e));
    add(prism.faces[1]!,style?.wallFaces[1]??(timber?0x66503a:0x52534f));
    add(prism.faces[2]!,style?.wallFaces[2]??(timber?0x8d7352:0x79796d));
    // Mortar courses or plank seams lie within their parent surfaces.
    for (let side=0;side<2;side++) {
      const [a,b,c,d]=prism.faces[side]!;
      const rows=timber?1:3;
      for(let row=1;row<=rows;row++){
        const t=row/(rows+1);
        add([mix(a!,d!,t),mix(b!,c!,t),mix(b!,c!,t+.026),mix(a!,d!,t+.026)],style?.seam??0x282b2c,false);
      }
      const count=Math.max(1,Math.ceil((side===0?rect.height:rect.width)/18));
      for(let i=1;i<count;i++){
        const t=i/count;
        const width=Math.min(.025,(1-t)/2);
        add([mix(a!,b!,t),mix(a!,b!,t+width),mix(d!,c!,t+width),mix(d!,c!,t)],
          style?.seam??(timber?0x33281f:0x41423e),false);
      }
    }
    const top=prism.faces[2]!;
    add([top[0]!,mix(top[0]!,top[1]!,.86),mix(top[3]!,top[2]!,.86),top[3]!],
      style?.detail??(timber?0x977958:0x828274),false);
  }
  return {base,paint,occluder:{depth,faces:paint.filter(p=>p.opaque).map(p=>p.points)}};
}
function centerOf(points:readonly Point[]): Point {
  return {x:points.reduce((s,p)=>s+p.x,0)/points.length,y:points.reduce((s,p)=>s+p.y,0)/points.length};
}
