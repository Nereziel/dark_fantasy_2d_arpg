import type { Point } from '../core/types';
import { ACTOR_RADIUS, findPath, moveActor, type Obstacle } from '../world/navigation';

export function nextMoveSpeed(
  current: number, max: number, distanceLeft: number, dt: number
): number {
  if (!(max > 0) || !(dt > 0) || !(distanceLeft > 0) ||
    ![current, max, distanceLeft, dt].every(Number.isFinite)) return 0;
  const braking = Math.sqrt(2 * 740 * distanceLeft);
  return Math.max(0, Math.min(max, braking, current + 850 * dt));
}

/** Collision and deterministic A*, reusable for hero and AI movement. */
export function moveToward(
  actor: Point, target: Point, speed: number, dt: number,
  stop: number, obstacles: readonly Obstacle[], blocked = false
): void {
  if (blocked || ![actor.x, actor.y, target.x, target.y, speed, dt, stop].every(Number.isFinite)) return;
  const remaining = Math.hypot(actor.x - target.x, actor.y - target.y);
  if (remaining <= stop || remaining < 0.001) return;
  const amount = Math.max(0, Math.min(speed * dt, remaining - stop));
  const before = { ...actor };
  moveActor(actor, target, amount, ACTOR_RADIUS, obstacles);
  if (Math.hypot(actor.x - before.x, actor.y - before.y) < amount * 0.15 && amount > 0.01) {
    const path = findPath(actor, target, ACTOR_RADIUS, obstacles);
    if (path.length) moveActor(actor, path[0]!, amount, ACTOR_RADIUS, obstacles);
  }
}
