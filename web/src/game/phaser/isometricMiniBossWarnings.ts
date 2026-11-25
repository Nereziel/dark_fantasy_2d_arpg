// GPL-3.0-only — presentation-only projection of canonical miniboss hit footprints.
import type { GameSnapshot, Point } from '../core/types';
import { MINI_BOSS_DEFINITIONS, type MiniBossShape } from '../enemies/miniBossRules';
import { projectCombatCircle } from './isometricCombat';
import { projectIsometric } from './isometricProjection';

const finitePoint = (p: Readonly<Point>): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);

/**
 * Mirror GameSimulation.miniBossHit for display, never for gameplay.
 * Circle: locked target point. Line/cone: forward half of a range disk
 * intersected with a strip or widening corridor (minimum half-width 18).
 * Sample the circular boundary and include exact width-transition vertices.
 */
export function projectMiniBossFootprint(shape: MiniBossShape, caster: Readonly<Point>,
  locked: Readonly<Point>, range: number, radius: number, origin: Readonly<Point>): Point[] {
  if (![caster, locked, origin].every(finitePoint) || !Number.isFinite(radius) || radius <= 0
    || !Number.isFinite(range) || range <= 0) return [];
  if (shape === 'circle') return projectCombatCircle(locked, radius, origin);
  if (shape !== 'line' && shape !== 'cone') return [];
  const dx = locked.x - caster.x, dy = locked.y - caster.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return [];
  const ux = dx / length, uy = dy / length;
  const xs = new Set<number>([0, range]);
  for (let i = 1; i < 48; i++) xs.add(range * Math.sin(i * Math.PI / 96));
  const transitions = shape === 'line'
    ? [Math.sqrt(Math.max(0, range * range - radius * radius))]
    : [18 / .58, Math.sqrt(Math.max(0, range * range - 18 * 18)), range / Math.hypot(1, .58)];
  for (const x of transitions) if (x > 0 && x < range) xs.add(x);
  const samples = [...xs].sort((a, b) => a - b);
  const halfWidth = (x: number) => Math.min(Math.sqrt(Math.max(0, range * range - x * x)),
    shape === 'line' ? radius : Math.max(18, x * .58));
  const point = (x: number, side: number) => projectIsometric({
    x: caster.x + ux * x - uy * side,
    y: caster.y + uy * x + ux * side
  }, 0, origin);
  return [
    ...samples.map(x => point(x, halfWidth(x))),
    ...samples.slice(0, -1).reverse().map(x => point(x, -halfWidth(x)))
  ];
}

export interface MiniBossWarning {
  enemyId: string;
  shape: MiniBossShape;
  points: Point[];
  progress: number;
  harmful: boolean;
}

/** Rebuilt from the current snapshot: no persistent timer or stale event geometry. */
export function miniBossWarnings(state: Pick<GameSnapshot, 'enemies' | 'miniBossStates'>,
  origin: Readonly<Point>): MiniBossWarning[] {
  const warnings: MiniBossWarning[] = [];
  for (const unit of state.enemies) {
    if (!unit.actor.alive) continue;
    const pending = state.miniBossStates?.[unit.actor.id];
    if (!pending || pending.stage !== 'windup' || !pending.lockedPoint
      || !Number.isFinite(pending.remainingSeconds) || pending.remainingSeconds <= 0) continue;
    const ability = MINI_BOSS_DEFINITIONS[pending.bossId]?.abilities.find(a => a.id === pending.activeAbilityId);
    if (!ability) continue;
    const points = projectMiniBossFootprint(ability.shape, unit.actor, pending.lockedPoint,
      ability.range, ability.radius, origin);
    if (points.length < 3) continue;
    warnings.push({
      enemyId: unit.actor.id, shape: ability.shape, points,
      progress: Math.max(0, Math.min(1, 1 - pending.remainingSeconds / ability.windupSeconds)),
      harmful: ability.effect !== 'support' && ability.effect !== 'summon'
    });
  }
  return warnings;
}
