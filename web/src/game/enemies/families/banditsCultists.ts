/**
 * Act I bandit/cultist data only. The coordinator owns spawn, AI and combat integration.
 * Sprite/animation keys are references to future assets, not bundled artwork.
 */

export type BanditCultistMonsterId =
  | 'banditFighter'
  | 'banditArcher'
  | 'banditRogue'
  | 'fanatic'
  | 'cultMage'
  | 'cultHealer';

export type BanditCultistFamily = 'bandit' | 'cultist';

/** Matches the documented Wave B planner IDs without importing another agent module. */
export type BanditCultistArchetypeId =
  | 'meleeAggressor'
  | 'rangedAttacker'
  | 'defensive'
  | 'healer'
  | 'summoner'
  | 'ambusher'
  | 'charger'
  | 'caster'
  | 'support';

export type BanditCultistAttackStyle = 'melee' | 'ranged' | 'magic' | 'support';

interface BaseMonsterAbility {
  readonly id: string;
  /** Seconds between attempts; the future simulation owns cooldown state. */
  readonly cooldown: number;
  /** Maximum effect distance in world units. */
  readonly range: number;
}

/** Effect descriptors are inert: no damage, healing or status ticks occur here. */
export type BanditCultistAbility =
  | (BaseMonsterAbility & Readonly<{
      kind: 'damage';
      target: 'enemy';
      amount: number;
    }>)
  | (BaseMonsterAbility & Readonly<{
      kind: 'heal';
      target: 'lowestHealthAlly';
      amount: number;
    }>)
  | (BaseMonsterAbility & Readonly<{
      kind: 'buff';
      target: 'nearbyAllies';
      effect: 'damageBonus' | 'damageReduction';
      /** Fractional effect strength (0–1). */
      magnitude: number;
      duration: number;
    }>)
  | (BaseMonsterAbility & Readonly<{
      kind: 'debuff';
      target: 'enemy';
      effect: 'slow';
      /** Fractional movement speed reduction (0–1). */
      magnitude: number;
      duration: number;
    }>);

export interface BanditCultistMonsterDefinition {
  readonly id: BanditCultistMonsterId;
  readonly family: BanditCultistFamily;
  readonly archetypeId: BanditCultistArchetypeId;
  readonly attackStyle: BanditCultistAttackStyle;
  readonly health: number;
  readonly speed: number;
  readonly baseDamage: number;
  readonly aggroRange: number;
  readonly attackRange: number;
  readonly preferredDistance: number;
  readonly lootTableId: string;
  readonly spriteKey: string;
  readonly animationKey: string;
  readonly abilities: readonly BanditCultistAbility[];
}

/** Freeze nested action data so consumers cannot corrupt shared catalog definitions. */
function defineMonster(monster: BanditCultistMonsterDefinition): BanditCultistMonsterDefinition {
  return Object.freeze({
    ...monster,
    abilities: Object.freeze(monster.abilities.map(ability => Object.freeze({ ...ability })))
  });
}

/**
 * Six reusable archetypes with intentionally different approach ranges and abilities.
 * All numeric values are fixed, finite design-time constants; no runtime RNG is used.
 */
