import { describe, it, expect } from 'vitest';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { MANDATORY_FEATURE_IDS } from '../../src/game/world/wildernessFeatures';
import { CAMP, CRYPT_GATE } from '../../src/game/world/generator';
import { ACTOR_RADIUS, canOccupy, findPath } from '../../src/game/world/navigation';

describe('Wave E integrated wilderness pipeline', () => {
  it.each([0, 1, 2, 42, 0xffffffff])('keeps every story destination reachable for seed %s', seed => {
    const world = buildWilderness(seed);
    expect(world.layout.seed).toBe(seed);
    expect(world.layout.camp).toEqual(CAMP);
    expect(world.features.filter(feature => feature.mandatory).map(feature => feature.id))
      .toEqual(MANDATORY_FEATURE_IDS);
    expect(world.features.find(feature => feature.id === 'act1.crypt_entrance')?.position)
      .toEqual(CRYPT_GATE);
    for (const feature of world.features.filter(feature => feature.mandatory)) {
      expect(canOccupy(feature.position, ACTOR_RADIUS, world.layout.obstacles)).toBe(true);
      expect(findPath(CAMP, feature.position, ACTOR_RADIUS, world.layout.obstacles).length)
        .toBeGreaterThan(0);
    }
  });
  it('is deterministic but produces varied terrain without mutating shared data', () => {
    expect(buildWilderness(42)).toEqual(buildWilderness(42));
    expect(buildWilderness(42).terrain.tiles).not.toEqual(buildWilderness(43).terrain.tiles);
    const altered = buildWilderness(42);
    altered.layout.obstacles[0]!.width = 1;
    expect(buildWilderness(42).layout.obstacles[0]!.width).not.toBe(1);
  });
  it('rejects unsupported seeds without creating an unsafe world', () => {
    for (const seed of [-1, NaN, Infinity, 1.2, 0x100000000]) {
      expect(() => buildWilderness(seed)).toThrow(RangeError);
    }
  });
});
