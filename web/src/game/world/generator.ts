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
