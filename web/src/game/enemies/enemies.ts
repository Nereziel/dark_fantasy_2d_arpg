import type { ActorSnapshot, Point } from '../core/types';
import type { ActiveEffect } from '../skills/skills';
import { UNDEAD_BEAST_MONSTERS, getUndeadBeastMonster, type UndeadBeastMonsterId } from './families/undeadBeasts';
import { BANDIT_CULTIST_MONSTERS, getBanditCultistMonster, type BanditCultistMonsterId } from './families/banditsCultists';
import type { EnemyBehaviorId } from './behaviorPlanner';
import type { EliteModifierId, EliteVisualTag } from './eliteModifiers';

/** All enemy movement and attack decisions stay in the TypeScript simulation. */
export type EnemyType = 'wraith' | 'crypt_lord' | UndeadBeastMonsterId | BanditCultistMonsterId;
export type AttackPattern = 'bolt' | 'sweep' | 'leap';

export interface EnemyDefinition {
  id: EnemyType;
  attack: AttackPattern;
  color: number;
  health: number;
  speed: number;
  aggro: number;
  preferredRange: number;
  attackRange: number;
  dangerRadius: number;
  windup: number;
  cooldown: number;
  baseDamage: number;
}

const LEGACY_ENEMIES: Record<'wraith' | 'skeleton' | 'wolf' | 'crypt_lord', EnemyDefinition> = {
  wraith: {
    id: 'wraith', attack: 'bolt', color: 0x9c83bf,
    health: 72, speed: 70, aggro: 330, preferredRange: 174,
    attackRange: 260, dangerRadius: 45, windup: 1.15, cooldown: 2.5,
    baseDamage: 11
  },
  skeleton: {
    id: 'skeleton', attack: 'sweep', color: 0xbcb6a4,
    health: 100, speed: 82, aggro: 320, preferredRange: 58,
    attackRange: 76, dangerRadius: 80, windup: 0.78, cooldown: 2.15,
    baseDamage: 15
  },
  wolf: {
    id: 'wolf', attack: 'leap', color: 0xb07e68,
    health: 82, speed: 138, aggro: 380, preferredRange: 122,
    attackRange: 190, dangerRadius: 60, windup: 0.95, cooldown: 3.1,
    baseDamage: 13
  },
  crypt_lord: {
    id: 'crypt_lord', attack: 'sweep', color: 0xc88364,
    health: 395, speed: 96, aggro: 480, preferredRange: 82,
    attackRange: 132, dangerRadius: 122, windup: 1.35, cooldown: 2.35,
    baseDamage: 29
  }
};


/**
 * Turn Wave B family catalogs into the existing numeric combat contract.
 * The first two wave rosters and crypt encounters retain their original values.
 * Archetype policies are applied by GameSimulation, not by these definitions.
 */
const FAMILY_MONSTERS = [...UNDEAD_BEAST_MONSTERS, ...BANDIT_CULTIST_MONSTERS];
const FAMILY_DEFINITIONS = Object.fromEntries(FAMILY_MONSTERS
  .filter(monster => monster.id !== 'skeleton' && monster.id !== 'wolf')
  .map(monster => {
    const first = monster.abilities[0];
    const melee = monster.archetypeId === 'meleeAggressor'
      || monster.archetypeId === 'defensive' || monster.archetypeId === 'ambusher';
    const charger = monster.archetypeId === 'charger';
    const attack: AttackPattern = charger ? 'leap' : melee ? 'sweep' : 'bolt';
    const windup = first && 'windupSeconds' in first ? first.windupSeconds : 0.9;
    const cooldown = first && 'cooldownSeconds' in first ? first.cooldownSeconds
      : first && 'cooldown' in first ? first.cooldown : 2.8;
    const color = monster.family === 'undead' ? 0xc3c2ab
      : monster.family === 'beast' ? 0xa88469
      : monster.family === 'bandit' ? 0xb2947c : 0x9e85bb;
    return [monster.id, {
      id: monster.id, attack, color,
      health: monster.health, speed: monster.speed, aggro: monster.aggroRange,
      preferredRange: monster.preferredDistance, attackRange: monster.attackRange,
      dangerRadius: attack === 'sweep' ? 82 : attack === 'leap' ? 64 : 48,
      windup: Math.max(0.6, windup), cooldown, baseDamage: monster.baseDamage
    }];
  })) as Record<Exclude<EnemyType, 'wraith' | 'skeleton' | 'wolf' | 'crypt_lord'>, EnemyDefinition>;

export const ENEMY_DEFINITIONS: Record<EnemyType, EnemyDefinition> = {
  ...LEGACY_ENEMIES,
  ...FAMILY_DEFINITIONS
};

export function enemyArchetype(type: EnemyType): EnemyBehaviorId {
  if (type === 'wraith') return 'rangedAttacker';
  if (type === 'crypt_lord') return 'defensive';
  return getUndeadBeastMonster(type)?.archetypeId
    ?? getBanditCultistMonster(type)?.archetypeId ?? 'meleeAggressor';
}

/** Deterministic three-enemy rosters. Tutorial and wave one remain unchanged. */
export function packTypesForWave(wave: number): readonly EnemyType[] {
  if (wave < 2 || !Number.isSafeInteger(wave)) return ['wraith', 'skeleton', 'wolf'];
  const rosters: readonly (readonly EnemyType[])[] = [
    ['skeletonArcher', 'ghoul', 'zombie'],
    ['spider', 'corruptedBoar', 'skeletonMage'],
    ['banditFighter', 'banditArcher', 'banditRogue'],
    ['fanatic', 'cultMage', 'cultHealer']
  ];
  return rosters[(wave - 2) % rosters.length]!;
}

