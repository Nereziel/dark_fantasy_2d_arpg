// GPL-3.0-only — Prompt 30. Pure, reusable rank/branch/effect planner.
// Gameplay/loot/character state remain exclusively authoritative in GameSimulation.
import type { DerivedStats } from '../stats/deriveStats';
import { MAGE_TALENT_TREE as MAGE_SCHOOLS, type MageTalentId } from '../skills/mageKit';

export type TalentBranch = 'berserker' | 'guardian' | 'warlord'
  | 'holyWarrior' | 'paladinGuardian' | 'auraMaster' | 'holyCaster'
  | 'fire' | 'frost' | 'lightning' | 'arcane'
  | 'bone' | 'summoning' | 'blood'
  | 'assassin' | 'shadow' | 'trapper'
  | 'demonology' | 'corruption' | 'soul';
export type WarriorTalentId =
  | 'berserker.battleFury' | 'berserker.bloodlust'
  | 'berserker.executioner' | 'berserker.lastStand'
  | 'guardian.ironSkin' | 'guardian.shieldMastery'
  | 'guardian.stalwart' | 'guardian.bulwark'
  | 'warlord.commandingCry' | 'warlord.shockwave'
  | 'warlord.warDrums' | 'warlord.commander';
export type PaladinTalentId = 'paladin.zeal' | 'paladin.righteousFire'
  | 'paladin.aegis' | 'paladin.bulwark'
  | 'paladin.hymn' | 'paladin.benediction'
  | 'paladin.prayer' | 'paladin.inquisition';
export type NecromancerTalentId =
  | 'necro.boneSpear' | 'necro.boneFracture' | 'necro.corpseMastery'
  | 'necro.legion' | 'necro.golemCore' | 'necro.soulLink'
  | 'necro.bloodTithe' | 'necro.crimsonCurse' | 'necro.plagueNova';
export type RogueTalentId =
  | 'rogue.precision' | 'rogue.execution' | 'rogue.hemorrhage'
  | 'rogue.veil' | 'rogue.ambush' | 'rogue.shadowHaste'
  | 'rogue.venom' | 'rogue.binding' | 'rogue.serration';
export type WarlockTalentId =
  | 'warlock.abyssalPower' | 'warlock.demonBlood' | 'warlock.soulPact'
  | 'warlock.blight' | 'warlock.hex' | 'warlock.torment'
  | 'warlock.shadowBolt' | 'warlock.hellfireReach' | 'warlock.soulFeast';
export type TalentId = WarriorTalentId | PaladinTalentId | MageTalentId
  | NecromancerTalentId | RogueTalentId | WarlockTalentId;
export type TalentRanks = Partial<Record<TalentId, number>>;

