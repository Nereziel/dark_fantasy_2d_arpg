// GPL-3.0-only — opaque presentation geometry, never collision or fog state.
import type { Point } from '../core/types';
import { isometricFootprint, isometricDepth, type IsometricRect } from './isometricProjection';

export interface IsometricOccluder {
  readonly depth: number;
  readonly faces: readonly (readonly Point[])[];
}

export function createIsometricPrism(rect: Readonly<IsometricRect>, height: number,
  origin: Readonly<Point>): IsometricOccluder {
  if (!Number.isFinite(height) || height <= 0) throw new RangeError('Invalid prism height');
  const ground = isometricFootprint(rect, 0, origin);
  const top = isometricFootprint(rect, height, origin);
  return {
    depth: isometricDepth({ x: rect.x + rect.width, y: rect.y + rect.height }),
    faces: [
      [ground[1]!, ground[2]!, top[2]!, top[1]!],
      [ground[2]!, ground[3]!, top[3]!, top[2]!],
      top
    ]
  };
}

// All generated faces are convex, non-degenerate polygons; edges count as opaque.
function contains(point: Readonly<Point>, face: readonly Point[]): boolean {
  if (face.length < 3) return false;
  let positive = false, negative = false;
  for (let i = 0; i < face.length; i++) {
    const a = face[i]!, b = face[(i + 1) % face.length]!;
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (cross > 1e-7) positive = true;
    if (cross < -1e-7) negative = true;
    if (positive && negative) return false;
  }
  return true;
}

export function occluderDepthAt(point: Readonly<Point>, occluders: readonly IsometricOccluder[]): number {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return -Infinity;
  let depth = -Infinity;
  for (const wall of occluders) {
    if (wall.depth > depth && wall.faces.some(face => contains(point, face))) depth = wall.depth;
  }
  return depth;
}
