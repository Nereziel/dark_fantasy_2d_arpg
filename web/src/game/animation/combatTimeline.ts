/**
 * Pure authoritative combat animation timing, measured in whole simulation ticks.
 *
 * This module emits *cues*, never damage or Phaser effects. The integrator must
 * apply damage only on an "impact" event, never when "started" is emitted.
 * A new action is started explicitly; cancel the old action before replacing it.
 * The integration layer owns precedence (death, hit, dodge, etc.) and resets.
 *
 * Original Aether & Ruin code: GPL-3.0-only.
 */

export type CombatAnimation =
  | 'idle' | 'walk' | 'run'
  | 'attack' | 'cast' | 'channel'
  | 'hit' | 'block' | 'dodge' | 'death';

export type CombatTimelinePhase =
  | 'loop' | 'windup' | 'sustain' | 'recovery'
  | 'complete' | 'cancelled' | 'dead';

export interface CombatTimelineSpec {
  readonly animation: CombatAnimation;
  /** Optional language-neutral command identity, passed through to cues. */
  readonly actionId?: string;
  /** Attack/cast/channel: tick when the one authoritative impact occurs (>= 1). */
  readonly windupTicks?: number;
  /** Channel only: number of post-impact sustained ticks. Impact is still one-shot. */
  readonly sustainTicks?: number;
  /** Finite animation's post-impact recovery or defensive reaction duration. */
  readonly recoveryTicks?: number;
  /** Overrides the default for finite actions; death and locomotion are fixed. */
  readonly movementLocked?: boolean;
}

export interface CombatTimelineState {
  readonly animation: CombatAnimation;
  readonly actionId: string | null;
  readonly phase: CombatTimelinePhase;
  readonly elapsedTicks: number;
  readonly windupTicks: number;
  readonly sustainTicks: number;
  readonly recoveryTicks: number;
  readonly impactTick: number | null;
  /** Null denotes an unbounded loop or a terminal death pose, never Infinity. */
  readonly totalTicks: number | null;
  readonly impactEmitted: boolean;
  readonly movementLocked: boolean;
}

export type CombatTimelineEvent = Readonly<{
  type: 'started' | 'impact' | 'completed' | 'cancelled';
  animation: CombatAnimation;
  actionId: string | null;
  /** Absolute tick offset from this action's start, not a render-frame time. */
  atTick: number;
}>;

export interface CombatTimelineResult {
  readonly state: CombatTimelineState;
  readonly events: readonly CombatTimelineEvent[];
}

/** Clamp user-provided segment lengths to keep totals and all calculations finite. */
const MAX_SEGMENT_TICKS = 1_000_000;
const MAX_TOTAL_TICKS = MAX_SEGMENT_TICKS * 3;

const ANIMATIONS: readonly CombatAnimation[] = [
  'idle', 'walk', 'run', 'attack', 'cast', 'channel',
  'hit', 'block', 'dodge', 'death'
];

function tickCount(value: number | undefined, fallback: number, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_SEGMENT_TICKS, Math.max(minimum, Math.floor(value)));
}

function cue(
  type: CombatTimelineEvent['type'],
  state: CombatTimelineState,
  atTick: number
): CombatTimelineEvent {
  return Object.freeze({
    type, animation: state.animation, actionId: state.actionId, atTick
  });
}

function result(
  state: CombatTimelineState,
  events: CombatTimelineEvent[] = []
): CombatTimelineResult {
  return Object.freeze({
    state: Object.freeze(state),
    events: Object.freeze(events)
  });
}

