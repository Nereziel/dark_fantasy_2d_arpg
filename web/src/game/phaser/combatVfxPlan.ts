/**
 * Deterministic, renderer-agnostic combat feedback descriptors.
 *
 * These are passive instructions. The Phaser adapter owns object pools and
 * playback; the simulation owns damage, animation hit frames and knockback.
 * In particular, planning a cue NEVER applies damage or moves an actor.
 * Original project code: GPL-3.0-only.
 */

export interface CombatVfxPoint {
  readonly x: number;
  readonly y: number;
}

export type CombatVfxEvent =
  | Readonly<{
      type: 'impact';
      position: CombatVfxPoint;
      /** Health damage after mitigation/shields, not the raw attack roll. */
      damage: number;
      /** Damage intercepted by a shield; no health damage text for this. */
      absorbed?: number;
      outcome?: 'hit' | 'blocked' | 'dodged';
      delivery?: 'melee' | 'projectile';
      critical?: boolean;
      strong?: boolean;
      /** Visual displacement direction only. Never authoritative movement. */
      direction?: CombatVfxPoint;
      /** Optional VFX scale; always bounded to prevent oversized effects. */
      intensity?: number;
    }>
  | Readonly<{
      type: 'death';
      position: CombatVfxPoint;
      actorId: string;
      intensity?: number;
    }>;

export type CombatVfxPoolKey =
  | 'combat.flash' | 'combat.particles' | 'combat.trail'
  | 'combat.shake' | 'combat.floatText' | 'combat.death'
  | 'combat.knockback';

export type CombatFloatContent =
  | Readonly<{ kind: 'damage'; amount: number }>
  | Readonly<{ kind: 'message'; key: 'combat.blocked' | 'combat.dodged' }>;

type CueBase<T extends string, P extends CombatVfxPoolKey> = Readonly<{
  type: T;
  poolKey: P;
  position: CombatVfxPoint;
  durationMs: number;
}>;

export type CombatVfxCue =
  | (CueBase<'impactFlash', 'combat.flash'> & Readonly<{
      intensity: number;
      tone: 'normal' | 'critical' | 'blocked';
    }>)
  | (CueBase<'particles', 'combat.particles'> & Readonly<{
      intensity: number;
      count: number;
      style: 'impact' | 'projectile' | 'death';
    }>)
  | (CueBase<'weaponTrail', 'combat.trail'> & Readonly<{
      intensity: number;
    }>)
  | (CueBase<'screenShake', 'combat.shake'> & Readonly<{
      intensity: number;
    }>)
  | (CueBase<'floatText', 'combat.floatText'> & Readonly<{
      content: CombatFloatContent;
      emphasis: 'normal' | 'critical' | 'blocked' | 'dodged';
    }>)
  | (CueBase<'deathHook', 'combat.death'> & Readonly<{
      actorId: string;
    }>)
  | (CueBase<'knockbackCue', 'combat.knockback'> & Readonly<{
      direction: CombatVfxPoint;
      distance: number;
      intensity: number;
    }>);

const MAX_WORLD_COORDINATE = 1_000_000;
const MAX_PARTICLES = 32;
const MAX_DURATION_MS = 900;
const MAX_DAMAGE_TEXT = Number.MAX_SAFE_INTEGER;
const NO_CUES: readonly CombatVfxCue[] = Object.freeze([]);

function validPoint(point: CombatVfxPoint | undefined): point is CombatVfxPoint {
  return point !== undefined && point !== null
    && Number.isFinite(point.x) && Number.isFinite(point.y)
    && Math.abs(point.x) <= MAX_WORLD_COORDINATE
    && Math.abs(point.y) <= MAX_WORLD_COORDINATE;
}

function validDirection(direction: CombatVfxPoint | undefined): boolean {
  return direction === undefined || (direction !== null
    && Number.isFinite(direction.x) && Number.isFinite(direction.y));
}

