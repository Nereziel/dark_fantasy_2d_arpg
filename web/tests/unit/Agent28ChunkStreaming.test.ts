// GPL-3.0-only — Wave F / Agent 28.
import { beforeAll, describe, expect, it } from 'vitest';
import { buildWilderness, type WildernessRuntimeWorld } from '../../src/game/world/wildernessRuntime';
import { MANDATORY_FEATURE_IDS } from '../../src/game/world/wildernessFeatures';
import { CAMP } from '../../src/game/world/generator';
import {
  CHUNK_SIZE, chunkId, chunkBounds, chunkForPoint, chunkSeed, createChunkIndex,
  validateChunkIndex, planVisibleChunks, createWorldFactLedger, makeWorldFact,
  applyWorldFact, validateWorldFactLedger, type ChunkId, type ChunkIndex,
  type WorldFactKind
} from '../../src/game/world/chunkStreaming';

let world: WildernessRuntimeWorld;
let index: ChunkIndex;
beforeAll(() => { world = buildWilderness(42); index = createChunkIndex(world); });

describe('Agent28 — geometry and deterministic seeds', () => {
  it('is a half-open 400px grid with partial last row/column', () => {
    expect(CHUNK_SIZE).toBe(400);
    expect(index.chunks).toHaveLength(24);
    expect(new Set(index.chunks.map(chunk => chunk.id)).size).toBe(24);
    expect(chunkId({ cx: 0, cy: 0 })).toBe('wilderness/0/0');
    expect(chunkBounds({ cx: 5, cy: 3 })).toEqual({
      minX: 2000, minY: 1200, maxX: 2200, maxY: 1400
    });
    expect(chunkForPoint({ x: 400, y: 400 })).toEqual({ cx: 1, cy: 1 });
    expect(chunkForPoint({ x: 2199.9, y: 1399.9 })).toEqual({ cx: 5, cy: 3 });
    for (const point of [{ x: -1, y: 0 }, { x: 2200, y: 0 }, { x: 0, y: 1400 },
      { x: Infinity, y: 0 }, { x: NaN, y: 1 }, null]) {
      expect(chunkForPoint(point)).toBeNull();
    }
    for (const coord of [{ cx: -1, cy: 0 }, { cx: 0, cy: 4 },
      { cx: 1.2, cy: 0 }, { cx: NaN, cy: 0 }]) {
      expect(() => chunkId(coord)).toThrow();
    }
  });

  it('returns stable domain-separated uint32 seeds for the prescribed matrix', () => {
    const seeds = [0, 1, 2, 42, 0xffffffff];
    const cells = ['wilderness/0/0', 'wilderness/2/1', 'wilderness/5/3'];
    const matrix = seeds.flatMap(seed => cells.map(id => chunkSeed(seed, id)));
    expect(new Set(matrix).size).toBe(matrix.length);
    expect(matrix.every(n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff)).toBe(true);
    expect(seeds.flatMap(seed => cells.map(id => chunkSeed(seed, id)))).toEqual(matrix);
    expect(JSON.parse(JSON.stringify(matrix))).toEqual(matrix);
    for (const seed of [-1, 1.5, NaN, Infinity, 0x100000000, '42']) {
      expect(() => chunkSeed(seed, cells[0])).toThrow();
    }
    for (const id of ['wilderness/01/0', 'wilderness/6/0', 'wilderness/-1/0',
      'crypt/0/0', '__proto__', 'wilderness/1/4']) {
      expect(() => chunkSeed(42, id)).toThrow();
    }
  });
});

