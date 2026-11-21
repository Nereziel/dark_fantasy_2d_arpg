/**
 * Issue #128 — presentation-only enemy roster ordering.
 * Dangerous targets must not be hidden below ordinary enemies in a narrow
 * scrollable HUD. Never alter simulation order, targeting or attack priority.
 * GPL-3.0-only.
 */
export interface CombatRosterUnit {
  readonly actor: Readonly<{ id: string; alive: boolean }>;
  readonly elite?: unknown;
}

/** Bosses and active minibosses first, then elites, then the current target.
 * Dead actors always come last; ties preserve the simulation's roster order.
 */
export function prioritizeCombatRoster<T extends CombatRosterUnit>(
  units: readonly T[],
  miniBossStates: Readonly<Record<string, unknown>> | null | undefined,
  targetId: string | null
): T[] {
  const priority = (unit: T): number => {
    if (!unit.actor.alive) return 4;
    if (unit.actor.id === 'crypt_lord-4'
      || (miniBossStates !== null && miniBossStates !== undefined
        && Object.prototype.hasOwnProperty.call(miniBossStates, unit.actor.id))) return 0;
    if (unit.elite) return 1;
    if (unit.actor.id === targetId) return 2;
    return 3;
  };
  return units.map((unit, index) => ({ unit, index, rank: priority(unit) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(entry => entry.unit);
}