export interface TalentBonuses {
  armor: number;
  maxHealth: number;
  maxResource: number;
  resourceRegen: number;
  attackSpeed: number;
  blockChance: number;
  critChance: number;
  rageGain: number;
  warCryDuration: number;
  warCryStrength: number;
  warCryRage: number;
  stunDuration: number;
  shieldOnWarCryPercent: number;
  lowHealthDamageMultiplier: number;
  /** Paladin-only effect projections; inactive for every Warrior build. */
  holyDamage: number;
  healBonus: number;
  shieldStrength: number;
  auraStrength: number;
  auraDuration: number;
  faithRegen: number;
  /** Mage-only projections; they never affect Warrior or Paladin rank builds. */
  spellPower: number;
  burnDuration: number;
  areaRadius: number;
  coldSlow: number;
  chillDuration: number;
  manaRegen: number;
  chainDamage: number;
  chainCount: number;
  lightningCrit: number;
  manaEfficiency: number;
  barrierStrength: number;
  teleportCooldown: number;
  /** Class-specific authoritative modifiers applied by simulation at cast/hit frame. */
  necroBoneDamage: number;
  necroCorpseRadius: number;
  necroCorpsePoison: number;
  necroSkeletonPower: number;
  necroGolemPower: number;
  necroSummonHealth: number;
  necroDrainHeal: number;
  necroCurseDuration: number;
  necroNovaRadius: number;
  rogueBackstabPower: number;
  rogueKnivesBleedDuration: number;
  rogueStealthDuration: number;
  rogueStealthStrike: number;
  rogueStepHaste: number;
  rogueTrapDamage: number;
  rogueTrapRootDuration: number;
  rogueTrapPoisonDuration: number;
  warlockDemonPower: number;
  warlockDemonHealth: number;
  warlockDemonLeech: number;
  warlockPoisonDamage: number;
  warlockCurseDuration: number;
  warlockCurseWeakness: number;
  warlockBoltDamage: number;
  warlockHellfireRadius: number;
  warlockBoltLeech: number;
}
export type TalentEffectKey = keyof TalentBonuses;
export type TalentEffectKind = 'stat' | 'skill' | 'passive' | 'conditional';
export interface TalentEffect {
  readonly kind: TalentEffectKind;
  readonly key: TalentEffectKey;
  readonly perRank: number;
}
export interface TalentPrerequisite {
  readonly id: TalentId;
  readonly minRank: number;
}
export interface TalentDefinition {
  readonly id: TalentId;
  readonly classId?: 'PALADIN' | 'MAGE' | 'NECROMANCER' | 'ROGUE' | 'WARLOCK';
  readonly branch: TalentBranch;
  readonly unlockLevel: number;
  readonly maxRank: number;
  readonly prerequisites: readonly TalentPrerequisite[];
  readonly effects: readonly TalentEffect[];
}

export const TALENT_TREE: readonly TalentDefinition[] = [
  {id:'berserker.battleFury',branch:'berserker',unlockLevel:5,maxRank:3,
    prerequisites:[],effects:[
      {kind:'skill',key:'rageGain',perRank:2},
      {kind:'stat',key:'maxResource',perRank:3}
    ]},
  {id:'berserker.bloodlust',branch:'berserker',unlockLevel:10,maxRank:3,
    prerequisites:[{id:'berserker.battleFury',minRank:1}],effects:[
      {kind:'stat',key:'attackSpeed',perRank:0.06}
    ]},
  {id:'berserker.executioner',branch:'berserker',unlockLevel:15,maxRank:3,
    prerequisites:[{id:'berserker.bloodlust',minRank:1}],effects:[
      {kind:'stat',key:'critChance',perRank:2.5}
    ]},
  {id:'berserker.lastStand',branch:'berserker',unlockLevel:20,maxRank:2,
    prerequisites:[{id:'berserker.executioner',minRank:1}],effects:[
      {kind:'conditional',key:'lowHealthDamageMultiplier',perRank:0.14}
    ]},
  {id:'guardian.ironSkin',branch:'guardian',unlockLevel:5,maxRank:3,
    prerequisites:[],effects:[
      {kind:'stat',key:'armor',perRank:16}
    ]},
  {id:'guardian.shieldMastery',branch:'guardian',unlockLevel:10,maxRank:3,
    prerequisites:[{id:'guardian.ironSkin',minRank:1}],effects:[
      {kind:'stat',key:'blockChance',perRank:4}
    ]},
  {id:'guardian.stalwart',branch:'guardian',unlockLevel:15,maxRank:3,
    prerequisites:[{id:'guardian.shieldMastery',minRank:1}],effects:[
      {kind:'stat',key:'maxHealth',perRank:24}
    ]},
  {id:'guardian.bulwark',branch:'guardian',unlockLevel:20,maxRank:2,
    prerequisites:[{id:'guardian.stalwart',minRank:1}],effects:[
      {kind:'passive',key:'shieldOnWarCryPercent',perRank:0.08}
    ]},
  {id:'warlord.commandingCry',branch:'warlord',unlockLevel:5,maxRank:3,
    prerequisites:[],effects:[
      {kind:'skill',key:'warCryDuration',perRank:1.5}
    ]},
  {id:'warlord.shockwave',branch:'warlord',unlockLevel:10,maxRank:3,
    prerequisites:[{id:'warlord.commandingCry',minRank:1}],effects:[
      {kind:'skill',key:'stunDuration',perRank:0.25}
    ]},
  {id:'warlord.warDrums',branch:'warlord',unlockLevel:15,maxRank:3,
    prerequisites:[{id:'warlord.shockwave',minRank:1}],effects:[
      {kind:'skill',key:'warCryRage',perRank:5},
      {kind:'stat',key:'resourceRegen',perRank:0.2}
    ]},
  {id:'warlord.commander',branch:'warlord',unlockLevel:20,maxRank:2,
    prerequisites:[{id:'warlord.warDrums',minRank:1}],effects:[
      {kind:'skill',key:'warCryStrength',perRank:0.06}
    ]}
] as const;

