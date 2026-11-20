// GPL-3.0-only — Wave G integrator-owned crypt boss arena adapter.
import { CRYPT_EXIT } from '../world/generator';
import { buildCryptWorld } from '../world/dungeonRuntime';
import { ACTOR_RADIUS, canOccupy, findPath } from '../world/navigation';
import {
  createHollowKingState, validateHollowKingState,
  type HollowKingArena, type HollowKingState
} from './hollowKingPhases';

export interface HollowKingRuntime {
  readonly arena: HollowKingArena;
  readonly initial: HollowKingState;
}

/**
 * Canonical arena comes from Agent30's dungeon room graph; no teleport gates,
 * synthetic obstacles, fake safe spots or detached render collision.
 * The existing actor crypt_lord-4 and story event crypt_lord_slain are retained.
 */
export function buildHollowKingRuntime(seed: number, maxHealth: number): HollowKingRuntime {
  const dungeon = buildCryptWorld(seed);
  const bossRoom = dungeon.dungeon.rooms.find(room => room.type === 'boss');
  if (!bossRoom) throw new RangeError('Missing Hollow King boss room');
  const bounds = { ...bossRoom.bounds };
  const safePoint = { x: bounds.x + 76, y: bounds.y + 106 };
  const escapePoint = {
    x: bounds.x + bounds.width - 70, y: bounds.y + bounds.height - 76
  };
  const walls = dungeon.layout.obstacles.filter(wall =>
    wall.x < bounds.x + bounds.width && wall.x + wall.width > bounds.x
    && wall.y < bounds.y + bounds.height && wall.y + wall.height > bounds.y)
    .map(wall => ({ x: wall.x, y: wall.y, width: wall.width, height: wall.height }));
  const arena: HollowKingArena = {
    bounds, bossSpawn: { ...dungeon.dungeon.bossSpawn },
    safePoint, escapePoint, exitPosition: { ...CRYPT_EXIT }, walls
  };
  for (const position of [arena.bossSpawn, arena.safePoint, arena.escapePoint]) {
    if (!canOccupy(position, ACTOR_RADIUS, dungeon.layout.obstacles)
      || findPath(dungeon.layout.camp, position, ACTOR_RADIUS, dungeon.layout.obstacles).length === 0) {
      throw new RangeError('Unsafe or unreachable Hollow King arena');
    }
  }
  const initial = createHollowKingState(
    'crypt/' + seed + '/hollow-king', seed, arena, maxHealth
  );
  if (!validateHollowKingState(initial)) throw new RangeError('Invalid boss phase state');
  return { arena: structuredClone(initial.arena), initial };
}
