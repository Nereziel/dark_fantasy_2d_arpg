import type { Point, ZoneId } from '../core/types';

/** Stable IDs and interaction ranges, shared by scene and simulation. */
export type WorldObjectId = 'soul-shrine' | 'field-chest';
export interface WorldObject {
  id: WorldObjectId;
  kind: 'shrine' | 'chest';
  zone: ZoneId;
  position: Point;
  hitRadius: number;
  reach: number;
}
export const WORLD_OBJECTS: readonly WorldObject[] = [
  { id: 'soul-shrine', kind: 'shrine', zone: 'wilderness',
    position: { x: 1040, y: 445 }, hitRadius: 40, reach: 66 },
  { id: 'field-chest', kind: 'chest', zone: 'wilderness',
    position: { x: 580, y: 620 }, hitRadius: 30, reach: 52 }
];

export function isWorldObjectId(id: unknown): id is WorldObjectId {
  return id === 'soul-shrine' || id === 'field-chest';
}
export function getWorldObject(id: unknown, zone: ZoneId): WorldObject | null {
  return WORLD_OBJECTS.find(o => o.zone === zone && o.id === id) ?? null;
}
export function worldObjectsFor(zone: ZoneId): WorldObject[] {
  return WORLD_OBJECTS.filter(o => o.zone === zone)
    .map(o => ({ ...o, position: { ...o.position } }));
}