/** Paladin extends the same skill-tree planner without changing the Warrior's
 * original three branches or talent IDs, so preexisting saves remain stable. */
export const PALADIN_TALENT_TREE:readonly TalentDefinition[]=[
  {id:'paladin.zeal',classId:'PALADIN',branch:'holyWarrior',unlockLevel:5,maxRank:3,
    prerequisites:[],effects:[{kind:'skill',key:'holyDamage',perRank:0.08}]},
  {id:'paladin.righteousFire',classId:'PALADIN',branch:'holyWarrior',unlockLevel:12,maxRank:3,
    prerequisites:[{id:'paladin.zeal',minRank:1}],
    effects:[{kind:'stat',key:'critChance',perRank:1.6}]},
  {id:'paladin.aegis',classId:'PALADIN',branch:'paladinGuardian',unlockLevel:5,maxRank:3,
    prerequisites:[],effects:[{kind:'stat',key:'armor',perRank:13}]},
  {id:'paladin.bulwark',classId:'PALADIN',branch:'paladinGuardian',unlockLevel:12,maxRank:3,
    prerequisites:[{id:'paladin.aegis',minRank:1}],
    effects:[{kind:'skill',key:'shieldStrength',perRank:0.12}]},
  {id:'paladin.hymn',classId:'PALADIN',branch:'auraMaster',unlockLevel:5,maxRank:3,
    prerequisites:[],effects:[{kind:'skill',key:'auraStrength',perRank:0.15}]},
  {id:'paladin.benediction',classId:'PALADIN',branch:'auraMaster',unlockLevel:12,maxRank:3,
    prerequisites:[{id:'paladin.hymn',minRank:1}],
    effects:[{kind:'skill',key:'auraDuration',perRank:2}]},
  {id:'paladin.prayer',classId:'PALADIN',branch:'holyCaster',unlockLevel:5,maxRank:3,
    prerequisites:[],effects:[{kind:'stat',key:'faithRegen',perRank:0.8}]},
  {id:'paladin.inquisition',classId:'PALADIN',branch:'holyCaster',unlockLevel:12,maxRank:3,
    prerequisites:[{id:'paladin.prayer',minRank:1}],
    effects:[{kind:'skill',key:'healBonus',perRank:0.12}]}
] as const;

/** The generic rank planner consumes Mage's four-school descriptor, avoiding a second economy. */
export const MAGE_TALENT_TREE: readonly TalentDefinition[] = Object.freeze(
  MAGE_SCHOOLS.map(node => Object.freeze({
    id: node.id, classId: 'MAGE' as const, branch: node.school,
    unlockLevel: node.minLevel, maxRank: node.maxRank,
    prerequisites: node.requires.map(id => ({ id, minRank: 1 })),
    effects: node.effects.map(effect => ({
      kind: 'skill' as const, key: effect.key, perRank: effect.perRank
    }))
  }))
);

/** Additional classes use identical level gates, rank validation and v11 save schema.
 * Effects are projected here, but committed only by GameSimulation on real events. */
