import type { ClassId } from '../data/classes';
import type { DerivedStats, SeededRng } from '../data/items';

export function mitigateDamage(raw: number, armor: number, level: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const defence = Math.max(0, armor);
  return Math.max(1, Math.round(raw * (1 - defence / (defence + 50 * Math.max(1, level)))));
}
export function rollAttackDamage(
  classId: ClassId, stats: DerivedStats, rng: SeededRng,
  power = 1, defenderArmor = 0, level = 1
): { damage: number; critical: boolean } {
  const rolled = stats.damageMin + rng.next() * (stats.damageMax - stats.damageMin);
  const critical = rng.next() < stats.critChance / 100;
  const offensiveStat = ['MAGE', 'NECROMANCER', 'WARLOCK'].includes(classId)
    ? stats.intelligence : stats.strength;
  const raw = rolled * (1 + offensiveStat * 0.035) * Math.max(0, power) * (critical ? 1.7 : 1);
  return { damage: mitigateDamage(raw, defenderArmor, level), critical };
}
