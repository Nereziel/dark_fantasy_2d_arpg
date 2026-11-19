import type { Point } from '../core/types';
import { WARDEN_ID } from '../quests/firstQuest';

export const MERCHANT_ID = 'merchant_bram' as const;
export const BLACKSMITH_ID = 'smith_odan' as const;
export type TradeNpcId = typeof MERCHANT_ID | typeof BLACKSMITH_ID;
export type NpcId = typeof WARDEN_ID | typeof MERCHANT_ID | typeof BLACKSMITH_ID;

export const WARDEN_POSITION: Readonly<Point> = Object.freeze({ x: 432, y: 407 });
export const MERCHANT_POSITION: Readonly<Point> = Object.freeze({ x: 312, y: 445 });
export const BLACKSMITH_POSITION: Readonly<Point> = Object.freeze({ x: 473, y: 517 });

export const NPC_POSITIONS: Readonly<Record<NpcId, Readonly<Point>>> = Object.freeze({
  [WARDEN_ID]: WARDEN_POSITION,
  [MERCHANT_ID]: MERCHANT_POSITION,
  [BLACKSMITH_ID]: BLACKSMITH_POSITION
});

export const WARDEN_INTERACT_RANGE = 106;
export const NPC_INTERACT_RANGE = 106;

export function isNpcId(value: unknown): value is NpcId {
  return typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(NPC_POSITIONS, value);
}

export function nearNpc(hero: Point, id: NpcId): boolean {
  const target = NPC_POSITIONS[id];
  return Math.hypot(hero.x - target.x, hero.y - target.y) <= NPC_INTERACT_RANGE;
}
export function nearWarden(hero: Point): boolean { return nearNpc(hero, WARDEN_ID); }
