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

export function buildCryptTheme(_dungeon: Readonly<ProceduralDungeonResult>): CryptThemePlan {
  throw new RangeError('Corrupted Crypt theme not implemented');
}
