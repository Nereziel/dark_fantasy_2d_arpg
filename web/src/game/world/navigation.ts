import type { Point } from '../core/types';

export interface Obstacle { id: string; x: number; y: number; width: number; height: number }
export const WORLD_WIDTH = 2200;
export const WORLD_HEIGHT = 1400;
export const ACTOR_RADIUS = 18;
export const OBSTACLES: readonly Obstacle[] = [
  { id: 'shrine', x: 988, y: 320, width: 88, height: 91 },
  { id: 'collapsed-wall', x: 470, y: 715, width: 230, height: 58 },
  { id: 'fallen-tower', x: 1260, y: 575, width: 86, height: 220 },
  { id: 'north-barricade', x: 270, y: 215, width: 190, height: 70 }
];
const CELL = 40;
const COLS = Math.ceil(WORLD_WIDTH / CELL);
const ROWS = Math.ceil(WORLD_HEIGHT / CELL);
const KEY = (x: number, y: number): number => y * COLS + x;

export function canOccupy(point: Point, radius = ACTOR_RADIUS, obstacles: readonly Obstacle[] = OBSTACLES): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  if (point.x < radius || point.y < radius
      || point.x > WORLD_WIDTH - radius || point.y > WORLD_HEIGHT - radius) return false;
  return !obstacles.some(wall => point.x + radius > wall.x
    && point.x - radius < wall.x + wall.width
    && point.y + radius > wall.y
    && point.y - radius < wall.y + wall.height);
}

/** Collision-aware sliding, stepped so fast moves cannot tunnel through walls. */
export function moveActor(actor: Point, goal: Point, distance: number, radius = ACTOR_RADIUS, obstacles: readonly Obstacle[] = OBSTACLES): void {
  if (!(distance > 0) || !Number.isFinite(distance)) return;
  const dx = goal.x - actor.x, dy = goal.y - actor.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0) return;
  const total = Math.min(distance, length);
  const steps = Math.max(1, Math.ceil(total / (radius * 0.6)));
  const sx = dx / length * total / steps;
  const sy = dy / length * total / steps;
  for (let i = 0; i < steps; i++) {
    if (canOccupy({ x: actor.x + sx, y: actor.y + sy }, radius, obstacles)) {
      actor.x += sx; actor.y += sy;
    } else if (canOccupy({ x: actor.x + sx, y: actor.y }, radius, obstacles)) {
      actor.x += sx;
    } else if (canOccupy({ x: actor.x, y: actor.y + sy }, radius, obstacles)) {
      actor.y += sy;
    }
  }
}

const center = (col: number, row: number): Point => ({ x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 });
function grid(point: Point): [number, number] {
  return [
    Math.max(0, Math.min(COLS - 1, Math.floor(point.x / CELL))),
    Math.max(0, Math.min(ROWS - 1, Math.floor(point.y / CELL)))
  ];
}
function lineClear(start: Point, end: Point, radius: number, obstacles: readonly Obstacle[]): boolean {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const steps = Math.max(1, Math.ceil(length / 15));
  for (let i = 1; i <= steps; i++) {
    const ratio = i / steps;
    if (!canOccupy({ x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio }, radius, obstacles)) return false;
  }
  return true;
}

/** Combat projectiles require unblocked line of sight, independent of pathfinding. */
export function hasLineOfSight(
  from: Point, to: Point, obstacles: readonly Obstacle[] = OBSTACLES
): boolean {
  return canOccupy(from, 3, obstacles) && canOccupy(to, 3, obstacles)
    && lineClear(from, to, 3, obstacles);
}

