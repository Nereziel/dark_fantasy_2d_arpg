import type { ActorSnapshot, CharacterProgress, GameCommand, GameEvent, GameSnapshot, Point } from './types';
import { CLASSES, isClassId, type ClassId } from '../data/classes';
import { rollAttackDamage, mitigateDamage } from '../combat/damage';
import {
  SKILLS, emptyCooldowns, emptyEffects, isSkillSlot, isActiveEffect,
  type ActiveEffect, type ActiveEffects, type Cooldowns, type SkillSlot
} from '../skills/skills';
import {
  ENEMY_DEFINITIONS, PACK_SIZE, createPack, validEnemyType, validIntent,
  type EnemyIntent, type EnemySnapshot, type EnemyUnit
} from '../enemies/enemies';
import { ACTOR_RADIUS, canOccupy, findPath, moveActor, type Obstacle } from '../world/navigation';
import { CAMP_RADIUS, generateWorld, type WorldLayout } from '../world/generator';
import { nearWarden, WARDEN_INTERACT_RANGE, WARDEN_POSITION } from '../world/npcs';
import {
  freshQuest, validQuest, QUEST_REQUIRED_KILLS, QUEST_REWARD_GOLD, QUEST_REWARD_XP,
  WARDEN_ID, type QuestProgress
} from '../quests/firstQuest';
import {
  SeededRng, createEquipment, deriveStats, isEquipmentSlot, isItem, rollItem,
  type Equipment, type EquipmentSlot, type GroundItem, type Item
} from '../data/items';

const FIXED_STEP = 1 / 60;
const MAX_FRAME_SECONDS = 0.1;
const PLAYER_SPEED = 190;
const INVENTORY_SIZE = 24;
const ENEMY_SEPARATION = 44;

function makeActor(id: string, x: number, y: number, health: number): ActorSnapshot {
  return { id, x, y, health, maxHealth: health, alive: true };
}
function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function cloneItem(item: Item | null): Item | null {
  return item ? { ...item, affixes: item.affixes.map(a => ({ ...a })) } : null;
}
function cloneEquipment(equipment: Equipment): Equipment {
  return Object.fromEntries(Object.entries(equipment).map(([key, item]) => [key, cloneItem(item)])) as Equipment;
}
function cloneUnit(unit: EnemyUnit): EnemyUnit {
  return {
    actor: { ...unit.actor },
    intent: unit.intent ? { ...unit.intent } : null,
    cooldown: unit.cooldown,
    effects: unit.effects.map(effect => ({ ...effect }))
  };
}
function validActor(actor: ActorSnapshot, id: string, obstacles: readonly Obstacle[]): boolean {
  return !!actor && actor.id === id
    && [actor.x, actor.y, actor.health, actor.maxHealth].every(Number.isFinite)
    && actor.maxHealth > 0 && actor.health >= 0 && actor.health <= actor.maxHealth
    && canOccupy(actor, ACTOR_RADIUS, obstacles)
    && actor.alive === (actor.health > 0);
}

/** Advances actors with collision and uses local A* only when a direct route is blocked. */
function toward(actor: Point, target: Point, speed: number, dt: number, stop: number, obstacles: readonly Obstacle[]): void {
  const remaining = distance(actor, target);
  if (remaining <= stop || remaining < 0.001) return;
  const amount = Math.max(0, Math.min(speed * dt, remaining - stop));
  const before = { ...actor };
  moveActor(actor, target, amount, ACTOR_RADIUS, obstacles);
  if (distance(before, actor) < amount * 0.15 && amount > 0.01) {
    const path = findPath(actor, target, ACTOR_RADIUS, obstacles);
    if (path.length) moveActor(actor, path[0]!, amount, ACTOR_RADIUS, obstacles);
  }
}

/**
 * Renderer-independent multi-enemy simulation. All damage and attack windows
 * are resolved on fixed ticks; the Phaser scene only visualizes snapshots.
 */
