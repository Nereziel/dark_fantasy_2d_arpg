/** Isolated, deterministic affix generator for Prompt 14.
 * Original Aether & Ruin code: GPL-3.0-only.
 * World/character persistence, item catalogue mapping and UI belong to integration.
 */

export type AffixRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export type AffixKind = 'prefix' | 'suffix';
export type AffixTier = 1 | 2 | 3 | 4 | 5 | 6;
export type AffixLocale = 'cs' | 'en';
export type ItemTag =
  | 'weapon' | 'armor' | 'jewelry' | 'shield'
  | 'melee' | 'ranged' | 'caster' | 'minion' | 'paladin'
  | 'mage.fire' | 'mage.frost' | 'mage.lightning' | 'mage.arcane';

export type AffixStat =
  | 'strength' | 'dexterity' | 'intelligence' | 'vitality'
  | 'critChance' | 'critDamage' | 'attackSpeed' | 'moveSpeed'
  | 'fireDamage' | 'physicalDamage' | 'poisonDamage'
  | 'fireResistance' | 'coldResistance' | 'poisonResistance'
  | 'maxHealth' | 'resourceRegen' | 'cooldownReduction'
  | 'skillRank' | 'summonDamage';

export interface AffixDefinition {
  readonly id: string;
  readonly kind: AffixKind;
  readonly stat: AffixStat;
  readonly weight: number;
  readonly min: number;
  readonly max: number;
  readonly minItemLevel: number;
  readonly minRarity: AffixRarity;
  /** A stat is selectable only when every required tag is present. */
  readonly requiredTags: readonly ItemTag[];
  readonly excludedTags: readonly ItemTag[];
  /** Mutually exclusive effects (e.g. competing elemental damage types). */
  readonly exclusionGroup?: string;
  readonly special: boolean;
  /** Percentages are rounded to one decimal; flat values to integers. */
  readonly decimal: boolean;
}

export interface AffixTierDefinition {
  readonly tier: AffixTier;
  readonly minItemLevel: number;
  readonly multiplier: number;
}

export interface AffixRollInput {
  readonly rarity: AffixRarity;
  readonly itemLevel: number;
  /** Exactly one base type, plus optional mutually compatible archetype tags. */
  readonly tags: readonly ItemTag[];
  /** Local, caller-supplied class emphasis; never a global player-class lookup. */
  readonly preferredStats?: readonly AffixStat[];
}

export interface AffixRng {
  /** Seeded, deterministic value in [0, 1); compatible with existing SeededRng.next(). */
  next(): number;
}

export interface RolledAffix {
  readonly id: string;
  readonly kind: AffixKind;
  readonly stat: AffixStat;
  readonly tier: AffixTier;
  readonly value: number;
}

export interface ItemNamePart {
  readonly kind: AffixKind | 'base';
  readonly id: string;
  readonly key: string;
  /** Null for an unknown base item; the integrator should supply its catalog translation. */
  readonly text: string | null;
}

export interface FormattedItemNameSegments {
  readonly baseId: string;
  readonly locale: AffixLocale;
  readonly resolvedBase: boolean;
  readonly parts: readonly ItemNamePart[];
  /** Null if the base item is not yet included in the local name reference table. */
  readonly text: string | null;
}

export const AFFIX_TIERS: readonly AffixTierDefinition[] = Object.freeze([
  { tier: 1, minItemLevel: 1, multiplier: 1 },
  { tier: 2, minItemLevel: 12, multiplier: 1.45 },
  { tier: 3, minItemLevel: 24, multiplier: 2 },
  { tier: 4, minItemLevel: 36, multiplier: 2.8 },
  { tier: 5, minItemLevel: 52, multiplier: 3.8 },
  { tier: 6, minItemLevel: 72, multiplier: 5 }
].map(tier => Object.freeze(tier))) as readonly AffixTierDefinition[];

