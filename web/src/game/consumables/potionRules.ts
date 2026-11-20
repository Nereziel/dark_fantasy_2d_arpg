// GPL-3.0-only — Prompt 34. Pure, deterministic consumables.
// Timers are simulation seconds. No wall clock, UI, random source or side effects.
export const POTION_IDS = ['healing', 'resource', 'resistance', 'fury'] as const;
export type PotionId = typeof POTION_IDS[number];
export type PotionCharges = Record<PotionId, number>;
export type PotionBuffs = { resistance: number; fury: number };
export interface PotionState {
  readonly selected: PotionId;
  readonly charges: Readonly<PotionCharges>;
  readonly cooldown: number;
  readonly buffs: Readonly<PotionBuffs>;
}
export interface PotionDefinition {
  readonly id: PotionId;
  readonly maxCharges: number;
  readonly cooldown: number;
  readonly refillGold: number;
  readonly restore: number;
  readonly duration: number;
  readonly resistanceBonus: number;
  readonly damageMultiplier: number;
}
export const POTIONS: Readonly<Record<PotionId, PotionDefinition>> = Object.freeze({
  healing: Object.freeze({ id: 'healing', maxCharges: 3, cooldown: 4,
    refillGold: 8, restore: 55, duration: 0, resistanceBonus: 0, damageMultiplier: 1 }),
  resource: Object.freeze({ id: 'resource', maxCharges: 2, cooldown: 4,
    refillGold: 10, restore: 40, duration: 0, resistanceBonus: 0, damageMultiplier: 1 }),
  resistance: Object.freeze({ id: 'resistance', maxCharges: 1, cooldown: 4,
    refillGold: 18, restore: 0, duration: 12, resistanceBonus: 30, damageMultiplier: 1 }),
  fury: Object.freeze({ id: 'fury', maxCharges: 1, cooldown: 4,
    refillGold: 20, restore: 0, duration: 10, resistanceBonus: 0, damageMultiplier: 1.2 })
});

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function bounded(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
}
export function isPotionId(id: unknown): id is PotionId {
  return typeof id === 'string' && Object.hasOwn(POTIONS, id);
}
export function isPotionCharges(value: unknown): value is PotionCharges {
  return record(value) && Object.keys(value).length === POTION_IDS.length
    && POTION_IDS.every(id => Object.hasOwn(value, id)
      && Number.isSafeInteger(value[id]) && bounded(value[id], POTIONS[id].maxCharges));
}
export function isPotionState(value: unknown): value is PotionState {
  return record(value) && Object.keys(value).length === 4
    && isPotionId(value.selected) && isPotionCharges(value.charges)
    && bounded(value.cooldown, POTIONS.healing.cooldown)
    && record(value.buffs) && Object.keys(value.buffs).length === 2
    && bounded(value.buffs.resistance, POTIONS.resistance.duration)
    && bounded(value.buffs.fury, POTIONS.fury.duration);
}
export function freshPotions(): PotionState {
  return {
    selected: 'healing',
    charges: { healing: 3, resource: 2, resistance: 1, fury: 1 },
    cooldown: 0, buffs: { resistance: 0, fury: 0 }
  };
}
export function selectPotion(state: PotionState, id: unknown): PotionState | null {
  return isPotionState(state) && isPotionId(id)
    ? { ...state, selected: id, charges: { ...state.charges }, buffs: { ...state.buffs } }
    : null;
}
export interface PotionUseContext {
  readonly health: number;
  readonly maxHealth: number;
  readonly resource: number;
  readonly maxResource: number;
  readonly alive: boolean;
  readonly paused: boolean;
}
export interface PotionUsePlan {
  readonly state: PotionState;
  readonly potionId: PotionId;
  readonly health: number;
  readonly resource: number;
}
function validContext(context: PotionUseContext): boolean {
  return !!context && context.alive === true && context.paused === false
    && bounded(context.maxHealth, 1_000_000) && context.maxHealth > 0
    && bounded(context.health, context.maxHealth)
    && bounded(context.maxResource, 1_000_000) && context.maxResource > 0
    && bounded(context.resource, context.maxResource);
}
/** Each successful plan consumes exactly one charge, never changes its input. */
export function planPotionUse(
  state: PotionState, id: unknown, context: PotionUseContext
): PotionUsePlan | null {
  if (!isPotionState(state) || !isPotionId(id) || !validContext(context)
    || state.cooldown > 0 || state.charges[id] <= 0) return null;
  const definition = POTIONS[id];
  let health = context.health, resource = context.resource;
  if (id === 'healing') {
    health = Math.min(context.maxHealth, health + definition.restore);
    if (health === context.health) return null;
  } else if (id === 'resource') {
    resource = Math.min(context.maxResource, resource + definition.restore);
    if (resource === context.resource) return null;
  }
  const buffs = { ...state.buffs };
  if (id === 'resistance') buffs.resistance = definition.duration;
  if (id === 'fury') buffs.fury = definition.duration;
  return {
    potionId: id, health, resource,
    state: {
      selected: state.selected,
      charges: { ...state.charges, [id]: state.charges[id] - 1 },
      cooldown: definition.cooldown,
      buffs
    }
  };
}
function remaining(value: number, delta: number): number {
  return Math.max(0, Math.round(Math.max(0, value - delta) * 1_000_000) / 1_000_000);
}
/** A large finite dt expires effects in O(1), rather than producing repeated ticks. */
export function advancePotions(state: PotionState, dt: number): PotionState | null {
  if (!isPotionState(state) || !Number.isFinite(dt) || dt <= 0 || dt > 86400) return null;
  return {
    selected: state.selected, charges: { ...state.charges },
    cooldown: remaining(state.cooldown, dt),
    buffs: { resistance: remaining(state.buffs.resistance, dt),
      fury: remaining(state.buffs.fury, dt) }
  };
}
export interface PotionRefillPlan {
  readonly state: PotionState;
  readonly potionId: PotionId;
  readonly goldSpent: number;
  readonly gold: number;
}
/** Atomic one-charge refill; the authoritative caller checks town proximity. */
export function planPotionRefill(
  state: PotionState, id: unknown, gold: number
): PotionRefillPlan | null {
  if (!isPotionState(state) || !isPotionId(id) || !Number.isSafeInteger(gold)
    || gold < 0 || state.charges[id] >= POTIONS[id].maxCharges
    || gold < POTIONS[id].refillGold) return null;
  return {
    potionId: id, goldSpent: POTIONS[id].refillGold, gold: gold - POTIONS[id].refillGold,
    state: { selected: state.selected, charges: { ...state.charges, [id]: state.charges[id] + 1 },
      cooldown: state.cooldown, buffs: { ...state.buffs } }
  };
}
