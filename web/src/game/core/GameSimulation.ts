import type { ActorSnapshot, GameCommand, GameEvent, GameSnapshot, Point } from './types';
import { CLASSES, isClassId, type ClassId } from '../data/classes';
import { rollAttackDamage, mitigateDamage } from '../combat/damage';
import {
  createEncounter, encounterType, ENEMY_DEFINITIONS, validEnemyType, validIntent,
  type EnemyIntent
} from '../enemies/enemies';
import {
  SKILLS, emptyCooldowns, emptyEffects, isSkillSlot, isActiveEffect,
  type ActiveEffect, type ActiveEffects, type Cooldowns, type SkillSlot
} from '../skills/skills';
import {
  SeededRng, createEquipment, deriveStats, isEquipmentSlot, isItem, rollItem,
  type Equipment, type EquipmentSlot, type GroundItem, type Item
} from '../data/items';

const WORLD_WIDTH = 2200;
const WORLD_HEIGHT = 1400;
const FIXED_STEP = 1 / 60;
const MAX_FRAME_SECONDS = 0.1;
const PLAYER_SPEED = 190;
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
  private cooldowns: Cooldowns = emptyCooldowns();
  private effects: ActiveEffects = emptyEffects();
  private pendingSkill: SkillSlot | null = null;
  private player = makeActor('hero', 390, 470, deriveStats('WARRIOR', this.equipment).maxHealth);
  private enemy = createEncounter(0, 1);
  private enemyIntent: EnemyIntent | null = null;
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
    if (command.type === 'cast') {
      if (isSkillSlot(command.slot)) this.requestCast(command.slot);
      return;
    }

    if (command.type === 'move') {
      const { x, y } = command.destination;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      this.moveTarget = {
        x: Math.max(28, Math.min(WORLD_WIDTH - 28, x)),
        y: Math.max(28, Math.min(WORLD_HEIGHT - 28, y))
      };
      this.attackTarget = null;
      this.pickupTarget = null;
      this.pendingSkill = null;
    } else if (command.type === 'attack' && command.targetId === this.enemy.id && this.enemy.alive) {
      this.attackTarget = command.targetId;
      this.moveTarget = null;
      this.pickupTarget = null;
      this.pendingSkill = null;
    } else if (command.type === 'pickup' && this.groundLoot.some(g => g.id === command.id)) {
      this.pickupTarget = command.id;
      this.moveTarget = null;
      this.attackTarget = null;
      this.pendingSkill = null;
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

  private requestCast(slot: SkillSlot): void {
    const skill = SKILLS[this.classId][slot];
    if (this.cooldowns[slot] > 0.0001 || this.resource + 0.0001 < skill.cost) return;
    if (skill.target === 'self') {
      this.performCast(slot);
      return;
    }
    if (!this.enemy.alive) return;
    this.moveTarget = null;
    this.attackTarget = null;
    this.pickupTarget = null;
    if (distance(this.player, this.enemy) > skill.range) {
      // A queued cast does not spend resources until the hero reaches range.
      this.pendingSkill = slot;
      return;
    }
    this.performCast(slot);
  }

  private applyEffect(target: 'enemy' | 'player', effect: ActiveEffect): void {
    const list = this.effects[target];
    const existing = list.find(active => active.id === effect.id);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, effect.remaining);
      existing.magnitude = Math.max(existing.magnitude, effect.magnitude);
      existing.tick = 0;
    } else list.push(effect);
  }

  private applyDamage(power: number): number {
    if (!this.enemy.alive) return 0;
    const stats = deriveStats(this.classId, this.equipment);
    const { damage } = rollAttackDamage(
      this.classId, stats, this.rng, power, 10 + this.level * 3, this.level
    );
    return this.hitEnemy(damage);
  }

  private hitEnemy(damage: number): number {
    if (!this.enemy.alive || damage <= 0) return 0;
    const dealt = Math.min(this.enemy.health, Math.max(0, Math.round(damage)));
    if (dealt === 0) return 0;
    this.enemy.health -= dealt;
    this.events.push({ type: 'hit', targetId: this.enemy.id, damage: dealt });
    if (this.enemy.health === 0) this.defeatEnemy();
    return dealt;
  }

  private performCast(slot: SkillSlot): void {
    const skill = SKILLS[this.classId][slot];
    if (this.cooldowns[slot] > 0.0001 || this.resource + 0.0001 < skill.cost) return;
    if (skill.target === 'enemy' &&
      (!this.enemy.alive || distance(this.player, this.enemy) > skill.range + 0.5)) return;
    this.resource = Math.max(0, this.resource - skill.cost);
    this.cooldowns[slot] = skill.cooldown;
    this.pendingSkill = null;
    const point = skill.target === 'enemy' ? this.enemy : this.player;
    this.events.push({ type: 'cast', skillId: skill.id, x: point.x, y: point.y });

    if (skill.kind === 'dash' && this.enemy.alive) {
      // Dash to the target; clamp to the navigable world and stop at melee range.
      toward(this.player, this.enemy, skill.range, 1, 56);
    }
    if (skill.kind === 'strike' || skill.kind === 'dash' ||
      skill.kind === 'dot' || skill.kind === 'drain') {
      const damage = this.applyDamage(skill.power);
      if (skill.kind === 'drain' && this.player.alive) {
        this.player.health = Math.min(this.player.maxHealth, this.player.health + Math.ceil(damage * 0.65));
      }
      if (skill.effect && skill.duration && this.enemy.alive) {
        if (skill.effect === 'stunned' || skill.effect === 'poisoned' || skill.effect === 'burning') {
          const magnitude = skill.effect === 'stunned' ? 0
            : Math.max(3, Math.round(2 + deriveStats(this.classId, this.equipment).intelligence * 0.25));
          this.applyEffect('enemy', { id: skill.effect, remaining: skill.duration, magnitude, tick: 0 });
        }
      }
    } else if (skill.kind === 'nova') {
      if (this.enemy.alive && distance(this.player, this.enemy) <= skill.range) {
        this.applyDamage(skill.power);
        if (this.enemy.alive && skill.effect && skill.duration) {
          this.applyEffect('enemy', { id: skill.effect, remaining: skill.duration, magnitude: 0, tick: 0 });
        }
      }
    } else if ((skill.kind === 'aura' || skill.kind === 'summon') && skill.effect && skill.duration) {
      this.applyEffect('player', { id: skill.effect, remaining: skill.duration, magnitude: skill.power, tick: 0 });
    }
  }

  /** Simulation-owned timed statuses. No Phaser animation controls damage timing. */
  private tickEffects(dt: number): void {
    for (const effect of this.effects.enemy) {
      effect.remaining -= dt;
      effect.tick += dt;
      if ((effect.id === 'burning' || effect.id === 'poisoned') && this.enemy.alive) {
        while (effect.tick >= 1 && this.enemy.alive) {
          effect.tick -= 1;
          this.hitEnemy(effect.magnitude);
        }
      }
    }
    this.effects.enemy = this.enemy.alive
      ? this.effects.enemy.filter(effect => effect.remaining > 0) : [];

    for (const effect of this.effects.player) {
      effect.remaining -= dt;
      effect.tick += dt;
      while (effect.tick >= 1 && effect.remaining > -0.0001 && this.player.alive) {
        effect.tick -= 1;
        if (effect.id === 'consecration') {
          this.player.health = Math.min(this.player.maxHealth,
            this.player.health + Math.max(1, Math.round(this.player.maxHealth * 0.025)));
          if (this.enemy.alive && distance(this.player, this.enemy) <= 135) this.applyDamage(effect.magnitude);
        } else if (effect.id === 'skeleton') {
          if (this.enemy.alive && distance(this.player, this.enemy) <= 280) this.applyDamage(effect.magnitude);
        } else if (effect.id === 'poisoned' || effect.id === 'burning') {
          this.hitPlayer(effect.magnitude);
        }
      }
    }
    this.effects.player = this.effects.player.filter(effect => effect.remaining > 0);
  }

  private hitPlayer(amount: number): void {
    if (!this.player.alive || amount <= 0) return;
    const applied = Math.max(1, Math.min(this.player.health, Math.round(amount)));
    this.player.health -= applied;
    this.events.push({ type: 'hit', targetId: this.player.id, damage: applied });
    if (this.player.health === 0) {
      this.player.alive = false;
      this.enemyIntent = null;
      this.pendingSkill = null;
      this.moveTarget = null;
      this.attackTarget = null;
      this.pickupTarget = null;
      this.events.push({ type: 'playerDeath' });
    }
  }

  private updateEnemyAI(dt: number): void {
    if (!this.enemy.alive || !this.player.alive) {
      this.enemyIntent = null;
      return;
    }
    const def = ENEMY_DEFINITIONS[this.enemy.type];
    const stunned = this.effects.enemy.some(e => e.id === 'stunned');
    if (stunned) {
      // Stun interrupts a pending telegraphed attack.
      if (this.enemyIntent) {
        this.enemyIntent = null;
        this.enemyTimer = Math.max(this.enemyTimer, 0.55);
      }
      return;
    }
    if (this.enemyIntent) {
      const intent = this.enemyIntent;
      intent.remaining -= dt;
      if (intent.remaining > 0) return;

      this.enemyIntent = null;
      this.enemyTimer = def.cooldown;
      if (intent.pattern === 'leap') {
        // The landing spot is locked at telegraph time, so a dodge matters.
        this.enemy.x = Math.max(28, Math.min(WORLD_WIDTH - 28, intent.x));
        this.enemy.y = Math.max(28, Math.min(WORLD_HEIGHT - 28, intent.y));
      }
      const hit = distance(this.player, intent) <= intent.radius;
      if (hit) {
        const stats = deriveStats(this.classId, this.equipment);
        const raw = def.baseDamage + this.level * 2;
        this.hitPlayer(mitigateDamage(raw, stats.armor, this.level));
        if (intent.pattern === 'leap' && this.player.alive) {
          this.applyEffect('player', { id: 'poisoned', remaining: 3, magnitude: 3, tick: 0 });
        }
      }
      this.events.push({ type: 'enemyAttack', enemyId: this.enemy.id, hit });
      return;
    }

    const dist = distance(this.enemy, this.player);
    if (dist > def.aggro) return;
    const slowed = this.effects.enemy.some(e => e.id === 'chilled');
    const speed = def.speed * (slowed ? 0.35 : 1);
    if (dist > def.preferredRange + 10) {
      toward(this.enemy, this.player, speed, dt, def.preferredRange);
    } else if (def.attack === 'bolt' && dist > 0 && dist < def.preferredRange - 23) {
      // Ranged wraiths kite instead of walking into melee range.
      const ux = (this.enemy.x - this.player.x) / dist;
      const uy = (this.enemy.y - this.player.y) / dist;
      this.enemy.x = Math.max(28, Math.min(WORLD_WIDTH - 28, this.enemy.x + ux * speed * dt));
      this.enemy.y = Math.max(28, Math.min(WORLD_HEIGHT - 28, this.enemy.y + uy * speed * dt));
    }
    if (this.enemyTimer > 0 || distance(this.enemy, this.player) > def.attackRange) return;
    const center = def.attack === 'sweep' ? this.enemy : this.player;
    this.enemyIntent = {
      pattern: def.attack, x: center.x, y: center.y,
      radius: def.dangerRadius, remaining: def.windup, total: def.windup
    };
    this.events.push({ type: 'enemyWindup', enemyId: this.enemy.id, pattern: def.attack });
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
    for (const slot of ['rmb', 'slot1'] as const) {
      this.cooldowns[slot] = Math.max(0, this.cooldowns[slot] - dt);
    }
    this.tickEffects(dt);
    if (!this.enemy.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.enemy = createEncounter(this.kills, this.level);
        this.enemyTimer = 0.7;
        this.enemyIntent = null;
        this.effects.enemy = [];
      }
    }

    const playerSpeed = PLAYER_SPEED * (deriveStats(this.classId, this.equipment).moveSpeed / 100);
    if (this.pendingSkill && this.enemy.alive) {
      const skill = SKILLS[this.classId][this.pendingSkill];
      if (distance(this.player, this.enemy) > skill.range) {
        toward(this.player, this.enemy, playerSpeed, dt, Math.max(0, skill.range - 4));
      } else {
        this.performCast(this.pendingSkill);
      }
    } else if (this.attackTarget === this.enemy.id && this.enemy.alive) {
      if (distance(this.player, this.enemy) > definition.attackRange) {
        toward(this.player, this.enemy, playerSpeed, dt, definition.attackRange - 4);
      } else if (this.attackTimer <= 0) {
        const stats = deriveStats(this.classId, this.equipment);
        this.attackTimer = 0.68 / stats.attackSpeed;
        this.applyDamage(1);
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

    this.updateEnemyAI(dt);
  }

  private defeatEnemy(): void {
    this.enemy.alive = false;
    this.kills++;
    this.respawnTimer = 2.8;
    this.attackTarget = null;
    this.pendingSkill = null;
    this.enemyIntent = null;
    this.effects.enemy = [];
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
      version: 4,
      classId: this.classId,
      player: { ...this.player }, enemy: { ...this.enemy },
      enemyIntent: this.enemyIntent ? { ...this.enemyIntent } : null,
      enemyCooldown: this.enemyTimer,
      kills: this.kills, level: this.level, xp: this.xp, gold: this.gold,
      resource: this.resource, rngState: this.rng.state,
      cooldowns: { ...this.cooldowns },
      effects: {
        player: this.effects.player.map(e => ({ ...e })),
        enemy: this.effects.enemy.map(e => ({ ...e }))
      },
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
    if (!s || s.version !== 4 || !isClassId(s.classId)
      || !validActor(s.player, 'hero')
      || !validEnemyType(s.enemy?.type)
      || !validActor(s.enemy, `${s.enemy.type}-${s.kills + (s.enemy.alive ? 1 : 0)}`)
      || s.enemy.type !== encounterType(s.enemy.alive ? s.kills : Math.max(0, s.kills - 1))
      || !validIntent(s.enemyIntent)
      || !Number.isFinite(s.enemyCooldown) || s.enemyCooldown < 0 || s.enemyCooldown > 20
      || (s.enemyIntent !== null
        && s.enemyIntent.pattern !== ENEMY_DEFINITIONS[s.enemy.type].attack)
      || !Number.isSafeInteger(s.kills) || s.kills < 0
      || !Number.isSafeInteger(s.level) || s.level < 1 || s.level > 1000
      || !Number.isSafeInteger(s.xp) || s.xp < 0 || s.xp >= s.level * 80
      || !Number.isSafeInteger(s.gold) || s.gold < 0
      || !Number.isInteger(s.rngState) || s.rngState < 0 || s.rngState > 0xffffffff
      || !Number.isFinite(s.resource) || s.resource < 0 || s.resource > CLASSES[s.classId].resourceMax
      || !s.cooldowns || !(['rmb', 'slot1'] as const).every(slot =>
        typeof s.cooldowns[slot] === 'number' && Number.isFinite(s.cooldowns[slot])
        && s.cooldowns[slot] >= 0 && s.cooldowns[slot] <= 360)
      || !s.effects || !(['player', 'enemy'] as const).every(key =>
        Array.isArray(s.effects[key]) && s.effects[key].length <= 8
        && s.effects[key].every(isActiveEffect))
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
    this.enemyIntent = s.enemyIntent ? { ...s.enemyIntent } : null;
    this.enemyTimer = s.enemyCooldown;
    this.kills = s.kills;
    this.level = s.level;
    this.xp = s.xp;
    this.gold = s.gold;
    this.resource = s.resource;
    this.rng = new SeededRng(s.rngState);
    this.cooldowns = { ...s.cooldowns };
    this.effects = {
      player: s.effects.player.map(e => ({ ...e })),
      enemy: s.effects.enemy.map(e => ({ ...e }))
    };
    this.pendingSkill = null;
    this.paused = false;
    this.moveTarget = null;
    this.attackTarget = null;
    this.pickupTarget = null;
    this.attackTimer = 0;
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
    this.cooldowns = emptyCooldowns();
    this.effects = emptyEffects();
    this.pendingSkill = null;
    this.player = makeActor('hero', 390, 470, deriveStats(classId, this.equipment).maxHealth);
    this.enemy = createEncounter(0, 1);
    this.enemyIntent = null;
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
