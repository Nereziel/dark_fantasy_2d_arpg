// GPL-3.0-only — Wave D / Agent 22. Pure, seed-independent town data.
// This module describes capabilities; only existing NPCs are connected to gameplay.
import type { Point } from '../core/types';
import { CAMP, CAMP_RADIUS } from './generator';
import { WARDEN_ID } from '../quests/firstQuest';
import {
  BLACKSMITH_ID, MERCHANT_ID, NPC_INTERACT_RANGE, NPC_POSITIONS
} from './npcs';
import {
  ACTOR_RADIUS, canOccupy, findPath, WORLD_HEIGHT, WORLD_WIDTH, type Obstacle
} from './navigation';

export type TownServiceRole =
  | 'quest'
  | 'weaponMerchant'
  | 'blacksmith'
  | 'potionVendor'
  | 'healer'
  | 'stash'
  | 'waypoint'
  | 'civilian';

/** A planned capability is not a usable inventory, healing or travel service yet. */
export type TownCapability = 'existing' | 'planned' | 'decorative';

export interface TownEntry {
  readonly id: string;
  readonly role: TownServiceRole;
  readonly position: Readonly<Point>;
  readonly interactionRange: number;
  /** Visual footprint/clearance only; NOT an additional navigation obstacle. */
  readonly collisionRadius: number;
  readonly nameKey: string;
  readonly descriptionKey: string;
  readonly capability: TownCapability;
}

/** Untrusted layouts can be validated without changing either the world or town data. */
export interface TownLayout {
  readonly center: Readonly<Point>;
  readonly radius: number;
  readonly spawn: Readonly<Point>;
  readonly obstacles: readonly Obstacle[];
  readonly entries: readonly TownEntry[];
}

export type TownLayoutErrorCode =
  | 'invalidLayout'
  | 'invalidCamp'
  | 'invalidSpawn'
  | 'invalidObstacle'
  | 'invalidEntry'
  | 'invalidId'
  | 'duplicateId'
  | 'invalidRole'
  | 'duplicateRole'
  | 'missingRole'
  | 'missingLegacyNpc'
  | 'legacyRole'
  | 'legacyPosition'
  | 'legacyRange'
  | 'invalidPosition'
  | 'invalidRange'
  | 'invalidRadius'
  | 'invalidKey'
  | 'invalidCapability'
  | 'outsideWorld'
  | 'outsideSafeZone'
  | 'blockedPoint'
  | 'unreachable'
  | 'spawnOverlap'
  | 'entryOverlap';

export interface TownLayoutError {
  readonly code: TownLayoutErrorCode;
  readonly entryId?: string;
}

const ROLES: readonly TownServiceRole[] = [
  'quest', 'weaponMerchant', 'blacksmith', 'potionVendor',
  'healer', 'stash', 'waypoint', 'civilian'
];
const CAPABILITIES: readonly TownCapability[] = ['existing', 'planned', 'decorative'];
const ENTRY_ID = /^[a-z][a-z0-9_]*$/;
const TRANSLATION_KEY = /^town\.entry\.[a-z][a-z0-9_]*\.(?:name|description)$/;
const MIN_SEPARATION = 18; // space between entity footprints in world units
const SPAWN_CLEARANCE = 8;

const entries: readonly TownEntry[] = [
  {
    id: WARDEN_ID, role: 'quest', position: NPC_POSITIONS[WARDEN_ID],
    interactionRange: NPC_INTERACT_RANGE, collisionRadius: 14,
    nameKey: 'town.entry.warden_vesna.name',
    descriptionKey: 'town.entry.warden_vesna.description',
    capability: 'existing'
  },
  {
    id: MERCHANT_ID, role: 'weaponMerchant', position: NPC_POSITIONS[MERCHANT_ID],
    interactionRange: NPC_INTERACT_RANGE, collisionRadius: 14,
    nameKey: 'town.entry.merchant_bram.name',
    descriptionKey: 'town.entry.merchant_bram.description',
    capability: 'existing'
  },
  {
    id: BLACKSMITH_ID, role: 'blacksmith', position: NPC_POSITIONS[BLACKSMITH_ID],
    interactionRange: NPC_INTERACT_RANGE, collisionRadius: 14,
    nameKey: 'town.entry.smith_odan.name',
    descriptionKey: 'town.entry.smith_odan.description',
    capability: 'existing'
  },
  {
    id: 'potion_vendor_lena', role: 'potionVendor', position: { x: 340, y: 568 },
    interactionRange: 72, collisionRadius: 12,
    nameKey: 'town.entry.potion_vendor_lena.name',
    descriptionKey: 'town.entry.potion_vendor_lena.description',
    capability: 'planned'
  },
  {
    id: 'healer_iva', role: 'healer', position: { x: 410, y: 576 },
    interactionRange: 72, collisionRadius: 12,
    nameKey: 'town.entry.healer_iva.name',
    descriptionKey: 'town.entry.healer_iva.description',
    capability: 'planned'
  },
  {
    id: 'stash_camp', role: 'stash', position: { x: 325, y: 502 },
    interactionRange: 68, collisionRadius: 12,
    nameKey: 'town.entry.stash_camp.name',
    descriptionKey: 'town.entry.stash_camp.description',
    capability: 'planned'
  },
  {
    id: 'waypoint_camp', role: 'waypoint', position: { x: 260, y: 496 },
    interactionRange: 72, collisionRadius: 12,
    nameKey: 'town.entry.waypoint_camp.name',
    descriptionKey: 'town.entry.waypoint_camp.description',
    capability: 'planned'
  },
  {
    id: 'civilian_mira', role: 'civilian', position: { x: 380, y: 381 },
    interactionRange: 54, collisionRadius: 10,
    nameKey: 'town.entry.civilian_mira.name',
    descriptionKey: 'town.entry.civilian_mira.description',
    capability: 'decorative'
  },
  {
    id: 'civilian_toma', role: 'civilian', position: { x: 505, y: 429 },
    interactionRange: 54, collisionRadius: 10,
    nameKey: 'town.entry.civilian_toma.name',
    descriptionKey: 'town.entry.civilian_toma.description',
    capability: 'decorative'
  },
  {
    id: 'civilian_lio', role: 'civilian', position: { x: 535, y: 477 },
    interactionRange: 54, collisionRadius: 10,
    nameKey: 'town.entry.civilian_lio.name',
    descriptionKey: 'town.entry.civilian_lio.description',
    capability: 'decorative'
  }
];