function validAmount(amount: number | undefined): boolean {
  return amount === undefined || (Number.isFinite(amount) && amount >= 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function duration(ms: number): number {
  return Math.round(clamp(ms, 1, MAX_DURATION_MS));
}

/** Handles very large but finite vectors without overflowing Math.hypot. */
function normalizedDirection(direction: CombatVfxPoint): CombatVfxPoint | null {
  const scale = Math.max(Math.abs(direction.x), Math.abs(direction.y));
  if (scale === 0) return null;
  const x = direction.x / scale;
  const y = direction.y / scale;
  const length = Math.hypot(x, y);
  return Object.freeze({ x: x / length, y: y / length });
}

function push(cues: CombatVfxCue[], cue: CombatVfxCue): void {
  cues.push(Object.freeze(cue));
}

/** Convert a combat presentation event to an immutable, bounded cue list. */
export function planCombatVfx(event: CombatVfxEvent): readonly CombatVfxCue[] {
  if (!event || !validPoint(event.position) || !validAmount(event.intensity)) return NO_CUES;
  const position: CombatVfxPoint = Object.freeze({
    x: event.position.x, y: event.position.y
  });
  const magnitude = clamp(event.intensity ?? 1, 0, 3);
  if (magnitude === 0) return NO_CUES;

  const cues: CombatVfxCue[] = [];
  if (event.type === 'death') {
    if (typeof event.actorId !== 'string' || event.actorId.trim().length === 0) return NO_CUES;
    const intensity = clamp(magnitude * 0.58, 0, 1);
    push(cues, {
      type: 'deathHook', poolKey: 'combat.death', position,
      durationMs: duration(850), actorId: event.actorId
    });
    push(cues, {
      type: 'particles', poolKey: 'combat.particles', position,
      durationMs: duration(460 + 120 * intensity),
      intensity, count: Math.round(clamp(12 + 18 * intensity, 1, MAX_PARTICLES)),
      style: 'death'
    });
    return Object.freeze(cues);
  }

  if (event.type !== 'impact' || !validAmount(event.damage)
    || !validAmount(event.absorbed) || !validDirection(event.direction)
    || (event.outcome !== undefined && event.outcome !== 'hit'
      && event.outcome !== 'blocked' && event.outcome !== 'dodged')
    || (event.delivery !== undefined && event.delivery !== 'melee'
      && event.delivery !== 'projectile')
    || (event.critical !== undefined && typeof event.critical !== 'boolean')
    || (event.strong !== undefined && typeof event.strong !== 'boolean')) return NO_CUES;

  if (event.outcome === 'dodged') {
    push(cues, {
      type: 'floatText', poolKey: 'combat.floatText', position,
      durationMs: duration(620), emphasis: 'dodged',
      content: Object.freeze({ kind: 'message', key: 'combat.dodged' })
    });
    return Object.freeze(cues);
  }

  const blocked = event.outcome === 'blocked';
  const touching = blocked || event.damage > 0 || (event.absorbed ?? 0) > 0;
  if (!touching) return NO_CUES;

  const critical = event.critical === true && !blocked && event.damage > 0;
  const strong = event.strong === true;
  const intensity = clamp(
    magnitude * 0.48 * (critical ? 1.4 : 1) * (strong ? 1.6 : 1),
    0, 1
  );

  push(cues, {
    type: 'impactFlash', poolKey: 'combat.flash', position,
    durationMs: duration(90 + 85 * intensity), intensity,
    tone: blocked ? 'blocked' : critical ? 'critical' : 'normal'
  });
  push(cues, {
    type: 'particles', poolKey: 'combat.particles', position,
    durationMs: duration(220 + 180 * intensity + (strong ? 140 : 0)),
    intensity,
    count: Math.round(clamp(6 + 9 * intensity + (strong ? 8 : 0) + (critical ? 5 : 0), 1, MAX_PARTICLES)),
    style: event.delivery === 'projectile' ? 'projectile' : 'impact'
  });
  if (event.delivery !== 'projectile') {
    push(cues, {
      type: 'weaponTrail', poolKey: 'combat.trail', position,
      durationMs: duration(105 + 120 * intensity), intensity
    });
  }

  const roundedDamage = Math.round(clamp(event.damage, 0, MAX_DAMAGE_TEXT));
  if (roundedDamage > 0) {
    push(cues, {
      type: 'floatText', poolKey: 'combat.floatText', position,
      durationMs: duration(critical ? 850 : 700),
      emphasis: critical ? 'critical' : blocked ? 'blocked' : 'normal',
      content: Object.freeze({ kind: 'damage', amount: roundedDamage })
    });
  } else if (blocked) {
    push(cues, {
      type: 'floatText', poolKey: 'combat.floatText', position,
      durationMs: duration(620), emphasis: 'blocked',
      content: Object.freeze({ kind: 'message', key: 'combat.blocked' })
    });
  }

  // Strong feedback is presentation-only and only follows a real health/shield hit.
  if (strong && (event.damage > 0 || (event.absorbed ?? 0) > 0)) {
    push(cues, {
      type: 'screenShake', poolKey: 'combat.shake', position,
      durationMs: duration(100 + 110 * intensity), intensity
    });
    const direction = event.direction ? normalizedDirection(event.direction) : null;
    if (event.damage > 0 && !blocked && direction !== null) {
      push(cues, {
        type: 'knockbackCue', poolKey: 'combat.knockback', position,
        durationMs: duration(140 + 70 * intensity),
        intensity, direction, distance: clamp(9 + 15 * intensity, 0, 24)
      });
    }
  }

  return Object.freeze(cues);
}
