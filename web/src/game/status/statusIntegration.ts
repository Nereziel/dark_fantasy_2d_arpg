/**
 * Canonical status adapter shared by simulation and legacy HUD projections.
 * Damage and healing ticks are resolved only by statusRuntime; legacy ActiveEffect
 * structs remain read-only compatibility snapshots for the first class kits.
 * Original project code: GPL-3.0-only.
 */
import { STATUS_DEFINITIONS, getStatusDefinition, type StatusId } from './statusDefinitions';
import type { StatusInstance, StatusRule } from './statusRuntime';
import type { ActiveEffect, EffectId } from '../skills/skills';
import type { EnemyType } from '../enemies/enemies';

const LEGACY_STATUS_IDS: ReadonlySet<string> = new Set([
  'burning', 'chilled', 'poisoned', 'stunned', 'rooted'
]);

export function isLegacyStatus(id: unknown): id is StatusId & EffectId {
  return typeof id === 'string' && LEGACY_STATUS_IDS.has(id);
}

export function statusRule(
  id: StatusId, magnitude?: number, duration?: number
): StatusRule {
  const def = STATUS_DEFINITIONS[id];
  const potency = magnitude === undefined ? def.magnitude : magnitude;
  return {
    id, duration: duration ?? def.duration,
    magnitude: potency,
    stacking: def.stackMode === 'stack' ? 'add' : 'replace',
    maxStacks: def.maxStacks,
    tickInterval: def.tickInterval ?? undefined,
    dispelCategory: def.dispelCategory,
    immunityTags: def.immunityGroup ? [def.immunityGroup] : [],
    visualHook: def.visualHook,
    modifiers: def.modifierKind === 'movementSpeed' ? { moveSpeed: -1 }
      : def.modifierKind === 'speedBoost' ? { moveSpeed: 1 }
      : def.modifierKind === 'damageTaken' ? { damageTaken: 1 }
      : def.modifierKind === 'damageReduction' ? { damageReduction: 1 }
      : def.modifierKind === 'damageDealt' ? { damageDealt: -1 }
      : {}
  };
}

export function legacyStatusView(status: StatusInstance): ActiveEffect | null {
  if (!isLegacyStatus(status.id)) return null;
  return {
    id: status.id,
    remaining: status.remaining,
    magnitude: status.magnitude * status.stacks,
    tick: status.tickElapsed
  };
}

/** Immutable presentation compatibility, without a parallel damage timer. */
export function mergedLegacyEffects(
  passive: readonly ActiveEffect[], active: readonly StatusInstance[]
): ActiveEffect[] {
  return [
    ...passive.filter(effect => !isLegacyStatus(effect.id)).map(effect => ({ ...effect })),
    ...active.map(legacyStatusView).filter((effect): effect is ActiveEffect => effect !== null)
  ];
}

/** Known monster resistances are applied before any stack or duration mutation. */
export function monsterStatusImmunities(type: EnemyType): readonly string[] {
  if (type === 'crypt_lord') return ['hardControl', 'movementControl'];
  if (type === 'spider') return ['poisoned'];
  if (type === 'skeleton' || type === 'skeletonArcher' || type === 'skeletonMage') {
    return ['bleeding'];
  }
  return [];
}

export function knownStatus(id: unknown): id is StatusId {
  return getStatusDefinition(id) !== undefined;
}
