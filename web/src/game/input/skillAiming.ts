import type { Point } from '../core/types';

export type SkillAimMode = 'SELF' | 'TARGET_ENTITY' | 'GROUND_POSITION' | 'DIRECTION' | 'AREA';
export type SkillAim =
  | { mode: 'SELF' }
  | { mode: 'TARGET_ENTITY'; targetId: string }
  | { mode: 'GROUND_POSITION' | 'AREA'; position: Point }
  | { mode: 'DIRECTION'; direction: Point };

function finite(point: Point | null): point is Point {
  return point !== null && Number.isFinite(point.x) && Number.isFinite(point.y);
}

/** Converts mouse world coordinates into an immutable skill target. */
export function resolveSkillAim(
  mode: SkillAimMode, origin: Point, cursor: Point | null, targetId: string | null
): SkillAim | null {
  if (mode === 'SELF') return { mode: 'SELF' };
  if (mode === 'TARGET_ENTITY') {
    return targetId && targetId.trim() ? { mode, targetId } : null;
  }
  if (!finite(origin) || !finite(cursor)) return null;
  if (mode === 'GROUND_POSITION' || mode === 'AREA') {
    return { mode, position: { ...cursor } };
  }
  if (mode === 'DIRECTION') {
    const x = cursor.x - origin.x;
    const y = cursor.y - origin.y;
    const length = Math.hypot(x, y);
    return length > 0.00001 ? { mode, direction: { x: x / length, y: y / length } } : null;
  }
  return null;
}
