// GPL-3.0-only — presentation adapter, no simulation side effects.
import type { Point } from '../core/types';
import { resolvePointerContext, type ContextTarget, type ResolvedPointerContext } from '../input/contextResolver';
import { projectIsometric, unprojectIsometric, isometricDepth } from './isometricProjection';

export type IsometricTarget = ContextTarget & {
  readonly bodyHeight: number;
  readonly bodyHalfWidth: number;
};

export interface IsometricPick {
  ground: Point;
  aim: Point;
  context: ResolvedPointerContext;
}

/** Upright visible bodies win in painter order. Ground footprints retain the
 * existing context resolver. Aiming at a body returns its true world foot.
 * Wall/roof occlusion and multi-elevation picking are future renderer work.
 */
export function pickIsometricPointer(input: {
  projected: Readonly<Point>;
  origin: Readonly<Point>;
  uiCaptured: boolean;
  targets: readonly IsometricTarget[];
  canWalk: (point: Point) => boolean;
}): IsometricPick {
  const ground = unprojectIsometric(input.projected, 0, input.origin);
  if (input.uiCaptured) return { ground, aim: ground, context: { kind: 'UI' } };
  const bodies = input.targets.filter(target => {
    if (target.alive === false || target.bodyHeight <= 0 || target.bodyHalfWidth <= 0) return false;
    const foot = projectIsometric(target.position, 0, input.origin);
    return Math.abs(input.projected.x - foot.x) <= target.bodyHalfWidth
      && input.projected.y >= foot.y - target.bodyHeight && input.projected.y <= foot.y;
  }).sort((a, b) => isometricDepth(b.position) - isometricDepth(a.position)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const body = bodies[0];
  if (body) return { ground, aim: { ...body.position }, context: { kind: body.kind, id: body.id } };
  const context = resolvePointerContext({ pointer: ground, uiCaptured: false,
    walkable: input.canWalk(ground), targets: input.targets });
  const target = 'id' in context && input.targets.find(t => t.id === context.id && t.kind === context.kind);
  return { ground, aim: target ? { ...target.position } : ground, context };
}