const RARITY_ORDER: readonly AffixRarity[] = [
  'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'
];
const RARITY_RULES: Readonly<Record<AffixRarity, { readonly count: number; readonly maxTier: number }>> =
  Object.freeze({
    COMMON: Object.freeze({ count: 0, maxTier: 0 }),
    UNCOMMON: Object.freeze({ count: 1, maxTier: 2 }),
    RARE: Object.freeze({ count: 3, maxTier: 4 }),
    EPIC: Object.freeze({ count: 4, maxTier: 5 }),
    LEGENDARY: Object.freeze({ count: 5, maxTier: 6 })
  });

const ITEM_TAGS: readonly ItemTag[] = Object.freeze([
  'weapon', 'armor', 'jewelry', 'shield', 'melee', 'ranged', 'caster', 'minion', 'paladin',
  'mage.fire', 'mage.frost', 'mage.lightning', 'mage.arcane'
]);
const BASE_TAGS: readonly ItemTag[] = Object.freeze(['weapon', 'armor', 'jewelry', 'shield']);
const AFFIX_STATS: readonly AffixStat[] = Object.freeze([
  'strength', 'dexterity', 'intelligence', 'vitality',
  'critChance', 'critDamage', 'attackSpeed', 'moveSpeed',
  'fireDamage', 'physicalDamage', 'poisonDamage',
  'fireResistance', 'coldResistance', 'poisonResistance',
  'maxHealth', 'resourceRegen', 'cooldownReduction', 'skillRank', 'summonDamage'
]);

type DefinitionOptions = Readonly<{
  minItemLevel?: number;
  minRarity?: AffixRarity;
  requiredTags?: readonly ItemTag[];
  excludedTags?: readonly ItemTag[];
  exclusionGroup?: string;
  special?: boolean;
  decimal?: boolean;
}>;

function definition(
  kind: AffixKind,
  id: string,
  stat: AffixStat,
  weight: number,
  min: number,
  max: number,
  options: DefinitionOptions = {}
): AffixDefinition {
  return Object.freeze({
    id, kind, stat, weight, min, max,
    minItemLevel: options.minItemLevel ?? 1,
    minRarity: options.minRarity ?? 'UNCOMMON',
    requiredTags: Object.freeze([...(options.requiredTags ?? [])]),
    excludedTags: Object.freeze([...(options.excludedTags ?? [])]),
    exclusionGroup: options.exclusionGroup,
    special: options.special ?? false,
    decimal: options.decimal ?? false
  });
}

const prefix = (
  id: string, stat: AffixStat, weight: number, min: number, max: number,
  options?: DefinitionOptions
): AffixDefinition => definition('prefix', id, stat, weight, min, max, options);
const suffix = (
  id: string, stat: AffixStat, weight: number, min: number, max: number,
  options?: DefinitionOptions
): AffixDefinition => definition('suffix', id, stat, weight, min, max, options);

/** All values are the unscaled tier-I range; rolled tiers scale these values. */
export const AFFIX_PREFIXES: readonly AffixDefinition[] = Object.freeze([
  prefix('mighty', 'strength', 10, 2, 5),
  prefix('nimble', 'dexterity', 10, 2, 5),
  prefix('sage', 'intelligence', 10, 2, 5),
  prefix('vital', 'vitality', 10, 2, 5),
  prefix('keen', 'critChance', 8, 0.5, 1.5, { decimal: true }),
  prefix('swift', 'attackSpeed', 7, 1, 3, { decimal: true }),
  prefix('fleet', 'moveSpeed', 7, 1, 3, { decimal: true }),
  prefix('scorching', 'fireDamage', 8, 2, 6, { exclusionGroup: 'elemental-damage' }),
  prefix('brutal', 'physicalDamage', 9, 2, 7, {
    requiredTags: ['weapon', 'melee'], excludedTags: ['caster', 'ranged']
  }),
  prefix('venomous', 'poisonDamage', 8, 2, 6, { exclusionGroup: 'elemental-damage' }),
  prefix('unyielding', 'maxHealth', 9, 8, 18),
  prefix('channeling', 'resourceRegen', 7, 0.5, 1.5, {
    requiredTags: ['caster'], decimal: true
  }),
  prefix('arcane', 'skillRank', 4, 1, 1, {
    minRarity: 'EPIC', minItemLevel: 36, requiredTags: ['caster'],
    excludedTags: ['melee'], special: true
  }),
  prefix('summoning', 'summonDamage', 5, 2, 5, {
    minRarity: 'EPIC', minItemLevel: 36, requiredTags: ['minion'], special: true
  }),
  prefix('consecrated','resourceRegen',14,0.8,2.2,{
    minItemLevel:12,requiredTags:['paladin','weapon','melee'],decimal:true
  }),
  prefix('flamebound','fireDamage',13,3,8,{
    minItemLevel:12,requiredTags:['mage.fire','weapon','caster'],
    exclusionGroup:'elemental-damage'
  }),
  prefix('frostwoven','coldResistance',12,3,8,{
    minItemLevel:12,requiredTags:['mage.frost','weapon','caster']
  }),
  prefix('stormtouched','critChance',12,0.8,2.3,{
    minItemLevel:12,requiredTags:['mage.lightning','weapon','caster'],decimal:true
  }),
  prefix('runecharged','resourceRegen',12,0.7,1.9,{
    minItemLevel:12,requiredTags:['mage.arcane','weapon','caster'],decimal:true
  })
]);

