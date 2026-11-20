// GPL-3.0-only — Prompt 31: composable, renderer-independent skill modifiers.
// New class skills may pass new operation lists through composeSkillModifiers; no
// skill-specific calculation branches or changes to character/save snapshots.
import type { Equipment, Item } from '../data/items';
import { isItem } from '../data/items';
import type { TalentRanks, WarriorTalentId } from '../progression/talentTree';
import { getStatusDefinition, type StatusId } from '../status/statusDefinitions';

export type ModifierOperation =
  | { readonly kind: 'radius'; readonly value: number }
  | { readonly kind: 'pull'; readonly value: number }
  | { readonly kind: 'extraProjectiles'; readonly value: number }
  | { readonly kind: 'pierce'; readonly value: number }
  | { readonly kind: 'extraSummons'; readonly value: number }
  | { readonly kind: 'summonArmor'; readonly value: number }
  | { readonly kind: 'status'; readonly statusId: StatusId;
      readonly duration: number; readonly magnitude: number };
export type SkillModifier = ModifierOperation & { readonly id: string };

export interface SkillBase {
  readonly id: string;
  readonly radius: number;
  readonly projectileCount: number;
  readonly summonCount: number;
}
export interface ProjectedStatus {
  readonly id: StatusId;
  readonly duration: number;
  readonly magnitude: number;
}
export interface SkillProjection extends SkillBase {
  readonly pullDistance: number;
  readonly pierceCount: number;
  readonly summonArmor: number;
  readonly statuses: readonly ProjectedStatus[];
  readonly modifierIds: readonly string[];
}
interface TalentRule {
  readonly source: 'talent';
  readonly rankId: WarriorTalentId;
  readonly skillId: string;
  readonly id: string;
  readonly operation: ModifierOperation;
}
interface EquipmentRule {
  readonly source: 'affix' | 'legendary';
  readonly key: string;
  readonly skillId: string;
  readonly id: string;
  readonly operation: ModifierOperation;
}
type SkillModifierRule = TalentRule | EquipmentRule;

/** A declarative expansion point: no switch on skill ID in the composer. */
export const SKILL_MODIFIER_RULES: readonly SkillModifierRule[] = Object.freeze([
  {
    source: 'talent', rankId: 'warlord.shockwave', skillId: 'whirlwind',
    id: 'talent.warlord.shockwave.pull',
    operation: { kind: 'pull', value: 36 }
  },
  {
    source: 'talent', rankId: 'warlord.shockwave', skillId: 'whirlwind',
    id: 'talent.warlord.shockwave.radius',
    operation: { kind: 'radius', value: 16 }
  },
  {
    source: 'talent', rankId: 'berserker.bloodlust', skillId: 'whirlwind',
    id: 'talent.berserker.bloodlust.bleed',
    operation: { kind: 'status', statusId: 'bleeding', duration: 5, magnitude: 3 }
  },
  {
    source: 'affix', key: 'skillRank', skillId: 'whirlwind',
    id: 'equipment.skillRank.whirlwind.radius',
    operation: { kind: 'radius', value: 8 }
  },
  {
    source: 'legendary', key: 'power.greatsword', skillId: 'whirlwind',
    id: 'equipment.power.greatsword.whirlwind.radius',
    operation: { kind: 'radius', value: 22 }
  },
  {
    source: 'legendary', key: 'power.greataxe', skillId: 'whirlwind',
    id: 'equipment.power.greataxe.whirlwind.bleed',
    operation: { kind: 'status', statusId: 'bleeding', duration: 5, magnitude: 4 }
  }
]);

const clamp = (value: number, max: number): number =>
  Math.max(0, Math.min(max, value));

function finiteAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Every operator is independently bounded; duplicates never apply twice. */
export function composeSkillModifiers(
  base: SkillBase, modifiers: readonly SkillModifier[]
): SkillProjection {
  const result = {
    id: base.id,
    radius: clamp(Number.isFinite(base.radius) ? base.radius : 0, 300),
    projectileCount: clamp(Number.isFinite(base.projectileCount) ? base.projectileCount : 0, 8),
    summonCount: clamp(Number.isFinite(base.summonCount) ? base.summonCount : 0, 6),
    pullDistance: 0,
    pierceCount: 0,
    summonArmor: 0
  };
  const ids: string[] = [];
  const statuses = new Map<StatusId, ProjectedStatus>();
  const seen = new Set<string>();
  for (const modifier of modifiers.slice(0, 128)) {
    if (!modifier || typeof modifier.id !== 'string'
      || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(modifier.id)
      || seen.has(modifier.id)) continue;
    const kind = modifier.kind;
    if (kind === 'status') {
      if (!getStatusDefinition(modifier.statusId)
        || !finiteAmount(modifier.duration) || !finiteAmount(modifier.magnitude)) continue;
      const existing = statuses.get(modifier.statusId);
      statuses.set(modifier.statusId, {
        id: modifier.statusId,
        duration: clamp(Math.max(existing?.duration ?? 0, modifier.duration), 20),
        magnitude: clamp((existing?.magnitude ?? 0) + modifier.magnitude, 40)
      });
    } else {
      if (!finiteAmount(modifier.value)) continue;
      const v = modifier.value;
      if (kind === 'radius') result.radius = clamp(result.radius + v, 300);
      else if (kind === 'pull') result.pullDistance = clamp(result.pullDistance + v, 90);
      else if (kind === 'extraProjectiles')
        result.projectileCount = clamp(result.projectileCount + Math.floor(v), 8);
      else if (kind === 'pierce')
        result.pierceCount = clamp(result.pierceCount + Math.floor(v), 6);
      else if (kind === 'extraSummons')
        result.summonCount = clamp(result.summonCount + Math.floor(v), 6);
      else if (kind === 'summonArmor') result.summonArmor = clamp(result.summonArmor + v, 150);
      else continue;
    }
    seen.add(modifier.id);
    ids.push(modifier.id);
  }
  return { ...result, statuses: [...statuses.values()], modifierIds: ids };
}

function modifierForRule(rule: SkillModifierRule, multiplier: number): SkillModifier | null {
  if (!finiteAmount(multiplier)) return null;
  const operation = rule.operation;
  return operation.kind === 'status' ? {
    id: rule.id,
    kind: 'status',
    statusId: operation.statusId,
    duration: operation.duration,
    magnitude: operation.magnitude * multiplier
  } : { id: rule.id, kind: operation.kind, value: operation.value * multiplier };
}

/** Source adapters read existing valid character DTOs, never mutate gear/ranks. */
export function equippedSkillModifiers(
  skillId: string, talents: Readonly<TalentRanks>, equipment: Readonly<Equipment>
): SkillModifier[] {
  const gear = Object.values(equipment).filter((item): item is Item => !!item && isItem(item));
  const out: SkillModifier[] = [];
  for (const rule of SKILL_MODIFIER_RULES) {
    if (rule.skillId !== skillId) continue;
    let stacks = 0;
    if (rule.source === 'talent') {
      const rank = talents[rule.rankId];
      // Guard arbitrary client-side projections even when the caller has not
      // passed its build through the authoritative validator.
      if (Number.isSafeInteger(rank) && rank! >= 1 && rank! <= 3) stacks = rank!;
    } else if (rule.source === 'affix') {
      stacks = gear.reduce((total,item) => total + item.affixes.reduce((sum,affix) =>
        sum + (affix.stat === rule.key && Number.isFinite(affix.value)
          ? Math.min(6,Math.max(0,Math.floor(affix.value))) : 0), 0), 0);
      stacks = clamp(stacks, 6);
    } else {
      stacks = gear.some(item => item.slot === 'MAIN_HAND'
        && item.legendaryPower?.id === rule.key) ? 1 : 0;
    }
    const modifier = modifierForRule(rule, stacks);
    if (modifier) out.push(modifier);
  }
  return out;
}

/**
 * Runtime/UI share the same projection. Future class skills can pass their
 * base projectile/summon counts and new data rules without modifying combat
 * math or adding per-skill branches to the composer.
 */
export function projectEquippedSkill(
  skillId: string, baseRadius: number, talents: Readonly<TalentRanks>,
  equipment: Readonly<Equipment>,
  base?: Partial<Pick<SkillBase, 'projectileCount' | 'summonCount'>>
): SkillProjection {
  return composeSkillModifiers({
    id: skillId,
    radius: baseRadius,
    projectileCount: base?.projectileCount ?? 1,
    summonCount: base?.summonCount ?? 0
  }, equippedSkillModifiers(skillId, talents, equipment));
}
