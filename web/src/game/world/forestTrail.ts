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
  return null;
}
