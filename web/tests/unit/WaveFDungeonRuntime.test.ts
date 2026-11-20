import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { buildCryptWorld } from '../../src/game/world/dungeonRuntime';
import { CRYPT_EXIT, CRYPT_BOSS_POSITIONS } from '../../src/game/world/generator';
import { ACTOR_RADIUS, canOccupy, findPath } from '../../src/game/world/navigation';

describe('Wave F procedural crypt runtime adapter', () => {
  it.each([0, 1, 2, 42, 8712, 0xffffffff])(
    'uses the same seeded geometry for room rendering and game navigation (%s)', seed => {
      const a = buildCryptWorld(seed);
      const b = buildCryptWorld(seed);
      expect(a).toEqual(b);
      expect(a.dungeon.validation.valid).toBe(true);
      expect(a.layout.camp).toEqual(CRYPT_EXIT);
      expect(a.layout.encounterPositions).toHaveLength(3);
      const required = a.dungeon.rooms.filter(room => room.required);
      expect(required).toHaveLength(8);
      for (const point of [
        CRYPT_EXIT, ...a.layout.encounterPositions,
        ...CRYPT_BOSS_POSITIONS, ...required.map(room => room.center)
      ]) {
        expect(canOccupy(point, ACTOR_RADIUS, a.layout.obstacles)).toBe(true);
        expect(findPath(CRYPT_EXIT, point, ACTOR_RADIUS, a.layout.obstacles).length)
          .toBeGreaterThan(0);
      }
      expect(a.dungeon.tiles.some(tile => tile.kind === 'wall')).toBe(true);
      expect(a.dungeon.tiles.some(tile => tile.kind === 'floor')).toBe(true);
    }
  );
  it('changes room geometry across seeds, not only colors', () => {
    const a = buildCryptWorld(41);
    const b = buildCryptWorld(42);
    expect(a.dungeon.rooms.map(room => [room.type, room.slot]))
      .not.toEqual(b.dungeon.rooms.map(room => [room.type, room.slot]));
  });
  it('uses the procedural layout in the actual crypt zone without losing portal compatibility', () => {
    const sim = new GameSimulation(42);
    sim.command({ type: 'usePortal' });
    for (let i = 0; i < 240 && sim.snapshot().zone !== 'crypt'; i++) sim.advance(16.667);
    const inside = sim.snapshot();
    expect(inside.zone).toBe('crypt');
    const world = buildCryptWorld(42);
    expect(inside.player).toMatchObject(world.dungeon.playerSpawn);
    expect(inside.enemies.map(enemy => [enemy.actor.x, enemy.actor.y])).toEqual(
      world.layout.encounterPositions.map(position => [position.x, position.y])
    );
    const savedCharacter = sim.character();
    sim.command({ type: 'usePortal' });
    expect(sim.snapshot().zone).toBe('wilderness');
    expect(sim.character()).toEqual(savedCharacter);
  });
});
