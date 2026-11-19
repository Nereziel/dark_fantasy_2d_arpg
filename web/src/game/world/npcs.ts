import type { Point } from '../core/types';
export const WARDEN_POSITION: Readonly<Point> = Object.freeze({ x: 432, y: 407 });
export const WARDEN_INTERACT_RANGE = 106;
export function nearWarden(hero: Point): boolean {
  return Math.hypot(hero.x - WARDEN_POSITION.x, hero.y - WARDEN_POSITION.y) <= WARDEN_INTERACT_RANGE;
}