/** Copy at the boundary, including nested coordinates. No mutable registry is exposed. */
function copyEntry(entry: TownEntry): TownEntry {
  return { ...entry, position: { ...entry.position } };
}

/** Stable order and coordinates, entirely independent of wilderness seed. */
export function getTownManifest(): TownEntry[] {
  return entries.map(copyEntry);
}

function validId(id: unknown): id is string {
  return typeof id === 'string' && ENTRY_ID.test(id);
}

/** Unknown, malformed and prototype-like IDs never resolve to a town entry. */
export function townEntry(id: unknown): TownEntry | null {
  if (!validId(id)) return null;
  const entry = entries.find(candidate => candidate.id === id);
  return entry ? copyEntry(entry) : null;
}

export function townServiceFor(id: unknown): TownServiceRole | null {
  return townEntry(id)?.role ?? null;
}

function finitePoint(value: unknown): value is Readonly<Point> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const point = value as Partial<Point>;
  return typeof point.x === 'number' && Number.isFinite(point.x)
    && typeof point.y === 'number' && Number.isFinite(point.y);
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function length(a: Readonly<Point>, b: Readonly<Point>): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Describes the historic circular safe-zone footprint; does not authorize damage. */
export function isTownSafePoint(point: unknown): boolean {
  return finitePoint(point) && length(point, CAMP) <= CAMP_RADIUS;
}

/** Pure proximity check. Commands, dialogue eligibility and movement remain simulation-owned. */
export function canInteractTownEntry(hero: unknown, id: unknown): boolean {
  const entry = townEntry(id);
  return !!entry && finitePoint(hero) && length(hero, entry.position) <= entry.interactionRange;
}

function validObstacle(value: unknown): value is Obstacle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const wall = value as Partial<Obstacle>;
  return typeof wall.id === 'string' && /^[a-z][a-z0-9_-]*$/.test(wall.id)
    && Number.isFinite(wall.x) && Number.isFinite(wall.y)
    && finitePositive(wall.width) && finitePositive(wall.height)
    && wall.x !== undefined && wall.y !== undefined
    && wall.x >= 0 && wall.y >= 0
    && wall.x + wall.width <= WORLD_WIDTH
    && wall.y + wall.height <= WORLD_HEIGHT;
}

/**
 * Validate a complete, untrusted town layout. Returns machine-readable error codes
 * instead of throwing or modifying caller data. Pathfinding uses the existing
 * authoritative obstacle list; service entities are NEVER added as obstacles.
 */
