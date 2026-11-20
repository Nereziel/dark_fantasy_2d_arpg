import { describe, expect, it } from 'vitest';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import {
  chunkForPoint, chunkId, createChunkIndex, planVisibleChunks, validateChunkIndex
} from '../../src/game/world/chunkStreaming';
import { CAMP } from '../../src/game/world/generator';

describe('Wave F streamed wilderness runtime contract', () => {
  it.each([0, 1, 42, 0xffffffff])('keeps seeded chunk data valid and deterministic (%s)', seed => {
    const original = buildWilderness(seed);
    const a = createChunkIndex(original);
    const b = createChunkIndex(buildWilderness(seed));
    expect(validateChunkIndex(a)).toBe(true);
    expect(a).toEqual(b);
    expect(a.chunks).toHaveLength(24);
    expect(a.chunks.every(chunk => chunk.bounds.maxX <= 2200
      && chunk.bounds.maxY <= 1400)).toBe(true);
  });

  it('loads only nearby chunks, unloads distant chunks and always preserves the hero chunk', () => {
    const index = createChunkIndex(buildWilderness(42));
    let active: readonly string[] = [];
    for (let n = 0; n < 4; n++) {
      const plan = planVisibleChunks(index, CAMP, active, { loadBudget: 3, unloadBudget: 3 });
      expect(plan.ok).toBe(true);
      if (!plan.ok) break;
      expect(plan.load.length).toBeLessThanOrEqual(3);
      active = plan.nextActive;
    }
    const townChunk = chunkId(chunkForPoint(CAMP));
    expect(active).toContain(townChunk);
    const far = { x: 1900, y: 1200 };
    for (let n = 0; n < 8; n++) {
      const plan = planVisibleChunks(index, far, active, { loadBudget: 3, unloadBudget: 3 });
      expect(plan.ok).toBe(true);
      if (!plan.ok) break;
      active = plan.nextActive;
    }
    expect(active).toContain(chunkId(chunkForPoint(far)));
    expect(active).not.toContain(townChunk);
    expect(active.length).toBeLessThan(index.chunks.length);
    const exit = planVisibleChunks(index, far, active, {
      zone: 'crypt', unloadBudget: index.chunks.length
    });
    expect(exit.ok).toBe(true);
    if (exit.ok) expect(exit.nextActive).toHaveLength(0);
  });
});
