import type { ActorSnapshot, CharacterProgress, GameCommand, GameEvent, GameSnapshot, Point, ProjectileSnapshot, ZoneId } from './types';
import { spawnPlayer, updateHealthLimit, advanceResource, regenerateHealth } from '../entities/player';
import { moveToward, nextMoveSpeed } from '../entities/playerMovement';
import { applyOrRefreshEffect } from '../status/effectStack';
import { WARRIOR_ABILITIES, getWarriorAbility, type WarriorAbilityId } from '../skills/warriorKit';
import { canActivateWarriorSkill, spendAndStartCooldown, advanceWarriorCooldowns, applyWarriorRageDelta, type WarriorActivationRequest } from '../skills/warriorEconomy';
import { startCombatTimeline, advanceCombatTimeline, type CombatTimelineState } from '../animation/combatTimeline';
import { STATUS_DEFINITIONS, type StatusId } from '../status/statusDefinitions';
import { applyStatus, advanceStatuses, getStatusModifiers, type StatusInstance, type StatusRule } from '../status/statusRuntime';
import { CLASSES, isClassId, type ClassId } from '../data/classes';
import { resolveTypedDamage, resolveHealing, type DamageType, type DamageResult } from '../combat/typedDamage';
import type { SkillAim } from '../input/skillAiming';
import { getWorldObject, isWorldObjectId, worldObjectsFor, type WorldObjectId } from '../world/interactables';
import {
  SKILLS, emptyCooldowns, emptyEffects, isSkillSlot, isActiveEffect,
  type ActiveEffect, type ActiveEffects, type Cooldowns, type SkillSlot
} from '../skills/skills';
import {
  ENEMY_DEFINITIONS, PACK_SIZE, createPack, createCryptPack, validEnemyType, validIntent,
  packTypesForWave, enemyArchetype,
  type EnemyIntent, type EnemySnapshot, type EnemyUnit
} from '../enemies/enemies';
import { planEnemyBehavior } from '../enemies/behaviorPlanner';
import { getEnemyArchetype } from '../enemies/archetypeCatalog';
import { ACTOR_RADIUS, canOccupy, findPath, moveActor, resolveReachableDestination, type Obstacle } from '../world/navigation';
import {
  CAMP, CAMP_RADIUS, CRYPT_GATE, CRYPT_EXIT, CRYPT_BOSS_POSITIONS,
  generateWorld, generateCrypt, type WorldLayout
} from '../world/generator';
import {
  nearNpc, nearWarden, isNpcId, NPC_POSITIONS, NPC_INTERACT_RANGE,
  MERCHANT_ID, BLACKSMITH_ID, type NpcId
} from '../world/npcs';
import { getOffer, createShopItem, sellPrice, temperCost, temperItem } from '../trade/commerce';
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
  private warriorCooldowns: Partial<Record<WarriorAbilityId, number>> = {};
  private warriorPending: { id: WarriorAbilityId; targetId: string | null } | null = null;
  private warriorAction: { id: WarriorAbilityId; targetId: string | null; timeline: CombatTimelineState; hitCount: number } | null = null;
  private statusEffects: { player: StatusInstance[]; enemies: Record<string, StatusInstance[]> } = { player: [], enemies: {} };
  private effects: ActiveEffects = emptyEffects();
  private world: WorldLayout = generateWorld(0);
  private zone: ZoneId = 'wilderness';
  private dungeonStage: 0 | 1 = 0;
  private dungeonCleared = false;
  private pendingPortal = false;
  private units: EnemyUnit[] = createPack(0, 1);
  private selectedTargetId: string | null = null;
  private quest: QuestProgress = freshQuest();
  private pendingNpc: NpcId | null = null;
  private pendingSkill: SkillSlot | null = null;
  private pendingAim: SkillAim | null = null;
  private player = spawnPlayer('WARRIOR', this.equipment, { x: 390, y: 470 });
  private groundLoot: GroundItem[] = [];
  private movePath: Point[] = [];
  private attackTarget: string | null = null;
  private pickupTarget: string | null = null;
  private pendingObject: WorldObjectId | null = null;
  private usedObjects = new Set<WorldObjectId>();
  private shield = 0;
  private projectiles: ProjectileSnapshot[] = [];
  private nextProjectileId = 0;
  private movementSpeed = 0;
  private healthRegenCarry = 0;
  private paused = false;
  private kills = 0;
  private wave = 0;
  private level = 1;
  private xp = 0;
  private gold = 75;
  private resource = CLASSES.WARRIOR.resourceInitial;
  private attackTimer = 0;
  private holdPosition = false;
  private evadeCooldown = 0;
  private respawnTimer = 0;
  private accumulator = 0;
  private readonly events: GameEvent[] = [];

  constructor(seed = 0) { this.reset('WARRIOR', seed); }

  private get immobilized(): boolean {
    return this.effects.player.some(e => e.id === 'stunned' || e.id === 'rooted')
      || this.statusEffects.player.some(e => e.id === 'stunned' || e.id === 'frozen' || e.id === 'rooted');
  }

  private follow(actor: Point, target: Point, speed: number, dt: number, stop = 0): void {
    if (actor === this.player) {
      if (this.immobilized) { this.movementSpeed = 0; return; }
      const left = Math.max(0, distance(actor, target) - stop);
      this.movementSpeed = nextMoveSpeed(this.movementSpeed, speed, left, dt);
      moveToward(actor, target, this.movementSpeed, dt, stop, this.world.obstacles);
      if (left <= 0.01) this.movementSpeed = 0;
    } else moveToward(actor, target, speed, dt, stop, this.world.obstacles);
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
    if (command.type === 'holdPosition') {
      if (!this.player.alive || (this.paused && command.value)) return;
      this.holdPosition = command.value;
      if (command.value) {
        this.movePath = [];
        this.pickupTarget = null;
        this.pendingNpc = null;
        this.pendingPortal = false;
      }
      return;
    }
    if (command.type === 'evade') {
      if (!this.player.alive || this.paused || this.evadeCooldown > 0 || this.immobilized) return;
      const nearest = this.aliveEnemies
        .map(unit => unit.actor)
        .sort((a, b) => distance(this.player, a) - distance(this.player, b))[0];
      const delta = nearest && distance(this.player, nearest) < 310
        ? { x: this.player.x - nearest.x, y: this.player.y - nearest.y }
        : { x: 1, y: 0 };
      const len = Math.hypot(delta.x, delta.y);
      const unit = len > 0.001 ? { x: delta.x / len, y: delta.y / len } : { x: 1, y: 0 };
      const goal = { x: this.player.x + unit.x * 115, y: this.player.y + unit.y * 115 };
      const before = { ...this.player };
      moveActor(this.player, goal, 115, ACTOR_RADIUS, this.world.obstacles);
      if (distance(before, this.player) < 1) return;
      this.evadeCooldown = 2.5;
      this.warriorPending = null;
      this.warriorAction = null;
      this.movePath = [];
      this.attackTarget = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pickupTarget = null;
      this.pendingNpc = null;
      this.pendingPortal = false;
      return;
    }
    if (command.type === 'equip') { this.equip(command.index); return; }
    if (command.type === 'unequip') { this.unequip(command.slot); return; }
    // Shop actions must be checked inside the authoritative simulation.
    // A shop panel pauses combat, but doesn't disable transactions.
    if (command.type === 'buyItem') {
      this.buyItem(command.offerId);
      return;
    }
    if (command.type === 'sellItem') {
      this.sellItem(command.index);
      return;
    }
    if (command.type === 'temperItem') {
      this.temperEquipment(command.slot);
      return;
    }
    // Dialogue pauses the world, not the quest interaction.
    if (command.type === 'questAccept') {
      if (this.zone === 'wilderness' && this.player.alive && nearWarden(this.player) && this.quest.status === 'available') {
        this.quest = { id: this.quest.id, status: 'active', defeated: 0 };
        this.events.push({ type: 'questUpdated', status: this.quest.status, defeated: this.quest.defeated });
      }
      return;
    }
    if (command.type === 'questTurnIn') {
      if (this.zone === 'wilderness' && this.player.alive && nearWarden(this.player) && this.quest.status === 'ready') {
        this.quest = { ...this.quest, status: 'completed' };
        this.gold += QUEST_REWARD_GOLD;
        this.awardExperience(QUEST_REWARD_XP);
        this.events.push({ type: 'questUpdated', status: this.quest.status, defeated: this.quest.defeated });
      }
      return;
    }
    if (!this.player.alive || this.paused) return;
    if (command.type === 'interactObject') {
      const object = getWorldObject(command.id, this.zone);
      if (!object || this.usedObjects.has(object.id)) return;
      this.movePath = [];
      this.attackTarget = null;
      this.pickupTarget = null;
      this.pendingNpc = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pendingPortal = false;
      this.pendingObject = object.id;
      this.tryInteractObject();
      return;
    }
    if (command.type === 'usePortal') {
      this.movePath = [];
      this.attackTarget = null;
      this.pickupTarget = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pendingNpc = null;
      this.pendingObject = null;
      this.pendingPortal = true;
      if (distance(this.player, this.portalPosition) <= 78) this.changeZone();
      return;
    }
    if (command.type === 'interactNpc') {
      if (this.zone !== 'wilderness' || !isNpcId(command.npcId)) return;
      this.movePath = [];
      this.attackTarget = null;
      this.pickupTarget = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pendingObject = null;
      this.pendingPortal = false;
      if (nearNpc(this.player, command.npcId)) {
        this.events.push({ type: 'npcDialogue', npcId: command.npcId });
      } else {
        this.pendingNpc = command.npcId;
      }
      return;
    }
    if (command.type === 'warriorAbility') {
      if (this.classId !== 'WARRIOR' || !getWarriorAbility(command.id)) return;
      const unit = command.targetId === undefined ? this.focusedUnit
        : this.units.find(u => u.actor.alive && u.actor.id === command.targetId);
      this.requestWarriorAbility(command.id, unit?.actor.id ?? null);
      return;
    }
    if (command.type === 'cast') {
      if (!isSkillSlot(command.slot)) return;
      if (command.targetId !== undefined) {
        const target = this.units.find(unit =>
          unit.actor.alive && unit.actor.id === command.targetId
        );
        if (!target) return;
        this.selectedTargetId = target.actor.id;
      }
      this.requestCast(command.slot, command.aim);
      return;
    }
    if (command.type === 'move') {
      if (!Number.isFinite(command.destination.x) || !Number.isFinite(command.destination.y)) return;
      if (this.holdPosition) return;
      const target = resolveReachableDestination(
        this.player, command.destination, ACTOR_RADIUS, this.world.obstacles
      );
      if (!target) return;
      this.warriorPending = null;
      this.warriorAction = null;
      const route = findPath(this.player, target, ACTOR_RADIUS, this.world.obstacles);
      if (!route.length) return;
      this.movePath = route;
      this.attackTarget = null;
      this.pickupTarget = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pendingNpc = null;
      this.pendingObject = null;
      this.pendingPortal = false;
    } else if (command.type === 'attack') {
      const selected = this.units.find(unit => unit.actor.id === command.targetId && unit.actor.alive);
      if (!selected) return;
      this.selectedTargetId = selected.actor.id;
      this.warriorPending = null;
      this.warriorAction = null;
      this.attackTarget = selected.actor.id;
      this.movePath = [];
      this.pickupTarget = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pendingNpc = null;
      this.pendingObject = null;
      this.pendingPortal = false;
    } else if (command.type === 'pickup' && this.groundLoot.some(loot => loot.id === command.id)) {
      this.pickupTarget = command.id;
      this.movePath = [];
      this.attackTarget = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pendingNpc = null;
      this.pendingObject = null;
      this.pendingPortal = false;
    }
  }

  /** Resolve world interactions in the authoritative fixed-step model. */
  private tryInteractObject(): void {
    const object = getWorldObject(this.pendingObject, this.zone);
    if (!object || this.usedObjects.has(object.id)) {
      this.pendingObject = null;
      return;
    }
    if (distance(this.player, object.position) > object.reach) return;
    this.pendingObject = null;
    this.usedObjects.add(object.id);
    if (object.kind === 'shrine') {
      this.shield = Math.max(this.shield, Math.round(this.player.maxHealth * 0.3));
    } else {
      const item = rollItem(this.kills + 101, this.level, this.rng);
      this.groundLoot.push({
        id: 'cache-' + object.id, x: object.position.x, y: object.position.y,
        item: { ...item, id: 'cache-' + object.id + '-item' }
      });
      if (this.groundLoot.length > 30) this.groundLoot.shift();
    }
    this.events.push({ type: 'worldInteract', id: object.id, kind: object.kind });
  }

  private shopAllowed(npcId: NpcId): boolean {
    return this.zone === 'wilderness' && this.player.alive && nearNpc(this.player, npcId);
  }

  private buyItem(offerId: string): void {
    if (!this.shopAllowed(MERCHANT_ID)) return;
    const offer = getOffer(offerId);
    const index = this.inventory.findIndex(item => item === null);
    if (!offer || index < 0 || this.gold < offer.price) return;
    // IDs must not collide with purchased items from previous sessions.
    const existing = new Set(
      [...this.inventory, ...Object.values(this.equipment)]
        .filter((item): item is Item => item !== null)
        .map(item => item.id)
    );
    let suffix = 1;
    while (existing.has(`trade-${offer.id}-${suffix}`)) suffix++;
    this.inventory[index] = createShopItem(offer, `trade-${offer.id}-${suffix}`);
    this.gold -= offer.price;
  }

  private sellItem(index: number): void {
    if (!this.shopAllowed(MERCHANT_ID)
      || !Number.isSafeInteger(index) || index < 0 || index >= this.inventory.length) return;
    const item = this.inventory[index];
    if (!item) return;
    this.gold += sellPrice(item);
    this.inventory[index] = null;
  }

  private temperEquipment(slot: EquipmentSlot): void {
    if (!this.shopAllowed(BLACKSMITH_ID) || !isEquipmentSlot(slot)) return;
    const item = this.equipment[slot];
    if (!item) return;
    const forged = temperItem(item);
    if (!forged) return;
    const price = temperCost(item);
    if (this.gold < price) return;
    this.equipment[slot] = forged;
    this.gold -= price;
    this.refreshHealthLimit();
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
    updateHealthLimit(this.player, max);
  }


  /** Decide if a Warrior ability should cast now or approach its target first. */
  private warriorActivation(id: WarriorAbilityId, targetId: string | null): WarriorActivationRequest {
    const ability = WARRIOR_ABILITIES[id];
    const actor = targetId ? this.units.find(u => u.actor.alive && u.actor.id === targetId)?.actor : null;
    return {
      skill: {
        id, cost: ability.rageCost, cooldown: ability.cooldown,
        range: ability.range, target: ability.target,
        autoApproach: ability.autoApproach, silenceRestricted: false,
        movementSkill: ability.tags.includes('MOVEMENT')
      },
      state: {
        rage: this.resource, maxRage: CLASSES.WARRIOR.resourceMax,
        cooldowns: { ...this.warriorCooldowns,
          cleave: Math.max(this.warriorCooldowns.cleave ?? 0, this.cooldowns.rmb),
          charge: Math.max(this.warriorCooldowns.charge ?? 0, this.cooldowns.slot1) }
      },
      actor: this.player, target: actor ?? null,
      stunned: this.effects.player.some(e => e.id === 'stunned'),
      silenced: this.statusEffects.player.some(e => e.id === 'silenced'),
      holdPosition: this.holdPosition, canMove: !this.immobilized
    };
  }

  private requestWarriorAbility(id: WarriorAbilityId, targetId: string | null): void {
    if (!this.player.alive || this.paused || this.classId !== 'WARRIOR' || this.warriorAction) return;
    const ability = WARRIOR_ABILITIES[id];
    const request = this.warriorActivation(id, targetId);
    const decision = canActivateWarriorSkill(request);
    if (decision.status === 'approach') {
      this.warriorPending = { id, targetId };
      this.movePath = [];
      this.attackTarget = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pickupTarget = null;
      return;
    }
    if (decision.status !== 'ready') {
      this.warriorPending = null;
      return;
    }
    const spent = spendAndStartCooldown(request);
    if (spent.decision.status !== 'ready') return;
    this.resource = spent.state.rage;
    this.warriorCooldowns = { ...spent.state.cooldowns } as Partial<Record<WarriorAbilityId, number>>;
    if (id === 'cleave') this.cooldowns.rmb = ability.cooldown;
    if (id === 'charge') this.cooldowns.slot1 = ability.cooldown;
    this.warriorPending = null;
    this.movePath = [];
    this.attackTarget = null;
    this.pendingSkill = null;
    this.pendingAim = null;
    const timeline = startCombatTimeline({
      actionId: id,
      animation: ability.channel ? 'channel' : ability.tags.includes('BUFF') ? 'cast' : 'attack',
      windupTicks: Math.max(1, Math.round(ability.hit / FIXED_STEP)),
      sustainTicks: ability.channel ? Math.round(ability.channel.duration / FIXED_STEP) : 0,
      recoveryTicks: Math.max(1, Math.round(ability.recovery / FIXED_STEP)),
      movementLocked: true
    }).state;
    this.warriorAction = { id, targetId, timeline, hitCount: 0 };
    const target = targetId ? this.units.find(u => u.actor.id === targetId)?.actor : null;
    this.events.push({ type: 'cast', skillId: id, x: target?.x ?? this.player.x, y: target?.y ?? this.player.y });
  }

  private applyCanonicalStatus(
    recipient: 'player' | 'enemy', id: StatusId, sourceId: string,
    magnitude?: number, duration?: number, unit?: EnemyUnit
  ): void {
    const definition = STATUS_DEFINITIONS[id];
    const rule: StatusRule = {
      id, duration: duration ?? definition.duration,
      magnitude: magnitude ?? definition.magnitude,
      stacking: definition.stackMode === 'stack' ? 'add' : 'refresh',
      maxStacks: definition.maxStacks,
      tickInterval: definition.tickInterval ?? undefined,
      dispelCategory: definition.dispelCategory,
      immunityTags: definition.immunityGroup ? [definition.immunityGroup] : [],
      visualHook: definition.visualHook,
      modifiers: definition.modifierKind === 'speedBoost' ? { moveSpeed: 1 }
        : definition.modifierKind === 'movementSpeed' ? { moveSpeed: -1 }
        : definition.modifierKind === 'damageReduction' ? { damageReduction: 1 }
        : definition.modifierKind === 'damageTaken' ? { damageTaken: 1 } : {}
    };
    if (recipient === 'player') {
      this.statusEffects.player = applyStatus(this.statusEffects.player, rule, sourceId);
    } else if (unit?.actor.alive) {
      this.statusEffects.enemies[unit.actor.id] = applyStatus(
        this.statusEffects.enemies[unit.actor.id] ?? [], rule, sourceId);
    }
  }

  private tickCanonicalStatuses(dt: number): void {
    const player = advanceStatuses(this.statusEffects.player, dt);
    this.statusEffects.player = player.statuses;
    for (const tick of player.ticks) {
      if (!this.player.alive) break;
      if (tick.statusId === 'regeneration') {
        this.player.health = resolveHealing(this.player.health, this.player.maxHealth, tick.magnitude).health;
      } else if (tick.statusId === 'burning' || tick.statusId === 'poisoned' || tick.statusId === 'bleeding') {
        this.dealPlayerDamage(tick.magnitude,
          tick.statusId === 'burning' ? 'fire' : tick.statusId === 'poisoned' ? 'poison' : 'physical', tick.sourceId);
      }
    }
    for (const unit of this.units) {
      const result = advanceStatuses(this.statusEffects.enemies[unit.actor.id] ?? [], dt);
      if (!unit.actor.alive || result.statuses.length === 0) delete this.statusEffects.enemies[unit.actor.id];
      else this.statusEffects.enemies[unit.actor.id] = result.statuses;
      for (const tick of result.ticks) {
        if (!unit.actor.alive) break;
        if (tick.statusId === 'regeneration') {
          unit.actor.health = resolveHealing(unit.actor.health, unit.actor.maxHealth, tick.magnitude).health;
        } else if (tick.statusId === 'burning' || tick.statusId === 'poisoned' || tick.statusId === 'bleeding') {
          this.resolveEnemyDamage(tick.magnitude, unit,
            tick.statusId === 'burning' ? 'fire' : tick.statusId === 'poisoned' ? 'poison' : 'physical', tick.sourceId);
        }
      }
    }
  }

  private warriorImpact(id: WarriorAbilityId, targetId: string | null): void {
    const ability = WARRIOR_ABILITIES[id];
    const target = targetId ? this.units.find(u => u.actor.alive && u.actor.id === targetId) : null;
    if (id === 'warCry') {
      this.applyCanonicalStatus('player', 'haste', 'hero', 0.2, 8);
      this.applyCanonicalStatus('player', 'fortified', 'hero', 0.2, 8);
      this.resource = applyWarriorRageDelta({
        rage: this.resource, maxRage: CLASSES.WARRIOR.resourceMax,
        cooldowns: this.warriorCooldowns
      }, ability.rageGain).rage;
    } else {
      if (id === 'charge' && target) {
        moveActor(this.player, target.actor, Math.max(0, distance(this.player, target.actor) - 52),
          ACTOR_RADIUS, this.world.obstacles);
      }
      const victims = ability.radius !== undefined
        ? [...this.aliveEnemies].filter(u => distance(this.player, u.actor) <= ability.radius! + 0.5)
        : target && distance(this.player, target.actor) <= ability.range + 0.5 ? [target] : [];
      for (const unit of victims) {
        const power = ability.condition
          && unit.actor.health / unit.actor.maxHealth <= ability.condition.threshold
          ? ability.condition.bonusPower : ability.power;
        const dealt = this.applyDamage(power, unit, 'physical');
        if (dealt > 0 && ability.rageGain > 0) {
          this.resource = applyWarriorRageDelta({
            rage: this.resource, maxRage: CLASSES.WARRIOR.resourceMax,
            cooldowns: this.warriorCooldowns
          }, ability.rageGain).rage;
        }
        const stun = ability.effects.find(e => e.id === 'stunned');
        if (stun && unit.actor.alive) {
          this.applyEffect('enemy',
            { id: 'stunned', remaining: stun.duration, magnitude: 0, tick: 0 }, unit);
        }
      }
    }
    this.events.push({ type: 'warriorImpact', id, x: this.player.x, y: this.player.y });
  }

  private tickWarriorTimeline(): void {
    const action = this.warriorAction;
    if (!action) return;
    const result = advanceCombatTimeline(action.timeline, 1);
    action.timeline = result.state;
    for (const event of result.events) {
      if (event.type === 'impact' && this.player.alive) {
        this.warriorImpact(action.id, action.targetId);
        action.hitCount++;
      }
    }
    const ability = WARRIOR_ABILITIES[action.id];
    if (ability.channel && action.timeline.phase === 'sustain' && this.player.alive) {
      const elapsed = action.timeline.elapsedTicks - action.timeline.windupTicks;
      const interval = Math.max(1, Math.round(ability.channel.tickInterval / FIXED_STEP));
      if (elapsed > 0 && elapsed % interval === 0) {
        this.warriorImpact(action.id, action.targetId);
        action.hitCount++;
      }
    }
    if (action.timeline.phase === 'complete' || action.timeline.phase === 'cancelled') this.warriorAction = null;
  }

  private requestCast(slot: SkillSlot, aim?: SkillAim): void {
    const skill = SKILLS[this.classId][slot];
    if (skill.kind === 'dash' && this.holdPosition) return;
    if (this.effects.player.some(e => e.id === 'stunned')
      || this.cooldowns[slot] > 0.0001 || this.resource + 0.0001 < skill.cost) return;

    // Aimed positions and directions are validated by the authoritative simulation.
    if (aim?.mode === 'GROUND_POSITION' || aim?.mode === 'AREA') {
      if (!Number.isFinite(aim.position.x) || !Number.isFinite(aim.position.y)) return;
      if ((aim.mode === 'AREA' && skill.kind !== 'nova')
        || (aim.mode === 'GROUND_POSITION' && skill.id !== 'fireball')) return;
      if (distance(this.player, aim.position) > skill.range + 0.5) {
        if (this.holdPosition) return;
        this.pendingSkill = slot;
        this.pendingAim = { ...aim, position: { ...aim.position } };
        this.movePath = [];
        this.attackTarget = null;
        this.pickupTarget = null;
        this.pendingNpc = null;
        this.pendingObject = null;
        this.pendingPortal = false;
        return;
      }
      this.performCast(slot, aim);
      return;
    }
    if (aim?.mode === 'DIRECTION') {
      if (skill.kind !== 'dash' || !Number.isFinite(aim.direction.x)
        || !Number.isFinite(aim.direction.y)
        || Math.hypot(aim.direction.x, aim.direction.y) < 0.5) return;
      this.performCast(slot, aim);
      return;
    }
    if (aim?.mode === 'TARGET_ENTITY') {
      const target = this.units.find(unit => unit.actor.alive && unit.actor.id === aim.targetId);
      if (!target) return;
      this.selectedTargetId = target.actor.id;
    }
    this.pendingAim = null;
    if (skill.target === 'self') {
      this.performCast(slot);
      return;
    }
    if (!this.aliveEnemies.length) return;
    this.movePath = [];
    this.attackTarget = null;
    this.pickupTarget = null;
    this.pendingNpc = null;
    this.pendingObject = null;
    this.pendingPortal = false;
    if (distance(this.player, this.enemy) > skill.range) {
      if (!this.holdPosition) this.pendingSkill = slot;
      return;
    }
    this.performCast(slot);
  }

  private applyEffect(target: 'enemy' | 'player', effect: ActiveEffect, unit = this.focusedUnit): void {
    if (target === 'player') this.effects.player = applyOrRefreshEffect(this.effects.player, effect);
    else unit.effects = applyOrRefreshEffect(unit.effects, effect);
  }

  private enemyResistance(unit: EnemyUnit, type: DamageType): number {
    if (unit.actor.type === 'wraith' && type === 'shadow') return 35;
    if (unit.actor.type === 'wolf' && type === 'poison') return 30;
    if (unit.actor.type === 'crypt_lord' && type === 'shadow') return 20;
    return 0;
  }

  private publishDamage(sourceId: string, targetId: string,
    damageType: DamageType, result: DamageResult): void {
    this.events.push({
      type: 'damageResolved', sourceId, targetId, damageType,
      damage: result.damage, absorbed: result.absorbed,
      critical: result.critical, dodged: result.dodged, blocked: result.blocked
    });
  }

  private resolveEnemyDamage(base: number, unit: EnemyUnit, type: DamageType,
    sourceId: string, multiplier = 1, critChance = 0): number {
    if (!unit.actor.alive) return 0;
    const result = resolveTypedDamage({
      type, base, multiplier, critChance,
      defenderArmor: 10 + this.level * 3, defenderLevel: this.level,
      resistancePercent: Math.min(95, this.enemyResistance(unit, type) +
        100 * Math.min(0.8, getStatusModifiers(this.statusEffects.enemies[unit.actor.id] ?? []).damageReduction ?? 0))
    }, this.rng);
    this.publishDamage(sourceId, unit.actor.id, type, result);
    return this.hitEnemy(result.damage, unit);
  }

  private applyDamage(power: number, unit = this.focusedUnit, type: DamageType = 'physical'): number {
    if (!unit.actor.alive) return 0;
    const stats = deriveStats(this.classId, this.equipment);
    const rolled = stats.damageMin + this.rng.next() * (stats.damageMax - stats.damageMin);
    const primary = ['MAGE', 'NECROMANCER', 'WARLOCK'].includes(this.classId)
      ? stats.intelligence : stats.strength;
    return this.resolveEnemyDamage(
      rolled, unit, type, 'hero',
      (1 + primary * 0.035) * Math.max(0, power), stats.critChance
    );
  }

  private dealPlayerDamage(base: number, type: DamageType, sourceId: string): boolean {
    if (!this.player.alive) return false;
    const stats = deriveStats(this.classId, this.equipment);
    const resistance = type === 'fire' ? stats.fireResist
      : type === 'frost' ? stats.frostResist
      : type === 'lightning' ? stats.lightningResist
      : type === 'poison' ? stats.poisonResist
      : type === 'shadow' ? stats.shadowResist
      : type === 'holy' ? stats.holyResist : 0;
    const result = resolveTypedDamage({
      type, base, defenderArmor: stats.armor, defenderLevel: this.level,
      resistancePercent: Math.min(95, resistance +
        100 * Math.min(0.8, getStatusModifiers(this.statusEffects.player).damageReduction ?? 0)),
      dodgeChance: stats.dodgeChance,
      blockChance: stats.blockChance, shield: this.shield
    }, this.rng);
    this.shield = result.shieldRemaining;
    this.publishDamage(sourceId, this.player.id, type, result);
    if (result.damage > 0) this.hitPlayer(result.damage);
    return result.damage > 0;
  }

  private fireBolt(source: EnemyUnit, target: Point, radius: number, base: number): void {
    const shot: ProjectileSnapshot = {
      id: 'projectile-' + (++this.nextProjectileId),
      sourceId: source.actor.id, x: source.actor.x, y: source.actor.y,
      target: { ...target }, type: 'shadow',
      speed: 560, radius, remaining: 2.5, base
    };
    this.projectiles.push(shot);
    this.events.push({ type: 'projectileLaunch', id: shot.id, sourceId: shot.sourceId });
  }

  private tickProjectiles(dt: number): void {
    const remaining: ProjectileSnapshot[] = [];
    for (const shot of this.projectiles) {
      const length = distance(shot, shot.target);
      const travel = Math.min(length, shot.speed * dt);
      if (length > 0.001) {
        shot.x += (shot.target.x - shot.x) / length * travel;
        shot.y += (shot.target.y - shot.y) / length * travel;
      }
      shot.remaining -= dt;
      const blocked = !canOccupy(shot, 3, this.world.obstacles);
      const landed = distance(shot, shot.target) < 3;
      if (!blocked && !landed && shot.remaining > 0) {
        remaining.push(shot);
        continue;
      }
      const sanctuary = this.zone === 'wilderness'
        && distance(this.player, this.world.camp) <= CAMP_RADIUS;
      const hit = !blocked && landed && !sanctuary
        && distance(this.player, shot.target) <= shot.radius
        && this.dealPlayerDamage(shot.base, shot.type, shot.sourceId);
      this.events.push({ type: 'projectileImpact', id: shot.id, hit: Boolean(hit) });
      this.events.push({ type: 'enemyAttack', enemyId: shot.sourceId, hit: Boolean(hit) });
    }
    this.projectiles = remaining;
  }

  private skillDamageType(slot: SkillSlot): DamageType {
    const id = SKILLS[this.classId][slot].id;
    if (id === 'fireball' || id === 'soulBurn') return 'fire';
    if (id === 'frostNova') return 'frost';
    if (id === 'poisonBlade') return 'poison';
    if (id === 'lifeDrain') return 'shadow';
    if (id === 'judgment' || id === 'consecration') return 'holy';
    return 'physical';
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
  private performCast(slot: SkillSlot, aim?: SkillAim): void {
    const skill = SKILLS[this.classId][slot];
    const unit = this.focusedUnit;
    if (this.cooldowns[slot] > 0.0001 || this.resource + 0.0001 < skill.cost) return;
    const aimed = aim?.mode === 'GROUND_POSITION' || aim?.mode === 'AREA' || aim?.mode === 'DIRECTION';
    if (skill.target === 'enemy' && !aimed
      && (!unit.actor.alive || distance(this.player, unit.actor) > skill.range + 0.5)) return;
    this.resource = Math.max(0, this.resource - skill.cost);
    this.cooldowns[slot] = skill.cooldown;
    if (this.classId === 'WARRIOR') this.warriorCooldowns[skill.id as WarriorAbilityId] = skill.cooldown;
    this.pendingSkill = null;
    this.pendingAim = null;
    const point = (aim?.mode === 'GROUND_POSITION' || aim?.mode === 'AREA')
      ? aim.position : skill.target === 'enemy' ? unit.actor : this.player;
    this.events.push({ type: 'cast', skillId: skill.id, x: point.x, y: point.y });

    if (skill.kind === 'dash' && aim?.mode === 'DIRECTION') {
      const length = Math.hypot(aim.direction.x, aim.direction.y);
      const dx = aim.direction.x / length, dy = aim.direction.y / length;
      moveActor(this.player, {
        x: this.player.x + dx * Math.min(skill.range, 170),
        y: this.player.y + dy * Math.min(skill.range, 170)
      }, Math.min(skill.range, 170), ACTOR_RADIUS, this.world.obstacles);
    } else if (skill.kind === 'dash' && unit.actor.alive) {
      this.follow(this.player, unit.actor, skill.range, 1, 56);
    }
    if (skill.id === 'fireball' && aim?.mode === 'GROUND_POSITION') {
      for (const target of [...this.aliveEnemies]) {
        if (distance(aim.position, target.actor) > (skill.impactRadius ?? 66)) continue;
        this.applyDamage(skill.power, target, 'fire');
        if (target.actor.alive && skill.duration) {
          this.applyEffect('enemy', {
            id: 'burning', remaining: skill.duration,
            magnitude: Math.max(3, Math.round(2 + deriveStats(this.classId, this.equipment).intelligence * 0.25)),
            tick: 0
          }, target);
        }
      }
    } else if (skill.kind === 'strike' || skill.kind === 'dash'
      || skill.kind === 'dot' || skill.kind === 'drain') {
      const damage = unit.actor.alive && (aim?.mode !== 'DIRECTION'
        || distance(this.player, unit.actor) <= 75)
        ? this.applyDamage(skill.power, unit, this.skillDamageType(slot)) : 0;
      if (skill.kind === 'drain' && this.player.alive) {
        this.player.health = resolveHealing(this.player.health, this.player.maxHealth, Math.ceil(damage * 0.65)).health;
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
        const center = aim?.mode === 'AREA' ? aim.position : this.player;
        if (distance(center, target.actor) > (skill.impactRadius ?? skill.range)) continue;
        this.applyDamage(skill.power, target, this.skillDamageType(slot));
        if (target.actor.alive && skill.effect && skill.duration) {
          this.applyEffect('enemy',
            { id: skill.effect, remaining: skill.duration, magnitude: 0, tick: 0 }, target);
        }
      }
    } else if ((skill.kind === 'aura' || skill.kind === 'summon') && skill.effect && skill.duration) {
      if (skill.id === 'consecration') {
        this.shield = Math.max(this.shield, Math.round(this.player.maxHealth * 0.25));
      }
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
      this.warriorPending = null;
      this.warriorAction = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pendingNpc = null;
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
            this.resolveEnemyDamage(effect.magnitude, unit,
              effect.id === 'poisoned' ? 'poison' : 'fire', 'status-' + effect.id);
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
          this.player.health = resolveHealing(
            this.player.health, this.player.maxHealth,
            Math.max(1, Math.round(this.player.maxHealth * 0.025))
          ).health;
          for (const unit of [...this.aliveEnemies]) {
            if (distance(this.player, unit.actor) <= 135) this.applyDamage(effect.magnitude, unit, 'holy');
          }
        } else if (effect.id === 'skeleton') {
          const target = this.aliveEnemies
            .find(unit => distance(this.player, unit.actor) <= 280);
          if (target) this.applyDamage(effect.magnitude, target);
        } else if (effect.id === 'poisoned' || effect.id === 'burning') {
          this.dealPlayerDamage(effect.magnitude,
            effect.id === 'poisoned' ? 'poison' : 'fire', 'status-' + effect.id);
        }
      }
    }
    this.effects.player = this.effects.player.filter(effect => effect.remaining > 0);
  }


  /** Data-driven Wave B AI runs in the deterministic TypeScript simulation. */
  private updateMonsterTactics(unit: EnemyUnit, dt: number): void {
    const actor = unit.actor;
    const def = ENEMY_DEFINITIONS[actor.type];
    const profile = getEnemyArchetype(enemyArchetype(actor.type));
    if (!profile || !actor.alive || !this.player.alive) return;
    const index = this.units.indexOf(unit);
    const spawn = this.world.encounterPositions[index];
    if (!spawn) return;
    const origin = { x: spawn.x, y: spawn.y + (this.wave % 2) * 25 };
    const role = enemyArchetype(actor.type);
    const allies = this.units.filter(u => u !== unit && u.actor.alive).map(u => ({
      ...u.actor, lineOfSight: true,
      reachable: distance(actor, u.actor) <= profile.aggroRange
    }));
    const decision = planEnemyBehavior({
      actor, origin, target: this.player, allies,
      config: {
        archetypeId: role, aggroRange: def.aggro,
        attackRange: def.attackRange,
        preferredDistance: Math.min(def.preferredRange, def.attackRange),
        leashRange: Math.max(profile.leashRange, def.aggro + 100),
        specialRange: role === 'healer' ? 220 : Math.min(def.aggro, Math.max(def.attackRange, 230)),
        healHealthRatio: 0.88,
        fleeHealthRatio: profile.retreatThreshold
      },
      attackCooldown: unit.cooldown, abilityCooldown: unit.cooldown,
      lineOfSight: true,
      navigation: {
        targetReachable: canOccupy(this.player, ACTOR_RADIUS, this.world.obstacles),
        originReachable: canOccupy(origin, ACTOR_RADIUS, this.world.obstacles),
        repositionReachable: true, retreatReachable: true, patrolReachable: true
      }
    });
    if (decision.action === 'heal') {
      const ally = this.units.find(u => u.actor.id === decision.targetId && u.actor.alive);
      if (ally && unit.cooldown <= 0 && distance(actor, ally.actor) <= 220) {
        ally.actor.health = resolveHealing(ally.actor.health, ally.actor.maxHealth, 36).health;
        unit.cooldown = 6.5;
        this.events.push({ type: 'enemyHeal', enemyId: actor.id, targetId: ally.actor.id, amount: 36 });
      }
    } else if (decision.action === 'cast' && decision.targetId !== this.player.id) {
      const ally = this.units.find(u => u.actor.id === decision.targetId && u.actor.alive);
      if (ally && unit.cooldown <= 0) {
        this.applyCanonicalStatus('enemy', 'fortified', actor.id, 0.2, 6, ally);
        unit.cooldown = 8;
      }
    } else if (decision.action === 'attack' || decision.action === 'cast') {
      if (unit.cooldown > 0) return;
      const center = def.attack === 'sweep' ? actor : this.player;
      unit.intent = {
        pattern: def.attack, x: center.x, y: center.y,
        radius: def.dangerRadius, remaining: def.windup, total: def.windup
      };
      this.events.push({ type: 'enemyWindup', enemyId: actor.id, pattern: def.attack });
    } else if ('destination' in decision) {
      const point = decision.destination;
      if (canOccupy(point, ACTOR_RADIUS, this.world.obstacles)) {
        const pace = def.speed * profile.speedMultiplier
          * (this.statusEffects.enemies[actor.id]?.some(e => e.id === 'slowed') ? 0.7 : 1);
        const stop = decision.action === 'chase' ? Math.max(0, def.preferredRange - 4) : 0;
        this.follow(actor, point, pace, dt, stop);
      }
    }
  }

  private updateEnemyAI(unit: EnemyUnit, dt: number): void {
    if (!unit.actor.alive || !this.player.alive) { unit.intent = null; return; }
    // The starter camp is a sanctuary even if the player retreats mid-combat.
    if (this.zone === 'wilderness' && distance(this.player, this.world.camp) <= CAMP_RADIUS) {
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
      if (intent.pattern === 'bolt') {
        this.fireBolt(unit, intent, intent.radius, def.baseDamage + this.level * 2);
        return;
      }
      const hit = distance(this.player, intent) <= intent.radius
        && this.dealPlayerDamage(def.baseDamage + this.level * 2,
          intent.pattern === 'leap' ? 'poison' : 'physical', actor.id);
      if (hit && intent.pattern === 'sweep' && actor.type === 'spider' && this.player.alive) {
        this.applyCanonicalStatus('player', 'poisoned', actor.id, 3, 4);
      }
      if (hit && intent.pattern === 'leap' && this.player.alive) {
        this.applyEffect('player',
          { id: 'poisoned', remaining: 3, magnitude: 3, tick: 0 });
      }
      this.events.push({ type: 'enemyAttack', enemyId: actor.id, hit: Boolean(hit) });
      return;
    }

    if (this.zone === 'wilderness' && this.wave >= 2) {
      this.updateMonsterTactics(unit, dt);
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

  private get portalPosition(): Point {
    return this.zone === 'wilderness' ? CRYPT_GATE : CRYPT_EXIT;
  }

  /** Switch areas without persisting any dungeon, enemy or world state. */
  private changeZone(): void {
    const destination: ZoneId = this.zone === 'wilderness' ? 'crypt' : 'wilderness';
    const seed = this.world.seed;
    this.zone = destination;
    this.world = destination === 'crypt' ? generateCrypt(seed) : generateWorld(seed);
    this.player.x = destination === 'crypt' ? CRYPT_EXIT.x : CAMP.x;
    this.player.y = destination === 'crypt' ? CRYPT_EXIT.y : CAMP.y;
    this.dungeonStage = 0;
    this.dungeonCleared = false;
    this.shield = 0;
    this.projectiles = [];
    this.nextProjectileId = 0;
    this.movementSpeed = 0;
    this.healthRegenCarry = 0;
    this.usedObjects.clear();
    this.pendingObject = null;
    this.wave = 0;
    this.units = destination === 'crypt'
      ? createCryptPack(0, this.level, this.world.encounterPositions)
      : createPack(0, this.level, this.world.encounterPositions);
    this.respawnTimer = 0;
    this.groundLoot = [];
    this.effects = emptyEffects();
    this.cooldowns = emptyCooldowns();
    this.warriorCooldowns = {};
    this.warriorPending = null;
    this.warriorAction = null;
    this.statusEffects = { player: [], enemies: {} };
    this.attackTimer = 0;
    this.accumulator = 0;
    this.holdPosition = false;
    this.evadeCooldown = 0;
    this.movePath = [];
    this.attackTarget = null;
    this.pickupTarget = null;
    this.pendingSkill = null;
    this.pendingAim = null;
    this.pendingNpc = null;
    this.pendingPortal = false;
    this.selectedTargetId = null;
    this.events.push({ type: 'zoneChanged', zone: destination });
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
    this.resource = advanceResource(this.resource, definition.regenRate, definition.resourceMax, dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.evadeCooldown = Math.max(0, this.evadeCooldown - dt);
    for (const slot of ['rmb', 'slot1'] as const) {
      this.cooldowns[slot] = Math.max(0, this.cooldowns[slot] - dt);
    }
    this.warriorCooldowns = { ...advanceWarriorCooldowns({
      rage: this.resource, maxRage: CLASSES.WARRIOR.resourceMax,
      cooldowns: this.warriorCooldowns
    }, dt).cooldowns } as Partial<Record<WarriorAbilityId, number>>;
    this.warriorCooldowns.cleave = this.cooldowns.rmb;
    this.warriorCooldowns.charge = this.cooldowns.slot1;
    this.tickEffects(dt);
    this.tickCanonicalStatuses(dt);
    this.tickWarriorTimeline();
    if (this.player.alive) {
      const regen = regenerateHealth(
        this.player.health, this.player.maxHealth,
        deriveStats(this.classId, this.equipment).healthRegen, dt, this.healthRegenCarry
      );
      this.player.health = regen.health;
      this.healthRegenCarry = regen.carry;
    }
    this.tickProjectiles(dt);
    if (this.aliveEnemies.length === 0 && !this.dungeonCleared) {
      if (this.zone === 'wilderness') {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) {
          this.wave++;
          this.units = createPack(this.wave, this.level, this.world.encounterPositions);
          this.statusEffects.enemies = {};
          this.respawnTimer = 0;
          this.selectedTargetId = null;
        }
      } else if (this.dungeonStage === 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) {
          this.dungeonStage = 1;
          this.wave = 1;
          this.units = createCryptPack(1, this.level, CRYPT_BOSS_POSITIONS);
          this.statusEffects.enemies = {};
          this.respawnTimer = 0;
          this.selectedTargetId = null;
        }
      } else {
        this.dungeonCleared = true;
        this.respawnTimer = 0;
        this.gold += 200;
        this.awardExperience(150);
        this.events.push({ type: 'dungeonCleared' });
      }
    }

    const haste = getStatusModifiers(this.statusEffects.player).moveSpeed ?? 0;
    const speed = PLAYER_SPEED * (deriveStats(this.classId, this.equipment).moveSpeed / 100)
      * Math.max(0.25, Math.min(1.6, 1 + haste));
    const focus = this.focusedUnit;
    if (this.pendingPortal) {
      if (distance(this.player, this.portalPosition) <= 78) {
        this.changeZone();
        return;
      }
      this.follow(this.player, this.portalPosition, speed, dt, 70);
    } else if (this.pendingNpc) {
      if (nearNpc(this.player, this.pendingNpc)) {
        const id = this.pendingNpc;
        this.pendingNpc = null;
        this.events.push({ type: 'npcDialogue', npcId: id });
      } else {
        this.follow(this.player, NPC_POSITIONS[this.pendingNpc], speed, dt, NPC_INTERACT_RANGE - 10);
      }
    } else if (this.pendingObject) {
      const object = getWorldObject(this.pendingObject, this.zone);
      if (!object) this.pendingObject = null;
      else if (distance(this.player, object.position) <= object.reach) this.tryInteractObject();
      else this.follow(this.player, object.position, speed, dt, object.reach - 10);
    } else if (this.warriorAction?.timeline.movementLocked) {
      this.movementSpeed = 0;
    } else if (this.warriorPending) {
      const pending = this.warriorPending;
      const target = pending.targetId ? this.units.find(u => u.actor.alive && u.actor.id === pending.targetId) : null;
      if (WARRIOR_ABILITIES[pending.id].target === 'enemy' && !target) this.warriorPending = null;
      else if (target && distance(this.player, target.actor) > WARRIOR_ABILITIES[pending.id].range) {
        if (this.holdPosition || this.immobilized) this.warriorPending = null;
        else this.follow(this.player, target.actor, speed, dt, WARRIOR_ABILITIES[pending.id].range - 4);
      } else this.requestWarriorAbility(pending.id, pending.targetId);
    } else if (this.pendingSkill && (focus.actor.alive || this.pendingAim !== null)) {
      const skill = SKILLS[this.classId][this.pendingSkill];
      const aim = this.pendingAim;
      if (aim?.mode === 'GROUND_POSITION' || aim?.mode === 'AREA') {
        if (distance(this.player, aim.position) > skill.range) {
          if (!this.holdPosition) {
            this.follow(this.player, aim.position, speed, dt, Math.max(0, skill.range - 4));
          }
        } else this.performCast(this.pendingSkill, aim);
      } else if (distance(this.player, focus.actor) > skill.range) {
        if (!this.holdPosition) {
          this.follow(this.player, focus.actor, speed, dt, Math.max(0, skill.range - 4));
        }
      } else this.performCast(this.pendingSkill);
    } else if (this.attackTarget) {
      const target = this.units.find(unit => unit.actor.id === this.attackTarget && unit.actor.alive);
      if (!target) this.attackTarget = null;
      else if (distance(this.player, target.actor) > definition.attackRange) {
        if (!this.holdPosition) {
          this.follow(this.player, target.actor, speed, dt, definition.attackRange - 4);
        }
      } else if (this.attackTimer <= 0 && !this.effects.player.some(e => e.id === 'stunned')) {
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
      this.player.health = resolveHealing(
        this.player.health, this.player.maxHealth,
        Math.round(this.player.maxHealth * 0.25)
      ).health;
    }
  }

  private defeatEnemy(unit: EnemyUnit): void {
    unit.actor.alive = false;
    unit.intent = null;
    unit.effects = [];
    delete this.statusEffects.enemies[unit.actor.id];
    if (this.attackTarget === unit.actor.id) this.attackTarget = null;
    if (this.selectedTargetId === unit.actor.id) {
      this.selectedTargetId = null;
      this.pendingSkill = null;
      this.pendingAim = null;
    }
    this.kills++;
    this.gold += 12 + this.level * 3;
    this.awardExperience(40 + this.level * 12);
    if (this.zone === 'wilderness' && this.quest.status === 'active') {
      const defeated = Math.min(QUEST_REQUIRED_KILLS, this.quest.defeated + 1);
      this.quest = {
        ...this.quest, defeated,
        status: defeated === QUEST_REQUIRED_KILLS ? 'ready' : 'active'
      };
      this.events.push({ type: 'questUpdated', status: this.quest.status, defeated });
    }
    if (unit.actor.type === 'crypt_lord') {
      this.gold += 100;
      this.awardExperience(120);
    }
    const rolled = rollItem(this.kills, this.level, this.rng);
    const item = unit.actor.type === 'crypt_lord' && rolled.rarity === 'COMMON'
      ? { ...rolled, rarity: 'RARE' as const } : rolled;
    this.groundLoot.push({
      id: 'drop-' + this.kills, x: unit.actor.x, y: unit.actor.y, item
    });
    if (this.groundLoot.length > 30) this.groundLoot.shift();
    this.events.push({ type: 'defeat', targetId: unit.actor.id, kills: this.kills });
    this.events.push({ type: 'loot', id: 'drop-' + this.kills });
    if (this.aliveEnemies.length === 0) this.respawnTimer = this.zone === 'crypt' && this.dungeonStage === 1 ? 0 : 3.2;
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
      : this.attackTarget || this.pendingSkill || this.warriorAction || this.warriorPending ? 'combat'
      : this.movePath.length || this.pickupTarget || this.pendingObject
        || this.pendingNpc || this.pendingPortal ? 'moving' : 'ready';
    return {
      version: 5,
      worldSeed: this.world.seed,
      zone: this.zone,
      dungeonStage: this.dungeonStage,
      dungeonCleared: this.dungeonCleared,
      classId: this.classId,
      player: { ...this.player },
      enemy: { ...focus.actor },
      enemyIntent: focus.intent ? { ...focus.intent } : null,
      enemyCooldown: focus.cooldown,
      enemies: this.units.map(cloneUnit),
      selectedTargetId: this.selectedTargetId,
      wave: this.wave,
      respawnTimer: this.respawnTimer,
      shield: this.shield,
      projectiles: this.projectiles.map(p => ({ ...p, target: { ...p.target } })),
      usedInteractables: [...this.usedObjects],
      interactables: worldObjectsFor(this.zone).filter(o => !this.usedObjects.has(o.id)),
      moveDestination: this.movePath.length ? { ...this.movePath[this.movePath.length - 1]! } : null,
      holdPosition: this.holdPosition,
      evadeCooldown: this.evadeCooldown,
      kills: this.kills,
      level: this.level,
      xp: this.xp,
      gold: this.gold,
      resource: this.resource,
      rngState: this.rng.state,
      cooldowns: { ...this.cooldowns },
      warriorCooldowns: { ...this.warriorCooldowns },
      warriorAction: this.warriorAction ? {
        ...this.warriorAction, timeline: { ...this.warriorAction.timeline }
      } : null,
      statusEffects: {
        player: this.statusEffects.player.map(s => ({ ...s, modifiers: { ...s.modifiers }, immunityTags: [...s.immunityTags] })),
        enemies: Object.fromEntries(Object.entries(this.statusEffects.enemies)
          .map(([id, values]) => [id, values.map(s => ({ ...s, modifiers: { ...s.modifiers }, immunityTags: [...s.immunityTags] }))]))
      },
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
      && (s.zone === 'wilderness' || s.zone === 'crypt')
      ? (s.zone === 'crypt' ? generateCrypt(s.worldSeed) : generateWorld(s.worldSeed))
      : null;
    if (!s || !layout || s.version !== 5 || !isClassId(s.classId)
      || (s.dungeonStage !== 0 && s.dungeonStage !== 1)
      || typeof s.dungeonCleared !== 'boolean'
      || (s.zone === 'wilderness' && (s.dungeonStage !== 0 || s.dungeonCleared))
      || (s.zone === 'crypt' && s.wave !== s.dungeonStage)
      || (s.dungeonCleared && (s.zone !== 'crypt' || s.dungeonStage !== 1
        || !Array.isArray(s.enemies)
        || s.enemies.some(unit => unit?.actor?.alive)))
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
      || !Number.isFinite(s.shield) || s.shield < 0 || s.shield > 100000
      || !Array.isArray(s.projectiles) || s.projectiles.length > 80
      || !s.projectiles.every(p => !!p && typeof p.id === 'string'
        && typeof p.sourceId === 'string' && !!p.target
        && [p.x, p.y, p.target.x, p.target.y, p.speed, p.radius, p.remaining, p.base].every(Number.isFinite)
        && p.speed > 0 && p.remaining > 0 && p.remaining <= 5
        && p.radius > 0 && p.radius <= 250 && p.base >= 0
        && ['physical', 'fire', 'frost', 'lightning', 'poison', 'holy', 'shadow', 'arcane'].includes(p.type))
      || !Array.isArray(s.usedInteractables) || s.usedInteractables.length > 8
      || !s.usedInteractables.every(isWorldObjectId)
      || new Set(s.usedInteractables).size !== s.usedInteractables.length
      || !Array.isArray(s.interactables)
      || s.interactables.some(o => !o || !getWorldObject(o.id, s.zone))
      || JSON.stringify(s.interactables) !== JSON.stringify(
        worldObjectsFor(s.zone).filter(o => !s.usedInteractables.includes(o.id)))
      || (s.moveDestination !== null && (!s.moveDestination
        || !Number.isFinite(s.moveDestination.x) || !Number.isFinite(s.moveDestination.y)))
      || typeof s.holdPosition !== 'boolean'
      || !Number.isFinite(s.evadeCooldown) || s.evadeCooldown < 0 || s.evadeCooldown > 2.5
      || !s.cooldowns || !(['rmb', 'slot1'] as const).every(slot =>
        Number.isFinite(s.cooldowns[slot]) && s.cooldowns[slot] >= 0 && s.cooldowns[slot] <= 360)
      || !s.effects || !Array.isArray(s.effects.player)
      || s.effects.player.length > 8 || !s.effects.player.every(isActiveEffect)
      || !Array.isArray(s.enemies) || s.enemies.length !== PACK_SIZE
      || !s.enemies.every((unit, index) =>
        !!unit && !!unit.actor && validEnemyType(unit.actor.type)
        && (s.zone === 'crypt'
          ? unit.actor.type === (s.dungeonStage === 0
            ? (['skeleton', 'wolf', 'wraith'] as const)[index]
            : (['crypt_lord', 'skeleton', 'wraith'] as const)[index])
          : unit.actor.type === packTypesForWave(s.wave)[index])
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
    this.zone = s.zone;
    this.dungeonStage = s.dungeonStage;
    this.dungeonCleared = s.dungeonCleared;
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
    this.holdPosition = s.holdPosition;
    this.evadeCooldown = s.evadeCooldown;
    this.shield = s.shield;
    this.projectiles = s.projectiles.map(p => ({ ...p, target: { ...p.target } }));
    this.nextProjectileId = this.projectiles.reduce((max, p) =>
      Math.max(max, Number(p.id.replace('projectile-', '')) || 0), 0);
    this.usedObjects = new Set(s.usedInteractables);
    this.pendingObject = null;
    this.kills = s.kills;
    this.level = s.level;
    this.xp = s.xp;
    this.gold = s.gold;
    this.resource = s.resource;
    this.rng = new SeededRng(s.rngState);
    this.cooldowns = { ...s.cooldowns };
    this.warriorCooldowns = s.warriorCooldowns ? { ...s.warriorCooldowns } : {};
    this.warriorAction = s.warriorAction ? {
      ...s.warriorAction, timeline: { ...s.warriorAction.timeline }
    } : null;
    this.warriorPending = null;
    this.statusEffects = {
      player: (s.statusEffects?.player ?? []).map(e => ({ ...e })),
      enemies: Object.fromEntries(Object.entries(s.statusEffects?.enemies ?? {})
        .map(([id, arr]) => [id, arr.map(e => ({ ...e }))]))
    };
    this.effects = { player: s.effects.player.map(effect => ({ ...effect })), enemy: [] };
    this.paused = false;
    this.movePath = [];
    this.attackTarget = null;
    this.pendingSkill = null;
    this.pendingAim = null;
    this.pendingNpc = null;
    this.pendingPortal = false;
    this.pickupTarget = null;
    this.attackTimer = 0;
    this.accumulator = 0;
    this.movementSpeed = 0;
    this.healthRegenCarry = 0;
    this.refreshHealthLimit();
    return true;
  }

  reset(classId: ClassId = 'WARRIOR', seed = this.world.seed): void {
    this.zone = 'wilderness';
    this.dungeonStage = 0;
    this.dungeonCleared = false;
    this.pendingPortal = false;
    this.pendingObject = null;
    this.usedObjects.clear();
    this.shield = 0;
    this.projectiles = [];
    this.nextProjectileId = 0;
    this.movementSpeed = 0;
    this.healthRegenCarry = 0;
    this.world = generateWorld(seed);
    this.classId = classId;
    this.equipment = createEquipment();
    this.inventory = Array(INVENTORY_SIZE).fill(null);
    this.rng = new SeededRng(seed === 0 ? 0x49ac127b : ((seed ^ 0x49ac127b) >>> 0));
    this.cooldowns = emptyCooldowns();
    this.warriorCooldowns = {};
    this.warriorAction = null;
    this.warriorPending = null;
    this.statusEffects = { player: [], enemies: {} };
    this.effects = emptyEffects();
    this.quest = freshQuest();
    this.pendingNpc = null;
    this.units = createPack(0, 1, this.world.encounterPositions);
    this.selectedTargetId = null;
    this.pendingSkill = null;
    this.pendingAim = null;
    this.player = spawnPlayer(classId, this.equipment, this.world.camp);
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
    this.evadeCooldown = 0;
    this.holdPosition = false;
    this.respawnTimer = 0;
    this.accumulator = 0;
    this.events.splice(0);
  }
}
