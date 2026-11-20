/**
 * GPL-3.0-only. Corrupted Crypt theme manifest.
 * Asset/audio keys are integration requests, not bundled files.
 */
import type { Point } from '../core/types';
import type { EnemyType } from '../enemies/enemies';
import type { DungeonBounds, DungeonRoomType, ProceduralDungeonResult } from './proceduralDungeon';

export const CRYPT_THEME_ID = 'corrupted_crypt' as const;
export const MAX_CRYPT_PROPS_PER_ROOM = 4;
export const MAX_CRYPT_TRAPS_PER_ROOM = 3;

export type CryptLayerId = 'floor' | 'wall' | 'detail' | 'occlusion' | 'lighting';
export type CryptPropKind = 'urn' | 'gravestone' | 'sarcophagus' | 'coffin' |
  'lantern' | 'candelabrum' | 'ossuary' | 'eventRune' | 'treasureChest' |
  'spikeMarker' | 'poisonUrn' | 'runicSeal' | 'secretSeal';
export type CryptPropCapability = 'decorative' | 'breakable' | 'lootContainer' | 'trap' | 'secretReveal';
export type CryptTrapKind = 'spike' | 'poison' | 'runic';

export interface CryptPaintHint {
  readonly primitive: 'rectangle' | 'ellipse' | 'glyph' | 'radial';
  readonly color: number;
  readonly alpha: number;
}
export interface CryptLayer {
  readonly layer: CryptLayerId;
  readonly depth: number;
  readonly assetKey: string;
  readonly paletteKey: string;
  readonly materialKey: string;
  readonly fallback: CryptPaintHint;
}
export interface CryptRoomVisual {
  readonly roomId: string;
  readonly roomType: DungeonRoomType;
  readonly bounds: DungeonBounds;
  readonly initiallyVisible: boolean;
  readonly lighting: { readonly tint: number; readonly intensity: number };
  readonly layers: readonly CryptLayer[];
}
export interface CryptProp {
  readonly id: string;
  readonly roomId: string;
  readonly kind: CryptPropKind;
  readonly capability: CryptPropCapability;
  readonly position: Point;
  readonly footprintRadius: number;
  readonly assetKey: string;
  readonly depth: number;
  readonly fallback: CryptPaintHint;
  readonly onInteractHookId?: string;
}
export interface CryptInteractable {
  readonly id: string;
  readonly propId: string;
  readonly roomId: string;
  readonly capability: Exclude<CryptPropCapability, 'decorative'>;
  readonly position: Point;
  readonly hitRadius: number;
  readonly reach: number;
  readonly hookId: string;
  readonly eventKey: string;
  readonly requiresVisited: true;
  readonly oneShot: true;
  readonly initiallyVisible: boolean;
}
export interface CryptTrap {
  readonly id: string;
  readonly sourcePropId: string;
  readonly roomId: string;
  readonly kind: CryptTrapKind;
  readonly trigger: { readonly shape: 'circle'; readonly center: Point; readonly radius: number };
  readonly armingSeconds: number;
  readonly telegraphSeconds: number;
  readonly recoverySeconds: number;
  readonly damage: {
    readonly type: 'physical' | 'poison' | 'shadow';
    readonly maxBaseDamage: number;
    readonly statusId?: 'poison' | 'corruption';
    readonly maxDurationSeconds?: number;
  };
  readonly hookId: string;
  readonly requiresVisited: true;
  readonly oneShot: true;
}
export interface CryptEncounterHint {
  readonly id: string;
  readonly roomId: string;
  readonly enemyTypes: readonly EnemyType[];
  readonly maximumActors: number;
  readonly spawnPolicy: 'coordinator_authority';
}
export interface CryptAudioCue {
  readonly id: string;
  readonly roomId: string;
  readonly ambientCueKey: string;
  readonly intensity: number;
  readonly loop: boolean;
  readonly requiresDiscovery: boolean;
}
export interface CryptSecretHint {
  readonly id: string;
  readonly doorId: string;
  readonly fromRoomId: string;
  readonly anchor: Point;
  readonly revealHookId: string;
  readonly requiresVisited: true;
  readonly initiallyDiscovered: false;
}
export interface CryptThemePlan {
  readonly themeId: typeof CRYPT_THEME_ID;
  readonly seed: number;
  readonly roomVisuals: readonly CryptRoomVisual[];
  readonly props: readonly CryptProp[];
  readonly interactables: readonly CryptInteractable[];
  readonly traps: readonly CryptTrap[];
  readonly encounterHints: readonly CryptEncounterHint[];
  readonly audioCues: readonly CryptAudioCue[];
  readonly secretHints: readonly CryptSecretHint[];
  readonly validation: { readonly valid: true; readonly checkedPaths: number; readonly secretRoomCount: number };
}


