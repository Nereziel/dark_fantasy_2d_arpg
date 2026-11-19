import type { ActorSnapshot, GameCommand, GameEvent, GameSnapshot, Point } from './types';
import { CLASSES, isClassId, type ClassId } from '../data/classes';
import {
  SeededRng, createEquipment, deriveStats, isEquipmentSlot, isItem, rollItem,
  type Equipment, type EquipmentSlot, type GroundItem, type Item
} from '../data/items';

const WORLD_WIDTH = 2200;
const WORLD_HEIGHT = 1400;
const FIXED_STEP = 1 / 60;
const MAX_FRAME_SECONDS = 0.1;
const PLAYER_SPEED = 190;
const ENEMY_SPEED = 62;
const ENEMY_RANGE = 54;
const ENEMY_COOLDOWN = 1.3;
const INVENTORY_SIZE = 24;

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
  const step = Math.max(0, Math.min(speed * dt, remaining - stop));
  actor.x = Math.max(28, Math.min(WORLD_WIDTH - 28, actor.x + dx / remaining * step));
  actor.y = Math.max(28, Math.min(WORLD_HEIGHT - 28, actor.y + dy / remaining * step));
}
function cloneItem(item: Item | null): Item | null {
  return item ? { ...item, affixes: item.affixes.map(a => ({ ...a })) } : null;
}
function cloneEquipment(equipment: Equipment): Equipment {
  return Object.fromEntries(Object.entries(equipment).map(([key, item]) => [key, cloneItem(item)])) as Equipment;
}
function validActor(a: ActorSnapshot, id: string): boolean {
  return !!a && a.id === id && [a.x, a.y, a.health, a.maxHealth].every(Number.isFinite)
    && a.maxHealth > 0 && a.health >= 0 && a.health <= a.maxHealth
    && a.x >= 0 && a.x <= WORLD_WIDTH && a.y >= 0 && a.y <= WORLD_HEIGHT
    && a.alive === (a.health > 0);
}

/** Single-player authoritative simulation (no DOM, Phaser, or Svelte). */
export class GameSimulation {
  private classId: ClassId = 'WARRIOR';
  private equipment: Equipment = createEquipment();
  private inventory: Array<Item | null> = Array(INVENTORY_SIZE).fill(null);
  private rng = new SeededRng();
  private player = makeActor('hero', 390, 470, deriveStats('WARRIOR', this.equipment).maxHealth);
  private enemy = makeActor('wraith-1', 780, 520, 72);
  private groundLoot: GroundItem[] = [];
  private moveTarget: Point | null = null;
  private attackTarget: string | null = null;
  private pickupTarget: string | null = null;
  private paused = false;
  private kills = 0;
  private level = 1;
  private xp = 0;
  private gold = 75;
  private resource = CLASSES.WARRIOR.resourceInitial;
  private attackTimer = 0;
  private enemyTimer = 0.5;
  private respawnTimer = 0;
  private accumulator = 0;
  private readonly events: GameEvent[] = [];

  command(command: GameCommand): void {
    if (command.type === 'reset') {
      this.reset(isClassId(command.classId) ? command.classId : 'WARRIOR');
      return;
    }
    if (command.type === 'pause') {
      this.paused = command.value;
      return;
    }
    if (command.type === 'equip') { this.equip(command.index); return; }
    if (command.type === 'unequip') { this.unequip(command.slot); return; }
    if (!this.player.alive || this.paused) return;

    if (command.type === 'move') {
      const { x, y } = command.destination;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      this.moveTarget = {
        x: Math.max(28, Math.min(WORLD_WIDTH - 28, x)),
        y: Math.max(28, Math.min(WORLD_HEIGHT - 28, y))
      };
      this.attackTarget = null;
      this.pickupTarget = null;
    } else if (command.type === 'attack' && command.targetId === this.enemy.id && this.enemy.alive) {
      this.attackTarget = command.targetId;
      this.moveTarget = null;
      this.pickupTarget = null;
    } else if (command.type === 'pickup' && this.groundLoot.some(g => g.id === command.id)) {
      this.pickupTarget = command.id;
      this.moveTarget = null;
      this.attackTarget = null;
    }
  }

