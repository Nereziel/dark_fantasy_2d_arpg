/**
 * Prompt 40 / Agent 34 — isolated Mage spell and talent descriptors.
 * No world state, damage application, RNG, Phaser, UI or save mutations live here.
 * GameSimulation must validate the final cast, charge Mana and apply the plans.
 * GPL-3.0-only.
 */
import { resolveSkillAim } from '../input/skillAiming';
import type { SkillAim } from '../input/skillAiming';

export type MageElement = 'fire' | 'frost' | 'lightning' | 'arcane';
export type MageSpellKind = 'projectile' | 'area' | 'mobility' | 'barrier';
export type MageSpellStatus = 'burning' | 'chilled' | 'stunned' | null;

export const MAGE_EXTRA_IDS = Object.freeze([
  'chainLightning', 'meteor', 'teleport', 'arcaneBarrier', 'blizzard'
] as const);
export type MageExtraSpellId = (typeof MAGE_EXTRA_IDS)[number];

export interface MageSpell {
  readonly id: MageExtraSpellId;
  readonly element: MageElement;
  readonly kind: MageSpellKind;
  readonly icon: string;
  readonly color: number;
  readonly aimMode: 'TARGET_ENTITY' | 'GROUND_POSITION' | 'SELF';
  readonly cost: number;
  readonly cooldown: number;
  readonly range: number;
  readonly power: number;
  readonly radius: number;
  readonly status: MageSpellStatus;
  readonly duration: number;
  readonly bounceCount?: number;
  readonly bounceRange?: number;
  readonly impactDelay?: number;
  readonly tickInterval?: number;
  readonly shieldRatio?: number;
}

/** These five spells complement, not replace, SKILLS.MAGE Fireball and Frost Nova. */
export const MAGE_EXTRA_SPELLS: Readonly<Record<MageExtraSpellId, Readonly<MageSpell>>> =
  Object.freeze({
    chainLightning: Object.freeze({
      id: 'chainLightning', element: 'lightning', kind: 'projectile',
      icon: 'ϟ', color: 0xb0ddff, aimMode: 'TARGET_ENTITY',
      cost: 30, cooldown: 7, range: 310, power: 1.25, radius: 0,
      status: 'stunned', duration: 0.55, bounceCount: 3, bounceRange: 165
    }),
    meteor: Object.freeze({
      id: 'meteor', element: 'fire', kind: 'area',
      icon: '☄', color: 0xff8750, aimMode: 'GROUND_POSITION',
      cost: 40, cooldown: 16, range: 335, power: 2.7, radius: 142,
      status: 'burning', duration: 4, impactDelay: 0.85
    }),
    teleport: Object.freeze({
      id: 'teleport', element: 'arcane', kind: 'mobility',
      icon: '◇', color: 0xab89f0, aimMode: 'GROUND_POSITION',
      cost: 23, cooldown: 10, range: 270, power: 0, radius: 0,
      status: null, duration: 0
    }),
    arcaneBarrier: Object.freeze({
      id: 'arcaneBarrier', element: 'arcane', kind: 'barrier',
      icon: '⬡', color: 0xb4a3ff, aimMode: 'SELF',
      cost: 28, cooldown: 18, range: 0, power: 0, radius: 0,
      status: null, duration: 6, shieldRatio: 0.25
    }),
    blizzard: Object.freeze({
      id: 'blizzard', element: 'frost', kind: 'area',
      icon: '❄', color: 0x8dddfa, aimMode: 'GROUND_POSITION',
      cost: 42, cooldown: 18, range: 320, power: 0.48, radius: 165,
      status: 'chilled', duration: 6, tickInterval: 0.75
    })
  } satisfies Record<MageExtraSpellId, MageSpell>);

export type MageCooldowns = Partial<Record<MageExtraSpellId, number>>;
interface Point { readonly x: number; readonly y: number }
interface Bounds { readonly width: number; readonly height: number }
export interface MageCastContext {
  readonly mana: number;
  readonly cooldowns: MageCooldowns;
  readonly origin: Point;
  /** World-space mouse coordinate for ground spells. */
  readonly cursor: Point | null;
  /** Enemy identity and position must come from authoritative simulation. */
  readonly targetId: string | null;
  readonly targetPosition: Point | null;
  readonly targetAlive: boolean;
  /** Must be computed by canonical navigation/collision, not supplied by UI. */
  readonly destinationWalkable: boolean;
  readonly bounds: Bounds;
}

