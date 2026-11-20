// GPL-3.0-only — Prompt 36, pure seed-scoped waypoint travel validation.
// No UI, game mutations, scene references, storage calls or hidden RNG.
import type { Point, ZoneId } from '../core/types';
import type { WorldLayout } from './generator';
import { CAMP } from './generator';
import { getTownManifest } from './townManifest';
import { WORLD_OBJECTS } from './interactables';
import { ACTOR_RADIUS, canOccupy, findPath, WORLD_WIDTH, WORLD_HEIGHT } from './navigation';

export const WAYPOINT_IDS = ['town.waypoint', 'shrine.soul-shrine'] as const;
export type WaypointId = typeof WAYPOINT_IDS[number];
export interface WaypointDefinition {
  readonly id: WaypointId;
  readonly position: Readonly<Point>;
  readonly interactionRange: number;
  readonly nameKey: string;
}
export function waypointDefinition(id: unknown): WaypointDefinition | null {
  if (id === 'town.waypoint') {
    const entry = getTownManifest().find(entry => entry.id === 'waypoint_camp' && entry.role === 'waypoint');
    return entry ? {
      id, position: { ...entry.position }, interactionRange: entry.interactionRange,
      nameKey: entry.nameKey
    } : null;
  }
  if (id === 'shrine.soul-shrine') {
    const shrine = WORLD_OBJECTS.find(object =>
      object.id === 'soul-shrine' && object.kind === 'shrine' && object.zone === 'wilderness');
    return shrine ? {
      id, position: { ...shrine.position }, interactionRange: shrine.reach,
      nameKey: 'waypoints.field.name'
    } : null;
  }
  return null;
}
export function waypointPosition(id: unknown): Point | null {
  const definition = waypointDefinition(id);
  return definition ? { ...definition.position } : null;
}
/**
 * The town activation is already stored in MapDiscoveryState v1 and shrine
 * activation already in activatedCheckpointIds on the seed-scoped world record.
 * Do not change the historic map fingerprint or expand CharacterProgress v11.
 */
export function activatedWaypoints(
  mapWaypointIds: unknown, checkpointIds: unknown
): WaypointId[] {
  const town = Array.isArray(mapWaypointIds)
    && mapWaypointIds.includes('town.waypoint');
  const shrine = Array.isArray(checkpointIds)
    && checkpointIds.includes('shrine.soul-shrine');
  return WAYPOINT_IDS.filter(id => id === 'town.waypoint' ? town : shrine);
}
export interface WaypointTravelContext {
  readonly world: Readonly<WorldLayout>;
  readonly zone: ZoneId;
  readonly player: Readonly<Point> & { readonly alive: boolean };
  readonly activated: readonly WaypointId[];
}
export interface WaypointTravelPlan {
  readonly from: WaypointId;
  readonly to: WaypointId;
  readonly position: Readonly<Point>;
}
function finitePoint(point: unknown): point is Point {
  if (!point || typeof point !== 'object' || Array.isArray(point)) return false;
  const candidate = point as Partial<Point>;
  return typeof candidate.x === 'number' && Number.isFinite(candidate.x)
    && typeof candidate.y === 'number' && Number.isFinite(candidate.y)
    && candidate.x >= 0 && candidate.y >= 0
    && candidate.x <= WORLD_WIDTH && candidate.y <= WORLD_HEIGHT;
}
function safeWorld(layout: unknown): layout is WorldLayout {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return false;
  const value = layout as Partial<WorldLayout>;
  return typeof value.seed === 'number' && Number.isSafeInteger(value.seed)
    && value.seed >= 0 && value.seed <= 0xffffffff
    && finitePoint(value.camp) && value.camp.x === CAMP.x && value.camp.y === CAMP.y
    && Array.isArray(value.obstacles) && value.obstacles.length <= 4096
    && value.obstacles.every(obstacle => obstacle
      && typeof obstacle.id === 'string'
      && Number.isFinite(obstacle.x) && Number.isFinite(obstacle.y)
      && Number.isFinite(obstacle.width) && Number.isFinite(obstacle.height)
      && obstacle.width > 0 && obstacle.height > 0
      && obstacle.x >= 0 && obstacle.y >= 0
      && obstacle.x + obstacle.width <= WORLD_WIDTH
      && obstacle.y + obstacle.height <= WORLD_HEIGHT);
}
function safeDestination(definition: WaypointDefinition, world: WorldLayout): boolean {
  return canOccupy(definition.position, ACTOR_RADIUS, world.obstacles)
    && findPath(CAMP, definition.position, ACTOR_RADIUS, world.obstacles).length > 0;
}
function validActivation(value: unknown): value is readonly WaypointId[] {
  return Array.isArray(value) && value.length <= WAYPOINT_IDS.length
    && value.every(id => WAYPOINT_IDS.some(known => known === id))
    && new Set(value).size === value.length;
}
/**
 * Require actual physical proximity to an activated source and an activated,
 * collision-safe, reachable target in the same wilderness instance.
 * Never accept a client-provided source coordinate or an undiscovered target.
 */
export function planWaypointTravel(
  context: WaypointTravelContext, destinationId: unknown
): WaypointTravelPlan | null {
  if (!context || context.zone !== 'wilderness' || !context.player
    || context.player.alive !== true || !finitePoint(context.player)
    || !safeWorld(context.world) || !validActivation(context.activated)) return null;
  const target = waypointDefinition(destinationId);
  if (!target || !context.activated.includes(target.id)
    || !safeDestination(target, context.world)) return null;
  const sources = context.activated.flatMap(id => {
    const source = waypointDefinition(id);
    if (!source || source.id === target.id || !safeDestination(source, context.world)) return [];
    const separation = Math.hypot(
      source.position.x - context.player.x, source.position.y - context.player.y);
    return separation <= source.interactionRange ? [{
      source, separation
    }] : [];
  }).sort((a,b) => a.separation - b.separation);
  const source = sources[0]?.source;
  return source ? { from: source.id, to: target.id,
    position: { ...target.position } } : null;
}
