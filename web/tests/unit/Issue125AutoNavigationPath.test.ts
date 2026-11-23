// F0: the live auto-approach must route around the dungeon rooms, not run
// a collision-constrained straight line forever. GPL-3.0-only.
import { describe, expect, it } from 'vitest';
import { rollItem, SeededRng } from '../../src/game/data/items';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createCryptPack } from '../../src/game/enemies/enemies';
import type { Point } from '../../src/game/core/types';
import { CRYPT_EXIT, CRYPT_GATE, CRYPT_BOSS_POSITIONS } from '../../src/game/world/generator';
import { buildCryptWorld, CRYPT_RUNTIME_BOSS_POSITIONS } from '../../src/game/world/dungeonRuntime';
import { ACTOR_RADIUS, canOccupy, findPath, hasLineOfSight } from '../../src/game/world/navigation';

describe('F0 — click-to-interact auto-navigation around solid walls', () => {
  it('walks to pickup range for a drop too close to a wall for the hero to stand on it', () => {
    const game = new GameSimulation(0);
    const snapshot = game.snapshot();
    const { obstacles } = buildWilderness(0).layout;
    const origin = { x: 1100, y: 690 };
    const item = rollItem(1, snapshot.level, new SeededRng(42));
    const loot = { id: 'wall-drop', x: 1258, y: 690, item };
    expect(canOccupy(loot, 0, obstacles)).toBe(true);
    expect(canOccupy(loot, ACTOR_RADIUS, obstacles)).toBe(false);
    expect(game.restore({ ...snapshot, player: { ...snapshot.player, ...origin },
      groundLoot: [loot] })).toBe(true);

    game.command({ type: 'pickup', id: loot.id });
    for (let tick = 0; tick < 120 && game.snapshot().groundLoot.length; tick++) {
      game.advance(33.334);
      expect(canOccupy(game.snapshot().player, ACTOR_RADIUS, obstacles)).toBe(true);
    }
    expect(game.snapshot().groundLoot).toEqual([]);
    expect(game.snapshot().inventory.filter(entry => entry?.id === item.id)).toHaveLength(1);
  });

  it.each([0, 42, 901])(
    'completes a genuine portal command around crypt walls on seed %i',
    (seed) => {
      const game = new GameSimulation(seed);
      const outdoor = game.snapshot();
      expect(game.restore({ ...outdoor,
        player: { ...outdoor.player, ...CRYPT_GATE } })).toBe(true);
      game.command({ type: 'usePortal' });
      expect(game.snapshot().zone).toBe('crypt');

      const layout = buildCryptWorld(seed).layout;
      const candidate = [...CRYPT_RUNTIME_BOSS_POSITIONS, ...CRYPT_BOSS_POSITIONS,
        ...layout.encounterPositions].find(point =>
        canOccupy(point, ACTOR_RADIUS, layout.obstacles)
        && !hasLineOfSight(point, CRYPT_EXIT, layout.obstacles)
        && findPath(point, CRYPT_EXIT, ACTOR_RADIUS, layout.obstacles).length > 1
      );
      expect(candidate, 'A real dungeon corner must block the straight portal line')
        .toBeDefined();

      // Construct a cleared level, without enemy attacks, while preserving the
      // full engine zone, portal, collision and movement state machine.
      const crypt = game.snapshot();
      const fallen = createCryptPack(1, crypt.level, CRYPT_RUNTIME_BOSS_POSITIONS)
        .map(unit => ({ ...unit, actor: {
          ...unit.actor, health: 0, alive: false
        }, intent: null }));
      expect(game.restore({
        ...crypt,
        player: { ...crypt.player, ...candidate! },
        wave: 1, dungeonStage: 1, dungeonCleared: true,
        enemies: fallen, selectedTargetId: null, hollowKing: null
      })).toBe(true);

      // User-visible action, no private follow() calls or teleport after click.
      game.command({ type: 'usePortal' });
      const start = { ...game.snapshot().player };
      expect(Math.hypot(start.x - CRYPT_EXIT.x, start.y - CRYPT_EXIT.y)).toBeGreaterThan(78);
      let progressed = false;
      for (let tick = 0; tick < 950 && game.snapshot().zone === 'crypt'; tick++) {
        const previous = game.snapshot().player;
        game.advance(16.667);
        const current = game.snapshot().player;
        if (game.snapshot().zone === 'crypt') {
          expect(canOccupy(current, ACTOR_RADIUS, layout.obstacles)).toBe(true);
          expect(Math.hypot(current.x - previous.x, current.y - previous.y))
            .toBeLessThanOrEqual(8);
        }
        if (Math.hypot(current.x - start.x, current.y - start.y) > 150) progressed = true;
      }
      expect(progressed).toBe(true);
      expect(game.snapshot().zone).toBe('wilderness');
    }
  );

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
