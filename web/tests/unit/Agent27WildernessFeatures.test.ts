import { describe, expect, it } from 'vitest';
import type { WorldLayout } from '../../src/game/world/generator';
import { CAMP, CAMP_RADIUS, CRYPT_GATE, generateWorld } from '../../src/game/world/generator';
import { ACTOR_RADIUS, canOccupy, findPath, WORLD_HEIGHT, WORLD_WIDTH } from '../../src/game/world/navigation';
import { WORLD_OBJECTS } from '../../src/game/world/interactables';
import { NPC_POSITIONS } from '../../src/game/world/npcs';
import { MANDATORY_FEATURE_IDS, FEATURE_EVENT_KINDS, planWildernessFeatures, type FeaturePlanResult, type WildernessFeature } from '../../src/game/world/wildernessFeatures';

const SEEDS = [0, 1, 2, 42, 4294967295] as const;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
function success(result: FeaturePlanResult): readonly WildernessFeature[] {
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.features;
}
function fail(result: FeaturePlanResult, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

describe('Agent 27 — deterministic wilderness features', () => {
  it.each(SEEDS)('places unique, accessible and separated features for seed %i', seed => {
    const layout = generateWorld(seed);
    const features = success(planWildernessFeatures(seed, layout));
    expect(features.filter(f => f.mandatory).map(f => f.id)).toEqual([...MANDATORY_FEATURE_IDS]);
    expect(features.find(f => f.id === 'act1.crypt_entrance')?.position).toEqual(CRYPT_GATE);
    expect(features.find(f => f.id === 'act1.grave_warden')?.kind).toBe('miniBoss');
    expect(features.find(f => f.id === 'act1.corrupted_forest')?.kind).toBe('forest');
    expect(features.find(f => f.id === 'act1.tainted_beasts')?.kind).toBe('encounterZone');
    expect(new Set(features.map(f => f.id)).size).toBe(features.length);
    for (const feature of features) {
      expect(Number.isFinite(feature.position.x) && Number.isFinite(feature.position.y)).toBe(true);
      expect(feature.position.x).toBeGreaterThanOrEqual(ACTOR_RADIUS);
      expect(feature.position.x).toBeLessThanOrEqual(WORLD_WIDTH - ACTOR_RADIUS);
      expect(canOccupy(feature.position, ACTOR_RADIUS, layout.obstacles)).toBe(true);
      expect(findPath(layout.camp, feature.position, ACTOR_RADIUS, layout.obstacles).length).toBeGreaterThan(0);
      expect(distance(layout.camp, feature.position)).toBeGreaterThan(CAMP_RADIUS + feature.radius + 12);
      for (const object of WORLD_OBJECTS) {
        expect(distance(object.position, feature.position)).toBeGreaterThanOrEqual(object.hitRadius + feature.radius + 12);
        expect(feature.id).not.toBe(object.id);
      }
      for (const npc of Object.values(NPC_POSITIONS)) expect(distance(npc, feature.position)).toBeGreaterThan(feature.radius + 75);
    }
    for (let i = 0; i < features.length; i++) {
      for (let j = i + 1; j < features.length; j++) {
        expect(distance(features[i]!.position, features[j]!.position)).toBeGreaterThanOrEqual(
          features[i]!.radius + features[j]!.radius + 12
        );
      }
    }
  });

  it('is JSON-serializable and does not mutate frozen input or existing spawns', () => {
    const layout = generateWorld(42);
    const frozen = Object.freeze({
      ...layout,
      camp: Object.freeze({ ...layout.camp }),
      obstacles: Object.freeze(layout.obstacles.map(w => Object.freeze({ ...w }))),
      encounterPositions: Object.freeze(layout.encounterPositions.map(p => Object.freeze({ ...p })))
    }) as unknown as Readonly<WorldLayout>;
    const before = JSON.stringify(frozen);
    const result = planWildernessFeatures(42, frozen);
    expect(result).toEqual(planWildernessFeatures(42, frozen));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.stringify(frozen)).toBe(before);
    expect(frozen.camp).toEqual(CAMP);
    success(result).forEach(f => expect(f.presentationKey.startsWith('world.')).toBe(true));
  });

  it('uses stable mandatory IDs/event mappings while optional content changes with seeds', () => {
    expect(FEATURE_EVENT_KINDS).toEqual({
      'act1.corruption_site': 'corruption_discovered',
      'act1.corrupted_forest': 'forest_discovered',
      'act1.abandoned_graveyard': 'graveyard_discovered',
      'act1.evidence_lead': 'evidence_recovered',
      'act1.grave_warden': 'mini_boss_defeated',
      'act1.tainted_beasts': 'tainted_beast_defeated',
      'act1.crypt_entrance': 'crypt_entered'
    });
    const variants = [0, 1, 42].map(seed => success(planWildernessFeatures(seed, generateWorld(seed))));
    for (const features of variants) {
      expect(features.filter(f => f.mandatory).map(f => f.id)).toEqual([...MANDATORY_FEATURE_IDS]);
      for (const mandatory of features.filter(f => f.mandatory)) {
        expect(mandatory.eventKind).toBe(FEATURE_EVENT_KINDS[mandatory.id as keyof typeof FEATURE_EVENT_KINDS]);
      }
      expect(features.some(f => f.kind === 'poi')).toBe(true);
      expect(features.some(f => f.kind === 'treasure')).toBe(true);
      expect(features.some(f => f.kind === 'event')).toBe(true);
    }
    expect(new Set(variants.map(fs => JSON.stringify(fs.filter(f => !f.mandatory)))).size).toBeGreaterThan(1);
  });

  it('rejects invalid uint32 seeds and mismatched layout seed', () => {
    for (const seed of [NaN, Infinity, -Infinity, -1, 0.5, 4294967296, Number.MAX_SAFE_INTEGER]) {
      fail(planWildernessFeatures(seed, generateWorld(0)), 'INVALID_SEED');
    }
    fail(planWildernessFeatures(1, generateWorld(0)), 'INVALID_LAYOUT');
  });

  it('rejects invalid geometry, duplicate IDs, bad NPC/spawn, invalid encounters and missing layout', () => {
    const base = generateWorld(0);
    const invalid: unknown[] = [
      null, undefined, {}, { ...base, seed: Infinity },
      { ...base, camp: { x: 450, y: 470 } }, { ...base, camp: { x: NaN, y: 470 } },
      { ...base, obstacles: null }, { ...base, encounterPositions: null },
      { ...base, obstacles: [...base.obstacles, { ...base.obstacles[0] }] },
      { ...base, obstacles: [...base.obstacles, { id: 'negative', x: 20, y: 20, width: -2, height: 10 }] },
      { ...base, obstacles: [...base.obstacles, { id: 'outside', x: WORLD_WIDTH - 10, y: 20, width: 50, height: 10 }] },
      { ...base, obstacles: [...base.obstacles, { id: 'bad-npc', x: 430, y: 400, width: 40, height: 40 }] },
      { ...base, obstacles: [...base.obstacles, { id: 'blocked-gate', x: CRYPT_GATE.x - 20, y: CRYPT_GATE.y - 20, width: 40, height: 40 }] },
      { ...base, encounterPositions: [{ x: NaN, y: 500 }] },
      { ...base, encounterPositions: [{ x: -2, y: 100 }] },
      { ...base, encounterPositions: [base.encounterPositions[0], base.encounterPositions[0]] }
    ];
    for (const data of invalid) fail(planWildernessFeatures(0, data as WorldLayout), 'INVALID_LAYOUT');
  });

  it('fails explicitly if the crypt entrance is walkable but cut off by a sealed wall', () => {
    const base = generateWorld(0);
    const layout: WorldLayout = {
      ...base, obstacles: [...base.obstacles, { id: 'sealed', x: 650, y: 0, width: 20, height: WORLD_HEIGHT }]
    };
    const result = planWildernessFeatures(0, layout);
    fail(result, 'UNREACHABLE_MANDATORY');
    if (!result.ok) expect(result.error.featureId).toBe('act1.crypt_entrance');
  });

  it('treats corrupted frozen layout as an error without throwing or changing it', () => {
    const base = generateWorld(0);
    const corrupted = Object.freeze({
      ...base,
      obstacles: Object.freeze([...base.obstacles, Object.freeze({ id: 'broken', x: Infinity, y: 10, width: 10, height: 10 })])
    }) as unknown as WorldLayout;
    const before = JSON.stringify(corrupted);
    expect(() => planWildernessFeatures(0, corrupted)).not.toThrow();
    fail(planWildernessFeatures(0, corrupted), 'INVALID_LAYOUT');
    expect(JSON.stringify(corrupted)).toBe(before);
  });
});
