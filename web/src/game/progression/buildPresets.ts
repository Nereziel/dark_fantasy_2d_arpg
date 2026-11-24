/** Character-owned presets contain ability placement and a read-only talent plan.
 * Applying a preset never changes talents, resources, equipment or cooldowns.
 * GPL-3.0-only.
 */
import type { ClassId } from '../data/classes';
import { validateHotbarLayout } from '../input/hotbarRegistry';
import { allTalentsForClass, spentTalentPoints, validateTalentBuild, respecGoldCost,
  type TalentRanks } from './talentTree';

export const BUILD_PRESET_COUNT = 3;
export interface BuildPreset {
  layout: string[];
  talentRanks: TalentRanks;
}
export type BuildPresetSlots = (BuildPreset | null)[];
export function emptyBuildPresets(): BuildPresetSlots {
  return Array.from({ length: BUILD_PRESET_COUNT }, () => null);
}
export function isBuildPresetIndex(index: unknown): index is number {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < BUILD_PRESET_COUNT;
}
function isPreset(classId: ClassId, level: number, value: unknown): value is BuildPreset {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'layout')
    || !Object.hasOwn(value, 'talentRanks')) return false;
  const p = value as Partial<BuildPreset>;
  return validateHotbarLayout(classId, p.layout)
    && validateTalentBuild(classId, level, 0, p.talentRanks);
}
export function validateBuildPresets(classId: ClassId, level: number, input: unknown): input is BuildPresetSlots {
  return Array.isArray(input) && input.length === BUILD_PRESET_COUNT
    && Array.from(input).every(p => p === null || isPreset(classId, level, p));
}
export function copyBuildPresets(input: readonly (BuildPreset | null)[]): BuildPresetSlots {
  return input.map(p => p === null ? null : { layout: [...p.layout], talentRanks: { ...p.talentRanks } });
}
type PreviewState = {
  classId: ClassId; level: number; gold: number; talentRanks?: TalentRanks;
  talentPoints?: number;
};
export function previewBuildPreset(state: PreviewState, preset: unknown) {
  const current = state.talentRanks ?? {};
  const unspent = state.talentPoints ?? Math.floor(state.level / 5);
  if (!isPreset(state.classId, state.level, preset)
    || !validateTalentBuild(state.classId, state.level, unspent, current)) return null;
  const ranks = allTalentsForClass(state.classId).map(node => ({
    id: node.id, current: current[node.id] ?? 0, planned: preset.talentRanks[node.id] ?? 0
  })).filter(rank => rank.current > 0 || rank.planned > 0);
  const respecRequired = ranks.some(rank => rank.current > rank.planned);
  const respecGold = respecRequired ? respecGoldCost(state.level, current) : 0;
  const available = unspent + spentTalentPoints(current);
  const planned = spentTalentPoints(preset.talentRanks);
  return { ranks, respecRequired, respecGold, canAffordRespec: state.gold >= respecGold,
    planned, available, sufficientPoints: planned <= available };
}