export const AFFIX_SUFFIXES: readonly AffixDefinition[] = Object.freeze([
  suffix('bear', 'strength', 10, 2, 5),
  suffix('fox', 'dexterity', 10, 2, 5),
  suffix('owl', 'intelligence', 10, 2, 5),
  suffix('oak', 'vitality', 10, 2, 5),
  suffix('precision', 'critDamage', 7, 2, 5, { decimal: true }),
  suffix('flames', 'fireResistance', 8, 3, 9),
  suffix('frost', 'coldResistance', 8, 3, 9),
  suffix('antidote', 'poisonResistance', 8, 3, 9),
  suffix('celerity', 'moveSpeed', 7, 1, 3, { decimal: true }),
  suffix('fury', 'attackSpeed', 7, 1, 3, { decimal: true }),
  suffix('renewal', 'resourceRegen', 7, 0.5, 1.5, {
    requiredTags: ['caster'], decimal: true
  }),
  suffix('focus', 'cooldownReduction', 7, 1, 3, { decimal: true }),
  suffix('ember', 'fireDamage', 7, 2, 6, { exclusionGroup: 'elemental-damage' }),
  suffix('venom', 'poisonDamage', 7, 2, 6, { exclusionGroup: 'elemental-damage' }),
  suffix('mastery', 'skillRank', 4, 1, 1, {
    minRarity: 'EPIC', minItemLevel: 36, requiredTags: ['caster'],
    excludedTags: ['melee'], special: true
  }),
  suffix('legion', 'summonDamage', 5, 2, 5, {
    minRarity: 'EPIC', minItemLevel: 36, requiredTags: ['minion'], special: true
  }),
  suffix('fortitude', 'maxHealth', 9, 8, 18),
  suffix('ofFaith','skillRank',12,1,1,{
    minRarity:'EPIC',minItemLevel:36,requiredTags:['paladin','weapon','melee'],special:true
  }),
  suffix('ofCinders','fireDamage',11,3,7,{
    minItemLevel:12,requiredTags:['mage.fire','weapon','caster'],
    exclusionGroup:'elemental-damage'
  }),
  suffix('ofWinter','coldResistance',11,3,8,{
    minItemLevel:12,requiredTags:['mage.frost','weapon','caster']
  }),
  suffix('ofThunder','critChance',11,0.8,2.3,{
    minItemLevel:12,requiredTags:['mage.lightning','weapon','caster'],decimal:true
  }),
  suffix('ofMysteries','skillRank',10,1,1,{
    minRarity:'EPIC',minItemLevel:36,
    requiredTags:['mage.arcane','weapon','caster'],special:true
  })
]);

