/**
 * GPL-3.0-only. Declarative, renderer-independent defaults for Prompt 09.
 *
 * These definitions do not apply, tick, stack, dispel, or persist effects.
 * The coordinator will reconcile them with the canonical status runtime.
 */
export const STATUS_IDS = Object.freeze([
  'burning', 'chilled', 'frozen', 'poisoned', 'bleeding',
  'stunned', 'slowed', 'rooted', 'silenced', 'cursed',
  'vulnerable', 'fortified', 'shielded', 'regeneration', 'haste'
] as const);

export type StatusId = (typeof STATUS_IDS)[number];

/** Replace one instance or stack intensities up to maxStacks. */
export type StatusStackMode = 'replace' | 'stack';
/** Reset remaining duration or retain the longer of old and incoming duration. */
export type StatusRefreshMode = 'reset' | 'keepLonger';
/** Dispel classification, independent of spell/source ownership. */
export type StatusDispelCategory = 'physical' | 'magic' | 'curse' | 'none';
/** Immunities are matched by group, not by localized effect name. */
export type StatusImmunityGroup =
  | 'hardControl' | 'movementControl' | 'slowControl' | 'silence';
export type StatusModifierKind =
  | 'damageOverTime' | 'healingOverTime'
  | 'movementSpeed' | 'speedBoost'
  | 'movementLock' | 'castLock' | 'actionLock'
  | 'damageDealt' | 'damageTaken' | 'damageReduction' | 'barrier';

export interface StatusDefinition {
  readonly id: StatusId;
  /** Default active duration, in simulation seconds. */
  readonly duration: number;
  /**
   * Magnitude is points per tick for damage/healing/barrier, a fractional
   * modifier for speed/damage changes, or 1 for binary control effects.
   * Skill/source-specific magnitude is supplied by the later runtime.
   */
  readonly magnitude: number;
  /** Seconds between periodic applications; null means no periodic tick. */
  readonly tickInterval: number | null;
  readonly stackMode: StatusStackMode;
  readonly maxStacks: number;
  readonly refreshMode: StatusRefreshMode;
  readonly dispelCategory: StatusDispelCategory;
  /** null means this status does not belong to a CC immunity group. */
  readonly immunityGroup: StatusImmunityGroup | null;
  /** Stable render hook only; not localized text or an asset reference. */
  readonly visualHook: StatusId;
  readonly modifierKind: StatusModifierKind;
}

type StatusDefaults = Omit<StatusDefinition, 'id' | 'visualHook'>;

function define(id: StatusId, defaults: StatusDefaults): Readonly<StatusDefinition> {
  return Object.freeze({ id, visualHook: id, ...defaults });
}

/**
 * Immutable status catalog: defaults only, not authoritative active effects.
 * All durations and intervals are positive finite seconds; null ticks are inert.
 */
export const STATUS_DEFINITIONS: Readonly<Record<StatusId, StatusDefinition>> = Object.freeze({
  burning: define('burning', {
    duration: 4, magnitude: 6, tickInterval: 1,
    stackMode: 'replace', maxStacks: 1, refreshMode: 'reset',
    dispelCategory: 'magic', immunityGroup: null, modifierKind: 'damageOverTime'
  }),
  chilled: define('chilled', {
    duration: 3, magnitude: 0.25, tickInterval: null,
    stackMode: 'replace', maxStacks: 1, refreshMode: 'keepLonger',
    dispelCategory: 'magic', immunityGroup: 'slowControl', modifierKind: 'movementSpeed'
  }),
  frozen: define('frozen', {
    duration: 1.5, magnitude: 1, tickInterval: null,
    stackMode: 'replace', maxStacks: 1, refreshMode: 'keepLonger',
    dispelCategory: 'magic', immunityGroup: 'hardControl', modifierKind: 'actionLock'
  }),
  poisoned: define('poisoned', {
    duration: 6, magnitude: 3, tickInterval: 1,
    stackMode: 'stack', maxStacks: 5, refreshMode: 'reset',
    dispelCategory: 'magic', immunityGroup: null, modifierKind: 'damageOverTime'
  }),
  bleeding: define('bleeding', {
    duration: 5, magnitude: 4, tickInterval: 1,
    stackMode: 'stack', maxStacks: 3, refreshMode: 'reset',
    dispelCategory: 'physical', immunityGroup: null, modifierKind: 'damageOverTime'
  }),
  stunned: define('stunned', {
    duration: 1, magnitude: 1, tickInterval: null,
    stackMode: 'replace', maxStacks: 1, refreshMode: 'keepLonger',
    dispelCategory: 'physical', immunityGroup: 'hardControl', modifierKind: 'actionLock'
  }),
  slowed: define('slowed', {
    duration: 4, magnitude: 0.2, tickInterval: null,
    stackMode: 'replace', maxStacks: 1, refreshMode: 'keepLonger',
    dispelCategory: 'physical', immunityGroup: 'slowControl', modifierKind: 'movementSpeed'
  }),
  rooted: define('rooted', {
    duration: 2, magnitude: 1, tickInterval: null,
    stackMode: 'replace', maxStacks: 1, refreshMode: 'keepLonger',
    dispelCategory: 'physical', immunityGroup: 'movementControl', modifierKind: 'movementLock'
  }),
  silenced: define('silenced', {
    duration: 3, magnitude: 1, tickInterval: null,
    stackMode: 'replace', maxStacks: 1, refreshMode: 'keepLonger',
    dispelCategory: 'magic', immunityGroup: 'silence', modifierKind: 'castLock'
  }),
  cursed: define('cursed', {
    duration: 6, magnitude: 0.15, tickInterval: null,
    stackMode: 'replace', maxStacks: 1, refreshMode: 'keepLonger',
    dispelCategory: 'curse', immunityGroup: null, modifierKind: 'damageDealt'
  }),
  vulnerable: define('vulnerable', {
    duration: 4, magnitude: 0.15, tickInterval: null,
    stackMode: 'replace', maxStacks: 1, refreshMode: 'keepLonger',
    dispelCategory: 'magic', immunityGroup: null, modifierKind: 'damageTaken'
  }),
  fortified: define('fortified', {
    duration: 5, magnitude: 0.2, tickInterval: null,
    stackMode: 'replace', maxStacks: 1, refreshMode: 'keepLonger',
    dispelCategory: 'magic', immunityGroup: null, modifierKind: 'damageReduction'
  }),
  shielded: define('shielded', {
    duration: 6, magnitude: 40, tickInterval: null,
    stackMode: 'replace', maxStacks: 1, refreshMode: 'keepLonger',
    dispelCategory: 'magic', immunityGroup: null, modifierKind: 'barrier'
  }),
  regeneration: define('regeneration', {
    duration: 5, magnitude: 4, tickInterval: 1,
    stackMode: 'replace', maxStacks: 1, refreshMode: 'reset',
    dispelCategory: 'magic', immunityGroup: null, modifierKind: 'healingOverTime'
  }),
  haste: define('haste', {
    duration: 5, magnitude: 0.2, tickInterval: null,
    stackMode: 'replace', maxStacks: 1, refreshMode: 'keepLonger',
    dispelCategory: 'magic', immunityGroup: null, modifierKind: 'speedBoost'
  })
});

/** Reject unknown external IDs, including Object.prototype keys. */
export function getStatusDefinition(id: unknown): StatusDefinition | undefined {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(STATUS_DEFINITIONS, id)) {
    return undefined;
  }
  return STATUS_DEFINITIONS[id as StatusId];
}
