import type { ActiveEffect } from '../skills/skills';

/** Immutable, deterministic reapplication with refresh-and-max stacking. */
export function applyOrRefreshEffect(
  effects: readonly ActiveEffect[], incoming: ActiveEffect
): ActiveEffect[] {
  const existing = effects.find(effect => effect.id === incoming.id);
  if (!existing) return [...effects.map(effect => ({ ...effect })), { ...incoming }];
  return effects.map(effect => effect.id === incoming.id
    ? {
      ...effect,
      remaining: Math.max(effect.remaining, incoming.remaining),
      magnitude: Math.max(effect.magnitude, incoming.magnitude),
      tick: 0
    }
    : { ...effect });
}