import { ACTOR_RADIUS, canOccupy } from './navigation';
import { MAX_ROOMS, MAX_TILE_COUNT, validateProceduralDungeon, type DungeonRoom } from './proceduralDungeon';

interface Style {
  tint: number;
  glow: number;
  material: string;
  accent: string;
  intensity: number;
}
const STYLES: Readonly<Record<DungeonRoomType, Style>> = {
  entrance: { tint: 0x565c68, glow: 0xa1a5b1, material: 'entry_stone', accent: 'threshold', intensity: 0.68 },
  corridor: { tint: 0x343943, glow: 0x7a8195, material: 'sundered_flagstone', accent: 'bone_tracks', intensity: 0.42 },
  combat: { tint: 0x534347, glow: 0xb27f73, material: 'blood_mortar', accent: 'splintered_graves', intensity: 0.57 },
  elite: { tint: 0x4d3c59, glow: 0xa479cc, material: 'black_marble', accent: 'oath_sarcophagi', intensity: 0.65 },
  event: { tint: 0x3b5962, glow: 0x68c6bc, material: 'arcane_slate', accent: 'summoning_marks', intensity: 0.73 },
  treasure: { tint: 0x65513d, glow: 0xdfb968, material: 'gilded_ruins', accent: 'reliquary', intensity: 0.83 },
  trap: { tint: 0x534345, glow: 0xc27269, material: 'fractured_grate', accent: 'blood_sigils', intensity: 0.53 },
  secret: { tint: 0x2e4c44, glow: 0x65a18b, material: 'sealed_basalt', accent: 'forgotten_altar', intensity: 0.30 },
  boss: { tint: 0x493745, glow: 0xc47b95, material: 'royal_crypt', accent: 'broken_throne', intensity: 0.71 }
};

/** No prop is an actual obstacle. Every actionable prop is an idempotency proposal. */
const ROOM_PROPS: Readonly<Record<DungeonRoomType,
  readonly (readonly [CryptPropKind, CryptPropCapability])[]>> = {
  entrance: [['lantern', 'decorative'], ['gravestone', 'decorative']],
  corridor: [['coffin', 'decorative'], ['candelabrum', 'decorative']],
  combat: [['urn', 'breakable'], ['ossuary', 'decorative'], ['gravestone', 'decorative']],
  elite: [['sarcophagus', 'lootContainer'], ['gravestone', 'decorative'], ['candelabrum', 'decorative']],
  event: [['eventRune', 'lootContainer'], ['candelabrum', 'decorative'], ['ossuary', 'decorative']],
  treasure: [['treasureChest', 'lootContainer'], ['urn', 'breakable'],
    ['lantern', 'decorative'], ['sarcophagus', 'decorative']],
  trap: [['spikeMarker', 'trap'], ['poisonUrn', 'trap'], ['runicSeal', 'trap'],
    ['coffin', 'decorative']],
  secret: [['secretSeal', 'secretReveal'], ['treasureChest', 'lootContainer'],
    ['urn', 'breakable']],
  boss: [['sarcophagus', 'decorative'], ['ossuary', 'decorative'],
    ['lantern', 'decorative'], ['candelabrum', 'decorative']]
};

const UNDEAD: Partial<Record<DungeonRoomType, readonly EnemyType[]>> = {
  combat: ['skeleton', 'zombie'],
  elite: ['skeletonMage', 'wraith'],
  event: ['ghoul'],
  trap: ['skeleton'],
  secret: ['wraith'],
  boss: ['crypt_lord', 'skeleton']
};

const EVENT_KEYS: Partial<Record<CryptPropKind, string>> = {
  urn: 'crypt.break.urn',
  sarcophagus: 'crypt.open.sarcophagus',
  eventRune: 'crypt.event.rune',
  treasureChest: 'crypt.open.treasure',
  spikeMarker: 'crypt.trap.spike',
  poisonUrn: 'crypt.trap.poison',
  runicSeal: 'crypt.trap.runic',
  secretSeal: 'crypt.secret.reveal'
};
const TRAP_SPECS: Partial<Record<CryptPropKind, {
  kind: CryptTrapKind;
  damage: CryptTrap['damage'];
}>> = {
  spikeMarker: { kind: 'spike', damage: { type: 'physical', maxBaseDamage: 19 } },
  poisonUrn: { kind: 'poison', damage: { type: 'poison', maxBaseDamage: 12,
    statusId: 'poison', maxDurationSeconds: 3.5 } },
  runicSeal: { kind: 'runic', damage: { type: 'shadow', maxBaseDamage: 24,
    statusId: 'corruption', maxDurationSeconds: 2 } }
};

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const paint = (primitive: CryptPaintHint['primitive'], color: number, alpha: number): CryptPaintHint =>
  ({ primitive, color, alpha });

