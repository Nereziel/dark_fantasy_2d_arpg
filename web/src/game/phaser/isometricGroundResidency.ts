// GPL-3.0-only — presentation-only camera and texture residency policy.
import type { Point } from '../core/types';
import type { IsometricRect } from './isometricProjection';

export const GROUND_PREFETCH_MARGIN = 96;
export const GROUND_RETENTION_MARGIN = 224;

type GroundExtent = { readonly id: string; readonly projected: Readonly<IsometricRect> };

function validate(view: Readonly<IsometricRect>): void {
  if (![view.x, view.y, view.width, view.height].every(Number.isFinite)
    || view.width <= 0 || view.height <= 0) throw new RangeError('Invalid ground viewport');
}

/** Fixed-zoom camera follows the projected hero with interpolation.
 * Conservatively cover current and destination views, including the entire
 * corridor between them: no holes on a large same-zone teleport or resize.
 */
export function groundCameraEnvelope(view: Readonly<IsometricRect>, follow: Readonly<Point>): IsometricRect {
  validate(view);
  if (!Number.isFinite(follow.x) || !Number.isFinite(follow.y)) throw new RangeError('Invalid follow point');
  const left = Math.min(view.x, follow.x - view.width / 2);
  const top = Math.min(view.y, follow.y - view.height / 2);
  const right = Math.max(view.x + view.width, follow.x + view.width / 2);
  const bottom = Math.max(view.y + view.height, follow.y + view.height / 2);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function near(chunk: Readonly<IsometricRect>, view: Readonly<IsometricRect>, margin: number): boolean {
  return chunk.x <= view.x + view.width + margin && chunk.x + chunk.width >= view.x - margin
    && chunk.y <= view.y + view.height + margin && chunk.y + chunk.height >= view.y - margin;
}

/** Pure deterministic delta. Retain a wider band than the prefetch band.
 * No discovery mask, simulation lifetime or navigation dependencies.
 */
export function planGroundResidency<T extends GroundExtent>(chunks: readonly T[], resident: ReadonlySet<string>,
  view: Readonly<IsometricRect>): { load: T[]; unload: string[] } {
  validate(view);
  const load: T[] = [];
  const keep = new Set<string>();
  for (const chunk of chunks) {
    if (resident.has(chunk.id)) {
      if (near(chunk.projected, view, GROUND_RETENTION_MARGIN)) keep.add(chunk.id);
    } else if (near(chunk.projected, view, GROUND_PREFETCH_MARGIN)) load.push(chunk);
  }
  return { load, unload: [...resident].filter(id => !keep.has(id)) };
}
