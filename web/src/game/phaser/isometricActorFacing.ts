// GPL-3.0-only — presentation state, never simulation steering.
import type { Point } from '../core/types';
import { isometricFacing, type IsometricFacing } from './isometricProjection';

export type DirectionalPixelView = 's' | 'se' | 'e' | 'ne' | 'n';
export type FacingInput = {
  position: Readonly<Point>;
  previous?: Readonly<Point>;
  /** Provide only an authoritative active attack/cast aim, not hover. */
  aim?: Readonly<Point>;
  last?: IsometricFacing;
};

export function resolveActorFacing(input: Readonly<FacingInput>): IsometricFacing {
  const { position, previous, aim, last = 's' } = input;
  const finite = (p: Readonly<Point>) => Number.isFinite(p.x) && Number.isFinite(p.y);
  if (!finite(position)) return last;
  const direction = (x: number, y: number) =>
    Number.isFinite(x) && Number.isFinite(y) && Math.hypot(x, y) > 0.3
      ? isometricFacing({ x, y }) : null;
  if (aim && finite(aim)) {
    const facing = direction(aim.x - position.x, aim.y - position.y);
    if (facing) return facing;
  }
  if (previous && finite(previous)) {
    const facing = direction(position.x - previous.x, position.y - previous.y);
    if (facing) return facing;
  }
  return last;
}

/** Five native views plus mirrored west-facing variants; no rotated bodies. */
export function directionalPixelView(facing: IsometricFacing): {
  view: DirectionalPixelView; flipX: boolean;
} {
  switch (facing) {
    case 'w': return { view: 'e', flipX: true };
    case 'nw': return { view: 'ne', flipX: true };
    case 'sw': return { view: 'se', flipX: true };
    default: return { view: facing, flipX: false };
  }
}
