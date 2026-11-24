// GPL-3.0-only — presentation only.
import type { GameSnapshot, Point } from '../core/types';
import type { OwnedSummon } from '../summons/summonOwnership';
import type { PixelActor } from './pixelSpriteAtlas';
import { projectCombatCircle } from './isometricCombat';

type GroundEffectKind = 'frost' | 'fire' | 'trap-range' | 'trap' | 'corpse';
type GroundEffect = { kind: GroundEffectKind; points: Point[] };
type Effects = Pick<GameSnapshot, 'zone' | 'mageZones' | 'rogueTraps' | 'corpses'>;

export function classGroundEffects(state: Readonly<Effects>, origin: Readonly<Point>): GroundEffect[] {
  const result: GroundEffect[] = [];
  const add = (kind: GroundEffectKind, center: Readonly<Point>, radius: number, remaining: number) => {
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y)
      || !Number.isFinite(radius) || radius <= 0
      || !Number.isFinite(remaining) || remaining <= 0) return;
    result.push({ kind, points: projectCombatCircle(center, radius, origin) });
  };
  for (const field of state.mageZones ?? []) {
    add(field.element, field.position, field.radius, field.remaining);
  }
  for (const trap of state.rogueTraps ?? []) {
    if (trap.zone !== state.zone) continue;
    add('trap-range', trap, trap.radius, trap.remaining);
    add('trap', trap, 16, trap.remaining);
  }
  for (const corpse of state.corpses ?? []) {
    if (corpse.zone === state.zone) add('corpse', corpse, 14, corpse.remaining);
  }
  return result;
}

export function summonPresentation(kind: OwnedSummon['kind'], remaining: number): {
  actor: PixelActor; tint: number; alpha: number;
} {
  return {
    actor: kind === 'golem' ? 'crypt_lord' : kind === 'demon' ? 'wraith' : 'skeleton',
    tint: kind === 'golem' ? 0xa2d4b7 : kind === 'demon' ? 0xcb72d1 : 0x68d4ca,
    alpha: remaining < 3 ? 0.6 : 1
  };
}
