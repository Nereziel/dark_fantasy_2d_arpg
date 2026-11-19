/**
 * Session-only status mechanics. No Phaser/Svelte dependencies or HP mutation.
 * All durations and tick intervals use simulation seconds supplied by the caller.
 * Original project code: GPL-3.0-only.
 */
export type StatusStacking = 'refresh' | 'add' | 'replace' | 'strongest';

export interface StatusRule {
  readonly id: string;
  readonly duration: number;
  readonly magnitude: number;
  readonly stacking: StatusStacking;
  readonly maxStacks?: number;
  readonly tickInterval?: number;
  readonly refreshDuration?: boolean;
  readonly dispelCategory?: string;
  /** Matching a status ID or any of these tags blocks application. */
  readonly immunityTags?: readonly string[];
  /** Additive modifier coefficients per unit of magnitude and stack. */
  readonly modifiers?: Readonly<Record<string, number>>;
  readonly visualHook?: string;
}

export interface StatusInstance {
  readonly id: string;
  /** Original applier, or strongest new applier on magnitude upgrade. */
  readonly sourceId: string;
  readonly duration: number;
  readonly remaining: number;
  readonly magnitude: number;
  readonly stacks: number;
  readonly stacking: StatusStacking;
  readonly maxStacks: number;
  readonly tickInterval: number;
  /** Accumulated time since the last periodic tick (in simulation seconds). */
  readonly tickElapsed: number;
  readonly dispelCategory: string | null;
  readonly immunityTags: readonly string[];
  readonly modifiers: Readonly<Record<string, number>>;
  readonly visualHook: string | null;
}

export interface StatusTickEvent {
  readonly statusId: string;
  readonly sourceId: string;
  /** Combined magnitude of every stack; caller resolves damage/healing. */
  readonly magnitude: number;
  readonly stacks: number;
}

export interface StatusAdvanceResult {
  readonly statuses: StatusInstance[];
  readonly ticks: StatusTickEvent[];
  /** Tick events omitted because of the bounded per-advance event budget. */
  readonly suppressedTicks: number;
}

export interface StatusDispelSelector {
  readonly ids?: readonly string[];
  readonly categories?: readonly string[];
}

export const MAX_STATUS_TICK_EVENTS = 256;

const STACKING: readonly StatusStacking[] = ['refresh', 'add', 'replace', 'strongest'];

function validName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function positive(value: unknown): value is number {
  return nonnegative(value) && value > 0;
}

function time(value: number): number {
  // Remove accumulated binary rounding without forcing a fixed tick resolution.
  return Number(value.toPrecision(14));
}

function safeSum(first: number, second: number): number {
  const result = first + second;
  return Number.isFinite(result) ? result : Math.sign(first || second) * Number.MAX_VALUE;
}

function safeMultiply(first: number, second: number): number {
  const result = first * second;
  return Number.isFinite(result) ? result : Math.sign(first) * Math.sign(second) * Number.MAX_VALUE;
}

function safeCount(value: number): number {
  return Number.isFinite(value) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value))) : Number.MAX_SAFE_INTEGER;
}

function names(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(validName).map(name => name.trim()) : [];
}

function coefficients(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [key, amount] of Object.entries(value)) {
    if (!validName(key) || key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (typeof amount === 'number' && Number.isFinite(amount)) result[key] = amount;
  }
  return result;
}

function validRule(rule: StatusRule): boolean {
  return !!rule && validName(rule.id) && positive(rule.duration) &&
    nonnegative(rule.magnitude) && STACKING.includes(rule.stacking) &&
    (rule.maxStacks === undefined || (Number.isSafeInteger(rule.maxStacks) && rule.maxStacks > 0));
}

function instanceFromRule(rule: StatusRule, sourceId: string): StatusInstance {
  return {
    id: rule.id,
    sourceId,
    duration: time(rule.duration),
    remaining: time(rule.duration),
    magnitude: rule.magnitude,
    stacks: 1,
    stacking: rule.stacking,
    maxStacks: rule.maxStacks ?? 1,
    tickInterval: positive(rule.tickInterval) ? rule.tickInterval : 0,
    tickElapsed: 0,
    dispelCategory: validName(rule.dispelCategory) ? rule.dispelCategory : null,
    immunityTags: names(rule.immunityTags),
    modifiers: coefficients(rule.modifiers),
    visualHook: validName(rule.visualHook) ? rule.visualHook : null
  };
}

function cleanInstance(status: StatusInstance): StatusInstance | null {
  if (!status || !validName(status.id) || !validName(status.sourceId) ||
      !positive(status.duration) || !positive(status.remaining) ||
      !nonnegative(status.magnitude) || !STACKING.includes(status.stacking) ||
      !Number.isSafeInteger(status.maxStacks) || status.maxStacks <= 0 ||
      !Number.isSafeInteger(status.stacks) || status.stacks < 1 || status.stacks > status.maxStacks ||
      !nonnegative(status.tickElapsed)) return null;
  const tickInterval = positive(status.tickInterval) ? status.tickInterval : 0;
  const tickElapsed = tickInterval > 0 ? time(status.tickElapsed % tickInterval) : 0;
  return {
    id: status.id, sourceId: status.sourceId,
    duration: time(status.duration), remaining: time(status.remaining),
    magnitude: status.magnitude, stacks: status.stacks,
    stacking: status.stacking, maxStacks: status.maxStacks,
    tickInterval, tickElapsed,
    dispelCategory: validName(status.dispelCategory) ? status.dispelCategory : null,
    immunityTags: names(status.immunityTags),
    modifiers: coefficients(status.modifiers),
    visualHook: validName(status.visualHook) ? status.visualHook : null
  };
}