/** Independent per-room FNV-1a hash then bounded LCG. Does not use Math.random. */
function seededRoomRandom(seed: number, id: string): () => number {
  let state = (seed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < id.length; i += 1) {
    state = Math.imul(state ^ id.charCodeAt(i), 16777619) >>> 0;
  }
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Small set of room-edge placements; never obstruct a center/portal lane. */
function candidatePositions(room: DungeonRoom, rng: () => number): Point[] {
  const b = room.bounds;
  const left = b.x + 50, right = b.x + b.width - 50;
  const top = b.y + 50, bottom = b.y + b.height - 50;
  const points: Point[] = [
    { x: left, y: top }, { x: right, y: top },
    { x: right, y: bottom }, { x: left, y: bottom }
  ];
  for (let index = points.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [points[index], points[other]] = [points[other]!, points[index]!];
  }
  return points;
}

function safePosition(
  dungeon: Readonly<ProceduralDungeonResult>, room: DungeonRoom,
  point: Point, radius: number, used: readonly Point[]
): boolean {
  const b = room.bounds;
  const pad = ACTOR_RADIUS + radius;
  if (point.x <= b.x + pad || point.x >= b.x + b.width - pad
    || point.y <= b.y + pad || point.y >= b.y + b.height - pad
    || !canOccupy(point, pad, dungeon.obstacles)
    || used.some(other => distance(other, point) < pad * 2 + 10)) return false;

  const protectedSpawns: Point[] = [
    dungeon.playerSpawn, dungeon.exitPosition, dungeon.bossSpawn,
    ...dungeon.encounterSpawns.map(spawn => spawn.position),
    ...dungeon.rooms.filter(item => item.required).map(item => item.center)
  ];
  if (protectedSpawns.some(spawn => distance(point, spawn) < 75)) return false;

  // Legacy runtime may shift one retainer 30 units; keep a larger guard budget.
  if (dungeon.bossGuardSpawns.some(spawn => distance(point, spawn) < 115)) return false;
  if (dungeon.doors.some(door =>
    distance(point, door.portalA) < 72 || distance(point, door.portalB) < 72)) return false;
  return true;
}

function visual(room: DungeonRoom): CryptRoomVisual {
  const style = STYLES[room.type];
  const layers: CryptLayer[] = ([
    ['floor', 0, 'rectangle', 0.95],
    ['wall', 20, 'rectangle', 1],
    ['detail', 40, 'glyph', 0.85],
    ['occlusion', 80, 'ellipse', 0.8],
    ['lighting', 120, 'radial', 0.45]
  ] as const).map(([layer, depth, primitive, alpha]) => ({
    layer, depth,
    assetKey: 'crypt.' + room.type + '.' + layer,
    paletteKey: 'crypt.palette.' + room.type,
    materialKey: 'crypt.material.' + style.material,
    fallback: paint(primitive, layer === 'lighting' ? style.glow : style.tint, alpha)
  }));
  return {
    roomId: room.id, roomType: room.type, bounds: { ...room.bounds },
    initiallyVisible: room.type !== 'secret',
    lighting: { tint: style.glow, intensity: style.intensity },
    layers
  };
}

/** Only freeze new projection objects; never share/freeze dungeon references. */
function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Reject structural DoS and forged cached validations BEFORE generating props.
 * Canonical validation rechecks room IDs, all 1,925 tiles, obstacles and paths.
 */
function checkedDungeon(input: Readonly<ProceduralDungeonResult>): number {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype
    || !Array.isArray(input.rooms) || input.rooms.length < 8 || input.rooms.length > MAX_ROOMS
    || !Array.isArray(input.doors) || input.doors.length > MAX_ROOMS
    || !Array.isArray(input.tiles) || input.tiles.length !== MAX_TILE_COUNT
    || !Array.isArray(input.obstacles) || input.obstacles.length > MAX_TILE_COUNT
    || !Array.isArray(input.encounterSpawns) || input.encounterSpawns.length !== 2
    || !Array.isArray(input.bossGuardSpawns) || input.bossGuardSpawns.length !== 2
    || !input.validation || typeof input.validation !== 'object'
    || input.validation.valid !== true || !Array.isArray(input.validation.errors)
    || input.validation.errors.length !== 0
    || !Number.isSafeInteger(input.validation.checkedPaths)
    || input.rooms.some(room => room && typeof room === 'object'
      && ('props' in room || 'traps' in room || 'interactables' in room))
    || 'props' in input) throw new RangeError('Invalid Corrupted Crypt dungeon');
  let report;
  try {
    report = validateProceduralDungeon(input);
  } catch {
    throw new RangeError('Invalid Corrupted Crypt geometry');
  }
  if (!report.valid || report.checkedPaths !== input.validation.checkedPaths) {
    throw new RangeError('Corrupted Crypt validation mismatch');
  }
  return report.checkedPaths;
}