export class GameSimulation {
  private classId: ClassId = 'WARRIOR';
  private equipment: Equipment = createEquipment();
  private inventory: Array<Item | null> = Array(INVENTORY_SIZE).fill(null);
  private rng = new SeededRng();
  private cooldowns: Cooldowns = emptyCooldowns();
  private effects: ActiveEffects = emptyEffects();
  private world: WorldLayout = generateWorld(0);
  private units: EnemyUnit[] = createPack(0, 1);
  private selectedTargetId: string | null = null;
  private quest: QuestProgress = freshQuest();
  private pendingNpc = false;
  private pendingSkill: SkillSlot | null = null;
  private player = makeActor('hero', 390, 470, deriveStats('WARRIOR', this.equipment).maxHealth);
  private groundLoot: GroundItem[] = [];
  private movePath: Point[] = [];
  private attackTarget: string | null = null;
  private pickupTarget: string | null = null;
  private paused = false;
  private kills = 0;
  private wave = 0;
  private level = 1;
  private xp = 0;
  private gold = 75;
  private resource = CLASSES.WARRIOR.resourceInitial;
  private attackTimer = 0;
  private respawnTimer = 0;
  private accumulator = 0;
  private readonly events: GameEvent[] = [];

  constructor(seed = 0) { this.reset('WARRIOR', seed); }

  private follow(actor: Point, target: Point, speed: number, dt: number, stop = 0): void {
    toward(actor, target, speed, dt, stop, this.world.obstacles);
  }

  private get focusedUnit(): EnemyUnit {
    return this.units.find(unit => unit.actor.id === this.selectedTargetId && unit.actor.alive)
      ?? this.units.find(unit => unit.actor.alive)
      ?? this.units[0]!;
  }
  private get enemy(): EnemySnapshot {
    return this.focusedUnit.actor;
  }
  private get aliveEnemies(): EnemyUnit[] {
    return this.units.filter(unit => unit.actor.alive);
  }