/** Bounded, deterministic A* on the static walkability grid. */
export function findPath(from: Point, goal: Point, radius = ACTOR_RADIUS, obstacles: readonly Obstacle[] = OBSTACLES): Point[] {
  if (!canOccupy(goal, radius, obstacles)) return [];
  if (lineClear(from, goal, radius, obstacles)) return [{ ...goal }];
  const [startX, startY] = grid(from);
  const [endX, endY] = grid(goal);
  const start = KEY(startX, startY), end = KEY(endX, endY);
  const cost = new Float64Array(COLS * ROWS).fill(Infinity);
  const parent = new Int32Array(COLS * ROWS).fill(-1);
  const closed = new Uint8Array(COLS * ROWS);
  const frontier: Array<{ key: number; score: number }> = [];
  const heuristic = (x: number, y: number) => Math.hypot(x - endX, y - endY);
  cost[start] = 0;
  frontier.push({ key: start, score: heuristic(startX, startY) });
  let attempts = 0;
  while (frontier.length && attempts++ < COLS * ROWS * 5) {
    frontier.sort((a, b) => a.score - b.score || a.key - b.key);
    const current = frontier.shift()!.key;
    if (closed[current]) continue;
    if (current === end) {
      const points: Point[] = [];
      let node = end;
      while (node !== start && node !== -1) {
        points.push(center(node % COLS, Math.floor(node / COLS)));
        node = parent[node]!;
      }
      points.reverse();
      points.push({ ...goal });
      // Remove redundant route waypoints when line of sight exists.
      const reduced: Point[] = [];
      let anchor = from;
      for (let i = 0; i < points.length; i++) {
        if (i === points.length - 1 || !lineClear(anchor, points[i + 1]!, radius, obstacles)) {
          reduced.push(points[i]!);
          anchor = points[i]!;
        }
      }
      return reduced;
    }
    closed[current] = 1;
    const x = current % COLS, y = Math.floor(current / COLS);
    for (const [vx, vy] of [[-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const nx = x + vx, ny = y + vy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const candidate = KEY(nx, ny);
      if (closed[candidate] || !canOccupy(center(nx, ny), radius, obstacles)) continue;
      if (vx !== 0 && vy !== 0 &&
        (!canOccupy(center(x + vx, y), radius, obstacles) || !canOccupy(center(x, y + vy), radius, obstacles))) continue;
      const updated = cost[current]! + Math.hypot(vx, vy);
      if (updated >= cost[candidate]!) continue;
      cost[candidate] = updated;
      parent[candidate] = current;
      frontier.push({ key: candidate, score: updated + heuristic(nx, ny) });
    }
  }
  return [];
}

/** Resolve one click to a reachable destination without altering the existing pathfinder. */
export function resolveReachableDestination(
  from: Point,
  requested: Point,
  radius = ACTOR_RADIUS,
  obstacles: readonly Obstacle[] = OBSTACLES
): Point | null {
  if (!from || !requested || !Number.isFinite(from.x) || !Number.isFinite(from.y)
      || !Number.isFinite(requested.x) || !Number.isFinite(requested.y)
      || !Number.isFinite(radius) || radius <= 0 || !Array.isArray(obstacles)
      || obstacles.some(wall => !wall || !Number.isFinite(wall.x) || !Number.isFinite(wall.y)
        || !Number.isFinite(wall.width) || !Number.isFinite(wall.height)
        || wall.width <= 0 || wall.height <= 0)
      || !canOccupy(from, radius, obstacles)) return null;

  // Keep an already reachable destination exact rather than snapping it to the grid.
  if (canOccupy(requested, radius, obstacles) && findPath(from, requested, radius, obstacles).length > 0) {
    return { ...requested };
  }

  // Compare squared Euclidean distances by their difference, scaled to stay
  // finite even for coordinates close to Number.MAX_VALUE. Clamping the target
  // would change which reachable location is mathematically nearest.
  const metricScale = Math.max(1, Math.abs(requested.x), Math.abs(requested.y));
  let best: Point = { ...from };
  let bestTravel = 0;
  const consider = (candidate: Point): void => {
    const distanceDelta = (candidate.x - best.x)
      * (((candidate.x + best.x) / 2 - requested.x) / metricScale)
      + (candidate.y - best.y)
      * (((candidate.y + best.y) / 2 - requested.y) / metricScale);
    const travel = Math.hypot(candidate.x - from.x, candidate.y - from.y);
    if (distanceDelta < 0
      || (distanceDelta === 0 && (travel < bestTravel
        || (travel === bestTravel && (candidate.x < best.x
          || (candidate.x === best.x && candidate.y < best.y)))))) {
      best = candidate;
      bestTravel = travel;
    }
  };

  const limit = COLS * ROWS;
  const state = new Uint8Array(limit); // 0 unknown, 1 passable, 2 blocked
  const visited = new Uint8Array(limit);
  const queue = new Int32Array(limit);
  let head = 0;
  let tail = 0;
  const walkable = (x: number, y: number): boolean => {
    const key = KEY(x, y);
    if (state[key] === 0) {
      state[key] = canOccupy(center(x, y), radius, obstacles) ? 1 : 2;
    }
    return state[key] === 1;
  };
  const enqueue = (x: number, y: number): void => {
    const key = KEY(x, y);
    if (visited[key]) return;
    visited[key] = 1;
    queue[tail++] = key;
  };

  // A valid position may lie in a cell whose *center* is blocked.
  // Seed only neighboring centers with an unobstructed segment from the actor.
  const [startX, startY] = grid(from);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = startX + dx, y = startY + dy;
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS || !walkable(x, y)) continue;
      if (lineClear(from, center(x, y), radius, obstacles)) enqueue(x, y);
    }
  }

  const directions: ReadonlyArray<readonly [number, number]> = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1]
  ];
  // Each cell is queued once: at most COLS*ROWS expansions, no repeated A*.
  while (head < tail && head < limit) {
    const key = queue[head++]!;
    const x = key % COLS, y = Math.floor(key / COLS);
    const here = center(x, y);
    consider(here);
    for (const [dx, dy] of directions) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const next = KEY(nx, ny);
      if (visited[next] || !walkable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!walkable(x + dx, y) || !walkable(x, y + dy))) continue;
      if (!lineClear(here, center(nx, ny), radius, obstacles)) continue;
      enqueue(nx, ny);
    }
  }

  return canOccupy(best, radius, obstacles) && findPath(from, best, radius, obstacles).length > 0
    ? { ...best }
    : null;
}
