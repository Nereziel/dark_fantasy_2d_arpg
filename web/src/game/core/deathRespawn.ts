// GPL-3.0-only — Prompt 29, deterministic death and checkpoint selection.
// Pure rules only: no Phaser, Svelte, saves, grants, or combat mutations.
import type { Point, ZoneId } from './types';
import type { WorldLayout } from '../world/generator';
import { CAMP } from '../world/generator';
import { WORLD_OBJECTS } from '../world/interactables';
import { getTownManifest } from '../world/townManifest';
import { ACTOR_RADIUS, canOccupy, findPath } from '../world/navigation';

/** Other checkpoint categories belong to later content; no fast travel is exposed. */
export const ACTIVATABLE_CHECKPOINT_IDS = ['shrine.soul-shrine'] as const;
export type RespawnCheckpointId = typeof ACTIVATABLE_CHECKPOINT_IDS[number];
export type RespawnDestinationId = 'town.waypoint' | RespawnCheckpointId;
export interface RespawnDestination {
  readonly id: RespawnDestinationId;
  readonly position: Readonly<Point>;
}
export const RESPAWN_PROTECTION_SECONDS = 3;

/** World-instance records accept only exact known IDs, no duplicates or prototype keys. */
export function validCheckpointIds(value: unknown): value is RespawnCheckpointId[] {
  return Array.isArray(value)
    && value.length <= ACTIVATABLE_CHECKPOINT_IDS.length
    && value.every(id => typeof id === 'string'
      && (ACTIVATABLE_CHECKPOINT_IDS as readonly string[]).includes(id))
    && new Set(value).size === value.length;
}

function reachable(position: Readonly<Point>, world: Readonly<WorldLayout>): boolean {
  return canOccupy(position, ACTOR_RADIUS, world.obstacles)
    && findPath(CAMP, position, ACTOR_RADIUS, world.obstacles).length > 0;
}

/**
 * The town waypoint is always an available failsafe. Activated field shrines
 * can win by proximity only when dying in the wilderness. Dungeons have no
 * unlocked checkpoint in Prompt 29, so deaths there return to the town.
 */
export function chooseRespawnDestination(
  deathZone: ZoneId, deathPosition: Readonly<Point>,
  activated: readonly RespawnCheckpointId[], wilderness: Readonly<WorldLayout>
): RespawnDestination {
  const town = getTownManifest().find(entry => entry.role === 'waypoint');
  const townPosition = town && reachable(town.position, wilderness)
    ? town.position : CAMP;
  const candidates: RespawnDestination[] = [
    { id: 'town.waypoint', position: { ...townPosition } }
  ];
  if (deathZone === 'wilderness' && validCheckpointIds(activated)) {
    for (const id of activated) {
      if (id === 'shrine.soul-shrine') {
        const shrine = WORLD_OBJECTS.find(object =>
          object.id === 'soul-shrine' && object.kind === 'shrine'
          && object.zone === 'wilderness');
        if (shrine && reachable(shrine.position, wilderness)) {
          candidates.push({ id, position: { ...shrine.position } });
        }
      }
    }
  }
  const point = Number.isFinite(deathPosition.x) && Number.isFinite(deathPosition.y)
    ? deathPosition : townPosition;
  const nearest = candidates.reduce((best, current) => {
    const distance = Math.hypot(point.x - current.position.x, point.y - current.position.y);
    const previous = Math.hypot(point.x - best.position.x, point.y - best.position.y);
    return distance < previous ? current : best;
  });
  return { id: nearest.id, position: { ...nearest.position } };
}