export const NECROMANCER_TALENT_TREE: readonly TalentDefinition[] = [
  { id: 'necro.boneSpear', classId: 'NECROMANCER', branch: 'bone',
    unlockLevel: 5, maxRank: 3, prerequisites: [],
    effects: [{ kind: 'skill', key: 'necroBoneDamage', perRank: 0.11 }] },
  { id: 'necro.boneFracture', classId: 'NECROMANCER', branch: 'bone',
    unlockLevel: 10, maxRank: 3, prerequisites: [{ id: 'necro.boneSpear', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'necroCorpseRadius', perRank: 0.1 }] },
  { id: 'necro.corpseMastery', classId: 'NECROMANCER', branch: 'bone',
    unlockLevel: 15, maxRank: 3, prerequisites: [{ id: 'necro.boneFracture', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'necroCorpsePoison', perRank: 0.2 }] },
  { id: 'necro.legion', classId: 'NECROMANCER', branch: 'summoning',
    unlockLevel: 5, maxRank: 3, prerequisites: [],
    effects: [{ kind: 'skill', key: 'necroSkeletonPower', perRank: 0.14 }] },
  { id: 'necro.golemCore', classId: 'NECROMANCER', branch: 'summoning',
    unlockLevel: 10, maxRank: 3, prerequisites: [{ id: 'necro.legion', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'necroGolemPower', perRank: 0.14 }] },
  { id: 'necro.soulLink', classId: 'NECROMANCER', branch: 'summoning',
    unlockLevel: 15, maxRank: 3, prerequisites: [{ id: 'necro.golemCore', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'necroSummonHealth', perRank: 0.12 }] },
  { id: 'necro.bloodTithe', classId: 'NECROMANCER', branch: 'blood',
    unlockLevel: 5, maxRank: 3, prerequisites: [],
    effects: [{ kind: 'skill', key: 'necroDrainHeal', perRank: 0.09 }] },
  { id: 'necro.crimsonCurse', classId: 'NECROMANCER', branch: 'blood',
    unlockLevel: 10, maxRank: 3, prerequisites: [{ id: 'necro.bloodTithe', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'necroCurseDuration', perRank: 0.15 }] },
  { id: 'necro.plagueNova', classId: 'NECROMANCER', branch: 'blood',
    unlockLevel: 15, maxRank: 3, prerequisites: [{ id: 'necro.crimsonCurse', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'necroNovaRadius', perRank: 0.09 }] }
] as const;

export const ROGUE_TALENT_TREE: readonly TalentDefinition[] = [
  { id: 'rogue.precision', classId: 'ROGUE', branch: 'assassin',
    unlockLevel: 5, maxRank: 3, prerequisites: [],
    effects: [{ kind: 'stat', key: 'critChance', perRank: 2 }] },
  { id: 'rogue.execution', classId: 'ROGUE', branch: 'assassin',
    unlockLevel: 10, maxRank: 3, prerequisites: [{ id: 'rogue.precision', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'rogueBackstabPower', perRank: 0.15 }] },
  { id: 'rogue.hemorrhage', classId: 'ROGUE', branch: 'assassin',
    unlockLevel: 15, maxRank: 3, prerequisites: [{ id: 'rogue.execution', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'rogueKnivesBleedDuration', perRank: 0.2 }] },
  { id: 'rogue.veil', classId: 'ROGUE', branch: 'shadow',
    unlockLevel: 5, maxRank: 3, prerequisites: [],
    effects: [{ kind: 'skill', key: 'rogueStealthDuration', perRank: 0.6 }] },
  { id: 'rogue.ambush', classId: 'ROGUE', branch: 'shadow',
    unlockLevel: 10, maxRank: 3, prerequisites: [{ id: 'rogue.veil', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'rogueStealthStrike', perRank: 0.15 }] },
  { id: 'rogue.shadowHaste', classId: 'ROGUE', branch: 'shadow',
    unlockLevel: 15, maxRank: 3, prerequisites: [{ id: 'rogue.ambush', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'rogueStepHaste', perRank: 0.04 }] },
  { id: 'rogue.venom', classId: 'ROGUE', branch: 'trapper',
    unlockLevel: 5, maxRank: 3, prerequisites: [],
    effects: [{ kind: 'skill', key: 'rogueTrapDamage', perRank: 0.16 }] },
  { id: 'rogue.binding', classId: 'ROGUE', branch: 'trapper',
    unlockLevel: 10, maxRank: 3, prerequisites: [{ id: 'rogue.venom', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'rogueTrapRootDuration', perRank: 0.2 }] },
  { id: 'rogue.serration', classId: 'ROGUE', branch: 'trapper',
    unlockLevel: 15, maxRank: 3, prerequisites: [{ id: 'rogue.binding', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'rogueTrapPoisonDuration', perRank: 0.18 }] }
] as const;

