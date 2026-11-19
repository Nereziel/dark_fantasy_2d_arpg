import type { Point } from '../core/types';
import { ACTOR_RADIUS, OBSTACLES, canOccupy, WORLD_HEIGHT, WORLD_WIDTH, type Obstacle } from './navigation';

export const CAMP: Point = { x: 390, y: 470 };
export const CAMP_RADIUS = 165;
const FIXED_ENCOUNTERS: readonly Point[] = [
  { x: 780, y: 520 },
  { x: 910, y: 635 },
  { x: 1050, y: 535 }
];
export interface WorldLayout {
  seed: number;
  camp: Point;
  obstacles: Obstacle[];
  encounterPositions: Point[];
}

/**
 * Small seeded wilderness layout, not yet a full procedural tilemap.
 * The same layout powers renderer, navigation and collision. The starting
 * clearing and the three encounter locations remain accessible.
 */
export function generateWorld(seed: number): WorldLayout {
  const normalized = seed >>> 0;
  let state = normalized === 0 ? 0x9e3779b9 : normalized;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const obstacles = OBSTACLES.map(wall => ({ ...wall }));
  const encounterPositions = FIXED_ENCOUNTERS.map(point => ({ ...point }));
  if (normalized !== 0) {
    for (const point of encounterPositions) {
      const dx = Math.round((random() - 0.5) * 48);
      const dy = Math.round((random() - 0.5) * 48);
      point.x += dx;
      point.y += dy;
    }

    // The original road / camp / enemy approaches remain open.
    let placed = 0;
    for (let attempt = 0; attempt < 100 && placed < 8; attempt++) {
      const width = 38 + Math.round(random() * 48);
      const height = 34 + Math.round(random() * 49);
      const wall: Obstacle = {
        id: 'wild-ruin-' + placed,
        x: 200 + Math.round(random() * (WORLD_WIDTH - 450)),
        y: 115 + Math.round(random() * (WORLD_HEIGHT - 360)),
        width, height
      };
      const mid = { x: wall.x + width / 2, y: wall.y + height / 2 };
      if (Math.hypot(mid.x - CAMP.x, mid.y - CAMP.y) < CAMP_RADIUS + 115) continue;
      if (encounterPositions.some(p => Math.hypot(mid.x - p.x, mid.y - p.y) < 120)) continue;
      if (wall.x < 1150 && wall.y > 390 && wall.y < 670) continue;
      const overlaps = obstacles.some(other =>
        wall.x < other.x + other.width + 36 && wall.x + wall.width + 36 > other.x
        && wall.y < other.y + other.height + 36 && wall.y + wall.height + 36 > other.y);
      if (overlaps) continue;
      obstacles.push(wall);
      placed++;
    }
  }
  // World seeds must never create obstacles on hero or monster spawn.
  if (!canOccupy(CAMP, ACTOR_RADIUS, obstacles)
    || encounterPositions.some(point => !canOccupy(point, ACTOR_RADIUS, obstacles))) {
    throw new Error('World generation blocked a spawn point');
  }
  return { seed: normalized, camp: { ...CAMP }, obstacles, encounterPositions };
}

/** Randomness is supplied at the UI/session boundary, not inside the simulation. */
export function newSessionSeed(): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0]! || 1;
}

/**
 * Crypt of the Hollow Crown. Session-local, reproducible floor plan with a
 * guaranteed open central passage to both packs and the final boss arena.
 */
export const CRYPT_GATE: Readonly<Point> = { x: 689, y: 397 };
export const CRYPT_EXIT: Readonly<Point> = { x: 310, y: 705 };
export const CRYPT_BOSS_POSITIONS: readonly Point[] = [
  { x: 1530, y: 695 },
  { x: 1380, y: 545 },
  { x: 1330, y: 835 }
];

export function generateCrypt(seed: number): WorldLayout {
  const normalized = seed >>> 0;
  let state = (normalized ^ 0xb7e15162) >>> 0;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const obstacles: Obstacle[] = [
    { id: 'crypt-north-outer', x: 140, y: 190, width: 1670, height: 76 },
    { id: 'crypt-south-outer', x: 140, y: 1115, width: 1670, height: 76 },
    { id: 'crypt-west-outer', x: 140, y: 266, width: 76, height: 850 },
    { id: 'crypt-east-outer', x: 1734, y: 266, width: 76, height: 850 },
    { id: 'crypt-pillar-n', x: 720, y: 312, width: 95, height: 96 },
    { id: 'crypt-pillar-s', x: 870, y: 955, width: 110, height: 100 },
    { id: 'crypt-altar-n', x: 1510, y: 350, width: 135, height: 110 },
    { id: 'crypt-altar-s', x: 1480, y: 930, width: 165, height: 110 }
  ];
  const encounterPositions: Point[] = [
    { x: 920, y: 585 },
    { x: 1030, y: 795 },
    { x: 1150, y: 680 }
  ];
  for (const point of encounterPositions) {
    point.x += Math.round((random() - 0.5) * 84);
    point.y += Math.round((random() - 0.5) * 58);
  }
  let added = 0;
  for (let n = 0; n < 90 && added < 11; n++) {
    const width = 34 + Math.floor(random() * 53);
    const height = 30 + Math.floor(random() * 53);
    const x = 290 + Math.floor(random() * 1310);
    const y = 300 + Math.floor(random() * 680);
    const wall: Obstacle = { id: 'crypt-rubble-' + added, x, y, width, height };
    const center = { x: x + width / 2, y: y + height / 2 };
    // Keep a broad east-west combat corridor permanently passable.
    if (center.y > 475 && center.y < 905) continue;
    if ([CRYPT_EXIT, ...encounterPositions, ...CRYPT_BOSS_POSITIONS]
      .some(p => Math.hypot(center.x - p.x, center.y - p.y) < 95)) continue;
    if (obstacles.some(other => x < other.x + other.width + 30
      && x + width + 30 > other.x && y < other.y + other.height + 30
      && y + height + 30 > other.y)) continue;
    obstacles.push(wall);
    added++;
  }
  for (const position of [CRYPT_EXIT, ...encounterPositions, ...CRYPT_BOSS_POSITIONS]) {
    if (!canOccupy(position, ACTOR_RADIUS, obstacles)) {
      throw new Error('Crypt generation blocked an encounter or portal');
    }
  }
  return {
    seed: normalized, camp: { ...CRYPT_EXIT },
    obstacles, encounterPositions
  };
}