export type MageCastDecision =
  | {
      readonly ok: true;
      readonly spell: Readonly<MageSpell>;
      readonly aim: SkillAim;
      readonly manaAfter: number;
      readonly cooldowns: MageCooldowns;
    }
  | { readonly ok: false; readonly reason: 'invalid' | 'cooldown' | 'mana' | 'target' | 'aim' | 'range' | 'blocked' };

const own = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key);
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isPoint(value: unknown): value is Point {
  return isRecord(value) && typeof value.x === 'number'
    && typeof value.y === 'number' && Number.isFinite(value.x) && Number.isFinite(value.y);
}
function isBounds(value: unknown): value is Bounds {
  return isRecord(value) && typeof value.width === 'number'
    && typeof value.height === 'number' && Number.isFinite(value.width)
    && Number.isFinite(value.height) && value.width > 0 && value.height > 0
    && value.width <= 10000 && value.height <= 10000;
}
function within(point: Point, bounds: Bounds): boolean {
  return point.x >= 0 && point.y >= 0 && point.x <= bounds.width && point.y <= bounds.height;
}
function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Any forged ID including prototype names is rejected. */
export function getMageSpell(id: unknown): Readonly<MageSpell> | null {
  return typeof id === 'string' && own(MAGE_EXTRA_SPELLS, id)
    ? MAGE_EXTRA_SPELLS[id as MageExtraSpellId] : null;
}

/** Session-only cooldown ledger; fail closed rather than reset on corrupt input. */
export function validMageCooldowns(value: unknown): value is MageCooldowns {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= MAGE_EXTRA_IDS.length
    && entries.every(([id, time]) => getMageSpell(id) !== null
      && typeof time === 'number' && Number.isFinite(time)
      && time >= 0 && time <= 360);
}

export function advanceMageCooldowns(value: unknown, deltaSeconds: unknown): MageCooldowns | null {
  if (!validMageCooldowns(value) || typeof deltaSeconds !== 'number'
    || !Number.isFinite(deltaSeconds) || deltaSeconds < 0) return null;
  return Object.fromEntries(Object.entries(value).map(([id, time]) =>
    [id, Math.max(0, time - deltaSeconds)])) as MageCooldowns;
}

/**
 * Authoritative cast preflight. This is a pure plan, never an application.
 * The integrator must perform hit-frame damage/status, teleport path validation
 * and atomic Mana/cooldown commitment inside GameSimulation.
 */
export function planMageCast(id: unknown, input: unknown): MageCastDecision {
  const spell = getMageSpell(id);
  if (!spell || !isRecord(input)) return { ok: false, reason: 'invalid' };
  const ctx = input as Partial<MageCastContext>;
  if (typeof ctx.mana !== 'number' || !Number.isFinite(ctx.mana)
    || ctx.mana < 0 || ctx.mana > 10000
    || !validMageCooldowns(ctx.cooldowns)
    || !isPoint(ctx.origin) || !isBounds(ctx.bounds)
    || !within(ctx.origin, ctx.bounds)) return { ok: false, reason: 'invalid' };
  if ((ctx.cooldowns[spell.id] ?? 0) > 0.0001) return { ok: false, reason: 'cooldown' };
  if (ctx.mana + 0.0001 < spell.cost) return { ok: false, reason: 'mana' };

  let aim: SkillAim | null = null;
  if (spell.aimMode === 'SELF') {
    aim = resolveSkillAim('SELF', ctx.origin, null, null);
  } else if (spell.aimMode === 'TARGET_ENTITY') {
    if (ctx.targetAlive !== true || !isPoint(ctx.targetPosition)
      || !within(ctx.targetPosition, ctx.bounds)
      || typeof ctx.targetId !== 'string' || !ctx.targetId.trim()
      || ctx.targetId.length > 128) return { ok: false, reason: 'target' };
    if (distance(ctx.origin, ctx.targetPosition) > spell.range)
      return { ok: false, reason: 'range' };
    aim = resolveSkillAim('TARGET_ENTITY', ctx.origin, null, ctx.targetId);
  } else {
    if (!isPoint(ctx.cursor) || !within(ctx.cursor, ctx.bounds))
      return { ok: false, reason: 'aim' };
    if (distance(ctx.origin, ctx.cursor) > spell.range)
      return { ok: false, reason: 'range' };
    if (spell.kind === 'mobility' && ctx.destinationWalkable !== true)
      return { ok: false, reason: 'blocked' };
    aim = resolveSkillAim('GROUND_POSITION', ctx.origin, ctx.cursor, null);
  }

  if (!aim) return { ok: false, reason: 'aim' };
  return {
    ok: true,
    spell,
    aim,
    manaAfter: ctx.mana - spell.cost,
    cooldowns: { ...ctx.cooldowns, [spell.id]: spell.cooldown }
  };
}

