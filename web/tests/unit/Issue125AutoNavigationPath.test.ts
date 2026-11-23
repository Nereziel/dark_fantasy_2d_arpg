// F0: the live auto-approach must route around the dungeon rooms, not run
// a collision-constrained straight line forever. GPL-3.0-only.
import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import type { Point } from '../../src/game/core/types';
import { CRYPT_EXIT, CRYPT_GATE, CRYPT_BOSS_POSITIONS } from '../../src/game/world/generator';
import { buildCryptWorld, CRYPT_RUNTIME_BOSS_POSITIONS } from '../../src/game/world/dungeonRuntime';
import { ACTOR_RADIUS, canOccupy, findPath, hasLineOfSight } from '../../src/game/world/navigation';

describe('F0 — click-to-interact auto-navigation around solid walls', () => {
  it('returns from the boss-side crypt rooms without flying into the first wall', () => {
    const game = new GameSimulation(0);
    const wilderness = game.snapshot();
    expect(game.restore({ ...wilderness, player: { ...wilderness.player, ...CRYPT_GATE } })).toBe(true);
    game.command({ type: 'usePortal' });
    expect(game.snapshot().zone).toBe('crypt');

    const layout = buildCryptWorld(0).layout;
    const candidates: Point[] = [...CRYPT_RUNTIME_BOSS_POSITIONS, ...CRYPT_BOSS_POSITIONS,
      { x: 1300, y: 563 }, ...layout.encounterPositions];
    const far = candidates.find(position =>
      canOccupy(position, ACTOR_RADIUS, layout.obstacles)
      && findPath(position, CRYPT_EXIT, ACTOR_RADIUS, layout.obstacles).length > 1
      && !hasLineOfSight(position, CRYPT_EXIT, layout.obstacles)
    );
    expect(far, 'A crypt room with a blocked direct exit line must exist').toBeDefined();
    const crypt = game.snapshot();
    expect(game.restore({ ...crypt, player: { ...crypt.player, ...far! } })).toBe(true);
    game.command({ type: 'usePortal' });

    // Call the same follow primitive as the real fixed-step portal approach;
    // omit enemy AI so this tests navigation alone, not character survival.
    const runtime = game as unknown as {
      player: Point;
      follow(actor: Point, goal: Point, speed: number, dt: number,
        stop?: number, autoRoute?: boolean): void;
    };
    const startDistance = Math.hypot(far!.x - CRYPT_EXIT.x, far!.y - CRYPT_EXIT.y);
    for (let tick = 0; tick < 1_000; tick++) {
      if (Math.hypot(runtime.player.x - CRYPT_EXIT.x, runtime.player.y - CRYPT_EXIT.y) <= 77) break;
      const previous = { ...runtime.player };
      runtime.follow(runtime.player, CRYPT_EXIT, 220, 1 / 30, 70, true);
      expect(canOccupy(runtime.player, ACTOR_RADIUS, layout.obstacles)).toBe(true);
      expect(Math.hypot(runtime.player.x - previous.x, runtime.player.y - previous.y))
        .toBeLessThanOrEqual(220 / 30 + 0.01);
    }
    const remaining = Math.hypot(runtime.player.x - CRYPT_EXIT.x,
      runtime.player.y - CRYPT_EXIT.y);
    expect(remaining).toBeLessThan(78);
    expect(remaining).toBeLessThan(startDistance - 200);

    // Enter/exit always remains authoritative: only a regular portal command
    // commits the zone transition after the physical approach.
    game.command({ type: 'usePortal' });
    expect(game.snapshot().zone).toBe('wilderness');
  });
});
