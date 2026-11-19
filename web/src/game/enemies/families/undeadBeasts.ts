/**
 * Act I undead and beast encounter data. References only: the integrator must
 * provide matching loot tables and Phaser sprite/animation keys before spawning.
 * GPL-3.0-only; no runtime side effects, timers, or random choices.
 */
export type UndeadBeastMonsterId =
  | 'skeleton' | 'skeletonArcher' | 'skeletonMage' | 'ghoul'
  | 'zombie' | 'wolf' | 'spider' | 'corruptedBoar';

export type UndeadBeastFamily = 'undead' | 'beast';

/** Canonical AI role names from Wave B, defined locally to avoid agent dependencies. */
export type UndeadBeastArchetypeId =
  | 'meleeAggressor' | 'rangedAttacker' | 'defensive' | 'healer'
  | 'summoner' | 'ambusher' | 'charger' | 'caster' | 'support';

export type UndeadBeastAttackStyle = 'melee' | 'ranged' | 'caster' | 'ambush' | 'charge';
export type UndeadBeastAbilityKind = 'melee' | 'projectile' | 'area' | 'leap' | 'charge';
export type UndeadBeastStatusEffectId = 'poison' | 'bleed' | 'slow';

/** Data-only action descriptor. Durations and cooldowns are in simulation seconds. */
export interface UndeadBeastAbility {
  readonly id: string;
  readonly kind: UndeadBeastAbilityKind;
  readonly cooldownSeconds: number;
  readonly windupSeconds: number;
  readonly range: number;
  readonly damageMultiplier: number;
  readonly areaRadius?: number;
  readonly statusEffectId?: UndeadBeastStatusEffectId;
  readonly statusDurationSeconds?: number;
}

/** Combat ranges and speeds use current simulation world units. */
export interface UndeadBeastMonsterDefinition {
  readonly id: UndeadBeastMonsterId;
  readonly family: UndeadBeastFamily;
  readonly archetypeId: UndeadBeastArchetypeId;
  readonly attackStyle: UndeadBeastAttackStyle;
  readonly health: number;
  readonly speed: number;
  readonly baseDamage: number;
  readonly aggroRange: number;
  readonly attackRange: number;
  readonly preferredDistance: number;
  readonly lootTableId: string;
  /** Placeholder asset references; this module does not load or register sprites. */
  readonly spriteKey: string;
  readonly animationKey: string;
  readonly abilities: readonly UndeadBeastAbility[];
}

/** Freeze at every depth so catalog lookups can safely share instances. */
function defineMonster(def: UndeadBeastMonsterDefinition): UndeadBeastMonsterDefinition {
  return Object.freeze({
    ...def,
    abilities: Object.freeze(def.abilities.map(ability => Object.freeze({ ...ability })))
  });
}

