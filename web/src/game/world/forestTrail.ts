/** Hand-authored trail sections assembled against the current wilderness seed. GPL-3.0-only. */
import type { Point } from '../core/types';
import { ACTOR_RADIUS, canOccupy, findPath, type Obstacle } from './navigation';
import type { WorldLayout } from './generator';
import { routeClear, type TerrainRoad } from './wildernessTerrain';

export const CORRUPTION_TRAIL_ID = 'road-story-corruption_site';
export const FOREST_SIDE_TRAIL_ID = 'road-forest-side';

interface TrailSection {
  readonly id: string;
  readonly entrance: Point;
  readonly middle: Point;
  readonly exit: Point;
  readonly detour: Point;
  readonly edges: readonly Omit<Obstacle, 'id'>[];
}

const SECTIONS: readonly TrailSection[] = [
  {
    id: 'clearing',
    entrance: { x: 800, y: 410 }, middle: { x: 1130, y: 390 }, exit: { x: 1360, y: 410 },
    detour: { x: 1140, y: 215 },
    edges: [{ x: 815, y: 248, width: 110, height: 48 },
      { x: 1150, y: 520, width: 88, height: 56 }, { x: 1235, y: 248, width: 63, height: 65 }]
  },
  {
    id: 'ravine',
    entrance: { x: 800, y: 395 }, middle: { x: 1110, y: 210 }, exit: { x: 1320, y: 385 },
    detour: { x: 1160, y: 450 },
    edges: [{ x: 1158, y: 92, width: 175, height: 52 },
      { x: 1095, y: 300, width: 132, height: 58 }, { x: 826, y: 488, width: 48, height: 74 }]
  },
  {
    id: 'ruins',
    entrance: { x: 790, y: 405 }, middle: { x: 1160, y: 486 }, exit: { x: 1380, y: 478 },
    detour: { x: 1180, y: 315 },
    edges: [{ x: 1140, y: 570, width: 92, height: 48 },
      { x: 1337, y: 542, width: 90, height: 49 }, { x: 1250, y: 180, width: 75, height: 52 }]
  }
];

function joinRoute(anchors: readonly Point[], obstacles: readonly Obstacle[]): Point[] | null {
  const points = [{ ...anchors[0]! }];
  for (let index = 1; index < anchors.length; index++) {
    const start = anchors[index - 1]!;
    const end = anchors[index]!;
    let connected = false;
    for (const radius of [ACTOR_RADIUS + 4, ACTOR_RADIUS]) {
      const segment = [start, ...findPath(start, end, radius, obstacles)];
      if (!routeClear(segment, obstacles)) continue;
      points.push(...segment.slice(1));
      connected = true;
      break;
    }
    if (!connected) return null;
  }
  return points;
}

function nearbyAnchor(anchor: Point, obstacles: readonly Obstacle[]): Point | undefined {
  return [anchor, { x: anchor.x, y: anchor.y - 70 }, { x: anchor.x, y: anchor.y + 70 },
    { x: anchor.x + 65, y: anchor.y }, { x: anchor.x - 65, y: anchor.y }]
    .find(point => canOccupy(point, ACTOR_RADIUS + 4, obstacles));
}

/** When no authored section fits, derive a real branch from a validated
 * story path. No new obstacles or unchecked straight lines are introduced. */
function fallbackTrail(layout:WorldLayout,site:Point):{
  roads:TerrainRoad[];edgeCandidates:Obstacle[];
}|null {
  const {camp,obstacles}=layout;
  const main=joinRoute([camp,site],obstacles);
  if(!main)return null;
  const segments=main.slice(1).map((b,i)=>{
    const a=main[i]!;
    return {a,b,i,length:Math.hypot(b.x-a.x,b.y-a.y)};
  }).sort((a,b)=>b.length-a.length||a.i-b.i);
  const sign=layout.seed%2===0?1:-1;
  for(const {a,b,i,length} of segments){
    if(length<100)continue;
    const at=(t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
    const entrance=at(.2),exit=at(.8),mid=at(.5);
    for(const distance of [70,110,160,210]){
      for(const direction of [sign,-sign]){
        const detour={x:Math.round(mid.x-(b.y-a.y)/length*distance*direction),
          y:Math.round(mid.y+(b.x-a.x)/length*distance*direction)};
        if(!canOccupy(detour,ACTOR_RADIUS+4,obstacles))continue;
        const side=joinRoute([entrance,detour,exit],obstacles);
        if(!side)continue;
        const points=[...main.slice(0,i+1),entrance,exit,...main.slice(i+1)];
        if(!routeClear(points,obstacles)||points.some(p=>p.x===detour.x&&p.y===detour.y))continue;
        return {roads:[
          {id:CORRUPTION_TRAIL_ID,from:{...camp},to:{...site},width:46,points},
          {id:FOREST_SIDE_TRAIL_ID,from:entrance,to:exit,width:38,points:side}
        ],edgeCandidates:[]};
      }
    }
  }
  return null;
}

export function planForestTrail(layout: WorldLayout, site: Point): {
  roads: TerrainRoad[];
  edgeCandidates: Obstacle[];
} | null {
  const offset = ((layout.seed ^ (layout.seed >>> 16)) >>> 0) % SECTIONS.length;
  for (let index = 0; index < SECTIONS.length; index++) {
    const section = SECTIONS[(index + offset) % SECTIONS.length]!;
    const { obstacles, camp } = layout;
    const entrance = nearbyAnchor(section.entrance, obstacles);
    const middle = nearbyAnchor(section.middle, obstacles);
    const exit = nearbyAnchor(section.exit, obstacles);
    const detour = nearbyAnchor(section.detour, obstacles);
    if (!entrance || !middle || !exit || !detour) continue;
    const main = joinRoute([camp, entrance, middle, exit, site], obstacles);
    const side = joinRoute([entrance, detour, exit], obstacles);
    if (!main || !side || main.some(point => point.x === detour.x && point.y === detour.y)) continue;
    return {
      roads: [
        { id: CORRUPTION_TRAIL_ID, from: { ...camp }, to: { ...site }, width: 46, points: main },
        { id: FOREST_SIDE_TRAIL_ID, from: { ...entrance }, to: { ...exit }, width: 38, points: side }
      ],
      edgeCandidates: section.edges.map((edge, i) => ({ ...edge, id: `trail-edge-${section.id}-${i}` }))
    };
  }
  return fallbackTrail(layout,site);
}