export const WARLOCK_TALENT_TREE: readonly TalentDefinition[] = [
  { id: 'warlock.abyssalPower', classId: 'WARLOCK', branch: 'demonology',
    unlockLevel: 5, maxRank: 3, prerequisites: [],
    effects: [{ kind: 'skill', key: 'warlockDemonPower', perRank: 0.13 }] },
  { id: 'warlock.demonBlood', classId: 'WARLOCK', branch: 'demonology',
    unlockLevel: 10, maxRank: 3, prerequisites: [{ id: 'warlock.abyssalPower', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'warlockDemonHealth', perRank: 0.12 }] },
  { id: 'warlock.soulPact', classId: 'WARLOCK', branch: 'demonology',
    unlockLevel: 15, maxRank: 3, prerequisites: [{ id: 'warlock.demonBlood', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'warlockDemonLeech', perRank: 0.025 }] },
  { id: 'warlock.blight', classId: 'WARLOCK', branch: 'corruption',
    unlockLevel: 5, maxRank: 3, prerequisites: [],
    effects: [{ kind: 'skill', key: 'warlockPoisonDamage', perRank: 0.16 }] },
  { id: 'warlock.hex', classId: 'WARLOCK', branch: 'corruption',
    unlockLevel: 10, maxRank: 3, prerequisites: [{ id: 'warlock.blight', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'warlockCurseDuration', perRank: 0.14 }] },
  { id: 'warlock.torment', classId: 'WARLOCK', branch: 'corruption',
    unlockLevel: 15, maxRank: 3, prerequisites: [{ id: 'warlock.hex', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'warlockCurseWeakness', perRank: 0.04 }] },
  { id: 'warlock.shadowBolt', classId: 'WARLOCK', branch: 'soul',
    unlockLevel: 5, maxRank: 3, prerequisites: [],
    effects: [{ kind: 'skill', key: 'warlockBoltDamage', perRank: 0.13 }] },
  { id: 'warlock.hellfireReach', classId: 'WARLOCK', branch: 'soul',
    unlockLevel: 10, maxRank: 3, prerequisites: [{ id: 'warlock.shadowBolt', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'warlockHellfireRadius', perRank: 0.08 }] },
  { id: 'warlock.soulFeast', classId: 'WARLOCK', branch: 'soul',
    unlockLevel: 15, maxRank: 3, prerequisites: [{ id: 'warlock.hellfireReach', minRank: 1 }],
    effects: [{ kind: 'skill', key: 'warlockBoltLeech', perRank: 0.07 }] }
] as const;


export const allTalentsForClass=(classId:unknown):readonly TalentDefinition[] =>
  classId==='WARRIOR'?TALENT_TREE:classId==='PALADIN'?PALADIN_TALENT_TREE
    :classId==='MAGE'?MAGE_TALENT_TREE
    :classId==='NECROMANCER'?NECROMANCER_TALENT_TREE
    :classId==='ROGUE'?ROGUE_TALENT_TREE
    :classId==='WARLOCK'?WARLOCK_TALENT_TREE:[];

