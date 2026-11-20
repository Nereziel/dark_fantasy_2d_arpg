import { describe, expect, it } from 'vitest';
import { buildHollowKingRuntime } from '../../src/game/bosses/hollowKingRuntime';
import {
  createHollowKingState, projectHollowKingBossBar, stepHollowKing
} from '../../src/game/bosses/hollowKingPhases';
import { buildCryptWorld } from '../../src/game/world/dungeonRuntime';
import { CRYPT_EXIT } from '../../src/game/world/generator';

describe('Wave G Hollow King runtime arena integration', () => {
  it.each([0, 1, 2, 42, 8712, 0xffffffff])('derives valid safe, seed-specific arena (%s)', seed => {
    const a = buildHollowKingRuntime(seed, 470);
    const b = buildHollowKingRuntime(seed, 470);
    expect(a).toEqual(b);
    expect(a.arena.exitPosition).toEqual(CRYPT_EXIT);
    expect(a.arena.bossSpawn).toEqual(buildCryptWorld(seed).dungeon.bossSpawn);
    expect(a.initial.actorId).toBe('crypt_lord-4');
    expect(a.initial.encounterId).toBe(`crypt/${seed}/hollow-king`);
    expect(projectHollowKingBossBar(a.initial).phase).toBe(1);
    const target = { x: 1560, y: 745 };
    const result = stepHollowKing(a.initial, {
      expectedRevision: 0, deltaSeconds: 1/60,
      currentHealth: 470, target, actorId: 'crypt_lord-4'
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bossUi.exitLocked).toBe(false);
      expect(result.state.revision).toBe(1);
      expect(result.actions.every(action => action.type !== 'death')).toBe(true);
    }
  });

  it('keeps existing boss/exit reachable and rejects impossible health', () => {
    const runtime = buildHollowKingRuntime(42, 500);
    expect(() => createHollowKingState(runtime.initial.encounterId, 42, runtime.arena, -1))
      .toThrow(RangeError);
    const updated = stepHollowKing(runtime.initial, {
      expectedRevision: 0, deltaSeconds: 1/60, currentHealth: 170,
      target: { x: 1560, y: 745 }
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.state.phase).toBe(3);
      expect(updated.actions.filter(action => action.type === 'phaseChanged')).toHaveLength(1);
    }
  });
});
