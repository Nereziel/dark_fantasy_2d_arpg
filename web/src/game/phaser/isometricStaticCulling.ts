// GPL-3.0-only — presentation-only; never changes collision or picking.
import type { Point } from '../core/types';
import type { IsometricRect } from './isometricProjection';

export const STATIC_PAINT_MARGIN = 96;

/** All painted vertices, including non-opaque decorations and roof/crown
 * elevation. Null means unknown: keep the layer visible rather than clip it.
 */
export function staticPaintBounds(paint: readonly { readonly points: readonly Readonly<Point>[] }[]): IsometricRect | null {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const layer of paint) for (const p of layer.points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    left = Math.min(left, p.x);
    top = Math.min(top, p.y);
    right = Math.max(right, p.x);
    bottom = Math.max(bottom, p.y);
  }
  if (!Number.isFinite(left) || !Number.isFinite(top)
    || !Number.isFinite(right - left) || !Number.isFinite(bottom - top)) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Inclusive AABB intersection with the conservative camera envelope.
 * Invalid inputs fail open. Visibility is unrelated to hero cutaway alpha.
 */
export function staticPaintVisible(bounds: Readonly<IsometricRect> | null,
  view: Readonly<IsometricRect>, margin = STATIC_PAINT_MARGIN): boolean {
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height,
    view.x, view.y, view.width, view.height, margin].every(Number.isFinite)
    || bounds.width < 0 || bounds.height < 0 || view.width <= 0 || view.height <= 0
    || margin < 0) return true;
  return bounds.x <= view.x + view.width + margin
    && bounds.x + bounds.width >= view.x - margin
    && bounds.y <= view.y + view.height + margin
    && bounds.y + bounds.height >= view.y - margin;
}
