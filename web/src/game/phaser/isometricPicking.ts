// GPL-3.0-only — presentation adapter, no simulation side effects.
import type { Point } from '../core/types';
import { resolvePointerContext, type ContextTarget, type ResolvedPointerContext } from '../input/contextResolver';
import { projectIsometric, unprojectIsometric, isometricDepth } from './isometricProjection';
import { occluderDepthAt, type IsometricOccluder } from './isometricOcclusion';

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
 * Opaque wall faces mask targets behind them. Multi-elevation picking remains future work.
 */
export function pickIsometricPointer(input: {
  projected: Readonly<Point>;
  origin: Readonly<Point>;
  uiCaptured: boolean;
  targets: readonly IsometricTarget[];
  canWalk: (point: Point) => boolean;
  occluders?: readonly IsometricOccluder[];
}): IsometricPick {
  const ground = unprojectIsometric(input.projected, 0, input.origin);
  if (input.uiCaptured) return { ground, aim: ground, context: { kind: 'UI' } };
  const wallDepth = occluderDepthAt(input.projected, input.occluders ?? []);
  const visible = wallDepth === -Infinity ? input.targets : input.targets.filter(target =>
    isometricDepth(target.position) + 0.5 > wallDepth);
  const bodies = visible.filter(target => {
    if (target.alive === false || target.bodyHeight <= 0 || target.bodyHalfWidth <= 0) return false;
    const foot = projectIsometric(target.position, 0, input.origin);
    return Math.abs(input.projected.x - foot.x) <= target.bodyHalfWidth
      && input.projected.y >= foot.y - target.bodyHeight && input.projected.y <= foot.y;
  }).sort((a, b) => isometricDepth(b.position) - isometricDepth(a.position)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const body = bodies[0];
  if (body) return { ground, aim: { ...body.position }, context: { kind: body.kind, id: body.id } };
  const context = resolvePointerContext({ pointer: ground, uiCaptured: false,
    walkable: wallDepth === -Infinity && input.canWalk(ground), targets: visible });
  const target = 'id' in context && visible.find(t => t.id === context.id && t.kind === context.kind);
  return { ground, aim: target ? { ...target.position } : ground, context };
}
