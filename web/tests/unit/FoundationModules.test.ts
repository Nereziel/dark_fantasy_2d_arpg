import { describe, expect, it } from 'vitest';
import { nextMoveSpeed, moveToward } from '../../src/game/entities/playerMovement';
import { playerAnimation } from '../../src/game/entities/playerAnimation';
import { applyOrRefreshEffect } from '../../src/game/status/effectStack';
import { GameSimulation } from '../../src/game/core/GameSimulation';

describe('Prompt 02: reusable actor systems', () => {
  it('accelerates, brakes and rejects invalid motion without teleporting', () => {
    expect(nextMoveSpeed(0, 190, 300, 1 / 60)).toBeGreaterThan(0);
    expect(nextMoveSpeed(190, 190, 1, 1 / 60)).toBeLessThan(190);
    expect(nextMoveSpeed(100, 190, 100, -1)).toBe(0);
    const p = { x: 390, y: 470 };
    moveToward(p, { x: 500, y: 470 }, 190, 0.1, 0, [], true);
    expect(p).toEqual({ x: 390, y: 470 });
    moveToward(p, { x: 500, y: 470 }, 190, 0.1, 0, []);
    expect(p.x).toBeGreaterThan(390);
  });

  it('chooses an animation from read-only game state', () => {
    const sim = new GameSimulation();
    const normal = sim.snapshot();
    expect(playerAnimation(normal)).toBe('idle');
    expect(playerAnimation({ ...normal, status: 'moving' })).toBe('running');
    expect(playerAnimation({ ...normal, status: 'combat' })).toBe('attacking');
    expect(playerAnimation({ ...normal, evadeCooldown: 2.4 })).toBe('evading');
    expect(playerAnimation({ ...normal, effects: {
      ...normal.effects,
      player: [{ id: 'stunned', remaining: 1, magnitude: 0, tick: 0 }]
    } })).toBe('stunned');
    expect(playerAnimation({ ...normal, player: {
      ...normal.player, health: 0, alive: false
    } })).toBe('dead');
  });

  it('refreshes a status effect without mutating the original list', () => {
    const initial = Object.freeze([Object.freeze({
      id: 'burning' as const, remaining: 1, magnitude: 3, tick: 0.4
    })]);
    const next = applyOrRefreshEffect(initial, {
      id: 'burning', remaining: 2, magnitude: 1, tick: 0
    });
    expect(next).toEqual([{ id: 'burning', remaining: 2, magnitude: 3, tick: 0 }]);
    expect(initial[0]!.remaining).toBe(1);
    const added = applyOrRefreshEffect(initial, {
      id: 'stunned', remaining: 1, magnitude: 0, tick: 0
    });
    expect(added).toHaveLength(2);
  });
});
