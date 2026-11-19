/** Prompt 02: pure player health and class-resource rules (no Phaser/Svelte). */
import type { ActorSnapshot, Point } from '../core/types';
import type { ClassId } from '../data/classes';
import type { Equipment } from '../data/items';
import { deriveStats } from '../stats/deriveStats';

export function spawnPlayer(classId: ClassId, equipment: Equipment, position: Point): ActorSnapshot {
  const maxHealth = deriveStats(classId, equipment).maxHealth;
  return {
    id: 'hero', x: position.x, y: position.y,
    health: maxHealth, maxHealth, alive: true
  };
}

/** Preserve missing health when gear changes maximum health; do not revive corpses. */
export function updateHealthLimit(player: ActorSnapshot, maxHealth: number): void {
  const increase = maxHealth - player.maxHealth;
  player.maxHealth = maxHealth;
  if (player.alive) {
    player.health = Math.max(1, Math.min(maxHealth, player.health + increase));
  }
}

/** Resource regeneration/decay always runs on simulation ticks. */
export function advanceResource(current: number, regenRate: number, cap: number, deltaSeconds: number): number {
  return Math.max(0, Math.min(cap, current + regenRate * deltaSeconds));
}
