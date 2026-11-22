/** Read-only projection of already filter-visible ground drops near the hero.
 * No loot simulation, RNG or world discovery authority.
 * GPL-3.0-only.
 */
import type { GroundItem } from '../data/items';
import type { Point } from '../core/types';

export function nearbyGroundLoot(
  visibleDrops: readonly GroundItem[],
  player: Readonly<Point>,
  radius = 220,
  limit = 3
): GroundItem[] {
  if (!Array.isArray(visibleDrops) || !player
    || !Number.isFinite(player.x) || !Number.isFinite(player.y)
    || !Number.isFinite(radius) || radius < 0 || radius > 500
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 20) return [];
  const seen = new Set<string>();
  return visibleDrops
    .filter(drop => {
      if (!drop || typeof drop.id !== 'string' || !drop.id
        || !drop.item || !Number.isFinite(drop.x) || !Number.isFinite(drop.y)
        || Math.hypot(drop.x - player.x, drop.y - player.y) > radius
        || seen.has(drop.id)) return false;
      seen.add(drop.id);
      return true;
    })
    .sort((a, b) => {
      const aDist = Math.hypot(a.x - player.x, a.y - player.y);
      const bDist = Math.hypot(b.x - player.x, b.y - player.y);
      return aDist - bDist || a.id.localeCompare(b.id, 'en');
    })
    .slice(0, limit);
}