  private equip(index: number): void {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.inventory.length) return;
    const item = this.inventory[index];
    if (!item) return;
    const slot: EquipmentSlot = item.slot === 'RING_1' &&
      this.equipment.RING_1 && !this.equipment.RING_2 ? 'RING_2' : item.slot;
    const replaced = this.equipment[slot];
    this.equipment[slot] = item;
    this.inventory[index] = replaced;
    this.refreshHealthLimit();
  }

  private unequip(slot: EquipmentSlot): void {
    if (!isEquipmentSlot(slot)) return;
    const item = this.equipment[slot];
    const index = this.inventory.findIndex(i => i === null);
    if (!item || index < 0) return;
    this.inventory[index] = item;
    this.equipment[slot] = null;
    this.refreshHealthLimit();
  }

  private refreshHealthLimit(): void {
    const max = deriveStats(this.classId, this.equipment).maxHealth;
    const delta = max - this.player.maxHealth;
    this.player.maxHealth = max;
    if (this.player.alive) this.player.health = Math.max(1, Math.min(max, this.player.health + delta));
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
    const definition = CLASSES[this.classId];
    this.resource = Math.min(definition.resourceMax, Math.max(0, this.resource + definition.regenRate * dt));
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.enemyTimer = Math.max(0, this.enemyTimer - dt);
    if (!this.enemy.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.enemy = makeActor('wraith-1', 780 + (this.kills % 3) * 80, 520, 72 + this.level * 8);
      }
    }

    const playerSpeed = PLAYER_SPEED * (deriveStats(this.classId, this.equipment).moveSpeed / 100);
    if (this.attackTarget === this.enemy.id && this.enemy.alive) {
      if (distance(this.player, this.enemy) > definition.attackRange) {
        toward(this.player, this.enemy, playerSpeed, dt, definition.attackRange - 4);
      } else if (this.attackTimer <= 0) {
        const stats = deriveStats(this.classId, this.equipment);
        this.attackTimer = 0.68 / stats.attackSpeed;
        const base = stats.damageMin + this.rng.next() * (stats.damageMax - stats.damageMin);
        const crit = this.rng.next() < stats.critChance / 100;
        const offensive = ['MAGE', 'NECROMANCER', 'WARLOCK'].includes(this.classId)
          ? stats.intelligence : stats.strength;
        const damage = Math.max(1, Math.round(base * (1 + offensive * 0.035) * (crit ? 1.7 : 1)));
        this.enemy.health = Math.max(0, this.enemy.health - damage);
        this.events.push({ type: 'hit', targetId: this.enemy.id, damage });
        if (this.enemy.health <= 0) this.defeatEnemy();
        if (this.classId === 'WARRIOR') this.resource = Math.min(definition.resourceMax, this.resource + 8);
        if (this.classId === 'NECROMANCER') this.resource = Math.min(definition.resourceMax, this.resource + 10);
        if (this.classId === 'WARLOCK') this.resource = Math.min(definition.resourceMax, this.resource + 8);
      }
    } else if (this.pickupTarget) {
      const loot = this.groundLoot.find(x => x.id === this.pickupTarget);
      if (!loot) this.pickupTarget = null;
      else if (distance(this.player, loot) <= 36) this.collectLoot(loot);
      else toward(this.player, loot, playerSpeed, dt, 32);
    } else if (this.moveTarget) {
      toward(this.player, this.moveTarget, playerSpeed, dt);
      if (distance(this.player, this.moveTarget) <= 2) this.moveTarget = null;
    }

    if (this.enemy.alive) {
      if (distance(this.player, this.enemy) < 275)
        toward(this.enemy, this.player, ENEMY_SPEED, dt, ENEMY_RANGE - 3);
      if (distance(this.player, this.enemy) <= ENEMY_RANGE && this.enemyTimer <= 0) {
        this.enemyTimer = ENEMY_COOLDOWN;
        const stats = deriveStats(this.classId, this.equipment);
        const raw = 9 + this.level * 2;
        const hit = Math.max(1, Math.round(raw * (1 - stats.armor / (stats.armor + 50 * this.level))));
        this.player.health = Math.max(0, this.player.health - hit);
        this.events.push({ type: 'hit', targetId: this.player.id, damage: hit });
        if (this.player.health === 0) {
          this.player.alive = false;
          this.moveTarget = null;
          this.attackTarget = null;
          this.pickupTarget = null;
          this.events.push({ type: 'playerDeath' });
        }
      }
    }
  }

  private defeatEnemy(): void {
    this.enemy.alive = false;
    this.kills++;
    this.respawnTimer = 2.8;
    this.attackTarget = null;
    this.gold += 12 + this.level * 3;
    this.xp += 40 + this.level * 12;
    while (this.xp >= this.level * 80) {
      this.xp -= this.level * 80;
      this.level++;
      this.events.push({ type: 'levelUp', level: this.level });
      this.player.health = Math.min(this.player.maxHealth, this.player.health + Math.round(this.player.maxHealth * 0.25));
    }
    const item = rollItem(this.kills, this.level, this.rng);
    const drop: GroundItem = {
      id: 'drop-' + this.kills, x: this.enemy.x, y: this.enemy.y, item
    };
    this.groundLoot.push(drop);
    if (this.groundLoot.length > 30) this.groundLoot.shift();
    this.events.push({ type: 'defeat', targetId: this.enemy.id, kills: this.kills });
    this.events.push({ type: 'loot', id: drop.id });
  }

  private collectLoot(loot: GroundItem): void {
    const index = this.inventory.findIndex(item => item === null);
    if (index < 0) { this.pickupTarget = null; return; }
    this.inventory[index] = loot.item;
    this.groundLoot = this.groundLoot.filter(g => g.id !== loot.id);
    this.pickupTarget = null;
    this.events.push({ type: 'pickup', id: loot.id });
  }

  snapshot(): GameSnapshot {
    const status = this.paused ? 'paused' : !this.player.alive ? 'dead'
      : this.attackTarget && this.enemy.alive ? 'combat'
      : this.moveTarget || this.pickupTarget ? 'moving' : 'ready';
    return {
      version: 2,
      classId: this.classId,
      player: { ...this.player }, enemy: { ...this.enemy },
      kills: this.kills, level: this.level, xp: this.xp, gold: this.gold,
      resource: this.resource, rngState: this.rng.state,
      stats: deriveStats(this.classId, this.equipment),
      inventory: this.inventory.map(cloneItem),
      equipment: cloneEquipment(this.equipment),
      groundLoot: this.groundLoot.map(g => ({ ...g, item: cloneItem(g.item)! })),
      paused: this.paused, status
    };
  }

  drainEvents(): GameEvent[] { return this.events.splice(0); }

  restore(snapshot: GameSnapshot): boolean {
    const s = snapshot;
    if (!s || s.version !== 2 || !isClassId(s.classId)
      || !validActor(s.player, 'hero') || !validActor(s.enemy, 'wraith-1')
      || !Number.isSafeInteger(s.kills) || s.kills < 0
      || !Number.isSafeInteger(s.level) || s.level < 1 || s.level > 1000
      || !Number.isSafeInteger(s.xp) || s.xp < 0 || s.xp >= s.level * 80
      || !Number.isSafeInteger(s.gold) || s.gold < 0
      || !Number.isInteger(s.rngState) || s.rngState < 0 || s.rngState > 0xffffffff
      || !Number.isFinite(s.resource) || s.resource < 0 || s.resource > CLASSES[s.classId].resourceMax
      || !Array.isArray(s.inventory) || s.inventory.length !== INVENTORY_SIZE
      || !s.inventory.every(item => item === null || isItem(item))
      || !s.equipment || Object.keys(createEquipment()).some(
        key => !(key in s.equipment) || (s.equipment[key as EquipmentSlot] !== null && !isItem(s.equipment[key as EquipmentSlot]))
      )
      || !Array.isArray(s.groundLoot) || s.groundLoot.length > 30
      || !s.groundLoot.every(g => g && typeof g.id === 'string'
        && [g.x, g.y].every(Number.isFinite)
        && g.x >= 0 && g.y >= 0 && g.x <= WORLD_WIDTH && g.y <= WORLD_HEIGHT && isItem(g.item))
    ) return false;

    this.classId = s.classId;
    this.equipment = cloneEquipment(s.equipment);
    this.inventory = s.inventory.map(cloneItem);
    this.groundLoot = s.groundLoot.map(g => ({ ...g, item: cloneItem(g.item)! }));
    this.player = { ...s.player };
    this.enemy = { ...s.enemy };
    this.kills = s.kills;
    this.level = s.level;
    this.xp = s.xp;
    this.gold = s.gold;
    this.resource = s.resource;
    this.rng = new SeededRng(s.rngState);
    this.paused = false;
    this.moveTarget = null;
    this.attackTarget = null;
    this.pickupTarget = null;
    this.attackTimer = 0;
    this.enemyTimer = 0.5;
    this.accumulator = 0;
    this.respawnTimer = this.enemy.alive ? 0 : 2.8;
    this.events.splice(0);
    this.refreshHealthLimit();
    return true;
  }

  reset(classId: ClassId = 'WARRIOR'): void {
    this.classId = classId;
    this.equipment = createEquipment();
    this.inventory = Array(INVENTORY_SIZE).fill(null);
    this.rng = new SeededRng();
    this.player = makeActor('hero', 390, 470, deriveStats(classId, this.equipment).maxHealth);
    this.enemy = makeActor('wraith-1', 780, 520, 72);
    this.groundLoot = [];
    this.moveTarget = null;
    this.attackTarget = null;
    this.pickupTarget = null;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.gold = 75;
    this.resource = CLASSES[classId].resourceInitial;
    this.paused = false;
    this.attackTimer = 0;
    this.enemyTimer = 0.5;
    this.respawnTimer = 0;
    this.accumulator = 0;
    this.events.splice(0);
  }
}