/**
 * Build an immutable serializable proposal, never execute its hooks.
 * Secret locations remain hidden; only the non-secret door portal is hinted.
 */
export function buildCryptTheme(dungeon: Readonly<ProceduralDungeonResult>): CryptThemePlan {
  const checkedPaths = checkedDungeon(dungeon);
  const roomVisuals: CryptRoomVisual[] = [];
  const props: CryptProp[] = [];
  const interactables: CryptInteractable[] = [];
  const traps: CryptTrap[] = [];
  const encounterHints: CryptEncounterHint[] = [];
  const audioCues: CryptAudioCue[] = [];
  const secretHints: CryptSecretHint[] = [];

  for (const room of dungeon.rooms) {
    roomVisuals.push(visual(room));
    const style = STYLES[room.type];
    const candidates = candidatePositions(room, seededRoomRandom(dungeon.seed, room.id));
    const used: Point[] = [];

    for (const [index, [kind, capability]] of ROOM_PROPS[room.type].entries()) {
      if (index >= MAX_CRYPT_PROPS_PER_ROOM) break;
      const footprintRadius = kind === 'sarcophagus' || kind === 'coffin' ? 16 : 12;
      const at = candidates.findIndex(point => safePosition(dungeon, room, point, footprintRadius, used));
      if (at < 0) continue;
      const [point] = candidates.splice(at, 1);
      if (!point) continue;
      used.push(point);
      const id = 'crypt/' + room.id + '/prop/' + index + '-' + kind;
      const hookId = capability === 'decorative' ? undefined : 'crypt.hook.interact/' + id;
      props.push({
        id, roomId: room.id, kind, capability,
        position: { ...point }, footprintRadius,
        assetKey: 'crypt.prop.' + kind, depth: 50,
        fallback: paint('glyph', style.glow, 0.85),
        ...(hookId ? { onInteractHookId: hookId } : {})
      });
      if (hookId && capability !== 'decorative') {
        interactables.push({
          id: 'crypt/' + room.id + '/interactable/' + index + '-' + kind,
          propId: id, roomId: room.id, capability,
          position: { ...point }, hitRadius: footprintRadius, reach: footprintRadius + 40,
          hookId, eventKey: EVENT_KEYS[kind] ?? 'crypt.interact.generic',
          requiresVisited: true, oneShot: true, initiallyVisible: room.type !== 'secret'
        });
      }

      const rule = TRAP_SPECS[kind];
      if (rule && traps.filter(trap => trap.roomId === room.id).length < MAX_CRYPT_TRAPS_PER_ROOM) {
        traps.push({
          id: 'crypt/' + room.id + '/trap/' + index + '-' + rule.kind,
          sourcePropId: id, roomId: room.id, kind: rule.kind,
          trigger: { shape: 'circle', center: { ...point }, radius: 24 },
          armingSeconds: 0.65, telegraphSeconds: 0.8, recoverySeconds: 1.6,
          damage: { ...rule.damage }, hookId: 'crypt.hook.trigger/' + id,
          requiresVisited: true, oneShot: true
        });
      }
    }

    const roster = UNDEAD[room.type];
    if (roster) {
      encounterHints.push({
        id: 'crypt/' + room.id + '/encounter', roomId: room.id,
        enemyTypes: [...roster], maximumActors: roster.length,
        spawnPolicy: 'coordinator_authority'
      });
    }
    audioCues.push({
      id: 'crypt/' + room.id + '/ambience', roomId: room.id,
      ambientCueKey: 'crypt.audio.' + room.type + '.' + style.accent,
      intensity: style.intensity, loop: true,
      requiresDiscovery: room.type === 'secret'
    });
  }

  for (const door of dungeon.doors) {
    if (door.kind !== 'hidden') continue;
    const firstRoom = dungeon.rooms.find(room => room.id === door.roomAId)!;
    const firstIsAccessible = firstRoom.type !== 'secret';
    secretHints.push({
      id: 'crypt/' + door.id + '/secret-hint', doorId: door.id,
      fromRoomId: firstIsAccessible ? door.roomAId : door.roomBId,
      anchor: { ...(firstIsAccessible ? door.portalA : door.portalB) },
      revealHookId: 'crypt.hook.reveal/' + door.id,
      requiresVisited: true, initiallyDiscovered: false
    });
  }

  if (dungeon.rooms.some(room => !props.some(prop => prop.roomId === room.id))) {
    throw new RangeError('No safe Corrupted Crypt decoration placement');
  }
  return freezeDeep({
    themeId: CRYPT_THEME_ID, seed: dungeon.seed, roomVisuals, props,
    interactables, traps, encounterHints, audioCues, secretHints,
    validation: {
      valid: true as const, checkedPaths,
      secretRoomCount: dungeon.rooms.filter(room => room.type === 'secret').length
    }
  });
}