const TALENT_CATALOG: readonly TalentDefinition[] = [
  ...TALENT_TREE, ...PALADIN_TALENT_TREE, ...MAGE_TALENT_TREE,
  ...NECROMANCER_TALENT_TREE, ...ROGUE_TALENT_TREE, ...WARLOCK_TALENT_TREE
];
const byId = new Map(TALENT_CATALOG.map(node => [node.id, node]));
const keys: readonly TalentEffectKey[] = [
  'armor','maxHealth','maxResource','resourceRegen','attackSpeed','blockChance',
  'critChance','rageGain','warCryDuration','warCryStrength','warCryRage',
  'stunDuration','shieldOnWarCryPercent','lowHealthDamageMultiplier',
  'holyDamage','healBonus','shieldStrength','auraStrength','auraDuration','faithRegen',
  'spellPower','burnDuration','areaRadius','coldSlow','chillDuration','manaRegen',
  'chainDamage','chainCount','lightningCrit','manaEfficiency','barrierStrength',
  'teleportCooldown',
  'necroBoneDamage','necroCorpseRadius','necroCorpsePoison','necroSkeletonPower',
  'necroGolemPower','necroSummonHealth','necroDrainHeal','necroCurseDuration',
  'necroNovaRadius','rogueBackstabPower','rogueKnivesBleedDuration',
  'rogueStealthDuration','rogueStealthStrike','rogueStepHaste','rogueTrapDamage',
  'rogueTrapRootDuration','rogueTrapPoisonDuration','warlockDemonPower',
  'warlockDemonHealth','warlockDemonLeech','warlockPoisonDamage',
  'warlockCurseDuration','warlockCurseWeakness','warlockBoltDamage',
  'warlockHellfireRadius','warlockBoltLeech'
];

export function getTalent(id: unknown): TalentDefinition | null {
  return typeof id === 'string' ? byId.get(id as TalentId) ?? null : null;
}

export function spentTalentPoints(ranks: unknown): number {
  if (!ranks || typeof ranks !== 'object' || Array.isArray(ranks)) return 0;
  return Object.values(ranks).reduce<number>((sum, value) =>
    sum + (typeof value === 'number' && Number.isSafeInteger(value) && value > 0
      ? value : 0), 0);
}

/** All saved ranks must be real, affordable, level-unlocked and prerequisite-valid. */
export function validateTalentBuild(
  classId: unknown, level: unknown, unspent: unknown, ranks: unknown
): ranks is TalentRanks {
  if (!Number.isSafeInteger(level) || (level as number) < 1 || (level as number) > 100
    || !Number.isSafeInteger(unspent) || (unspent as number) < 0
    || (unspent as number) > Math.floor((level as number) / 5)
    || !ranks || typeof ranks !== 'object' || Array.isArray(ranks)) return false;
  const entries = Object.entries(ranks);
  const available=allTalentsForClass(classId);
  if(entries.length>available.length)return false;
  for (const [id, rank] of entries) {
    const node = getTalent(id);
    if (!node || !available.includes(node) || !Number.isSafeInteger(rank) || (rank as number) < 1
      || (rank as number) > node.maxRank || (level as number) < node.unlockLevel) return false;
    if (node.prerequisites.some(req =>
      (ranks as Record<string, unknown>)[req.id] === undefined
        || !Number.isSafeInteger((ranks as Record<string, unknown>)[req.id])
        || ((ranks as Record<string, number>)[req.id] ?? 0) < req.minRank)) return false;
  }
  return spentTalentPoints(ranks) + (unspent as number) <= Math.floor((level as number) / 5);
}

export type TalentFailure = 'invalidBuild' | 'unknownTalent' | 'lockedLevel'
  | 'missingPrerequisite' | 'maxRank' | 'noPoints' | 'noSpending' | 'insufficientGold';
type TalentDecision = {readonly ok:true}
  | {readonly ok:false;readonly reason:TalentFailure};

export function canSpendTalent(
  classId: unknown, level: number, unspent: number,
  ranks: unknown, id: unknown
): TalentDecision {
  if (!validateTalentBuild(classId,level,unspent,ranks)) return {ok:false,reason:'invalidBuild'};
  const node = getTalent(id);
  if (!node || !allTalentsForClass(classId).includes(node)) return {ok:false,reason:'unknownTalent'};
  if (level < node.unlockLevel) return {ok:false,reason:'lockedLevel'};
  if (node.prerequisites.some(req => (ranks[req.id] ?? 0) < req.minRank))
    return {ok:false,reason:'missingPrerequisite'};
  if ((ranks[node.id] ?? 0) >= node.maxRank) return {ok:false,reason:'maxRank'};
  if (unspent < 1) return {ok:false,reason:'noPoints'};
  return {ok:true};
}

