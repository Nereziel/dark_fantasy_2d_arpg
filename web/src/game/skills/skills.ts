import type { ClassId } from '../data/classes';
import type { SkillAimMode } from '../input/skillAiming';

/** Data-driven first active skills from the original six class kits.
 * Only the first two abilities per class are implemented in this slice.
 */
export type SkillSlot = 'rmb' | 'slot1';
export const SKILL_SLOTS: readonly SkillSlot[] = ['rmb', 'slot1'];
export type SkillKind = 'strike' | 'dash' | 'nova' | 'aura' | 'dot' | 'summon' | 'drain';
export type EffectId = 'stunned' | 'rooted' | 'chilled' | 'burning' | 'poisoned' | 'consecration' | 'skeleton';
export interface ActiveEffect {
  id: EffectId;
  remaining: number;
  magnitude: number;
  tick: number;
}
export interface SkillDefinition {
  id: string;
  icon: string;
  kind: SkillKind;
  target: 'enemy' | 'self';
  aimMode?: SkillAimMode;
  impactRadius?: number;
  cost: number;
  cooldown: number;
  range: number;
  power: number;
  color: number;
  duration?: number;
  effect?: EffectId;
}
export type Cooldowns = Record<SkillSlot, number>;
export type ActiveEffects = { player: ActiveEffect[]; enemy: ActiveEffect[] };
export const emptyCooldowns = (): Cooldowns => ({ rmb: 0, slot1: 0 });
export const emptyEffects = (): ActiveEffects => ({ player: [], enemy: [] });

export const SKILLS: Record<ClassId, Record<SkillSlot, SkillDefinition>> = {
  WARRIOR: {
    rmb: { id: 'cleave', icon: '⚔', kind: 'strike', target: 'enemy', cost: 15, cooldown: 2.5, range: 90, power: 1.65, color: 0xeab36c },
    slot1: { id: 'charge', icon: '➤', kind: 'dash', target: 'enemy', aimMode: 'DIRECTION', cost: 0, cooldown: 8, range: 245, power: 1.25, color: 0xebbb7c, duration: 1.5, effect: 'stunned' }
  },
  PALADIN: {
    rmb: { id: 'judgment', icon: '✦', kind: 'strike', target: 'enemy', cost: 20, cooldown: 3, range: 285, power: 1.85, color: 0xffd477 },
    slot1: { id: 'consecration', icon: '☼', kind: 'aura', target: 'self', cost: 30, cooldown: 11, range: 135, power: 0.7, color: 0xffe7a5, duration: 5, effect: 'consecration' }
  },
  MAGE: {
    rmb: { id: 'fireball', icon: '✹', kind: 'dot', target: 'enemy', aimMode: 'GROUND_POSITION', impactRadius: 66, cost: 25, cooldown: 3, range: 295, power: 1.4, color: 0xf68952, duration: 4, effect: 'burning' },
    slot1: { id: 'frostNova', icon: '❄', kind: 'nova', target: 'self', aimMode: 'AREA', impactRadius: 145, cost: 20, cooldown: 9, range: 145, power: 0.8, color: 0x7bd9fc, duration: 2.6, effect: 'chilled' }
  },
  ROGUE: {
    rmb: { id: 'shadowDash', icon: '➳', kind: 'dash', target: 'enemy', aimMode: 'DIRECTION', cost: 20, cooldown: 6, range: 250, power: 1.7, color: 0xa7a1f3 },
    slot1: { id: 'poisonBlade', icon: '♧', kind: 'dot', target: 'enemy', cost: 25, cooldown: 7, range: 95, power: 1.15, color: 0x81d37f, duration: 5, effect: 'poisoned' }
  },
  NECROMANCER: {
    rmb: { id: 'boneSpear', icon: '➶', kind: 'strike', target: 'enemy', cost: 25, cooldown: 3, range: 300, power: 1.75, color: 0xb0e5d4 },
    slot1: { id: 'raiseSkeleton', icon: '☠', kind: 'summon', target: 'self', cost: 20, cooldown: 10, range: 280, power: 0.7, color: 0x8be0c9, duration: 13, effect: 'skeleton' }
  },
  WARLOCK: {
    rmb: { id: 'lifeDrain', icon: '◈', kind: 'drain', target: 'enemy', cost: 15, cooldown: 3, range: 275, power: 1.2, color: 0xb17bcb },
    slot1: { id: 'soulBurn', icon: '♨', kind: 'dot', target: 'enemy', cost: 20, cooldown: 7, range: 275, power: 0.95, color: 0xdb6fbc, duration: 5, effect: 'burning' }
  }
};
export function isSkillSlot(value: unknown): value is SkillSlot {
  return value === 'rmb' || value === 'slot1';
}
export function isActiveEffect(value: unknown): value is ActiveEffect {
  if (!value || typeof value !== 'object') return false;
  const e = value as Partial<ActiveEffect>;
  return ['stunned', 'rooted', 'chilled', 'burning', 'poisoned', 'consecration', 'skeleton'].includes(String(e.id))
    && typeof e.remaining === 'number' && Number.isFinite(e.remaining) && e.remaining > 0 && e.remaining <= 120
    && typeof e.magnitude === 'number' && Number.isFinite(e.magnitude) && e.magnitude >= 0 && e.magnitude <= 10000
    && typeof e.tick === 'number' && Number.isFinite(e.tick) && e.tick >= 0 && e.tick < 2;
}
