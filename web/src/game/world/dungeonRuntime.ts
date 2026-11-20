// GPL-3.0-only — Wave F / Prompt 25 integration adapter.
// One seed, one validated room/door/tiles/collision plan for simulation and Phaser.
import { CRYPT_EXIT, CRYPT_BOSS_POSITIONS, type WorldLayout } from './generator';
import {
  generateProceduralDungeon, validateProceduralDungeon,
  type ProceduralDungeonResult
} from './proceduralDungeon';
import { ACTOR_RADIUS, canOccupy, findPath } from './navigation';

/**
 * Keep legacy crypt encounter identities while moving the westernmost retainer
 * 30 units into its boss arena. This grants safe melee approach clearance:
 * the generated boss room begins at x=1280 and an 18-radius actor standing
 * 34 units left of the retainer must not collide with its west wall.
 */
export const CRYPT_RUNTIME_BOSS_POSITIONS: readonly Readonly<{ x: number; y: number }>[] =
  CRYPT_BOSS_POSITIONS.map((position, index) => index === 2
    ? { x: position.x + 30, y: position.y } : { ...position });

export interface DungeonRuntimeWorld {
  readonly dungeon: ProceduralDungeonResult;
  readonly layout: WorldLayout;
}

/**
 * Keep existing portal, enemy roster, stage progression and boss coordinates.
 * The first three crypt guardians occupy three traversable mandatory rooms.
 * Boss stage uses dungeon.bossSpawn and bossGuardSpawns separately.
 */
export function buildCryptWorld(seed: number): DungeonRuntimeWorld {
  const dungeon = generateProceduralDungeon(seed);
  if (!validateProceduralDungeon(dungeon).valid) {
    throw new RangeError('Generated crypt failed runtime validation');
  }
  const combat = dungeon.encounterSpawns.find(spawn => spawn.kind === 'combat');
  const elite = dungeon.encounterSpawns.find(spawn => spawn.kind === 'elite');
  const eventRoom = dungeon.rooms.find(room => room.type === 'event');
  if (!combat || !elite || !eventRoom) {
    throw new RangeError('Crypt missing guardian spawn rooms');
  }
  const encounters = [combat.position, elite.position, eventRoom.center]
    .map(position => ({ ...position }));
  const layout: WorldLayout = {
    seed: dungeon.seed,
    camp: { ...dungeon.playerSpawn },
    obstacles: dungeon.obstacles.map(wall => ({ ...wall })),
    encounterPositions: encounters
  };
  if (layout.camp.x !== CRYPT_EXIT.x || layout.camp.y !== CRYPT_EXIT.y
    || [layout.camp, ...encounters, ...CRYPT_RUNTIME_BOSS_POSITIONS]
      .some(position => !canOccupy(position, ACTOR_RADIUS, layout.obstacles)
        || findPath(layout.camp, position, ACTOR_RADIUS, layout.obstacles).length === 0)) {
    throw new RangeError('Crypt pathing or legacy portal invariant failed');
  }
  return { dungeon, layout };
}