export type MageTalentId =
  | 'mage.ember' | 'mage.pyromancy' | 'mage.inferno'
  | 'mage.rime' | 'mage.frostbite' | 'mage.permafrost'
  | 'mage.spark' | 'mage.conduction' | 'mage.tempest'
  | 'mage.focus' | 'mage.aegis' | 'mage.transcendence';
export type MageTalentStat =
  | 'spellPower' | 'burnDuration' | 'areaRadius' | 'coldSlow'
  | 'chillDuration' | 'manaRegen' | 'chainDamage' | 'chainCount'
  | 'lightningCrit' | 'manaEfficiency' | 'barrierStrength' | 'teleportCooldown';
export interface MageTalentDefinition {
  readonly id: MageTalentId;
  readonly school: MageElement;
  readonly minLevel: number;
  readonly maxRank: number;
  readonly requires: readonly MageTalentId[];
  readonly effects: readonly { readonly key: MageTalentStat; readonly perRank: number }[];
}

/** Class-specific data; generic talent spend/respec/save logic stays in talentTree. */
export const MAGE_TALENT_TREE: readonly MageTalentDefinition[] = Object.freeze([
  { id: 'mage.ember', school: 'fire', minLevel: 5, maxRank: 3,
    requires: [], effects: [{ key: 'spellPower', perRank: 0.04 }] },
  { id: 'mage.pyromancy', school: 'fire', minLevel: 10, maxRank: 3,
    requires: ['mage.ember'], effects: [{ key: 'burnDuration', perRank: 0.15 }] },
  { id: 'mage.inferno', school: 'fire', minLevel: 15, maxRank: 2,
    requires: ['mage.pyromancy'], effects: [{ key: 'areaRadius', perRank: 0.08 }] },
  { id: 'mage.rime', school: 'frost', minLevel: 5, maxRank: 3,
    requires: [], effects: [{ key: 'coldSlow', perRank: 0.05 }] },
  { id: 'mage.frostbite', school: 'frost', minLevel: 10, maxRank: 3,
    requires: ['mage.rime'], effects: [{ key: 'chillDuration', perRank: 0.12 }] },
  { id: 'mage.permafrost', school: 'frost', minLevel: 15, maxRank: 2,
    requires: ['mage.frostbite'], effects: [{ key: 'manaRegen', perRank: 0.07 }] },
  { id: 'mage.spark', school: 'lightning', minLevel: 5, maxRank: 3,
    requires: [], effects: [{ key: 'chainDamage', perRank: 0.05 }] },
  { id: 'mage.conduction', school: 'lightning', minLevel: 10, maxRank: 3,
    requires: ['mage.spark'], effects: [{ key: 'lightningCrit', perRank: 0.025 }] },
  { id: 'mage.tempest', school: 'lightning', minLevel: 15, maxRank: 2,
    requires: ['mage.conduction'], effects: [{ key: 'chainCount', perRank: 1 }] },
  { id: 'mage.focus', school: 'arcane', minLevel: 5, maxRank: 3,
    requires: [], effects: [{ key: 'manaEfficiency', perRank: 0.04 }] },
  { id: 'mage.aegis', school: 'arcane', minLevel: 10, maxRank: 3,
    requires: ['mage.focus'], effects: [{ key: 'barrierStrength', perRank: 0.07 }] },
  { id: 'mage.transcendence', school: 'arcane', minLevel: 15, maxRank: 2,
    requires: ['mage.aegis'], effects: [{ key: 'teleportCooldown', perRank: 0.07 }] }
] satisfies readonly MageTalentDefinition[]);

export const MAGE_AFFIX_TAGS = Object.freeze([
  'mage.fire', 'mage.frost', 'mage.lightning', 'mage.arcane'
] as const);
