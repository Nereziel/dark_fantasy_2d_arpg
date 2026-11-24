/** F1 — stable ability identity, independent of physical input slots.
 * All commands still pass through the authoritative simulation. GPL-3.0-only.
 */
import type { ClassId } from '../data/classes';
import type { GameCommand } from '../core/types';
import type { InputAction } from './bindings';
import { SKILLS } from '../skills/skills';
import { PALADIN_EXTRA_IDS } from '../skills/paladinKit';
import { MAGE_EXTRA_IDS } from '../skills/mageKit';
import { NECRO_EXTRA_IDS } from '../skills/necromancerKit';
import { ROGUE_EXTRA_IDS } from '../skills/rogueKit';
import { WARLOCK_EXTRA_IDS } from '../skills/warlockKit';

export const HOTBAR_INPUTS = Object.freeze([
  'SECONDARY', 'SLOT_1', 'SLOT_2', 'SLOT_3', 'SLOT_4', 'SLOT_5', 'SLOT_6'
] as const);
export type HotbarInput = typeof HOTBAR_INPUTS[number];
export type HotbarLayout = readonly string[];
type AbilityCommand = Extract<GameCommand, { type:
  'cast' | 'warriorAbility' | 'paladinAbility' | 'mageAbility' |
  'necroAbility' | 'rogueAbility' | 'warlockAbility' }>;
export interface HotbarEntry {
  readonly id: string;
  readonly route: Readonly<AbilityCommand>;
}

const WARRIOR_EXTRAS = ['groundSlam', 'warCry', 'whirlwind', 'execute', 'basicAttack'] as const;
const extraRoutes: Record<ClassId, readonly AbilityCommand[]> = {
  WARRIOR: WARRIOR_EXTRAS.map(id => ({ type: 'warriorAbility', id })),
  PALADIN: PALADIN_EXTRA_IDS.map(id => ({ type: 'paladinAbility', id })),
  MAGE: MAGE_EXTRA_IDS.map(id => ({ type: 'mageAbility', id })),
  NECROMANCER: NECRO_EXTRA_IDS.map(id => ({ type: 'necroAbility', id })),
  ROGUE: ROGUE_EXTRA_IDS.map(id => ({ type: 'rogueAbility', id })),
  WARLOCK: WARLOCK_EXTRA_IDS.map(id => ({ type: 'warlockAbility', id }))
};

function entriesFor(classId: ClassId): readonly HotbarEntry[] {
  const routes: AbilityCommand[] = [
    { type: 'cast', slot: 'rmb' },
    { type: 'cast', slot: 'slot1' },
    ...extraRoutes[classId]
  ];
  return Object.freeze(routes.map(route => Object.freeze({
    id: route.type === 'cast' ? SKILLS[classId][route.slot].id : route.id,
    route: Object.freeze(route)
  })));
}

const entries: Readonly<Record<ClassId, readonly HotbarEntry[]>> = Object.freeze({
  WARRIOR: entriesFor('WARRIOR'),
  PALADIN: entriesFor('PALADIN'),
  MAGE: entriesFor('MAGE'),
  NECROMANCER: entriesFor('NECROMANCER'),
  ROGUE: entriesFor('ROGUE'),
  WARLOCK: entriesFor('WARLOCK')
});

export function hotbarEntries(classId: ClassId): readonly HotbarEntry[] {
  return Object.hasOwn(entries, classId) ? entries[classId] : [];
}

export function defaultHotbarLayout(classId: ClassId): string[] {
  return hotbarEntries(classId).map(entry => entry.id);
}

/** Complete permutation only: no foreign abilities, duplicates, or holes. */
export function validateHotbarLayout(classId: ClassId, value: unknown): value is HotbarLayout {
  const allowed = hotbarEntries(classId);
  if (!Array.isArray(value) || allowed.length !== HOTBAR_INPUTS.length
    || value.length !== HOTBAR_INPUTS.length) return false;
  const ids: unknown[] = Array.from(value);
  return new Set(ids).size === allowed.length
    && ids.every(id => typeof id === 'string' && allowed.some(entry => entry.id === id));
}

export function resolveHotbarAbility(classId: ClassId, id: unknown): HotbarEntry | null {
  if (typeof id !== 'string') return null;
  return hotbarEntries(classId).find(entry => entry.id === id) ?? null;
}

export function resolveHotbarEntry(classId: ClassId, action: InputAction,
  layout: unknown = defaultHotbarLayout(classId)): HotbarEntry | null {
  const index = HOTBAR_INPUTS.findIndex(input => input === action);
  if (index < 0 || !validateHotbarLayout(classId, layout)) return null;
  return resolveHotbarAbility(classId, layout[index]);
}

export function hotbarInputForAbility(classId: ClassId, id: string,
  layout: unknown = defaultHotbarLayout(classId)): HotbarInput | null {
  if (!validateHotbarLayout(classId, layout)) return null;
  return HOTBAR_INPUTS[layout.indexOf(id)] ?? null;
}

export function swapHotbarSlots(classId: ClassId, layout: unknown,
  from: InputAction, to: InputAction): string[] | null {
  if (!validateHotbarLayout(classId, layout)) return null;
  const a = HOTBAR_INPUTS.findIndex(input => input === from);
  const b = HOTBAR_INPUTS.findIndex(input => input === to);
  if (a < 0 || b < 0) return null;
  const next = [...layout];
  [next[a], next[b]] = [next[b]!, next[a]!];
  return next;
}
