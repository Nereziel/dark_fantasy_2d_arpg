/** Presentation-independent hit frames for the five original non-Warrior kits.
 * All gameplay consequences are applied only by GameSimulation on timeline impact.
 * Original Aether & Ruin code: GPL-3.0-only.
 */
import type { SkillDefinition } from '../skills/skills';
import type { CombatTimelineSpec } from './combatTimeline';

export const BASIC_ATTACK_HIT_TICKS = 11;
export const BASIC_ATTACK_RECOVERY_TICKS = 16;

/** Data-driven pacing so the renderer and simulation agree on hit frames. */
export function classSkillTimeline(skill: Readonly<SkillDefinition>): CombatTimelineSpec {
  const isChannel = skill.kind === 'drain';
  const isCast = ['aura', 'nova', 'dot', 'summon', 'drain'].includes(skill.kind);
  const windupTicks = skill.kind === 'dash' ? 18
    : skill.kind === 'nova' ? 23
    : skill.kind === 'summon' ? 24
    : skill.kind === 'aura' ? 21
    : isCast ? 19 : 15;
  return {
    animation: isChannel ? 'channel' : isCast ? 'cast' : 'attack',
    actionId: skill.id,
    windupTicks,
    sustainTicks: 0,
    recoveryTicks: skill.kind === 'dash' ? 18 : 15,
    movementLocked: true
  };
}

export const BASIC_ATTACK_TIMELINE: Readonly<CombatTimelineSpec> = Object.freeze({
  animation: 'attack',
  actionId: 'basicAttack',
  windupTicks: BASIC_ATTACK_HIT_TICKS,
  recoveryTicks: BASIC_ATTACK_RECOVERY_TICKS,
  movementLocked: true
});
