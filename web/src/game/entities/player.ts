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
  // An invalid maximum must not corrupt any field of the actor.
  if (!Number.isFinite(maxHealth) || maxHealth <= 0) return;
  const increase = maxHealth - player.maxHealth;
  player.maxHealth = maxHealth;
  if (player.alive) {
    player.health = Math.max(1, Math.min(maxHealth, player.health + increase));
  }
}

/** Resource regeneration/decay always runs on simulation ticks. */
export function advanceResource(current: number, regenRate: number, cap: number, deltaSeconds: number): number {
  if (!Number.isFinite(cap) || cap <= 0) return 0;
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeRegen = Number.isFinite(regenRate) ? regenRate : 0;
  const elapsed = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
  return Math.max(0, Math.min(cap, safeCurrent + safeRegen * elapsed));
}
