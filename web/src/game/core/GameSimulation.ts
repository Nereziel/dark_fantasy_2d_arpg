import type { ActorSnapshot, GameCommand, GameEvent, GameSnapshot, Point } from './types';

const WORLD_WIDTH = 2200;
const WORLD_HEIGHT = 1400;
const FIXED_STEP = 1 / 60;
const MAX_FRAME_SECONDS = 0.1;
const PLAYER_SPEED = 190;
const ENEMY_SPEED = 62;
const PLAYER_RANGE = 76;
const ENEMY_RANGE = 54;
const ATTACK_COOLDOWN = 0.68;
const ENEMY_COOLDOWN = 1.3;

function makeActor(id: string, x: number, y: number, health: number): ActorSnapshot {
  return { id, x, y, health, maxHealth: health, alive: true };
}
function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function toward(actor: ActorSnapshot, target: Point, speed: number, dt: number, stop = 0): void {
  const dx = target.x - actor.x, dy = target.y - actor.y;
  const remaining = Math.hypot(dx, dy);
  if (remaining <= stop || remaining <= 0) return;
  const step = Math.min(speed * dt, remaining - stop);
  actor.x = Math.max(28, Math.min(WORLD_WIDTH - 28, actor.x + (dx / remaining) * step));
  actor.y = Math.max(28, Math.min(WORLD_HEIGHT - 28, actor.y + (dy / remaining) * step));
}

export class GameSimulation {
  private player = makeActor('hero', 390, 470, 100);
  private enemy = makeActor('wraith-1', 780, 520, 72);
  private moveTarget: Point | null = null;
  private targetId: string | null = null;
  private paused = false;
  private kills = 0;
  private attackTimer = 0;
  private enemyTimer = 0.5;
  private respawnTimer = 0;
  private accumulator = 0;
  private readonly events: GameEvent[] = [];

  command(command: GameCommand): void {
    if (command.type === 'reset') {
      this.reset();
      return;
    }
    if (command.type === 'pause') {
      this.paused = command.value;
      return;
    }
    if (!this.player.alive || this.paused) return;
    if (command.type === 'move') {
      const { x, y } = command.destination;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      this.moveTarget = { x: Math.max(28, Math.min(WORLD_WIDTH - 28, x)), y: Math.max(28, Math.min(WORLD_HEIGHT - 28, y)) };
      this.targetId = null;
    }
    if (command.type === 'attack' && command.targetId === this.enemy.id && this.enemy.alive) {
      this.targetId = command.targetId;
      this.moveTarget = null;
    }
  }

  advance(deltaMilliseconds: number): void {
    if (this.paused || !this.player.alive || !Number.isFinite(deltaMilliseconds)) return;
    this.accumulator += Math.min(MAX_FRAME_SECONDS, Math.max(0, deltaMilliseconds / 1000));
    while (this.accumulator >= FIXED_STEP) {
      this.step(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
    }
  }

  private step(dt: number): void {
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.enemyTimer = Math.max(0, this.enemyTimer - dt);

    if (!this.enemy.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.enemy = makeActor('wraith-1', 780 + (this.kills % 3) * 80, 520, 72);
      }
    }

    if (this.targetId === this.enemy.id && this.enemy.alive) {
      if (distance(this.player, this.enemy) > PLAYER_RANGE) {
        toward(this.player, this.enemy, PLAYER_SPEED, dt, PLAYER_RANGE - 5);
      } else if (this.attackTimer <= 0) {
        this.attackTimer = ATTACK_COOLDOWN;
        this.enemy.health = Math.max(0, this.enemy.health - 26);
        this.events.push({ type: 'hit', targetId: this.enemy.id, damage: 26 });
        if (this.enemy.health === 0) {
          this.enemy.alive = false;
          this.kills++;
          this.respawnTimer = 2.8;
          this.targetId = null;
          this.events.push({ type: 'defeat', targetId: this.enemy.id, kills: this.kills });
        }
      }
    } else if (this.moveTarget) {
      toward(this.player, this.moveTarget, PLAYER_SPEED, dt);
      if (distance(this.player, this.moveTarget) <= 2) this.moveTarget = null;
    }

    if (this.enemy.alive) {
      if (distance(this.player, this.enemy) < 275) {
        toward(this.enemy, this.player, ENEMY_SPEED, dt, ENEMY_RANGE - 3);
      }
      if (distance(this.player, this.enemy) <= ENEMY_RANGE && this.enemyTimer <= 0) {
        this.enemyTimer = ENEMY_COOLDOWN;
        this.player.health = Math.max(0, this.player.health - 9);
        this.events.push({ type: 'hit', targetId: this.player.id, damage: 9 });
        if (this.player.health === 0) {
          this.player.alive = false;
          this.moveTarget = null;
          this.targetId = null;
          this.events.push({ type: 'playerDeath' });
        }
      }
    }
  }

  snapshot(): GameSnapshot {
    const status = this.paused ? 'paused'
      : !this.player.alive ? 'dead'
      : this.targetId && this.enemy.alive ? 'combat'
      : this.moveTarget ? 'moving'
      : 'ready';
    return {
      version: 1,
      player: { ...this.player },
      enemy: { ...this.enemy },
      kills: this.kills,
      level: 1 + Math.floor(this.kills / 4),
      paused: this.paused,
      status
    };
  }

  drainEvents(): GameEvent[] {
    return this.events.splice(0);
  }

  restore(state: GameSnapshot): boolean {
    if (!state || state.version !== 1) return false;
    const actors = [state.player, state.enemy];
    if (!actors.every(a =>
      a && typeof a.id === 'string' && Number.isFinite(a.x) && Number.isFinite(a.y)
      && Number.isFinite(a.health) && Number.isFinite(a.maxHealth)
      && a.health >= 0 && a.maxHealth > 0 && a.health <= a.maxHealth
      && a.x >= 0 && a.x <= WORLD_WIDTH && a.y >= 0 && a.y <= WORLD_HEIGHT
      && typeof a.alive === 'boolean'
      && a.alive === (a.health > 0)
    ) || state.player.id !== 'hero' || state.enemy.id !== 'wraith-1'
      || !Number.isSafeInteger(state.kills) || state.kills < 0) return false;

    this.player = { ...state.player };
    this.enemy = { ...state.enemy };
    this.kills = state.kills;
    this.paused = false;
    this.moveTarget = null;
    this.targetId = null;
    this.attackTimer = 0;
    this.enemyTimer = 0.5;
    this.accumulator = 0;
    this.respawnTimer = this.enemy.alive ? 0 : 2.8;
    this.events.splice(0);
    return true;
  }

  reset(): void {
    this.player = makeActor('hero', 390, 470, 100);
    this.enemy = makeActor('wraith-1', 780, 520, 72);
    this.moveTarget = null;
    this.targetId = null;
    this.kills = 0;
    this.paused = false;
    this.attackTimer = 0;
    this.enemyTimer = 0.5;
    this.respawnTimer = 0;
    this.accumulator = 0;
    this.events.splice(0);
  }
}
