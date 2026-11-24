// GPL-3.0-only — purely visual geometry, never decides hits or damage.
import type { Point } from '../core/types';
import { projectIsometric } from './isometricProjection';

function validateRadius(radius: number): void {
  if (!Number.isFinite(radius) || radius <= 0) throw new RangeError('Invalid combat radius');
}

function projectedArc(center: Readonly<Point>, radius: number, start: number,
  sweep: number, segments: number, includeEnd: boolean, origin: Readonly<Point>): Point[] {
  return Array.from({ length: segments + (includeEnd ? 1 : 0) }, (_, index) => {
    const angle = start + sweep * index / segments;
    return projectIsometric({
      x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle)
    }, 0, origin);
  });
}

/** Project world-space circle samples, rather than inventing a screen-space radius. */
export function projectCombatCircle(center: Readonly<Point>, radius: number,
  origin: Readonly<Point>): Point[] {
  validateRadius(radius);
  return projectedArc(center, radius, 0, Math.PI * 2, 48, false, origin);
}

/** The cone contains its apex and exact first/last angular boundaries. */
export function projectCombatCone(center: Readonly<Point>, radius: number,
  angleRadians: number, arcDegrees: number, origin: Readonly<Point>): Point[] {
  validateRadius(radius);
  if (!Number.isFinite(angleRadians) || !Number.isFinite(arcDegrees)
    || arcDegrees <= 0 || arcDegrees > 360) throw new RangeError('Invalid combat cone');
  const sweep = arcDegrees * Math.PI / 180;
  const segments = Math.max(2, Math.ceil(48 * arcDegrees / 360));
  return [projectIsometric(center, 0, origin), ...projectedArc(center, radius,
    angleRadians - sweep / 2, sweep, segments, true, origin)];
}

/** Upright UI over a projected foot position; health remains a simulation value. */
export function combatHealthBar(center: Readonly<Point>, health: number,
  maximum: number, origin: Readonly<Point>): {
    x: number; y: number; width: number; height: number; fraction: number;
  } {
  const p = projectIsometric(center, 54, origin);
  const fraction = Number.isFinite(health) && Number.isFinite(maximum) && maximum > 0
    ? Math.max(0, Math.min(1, health / maximum)) : 0;
  return { x: p.x - 26, y: p.y, width: 52, height: 8, fraction };
}