const ALL_DEFINITIONS: readonly AffixDefinition[] = Object.freeze([
  ...AFFIX_PREFIXES, ...AFFIX_SUFFIXES
]);
const BY_ID: ReadonlyMap<string, AffixDefinition> = new Map(
  ALL_DEFINITIONS.map(def => [def.id, def])
);

function isRarity(value: unknown): value is AffixRarity {
  return typeof value === 'string' && RARITY_ORDER.includes(value as AffixRarity);
}
function isStat(value: unknown): value is AffixStat {
  return typeof value === 'string' && AFFIX_STATS.includes(value as AffixStat);
}
function isTag(value: unknown): value is ItemTag {
  return typeof value === 'string' && ITEM_TAGS.includes(value as ItemTag);
}

/** Invalid caller data is a programmer error; do not silently change loot outcomes. */
function assertInput(input: AffixRollInput): void {
  if (!input || typeof input !== 'object' || !isRarity(input.rarity)
    || !Number.isSafeInteger(input.itemLevel)
    || input.itemLevel < 1 || input.itemLevel > 100) {
    throw new RangeError('Invalid rarity or item level (expected integer 1–100)');
  }
  if (!Array.isArray(input.tags)
    || input.tags.length < 1
    || input.tags.some(tag => !isTag(tag))
    || new Set(input.tags).size !== input.tags.length
    || input.tags.filter(tag => BASE_TAGS.includes(tag)).length !== 1
    || (input.tags.includes('melee') && (
      input.tags.includes('caster') || input.tags.includes('ranged')
    ))
    || (input.tags.includes('melee') && !input.tags.includes('weapon'))
    || (input.tags.includes('ranged') && !input.tags.includes('weapon'))) {
    throw new RangeError('Invalid or contradictory item tags');
  }
  if (input.preferredStats !== undefined && (
    !Array.isArray(input.preferredStats)
    || input.preferredStats.some(stat => !isStat(stat))
    || new Set(input.preferredStats).size !== input.preferredStats.length
  )) {
    throw new RangeError('Invalid preferred stats');
  }
}

function eligible(def: AffixDefinition, input: AffixRollInput): boolean {
  return input.itemLevel >= def.minItemLevel
    && RARITY_ORDER.indexOf(input.rarity) >= RARITY_ORDER.indexOf(def.minRarity)
    && def.requiredTags.every(tag => input.tags.includes(tag))
    && def.excludedTags.every(tag => !input.tags.includes(tag));
}

function validUnit(rng: AffixRng): number {
  const n = rng.next();
  if (!Number.isFinite(n) || n < 0 || n >= 1) {
    throw new RangeError('Seeded RNG must return a finite value in [0, 1)');
  }
  return n;
}

function weightedPick<T>(entries: readonly T[], weight: (entry: T) => number, rng: AffixRng): T {
  const total = entries.reduce((sum, entry) => sum + weight(entry), 0);
  if (!Number.isFinite(total) || total <= 0) throw new RangeError('Empty weighted affix pool');
  let choice = validUnit(rng) * total;
  for (const entry of entries) {
    choice -= weight(entry);
    if (choice < 0) return entry;
  }
  // Floating point rounding guard; does not consume randomness or change pool order.
  return entries[entries.length - 1]!;
}

function definitionWeight(def: AffixDefinition, input: AffixRollInput): number {
  const preferred = input.preferredStats?.includes(def.stat) ? 4 : 1;
  const special = def.special
    ? input.rarity === 'LEGENDARY' ? 1.5 : 0.25
    : 1;
  return def.weight * preferred * special;
}

function tierFor(input: AffixRollInput, rng: AffixRng): AffixTierDefinition {
  const maxTier = RARITY_RULES[input.rarity].maxTier;
  const available = AFFIX_TIERS.filter(tier =>
    tier.tier <= maxTier && tier.minItemLevel <= input.itemLevel
  );
  return weightedPick(available, tier => tier.tier * tier.tier, rng);
}

function affixValue(def: AffixDefinition, multiplier: number, rng: AffixRng): number {
  const unscaled = def.min + (def.max - def.min) * validUnit(rng);
  const scaled = unscaled * multiplier;
  return def.decimal ? Math.round(scaled * 10) / 10 : Math.round(scaled);
}

