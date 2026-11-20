// GPL-3.0-only — Prompt 30. Pure, reusable rank/branch/effect planner.
// Gameplay/loot/character state remain exclusively authoritative in GameSimulation.
import type { DerivedStats } from '../stats/deriveStats';

export type TalentBranch = 'berserker' | 'guardian' | 'warlord';
export type WarriorTalentId =
  | 'berserker.battleFury' | 'berserker.bloodlust'
  | 'berserker.executioner' | 'berserker.lastStand'
  | 'guardian.ironSkin' | 'guardian.shieldMastery'
  | 'guardian.stalwart' | 'guardian.bulwark'
  | 'warlord.commandingCry' | 'warlord.shockwave'
  | 'warlord.warDrums' | 'warlord.commander';
export type TalentRanks = Partial<Record<WarriorTalentId, number>>;

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
}
export type TalentEffectKey = keyof TalentBonuses;
export type TalentEffectKind = 'stat' | 'skill' | 'passive' | 'conditional';
export interface TalentEffect {
  readonly kind: TalentEffectKind;
  readonly key: TalentEffectKey;
  readonly perRank: number;
}
export interface TalentPrerequisite {
  readonly id: WarriorTalentId;
  readonly minRank: number;
}
export interface TalentDefinition {
  readonly id: WarriorTalentId;
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

const byId = new Map(TALENT_TREE.map(node => [node.id, node]));
const keys: readonly TalentEffectKey[] = [
  'armor','maxHealth','maxResource','resourceRegen','attackSpeed','blockChance',
  'critChance','rageGain','warCryDuration','warCryStrength','warCryRage',
  'stunDuration','shieldOnWarCryPercent','lowHealthDamageMultiplier'
];

export function getTalent(id: unknown): TalentDefinition | null {
  return typeof id === 'string' ? byId.get(id as WarriorTalentId) ?? null : null;
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
  if (entries.length > TALENT_TREE.length
    || (classId !== 'WARRIOR' && entries.length > 0)) return false;
  for (const [id, rank] of entries) {
    const node = getTalent(id);
    if (!node || !Number.isSafeInteger(rank) || (rank as number) < 1
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
  if (!node || classId !== 'WARRIOR') return {ok:false,reason:'unknownTalent'};
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
  for (const node of TALENT_TREE) {
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
    resourceRegen: Number((base.resourceRegen + bonuses.resourceRegen).toFixed(2)),
    attackSpeed: Number((base.attackSpeed + bonuses.attackSpeed).toFixed(2)),
    blockChance: Number(Math.min(60,base.blockChance + bonuses.blockChance).toFixed(1)),
    critChance: Number(Math.min(75,base.critChance + bonuses.critChance).toFixed(1))
  };
}