export function validateTownLayout(layout: unknown): TownLayoutError[] {
  const errors: TownLayoutError[] = [];
  const report = (code: TownLayoutErrorCode, entryId?: string): void => {
    errors.push(entryId === undefined ? { code } : { code, entryId });
  };
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
    report('invalidLayout');
    return errors;
  }

  const candidate = layout as Partial<TownLayout>;
  if (!Array.isArray(candidate.entries) || !Array.isArray(candidate.obstacles)
    || !('center' in candidate) || !('radius' in candidate) || !('spawn' in candidate)) {
    report('invalidLayout');
    return errors;
  }

  if (!finitePoint(candidate.center)
    || candidate.center.x !== CAMP.x || candidate.center.y !== CAMP.y
    || candidate.radius !== CAMP_RADIUS) {
    report('invalidCamp');
  }
  const safeSpawn = finitePoint(candidate.spawn) && isTownSafePoint(candidate.spawn);
  if (!safeSpawn) report('invalidSpawn');

  const obstaclesValid = candidate.obstacles.every(validObstacle);
  if (!obstaclesValid) report('invalidObstacle');

  if (safeSpawn && obstaclesValid
    && !canOccupy(candidate.spawn as Point, ACTOR_RADIUS, candidate.obstacles)) {
    report('invalidSpawn');
  }

  const counts = new Map<TownServiceRole, number>();
  const ids = new Set<string>();
  const validPositions: Array<{ id: string; role: TownServiceRole; position: Readonly<Point>; radius: number }> = [];
  const historic = new Map<string, { role: TownServiceRole; position: Readonly<Point> }>([
    [WARDEN_ID, { role: 'quest', position: NPC_POSITIONS[WARDEN_ID] }],
    [MERCHANT_ID, { role: 'weaponMerchant', position: NPC_POSITIONS[MERCHANT_ID] }],
    [BLACKSMITH_ID, { role: 'blacksmith', position: NPC_POSITIONS[BLACKSMITH_ID] }]
  ]);

  for (const unknownEntry of candidate.entries) {
    if (!unknownEntry || typeof unknownEntry !== 'object' || Array.isArray(unknownEntry)) {
      report('invalidEntry');
      continue;
    }
    const entry = unknownEntry as Partial<TownEntry>;
    const id = validId(entry.id) ? entry.id : undefined;
    if (id === undefined) report('invalidId');
    else {
      if (ids.has(id)) report('duplicateId', id);
      ids.add(id);
    }

    const role = ROLES.find(value => value === entry.role);
    if (!role) report('invalidRole', id);
    else counts.set(role, (counts.get(role) ?? 0) + 1);

    if (!finitePositive(entry.interactionRange) || entry.interactionRange > CAMP_RADIUS * 2) {
      report('invalidRange', id);
    }
    const validRadius = finitePositive(entry.collisionRadius)
      && entry.collisionRadius <= CAMP_RADIUS / 2;
    if (!validRadius) report('invalidRadius', id);

    if (typeof entry.nameKey !== 'string' || !TRANSLATION_KEY.test(entry.nameKey)
      || !entry.nameKey.endsWith('.name')
      || typeof entry.descriptionKey !== 'string' || !TRANSLATION_KEY.test(entry.descriptionKey)
      || !entry.descriptionKey.endsWith('.description')) {
      report('invalidKey', id);
    }

    const capability = CAPABILITIES.find(value => value === entry.capability);
    if (!capability || (role === 'civilian' && capability !== 'decorative')
      || (role && role !== 'civilian' && historic.has(id ?? '')
        && capability !== 'existing')
      || (role && role !== 'civilian' && !historic.has(id ?? '')
        && capability !== 'planned')) {
      report('invalidCapability', id);
    }

    if (!finitePoint(entry.position)) {
      report('invalidPosition', id);
      continue;
    }
    const position = entry.position;
    if (!validRadius) continue;
    const radius = entry.collisionRadius as number;
    if (position.x < ACTOR_RADIUS + radius || position.y < ACTOR_RADIUS + radius
      || position.x > WORLD_WIDTH - ACTOR_RADIUS - radius
      || position.y > WORLD_HEIGHT - ACTOR_RADIUS - radius) {
      report('outsideWorld', id);
    }
    if (length(position, CAMP) + radius > CAMP_RADIUS) {
      report('outsideSafeZone', id);
    }
    if (safeSpawn && length(position, candidate.spawn as Point) < ACTOR_RADIUS + radius + SPAWN_CLEARANCE) {
      report('spawnOverlap', id);
    }
    if (obstaclesValid) {
      if (!canOccupy(position, ACTOR_RADIUS + radius, candidate.obstacles)) {
        report('blockedPoint', id);
      } else if (safeSpawn
        && canOccupy(candidate.spawn as Point, ACTOR_RADIUS, candidate.obstacles)
        && findPath(candidate.spawn as Point, position, ACTOR_RADIUS, candidate.obstacles).length === 0) {
        report('unreachable', id);
      }
    }
    if (id !== undefined && role) {
      validPositions.push({ id, role, position, radius });
    }
  }

  for (const [id, original] of historic) {
    const entry = candidate.entries.find(value =>
      value !== null && typeof value === 'object' && (value as Partial<TownEntry>).id === id
    ) as Partial<TownEntry> | undefined;
    if (!entry) {
      report('missingLegacyNpc', id);
    } else {
      if (entry.role !== original.role) report('legacyRole', id);
      if (!finitePoint(entry.position) || entry.position.x !== original.position.x
        || entry.position.y !== original.position.y) {
        report('legacyPosition', id);
      }
      if (entry.interactionRange !== NPC_INTERACT_RANGE) report('legacyRange', id);
    }
  }

  for (const role of ROLES) {
    const count = counts.get(role) ?? 0;
    if (count < (role === 'civilian' ? 2 : 1)) report('missingRole');
    if (role !== 'civilian' && count > 1) report('duplicateRole');
  }

  for (let i = 0; i < validPositions.length; i++) {
    const left = validPositions[i]!;
    for (let j = i + 1; j < validPositions.length; j++) {
      const right = validPositions[j]!;
      if (length(left.position, right.position)
        < left.radius + right.radius + MIN_SEPARATION) {
        report('entryOverlap', left.id);
      }
    }
  }
  return errors;
}