/**
 * Rolls up to the rarity's fixed affix cap, with alternating prefix/suffix slots.
 * Caller supplies a seeded RNG; neither generator nor formatting reads global state.
 */
export function rollAffixes(input: AffixRollInput, rng: AffixRng): readonly RolledAffix[] {
  assertInput(input);
  if (!rng || typeof rng.next !== 'function') {
    throw new TypeError('Expected an explicit seeded RNG with next()');
  }
  const count = RARITY_RULES[input.rarity].count;
  if (count === 0) return Object.freeze([] as RolledAffix[]);

  const results: RolledAffix[] = [];
  for (let i = 0; i < count; i++) {
    const preferredKind: AffixKind = i % 2 === 0 ? 'prefix' : 'suffix';
    const candidates = ALL_DEFINITIONS.filter(def =>
      eligible(def, input)
      && !results.some(other => {
        const previous = BY_ID.get(other.id)!;
        return other.id === def.id || other.stat === def.stat
          || (def.exclusionGroup !== undefined && previous.exclusionGroup === def.exclusionGroup);
      })
    );
    const pool = candidates.filter(def => def.kind === preferredKind);
    const choices = pool.length ? pool : candidates;
    if (!choices.length) break;
    const selected = weightedPick(choices, def => definitionWeight(def, input), rng);
    const tier = tierFor(input, rng);
    results.push(Object.freeze({
      id: selected.id,
      kind: selected.kind,
      stat: selected.stat,
      tier: tier.tier,
      value: affixValue(selected, tier.multiplier, rng)
    }));
  }
  return Object.freeze(results);
}

/** Validate both structural compatibility and optional item-level/tag/rarity gating. */
export function validateAffixCombination(
  affixes: readonly RolledAffix[],
  input?: AffixRollInput
): boolean {
  if (!Array.isArray(affixes) || affixes.length > 5) return false;
  if (input) {
    try { assertInput(input); } catch { return false; }
    if (affixes.length > RARITY_RULES[input.rarity].count) return false;
  }

  const seenIds = new Set<string>();
  const seenStats = new Set<AffixStat>();
  const seenGroups = new Set<string>();
  for (const affix of affixes) {
    if (!affix || typeof affix !== 'object' || typeof affix.id !== 'string') return false;
    const def = BY_ID.get(affix.id);
    const tier = AFFIX_TIERS.find(entry => entry.tier === affix.tier);
    if (!def || !tier || affix.kind !== def.kind || affix.stat !== def.stat
      || !Number.isFinite(affix.value) || affix.value <= 0 || affix.value > 100000
      || seenIds.has(affix.id) || seenStats.has(def.stat)
      || (def.exclusionGroup !== undefined && seenGroups.has(def.exclusionGroup))) return false;
    if (input && (!eligible(def, input)
      || tier.minItemLevel > input.itemLevel
      || tier.tier > RARITY_RULES[input.rarity].maxTier)) return false;
    seenIds.add(affix.id);
    seenStats.add(def.stat);
    if (def.exclusionGroup) seenGroups.add(def.exclusionGroup);
  }
  return true;
}

type CzechGender = 'masculine' | 'feminine' | 'neuter' | 'plural';
type PrefixName = Readonly<{ en: string; cs: Readonly<Record<CzechGender, string>> }>;
type SuffixName = Readonly<{ en: string; cs: string }>;
type BaseName = Readonly<{ en: string; cs: string; gender: CzechGender }>;

function adjective(en: string, masculine: string, feminine: string,
  neuter: string, plural = neuter): PrefixName {
  return Object.freeze({ en, cs: Object.freeze({ masculine, feminine, neuter, plural }) });
}