function cleanStatuses(statuses: readonly StatusInstance[]): StatusInstance[] {
  if (!Array.isArray(statuses)) return [];
  const clean: StatusInstance[] = [];
  for (const status of statuses) {
    const instance = cleanInstance(status);
    if (instance) clean.push(instance);
  }
  return clean;
}

/**
 * Apply a rule to one status ID (stacking is per ID). Other IDs are unchanged.
 * Refresh/strongest preserve tick phase and the old source unless magnitude grows;
 * add groups stack contributions under the initial source; replace restarts both.
 * The catalog/integrator is responsible for defining any per-source stack model.
 */
export function applyStatus(
  statuses: readonly StatusInstance[],
  rule: StatusRule,
  sourceId: string,
  immunities: readonly string[] = []
): StatusInstance[] {
  const active = cleanStatuses(statuses);
  if (!validRule(rule) || !validName(sourceId)) return active;
  const blocked = new Set(names(immunities));
  if (blocked.has(rule.id) || names(rule.immunityTags).some(tag => blocked.has(tag))) return active;

  const incoming = instanceFromRule(rule, sourceId);
  const index = active.findIndex(status => status.id === rule.id);
  if (index < 0) return [...active, incoming];

  const existing = active[index];
  if (rule.stacking === 'replace') {
    active[index] = incoming;
    return active;
  }

  const magnitudeGrew = incoming.magnitude > existing.magnitude;
  const nextStacks = rule.stacking === 'add'
    ? Math.min(incoming.maxStacks, existing.stacks + 1)
    : rule.stacking === 'refresh' || rule.stacking === 'strongest' ? 1 : existing.stacks;
  const nextMagnitude = Math.max(existing.magnitude, incoming.magnitude);
  const remaining = rule.refreshDuration === false
    ? existing.remaining
    : Math.max(existing.remaining, incoming.remaining);
  active[index] = {
    ...existing,
    duration: Math.max(existing.duration, incoming.duration),
    remaining,
    magnitude: nextMagnitude,
    stacks: nextStacks,
    stacking: incoming.stacking,
    maxStacks: Math.max(nextStacks, incoming.maxStacks),
    // Adding a stack retains initial source; an intensity upgrade reassigns it.
    sourceId: rule.stacking === 'add' ? existing.sourceId : magnitudeGrew ? sourceId : existing.sourceId
  };
  return active;
}

/**
 * Advance timers without executing tick effects. Events carry attribution
 * and magnitude; callers route them through the canonical damage/heal pipeline.
 * Tick on the exact expiry boundary, never beyond it.
 */
export function advanceStatuses(
  statuses: readonly StatusInstance[],
  deltaSeconds: number,
  maxTickEvents: number = MAX_STATUS_TICK_EVENTS
): StatusAdvanceResult {
  const active = cleanStatuses(statuses);
  if (!positive(deltaSeconds)) return { statuses: active, ticks: [], suppressedTicks: 0 };
  const budget = Number.isSafeInteger(maxTickEvents) && maxTickEvents >= 0
    ? Math.min(maxTickEvents, MAX_STATUS_TICK_EVENTS) : MAX_STATUS_TICK_EVENTS;
  const nextStatuses: StatusInstance[] = [];
  const ticks: StatusTickEvent[] = [];
  let suppressedTicks = 0;

  for (const status of active) {
    const consumed = Math.min(status.remaining, deltaSeconds);
    const remaining = Math.max(0, time(status.remaining - consumed));
    let tickElapsed = status.tickElapsed;

    if (status.tickInterval > 0) {
      const total = safeSum(status.tickElapsed, consumed);
      const interval = status.tickInterval;
      // Numeric tolerance only resolves floating-point error at a tick boundary.
      const tolerance = Math.min(interval * 1e-8, 1e-10);
      const count = safeCount(Math.floor((total + tolerance) / interval));
      const available = Math.max(0, budget - ticks.length);
      const emitted = Math.min(count, available);
      const magnitude = safeMultiply(status.magnitude, status.stacks);
      for (let i = 0; i < emitted; i++) {
        ticks.push({ statusId: status.id, sourceId: status.sourceId, magnitude, stacks: status.stacks });
      }
      suppressedTicks = safeCount(safeSum(suppressedTicks, count - emitted));
      tickElapsed = time(total % interval);
      if (tickElapsed >= interval - tolerance || tickElapsed < tolerance) tickElapsed = 0;
    }

    if (remaining > 0) nextStatuses.push({ ...status, remaining, tickElapsed });
  }
  return { statuses: nextStatuses, ticks, suppressedTicks };
}

/** Remove matching IDs or dispel categories; absent selectors remove nothing. */
export function dispelStatuses(
  statuses: readonly StatusInstance[],
  selectors: StatusDispelSelector = {}
): StatusInstance[] {
  const active = cleanStatuses(statuses);
  const ids = new Set(names(selectors?.ids));
  const categories = new Set(names(selectors?.categories));
  if (ids.size === 0 && categories.size === 0) return active;
  return active.filter(status => !ids.has(status.id) &&
    !(status.dispelCategory !== null && categories.has(status.dispelCategory)));
}

/** Immutable UI/AI projection: additive coefficients × potency × stacks. */
export function getStatusModifiers(statuses: readonly StatusInstance[]): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const status of cleanStatuses(statuses)) {
    for (const [id, value] of Object.entries(status.modifiers)) {
      const amount = safeMultiply(safeMultiply(value, status.magnitude), status.stacks);
      result[id] = time(safeSum(result[id] ?? 0, amount));
    }
  }
  return result;
}
