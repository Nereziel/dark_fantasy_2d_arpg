// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { groundCameraEnvelope, planGroundResidency } from '../../src/game/phaser/isometricGroundResidency';
import { planTerrainChunks } from '../../src/game/phaser/isometricTerrain';

const chunks = planTerrainChunks({ width: 2200, height: 1400, tiles: [], roads: [] }, { x: 1400, y: 100 });
const view = { x: 130, y: 100, width: 800, height: 540 };
const ids = (chunks: readonly { id: string }[]) => chunks.map(c => c.id);

describe('D5.1 camera-driven ground residency', () => {
  it('loads only camera-near chunks from a complete 24-chunk plan, regardless of discovery', () => {
    const result = planGroundResidency(chunks, new Set(), view);
    expect(chunks).toHaveLength(24);
    expect(result.load.length).toBeGreaterThan(0);
    expect(result.load.length).toBeLessThan(chunks.length);
    expect(result.unload).toEqual([]);
    const resident = new Set(ids(result.load));
    expect(planGroundResidency(chunks, resident, view)).toEqual({ load: [], unload: [] });
  });
  it('keeps a hysteresis band to prevent rebaking near an edge and evicts after leaving it', () => {
    const chunk = { id: 'a', projected: { x: 0, y: 0, width: 400, height: 200 } };
    const near = { x: 495, y: 0, width: 100, height: 100 };
    const middle = { ...near, x: 530 };
    const far = { ...near, x: 650 };
    expect(ids(planGroundResidency([chunk], new Set(), near).load)).toEqual(['a']);
    expect(planGroundResidency([chunk], new Set(), middle).load).toEqual([]);
    expect(planGroundResidency([chunk], new Set(['a']), middle).unload).toEqual([]);
    expect(planGroundResidency([chunk], new Set(['a']), far).unload).toEqual(['a']);
    expect(ids(planGroundResidency([chunk], new Set(), near).load)).toEqual(['a']);
  });
  it('covers both the current viewport and all intermediate follow positions during a jump', () => {
    const envelope = groundCameraEnvelope(view, { x: 2300, y: 1200 });
    expect(envelope).toEqual({ x: 130, y: 100, width: 2570, height: 1370 });
    const current = planGroundResidency(chunks, new Set(), envelope);
    expect(current.load.length).toBeGreaterThan(0);
    const next = groundCameraEnvelope({ x: 1900, y: 930, width: 800, height: 540 }, { x: 2300, y: 1200 });
    const changed = planGroundResidency(chunks, new Set(ids(current.load)), next);
    expect(changed.unload.length).toBeGreaterThan(0);
    expect(changed.load).toEqual([]);
  });
  it('covers any intersecting chunk after a resize and includes touching edges', () => {
    const small = { x: 800, y: 300, width: 640, height: 360 };
    const large = { ...small, width: 1280, height: 720 };
    const old = planGroundResidency(chunks, new Set(), small);
    const next = planGroundResidency(chunks, new Set(ids(old.load)), large);
    const now = new Set([...ids(old.load), ...ids(next.load)]);
    for (const chunk of chunks) {
      const p = chunk.projected;
      if (p.x <= large.x + large.width && p.x + p.width >= large.x
        && p.y <= large.y + large.height && p.y + p.height >= large.y) expect(now.has(chunk.id)).toBe(true);
    }
    expect(next.unload).toEqual([]);
  });
  it('rejects invalid viewport data rather than silently evicting visible chunks', () => {
    expect(() => groundCameraEnvelope({ ...view, width: 0 }, { x: 0, y: 0 })).toThrow(RangeError);
    expect(() => planGroundResidency(chunks, new Set(), { ...view, x: NaN })).toThrow(RangeError);
  });
});
