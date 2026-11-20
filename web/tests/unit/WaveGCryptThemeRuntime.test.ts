import { describe, expect, it } from 'vitest';
import { buildCryptWorld } from '../../src/game/world/dungeonRuntime';
import { ACTOR_RADIUS, canOccupy, findPath } from '../../src/game/world/navigation';

describe('Wave G Corrupted Crypt runtime theme adapter', () => {
  it.each([0, 1, 2, 42, 8712, 0xffffffff])('assembles repeatable room visuals without altering dungeon paths (%s)', seed => {
    const a = buildCryptWorld(seed);
    const b = buildCryptWorld(seed);
    expect(a.theme).toEqual(b.theme);
    expect(a.theme.seed).toBe(seed);
    expect(a.theme.themeId).toBe('corrupted_crypt');
    expect(a.theme.roomVisuals.map(room => room.roomId))
      .toEqual(a.dungeon.rooms.map(room => room.id));
    expect(a.theme.roomVisuals.every(room => room.layers.length >= 3)).toBe(true);
    expect(a.theme.props.length).toBeGreaterThan(9);
    expect(new Set(a.theme.props.map(prop => prop.id)).size).toBe(a.theme.props.length);
    for (const point of [
      a.layout.camp, ...a.layout.encounterPositions,
      a.dungeon.bossSpawn, ...a.dungeon.bossGuardSpawns
    ]) {
      expect(canOccupy(point, ACTOR_RADIUS, a.layout.obstacles)).toBe(true);
      expect(findPath(a.layout.camp, point, ACTOR_RADIUS, a.layout.obstacles).length)
        .toBeGreaterThan(0);
    }
    expect(a.theme.traps.every(trap => trap.damage.maxBaseDamage < 100)).toBe(true);
    expect(a.theme.secretHints.every(hint => !hint.initiallyDiscovered)).toBe(true);
  });
  it('does not generate physics walls, live enemies or rewards as a renderer side effect', () => {
    const dungeon = buildCryptWorld(42);
    const before = JSON.stringify(dungeon.layout);
    const themeText = JSON.stringify(dungeon.theme);
    expect(themeText).not.toContain('goldAwarded');
    expect(themeText).not.toContain('groundLoot');
    expect(JSON.stringify(dungeon.layout)).toBe(before);
  });
});
