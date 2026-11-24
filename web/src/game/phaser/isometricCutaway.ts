// GPL-3.0-only — presentation only; no change to collision or discovery.
import type { Point } from '../core/types';
import { isometricDepth, projectIsometric } from './isometricProjection';
import type { IsometricOccluder } from './isometricOcclusion';

const HALF_WIDTH = 18;
const BODY_HEIGHT = 44;
const FADED_ALPHA = 0.35;

/** Convex polygon vs upright body rectangle, using separating axes.
 * The x/y axes are checked by a bounding-box test first.
 */
function overlapsBody(face: readonly Point[], foot: Point): boolean {
  if (face.length < 3) return false;
  const left = foot.x - HALF_WIDTH, right = foot.x + HALF_WIDTH;
  const top = foot.y - BODY_HEIGHT, bottom = foot.y;
  if (face.every(p => p.x < left) || face.every(p => p.x > right)
    || face.every(p => p.y < top) || face.every(p => p.y > bottom)) return false;
  const cx = foot.x, cy = foot.y - BODY_HEIGHT / 2;
  for (let i = 0; i < face.length; i++) {
    const a = face[i]!, b = face[(i + 1) % face.length]!;
    const nx = a.y - b.y, ny = b.x - a.x;
    const mid = cx * nx + cy * ny;
    const extent = HALF_WIDTH * Math.abs(nx) + BODY_HEIGHT / 2 * Math.abs(ny);
    let min = Infinity, max = -Infinity;
    for (const p of face) {
      const dot = p.x * nx + p.y * ny;
      min = Math.min(min, dot); max = Math.max(max, dot);
    }
    if (max < mid - extent || min > mid + extent) return false;
  }
  return true;
}

/** Returns opacity in wall order and exactly the opaque subset for pointer picking.
 * Transparent walls still exist in the simulation's independent collision data.
 */
export function heroCutaway(hero: Readonly<Point>, origin: Readonly<Point>,
  occluders: readonly IsometricOccluder[]): { alphas: number[]; opaque: IsometricOccluder[] } {
  const foot = projectIsometric(hero, 0, origin);
  const heroDepth = isometricDepth(hero) + 0.5;
  const alphas: number[] = [], opaque: IsometricOccluder[] = [];
  for (const wall of occluders) {
    const faded = wall.depth > heroDepth && wall.faces.some(face => overlapsBody(face, foot));
    alphas.push(faded ? FADED_ALPHA : 1);
    if (!faded) opaque.push(wall);
  }
  return { alphas, opaque };
}