export type TalentSpendResult = {readonly ok:true;readonly unspent:number;
  readonly ranks:TalentRanks} | {readonly ok:false;readonly reason:TalentFailure};

export function planSpendTalent(
  classId: unknown, level: number, unspent: number,
  ranks: unknown, id: unknown
): TalentSpendResult {
  const check = canSpendTalent(classId,level,unspent,ranks,id);
  if (!check.ok) return check;
  const talent = getTalent(id)!;
  const before = ranks as TalentRanks;
  const next = {...before,[talent.id]:(before[talent.id] ?? 0)+1};
  if (!validateTalentBuild(classId,level,unspent-1,next))
    return {ok:false,reason:'invalidBuild'};
  return {ok:true,ranks:next,unspent:unspent-1};
}

export function respecGoldCost(level: number, ranks: TalentRanks): number {
  const total = spentTalentPoints(ranks);
  if (total === 0) return 0;
  return 60 + Math.max(1, Math.min(100, Math.floor(level))) * 8 + total * 25;
}

export type TalentRespecResult = {readonly ok:true;readonly unspent:number;
  readonly ranks:TalentRanks;readonly gold:number;readonly spentGold:number}
  | {readonly ok:false;readonly reason:TalentFailure};
export function planRespecTalents(
  classId: unknown, level: number, unspent: number, ranks: unknown, gold: number
): TalentRespecResult {
  if (!validateTalentBuild(classId,level,unspent,ranks)
    || !Number.isSafeInteger(gold) || gold < 0) return {ok:false,reason:'invalidBuild'};
  const spent = spentTalentPoints(ranks);
  if (spent === 0) return {ok:false,reason:'noSpending'};
  const price = respecGoldCost(level,ranks);
  if (gold < price) return {ok:false,reason:'insufficientGold'};
  const next = unspent + spent;
  if (!validateTalentBuild(classId,level,next,{})) return {ok:false,reason:'invalidBuild'};
  return {ok:true,unspent:next,ranks:{},gold:gold-price,spentGold:price};
}

/** Pure additive effect projection. Simulator decides when conditional triggers fire. */
export function projectTalentBonuses(ranks: Readonly<TalentRanks>): TalentBonuses {
  const values = Object.fromEntries(keys.map(key => [key,0])) as Record<TalentEffectKey,number>;
  for (const node of TALENT_CATALOG) {
    const rank = ranks[node.id] ?? 0;
    if (!Number.isSafeInteger(rank) || rank < 1 || rank > node.maxRank) continue;
    for (const effect of node.effects) values[effect.key] += effect.perRank * rank;
  }
  return values as TalentBonuses;
}

/** Derived values are recalculated, never serialized or modified in place. */
export function applyTalentStats(
  base: Readonly<DerivedStats>, ranks: Readonly<TalentRanks>
): DerivedStats {
  const bonuses = projectTalentBonuses(ranks);
  const armor = base.armor + bonuses.armor;
  return {
    ...base,
    armor,
    physicalResist: Math.round(100 * armor / (armor + 250)),
    maxHealth: base.maxHealth + bonuses.maxHealth,
    maxResource: base.maxResource + bonuses.maxResource,
    resourceRegen: Number((base.resourceRegen + bonuses.resourceRegen + bonuses.faithRegen + bonuses.manaRegen).toFixed(2)),
    attackSpeed: Number((base.attackSpeed + bonuses.attackSpeed).toFixed(2)),
    blockChance: Number(Math.min(60,base.blockChance + bonuses.blockChance).toFixed(1)),
    critChance: Number(Math.min(75,base.critChance + bonuses.critChance + bonuses.lightningCrit * 100).toFixed(1))
  };
}
