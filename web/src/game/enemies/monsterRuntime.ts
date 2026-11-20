/**
 * Reconcile Agent 14/15 family ability descriptors into one simulation-friendly
 * shape. No mutable cooldowns, AI side effects, Phaser or RNG live here.
 * GPL-3.0-only.
 */
import { getUndeadBeastMonster } from './families/undeadBeasts';
import { getBanditCultistMonster } from './families/banditsCultists';
import type { EnemyType, AttackPattern } from './enemies';
import type { StatusId } from '../status/statusDefinitions';

export interface MonsterAction {
  readonly id: string;
  readonly kind: 'damage' | 'heal' | 'buff' | 'debuff';
  readonly cooldown: number;
  readonly windup: number;
  readonly range: number;
  readonly damage: number;
  readonly attack: AttackPattern;
  readonly areaRadius?: number;
  readonly statusId?: StatusId;
  readonly statusDuration?: number;
  readonly statusMagnitude?: number;
  readonly buffType?: 'damageBonus' | 'damageReduction';
}

const STATUS: Readonly<Record<string, StatusId>> = Object.freeze({
  poison: 'poisoned', bleed: 'bleeding', slow: 'slowed'
});

/** Return fresh plain data so runtime never mutates source monster catalogs. */
export function monsterActions(type: EnemyType): readonly MonsterAction[] {
  const undead = getUndeadBeastMonster(type);
  if (undead) return undead.abilities.map(ability => ({
    id: ability.id,
    kind: 'damage' as const,
    cooldown: ability.cooldownSeconds,
    windup: ability.windupSeconds,
    range: ability.range,
    damage: undead.baseDamage * ability.damageMultiplier,
    attack: (ability.kind === 'projectile' ? 'bolt'
      : ability.kind === 'charge' || ability.kind === 'leap' ? 'leap'
      : 'sweep') as AttackPattern,
    ...(ability.areaRadius !== undefined ? { areaRadius: ability.areaRadius } : {}),
    ...(ability.statusEffectId ? { statusId: STATUS[ability.statusEffectId] } : {}),
    ...(ability.statusDurationSeconds !== undefined
      ? { statusDuration: ability.statusDurationSeconds } : {})
  }));

  const humanoid = getBanditCultistMonster(type);
  if (!humanoid) return [];
  return humanoid.abilities.map(ability => ({
    id: ability.id,
    kind: ability.kind,
    cooldown: ability.cooldown,
    windup: 0.8,
    range: ability.range,
    damage: ability.kind === 'damage' ? ability.amount
      : ability.kind === 'heal' ? ability.amount : 0,
    attack: (humanoid.archetypeId === 'charger' ? 'leap'
      : humanoid.attackStyle === 'ranged' || humanoid.attackStyle === 'magic'
        ? 'bolt' : 'sweep') as AttackPattern,
    ...(ability.kind === 'buff' ? {
      buffType: ability.effect,
      statusId: ability.effect === 'damageReduction' ? 'fortified' as const : 'haste' as const,
      statusDuration: ability.duration,
      statusMagnitude: ability.magnitude
    } : {}),
    ...(ability.kind === 'debuff' ? {
      statusId: 'slowed' as const,
      statusDuration: ability.duration,
      statusMagnitude: ability.magnitude
    } : {})
  }));
}

/** Strict ID lookup; cannot access prototypes, unknown types, or other families. */
export function monsterAction(type: EnemyType, id: unknown): MonsterAction | undefined {
  return typeof id === 'string' ? monsterActions(type).find(action => action.id === id) : undefined;
}
