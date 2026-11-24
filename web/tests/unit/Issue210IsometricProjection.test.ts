// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  projectIsometric, unprojectIsometric, isometricFootprint,
  isometricBounds, isometricDepth, isometricFacing
} from '../../src/game/phaser/isometricProjection';

describe('Issue #210: isometric presentation contract', () => {
  it('projects a square onto a 2:1 diamond with a configurable origin', () => {
    expect(projectIsometric({ x: 40, y: 0 })).toEqual({ x: 40, y: 20 });
    expect(projectIsometric({ x: 0, y: 40 })).toEqual({ x: -40, y: 20 });
    expect(projectIsometric({ x: 40, y: 40 }, 0, { x: 100, y: 50 }))
      .toEqual({ x: 100, y: 90 });
    expect(isometricFootprint({ x: 0, y: 0, width: 40, height: 40 }))
      .toEqual([{ x: 0, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 40 }, { x: -40, y: 20 }]);
  });

  it('round trips fractional, negative and world-edge coordinates on a known plane', () => {
    const origin = { x: 1400, y: 60 };
    for (const p of [{ x: 0, y: 0 }, { x: 2200, y: 1400 },
      { x: 390.25, y: 470.75 }, { x: -15.5, y: -8.25 }]) {
      for (const elevation of [0, 24, -8]) {
        const screen = projectIsometric(p, elevation, origin);
        expect(unprojectIsometric(screen, elevation, origin).x).toBeCloseTo(p.x, 10);
        expect(unprojectIsometric(screen, elevation, origin).y).toBeCloseTo(p.y, 10);
      }
    }
  });

  it('uses a ground-foot depth key rather than visual height', () => {
    const p = { x: 100, y: 100 };
    expect(projectIsometric(p, 30).y).toBe(projectIsometric(p).y - 30);
    expect(isometricDepth(p)).toBe(200);
    expect(isometricDepth({ x: 101, y: 100 })).toBeGreaterThan(isometricDepth(p));
    expect(isometricDepth({ x: 120, y: 80 })).toBe(isometricDepth(p));
  });

  it('includes the whole projected world and height margins in camera bounds', () => {
    const origin = { x: 1400, y: 80 };
    const bounds = isometricBounds(2200, 1400, 60, 20, origin);
    expect(bounds).toEqual({ x: 0, y: 20, width: 3600, height: 1880 });
    for (const x of [0, 2200]) for (const y of [0, 1400]) for (const z of [-20, 60]) {
      const p = projectIsometric({ x, y }, z, origin);
      expect(p.x).toBeGreaterThanOrEqual(bounds.x);
      expect(p.x).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(p.y).toBeGreaterThanOrEqual(bounds.y);
      expect(p.y).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
  });

  it('classifies all eight screen-space facings after projection', () => {
    expect(isometricFacing({ x: 1, y: -1 })).toBe('e');
    expect(isometricFacing({ x: 1, y: 0 })).toBe('se');
    expect(isometricFacing({ x: 1, y: 1 })).toBe('s');
    expect(isometricFacing({ x: 0, y: 1 })).toBe('sw');
    expect(isometricFacing({ x: -1, y: 1 })).toBe('w');
    expect(isometricFacing({ x: -1, y: 0 })).toBe('nw');
    expect(isometricFacing({ x: -1, y: -1 })).toBe('n');
    expect(isometricFacing({ x: 0, y: -1 })).toBe('ne');
    expect(isometricFacing({ x: 0, y: 0 })).toBeNull();
  });

  it('rejects non-finite and invalid geometry instead of poisoning the camera', () => {
    expect(() => projectIsometric({ x: NaN, y: 0 })).toThrow(RangeError);
    expect(() => unprojectIsometric({ x: 0, y: 0 }, Infinity)).toThrow(RangeError);
    expect(() => projectIsometric({ x: 0, y: 0 }, 0, { x: Infinity, y: 0 })).toThrow(RangeError);
    expect(() => isometricBounds(0, 1)).toThrow(RangeError);
    expect(() => isometricBounds(1, 1, -1)).toThrow(RangeError);
    expect(() => isometricFootprint({ x: 0, y: 0, width: -1, height: 1 })).toThrow(RangeError);
    expect(() => isometricFacing({ x: Infinity, y: 0 })).toThrow(RangeError);
    expect(() => projectIsometric({ x: Number.MAX_VALUE, y: -Number.MAX_VALUE })).toThrow(RangeError);
  });
});