export const BANDIT_CULTIST_MONSTERS: readonly BanditCultistMonsterDefinition[] = Object.freeze([
  defineMonster({
    id: 'banditFighter',
    family: 'bandit',
    archetypeId: 'meleeAggressor',
    attackStyle: 'melee',
    health: 145,
    speed: 92,
    baseDamage: 18,
    aggroRange: 320,
    attackRange: 75,
    preferredDistance: 52,
    lootTableId: 'act1Bandit',
    spriteKey: 'enemies/banditFighter',
    animationKey: 'enemies/banditFighter/attack',
    abilities: [
      { id: 'shieldBash', kind: 'damage', target: 'enemy', amount: 26, cooldown: 5.5, range: 70 }
    ]
  }),
  defineMonster({
    id: 'banditArcher',
    family: 'bandit',
    archetypeId: 'rangedAttacker',
    attackStyle: 'ranged',
    health: 88,
    speed: 84,
    baseDamage: 14,
    aggroRange: 400,
    attackRange: 280,
    preferredDistance: 215,
    lootTableId: 'act1Bandit',
    spriteKey: 'enemies/banditArcher',
    animationKey: 'enemies/banditArcher/shoot',
    abilities: [
      { id: 'piercingArrow', kind: 'damage', target: 'enemy', amount: 23, cooldown: 5, range: 275 }
    ]
  }),
  defineMonster({
    id: 'banditRogue',
    family: 'bandit',
    archetypeId: 'ambusher',
    attackStyle: 'melee',
    health: 96,
    speed: 138,
    baseDamage: 19,
    aggroRange: 335,
    attackRange: 65,
    preferredDistance: 38,
    lootTableId: 'act1Bandit',
    spriteKey: 'enemies/banditRogue',
    animationKey: 'enemies/banditRogue/stab',
    abilities: [
      { id: 'backstab', kind: 'damage', target: 'enemy', amount: 34, cooldown: 7, range: 60 }
    ]
  }),
  defineMonster({
    id: 'fanatic',
    family: 'cultist',
    archetypeId: 'charger',
    attackStyle: 'melee',
    health: 165,
    speed: 115,
    baseDamage: 21,
    aggroRange: 380,
    attackRange: 85,
    preferredDistance: 57,
    lootTableId: 'act1Cultist',
    spriteKey: 'enemies/fanatic',
    animationKey: 'enemies/fanatic/charge',
    abilities: [
      { id: 'recklessRush', kind: 'damage', target: 'enemy', amount: 30, cooldown: 8, range: 150 },
      { id: 'frenzyChant', kind: 'buff', target: 'nearbyAllies', effect: 'damageBonus',
        magnitude: 0.15, duration: 5, cooldown: 13, range: 180 }
    ]
  }),
  defineMonster({
    id: 'cultMage',
    family: 'cultist',
    archetypeId: 'caster',
    attackStyle: 'magic',
    health: 86,
    speed: 74,
    baseDamage: 16,
    aggroRange: 420,
    attackRange: 290,
    preferredDistance: 220,
    lootTableId: 'act1Cultist',
    spriteKey: 'enemies/cultMage',
    animationKey: 'enemies/cultMage/cast',
    abilities: [
      { id: 'shadowBolt', kind: 'damage', target: 'enemy', amount: 25, cooldown: 4.5, range: 285 },
      { id: 'bindingHex', kind: 'debuff', target: 'enemy', effect: 'slow',
        magnitude: 0.3, duration: 3, cooldown: 10, range: 245 }
    ]
  }),
  defineMonster({
    id: 'cultHealer',
    family: 'cultist',
    archetypeId: 'healer',
    attackStyle: 'support',
    health: 108,
    speed: 77,
    baseDamage: 8,
    aggroRange: 360,
    attackRange: 230,
    preferredDistance: 195,
    lootTableId: 'act1Cultist',
    spriteKey: 'enemies/cultHealer',
    animationKey: 'enemies/cultHealer/channel',
    abilities: [
      { id: 'unholyMend', kind: 'heal', target: 'lowestHealthAlly',
        amount: 36, cooldown: 6.5, range: 220 },
      { id: 'darkAegis', kind: 'buff', target: 'nearbyAllies', effect: 'damageReduction',
        magnitude: 0.2, duration: 6, cooldown: 14, range: 205 }
    ]
  })
]);

/**
 * Read-only lookup. Unknown, non-string or prototype-like IDs never resolve.
 * Returns the shared immutable catalog object; callers must not mutate it.
 */
export function getBanditCultistMonster(id: unknown): BanditCultistMonsterDefinition | undefined {
  return typeof id === 'string'
    ? BANDIT_CULTIST_MONSTERS.find(monster => monster.id === id)
    : undefined;
}