export const UNDEAD_BEAST_MONSTERS: readonly UndeadBeastMonsterDefinition[] = Object.freeze([
  defineMonster({
    id: 'skeleton', family: 'undead', archetypeId: 'meleeAggressor',
    attackStyle: 'melee', health: 100, speed: 82, baseDamage: 15,
    aggroRange: 320, attackRange: 76, preferredDistance: 58,
    lootTableId: 'act1_undead_common', spriteKey: 'enemy_skeleton',
    animationKey: 'enemy_skeleton_attack',
    abilities: [
      { id: 'skeletonBoneSlash', kind: 'melee', cooldownSeconds: 2.15,
        windupSeconds: 0.78, range: 76, damageMultiplier: 1 }
    ]
  }),
  defineMonster({
    id: 'skeletonArcher', family: 'undead', archetypeId: 'rangedAttacker',
    attackStyle: 'ranged', health: 68, speed: 86, baseDamage: 11,
    aggroRange: 350, attackRange: 255, preferredDistance: 198,
    lootTableId: 'act1_undead_common', spriteKey: 'enemy_skeleton_archer',
    animationKey: 'enemy_skeleton_archer_shoot',
    abilities: [
      { id: 'skeletonArcherBoneArrow', kind: 'projectile', cooldownSeconds: 2.4,
        windupSeconds: 0.9, range: 255, damageMultiplier: 1 }
    ]
  }),
  defineMonster({
    id: 'skeletonMage', family: 'undead', archetypeId: 'caster',
    attackStyle: 'caster', health: 62, speed: 76, baseDamage: 13,
    aggroRange: 365, attackRange: 260, preferredDistance: 208,
    lootTableId: 'act1_undead_caster', spriteKey: 'enemy_skeleton_mage',
    animationKey: 'enemy_skeleton_mage_cast',
    abilities: [
      { id: 'skeletonMageShadowBolt', kind: 'projectile', cooldownSeconds: 2.8,
        windupSeconds: 1.1, range: 260, damageMultiplier: 1.05 },
      { id: 'skeletonMageFrostNova', kind: 'area', cooldownSeconds: 6,
        windupSeconds: 1.35, range: 115, areaRadius: 115, damageMultiplier: 0.65,
        statusEffectId: 'slow', statusDurationSeconds: 2 }
    ]
  }),
  defineMonster({
    id: 'ghoul', family: 'undead', archetypeId: 'ambusher',
    attackStyle: 'ambush', health: 88, speed: 122, baseDamage: 18,
    aggroRange: 345, attackRange: 85, preferredDistance: 60,
    lootTableId: 'act1_undead_common', spriteKey: 'enemy_ghoul',
    animationKey: 'enemy_ghoul_pounce',
    abilities: [
      { id: 'ghoulPounce', kind: 'leap', cooldownSeconds: 4.2,
        windupSeconds: 0.65, range: 195, damageMultiplier: 1.35 },
      { id: 'ghoulRendingClaws', kind: 'melee', cooldownSeconds: 2.5,
        windupSeconds: 0.6, range: 85, damageMultiplier: 0.85,
        statusEffectId: 'bleed', statusDurationSeconds: 3 }
    ]
  }),
  defineMonster({
    id: 'zombie', family: 'undead', archetypeId: 'defensive',
    attackStyle: 'melee', health: 155, speed: 52, baseDamage: 17,
    aggroRange: 290, attackRange: 72, preferredDistance: 46,
    lootTableId: 'act1_undead_common', spriteKey: 'enemy_zombie',
    animationKey: 'enemy_zombie_slam',
    abilities: [
      { id: 'zombieHeavySlam', kind: 'melee', cooldownSeconds: 3.6,
        windupSeconds: 1.3, range: 72, damageMultiplier: 1.5 }
    ]
  }),
  defineMonster({
    id: 'wolf', family: 'beast', archetypeId: 'ambusher',
    attackStyle: 'ambush', health: 82, speed: 138, baseDamage: 13,
    aggroRange: 380, attackRange: 82, preferredDistance: 60,
    lootTableId: 'act1_beast_common', spriteKey: 'enemy_wolf',
    animationKey: 'enemy_wolf_leap',
    abilities: [
      { id: 'wolfPounce', kind: 'leap', cooldownSeconds: 3.1,
        windupSeconds: 0.95, range: 190, damageMultiplier: 1.25 },
      { id: 'wolfBite', kind: 'melee', cooldownSeconds: 2.1,
        windupSeconds: 0.45, range: 82, damageMultiplier: 0.9 }
    ]
  }),
  defineMonster({
    id: 'spider', family: 'beast', archetypeId: 'ambusher',
    attackStyle: 'ambush', health: 66, speed: 122, baseDamage: 11,
    aggroRange: 335, attackRange: 90, preferredDistance: 66,
    lootTableId: 'act1_beast_venom', spriteKey: 'enemy_spider',
    animationKey: 'enemy_spider_bite',
    abilities: [
      { id: 'spiderVenomBite', kind: 'melee', cooldownSeconds: 2.4,
        windupSeconds: 0.5, range: 90, damageMultiplier: 0.8,
        statusEffectId: 'poison', statusDurationSeconds: 4 },
      { id: 'spiderWebSpit', kind: 'projectile', cooldownSeconds: 5,
        windupSeconds: 0.9, range: 190, damageMultiplier: 0,
        statusEffectId: 'slow', statusDurationSeconds: 2.5 }
    ]
  }),
  defineMonster({
    id: 'corruptedBoar', family: 'beast', archetypeId: 'charger',
    attackStyle: 'charge', health: 185, speed: 114, baseDamage: 24,
    aggroRange: 380, attackRange: 95, preferredDistance: 68,
    lootTableId: 'act1_beast_corrupted', spriteKey: 'enemy_corrupted_boar',
    animationKey: 'enemy_corrupted_boar_charge',
    abilities: [
      { id: 'corruptedBoarTuskCharge', kind: 'charge', cooldownSeconds: 4.5,
        windupSeconds: 1.15, range: 230, damageMultiplier: 1.6 },
      { id: 'corruptedBoarGore', kind: 'melee', cooldownSeconds: 2.7,
        windupSeconds: 0.7, range: 95, damageMultiplier: 1 }
    ]
  })
]);

/** Accept unknown external IDs without string coercion or prototype lookups. */
export function getUndeadBeastMonster(id: unknown): UndeadBeastMonsterDefinition | undefined {
  return typeof id === 'string'
    ? UNDEAD_BEAST_MONSTERS.find(monster => monster.id === id)
    : undefined;
}