/** Create a fresh isolated timeline. All returned state and cues are immutable. */
export function startCombatTimeline(spec: Readonly<CombatTimelineSpec>): CombatTimelineResult {
  const input = spec && typeof spec === 'object'
    ? spec
    : ({ animation: 'idle' } as CombatTimelineSpec);
  const animation = ANIMATIONS.includes(input.animation) ? input.animation : 'idle';
  const attackLike = animation === 'attack' || animation === 'cast' || animation === 'channel';
  const reaction = animation === 'hit' || animation === 'block' || animation === 'dodge';

  // Cast/attack impact is never emitted at start, even with malformed duration.
  const windupTicks = attackLike ? tickCount(input.windupTicks, 1, 1) : 0;
  const sustainTicks = animation === 'channel' ? tickCount(input.sustainTicks, 1) : 0;
  const recoveryTicks = attackLike
    ? tickCount(input.recoveryTicks, 2)
    : reaction ? tickCount(input.recoveryTicks, 2, 1) : 0;

  const totalTicks = attackLike || reaction
    ? windupTicks + sustainTicks + recoveryTicks
    : null;
  const movementLocked = animation === 'death'
    ? true
    : animation === 'idle' || animation === 'walk' || animation === 'run'
      ? false
      : typeof input.movementLocked === 'boolean'
        ? input.movementLocked
        : animation !== 'dodge';
  const actionId = typeof input.actionId === 'string' && input.actionId.trim().length > 0
    ? input.actionId.trim().slice(0, 128)
    : null;
  const phase: CombatTimelinePhase = attackLike
    ? 'windup'
    : reaction ? 'recovery'
      : animation === 'death' ? 'dead' : 'loop';

  const state: CombatTimelineState = {
    animation, actionId, phase, elapsedTicks: 0,
    windupTicks, sustainTicks, recoveryTicks,
    impactTick: attackLike ? windupTicks : null,
    totalTicks, impactEmitted: false, movementLocked
  };
  return result(state, [cue('started', state, 0)]);
}

function phaseAt(state: CombatTimelineState, elapsedTicks: number): CombatTimelinePhase {
  if (state.totalTicks === null) return state.animation === 'death' ? 'dead' : 'loop';
  if (elapsedTicks >= state.totalTicks) return 'complete';
  if (state.impactTick === null) return 'recovery';
  if (elapsedTicks < state.windupTicks) return 'windup';
  if (state.animation === 'channel'
      && elapsedTicks < state.windupTicks + state.sustainTicks) return 'sustain';
  return 'recovery';
}

/**
 * Progress by whole, fixed simulation ticks, never Phaser's frame delta.
 * Invalid, negative and sub-tick deltas do not advance the action. A single
 * large advance crosses the exact same cue boundaries as many small advances.
 */
export function advanceCombatTimeline(
  state: Readonly<CombatTimelineState>,
  deltaTicks: number
): CombatTimelineResult {
  if (state.phase === 'cancelled' || state.phase === 'complete'
      || state.phase === 'loop' || state.phase === 'dead'
      || state.totalTicks === null
      || !Number.isFinite(deltaTicks) || deltaTicks <= 0) {
    return result(state);
  }

  const delta = Math.floor(Math.min(deltaTicks, MAX_TOTAL_TICKS));
  if (delta <= 0) return result(state);

  const elapsedTicks = Math.min(state.totalTicks, state.elapsedTicks + delta);
  if (elapsedTicks <= state.elapsedTicks) return result(state);

  const impact = state.impactTick !== null
    && !state.impactEmitted && elapsedTicks >= state.impactTick;
  const completed = elapsedTicks >= state.totalTicks;
  const next: CombatTimelineState = {
    ...state,
    elapsedTicks,
    phase: phaseAt(state, elapsedTicks),
    impactEmitted: state.impactEmitted || impact,
    movementLocked: completed ? false : state.movementLocked
  };
  const events: CombatTimelineEvent[] = [];
  if (impact) events.push(cue('impact', next, state.impactTick!));
  if (completed) events.push(cue('completed', next, state.totalTicks));
  return result(next, events);
}

/**
 * Explicitly abort a finite action or locomotion loop. Cancellation never
 * replays/creates impact. A dead pose and finished/cancelled actions are inert.
 */
export function cancelCombatTimeline(
  state: Readonly<CombatTimelineState>
): CombatTimelineResult {
  if (state.phase === 'dead' || state.phase === 'cancelled'
      || state.phase === 'complete') return result(state);

  const next: CombatTimelineState = {
    ...state, phase: 'cancelled', movementLocked: false
  };
  return result(next, [cue('cancelled', next, next.elapsedTicks)]);
}