export interface EnemySnapshot extends ActorSnapshot {
  type: EnemyType;
  /** Spawn scaling level; optional only for pre-existing transient snapshots. */
  level?: number;
}

export interface EnemyIntent extends Point {
  pattern: AttackPattern;
  radius: number;
  remaining: number;
  total: number;
  /** Optional archetype-specific action; validated against the monster's catalog. */
  abilityId?: string;
}

export interface EliteRuntime {
  modifiers: EliteModifierId[];
  visualTags: EliteVisualTag[];
  shield: number;
  damageMultiplier: number;
  speedMultiplier: number;
  elapsedSeconds: number;
  deathTriggered: boolean;
}

export interface EnemyUnit {
  actor: EnemySnapshot;
  elite?: EliteRuntime;
  summoned?: boolean;
  intent: EnemyIntent | null;
  cooldown: number;
  effects: ActiveEffect[];
  /** Independent per-ability timers, measured in simulation seconds. */
  abilityCooldowns?: Record<string, number>;
}
export const PACK_SIZE = 3;
const PACK_POSITIONS: readonly Point[] = [
  { x: 780, y: 520 },
  { x: 910, y: 635 },
  { x: 1050, y: 535 }
];

/** Three enemies simultaneously; IDs remain unique across successive waves. */
export function createPack(wave: number, level: number, positions: readonly Point[] = PACK_POSITIONS): EnemyUnit[] {
  const types = packTypesForWave(wave);
  return types.map((type, index) => {
    const def = ENEMY_DEFINITIONS[type];
    const pos = positions[index]!;
    const hp = def.health + Math.max(0, level - 1) * 12;
    return {
      actor: {
        id: `${type}-${wave * PACK_SIZE + index + 1}`,
        type, level, x: pos.x, y: pos.y + (wave % 2) * 25,
        health: hp, maxHealth: hp, alive: true
      },
      intent: null, cooldown: 0.35 + index * 0.3, effects: [], abilityCooldowns: {}
    };
  });
}

/** A complete, quest-specific boar encounter, without changing ordinary wave
 * rosters or unique enemy IDs. Every spawn uses the already-validated canonical
 * encounter positions and retains the standard cooldown/XP/drop pipeline.
 */
export function createBlightedPack(
  wave: number, level: number, positions: readonly Point[] = PACK_POSITIONS
): EnemyUnit[] {
  const definition = ENEMY_DEFINITIONS.corruptedBoar;
  const health = definition.health + Math.max(0, level - 1) * 12;
  return createPack(wave, level, positions).map((unit, index) => ({
    ...unit,
    actor: {
      ...unit.actor, id: `corruptedBoar-${wave * PACK_SIZE + index + 1}`,
      type: 'corruptedBoar', health, maxHealth: health
    }
  }));
}

/**
 * Crypt has a guard encounter followed by a boss and two retainers.
 * IDs match the normal per-wave contract, but the boss is unique to the crypt.
 */
export function createCryptPack(stage: 0 | 1, level: number, positions: readonly Point[]): EnemyUnit[] {
  const types: readonly EnemyType[] = stage === 0
    ? ['skeleton', 'wolf', 'wraith']
    : ['crypt_lord', 'skeleton', 'wraith'];
  return types.map((type, index) => {
    const def = ENEMY_DEFINITIONS[type];
    const point = positions[index]!;
    const health = Math.round(def.health * (type === 'crypt_lord' ? 1.15 : 1.35)
      + Math.max(0, level - 1) * (type === 'crypt_lord' ? 32 : 18));
    return {
      actor: {
        id: `${type}-${stage * PACK_SIZE + index + 1}`,
        type, level, x: point.x, y: point.y,
        health, maxHealth: health, alive: true
      },
      intent: null, cooldown: 0.65 + index * 0.3, effects: [], abilityCooldowns: {}
    };
  });
}

const ENCOUNTERS: readonly EnemyType[] = ['wraith', 'skeleton', 'wolf'];
export function encounterType(kills: number): EnemyType {
  return ENCOUNTERS[Math.abs(Math.floor(kills)) % ENCOUNTERS.length]!;
}
export function createEncounter(kills: number, level: number): EnemySnapshot {
  const type = encounterType(kills);
  const def = ENEMY_DEFINITIONS[type];
  const x = 780 + (kills % 3) * 65;
  const y = 520 + (kills % 2) * 65;
  const health = def.health + Math.max(0, level - 1) * 12;
  return {
    id: `${type}-${kills + 1}`, type, level, x, y,
    health, maxHealth: health, alive: true
  };
}
export function validEnemyType(value: unknown): value is EnemyType {
  return typeof value === 'string' && Object.hasOwn(ENEMY_DEFINITIONS, value);
}
export function validIntent(value: unknown): value is EnemyIntent | null {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const intent = value as Partial<EnemyIntent>;
  return ['bolt', 'sweep', 'leap'].includes(String(intent.pattern))
    && [intent.x, intent.y, intent.radius, intent.remaining, intent.total]
      .every(x => typeof x === 'number' && Number.isFinite(x))
    && intent.x! >= 0 && intent.x! <= 2200
    && intent.y! >= 0 && intent.y! <= 1400
    && intent.radius! >= 1 && intent.radius! <= 300
    && intent.remaining! > 0 && intent.remaining! <= 5
    && intent.total! >= intent.remaining! && intent.total! <= 5
    && (intent.abilityId === undefined
      || (typeof intent.abilityId === 'string' && /^[A-Za-z][A-Za-z0-9]{0,80}$/.test(intent.abilityId)));
}
