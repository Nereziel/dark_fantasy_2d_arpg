// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { staticPaintBounds, staticPaintVisible } from '../../src/game/phaser/isometricStaticCulling';
import { groundCameraEnvelope } from '../../src/game/phaser/isometricGroundResidency';
import { planObstacleArt, type ObstacleMaterial } from '../../src/game/phaser/isometricProps';
import { planBuildingArt } from '../../src/game/phaser/isometricBuildings';

const view = { x: 100, y: 100, width: 200, height: 160 };
const origin = { x: 1400, y: 100 };
const rect = { x: 400, y: 650, width: 80, height: 80 };
const materials: ObstacleMaterial[] = ['forest', 'rock', 'ruin', 'timber', 'crypt', 'mine', 'cave'];

describe('D5.2 static projected paint visibility', () => {
  it('includes decoration and elevated paint, not just opaque or ground faces', () => {
    const paint = [
      { points: [{ x: 120, y: 400 }, { x: 200, y: 400 }, { x: 180, y: 440 }], opaque: true },
      { points: [{ x: 85, y: 120 }, { x: 240, y: 390 }, { x: 250, y: 360 }], opaque: false }
    ];
    expect(staticPaintBounds(paint)).toEqual({ x: 85, y: 120, width: 165, height: 320 });
    expect(staticPaintVisible(staticPaintBounds(paint), view)).toBe(true);
    expect(staticPaintVisible(staticPaintBounds(paint.slice(0, 1)), view)).toBe(false);
  });

  it.each(materials)('bounds every rendered vertex of %s', material => {
    const art = planObstacleArt(rect, material, 42, origin);
    const bounds = staticPaintBounds(art.paint)!;
    expect(bounds).not.toBeNull();
    for (const layer of art.paint) for (const p of layer.points) {
      expect(p.x).toBeGreaterThanOrEqual(bounds.x);
      expect(p.x).toBeLessThanOrEqual(bounds.x + bounds.width + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(bounds.y);
      expect(p.y).toBeLessThanOrEqual(bounds.y + bounds.height + 1e-9);
    }
  });

  it('keeps facade and roof bounds independent, including roof height', () => {
    const building = planBuildingArt(rect, { kind: 'house', entranceSide: 'south', variant: 0 }, origin);
    const facade = staticPaintBounds(building.layers.find(l => l.kind === 'facade')!.paint)!;
    const roof = staticPaintBounds(building.layers.find(l => l.kind === 'roof')!.paint)!;
    expect(roof.y).toBeLessThan(facade.y);
    const roofView = { x: roof.x, y: roof.y, width: roof.width, height: 1 };
    expect(staticPaintVisible(roof, roofView, 0)).toBe(true);
    expect(staticPaintVisible(facade, roofView, 0)).toBe(false);
  });

  it('includes touching edges and the margin; distant layers leave and reenter', () => {
    const bounds = { x: 396, y: 130, width: 10, height: 10 };
    expect(staticPaintVisible(bounds, view)).toBe(true);
    expect(staticPaintVisible({ ...bounds, x: 397 }, view)).toBe(false);
    expect(staticPaintVisible(bounds, { ...view, x: 500 })).toBe(true);
    expect(staticPaintVisible(bounds, { ...view, x: 700 })).toBe(false);
    expect(staticPaintVisible(bounds, view)).toBe(true);
  });

  it('covers interpolated follow, resize and large same-zone jumps', () => {
    const bounds = { x: 900, y: 500, width: 80, height: 60 };
    expect(staticPaintVisible(bounds, view)).toBe(false);
    expect(staticPaintVisible(bounds, groundCameraEnvelope(view, { x: 1000, y: 600 }))).toBe(true);
    expect(staticPaintVisible(bounds, { ...view, width: 1000, height: 600 })).toBe(true);
  });

  it('fails open for absent or invalid geometry and camera data', () => {
    expect(staticPaintBounds([])).toBeNull();
    expect(staticPaintBounds([{ points: [{ x: NaN, y: 0 }] }])).toBeNull();
    expect(staticPaintVisible(null, view)).toBe(true);
    expect(staticPaintVisible({ x: 1000, y: 0, width: 100, height: 100 }, { ...view, width: 0 })).toBe(true);
    expect(staticPaintVisible({ x: Infinity, y: 0, width: 100, height: 100 }, view)).toBe(true);
  });
});