  command(command: GameCommand): void {
    if (command.type === 'reset') {
      this.reset(isClassId(command.classId) ? command.classId : 'WARRIOR', command.seed ?? this.world.seed);
      return;
    }
    if (command.type === 'pause') {
      this.paused = command.value;
      return;
    }
    if (command.type === 'equip') { this.equip(command.index); return; }
    if (command.type === 'unequip') { this.unequip(command.slot); return; }
    // Dialogue pauses the world, not the quest interaction.
    if (command.type === 'questAccept') {
      if (this.player.alive && nearWarden(this.player) && this.quest.status === 'available') {
        this.quest = { id: this.quest.id, status: 'active', defeated: 0 };
        this.events.push({ type: 'questUpdated', status: this.quest.status, defeated: this.quest.defeated });
      }
      return;
    }
    if (command.type === 'questTurnIn') {
      if (this.player.alive && nearWarden(this.player) && this.quest.status === 'ready') {
        this.quest = { ...this.quest, status: 'completed' };
        this.gold += QUEST_REWARD_GOLD;
        this.awardExperience(QUEST_REWARD_XP);
        this.events.push({ type: 'questUpdated', status: this.quest.status, defeated: this.quest.defeated });
      }
      return;
    }
    if (!this.player.alive || this.paused) return;
    if (command.type === 'interactNpc') {
      if (command.npcId !== WARDEN_ID) return;
      this.movePath = [];
      this.attackTarget = null;
      this.pickupTarget = null;
      this.pendingSkill = null;
      if (nearWarden(this.player)) {
        this.events.push({ type: 'npcDialogue', npcId: WARDEN_ID });
      } else {
        this.pendingNpc = true;
      }
      return;
    }
    if (command.type === 'cast') {
      if (isSkillSlot(command.slot)) this.requestCast(command.slot);
      return;
    }
    if (command.type === 'move') {
      if (!Number.isFinite(command.destination.x) || !Number.isFinite(command.destination.y)) return;
      const target = command.destination;
      const route = findPath(this.player, target, ACTOR_RADIUS, this.world.obstacles);
      if (!route.length) return;
      this.movePath = route;
      this.attackTarget = null;
      this.pickupTarget = null;
      this.pendingSkill = null;
      this.pendingNpc = false;
    } else if (command.type === 'attack') {
      const selected = this.units.find(unit => unit.actor.id === command.targetId && unit.actor.alive);
      if (!selected) return;
      this.selectedTargetId = selected.actor.id;
      this.attackTarget = selected.actor.id;
      this.movePath = [];
      this.pickupTarget = null;
      this.pendingSkill = null;
      this.pendingNpc = false;
    } else if (command.type === 'pickup' && this.groundLoot.some(loot => loot.id === command.id)) {
      this.pickupTarget = command.id;
      this.movePath = [];
      this.attackTarget = null;
      this.pendingSkill = null;
      this.pendingNpc = false;
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
    if (!this.aliveEnemies.length) return;
    this.movePath = [];
    this.attackTarget = null;
    this.pickupTarget = null;
    this.pendingNpc = false;
    if (distance(this.player, this.enemy) > skill.range) {
      this.pendingSkill = slot;
      return;
    }
    this.performCast(slot);
  }

  private applyEffect(target: 'enemy' | 'player', effect: ActiveEffect, unit = this.focusedUnit): void {
    const list = target === 'enemy' ? unit.effects : this.effects.player;
    const existing = list.find(active => active.id === effect.id);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, effect.remaining);
      existing.magnitude = Math.max(existing.magnitude, effect.magnitude);
      existing.tick = 0;
    } else list.push(effect);
  }
  private applyDamage(power: number, unit = this.focusedUnit): number {
    if (!unit.actor.alive) return 0;
    const stats = deriveStats(this.classId, this.equipment);
    const { damage } = rollAttackDamage(
      this.classId, stats, this.rng, power, 10 + this.level * 3, this.level
    );
    return this.hitEnemy(damage, unit);
  }
  private hitEnemy(damage: number, unit: EnemyUnit): number {
    if (!unit.actor.alive || damage <= 0) return 0;
    const dealt = Math.min(unit.actor.health, Math.max(0, Math.round(damage)));
    if (dealt === 0) return 0;
    unit.actor.health -= dealt;
    this.events.push({ type: 'hit', targetId: unit.actor.id, damage: dealt });
    if (unit.actor.health === 0) this.defeatEnemy(unit);
    return dealt;
  }
  private performCast(slot: SkillSlot): void {
    const skill = SKILLS[this.classId][slot];
    const unit = this.focusedUnit;
    if (this.cooldowns[slot] > 0.0001 || this.resource + 0.0001 < skill.cost) return;
    if (skill.target === 'enemy'
      && (!unit.actor.alive || distance(this.player, unit.actor) > skill.range + 0.5)) return;
    this.resource = Math.max(0, this.resource - skill.cost);
    this.cooldowns[slot] = skill.cooldown;
    this.pendingSkill = null;
    const point = skill.target === 'enemy' ? unit.actor : this.player;
    this.events.push({ type: 'cast', skillId: skill.id, x: point.x, y: point.y });

    if (skill.kind === 'dash' && unit.actor.alive) {
      this.follow(this.player, unit.actor, skill.range, 1, 56);
    }
    if (skill.kind === 'strike' || skill.kind === 'dash'
      || skill.kind === 'dot' || skill.kind === 'drain') {
      const damage = this.applyDamage(skill.power, unit);
      if (skill.kind === 'drain' && this.player.alive) {
        this.player.health = Math.min(this.player.maxHealth, this.player.health + Math.ceil(damage * 0.65));
      }
      if (skill.effect && skill.duration && unit.actor.alive
        && ['stunned', 'poisoned', 'burning'].includes(skill.effect)) {
        const magnitude = skill.effect === 'stunned' ? 0
          : Math.max(3, Math.round(2 + deriveStats(this.classId, this.equipment).intelligence * 0.25));
        this.applyEffect('enemy',
          { id: skill.effect, remaining: skill.duration, magnitude, tick: 0 }, unit);
      }
    } else if (skill.kind === 'nova') {
      for (const target of [...this.aliveEnemies]) {
        if (distance(this.player, target.actor) > skill.range) continue;
        this.applyDamage(skill.power, target);
        if (target.actor.alive && skill.effect && skill.duration) {
          this.applyEffect('enemy',
            { id: skill.effect, remaining: skill.duration, magnitude: 0, tick: 0 }, target);
        }
      }
    } else if ((skill.kind === 'aura' || skill.kind === 'summon') && skill.effect && skill.duration) {
      this.applyEffect('player',
        { id: skill.effect, remaining: skill.duration, magnitude: skill.power, tick: 0 });
    }
  }

  private hitPlayer(amount: number): void {
    if (!this.player.alive || amount <= 0) return;
    const applied = Math.max(1, Math.min(this.player.health, Math.round(amount)));
    this.player.health -= applied;
    this.events.push({ type: 'hit', targetId: this.player.id, damage: applied });
    if (this.player.health === 0) {
      this.player.alive = false;
      this.pendingSkill = null;
      this.pendingNpc = false;
      this.movePath = [];
      this.attackTarget = null;
      this.pickupTarget = null;
      for (const unit of this.units) unit.intent = null;
      this.events.push({ type: 'playerDeath' });
    }
  }
  private tickEffects(dt: number): void {
    for (const unit of this.units) {
      for (const effect of unit.effects) {
        effect.remaining -= dt;
        effect.tick += dt;
        if ((effect.id === 'burning' || effect.id === 'poisoned') && unit.actor.alive) {
          while (effect.tick >= 1 && unit.actor.alive) {
            effect.tick -= 1;
            this.hitEnemy(effect.magnitude, unit);
          }
        }
      }
      unit.effects = unit.actor.alive ? unit.effects.filter(effect => effect.remaining > 0) : [];
    }
    for (const effect of this.effects.player) {
      effect.remaining -= dt;
      effect.tick += dt;
      while (effect.tick >= 1 && effect.remaining > -0.0001 && this.player.alive) {
        effect.tick -= 1;
        if (effect.id === 'consecration') {
          this.player.health = Math.min(this.player.maxHealth,
            this.player.health + Math.max(1, Math.round(this.player.maxHealth * 0.025)));
          for (const unit of [...this.aliveEnemies]) {
            if (distance(this.player, unit.actor) <= 135) this.applyDamage(effect.magnitude, unit);
          }
        } else if (effect.id === 'skeleton') {
          const target = this.aliveEnemies
            .find(unit => distance(this.player, unit.actor) <= 280);
          if (target) this.applyDamage(effect.magnitude, target);
        } else if (effect.id === 'poisoned' || effect.id === 'burning') {
          this.hitPlayer(effect.magnitude);
        }
      }
    }
    this.effects.player = this.effects.player.filter(effect => effect.remaining > 0);
  }

  private updateEnemyAI(unit: EnemyUnit, dt: number): void {
    if (!unit.actor.alive || !this.player.alive) { unit.intent = null; return; }
    // The starter camp is a sanctuary even if the player retreats mid-combat.
    if (distance(this.player, this.world.camp) <= CAMP_RADIUS) {
      unit.intent = null;
      return;
    }
    unit.cooldown = Math.max(0, unit.cooldown - dt);
    const actor = unit.actor;
    const def = ENEMY_DEFINITIONS[actor.type];
    if (unit.effects.some(effect => effect.id === 'stunned')) {
      if (unit.intent) {
        unit.intent = null;
        unit.cooldown = Math.max(unit.cooldown, 0.55);
      }
      return;
    }
    if (unit.intent) {
      const intent = unit.intent;
      intent.remaining -= dt;
      if (intent.remaining > 0) return;
      unit.intent = null;
      unit.cooldown = def.cooldown;
      if (intent.pattern === 'leap') {
        // The landing spot is fixed at cast time. Terrain cannot be bypassed.
        if (canOccupy(intent, ACTOR_RADIUS, this.world.obstacles)) {
          actor.x = intent.x;
          actor.y = intent.y;
        }
      }
      const hit = distance(this.player, intent) <= intent.radius;
      if (hit) {
        const stats = deriveStats(this.classId, this.equipment);
        this.hitPlayer(mitigateDamage(def.baseDamage + this.level * 2, stats.armor, this.level));
        if (intent.pattern === 'leap' && this.player.alive) {
          this.applyEffect('player',
            { id: 'poisoned', remaining: 3, magnitude: 3, tick: 0 });
        }
      }
      this.events.push({ type: 'enemyAttack', enemyId: actor.id, hit });
      return;
    }

    const dist = distance(actor, this.player);
    if (dist > def.aggro) return;
    const slowed = unit.effects.some(effect => effect.id === 'chilled');
    const speed = def.speed * (slowed ? 0.35 : 1);
    if (dist > def.preferredRange + 10) {
      this.follow(actor, this.player, speed, dt, def.preferredRange);
    } else if (def.attack === 'bolt' && dist > 0 && dist < def.preferredRange - 23) {
      const retreat = {
        x: actor.x + (actor.x - this.player.x) / dist * speed * dt,
        y: actor.y + (actor.y - this.player.y) / dist * speed * dt
      };
      moveActor(actor, retreat, speed * dt, ACTOR_RADIUS, this.world.obstacles);
    }
    // Formation spacing prevents all mobs from collapsing into one sprite.
    for (const other of this.units) {
      if (other === unit || !other.actor.alive) continue;
      const delta = distance(actor, other.actor);
      if (delta < ENEMY_SEPARATION && delta > 0.01) {
        const retreat = {
          x: actor.x + (actor.x - other.actor.x) / delta * 8,
          y: actor.y + (actor.y - other.actor.y) / delta * 8
        };
        moveActor(actor, retreat, Math.min(8, speed * dt * 0.65), ACTOR_RADIUS, this.world.obstacles);
      }
    }
    if (unit.cooldown > 0 || distance(actor, this.player) > def.attackRange) return;
    const center = def.attack === 'sweep' ? actor : this.player;
    unit.intent = {
      pattern: def.attack, x: center.x, y: center.y,
      radius: def.dangerRadius, remaining: def.windup, total: def.windup
    };
    this.events.push({ type: 'enemyWindup', enemyId: actor.id, pattern: def.attack });
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
    this.resource = Math.min(definition.resourceMax,
      Math.max(0, this.resource + definition.regenRate * dt));
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    for (const slot of ['rmb', 'slot1'] as const) {
      this.cooldowns[slot] = Math.max(0, this.cooldowns[slot] - dt);
    }
    this.tickEffects(dt);
    if (this.aliveEnemies.length === 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.wave++;
        this.units = createPack(this.wave, this.level, this.world.encounterPositions);
        this.selectedTargetId = null;
      }
    }

    const speed = PLAYER_SPEED * (deriveStats(this.classId, this.equipment).moveSpeed / 100);
    const focus = this.focusedUnit;
    if (this.pendingNpc) {
      if (nearWarden(this.player)) {
        this.pendingNpc = false;
        this.events.push({ type: 'npcDialogue', npcId: WARDEN_ID });
      } else {
        this.follow(this.player, WARDEN_POSITION, speed, dt, WARDEN_INTERACT_RANGE - 10);
      }
    } else if (this.pendingSkill && focus.actor.alive) {
      const skill = SKILLS[this.classId][this.pendingSkill];
      if (distance(this.player, focus.actor) > skill.range) {
        this.follow(this.player, focus.actor, speed, dt, Math.max(0, skill.range - 4));
      } else this.performCast(this.pendingSkill);
    } else if (this.attackTarget) {
      const target = this.units.find(unit => unit.actor.id === this.attackTarget && unit.actor.alive);
      if (!target) this.attackTarget = null;
      else if (distance(this.player, target.actor) > definition.attackRange) {
        this.follow(this.player, target.actor, speed, dt, definition.attackRange - 4);
      } else if (this.attackTimer <= 0) {
        const stats = deriveStats(this.classId, this.equipment);
        this.attackTimer = 0.68 / stats.attackSpeed;
        this.applyDamage(1, target);
        if (['WARRIOR', 'NECROMANCER', 'WARLOCK'].includes(this.classId)) {
          this.resource = Math.min(definition.resourceMax,
            this.resource + (this.classId === 'NECROMANCER' ? 10 : 8));
        }
      }
    } else if (this.pickupTarget) {
      const loot = this.groundLoot.find(item => item.id === this.pickupTarget);
      if (!loot) this.pickupTarget = null;
      else if (distance(this.player, loot) <= 36) this.collectLoot(loot);
      else this.follow(this.player, loot, speed, dt, 32);
    } else if (this.movePath.length) {
      const point = this.movePath[0]!;
      this.follow(this.player, point, speed, dt);
      if (distance(this.player, point) <= 6) this.movePath.shift();
    }

    if (this.player.alive) {
      for (const unit of this.units) {
        this.updateEnemyAI(unit, dt);
        if (!this.player.alive) break;
      }
    }
  }

  private awardExperience(amount: number): void {
    this.xp += amount;
    while (this.xp >= this.level * 80) {
      this.xp -= this.level * 80;
      this.level++;
      this.events.push({ type: 'levelUp', level: this.level });
      this.player.health = Math.min(this.player.maxHealth,
        this.player.health + Math.round(this.player.maxHealth * 0.25));
    }
  }

  private defeatEnemy(unit: EnemyUnit): void {
    unit.actor.alive = false;
    unit.intent = null;
    unit.effects = [];
    if (this.attackTarget === unit.actor.id) this.attackTarget = null;
    if (this.selectedTargetId === unit.actor.id) {
      this.selectedTargetId = null;
      this.pendingSkill = null;
    }
    this.kills++;
    this.gold += 12 + this.level * 3;
    this.awardExperience(40 + this.level * 12);
    if (this.quest.status === 'active') {
      const defeated = Math.min(QUEST_REQUIRED_KILLS, this.quest.defeated + 1);
      this.quest = {
        ...this.quest, defeated,
        status: defeated === QUEST_REQUIRED_KILLS ? 'ready' : 'active'
      };
      this.events.push({ type: 'questUpdated', status: this.quest.status, defeated });
    }
    const item = rollItem(this.kills, this.level, this.rng);
    this.groundLoot.push({
      id: 'drop-' + this.kills, x: unit.actor.x, y: unit.actor.y, item
    });
    if (this.groundLoot.length > 30) this.groundLoot.shift();
    this.events.push({ type: 'defeat', targetId: unit.actor.id, kills: this.kills });
    this.events.push({ type: 'loot', id: 'drop-' + this.kills });
    if (this.aliveEnemies.length === 0) this.respawnTimer = 3.2;
  }
  private collectLoot(loot: GroundItem): void {
    const index = this.inventory.findIndex(item => item === null);
    if (index < 0) { this.pickupTarget = null; return; }
    this.inventory[index] = loot.item;
    this.groundLoot = this.groundLoot.filter(item => item.id !== loot.id);
    this.pickupTarget = null;
    this.events.push({ type: 'pickup', id: loot.id });
  }

  /** Persistent character-only projection. No combat, position, wave, seed or drops. */
  character(): CharacterProgress {
    return {
      classId: this.classId,
      level: this.level,
      xp: this.xp,
      gold: this.gold,
      kills: this.kills,
      inventory: this.inventory.map(cloneItem),
      equipment: cloneEquipment(this.equipment),
      quest: { ...this.quest }
    };
  }

  /**
   * Start a genuinely fresh game session from a persistent character.
   * Validate in an isolated simulation first so malformed data cannot mutate
   * the running game. All world/transient state is reset on every load.
   */
  restoreCharacter(progress: CharacterProgress, seed = this.world.seed): boolean {
    if (!progress || !isClassId(progress.classId)) return false;

    const scratch = new GameSimulation();
    scratch.reset(progress.classId);
    const baseline = scratch.snapshot();
    const candidate: GameSnapshot = {
      ...baseline,
      level: progress.level,
      xp: progress.xp,
      gold: progress.gold,
      kills: progress.kills,
      inventory: progress.inventory,
      equipment: progress.equipment,
      quest: progress.quest
    };
    if (!scratch.restore(candidate)) return false;

    this.reset(progress.classId, seed);
    this.level = progress.level;
    this.xp = progress.xp;
    this.gold = progress.gold;
    this.kills = progress.kills;
    this.inventory = progress.inventory.map(cloneItem);
    this.equipment = cloneEquipment(progress.equipment);
    this.quest = { ...progress.quest };
    this.refreshHealthLimit();
    this.player.health = this.player.maxHealth;
    this.units = createPack(0, this.level, this.world.encounterPositions);
    this.events.splice(0);
    return true;
  }

  snapshot(): GameSnapshot {
    const focus = this.focusedUnit;
    const status = this.paused ? 'paused' : !this.player.alive ? 'dead'
      : this.attackTarget || this.pendingSkill ? 'combat'
      : this.movePath.length || this.pickupTarget ? 'moving' : 'ready';
    return {
      version: 5,
      worldSeed: this.world.seed,
      classId: this.classId,
      player: { ...this.player },
      enemy: { ...focus.actor },
      enemyIntent: focus.intent ? { ...focus.intent } : null,
      enemyCooldown: focus.cooldown,
      enemies: this.units.map(cloneUnit),
      selectedTargetId: this.selectedTargetId,
      wave: this.wave,
      respawnTimer: this.respawnTimer,
      kills: this.kills,
      level: this.level,
      xp: this.xp,
      gold: this.gold,
      resource: this.resource,
      rngState: this.rng.state,
      cooldowns: { ...this.cooldowns },
      effects: {
        player: this.effects.player.map(effect => ({ ...effect })),
        enemy: focus.effects.map(effect => ({ ...effect }))
      },
      stats: deriveStats(this.classId, this.equipment),
      inventory: this.inventory.map(cloneItem),
      equipment: cloneEquipment(this.equipment),
      groundLoot: this.groundLoot.map(loot => ({ ...loot, item: cloneItem(loot.item)! })),
      quest: { ...this.quest },
      paused: this.paused,
      status
    };
  }
  drainEvents(): GameEvent[] {
    return this.events.splice(0);
  }

  restore(s: GameSnapshot): boolean {
    const layout = s && Number.isSafeInteger(s.worldSeed)
      && s.worldSeed >= 0 && s.worldSeed <= 0xffffffff
      ? generateWorld(s.worldSeed) : null;
    if (!s || !layout || s.version !== 5 || !isClassId(s.classId)
      || !validActor(s.player, 'hero', layout.obstacles)
      || !Number.isSafeInteger(s.kills) || s.kills < 0
      || !Number.isSafeInteger(s.wave) || s.wave < 0 || s.wave > 1000000
      || !Number.isSafeInteger(s.level) || s.level < 1 || s.level > 1000
      || !Number.isSafeInteger(s.xp) || s.xp < 0 || s.xp >= s.level * 80
      || !Number.isSafeInteger(s.gold) || s.gold < 0
      || !validQuest(s.quest)
      || !Number.isInteger(s.rngState) || s.rngState < 0 || s.rngState > 0xffffffff
      || !Number.isFinite(s.resource) || s.resource < 0 || s.resource > CLASSES[s.classId].resourceMax
      || !Number.isFinite(s.respawnTimer) || s.respawnTimer < 0 || s.respawnTimer > 5
      || !s.cooldowns || !(['rmb', 'slot1'] as const).every(slot =>
        Number.isFinite(s.cooldowns[slot]) && s.cooldowns[slot] >= 0 && s.cooldowns[slot] <= 360)
      || !s.effects || !Array.isArray(s.effects.player)
      || s.effects.player.length > 8 || !s.effects.player.every(isActiveEffect)
      || !Array.isArray(s.enemies) || s.enemies.length !== PACK_SIZE
      || !s.enemies.every((unit, index) =>
        !!unit && !!unit.actor && validEnemyType(unit.actor.type)
        && validActor(unit.actor, unit.actor.type + '-' + (s.wave * PACK_SIZE + index + 1), layout.obstacles)
        && validIntent(unit.intent)
        && (unit.intent === null || unit.intent.pattern === ENEMY_DEFINITIONS[unit.actor.type].attack)
        && Number.isFinite(unit.cooldown) && unit.cooldown >= 0 && unit.cooldown <= 20
        && Array.isArray(unit.effects) && unit.effects.length <= 8
        && unit.effects.every(isActiveEffect))
      || (s.selectedTargetId !== null && (
        typeof s.selectedTargetId !== 'string'
        || !s.enemies.some(unit => unit.actor.id === s.selectedTargetId && unit.actor.alive)))
      || !Array.isArray(s.inventory) || s.inventory.length !== INVENTORY_SIZE
      || !s.inventory.every(item => item === null || isItem(item))
      || !s.equipment || Object.keys(createEquipment()).some(
        key => !(key in s.equipment)
          || (s.equipment[key as EquipmentSlot] !== null && !isItem(s.equipment[key as EquipmentSlot])))
      || !Array.isArray(s.groundLoot) || s.groundLoot.length > 30
      || !s.groundLoot.every(loot => !!loot && typeof loot.id === 'string'
        && canOccupy(loot, 0, layout.obstacles) && isItem(loot.item))
    ) return false;

    this.world = layout;
    this.classId = s.classId;
    this.quest = { ...s.quest };
    this.equipment = cloneEquipment(s.equipment);
    this.inventory = s.inventory.map(cloneItem);
    this.groundLoot = s.groundLoot.map(loot => ({ ...loot, item: cloneItem(loot.item)! }));
    this.player = { ...s.player };
    this.units = s.enemies.map(cloneUnit);
    this.selectedTargetId = s.selectedTargetId;
    this.wave = s.wave;
    this.respawnTimer = s.respawnTimer;
    this.kills = s.kills;
    this.level = s.level;
    this.xp = s.xp;
    this.gold = s.gold;
    this.resource = s.resource;
    this.rng = new SeededRng(s.rngState);
    this.cooldowns = { ...s.cooldowns };
    this.effects = { player: s.effects.player.map(effect => ({ ...effect })), enemy: [] };
    this.paused = false;
    this.movePath = [];
    this.attackTarget = null;
    this.pendingSkill = null;
    this.pendingNpc = false;
    this.pickupTarget = null;
    this.attackTimer = 0;
    this.accumulator = 0;
    this.refreshHealthLimit();
    return true;
  }

  reset(classId: ClassId = 'WARRIOR', seed = this.world.seed): void {
    this.world = generateWorld(seed);
    this.classId = classId;
    this.equipment = createEquipment();
    this.inventory = Array(INVENTORY_SIZE).fill(null);
    this.rng = new SeededRng(seed === 0 ? 0x49ac127b : ((seed ^ 0x49ac127b) >>> 0));
    this.cooldowns = emptyCooldowns();
    this.effects = emptyEffects();
    this.quest = freshQuest();
    this.pendingNpc = false;
    this.units = createPack(0, 1, this.world.encounterPositions);
    this.selectedTargetId = null;
    this.pendingSkill = null;
    this.player = makeActor('hero', this.world.camp.x, this.world.camp.y, deriveStats(classId, this.equipment).maxHealth);
    this.groundLoot = [];
    this.movePath = [];
    this.attackTarget = null;
    this.pickupTarget = null;
    this.kills = 0;
    this.wave = 0;
    this.level = 1;
    this.xp = 0;
    this.gold = 75;
    this.resource = CLASSES[classId].resourceInitial;
    this.paused = false;
    this.attackTimer = 0;
    this.respawnTimer = 0;
    this.accumulator = 0;
    this.events.splice(0);
  }
}