const PREFIX_NAMES: Readonly<Record<string, PrefixName>> = Object.freeze({
  mighty: adjective('Mighty', 'Mocný', 'Mocná', 'Mocné'),
  nimble: adjective('Nimble', 'Hbitý', 'Hbitá', 'Hbité'),
  sage: adjective('Sage', 'Učený', 'Učená', 'Učené'),
  vital: adjective('Vital', 'Životodárný', 'Životodárná', 'Životodárné'),
  keen: adjective('Keen', 'Ostrozraký', 'Ostrozraká', 'Ostrozraké'),
  swift: adjective('Swift', 'Rychlý', 'Rychlá', 'Rychlé'),
  fleet: adjective('Fleet', 'Lehký', 'Lehká', 'Lehké'),
  scorching: adjective('Scorching', 'Planoucí', 'Planoucí', 'Planoucí'),
  brutal: adjective('Brutal', 'Brutální', 'Brutální', 'Brutální'),
  venomous: adjective('Venomous', 'Jedovatý', 'Jedovatá', 'Jedovaté'),
  unyielding: adjective('Unyielding', 'Nezlomný', 'Nezlomná', 'Nezlomné'),
  channeling: adjective('Channeling', 'Soustředěný', 'Soustředěná', 'Soustředěné'),
  arcane: adjective('Arcane', 'Arkánní', 'Arkánní', 'Arkánní'),
  summoning: adjective('Summoning', 'Vyvolávací', 'Vyvolávací', 'Vyvolávací'),
  consecrated: adjective('Consecrated','Posvěcený','Posvěcená','Posvěcené'),
  flamebound: adjective('Flamebound','Ohnivý','Ohnivá','Ohnivé'),
  frostwoven: adjective('Frostwoven','Mrazivý','Mrazivá','Mrazivé'),
  stormtouched: adjective('Stormtouched','Bouřný','Bouřná','Bouřné'),
  runecharged: adjective('Runecharged','Runový','Runová','Runové')
});

const SUFFIX_NAMES: Readonly<Record<string, SuffixName>> = Object.freeze({
  bear: { en: 'of the Bear', cs: 'medvědí síly' },
  fox: { en: 'of the Fox', cs: 'liščí hbitosti' },
  owl: { en: 'of the Owl', cs: 'soví moudrosti' },
  oak: { en: 'of the Oak', cs: 'dubové síly' },
  precision: { en: 'of Precision', cs: 'přesnosti' },
  flames: { en: 'of Flames', cs: 'ohně' },
  frost: { en: 'of Frost', cs: 'mrazu' },
  antidote: { en: 'of Antidotes', cs: 'protijedu' },
  celerity: { en: 'of Celerity', cs: 'rychlosti' },
  fury: { en: 'of Fury', cs: 'zuřivosti' },
  renewal: { en: 'of Renewal', cs: 'obnovy' },
  focus: { en: 'of Focus', cs: 'soustředění' },
  ember: { en: 'of Embers', cs: 'žhavých uhlíků' },
  venom: { en: 'of Venom', cs: 'jedu' },
  mastery: { en: 'of Mastery', cs: 'mistrovství' },
  legion: { en: 'of the Legion', cs: 'legií' },
  fortitude: { en: 'of Fortitude', cs: 'odolnosti' },
  ofFaith: {en:'of Faith',cs:'víry'},
  ofCinders: {en:'of Cinders',cs:'žhavých uhlíků'},
  ofWinter: {en:'of Winter',cs:'zimy'},
  ofThunder: {en:'of Thunder',cs:'hromu'},
  ofMysteries: {en:'of Mysteries',cs:'tajemství'}
});
for (const label of Object.values(SUFFIX_NAMES)) Object.freeze(label);

