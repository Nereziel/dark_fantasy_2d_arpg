// GPL-3.0-only — presentation only; simulation coordinates remain Cartesian.
import type { Point } from '../core/types';

export interface IsometricRect extends Point {
  readonly width: number;
  readonly height: number;
}

export type IsometricFacing = 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'n' | 'ne';

const ZERO: Readonly<Point> = Object.freeze({ x: 0, y: 0 });
const FACINGS: readonly IsometricFacing[] = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];

function finite(value: number): void {
  if (!Number.isFinite(value)) throw new RangeError('Non-finite isometric coordinate');
}

function finitePoint(point: Readonly<Point>): void {
  finite(point.x);
  finite(point.y);
}

function result(x: number, y: number): Point {
  finite(x);
  finite(y);
  return { x, y };
}

function positive(value: number): void {
  finite(value);
  if (value <= 0) throw new RangeError('Isometric dimensions must be positive');
}

/** One world square projects to a diamond twice as wide as it is tall.
 * Elevation is a visual screen-space offset, not collision or terrain height.
 * The origin is in projected scene units, never camera/screen pixels.
 */
export function projectIsometric(world: Readonly<Point>, elevation = 0,
  origin: Readonly<Point> = ZERO): Point {
  finitePoint(world);
  finitePoint(origin);
  finite(elevation);
  return result(origin.x + (world.x - world.y),
    origin.y + (world.x / 2 + world.y / 2) - elevation);
}

/** Inverse on a known elevation plane. Call after camera.getWorldPoint;
 * this does not resolve occlusion or pick an elevated walkable surface.
 */
export function unprojectIsometric(projected: Readonly<Point>, elevation = 0,
  origin: Readonly<Point> = ZERO): Point {
  finitePoint(projected);
  finitePoint(origin);
  finite(elevation);
  const x = projected.x - origin.x;
  const y = projected.y - origin.y + elevation;
  return result(y + x / 2, y - x / 2);
}

/** Ordered ground footprint: north, east, south, west projected corners. */
export function isometricFootprint(rect: Readonly<IsometricRect>, elevation = 0,
  origin: Readonly<Point> = ZERO): readonly Point[] {
  positive(rect.width);
  positive(rect.height);
  const { x, y, width, height } = rect;
  return [
    projectIsometric({ x, y }, elevation, origin),
    projectIsometric({ x: x + width, y }, elevation, origin),
    projectIsometric({ x: x + width, y: y + height }, elevation, origin),
    projectIsometric({ x, y: y + height }, elevation, origin)
  ];
}

/** Bounds for projected world geometry and optional vertical art margins.
 * Camera zoom, viewport and additional horizontal sprite padding are caller-owned.
 */
export function isometricBounds(width: number, height: number,
  above = 0, below = 0, origin: Readonly<Point> = ZERO): IsometricRect {
  positive(width);
  positive(height);
  finite(above);
  finite(below);
  if (above < 0 || below < 0) throw new RangeError('Negative isometric margin');
  const corners = isometricFootprint({ x: 0, y: 0, width, height }, 0, origin);
  const minX = Math.min(...corners.map(point => point.x));
  const maxX = Math.max(...corners.map(point => point.x));
  const minY = Math.min(...corners.map(point => point.y)) - above;
  const maxY = Math.max(...corners.map(point => point.y)) + below;
  const position = result(minX, minY);
  const dimensions = result(maxX - minX, maxY - minY);
  positive(dimensions.x);
  positive(dimensions.y);
  return { ...position, width: dimensions.x, height: dimensions.y };
}

/** Painter order on the ground plane; higher values are nearer the camera.
 * Equal keys deliberately tie. A renderer may use a stable entity ID or layer
 * as a secondary key; large footprints need their own occlusion policy.
 */
export function isometricDepth(foot: Readonly<Point>): number {
  finitePoint(foot);
  const depth = foot.x + foot.y;
  finite(depth);
  return depth;
}

/** Eight visual directions based on projected motion, not world-axis labels. */
export function isometricFacing(delta: Readonly<Point>): IsometricFacing | null {
  const projected = projectIsometric(delta);
  if (projected.x === 0 && projected.y === 0) return null;
  const sector = Math.round(Math.atan2(projected.y, projected.x) / (Math.PI / 4));
  return FACINGS[(sector + 8) % 8]!;
}