describe('Agent28 — immutable spatial manifest', () => {
  it('indexes all world tiles exactly once without editing source and serializes cleanly', () => {
    const before = JSON.stringify(world);
    const result = createChunkIndex(world);
    expect(JSON.stringify(world)).toBe(before);
    expect(result.width).toBe(2200);
    expect(result.height).toBe(1400);
    expect(validateChunkIndex(result)).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    const tiles = result.chunks.flatMap(chunk => chunk.tiles);
    expect(tiles).toHaveLength(world.terrain.tiles.length);
    expect(new Set(tiles.map(t => t.x + '/' + t.y)).size).toBe(tiles.length);
    for (const chunk of result.chunks) {
      expect(chunk.seed).toBe(chunkSeed(42, chunk.id));
      for (const tile of chunk.tiles) {
        expect(chunkId(chunkForPoint({ x: tile.x, y: tile.y })!)).toBe(chunk.id);
        expect(tile.x + tile.width).toBeLessThanOrEqual(chunk.bounds.maxX);
        expect(tile.y + tile.height).toBeLessThanOrEqual(chunk.bounds.maxY);
      }
    }
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(tiles[0])).toBe(true);
  });

  it('keeps camp, services, crypt, encounters, all story and optional features', () => {
    const anchors = index.chunks.flatMap(chunk => chunk.anchors.map(a => a.id));
    for (const id of ['camp', 'crypt_gate', 'warden_vesna', 'field-chest', 'waypoint_camp']) {
      expect(anchors).toContain(id);
    }
    for (const feature of world.features) {
      expect(index.chunks.some(chunk => chunk.featureIds.includes(feature.id))).toBe(true);
    }
    for (const id of MANDATORY_FEATURE_IDS) {
      expect(index.chunks.some(chunk => chunk.featureIds.includes(id))).toBe(true);
    }
    expect(new Set(index.chunks.flatMap(chunk => chunk.encounters.map(e => e.id))).size).toBe(3);
  });

  it('preserves cross-boundary obstacles, road segments and POI footprint', () => {
    const walls = index.chunks.filter(c => c.obstacles.some(o => o.id === 'north-barricade'));
    expect(walls.map(c => c.coord.cx)).toContain(0);
    expect(walls.map(c => c.coord.cx)).toContain(1);
    const roads = index.chunks.flatMap(c => c.roads.map(r => r.roadId + '/' + r.segmentIndex));
    expect(roads.length).toBeGreaterThan(new Set(roads).size);
    for (const chunk of index.chunks) {
      expect(new Set(chunk.roads.map(r => r.roadId + '/' + r.segmentIndex)).size).toBe(chunk.roads.length);
      expect(new Set(chunk.featureIds).size).toBe(chunk.featureIds.length);
    }
    const feature = world.features.find(f => !f.mandatory)!;
    const changed: WildernessRuntimeWorld = { ...world, features: world.features.map(f =>
      f.id === feature.id ? { ...f, position: { x: 400, y: 600 }, radius: 35 } : f) };
    const onBorder = createChunkIndex(changed);
    expect(onBorder.chunks.filter(c => c.featureIds.includes(feature.id))
      .map(c => c.coord.cx).sort()).toEqual([0, 1]);
  });

  it('rejects bad layout, duplicate IDs, invalid seeds and incomplete tile coverage', () => {
    expect(() => createChunkIndex(null as never)).toThrow();
    for (const seed of [-1, NaN, Infinity, 1.5, 0x100000000]) {
      expect(() => createChunkIndex({ ...world, layout: { ...world.layout, seed } })).toThrow();
    }
    expect(() => createChunkIndex({ ...world, terrain: { ...world.terrain,
      tiles: world.terrain.tiles.slice(1) } })).toThrow();
    expect(() => createChunkIndex({ ...world, terrain: { ...world.terrain,
      layout: { ...world.terrain.layout, seed: 99 } } })).toThrow();
    expect(() => createChunkIndex({ ...world, features: [...world.features, world.features[0]!] })).toThrow();
    expect(() => createChunkIndex({ ...world, layout: { ...world.layout,
      obstacles: [...world.layout.obstacles, world.layout.obstacles[0]!] } })).toThrow();
    expect(() => createChunkIndex({ ...world, features: Array(10000).fill(world.features[0]) })).toThrow();
    expect(validateChunkIndex({ ...index, seed: -1 })).toBe(false);
  });
});

