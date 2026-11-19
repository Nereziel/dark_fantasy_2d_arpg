/**
 * Pure, deterministic typed-damage preparation for Prompt 06.
 * This module intentionally has no actor/world side effects. The combat
 * integrator owns health updates and observable hit events.
 */
import { mitigateDamage } from './damage';

export type DamageType =
  | 'physical' | 'fire' | 'frost' | 'lightning'
  | 'poison' | 'holy' | 'shadow' | 'arcane';

/** Compatible with SeededRng without importing any game state. */
export type RandomSource = { next(): number };

export type DamageRequest = {
  type: DamageType;
  base: number;
  multiplier?: number;
  critChance?: number;
  critMultiplier?: number;
  defenderArmor?: number;
  defenderLevel?: number;
  resistancePercent?: number;
  dodgeChance?: number;
  blockChance?: number;
  blockReduction?: number;
  shield?: number;
};

export type DamageResult = {
  /** Damage reaching health after all mitigation and shield absorption. */
  damage: number;
  /** Damage absorbed by the shield, not by armor, resistance, or block. */
  absorbed: number;
  shieldRemaining: number;
  critical: boolean;
  dodged: boolean;
  blocked: boolean;
};

/** Invalid inputs use defaults; negative finite quantities become zero. */
function nonNegative(value: number | undefined, fallback = 0): number {
  return value === undefined || !Number.isFinite(value)
    ? fallback
    : Math.max(0, Math.min(value, Number.MAX_SAFE_INTEGER));
}

function range(value: number | undefined, upper: number, fallback: number): number {
  return Math.min(upper, nonNegative(value, fallback));
}

/** Intermediate arithmetic may overflow even if both operands are finite. */
function boundedDamage(value: number): number {
  if (Number.isNaN(value) || value <= 0) return 0;
  return Math.min(value, Number.MAX_SAFE_INTEGER);
}

/** Exact 0% and 100% chances are independent of RNG endpoints. */
function succeeds(chance: number, roll: number): boolean {
  return chance >= 100 || (
    chance > 0 && Number.isFinite(roll) && roll >= 0 && roll < 1
    && roll < chance / 100
  );
}

/**
 * Order: base × multiplier → crit → physical armor → resistance (all types)
 * → block → round → shield. Every hit consumes exactly three RNG values,
 * in dodge/critical/block order, including a dodged or zero-damage attempt.
 * No request data or actor state is mutated.
 */
export function resolveTypedDamage(
  request: Readonly<DamageRequest>, rng: RandomSource
): DamageResult {
  const dodgeRoll = rng.next();
  const critRoll = rng.next();
  const blockRoll = rng.next();

  const shield = nonNegative(request.shield);
  const dodged = succeeds(range(request.dodgeChance, 100, 0), dodgeRoll);
  if (dodged) {
    return {
      damage: 0, absorbed: 0, shieldRemaining: shield,
      critical: false, dodged: true, blocked: false
    };
  }

  const critical = succeeds(range(request.critChance, 100, 0), critRoll);
  const blocked = succeeds(range(request.blockChance, 100, 0), blockRoll);

  let raw = boundedDamage(nonNegative(request.base) * nonNegative(request.multiplier, 1));
  if (critical) raw = boundedDamage(raw * nonNegative(request.critMultiplier, 1.7));
  if (request.type === 'physical') {
    raw = mitigateDamage(raw, nonNegative(request.defenderArmor), Math.max(1, nonNegative(request.defenderLevel, 1)));
  }
  raw = boundedDamage(raw * (1 - range(request.resistancePercent, 100, 0) / 100));
  if (blocked) raw = boundedDamage(raw * (1 - range(request.blockReduction, 1, 0.5)));

  const rounded = Math.round(raw);
  const absorbed = Math.min(rounded, shield);
  return {
    damage: rounded - absorbed,
    absorbed,
    shieldRemaining: shield - absorbed,
    critical,
    dodged: false,
    blocked
  };
}

/** Pure capped heal; source state and maximum health remain unchanged. */
export function resolveHealing(
  currentHealth: number, maxHealth: number, amount: number
): { health: number; healed: number } {
  const max = nonNegative(maxHealth);
  const current = Math.min(nonNegative(currentHealth), max);
  const healed = Math.min(nonNegative(amount), max - current);
  return { health: current + healed, healed };
}