/** Read-only bridge for legacy base IDs; unknown ItemCatalog IDs remain unresolved. */
const BASE_NAMES: Readonly<Record<string, BaseName>> = Object.freeze({
  broadsword: { en: 'Broadsword', cs: 'široký meč', gender: 'masculine' },
  shield: { en: 'Shield', cs: 'štít', gender: 'masculine' },
  hauberk: { en: 'Hauberk', cs: 'kroužková zbroj', gender: 'feminine' },
  helm: { en: 'Helm', cs: 'přilba', gender: 'feminine' },
  gauntlets: { en: 'Gauntlets', cs: 'rukavice', gender: 'plural' },
  greaves: { en: 'Greaves', cs: 'holenní chrániče', gender: 'plural' },
  belt: { en: 'Belt', cs: 'opasek', gender: 'masculine' },
  bloodstone: { en: 'Bloodstone', cs: 'krvavý kámen', gender: 'masculine' },
  signet: { en: 'Signet', cs: 'pečetní prsten', gender: 'masculine' },
  greatsword: { en: 'Greatsword', cs: 'velký meč', gender: 'masculine' },
  axe: { en: 'Battle Axe', cs: 'sekera', gender: 'feminine' },
  greataxe: { en: 'Greataxe', cs: 'obouruční sekera', gender: 'feminine' },
  mace: { en: 'Mace', cs: 'palcát', gender: 'masculine' },
  hammer: { en: 'Great Hammer', cs: 'kladivo', gender: 'neuter' },
  dagger: { en: 'Dagger', cs: 'dýka', gender: 'feminine' },
  spear: { en: 'Spear', cs: 'kopí', gender: 'neuter' },
  bow: { en: 'Bow', cs: 'luk', gender: 'masculine' },
  crossbow: { en: 'Crossbow', cs: 'kuše', gender: 'feminine' },
  staff: { en: 'Arcane Staff', cs: 'hůl', gender: 'feminine' },
  wand: { en: 'Wand', cs: 'hůlka', gender: 'feminine' },
  spellbook: { en: 'Spellbook', cs: 'kniha kouzel', gender: 'feminine' },
  relic: { en: 'Ancient Relic', cs: 'relikvie', gender: 'feminine' },
  charm: { en: 'Protective Charm', cs: 'talisman', gender: 'masculine' }
});
for (const label of Object.values(BASE_NAMES)) Object.freeze(label);

/**
 * Stable IDs and translation keys never depend on locale, affix value, or RNG.
 * The integrator can localize unknown base IDs through itemCatalog before rendering.
 */
export function formatItemNameSegments(
  baseId: string,
  affixes: readonly RolledAffix[],
  locale: AffixLocale
): FormattedItemNameSegments {
  if (typeof baseId !== 'string' || !baseId.trim() || baseId !== baseId.trim()
    || (locale !== 'cs' && locale !== 'en') || !validateAffixCombination(affixes)) {
    throw new RangeError('Invalid item-name formatting arguments');
  }
  const base = Object.prototype.hasOwnProperty.call(BASE_NAMES, baseId)
    ? BASE_NAMES[baseId] : undefined;
  const gender: CzechGender = base?.gender ?? 'masculine';
  const sorted = [...affixes].sort((a, b) =>
    a.kind === b.kind
      ? a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      : a.kind === 'prefix' ? -1 : 1
  );
  const prefixes: ItemNamePart[] = sorted
    .filter(affix => affix.kind === 'prefix')
    .map(affix => Object.freeze({
      kind: 'prefix' as const, id: affix.id, key: `affix.prefix.${affix.id}`,
      text: locale === 'en' ? PREFIX_NAMES[affix.id]?.en ?? null
        : PREFIX_NAMES[affix.id]?.cs[gender] ?? null
    }));
  const suffixes: ItemNamePart[] = sorted
    .filter(affix => affix.kind === 'suffix')
    .map(affix => Object.freeze({
      kind: 'suffix' as const, id: affix.id, key: `affix.suffix.${affix.id}`,
      text: SUFFIX_NAMES[affix.id]?.[locale] ?? null
    }));
  const basePart: ItemNamePart = Object.freeze({
    kind: 'base' as const, id: baseId, key: `item.base.${baseId}`,
    text: base?.[locale] ?? null
  });
  const parts = Object.freeze([...prefixes, basePart, ...suffixes]);
  const resolvedBase = base !== undefined;
  const text = parts.every(part => part.text !== null)
    ? parts.map(part => part.text).join(' ')
    : null;
  return Object.freeze({ baseId, locale, resolvedBase, parts, text });
}