describe('Agent28 — budgeted pure load/unload planning', () => {
  it('loads the current chunk first, then distance/cx/cy tie-break within budget', () => {
    const result = planVisibleChunks(index, CAMP, [], { loadBudget: 2, unloadBudget: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.load).toEqual(['wilderness/0/1', 'wilderness/0/0']);
    expect(result.unload).toEqual([]);
    expect(result.nextActive).toEqual(result.load);
    expect(Object.isFrozen(result)).toBe(true);
  });
  it('converges with no re-loads or duplicates and retains hysteresis at boundaries', () => {
    let active: readonly ChunkId[] = [];
    for (let n = 0; n < 15; n++) {
      const result = planVisibleChunks(index, CAMP, active, { loadBudget: 2, unloadBudget: 2 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.load.length).toBeLessThanOrEqual(2);
      expect(result.unload.length).toBeLessThanOrEqual(2);
      expect(new Set(result.nextActive).size).toBe(result.nextActive.length);
      active = result.nextActive;
    }
    const repeat = planVisibleChunks(index, CAMP, active);
    expect(repeat.ok && repeat.load).toEqual([]);
    expect(repeat.ok && repeat.unload).toEqual([]);
    const crossing = planVisibleChunks(index, { x: 400, y: 470 }, active);
    expect(crossing.ok && crossing.nextActive.includes('wilderness/1/1')).toBe(true);
    expect(crossing.ok && crossing.unload.includes('wilderness/1/1')).toBe(false);
    const far = planVisibleChunks(index, CAMP, ['wilderness/0/1', 'wilderness/4/3'], {
      loadBudget: 1, unloadBudget: 1
    });
    expect(far.ok && far.unload).toEqual(['wilderness/4/3']);
    const near = planVisibleChunks(index, CAMP, ['wilderness/2/1'], { unloadBudget: 1 });
    expect(near.ok && near.unload).toEqual([]);
  });
  it('fails safely for stale/duplicate active IDs and invalid budget, handles reset and zone exit', () => {
    for (const point of [null, { x: -1, y: 0 }, { x: 2200, y: 0 }, { x: NaN, y: 0 }]) {
      expect(planVisibleChunks(index, point, []).ok).toBe(false);
    }
    for (const active of [['wilderness/0/0', 'wilderness/0/0'], ['wilderness/50/0'], ['__proto__']]) {
      expect(planVisibleChunks(index, CAMP, active).ok).toBe(false);
    }
    for (const opts of [{ loadBudget: -1 }, { loadBudget: 0 },
      { unloadBudget: 1.5 }, { loadRadius: Infinity }, { loadRadius: 3, unloadRadius: 2 }]) {
      expect(planVisibleChunks(index, CAMP, [], opts).ok).toBe(false);
    }
    const zone = planVisibleChunks(index, null, ['wilderness/0/0', 'wilderness/5/3'], {
      zone: 'crypt', unloadBudget: 1
    });
    expect(zone.ok && zone.load).toEqual([]);
    expect(zone.ok && zone.unload).toEqual(['wilderness/0/0']);
    const reset = planVisibleChunks(index, null, ['wilderness/0/0'], { reset: true });
    expect(reset.ok && reset.nextActive).toEqual([]);
  });
});

describe('Agent28 — idempotent per-instance fact ledger', () => {
  const cases: readonly [WorldFactKind, string][] = [
    ['chestOpened', 'field-chest'],
    ['eventCompleted', 'wild.event.1'],
    ['uniqueEnemyDefeated', 'act1.grave_warden'],
    ['landmarkDiscovered', 'act1.abandoned_graveyard'],
    ['waypointActivated', 'waypoint_camp']
  ];
  it('applies every event exactly once; replay and unload/reload leave state intact', () => {
    let state = createWorldFactLedger(index, 'session-one');
    for (const [kind, entityId] of cases) {
      const fact = makeWorldFact(index, state.worldInstanceId, kind, entityId);
      const previous = state;
      const result = applyWorldFact(index, state, fact);
      expect(result.changed).toBe(true);
      state = result.state;
      expect(state.entries.length).toBe(previous.entries.length + 1);
      const replay = applyWorldFact(index, state, fact);
      expect(replay.changed).toBe(false);
      expect(replay.state).toBe(state);
      expect(planVisibleChunks(index, CAMP, [], { loadBudget: 1 }).ok).toBe(true);
    }
    expect(state.entries).toHaveLength(5);
    expect(validateWorldFactLedger(index, JSON.parse(JSON.stringify(state)))).toBe(true);
    expect(Object.isFrozen(state.entries[0])).toBe(true);
  });
  it('rejects spoofed IDs, foreign namespaces, bad kinds and corrupted or oversized states', () => {
    const a = createWorldFactLedger(index, 'session-a');
    const b = createWorldFactLedger(index, 'session-b');
    const fact = makeWorldFact(index, a.worldInstanceId, 'chestOpened', 'field-chest');
    expect(() => applyWorldFact(index, b, fact)).toThrow();
    const first = applyWorldFact(index, a, fact).state;
    expect(() => applyWorldFact(index, first, { ...fact, chunkId: 'wilderness/5/3' })).toThrow();
    expect(() => applyWorldFact(index, first, { ...fact, id: 'forged' })).toThrow();
    expect(() => makeWorldFact(index, a.worldInstanceId, 'chestOpened', 'nonexistent')).toThrow();
    expect(() => makeWorldFact(index, a.worldInstanceId, 'uniqueEnemyDefeated', 'field-chest')).toThrow();
    expect(validateWorldFactLedger(index, { ...first, entries: [fact, fact] })).toBe(false);
    expect(validateWorldFactLedger(index, { ...first, entries: Array(10001).fill(fact) })).toBe(false);
    expect(validateWorldFactLedger(index, { ...first, worldSeed: 777 })).toBe(false);
    expect(() => createWorldFactLedger(index, '../escape')).toThrow();
    expect(() => createWorldFactLedger(index, 'a'.repeat(1000))).toThrow();
  });
});
