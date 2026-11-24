// GPL-3.0-only — renderer-only projection of authoritative combat feedback.
import type { GameEvent, Point } from '../core/types';
import { planCombatVfx, type CombatVfxCue } from './combatVfxPlan';
import { projectIsometric } from './isometricProjection';

type ImpactEvent = Extract<GameEvent, { type: 'damageResolved' }>;
type ProjectedCue = (Extract<CombatVfxCue, { type: 'floatText' }> & { rise: number })
  | Extract<CombatVfxCue, { type: 'impactFlash' | 'particles' }>;
type Preferences = Readonly<{ floatingCombatText: boolean; reducedMotion: boolean }>;

export function planIsometricImpact(event: Readonly<ImpactEvent>, target: Readonly<Point>,
  origin: Readonly<Point>, preferences: Preferences): ProjectedCue[] {
  const cues = planCombatVfx({
    type: 'impact', position: target, damage: event.damage, absorbed: event.absorbed,
    outcome: event.dodged ? 'dodged' : event.blocked ? 'blocked' : 'hit',
    critical: event.critical, strong: event.critical || event.damage >= 45
  });
  const result: ProjectedCue[] = [];
  for (const cue of cues) {
    if (cue.type === 'floatText' && preferences.floatingCombatText) {
      result.push({ ...cue, position: projectIsometric(cue.position, 42, origin),
        rise: preferences.reducedMotion ? 0 : 32 });
    } else if (cue.type === 'impactFlash' || (cue.type === 'particles' && !preferences.reducedMotion)) {
      result.push({ ...cue, position: projectIsometric(cue.position, 20, origin) });
    }
  }
  return result;
}
