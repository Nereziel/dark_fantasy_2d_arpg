import type { ActorSnapshot, CharacterProgress, GameCommand, GameEvent, GameSnapshot, Point, ProjectileSnapshot, ZoneId, WorldSessionProgress } from './types';
import { spawnPlayer, updateHealthLimit, advanceResource, regenerateHealth } from '../entities/player';
import { awardProgression, rewardForActivity, xpRequiredForLevel, MAX_LEVEL } from '../progression/progressionRules';
import {
  planEquip, planUnequip, planSwap, planDrop, sortInventory, favoriteOrLockItem,
  type ItemFlags, type InventoryState, type EquipmentRules
} from '../inventory/equipmentRules';
import { ITEM_BASES, WEAPON_TYPES } from '../items/itemCatalog';
import { rollLootTable, bossGuaranteedLoot, type LootContext, type LootRoll } from '../loot/lootTables';
import { rollEliteModifiers, applyEliteStats, eliteOnHitPlan, eliteOnPeriodicPlan,
  eliteOnDeathPlan, validateEliteSet, type ElitePlannedAction } from '../enemies/eliteModifiers';
import { moveToward, nextMoveSpeed } from '../entities/playerMovement';
import { applyOrRefreshEffect } from '../status/effectStack';
import { WARRIOR_ABILITIES, getWarriorAbility, type WarriorAbilityId } from '../skills/warriorKit';
import { canActivateWarriorSkill, spendAndStartCooldown, advanceWarriorCooldowns, applyWarriorRageDelta, type WarriorActivationRequest } from '../skills/warriorEconomy';
import { startCombatTimeline, advanceCombatTimeline, cancelCombatTimeline, type CombatTimelineState } from '../animation/combatTimeline';
import { classSkillTimeline, BASIC_ATTACK_TIMELINE } from '../animation/classCombatTiming';
import { STATUS_DEFINITIONS, type StatusId } from '../status/statusDefinitions';
import { applyStatus, advanceStatuses, dispelStatuses, getStatusModifiers, type StatusInstance } from '../status/statusRuntime';
import { isLegacyStatus, mergedLegacyEffects, monsterStatusImmunities, statusRule } from '../status/statusIntegration';
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
import {
  MINI_BOSS_IDS, getMiniBossDefinition, createMiniBossState, validateMiniBossState,
  stepMiniBoss, planMiniBossDefeat, type MiniBossId, type MiniBossState,
  type MiniBossActionPlan
} from '../enemies/miniBossRules';
import { monsterActions, monsterAction, type MonsterAction } from '../enemies/monsterRuntime';
import { getEnemyArchetype } from '../enemies/archetypeCatalog';
import { ACTOR_RADIUS, canOccupy, findPath, hasLineOfSight, moveActor, resolveReachableDestination, type Obstacle } from '../world/navigation';
import {
  CAMP, CAMP_RADIUS, CRYPT_GATE, CRYPT_EXIT, CRYPT_BOSS_POSITIONS,
  type WorldLayout
} from '../world/generator';
import { buildWilderness, type WildernessRuntimeWorld } from '../world/wildernessRuntime';
import { buildCryptWorld, CRYPT_RUNTIME_BOSS_POSITIONS } from '../world/dungeonRuntime';
import type { CryptThemePlan, CryptInteractable } from '../world/cryptTheme';
import {
  createChunkIndex, createWorldFactLedger, applyWorldFact, makeWorldFact,
  validateWorldFactLedger, type ChunkIndex, type WorldFactLedger, type WorldFactKind
} from '../world/chunkStreaming';
import {
  createMapDiscovery, revealAtPosition, revealTravelSegment, activateMapWaypoint,
  validateMapDiscovery, projectMap, type MapDiscoveryState, type MapWorldInput,
  type MapProjection, type MapQuestHint
} from '../world/mapDiscovery';
import {
  nearNpc, nearWarden, isNpcId, NPC_POSITIONS, NPC_INTERACT_RANGE,
  MERCHANT_ID, BLACKSMITH_ID, type NpcId
} from '../world/npcs';
import { getOffer, createShopItem, temperItem } from '../trade/commerce';
import { quotePurchase, quoteSale, quoteTempering, planPurchase, planSale, planService,
  selectVendorStock, type EconomyFailure } from '../trade/economyRules';
import { townEntry, canInteractTownEntry, getTownManifest } from '../world/townManifest';
import { STASH_SIZE, planStashDeposit, planStashWithdraw, validateStashContents } from '../inventory/stashRules';
import {
  freshQuest, validQuest, FIRST_QUEST_ID, WARDEN_ID, type QuestProgress
} from '../quests/firstQuest';
import { acceptQuest, advanceObjective, turnInQuest, type QuestLedger, type QuestTransition } from '../quests/questDialogue';
import { firstQuestFromLedger } from '../quests/starterQuestRegistry';
import { ACT_I_QUEST_CATALOG, ACT_I_MILESTONES, createActIQuestLedger, type ActIStoryQuestId } from '../quests/actIQuestChain';
import type { WildernessFeature } from '../world/wildernessFeatures';
import {
  SeededRng, createEquipment, deriveStats, isEquipmentSlot, isItem, rollItem, rollItemForBase,
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
  return item ? { ...item, affixes: item.affixes.map(a => ({ ...a })),
    ...(item.sockets ? { sockets: [...item.sockets] } : {}),
    ...(item.legendaryPower ? { legendaryPower: { ...item.legendaryPower } } : {}) } : null;
}
function cloneEquipment(equipment: Equipment): Equipment {
  return Object.fromEntries(Object.entries(equipment).map(([key, item]) => [key, cloneItem(item)])) as Equipment;
}
function cloneUnit(unit: EnemyUnit): EnemyUnit {
  return {
    actor: { ...unit.actor },
    intent: unit.intent ? { ...unit.intent } : null,
    cooldown: unit.cooldown,
    effects: unit.effects.map(effect => ({ ...effect })),
    ...(unit.abilityCooldowns ? { abilityCooldowns: { ...unit.abilityCooldowns } } : {}),
    ...(unit.summoned ? { summoned: true } : {}),
    ...(unit.elite ? { elite: { ...unit.elite, modifiers: [...unit.elite.modifiers],
      visualTags: [...unit.elite.visualTags] } } : {})
  };
}
function validTransientAim(value: unknown): value is SkillAim {
  if (!value || typeof value !== 'object') return false;
  const aim = value as Partial<SkillAim>;
  if (aim.mode === 'SELF') return true;
  if (aim.mode === 'TARGET_ENTITY') {
    return typeof aim.targetId === 'string' && aim.targetId.length > 0 && aim.targetId.length <= 128;
  }
  if (aim.mode === 'AREA' || aim.mode === 'GROUND_POSITION') {
    const point = (aim as { position?: Point }).position;
    return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
      && point.x >= 0 && point.y >= 0 && point.x <= 2200 && point.y <= 1400;
  }
  if (aim.mode === 'DIRECTION') {
    const point = (aim as { direction?: Point }).direction;
    return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
      && Math.hypot(point.x,point.y) >= 0.5 && Math.hypot(point.x,point.y) <= 1.1;
  }
  return false;
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

function validWaveBState(s: GameSnapshot): boolean {
  if (s.warriorCooldowns !== undefined && (!s.warriorCooldowns ||
    Object.entries(s.warriorCooldowns).some(([id, n]) =>
      !getWarriorAbility(id) || !Number.isFinite(n) || n! < 0 || n! > 360))) return false;
  if (s.warriorAction) {
    const action = s.warriorAction;
    const state = action.timeline;
    if (!getWarriorAbility(action.id) || !state
      || !Number.isSafeInteger(action.hitCount) || action.hitCount < 0 || action.hitCount > 100
      || !Number.isSafeInteger(state.elapsedTicks) || state.elapsedTicks < 0
      || !Number.isSafeInteger(state.windupTicks) || state.windupTicks < 0
      || !Number.isSafeInteger(state.recoveryTicks) || state.recoveryTicks < 0
      || !Number.isSafeInteger(state.sustainTicks) || state.sustainTicks < 0
      || (state.totalTicks !== null && (!Number.isSafeInteger(state.totalTicks) || state.totalTicks < state.elapsedTicks))
      || typeof state.movementLocked !== 'boolean'
      || typeof state.impactEmitted !== 'boolean') return false;
  }
  if (s.classAction) {
    const action = s.classAction;
    const timeline = action.timeline;
    if (!timeline || s.classId === 'WARRIOR' || !['basic', 'skill'].includes(action.kind)
      || (action.kind === 'basic' ? action.slot !== null : !isSkillSlot(action.slot))
      || typeof action.targetId !== 'string' && action.targetId !== null
      || (typeof action.targetId === 'string' && action.targetId.length > 128)
      || (action.aim !== undefined && !validTransientAim(action.aim))
      || timeline.actionId !== (action.kind === 'basic' ? 'basicAttack'
        : SKILLS[s.classId][action.slot as SkillSlot].id)
      || !Number.isSafeInteger(timeline.elapsedTicks) || timeline.elapsedTicks < 0
      || !Number.isSafeInteger(timeline.windupTicks) || timeline.windupTicks < 1
      || !Number.isSafeInteger(timeline.recoveryTicks) || timeline.recoveryTicks < 0
      || timeline.totalTicks === null || !Number.isSafeInteger(timeline.totalTicks)
      || timeline.totalTicks < timeline.elapsedTicks || timeline.totalTicks > 300
      || typeof timeline.impactEmitted !== 'boolean'
      || typeof timeline.movementLocked !== 'boolean') return false;
  }
  if (s.statusEffects === undefined) return true;
  const valid = (values: unknown) => Array.isArray(values) && values.length <= 16
    && values.every(e => e && typeof e.id === 'string' && Object.hasOwn(STATUS_DEFINITIONS, e.id)
      && advanceStatuses([e as StatusInstance], 0).statuses.length === 1);
  return !!s.statusEffects && valid(s.statusEffects.player)
    && !!s.statusEffects.enemies && typeof s.statusEffects.enemies === 'object'
    && !Array.isArray(s.statusEffects.enemies)
    && Object.entries(s.statusEffects.enemies).every(([id, values]) =>
      Array.isArray(s.enemies) && s.enemies.some(unit => unit?.actor?.id === id)
      && valid(values));
}

export class GameSimulation {
  private classId: ClassId = 'WARRIOR';
  private equipment: Equipment = createEquipment();
  private inventory: Array<Item | null> = Array(INVENTORY_SIZE).fill(null);
  private stash: Array<Item | null> = Array(STASH_SIZE).fill(null);
  private itemFlags: Record<string, ItemFlags> = {};
  private rng = new SeededRng();
  private cooldowns: Cooldowns = emptyCooldowns();
  private warriorCooldowns: Partial<Record<WarriorAbilityId, number>> = {};
  private warriorPending: { id: WarriorAbilityId; targetId: string | null } | null = null;
  private warriorAction: { id: WarriorAbilityId; targetId: string | null; aim?: SkillAim; timeline: CombatTimelineState; hitCount: number } | null = null;
  private classAction: {
    kind: 'basic' | 'skill'; slot: SkillSlot | null; targetId: string | null;
    aim?: SkillAim; timeline: CombatTimelineState;
  } | null = null;
  private statusEffects: { player: StatusInstance[]; enemies: Record<string, StatusInstance[]> } = { player: [], enemies: {} };
  private eliteQueue: Array<{ remaining: number; sourceId: string;
    kind: 'pulse' | 'teleport'; position: Point; radius: number;
    multiplier: number; damageType: 'fire' | 'poison' }> = [];
  private effects: ActiveEffects = emptyEffects();
  private world: WorldLayout = buildWilderness(0).layout;
  private zone: ZoneId = 'wilderness';
  private dungeonStage: 0 | 1 = 0;
  private dungeonCleared = false;
  private pendingPortal = false;
  private units: EnemyUnit[] = createPack(0, 1);
  private selectedTargetId: string | null = null;
  private quest: QuestProgress = freshQuest();
  private actILedger: QuestLedger = createActIQuestLedger(freshQuest())!;
  private storyFeatures: readonly WildernessFeature[] = [];
  private cryptTheme: CryptThemePlan | null = null;
  private readonly cryptUsedPropIds = new Set<string>();
  private readonly cryptTriggeredTrapIds = new Set<string>();
  private readonly cryptArmedTraps = new Map<string, number>();
  private readonly miniBossStates = new Map<string, MiniBossState>();
  private readonly defeatedMiniBossIds = new Set<MiniBossId>();
  private pendingCryptPropId: string | null = null;
  private worldIndex: ChunkIndex | null = null;
  private worldFacts: WorldFactLedger | null = null;
  private mapWorld: MapWorldInput | null = null;
  private mapDiscovery: MapDiscoveryState | null = null;
  private pendingNpc: NpcId | null = null;
  private pendingTown: string | null = null;
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
  private skillPoints = 0;
  private talentPoints = 0;
  private gold = 75;
  private resource = CLASSES.WARRIOR.resourceInitial;
  private attackTimer = 0;
  private holdPosition = false;
  private evadeCooldown = 0;
  private respawnTimer = 0;
  private accumulator = 0;
  private readonly events: GameEvent[] = [];

  constructor(seed = 0) { this.reset('WARRIOR', seed); }


  /** Rebuild a deterministic world-scoped index without putting world data in character saves. */
  private mapInput(world: WildernessRuntimeWorld): MapWorldInput {
    const waypoint = getTownManifest().find(entry => entry.role === 'waypoint');
    return {
      seed: world.layout.seed, worldInstanceId: 'world-' + world.layout.seed + '-hero',
      features: world.features,
      ...(waypoint ? { waypoints: [{
        id: 'town.waypoint', position: { ...waypoint.position },
        presentationKey: waypoint.nameKey
      }] } : {})
    };
  }

  private initWorldSystems(world: WildernessRuntimeWorld): void {
    const index = createChunkIndex(world);
    const input = this.mapInput(world);
    const initial = createMapDiscovery(input, CAMP, 105);
    if (!initial.ok) throw new Error('Cannot initialize wilderness exploration');
    this.worldIndex = index;
    this.worldFacts = createWorldFactLedger(index, 'hero');
    this.mapWorld = input;
    this.mapDiscovery = initial.value;
  }

  /** World facts are idempotent historical observations, not a second reward executor. */
  private recordWorldFact(kind: WorldFactKind, entityId: string): void {
    if (!this.worldIndex || !this.worldFacts) return;
    const fact = makeWorldFact(this.worldIndex, this.worldFacts.worldInstanceId, kind, entityId);
    this.worldFacts = applyWorldFact(this.worldIndex, this.worldFacts, fact).state;
  }

  private observeExploration(): void {
    if (this.zone !== 'wilderness' || !this.mapWorld || !this.mapDiscovery
      || !this.player.alive) return;
    const previous = this.mapDiscovery;
    const last = previous.lastObservedPosition;
    if (last && distance(last, this.player) < 18) return;
    const next = last && distance(last, this.player) <= 160
      ? revealTravelSegment(previous, last, this.player, 105, this.mapWorld)
      : revealAtPosition(previous, this.player, 105, this.mapWorld);
    if (!next.ok) return;
    this.mapDiscovery = next.value;
    for (const id of next.value.discoveredLandmarkIds) {
      if (!previous.discoveredLandmarkIds.includes(id)) {
        this.recordWorldFact('landmarkDiscovered', id);
      }
    }
  }

  /** Only discovered areas and markers ever cross into the UI-facing map projection. */
  mapProjection(mode: 'world' | 'minimap' = 'world'): MapProjection | null {
    if (!this.mapWorld || !this.mapDiscovery || this.zone !== 'wilderness') return null;
    const featureIdByQuest: Record<string, string> = {
      trail_of_black_ash: 'act1.corruption_site',
      blighted_pack: 'act1.tainted_beasts',
      forgotten_graves: 'act1.abandoned_graveyard',
      morrow_gravebound: 'act1.grave_warden',
      seal_of_rot: 'act1.evidence_lead',
      crypt_descent: 'act1.crypt_entrance'
    };
    const hints: MapQuestHint[] = ACT_I_MILESTONES.flatMap(beat => {
      const state = this.actILedger.quests.find(entry => entry.questId === beat.questId);
      if (!state || (state.status !== 'active' && state.status !== 'ready')) return [];
      const featureId = featureIdByQuest[beat.questId];
      return [{
        id: beat.questId, status: 'active' as const,
        ...(featureId ? { featureId } : {}),
        ...(beat.questId === 'vesnas_report' ? { position: CAMP } : {}),
        presentationKey: 'map.quest'
      }];
    });
    const result = projectMap(this.mapDiscovery, this.mapWorld, this.player, hints, { mode });
    return result.ok ? result.value : null;
  }

  /** Separate world-instance persistence; no seed or world facts in CharacterProgress v11. */
  worldProgress(): WorldSessionProgress | null {
    if (!this.mapDiscovery || !this.worldFacts) return null;
    return structuredClone({
      version: 1 as const, seed: this.worldFacts.worldSeed,
      mapDiscovery: this.mapDiscovery, worldFacts: this.worldFacts,
      cryptUsedPropIds: [...this.cryptUsedPropIds],
      cryptTriggeredTrapIds: [...this.cryptTriggeredTrapIds],
      miniBossDefeatedIds: [...this.defeatedMiniBossIds]
    });
  }

  restoreWorldProgress(progress: WorldSessionProgress): boolean {
    if (!progress || progress.version !== 1 || !this.mapWorld || !this.worldIndex
      || progress.seed !== this.mapWorld.seed
      || !validateMapDiscovery(progress.mapDiscovery, this.mapWorld)
      || !validateWorldFactLedger(this.worldIndex, progress.worldFacts)) return false;
    const theme = buildCryptWorld(progress.seed).theme;
    const allowedProps = new Set(theme.interactables.map(prop => prop.id));
    const allowedTraps = new Set(theme.traps.map(trap => trap.id));
    const used = progress.cryptUsedPropIds ?? [];
    const triggered = progress.cryptTriggeredTrapIds ?? [];
    if (!Array.isArray(used) || used.length > 128
      || new Set(used).size !== used.length || used.some(id => !allowedProps.has(id))
      || !Array.isArray(triggered) || triggered.length > 128
      || new Set(triggered).size !== triggered.length
      || triggered.some(id => !allowedTraps.has(id))) return false;
    const defeated = progress.miniBossDefeatedIds ?? [];
    if (!Array.isArray(defeated) || defeated.length > MINI_BOSS_IDS.length
      || new Set(defeated).size !== defeated.length
      || defeated.some(id => !MINI_BOSS_IDS.includes(id))) return false;
    this.defeatedMiniBossIds.clear();
    for (const id of defeated) this.defeatedMiniBossIds.add(id);
    this.units = this.units.filter(unit => !this.defeatedMiniBossIds.has(unit.actor.id as MiniBossId));
    for (const id of defeated) this.miniBossStates.delete(id);
    this.mapDiscovery = structuredClone(progress.mapDiscovery);
    this.worldFacts = structuredClone(progress.worldFacts);
    this.cryptUsedPropIds.clear();
    this.cryptTriggeredTrapIds.clear();
    for (const id of used) this.cryptUsedPropIds.add(id);
    for (const id of triggered) this.cryptTriggeredTrapIds.add(id);
    // Already-consumed seeded chest rewards cannot reappear after a reload.
    for (const fact of this.worldFacts.entries) {
      if (fact.kind === 'chestOpened' && getWorldObject(fact.entityId as WorldObjectId, 'wilderness')) {
        this.usedObjects.add(fact.entityId as WorldObjectId);
      }
    }
    return true;
  }


  /** Actionable dungeon facts only; decorative theme props never grant loot. */
  cryptInteractables(): CryptInteractable[] {
    if (this.zone !== 'crypt' || !this.cryptTheme) return [];
    return this.cryptTheme.interactables.filter(prop => prop.initiallyVisible
      && !this.cryptUsedPropIds.has(prop.id))
      .map(prop => structuredClone(prop));
  }

  private tryInteractCrypt(): void {
    if (this.zone !== 'crypt' || !this.pendingCryptPropId || !this.player.alive) return;
    const prop = this.cryptInteractables().find(candidate => candidate.id === this.pendingCryptPropId);
    if (!prop) { this.pendingCryptPropId = null; return; }
    if (distance(this.player, prop.position) > prop.reach) return;
    this.pendingCryptPropId = null;
    // Commit idempotency BEFORE emitting the event/reward. Rendering is a projection only.
    if (this.cryptUsedPropIds.has(prop.id)) return;
    this.cryptUsedPropIds.add(prop.id);
    const goldAwarded = prop.capability === 'lootContainer' ? 35 + 3 * this.level
      : prop.capability === 'breakable' ? 7 : 0;
    this.gold += goldAwarded;
    this.events.push({ type: 'cryptInteract', id: prop.id, capability: prop.capability,
      goldAwarded });
  }

  /** One-shot world hazards give a visible warning and can be dodged before impact. */
  private tickCryptTraps(dt: number): void {
    if (this.zone !== 'crypt' || !this.cryptTheme || !this.player.alive) return;
    for (const trap of this.cryptTheme.traps) {
      if (this.cryptTriggeredTrapIds.has(trap.id)) continue;
      const remaining = this.cryptArmedTraps.get(trap.id);
      if (remaining === undefined) {
        if (distance(this.player, trap.trigger.center) > trap.trigger.radius) continue;
        this.cryptArmedTraps.set(trap.id, trap.telegraphSeconds);
        this.events.push({ type: 'cryptTrapWindup', id: trap.id,
          x: trap.trigger.center.x, y: trap.trigger.center.y, radius: trap.trigger.radius });
        continue;
      }
      if (remaining > dt) { this.cryptArmedTraps.set(trap.id, remaining - dt); continue; }
      this.cryptArmedTraps.delete(trap.id);
      this.cryptTriggeredTrapIds.add(trap.id);
      if (distance(this.player, trap.trigger.center) > trap.trigger.radius) continue;
      const damage = trap.damage.maxBaseDamage;
      this.dealPlayerDamage(damage, trap.damage.type, trap.id);
      this.events.push({ type: 'cryptTrap', id: trap.id, damage,
        x: trap.trigger.center.x, y: trap.trigger.center.y });
    }
  }

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

  /** One quest ledger owns both the historic quest and Act I objectives. */
  private questStatus(id: string) {
    return this.actILedger.quests.find(entry => entry.questId === id)?.status;
  }

  private commitQuestTransition(transition: QuestTransition | null, questId: string): boolean {
    if (!transition?.changed) return false;
    const reward = transition.rewardPlan;
    if (reward && this.gold > Number.MAX_SAFE_INTEGER - reward.gold) return false;
    const previous = this.quest;
    this.actILedger = transition.ledger;
    const first = this.actILedger.quests[0];
    const legacy = first && firstQuestFromLedger({ quests: [first] });
    if (legacy) this.quest = legacy;
    if (this.quest.status !== previous.status || this.quest.defeated !== previous.defeated) {
      this.events.push({ type: 'questUpdated', status: this.quest.status, defeated: this.quest.defeated });
    }
    const current = this.actILedger.quests.find(entry => entry.questId === questId);
    if (current) this.events.push({ type: 'actIQuestUpdated', questId, status: current.status });
    if (reward) {
      this.gold += reward.gold;
      this.awardExperience(reward.questId === FIRST_QUEST_ID
        ? Math.max(reward.xp, rewardForActivity('quest', this.level, this.level))
        : reward.xp);
      const next = ACT_I_MILESTONES.find(beat => beat.prerequisiteQuestId === reward.questId);
      if (next) this.commitQuestTransition(
        acceptQuest(ACT_I_QUEST_CATALOG, this.actILedger, next.questId), next.questId
      );
      if (reward.questId === 'forgotten_graves') this.spawnMorrow();
    }
    return true;
  }

  private storyEvent(questId: ActIStoryQuestId, eventId: string, occurrenceId: string): void {
    if (this.questStatus(questId) !== 'active') return;
    this.commitQuestTransition(
      advanceObjective(ACT_I_QUEST_CATALOG, this.actILedger, questId, eventId, occurrenceId), questId
    );
    // Authoritative discovery/kill/zone events can complete world objectives.
    // Vesna's final report requires a deliberate return and a dialogue turn-in.
    if (questId !== 'vesnas_report' && this.questStatus(questId) === 'ready') {
      this.commitQuestTransition(turnInQuest(ACT_I_QUEST_CATALOG, this.actILedger, questId), questId);
    }
  }

  private recordVesnaReport(): void {
    this.storyEvent('vesnas_report', 'act_i_report_delivered', 'vesna_report');
  }

  private discoverStoryLocations(): void {
    if (this.zone !== 'wilderness' || !this.player.alive) return;
    const sites = [
      ['trail_of_black_ash', 'act1.corruption_site', 'corruption_traced'],
      ['forgotten_graves', 'act1.abandoned_graveyard', 'graveyard_found'],
      ['seal_of_rot', 'act1.evidence_lead', 'crypt_evidence_secured']
    ] as const;
    for (const [questId, featureId, eventId] of sites) {
      if (this.questStatus(questId) !== 'active') continue;
      const marker = this.storyFeatures.find(feature => feature.id === featureId);
      if (marker && distance(this.player, marker.position) <= marker.radius + 18) {
        this.storyEvent(questId, eventId, 'feature_' + marker.id.replaceAll('.', '_'));
      }
    }
  }


  /** Distinct optional encounters use existing, seeded reachable wilderness features. */
  private spawnOptionalMiniBosses(): void {
    if (this.zone !== 'wilderness' || !this.player.alive) return;
    const placements: readonly { id: MiniBossId; featureId: string }[] = [
      { id: 'bandit_captain', featureId: 'wild.encounter.1' },
      { id: 'brood_mother', featureId: 'wild.encounter.2' },
      { id: 'corrupted_knight', featureId: 'wild.poi.1' }
    ];
    for (const placement of placements) {
      const marker = this.storyFeatures.find(feature => feature.id === placement.featureId);
      if (!marker || this.defeatedMiniBossIds.has(placement.id)) continue;
      const unit = this.units.find(value => value.actor.id === placement.id);
      if (unit) {
        if (distance(this.player, unit.actor) > 650) {
          // Evict unengaged offscreen unique AI without converting it into a kill.
          this.units = this.units.filter(value => value !== unit);
          this.miniBossStates.delete(placement.id);
        }
        continue;
      }
      if (distance(this.player, marker.position) > 320 || this.units.length >= PACK_SIZE + 2
        || !canOccupy(marker.position, ACTOR_RADIUS, this.world.obstacles)) continue;
      const def = getMiniBossDefinition(placement.id);
      const state = createMiniBossState(placement.id, placement.id);
      if (!def || !state) continue;
      const maxHealth = Math.round(def.baseHealth + Math.max(0, this.level - 1) * 24);
      this.units.push({
        actor: { id: placement.id, type: def.enemyType, ...marker.position,
          health: maxHealth, maxHealth, alive: true },
        cooldown: 0.9, intent: null, effects: [], abilityCooldowns: {}
      });
      this.miniBossStates.set(placement.id, state);
    }
  }

  private miniBossArena(id: MiniBossId, position: Point): { center: Point; radius: number } {
    const featureId = id === 'morrow_gravebound' ? 'act1.grave_warden'
      : id === 'bandit_captain' ? 'wild.encounter.1'
        : id === 'brood_mother' ? 'wild.encounter.2' : 'wild.poi.1';
    return { center: { ...(this.storyFeatures.find(feature => feature.id === featureId)?.position
      ?? position) }, radius: 320 };
  }

  private miniBossHit(unit: EnemyUnit, action: Extract<MiniBossActionPlan, {kind:'impact'}>): boolean {
    const player = this.player, boss = unit.actor;
    if (!player.alive) return false;
    const dist = distance(player, action.point);
    if (action.shape === 'circle') return dist <= action.radius;
    if (distance(player, boss) > action.range) return false;
    const dx = action.point.x - boss.x, dy = action.point.y - boss.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) return false;
    const px = player.x - boss.x, py = player.y - boss.y;
    const along = (px * dx + py * dy) / length;
    const side = Math.abs(px * dy - py * dx) / length;
    return along >= 0 && along <= action.range
      && side <= (action.shape === 'line' ? action.radius : Math.max(18, along * 0.58));
  }

  /** Only gameplay simulation executes Agent32 action plans, never the renderer. */
  private updateMiniBoss(unit: EnemyUnit, dt: number): void {
    const actor = unit.actor;
    const state = this.miniBossStates.get(actor.id);
    if (!state || !actor.alive || distance(this.player, actor) > 490) return;
    if (this.statusEffects.enemies[actor.id]?.some(effect =>
      effect.id === 'stunned' || effect.id === 'frozen')) return;
    const result = stepMiniBoss(state, {
      deltaSeconds: dt, health: actor.health, maxHealth: actor.maxHealth,
      alive: true, position: { x: actor.x, y: actor.y },
      target: this.player.alive ? { x: this.player.x, y: this.player.y,
        id: 'hero', alive: true } : null,
      arena: this.miniBossArena(state.bossId, actor)
    });
    if (!result) return;
    this.miniBossStates.set(actor.id, result.state);
    for (const action of result.actions) {
      const point = 'point' in action ? action.point : actor;
      const radius = 'radius' in action ? action.radius : 72;
      this.events.push({ type: 'miniBossCue', enemyId: actor.id, bossId: state.bossId,
        kind: action.kind, ...('abilityId' in action ? {abilityId: action.abilityId} : {}),
        x: point.x, y: point.y, radius, phase: result.state.phase });
      if (action.kind === 'impact') {
        if (this.miniBossHit(unit, action)
          && (action.effect === 'damage' || action.effect === 'control'
            || action.effect === 'hazard' || action.effect === 'charge')) {
          const type: DamageType = state.bossId === 'morrow_gravebound' ? 'shadow'
            : state.bossId === 'brood_mother' ? 'poison' : 'physical';
          this.dealPlayerDamage(12 + this.level * 2 + (result.state.phase === 2 ? 5 : 0),
            type, actor.id);
        }
      } else if (action.kind === 'support') {
        const hp = resolveHealing(actor.health, actor.maxHealth, 24);
        actor.health = hp.health;
      } else if (action.kind === 'summon') {
        if (this.units.length >= PACK_SIZE + 2
          || !canOccupy(action.point, ACTOR_RADIUS, this.world.obstacles)) continue;
        const def = ENEMY_DEFINITIONS[action.enemyType];
        const index = this.units.length;
        this.units.push({
          actor: { id: 'summon-' + this.wave + '-' + index, type: action.enemyType,
            x: action.point.x, y: action.point.y,
            health: def.health, maxHealth: def.health, alive: true },
          summoned: true, intent: null, cooldown: 0.7, effects: [], abilityCooldowns: {}
        });
      } else if (action.kind === 'move') {
        const path = findPath(actor, action.point, ACTOR_RADIUS, this.world.obstacles);
        if (path.length) this.follow(actor, path[0]!, ENEMY_DEFINITIONS[actor.type].speed, dt, 65);
      }
    }
  }

  /** A unique, combat-ready named foe uses existing wraith tactics and art. */
  private spawnMorrow(): void {
    if (this.defeatedMiniBossIds.has('morrow_gravebound')
      || this.zone !== 'wilderness' || this.questStatus('morrow_gravebound') !== 'active'
      || this.units.some(unit => unit.actor.id === 'morrow_gravebound')
      || this.units.length >= PACK_SIZE + 2) return;
    const marker = this.storyFeatures.find(feature => feature.id === 'act1.grave_warden');
    if (!marker) return;
    const health = 270 + Math.max(0, this.level - 1) * 24;
    this.units.push({
      actor: { id: 'morrow_gravebound', type: 'wraith',
        x: marker.position.x, y: marker.position.y,
        health, maxHealth: health, alive: true },
      intent: null, cooldown: 0.85, effects: [], abilityCooldowns: {}
    });
    const miniState = createMiniBossState('morrow_gravebound', 'morrow_gravebound');
    if (miniState) this.miniBossStates.set('morrow_gravebound', miniState);
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
        this.pendingTown = null;
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
      this.classAction = null;
      this.movePath = [];
      this.attackTarget = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pickupTarget = null;
      this.pendingNpc = null;
      this.pendingTown = null;
      this.pendingPortal = false;
      return;
    }
    if (command.type === 'equip') { this.equip(command.index, command.slot); return; }
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
    // Dialogue actions are gated by physical proximity and the ledger.
    if (command.type === 'questAccept' || command.type === 'questTurnIn') {
      if (this.zone !== 'wilderness' || !this.player.alive || !nearWarden(this.player)) return;
      const id = command.questId ?? FIRST_QUEST_ID;
      const result = command.type === 'questAccept'
        ? acceptQuest(ACT_I_QUEST_CATALOG, this.actILedger, id)
        : turnInQuest(ACT_I_QUEST_CATALOG, this.actILedger, id);
      this.commitQuestTransition(result, id);
      return;
    }
    if (command.type === 'useTownService') {
      // Town services must work while the modal pauses the combat simulation.
      const entry = townEntry(command.entryId);
      if (!entry || !this.player.alive || this.zone !== 'wilderness'
        || !canInteractTownEntry(this.player, entry.id)) return;
      const healer = entry.role === 'healer';
      const restorer = entry.role === 'potionVendor';
      if (!healer && !restorer) return;
      const price = healer ? 15 : 12;
      if (this.gold < price) return;
      if (healer && this.player.health >= this.player.maxHealth) return;
      if (restorer && this.resource >= deriveStats(this.classId, this.equipment, this.level).maxResource) return;
      this.gold -= price;
      if (healer) this.player.health = this.player.maxHealth;
      if (restorer) this.resource = deriveStats(this.classId, this.equipment, this.level).maxResource;
      this.events.push({ type: 'townServiceUsed', entryId: entry.id, goldSpent: price });
      return;
    }
    if (command.type === 'stashDeposit' || command.type === 'stashWithdraw') {
      // Only a live player physically at the camp stash can transfer items.
      // Its dialog deliberately pauses combat; access remains server-authoritative.
      if (this.zone !== 'wilderness' || !this.player.alive
        || !canInteractTownEntry(this.player, 'stash_camp')) return;
      const state = {
        inventory: this.inventory, equipment: this.equipment, stash: this.stash,
        flags: this.itemFlags
      };
      const plan = command.type === 'stashDeposit'
        ? planStashDeposit(state, command.index)
        : planStashWithdraw(state, command.index);
      if (!plan.ok) return;
      const before = command.type === 'stashDeposit'
        ? this.inventory[command.index] : this.stash[command.index];
      if (!before) return;
      this.inventory = plan.state.inventory.map(cloneItem);
      this.stash = plan.state.stash.map(cloneItem);
      this.itemFlags = Object.fromEntries(Object.entries(plan.state.flags ?? {})
        .map(([id, flags]) => [id, { ...flags }]));
      this.events.push({
        type: 'stashUpdated', direction: command.type === 'stashDeposit' ? 'deposit' : 'withdraw',
        itemId: before.id
      });
      return;
    }
    if (!this.player.alive || this.paused) return;
    if (command.type === 'swapInventory') { this.updateInventory(planSwap(this.inventoryState(), command.fromIndex, command.toIndex, this.inventoryRules())); return; }
    if (command.type === 'sortInventory') { this.updateInventory(sortInventory(this.inventoryState(), this.inventoryRules())); return; }
    if (command.type === 'setItemFlag') { this.updateInventory(favoriteOrLockItem(this.inventoryState(), command.itemId, command.flag, command.value, this.inventoryRules())); return; }
    if (command.type === 'dropInventory') { this.dropInventory(command.index); return; }
    if (command.type === 'interactCrypt') {
      if (this.zone !== 'crypt' || !this.player.alive || typeof command.id !== 'string'
        || command.id.length > 160
        || !this.cryptInteractables().some(prop => prop.id === command.id)) return;
      this.movePath = [];
      this.attackTarget = null;
      this.pickupTarget = null;
      this.pendingPortal = false;
      this.pendingNpc = null;
      this.pendingTown = null;
      this.pendingObject = null;
      this.pendingCryptPropId = command.id;
      this.tryInteractCrypt();
      return;
    }
    if (command.type === 'interactObject') {
      this.warriorAction = null;
      this.classAction = null;
      this.warriorPending = null;
      const object = getWorldObject(command.id, this.zone);
      if (!object || this.usedObjects.has(object.id)) return;
      this.movePath = [];
      this.attackTarget = null;
      this.pickupTarget = null;
      this.pendingNpc = null;
      this.pendingTown = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pendingPortal = false;
      this.pendingObject = object.id;
      this.tryInteractObject();
      return;
    }
    if (command.type === 'usePortal') {
      this.warriorAction = null;
      this.classAction = null;
      this.warriorPending = null;
      this.movePath = [];
      this.attackTarget = null;
      this.pickupTarget = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pendingNpc = null;
      this.pendingTown = null;
      this.pendingObject = null;
      this.pendingPortal = true;
      if (distance(this.player, this.portalPosition) <= 78) this.changeZone();
      return;
    }
    if (command.type === 'interactTown') {
      const entry = townEntry(command.entryId);
      if (!entry || entry.capability === 'existing' || this.zone !== 'wilderness' || !this.player.alive || this.paused) return;
      this.warriorAction = null;
      this.classAction = null;
      this.warriorPending = null;
      this.movePath = [];
      this.attackTarget = null;
      this.pickupTarget = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pendingObject = null;
      this.pendingPortal = false;
      this.pendingNpc = null;
      this.pendingTown = null;
      if (canInteractTownEntry(this.player, entry.id)) {
        this.events.push({ type: 'townInteraction', entryId: entry.id, role: entry.role });
        this.pendingTown = null;
      } else {
        this.pendingTown = entry.id;
      }
      return;
    }
    if (command.type === 'interactNpc') {
      this.pendingTown = null;
      this.warriorAction = null;
      this.classAction = null;
      this.warriorPending = null;
      if (this.zone !== 'wilderness' || !isNpcId(command.npcId)) return;
      this.movePath = [];
      this.attackTarget = null;
      this.pickupTarget = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pendingObject = null;
      this.pendingPortal = false;
      if (nearNpc(this.player, command.npcId)) {
        if (command.npcId === WARDEN_ID) this.recordVesnaReport();
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
      this.classAction = null;
      const route = findPath(this.player, target, ACTOR_RADIUS, this.world.obstacles);
      if (!route.length) return;
      this.movePath = route;
      this.attackTarget = null;
      this.pickupTarget = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pendingNpc = null;
      this.pendingTown = null;
      this.pendingObject = null;
      this.pendingPortal = false;
    } else if (command.type === 'attack') {
      const selected = this.units.find(unit => unit.actor.id === command.targetId && unit.actor.alive);
      if (!selected) return;
      this.selectedTargetId = selected.actor.id;
      this.warriorPending = null;
      this.warriorAction = null;
      this.classAction = null;
      this.attackTarget = selected.actor.id;
      this.movePath = [];
      this.pickupTarget = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pendingNpc = null;
      this.pendingTown = null;
      this.pendingObject = null;
      this.pendingPortal = false;
    } else if (command.type === 'pickup' && this.groundLoot.some(loot => loot.id === command.id)) {
      this.pickupTarget = command.id;
      this.movePath = [];
      this.attackTarget = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pendingNpc = null;
      this.pendingTown = null;
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
    if (object.kind === 'chest' && this.groundLoot.length >= 100) {
      this.pendingObject = null;
      return;
    }
    this.pendingObject = null;
    this.usedObjects.add(object.id);
    if (this.zone === 'wilderness' && object.kind === 'chest') {
      this.recordWorldFact('chestOpened', object.id);
    }
    if (object.kind === 'shrine') {
      this.shield = Math.max(this.shield, Math.round(this.player.maxHealth * 0.3));
    } else {
      const item = rollItem(this.kills + 101, this.level, this.rng);
      this.groundLoot.push({
        id: 'cache-' + object.id, x: object.position.x, y: object.position.y,
        item: { ...item, id: 'cache-' + object.id + '-item' }
      });
      // Chests preserve item ownership; never evict another ground item due to overflow.
    }
    this.awardExperience(rewardForActivity(object.kind === 'shrine' ? 'event' : 'exploration',
      this.level, this.level));
    this.events.push({ type: 'worldInteract', id: object.id, kind: object.kind });
  }

  private shopAllowed(npcId: NpcId): boolean {
    return this.zone === 'wilderness' && this.player.alive && nearNpc(this.player, npcId);
  }

  private rejectTrade(reason: EconomyFailure): void {
    this.events.push({ type: 'tradeRejected', reason: reason === 'INSUFFICIENT_GOLD'
      ? 'funds' : reason === 'INVENTORY_FULL' ? 'inventory'
        : reason === 'LOCKED_ITEM' || reason === 'FAVORITE_ITEM' ? 'protected' : 'invalid' });
  }

  /** All money and item mutations commit only after a canonical domain plan. */
  private buyItem(offerId: string): void {
    if (!this.shopAllowed(MERCHANT_ID)) return;
    const stock = selectVendorStock({
      vendorId: MERCHANT_ID, playerLevel: this.level, gold: this.gold,
      seed: this.world.seed, epoch: 0
    });
    const offer = getOffer(offerId);
    if (!stock.ok || !offer || !stock.offers.some(current => current.id === offer.id)) {
      this.rejectTrade('OUT_OF_STOCK');
      return;
    }
    const index = this.inventory.findIndex(item => item === null);
    const quote = quotePurchase(offer);
    const plan = planPurchase(quote, this.gold,
      this.inventory.filter(item => item === null).length, { playerLevel: this.level });
    if (!plan.ok) { this.rejectTrade(plan.reason); return; }
    if (index < 0) { this.rejectTrade('INVENTORY_FULL'); return; }
    const existing = new Set(
      [...this.inventory, ...this.stash, ...Object.values(this.equipment)]
        .filter((item): item is Item => item !== null)
        .map(item => item.id)
    );
    let suffix = 1;
    while (existing.has(`trade-${offer.id}-${suffix}`)) suffix++;
    const newItem = createShopItem(offer, `trade-${offer.id}-${suffix}`);
    this.inventory[index] = newItem;
    this.gold = plan.goldAfter;
  }

  private sellItem(index: number): void {
    if (!this.shopAllowed(MERCHANT_ID)
      || !Number.isSafeInteger(index) || index < 0 || index >= this.inventory.length) return;
    const item = this.inventory[index];
    if (!item) return;
    const quote = quoteSale(item);
    const plan = planSale(quote, this.gold, {
      owned: true, locked: this.itemFlags[item.id]?.locked ?? false,
      favorite: this.itemFlags[item.id]?.favorite ?? false
    });
    if (!plan.ok) { this.rejectTrade(plan.reason); return; }
    this.gold = plan.goldAfter;
    delete this.itemFlags[item.id];
    this.inventory[index] = null;
  }

  private temperEquipment(slot: EquipmentSlot): void {
    if (!this.shopAllowed(BLACKSMITH_ID) || !isEquipmentSlot(slot)) return;
    const item = this.equipment[slot];
    if (!item) return;
    const quote = quoteTempering(item);
    const plan = planService(quote, this.gold, { playerLevel: this.level });
    if (!plan.ok) { this.rejectTrade(plan.reason); return; }
    const forged = temperItem(item);
    if (!forged) { this.rejectTrade('SERVICE_UNAVAILABLE'); return; }
    this.equipment[slot] = forged;
    this.gold = plan.goldAfter;
    this.refreshHealthLimit();
  }

  private inventoryState(): InventoryState {
    return { inventory: this.inventory, equipment: this.equipment, flags: this.itemFlags };
  }

  private inventoryRules(): EquipmentRules {
    const items = [...this.inventory, ...Object.values(this.equipment)].filter(
      (item): item is Item => item !== null
    );
    return {
      playerLevel: this.level,
      requiredLevelsById: Object.fromEntries(items.map(item => [
        item.id, item.requiredLevel
          ?? ITEM_BASES[item.templateId as keyof typeof ITEM_BASES]?.requiredLevel ?? 1
      ])),
      twoHandedItemIds: items.filter(item => item.twoHanded || (
        !!ITEM_BASES[item.templateId as keyof typeof ITEM_BASES]?.weaponType
        && WEAPON_TYPES[ITEM_BASES[item.templateId as keyof typeof ITEM_BASES].weaponType!].twoHanded
      )).map(item => item.id)
    };
  }

  private updateInventory(result: ReturnType<typeof planEquip>): void {
    if (!result.ok) return;
    this.inventory = result.state.inventory.map(cloneItem);
    this.equipment = cloneEquipment(result.state.equipment as Equipment);
    this.itemFlags = Object.fromEntries(Object.entries(result.state.flags ?? {})
      .map(([id, flags]) => [id, { ...flags }]));
    this.refreshHealthLimit();
    const cap = deriveStats(this.classId, this.equipment, this.level).maxResource;
    this.resource = Math.min(cap, this.resource);
  }

  private equip(index: number, targetSlot?: EquipmentSlot): void {
    const item = this.inventory[index];
    if (!item) return;
    const selected = targetSlot ?? (item.slot === 'RING_1' && this.equipment.RING_1 && !this.equipment.RING_2
      ? 'RING_2' : undefined);
    this.updateInventory(planEquip(this.inventoryState(), index, selected, this.inventoryRules()));
  }

  /** Pure, authoritative candidate projection for the equipment comparison panel. */
  previewEquipment(index: number, targetSlot?: EquipmentSlot): { armor: number; damageMin: number;
    damageMax: number; maxHealth: number } | null {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.inventory.length) return null;
    const candidate = planEquip(this.inventoryState(), index, targetSlot, this.inventoryRules());
    if (!candidate.ok) return null;
    const before = deriveStats(this.classId, this.equipment, this.level);
    const after = deriveStats(this.classId, candidate.state.equipment as Equipment, this.level);
    return {
      armor: after.armor - before.armor,
      damageMin: after.damageMin - before.damageMin,
      damageMax: after.damageMax - before.damageMax,
      maxHealth: after.maxHealth - before.maxHealth
    };
  }

  private unequip(slot: EquipmentSlot): void {
    this.updateInventory(planUnequip(this.inventoryState(), slot, this.inventoryRules()));
  }

  private dropInventory(index: number): void {
    const result = planDrop(this.inventoryState(), index, this.inventoryRules());
    if (!result.ok || this.groundLoot.length >= 100) return;
    const prefix = 'discard-' + this.kills + '-' + this.rng.state + '-' + index;
    let id = prefix;
    let attempt = 1;
    while (this.groundLoot.some(loot => loot.id === id)) id = prefix + '-' + attempt++;
    this.updateInventory(result);
    this.groundLoot.push({ id, item: result.dropped, x: this.player.x, y: this.player.y });
    this.events.push({ type: 'loot', id });
  }

  private refreshHealthLimit(): void {
    const max = deriveStats(this.classId, this.equipment, this.level).maxHealth;
    updateHealthLimit(this.player, max);
  }


  /** Decide if a Warrior ability should cast now or approach its target first. */
  private warriorActivation(id: WarriorAbilityId, targetId: string | null, aim?: SkillAim): WarriorActivationRequest {
    const ability = WARRIOR_ABILITIES[id];
    const actor = targetId ? this.units.find(u => u.actor.alive && u.actor.id === targetId)?.actor : null;
    const directionalTarget = id === 'charge' && aim?.mode === 'DIRECTION' ? {
      x: this.player.x + aim.direction.x * Math.min(170, ability.range),
      y: this.player.y + aim.direction.y * Math.min(170, ability.range),
      alive: true
    } : null;
    return {
      skill: {
        id, cost: ability.rageCost, cooldown: ability.cooldown,
        range: ability.range, target: ability.target,
        autoApproach: ability.autoApproach,
        silenceRestricted: ability.tags.includes('BUFF') || ability.tags.includes('CHANNELING'),
        movementSkill: ability.tags.includes('MOVEMENT')
      },
      state: {
        rage: this.resource, maxRage: deriveStats('WARRIOR', this.equipment, this.level).maxResource,
        cooldowns: { ...this.warriorCooldowns,
          cleave: Math.max(this.warriorCooldowns.cleave ?? 0, this.cooldowns.rmb),
          charge: Math.max(this.warriorCooldowns.charge ?? 0, this.cooldowns.slot1) }
      },
      actor: this.player, target: directionalTarget ?? actor ?? null,
      stunned: this.effects.player.some(e => e.id === 'stunned')
        || this.statusEffects.player.some(e => e.id === 'stunned' || e.id === 'frozen'),
      silenced: this.statusEffects.player.some(e => e.id === 'silenced'),
      holdPosition: this.holdPosition, canMove: !this.immobilized
    };
  }

  private requestWarriorAbility(id: WarriorAbilityId, targetId: string | null, aim?: SkillAim): void {
    if (!this.player.alive || this.paused || this.classId !== 'WARRIOR' || this.warriorAction) return;
    const ability = WARRIOR_ABILITIES[id];
    const request = this.warriorActivation(id, targetId, aim);
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
    if (targetId && this.units.some(u => u.actor.id === targetId && u.actor.alive)) {
      this.selectedTargetId = targetId;
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
    this.warriorAction = { id, targetId, ...(aim ? { aim } : {}), timeline, hitCount: 0 };
    const target = targetId ? this.units.find(u => u.actor.id === targetId)?.actor : null;
    this.events.push({ type: 'cast', skillId: id, x: target?.x ?? this.player.x, y: target?.y ?? this.player.y });
  }

  /** Single authoritative status store; legacy effect DTOs are projections only. */
  private applyCanonicalStatus(
    recipient: 'player' | 'enemy', id: StatusId, sourceId: string,
    magnitude?: number, duration?: number, unit?: EnemyUnit
  ): void {
    const rule = statusRule(id, magnitude, duration);
    if (recipient === 'player') {
      this.statusEffects.player = applyStatus(this.statusEffects.player, rule, sourceId);
      if (id === 'shielded') this.shield = Math.max(this.shield, Math.round(rule.magnitude));
    } else if (unit?.actor.alive) {
      this.statusEffects.enemies[unit.actor.id] = applyStatus(
        this.statusEffects.enemies[unit.actor.id] ?? [], rule, sourceId,
        monsterStatusImmunities(unit.actor.type));
    }
    this.syncLegacyStatuses();
  }

  private syncLegacyStatuses(): void {
    this.effects.player = mergedLegacyEffects(this.effects.player, this.statusEffects.player);
    for (const unit of this.units) {
      unit.effects = mergedLegacyEffects(unit.effects,
        this.statusEffects.enemies[unit.actor.id] ?? []);
    }
  }

  /** Old transient combat snapshots remain readable, without parallel status timers. */
  private importLegacyStatuses(): void {
    for (const effect of this.effects.player) {
      if (!isLegacyStatus(effect.id) || this.statusEffects.player.some(s => s.id === effect.id)) continue;
      this.statusEffects.player = applyStatus(this.statusEffects.player,
        statusRule(effect.id, effect.magnitude > 0 ? effect.magnitude : undefined, effect.remaining),
        'legacy-hero');
    }
    for (const unit of this.units) {
      for (const effect of unit.effects) {
        if (!isLegacyStatus(effect.id)
          || this.statusEffects.enemies[unit.actor.id]?.some(s => s.id === effect.id)) continue;
        this.statusEffects.enemies[unit.actor.id] = applyStatus(
          this.statusEffects.enemies[unit.actor.id] ?? [],
          statusRule(effect.id, effect.magnitude > 0 ? effect.magnitude : undefined, effect.remaining),
          'legacy-' + unit.actor.id, monsterStatusImmunities(unit.actor.type));
      }
    }
    this.syncLegacyStatuses();
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

  private warriorImpact(id: WarriorAbilityId, targetId: string | null, aim?: SkillAim): void {
    const ability = WARRIOR_ABILITIES[id];
    const target = targetId ? this.units.find(u => u.actor.alive && u.actor.id === targetId) : null;
    if (id === 'warCry') {
      this.applyCanonicalStatus('player', 'haste', 'hero', 0.2, 8);
      this.applyCanonicalStatus('player', 'fortified', 'hero', 0.2, 8);
      this.resource = applyWarriorRageDelta({
        rage: this.resource, maxRage: deriveStats('WARRIOR', this.equipment, this.level).maxResource,
        cooldowns: this.warriorCooldowns
      }, ability.rageGain).rage;
    } else {
      if (id === 'charge') {
        if (aim?.mode === 'DIRECTION') {
          // Do not dash *through* a nearby selected target; stop within melee reach.
          const alongTarget = target
            ? (target.actor.x - this.player.x) * aim.direction.x
              + (target.actor.y - this.player.y) * aim.direction.y : null;
          const travel = alongTarget !== null && alongTarget > 0 && alongTarget <= 170
            ? Math.max(0, alongTarget - 52) : Math.min(170, ability.range);
          const goal = {
            x: this.player.x + aim.direction.x * travel,
            y: this.player.y + aim.direction.y * travel
          };
          moveActor(this.player, goal, travel, ACTOR_RADIUS, this.world.obstacles);
        } else if (target) {
          moveActor(this.player, target.actor,
            Math.min(170, Math.max(0, distance(this.player, target.actor) - 52)),
            ACTOR_RADIUS, this.world.obstacles);
        }
      }
      const hitTarget = id === 'charge' && aim?.mode === 'DIRECTION'
        ? [...this.aliveEnemies].filter(u => distance(this.player, u.actor) <= 82)
            .sort((u, v) => distance(this.player, u.actor) - distance(this.player, v.actor))[0] ?? null
        : target;
      const victims = ability.radius !== undefined
        ? [...this.aliveEnemies].filter(u => distance(this.player, u.actor) <= ability.radius! + 0.5)
        : hitTarget && distance(this.player, hitTarget.actor) <= (id === 'charge' ? 82 : ability.range) + 0.5
          ? [hitTarget] : [];
      for (const unit of victims) {
        const power = ability.condition
          && unit.actor.health / unit.actor.maxHealth <= ability.condition.threshold
          ? ability.condition.bonusPower : ability.power;
        const dealt = this.applyDamage(power, unit, 'physical');
        if (dealt > 0 && ability.rageGain > 0) {
          this.resource = applyWarriorRageDelta({
            rage: this.resource, maxRage: deriveStats('WARRIOR', this.equipment, this.level).maxResource,
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
    // Stun/freeze interrupts the windup and the remaining channel ticks.
    // The cancelled timeline never emits an impact cue or applies damage.
    if (this.effects.player.some(e => e.id === 'stunned')
      || this.statusEffects.player.some(e => e.id === 'stunned' || e.id === 'frozen')) {
      cancelCombatTimeline(action.timeline);
      this.warriorAction = null;
      this.classAction = null;
      return;
    }
    const result = advanceCombatTimeline(action.timeline, 1);
    action.timeline = result.state;
    for (const event of result.events) {
      if (event.type === 'impact' && this.player.alive) {
        this.warriorImpact(action.id, action.targetId, action.aim);
        action.hitCount++;
      }
    }
    const ability = WARRIOR_ABILITIES[action.id];
    if (ability.channel && action.timeline.phase === 'sustain' && this.player.alive) {
      const elapsed = action.timeline.elapsedTicks - action.timeline.windupTicks;
      const interval = Math.max(1, Math.round(ability.channel.tickInterval / FIXED_STEP));
      if (elapsed > 0 && elapsed % interval === 0) {
        this.warriorImpact(action.id, action.targetId, action.aim);
        action.hitCount++;
      }
    }
    if (action.timeline.phase === 'complete' || action.timeline.phase === 'cancelled') this.warriorAction = null;
  }

  private requestCast(slot: SkillSlot, aim?: SkillAim): void {
    if (this.warriorAction || this.classAction) return;
    const skill = SKILLS[this.classId][slot];
    if (this.classId === 'WARRIOR') {
      const targetId = aim?.mode === 'TARGET_ENTITY' ? aim.targetId
        : this.focusedUnit.actor.alive ? this.focusedUnit.actor.id : null;
      if (slot === 'slot1' && aim?.mode === 'DIRECTION') {
        const target = targetId
          ? this.units.find(u => u.actor.id === targetId && u.actor.alive)
          : null;
        this.requestWarriorAbility('charge',
          target && distance(this.player, target.actor) <= WARRIOR_ABILITIES.charge.range
            ? target.actor.id : null, aim);
      } else {
        this.requestWarriorAbility(skill.id as WarriorAbilityId, targetId, aim);
      }
      return;
    }
    if (skill.kind === 'dash' && (this.holdPosition || this.immobilized)) return;
    // Root restricts movement and dashes, not stationary spells.
    if (this.effects.player.some(e => e.id === 'stunned')
      || this.statusEffects.player.some(e =>
        e.id === 'stunned' || e.id === 'frozen' || e.id === 'silenced')
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
        this.pendingTown = null;
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
    this.pendingTown = null;
    this.pendingObject = null;
    this.pendingPortal = false;
    if (distance(this.player, this.enemy) > skill.range) {
      if (!this.holdPosition) this.pendingSkill = slot;
      return;
    }
    this.performCast(slot);
  }

  private applyEffect(target: 'enemy' | 'player', effect: ActiveEffect, unit = this.focusedUnit): void {
    if (isLegacyStatus(effect.id)) {
      this.applyCanonicalStatus(target, effect.id,
        target === 'player' ? 'status-enemy' : 'hero',
        effect.magnitude > 0 ? effect.magnitude : undefined, effect.remaining, unit);
      return;
    }
    // Consecration/Skeleton are persistent field and summon abilities,
    // not duplicative status damage timers.
    if (target === 'player') this.effects.player = applyOrRefreshEffect(this.effects.player, effect);
    else unit.effects = applyOrRefreshEffect(unit.effects, effect);
  }

  private enemyResistance(unit: EnemyUnit, type: DamageType): number {
    if (unit.actor.type === 'wraith' && type === 'shadow') return 35;
    if (unit.actor.type === 'wolf' && type === 'poison') return 30;
    if (unit.actor.type === 'crypt_lord' && type === 'shadow') return 20;
    return unit.elite ? 12 : 0;
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
    const defenderStatus = getStatusModifiers(this.statusEffects.enemies[unit.actor.id] ?? []);
    const attackerStatus = getStatusModifiers(this.statusEffects.player);
    const result = resolveTypedDamage({
      type, base, multiplier: multiplier
        * Math.max(0.1, 1 + (attackerStatus.damageDealt ?? 0))
        * Math.max(0.1, 1 + (defenderStatus.damageTaken ?? 0)), critChance,
      defenderArmor: 10 + this.level * 3, defenderLevel: this.level,
      shield: unit.elite?.shield ?? 0,
      resistancePercent: Math.min(95, this.enemyResistance(unit, type) +
        100 * Math.min(0.8, getStatusModifiers(this.statusEffects.enemies[unit.actor.id] ?? []).damageReduction ?? 0))
    }, this.rng);
    if (unit.elite) unit.elite.shield = result.shieldRemaining;
    this.publishDamage(sourceId, unit.actor.id, type, result);
    return this.hitEnemy(result.damage, unit);
  }

  private applyDamage(power: number, unit = this.focusedUnit, type: DamageType = 'physical'): number {
    if (!unit.actor.alive) return 0;
    const stats = deriveStats(this.classId, this.equipment, this.level);
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
    const stats = deriveStats(this.classId, this.equipment, this.level);
    const resistance = type === 'fire' ? stats.fireResist
      : type === 'frost' ? stats.frostResist
      : type === 'lightning' ? stats.lightningResist
      : type === 'poison' ? stats.poisonResist
      : type === 'shadow' ? stats.shadowResist
      : type === 'holy' ? stats.holyResist : 0;
    const attackerStatus = getStatusModifiers(this.statusEffects.enemies[sourceId] ?? []);
    const defenderStatus = getStatusModifiers(this.statusEffects.player);
    const result = resolveTypedDamage({
      type,
      base: base * Math.max(0.1, 1 + (attackerStatus.damageDealt ?? 0))
        * Math.max(0.1, 1 + (defenderStatus.damageTaken ?? 0)),
      defenderArmor: stats.armor, defenderLevel: this.level,
      resistancePercent: Math.min(95, resistance +
        100 * Math.min(0.8, getStatusModifiers(this.statusEffects.player).damageReduction ?? 0)),
      dodgeChance: stats.dodgeChance,
      blockChance: stats.blockChance, shield: this.shield
    }, this.rng);
    this.shield = result.shieldRemaining;
    this.publishDamage(sourceId, this.player.id, type, result);
    if (result.damage > 0) this.hitPlayer(result.damage);
    const elite = this.units.find(unit => unit.actor.id === sourceId)?.elite;
    if (elite) {
      for (const action of eliteOnHitPlan(elite.modifiers, {
        sourceId, targetId: this.player.id, hit: result.damage > 0,
        critical: result.critical, damage: result.damage
      }) ?? []) {
        if (action.kind === 'status' && this.player.alive) this.applyCanonicalStatus(
          'player', action.statusId, sourceId, action.magnitude, action.durationSeconds);
      }
    }
    return result.damage > 0;
  }

  private fireBolt(source: EnemyUnit, target: Point, radius: number, base: number, action?: MonsterAction): void {
    const shot: ProjectileSnapshot = {
      id: 'projectile-' + (++this.nextProjectileId),
      sourceId: source.actor.id, x: source.actor.x, y: source.actor.y,
      target: { ...target }, type: action?.statusId === 'poisoned' ? 'poison'
        : action?.statusId === 'slowed' ? 'frost' : 'shadow',
      speed: 560, radius, remaining: 2.5, base,
      ...(action?.statusId ? { statusId: action.statusId } : {}),
      ...(action?.statusDuration ? { statusDuration: action.statusDuration } : {}),
      ...(action?.statusMagnitude ? { statusMagnitude: action.statusMagnitude } : {})
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
      const impact = !blocked && landed && !sanctuary
        && distance(this.player, shot.target) <= shot.radius && this.player.alive;
      const hit = impact && (shot.base <= 0
        || this.dealPlayerDamage(shot.base, shot.type, shot.sourceId));
      if (hit && shot.statusId) {
        this.applyCanonicalStatus('player', shot.statusId, shot.sourceId,
          shot.statusMagnitude, shot.statusDuration);
      }
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
  /** Authoritative cast commitment. Damage/periodic effects start at impact, not input. */
  private performCast(slot: SkillSlot, aim?: SkillAim): void {
    if (this.warriorAction || this.classAction) return;
    const skill = SKILLS[this.classId][slot];
    const unit = this.focusedUnit;
    if (this.cooldowns[slot] > 0.0001 || this.resource + 0.0001 < skill.cost) return;
    const aimed = aim?.mode === 'GROUND_POSITION' || aim?.mode === 'AREA' || aim?.mode === 'DIRECTION';
    if (skill.target === 'enemy' && !aimed
      && (!unit.actor.alive || distance(this.player, unit.actor) > skill.range + 0.5)) return;
    const targetId = skill.target === 'enemy' ? unit.actor.id : null;
    this.resource = Math.max(0, this.resource - skill.cost);
    this.cooldowns[slot] = skill.cooldown;
    this.pendingSkill = null;
    this.pendingAim = null;
    const point = (aim?.mode === 'GROUND_POSITION' || aim?.mode === 'AREA')
      ? aim.position : skill.target === 'enemy' ? unit.actor : this.player;
    this.classAction = {
      kind: 'skill', slot, targetId,
      ...(aim ? { aim: structuredClone(aim) } : {}),
      timeline: startCombatTimeline(classSkillTimeline(skill)).state
    };
    this.events.push({ type: 'cast', skillId: skill.id, x: point.x, y: point.y });
  }

  /** A single fixed-step resolver for every non-Warrior attack and ability. */
  private tickClassTimeline(): void {
    const action = this.classAction;
    if (!action) return;
    if (!this.player.alive || this.statusEffects.player.some(s =>
      s.id === 'stunned' || s.id === 'frozen')) {
      cancelCombatTimeline(action.timeline);
      this.classAction = null;
      return;
    }
    const result = advanceCombatTimeline(action.timeline, 1);
    action.timeline = result.state;
    for (const event of result.events) {
      if (event.type !== 'impact') continue;
      if (action.kind === 'basic') {
        const target = this.units.find(unit =>
          unit.actor.id === action.targetId && unit.actor.alive);
        if (target && distance(this.player, target.actor) <= CLASSES[this.classId].attackRange + 10) {
          this.applyDamage(1, target);
          if (this.classId === 'NECROMANCER' || this.classId === 'WARLOCK') {
            this.resource = Math.min(CLASSES[this.classId].resourceMax, this.resource + 8);
          }
        }
      } else if (action.slot) {
        this.resolveClassCast(action.slot, action.aim, action.targetId);
      }
    }
    if (action.timeline.phase === 'complete' || action.timeline.phase === 'cancelled') {
      this.classAction = null;
    }
  }

  /** Previously instantaneous skill effects, now executed exclusively at the hit frame. */
  private resolveClassCast(slot: SkillSlot, aim?: SkillAim, targetId?: string | null): void {
    const skill = SKILLS[this.classId][slot];
    const unit = (targetId
      ? this.units.find(unit => unit.actor.id === targetId) : null) ?? this.focusedUnit;
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
            magnitude: Math.max(3, Math.round(2 + deriveStats(this.classId, this.equipment, this.level).intelligence * 0.25)),
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
      // Existing class spells now expose the full canonical status vocabulary.
      // These are one-shot impact hooks, never extra damage timers.
      if (damage > 0 && unit.actor.alive) {
        const extras: Readonly<Record<string, readonly StatusId[]>> = {
          judgment: ['vulnerable'], boneSpear: ['cursed'],
          poisonBlade: ['bleeding'], lifeDrain: ['cursed'], soulBurn: ['silenced']
        };
        for (const id of extras[skill.id] ?? []) {
          this.applyCanonicalStatus('enemy', id, 'hero', undefined, undefined, unit);
        }
      }
      if (skill.id === 'shadowDash' && damage > 0) {
        this.applyCanonicalStatus('player', 'haste', 'hero', 0.15, 2.5);
      }
      if (skill.effect && skill.duration && unit.actor.alive
        && ['stunned', 'poisoned', 'burning'].includes(skill.effect)) {
        const magnitude = skill.effect === 'stunned' ? 0
          : Math.max(3, Math.round(2 + deriveStats(this.classId, this.equipment, this.level).intelligence * 0.25));
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
          if (skill.id === 'frostNova' && distance(center, target.actor) <= 70) {
            this.applyCanonicalStatus('enemy', 'frozen', 'hero', 1, 1.2, target);
          }
        }
      }
    } else if ((skill.kind === 'aura' || skill.kind === 'summon') && skill.effect && skill.duration) {
      if (skill.id === 'consecration') {
        const barrier = Math.round(this.player.maxHealth * 0.25);
        this.applyCanonicalStatus('player', 'shielded', 'hero', barrier, skill.duration);
        this.applyCanonicalStatus('player', 'regeneration', 'hero', 4, skill.duration);
        this.applyCanonicalStatus('player', 'fortified', 'hero', 0.1, skill.duration);
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
      this.classAction = null;
      this.pendingSkill = null;
      this.pendingAim = null;
      this.pendingNpc = null;
      this.pendingTown = null;
      this.movePath = [];
      this.attackTarget = null;
      this.pickupTarget = null;
      for (const unit of this.units) unit.intent = null;
      this.events.push({ type: 'playerDeath' });
    }
  }
  /** Only aura/summon ticks remain here; all 15 statuses tick in statusRuntime. */
  private tickEffects(dt: number): void {
    for (const unit of this.units) {
      for (const effect of unit.effects) {
        if (isLegacyStatus(effect.id)) continue;
        effect.remaining -= dt;
        effect.tick += dt;
      }
      unit.effects = unit.actor.alive
        ? unit.effects.filter(effect => !isLegacyStatus(effect.id) && effect.remaining > 0)
        : [];
    }
    for (const effect of this.effects.player) {
      if (isLegacyStatus(effect.id)) continue;
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
          const target = this.aliveEnemies.find(unit => distance(this.player, unit.actor) <= 280);
          if (target) this.applyDamage(effect.magnitude, target);
        }
      }
    }
    this.effects.player = this.effects.player.filter(effect =>
      !isLegacyStatus(effect.id) && effect.remaining > 0);
  }

  private beginMonsterAttack(unit: EnemyUnit, choice?: MonsterAction): void {
    const actor = unit.actor;
    const def = ENEMY_DEFINITIONS[actor.type];
    const pattern = choice?.attack ?? def.attack;
    const center = pattern === 'sweep' ? actor : this.player;
    const windup = choice?.windup ?? def.windup;
    unit.intent = {
      pattern, x: center.x, y: center.y,
      radius: choice?.areaRadius ?? (choice && pattern === 'sweep'
        ? Math.max(65, choice.range) : def.dangerRadius),
      remaining: windup, total: windup,
      ...(choice ? { abilityId: choice.id } : {})
    };
    if (choice) {
      (unit.abilityCooldowns ??= {})[choice.id] = choice.cooldown;
    }
    this.events.push({ type: 'enemyWindup', enemyId: actor.id, pattern });
  }

  /** Deterministic tactical planner: obstacle-aware movement, role-specific actions. */
  private updateMonsterTactics(unit: EnemyUnit, dt: number): void {
    const actor = unit.actor;
    const def = ENEMY_DEFINITIONS[actor.type];
    const profile = getEnemyArchetype(enemyArchetype(actor.type));
    if (!profile || !actor.alive || !this.player.alive) return;
    const index = this.units.indexOf(unit);
    const spawn = this.zone === 'crypt' && this.dungeonStage === 1 && index < PACK_SIZE
      ? CRYPT_RUNTIME_BOSS_POSITIONS[index]
      : this.world.encounterPositions[index] ?? (unit.summoned ? actor : undefined);
    if (!spawn) return;
    const origin = { x: spawn.x, y: spawn.y + (this.wave % 2) * 25 };
    const role = enemyArchetype(actor.type);
    const sanctuary = this.zone === 'wilderness'
      && distance(this.player, this.world.camp) <= CAMP_RADIUS;
    const target = sanctuary ? null : this.player;
    const toPlayer = distance(actor, this.player);
    const lineOfSight = hasLineOfSight(actor, this.player, this.world.obstacles);
    const abilityCooldowns = unit.abilityCooldowns ?? (unit.abilityCooldowns = {});
    const actions = monsterActions(actor.type);
    const ready = (action: MonsterAction): boolean =>
      (abilityCooldowns[action.id] ?? 0) <= 0;
    const allies = this.units.filter(u => u !== unit && u.actor.alive).map(u => ({
      ...u.actor,
      lineOfSight: hasLineOfSight(actor, u.actor, this.world.obstacles),
      reachable: findPath(actor, u.actor, ACTOR_RADIUS, this.world.obstacles).length > 0
    }));

    // Heal first when an ally is critically injured; defensive buffs are secondary.
    const healSkill = actions.find(action => action.kind === 'heal');
    const urgentHeal = !!healSkill && this.units.some(other =>
      other !== unit && other.actor.alive
      && other.actor.health / other.actor.maxHealth < 0.88
      && distance(actor, other.actor) <= healSkill.range);
    // Buffs are committed as simulation statuses, not cosmetic renderer effects.
    // Damaging frenzy uses the same canonical damageDealt modifier as Cursed.
    const buff = !urgentHeal && target && toPlayer <= def.aggro && unit.cooldown <= 0
      ? actions.find(action => action.kind === 'buff' && ready(action)
        && this.units.some(u => u !== unit && u.actor.alive
          && distance(actor, u.actor) <= action.range)) : undefined;
    if (buff && buff.statusId) {
      const base = statusRule(buff.statusId, buff.statusMagnitude, buff.statusDuration);
      const rule = buff.buffType === 'damageBonus'
        ? { ...base, modifiers: { moveSpeed: 1, damageDealt: 1 } } : base;
      for (const ally of this.units) {
        if (!ally.actor.alive || distance(actor, ally.actor) > buff.range) continue;
        this.statusEffects.enemies[ally.actor.id] = applyStatus(
          this.statusEffects.enemies[ally.actor.id] ?? [], rule,
          actor.id, monsterStatusImmunities(ally.actor.type));
      }
      abilityCooldowns[buff.id] = buff.cooldown;
      unit.cooldown = Math.max(unit.cooldown, 0.65);
      this.syncLegacyStatuses();
      this.events.push({ type: 'enemyBuff', enemyId: actor.id, abilityId: buff.id });
      return;
    }

    // Charge, pounce and ranged control can start beyond ordinary attack range.
    // Defensive area skills may fire inside their radius before a caster flees.
    const specialist = target && unit.cooldown <= 0
      && distance(actor, origin) <= profile.leashRange
      && distance(origin, target) <= profile.leashRange
      ? actions.find(action => (action.kind === 'damage' || action.kind === 'debuff')
        && ready(action) && toPlayer <= action.range
        && (lineOfSight || action.attack === 'sweep')
        && (action.attack === 'leap' && toPlayer > def.attackRange
          || action.attack === 'bolt' && action.statusId !== undefined
            && toPlayer > def.attackRange
          || action.attack === 'sweep' && action.areaRadius !== undefined
            && toPlayer <= action.areaRadius && role === 'caster')) : undefined;
    if (specialist) {
      this.beginMonsterAttack(unit, specialist);
      return;
    }

    const travel = target ? findPath(actor, target, ACTOR_RADIUS, this.world.obstacles) : [];
    const patrol = {
      x: origin.x + (index % 2 === 0 ? 36 : -36),
      y: origin.y + (index === 1 ? 26 : -26)
    };
    const decision = planEnemyBehavior({
      actor, origin, target, allies,
      config: {
        archetypeId: role, aggroRange: def.aggro,
        attackRange: def.attackRange,
        preferredDistance: Math.min(def.preferredRange, def.attackRange),
        leashRange: Math.max(profile.leashRange, def.aggro + 100),
        specialRange: role === 'healer' ? (healSkill?.range ?? 220)
          : role === 'ambusher' ? Math.min(def.aggro, 230)
            : Math.min(def.aggro, Math.max(def.attackRange, 230)),
        healHealthRatio: 0.88,
        fleeHealthRatio: profile.retreatThreshold
      },
      attackCooldown: unit.cooldown,
      abilityCooldown: healSkill ? Math.max(unit.cooldown, abilityCooldowns[healSkill.id] ?? 0)
        : unit.cooldown,
      lineOfSight,
      navigation: {
        targetReachable: target === null || travel.length > 0,
        originReachable: findPath(actor, origin, ACTOR_RADIUS, this.world.obstacles).length > 0,
        repositionReachable: true,
        retreatReachable: true,
        patrolReachable: canOccupy(patrol, ACTOR_RADIUS, this.world.obstacles)
      },
      patrolTarget: patrol
    });

    if (decision.action === 'heal') {
      const ally = this.units.find(u => u.actor.id === decision.targetId && u.actor.alive);
      if (ally && healSkill && ready(healSkill) && unit.cooldown <= 0
        && distance(actor, ally.actor) <= healSkill.range
        && hasLineOfSight(actor, ally.actor, this.world.obstacles)) {
        const healed = resolveHealing(ally.actor.health, ally.actor.maxHealth, healSkill.damage);
        ally.actor.health = healed.health;
        this.statusEffects.enemies[ally.actor.id] = dispelStatuses(
          this.statusEffects.enemies[ally.actor.id] ?? [], { categories: ['curse'] });
        abilityCooldowns[healSkill.id] = healSkill.cooldown;
        unit.cooldown = Math.max(unit.cooldown, 0.65);
        this.syncLegacyStatuses();
        this.events.push({
          type: 'enemyHeal', enemyId: actor.id, targetId: ally.actor.id, amount: healed.healed
        });
      }
      return;
    }
    if (decision.action === 'attack' || decision.action === 'cast') {
      if (decision.targetId !== this.player.id || unit.cooldown > 0 || !target) return;
      const choice = actions.find(action =>
        (action.kind === 'damage' || action.kind === 'debuff') && ready(action)
        && toPlayer <= action.range
        && (lineOfSight || action.attack === 'sweep'));
      this.beginMonsterAttack(unit, choice);
      return;
    }
    if ('destination' in decision) {
      const dest = decision.destination;
      if (!canOccupy(dest, ACTOR_RADIUS, this.world.obstacles)) return;
      const route = findPath(actor, dest, ACTOR_RADIUS, this.world.obstacles);
      if (!route.length) return;
      const point = route[0]!;
      const slowed = getStatusModifiers(this.statusEffects.enemies[actor.id] ?? []).moveSpeed ?? 0;
      const pace = def.speed * profile.speedMultiplier * (unit.elite?.speedMultiplier ?? 1) * Math.max(0.25, 1 + slowed);
      const stop = decision.action === 'chase' && route.length === 1
        && distance(dest, this.player) < 0.01
        ? Math.max(0, def.preferredRange - 4) : 0;
      this.follow(actor, point, pace, dt, stop);
    }
  }

  private updateEnemyAI(unit: EnemyUnit, dt: number): void {
    if (!unit.actor.alive || !this.player.alive) { unit.intent = null; return; }
    // The starter camp is a sanctuary even if the player retreats mid-combat.
    if (this.zone === 'wilderness' && distance(this.player, this.world.camp) <= CAMP_RADIUS) {
      unit.intent = null;
      if (this.wave >= 2) this.updateMonsterTactics(unit, dt);
      return;
    }
    unit.cooldown = Math.max(0, unit.cooldown - dt);
    if (unit.abilityCooldowns) {
      for (const id of Object.keys(unit.abilityCooldowns)) {
        unit.abilityCooldowns[id] = Math.max(0, unit.abilityCooldowns[id]! - dt);
      }
    }
    const actor = unit.actor;
    const def = ENEMY_DEFINITIONS[actor.type];
    if (unit.effects.some(effect => effect.id === 'stunned')
      || this.statusEffects.enemies[actor.id]?.some(effect =>
        effect.id === 'stunned' || effect.id === 'frozen')) {
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
      const action = intent.abilityId ? monsterAction(actor.type, intent.abilityId) : undefined;
      const baseDamage = action ? action.damage : def.baseDamage + this.level * 2;
      if (intent.pattern === 'bolt') {
        this.fireBolt(unit, intent, intent.radius, baseDamage * (unit.elite?.damageMultiplier ?? 1), action);
        return;
      }
      const hit = distance(this.player, intent) <= intent.radius
        && (baseDamage <= 0 || this.dealPlayerDamage(baseDamage * (unit.elite?.damageMultiplier ?? 1),
          intent.pattern === 'leap' && !action ? 'poison' : 'physical', actor.id));
      if (hit && action?.statusId && this.player.alive) {
        this.applyCanonicalStatus('player', action.statusId, actor.id,
          action.statusMagnitude, action.statusDuration);
      } else if (hit && !action && intent.pattern === 'leap' && this.player.alive) {
        this.applyCanonicalStatus('player', 'poisoned', actor.id, 3, 3);
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
    const speed = def.speed * (unit.elite?.speedMultiplier ?? 1) * (slowed ? 0.35 : 1);
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
    const wilderness = destination === 'wilderness' ? buildWilderness(seed) : null;
    const crypt = destination === 'crypt' ? buildCryptWorld(seed) : null;
    this.world = wilderness?.layout ?? crypt!.layout;
    this.cryptTheme = crypt?.theme ?? null;
    this.storyFeatures = wilderness?.features ?? [];
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
    this.pendingCryptPropId = null;
    this.cryptArmedTraps.clear();
    this.miniBossStates.clear();
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
    this.classAction = null;
    this.eliteQueue = [];
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
    this.pendingTown = null;
    this.pendingPortal = false;
    this.selectedTargetId = null;
    if (destination === 'crypt') {
      this.storyEvent('crypt_descent', 'crypt_gate_entered', 'crypt_entry');
    } else this.spawnMorrow();
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
    const currentStats = deriveStats(this.classId, this.equipment, this.level);
    this.resource = advanceResource(this.resource, currentStats.resourceRegen,
      currentStats.maxResource, dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.evadeCooldown = Math.max(0, this.evadeCooldown - dt);
    for (const slot of ['rmb', 'slot1'] as const) {
      this.cooldowns[slot] = Math.max(0, this.cooldowns[slot] - dt);
    }
    this.warriorCooldowns = { ...advanceWarriorCooldowns({
      rage: this.resource, maxRage: deriveStats('WARRIOR', this.equipment, this.level).maxResource,
      cooldowns: this.warriorCooldowns
    }, dt).cooldowns } as Partial<Record<WarriorAbilityId, number>>;
    this.warriorCooldowns.cleave = this.cooldowns.rmb;
    this.warriorCooldowns.charge = this.cooldowns.slot1;
    this.tickEffects(dt);
    this.tickCanonicalStatuses(dt);
    this.syncLegacyStatuses();
    this.tickWarriorTimeline();
    this.tickClassTimeline();
    if (this.player.alive) {
      const regen = regenerateHealth(
        this.player.health, this.player.maxHealth,
        deriveStats(this.classId, this.equipment, this.level).healthRegen, dt, this.healthRegenCarry
      );
      this.player.health = regen.health;
      this.healthRegenCarry = regen.carry;
    }
    this.tickProjectiles(dt);
    this.tickElites(dt);
    this.spawnOptionalMiniBosses();
    if (this.aliveEnemies.length === 0 && !this.dungeonCleared) {
      if (this.zone === 'wilderness') {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) {
          this.wave = this.questStatus('blighted_pack') === 'active'
            ? (this.wave < 3 ? 3 : this.wave + (4 - ((this.wave - 3) % 4)))
            : this.wave + 1;
          this.units = createPack(this.wave, this.level, this.world.encounterPositions);
          this.seedElitePack();
          this.statusEffects.enemies = {};
          this.respawnTimer = 0;
          this.selectedTargetId = null;
        }
      } else if (this.dungeonStage === 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) {
          this.dungeonStage = 1;
          this.wave = 1;
          this.units = createCryptPack(1, this.level, CRYPT_RUNTIME_BOSS_POSITIONS);
          this.seedElitePack();
          this.statusEffects.enemies = {};
          this.respawnTimer = 0;
          this.selectedTargetId = null;
        }
      } else {
        this.dungeonCleared = true;
        this.respawnTimer = 0;
        this.gold += 200;
        this.awardExperience(rewardForActivity('dungeon', this.level, this.level));
        this.events.push({ type: 'dungeonCleared' });
      }
    }

    const haste = getStatusModifiers(this.statusEffects.player).moveSpeed ?? 0;
    const speed = PLAYER_SPEED * (deriveStats(this.classId, this.equipment, this.level).moveSpeed / 100)
      * Math.max(0.25, Math.min(1.6, 1 + haste));
    const focus = this.focusedUnit;
    if (this.pendingPortal) {
      if (distance(this.player, this.portalPosition) <= 78) {
        this.changeZone();
        return;
      }
      this.follow(this.player, this.portalPosition, speed, dt, 70);
    } else if (this.pendingTown) {
      const entry = townEntry(this.pendingTown);
      if (!entry || this.zone !== 'wilderness') this.pendingTown = null;
      else if (canInteractTownEntry(this.player, entry.id)) {
        this.pendingTown = null;
        if (entry.role === 'waypoint' && this.mapDiscovery && this.mapWorld) {
          const discovered = activateMapWaypoint(this.mapDiscovery, 'town.waypoint', this.mapWorld);
          if (discovered.ok) {
            this.mapDiscovery = discovered.value;
            this.recordWorldFact('waypointActivated', entry.id);
          }
        }
        this.events.push({ type: 'townInteraction', entryId: entry.id, role: entry.role });
      } else {
        this.follow(this.player, entry.position, speed, dt, Math.max(1, entry.interactionRange - 10));
      }
    } else if (this.pendingNpc) {
      if (nearNpc(this.player, this.pendingNpc)) {
        const id = this.pendingNpc;
        this.pendingNpc = null;
        this.pendingTown = null;
        if (id === WARDEN_ID) this.recordVesnaReport();
        this.events.push({ type: 'npcDialogue', npcId: id });
      } else {
        this.follow(this.player, NPC_POSITIONS[this.pendingNpc], speed, dt, NPC_INTERACT_RANGE - 10);
      }
    } else if (this.pendingCryptPropId) {
      const prop = this.cryptInteractables().find(p => p.id === this.pendingCryptPropId);
      if (!prop) this.pendingCryptPropId = null;
      else if (distance(this.player, prop.position) <= prop.reach) this.tryInteractCrypt();
      else this.follow(this.player, prop.position, speed, dt, Math.max(6, prop.reach - 12));
    } else if (this.pendingObject) {
      const object = getWorldObject(this.pendingObject, this.zone);
      if (!object) this.pendingObject = null;
      else if (distance(this.player, object.position) <= object.reach) this.tryInteractObject();
      else this.follow(this.player, object.position, speed, dt, object.reach - 10);
    } else if (this.warriorAction?.timeline.movementLocked
      || this.classAction?.timeline.movementLocked) {
      this.movementSpeed = 0;
    } else if (this.warriorPending) {
      const pending = this.warriorPending;
      const target = pending.targetId ? this.units.find(u => u.actor.alive && u.actor.id === pending.targetId) : null;
      if (WARRIOR_ABILITIES[pending.id].target === 'enemy' && !target) this.warriorPending = null;
      else if (target && distance(this.player, target.actor) > WARRIOR_ABILITIES[pending.id].range) {
        if (this.holdPosition || this.immobilized) this.warriorPending = null;
        else {
          const route = hasLineOfSight(this.player, target.actor, this.world.obstacles)
            ? [] : findPath(this.player, target.actor, ACTOR_RADIUS, this.world.obstacles);
          if (route.length > 0) this.follow(this.player, route[0]!, speed, dt,
            route.length === 1 ? WARRIOR_ABILITIES[pending.id].range - 4 : 0);
          else this.follow(this.player, target.actor, speed, dt,
            WARRIOR_ABILITIES[pending.id].range - 4);
        }
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
      else if (distance(this.player, target.actor) >
        (this.classId === 'WARRIOR' ? Math.min(60, definition.attackRange) : definition.attackRange)) {
        if (!this.holdPosition) {
          const range = this.classId === 'WARRIOR'
            ? Math.min(60, definition.attackRange) : definition.attackRange;
          const route = hasLineOfSight(this.player, target.actor, this.world.obstacles)
            ? [] : findPath(this.player, target.actor, ACTOR_RADIUS, this.world.obstacles);
          if (route.length > 0) {
            this.follow(this.player, route[0]!, speed, dt, route.length === 1 ? range - 4 : 0);
          } else {
            this.follow(this.player, target.actor, speed, dt, range - 4);
          }
        }
      } else if (!this.immobilized && this.attackTimer <= 0) {
        if (this.classId === 'WARRIOR') {
          // Repeated left-click attacks share the same hit-frame and Rage policy.
          this.requestWarriorAbility('basicAttack', target.actor.id);
          if (this.warriorAction?.id === 'basicAttack') {
            this.attackTarget = target.actor.id;
          }
        } else if (!this.classAction) {
          const stats = deriveStats(this.classId, this.equipment, this.level);
          this.attackTimer = 0.68 / stats.attackSpeed;
          this.classAction = {
            kind: 'basic', slot: null, targetId: target.actor.id,
            timeline: startCombatTimeline(BASIC_ATTACK_TIMELINE).state
          };
          this.events.push({ type: 'cast', skillId: 'basicAttack',
            x: target.actor.x, y: target.actor.y });
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

    this.discoverStoryLocations();
    this.observeExploration();
    this.tickCryptTraps(dt);
    if (this.player.alive) {
      for (const unit of this.units) {
        if (this.miniBossStates.has(unit.actor.id)) this.updateMiniBoss(unit, dt);
        else this.updateEnemyAI(unit, dt);
        if (!this.player.alive) break;
      }
    }
  }

  /** Seeded elites decorate canonical enemies; normal tutorial waves stay unchanged. */
  private seedElitePack(): void {
    const boss = this.zone === 'crypt' && this.dungeonStage === 1;
    if (!boss && (this.zone !== 'wilderness' || this.wave < 2)) return;
    const index = boss ? 0 : this.rng.index(PACK_SIZE);
    const unit = this.units[index];
    if (!unit) return;
    const ids = rollEliteModifiers({ count: boss || this.wave >= 6 ? 2 : 1 }, this.rng);
    if (!ids || !ids.length) return;
    const base = ENEMY_DEFINITIONS[unit.actor.type];
    const plan = applyEliteStats({ health: unit.actor.maxHealth,
      baseDamage: base.baseDamage, speed: base.speed }, ids);
    if (!plan) return;
    unit.actor.health = plan.maxHealth;
    unit.actor.maxHealth = plan.maxHealth;
    unit.elite = {
      modifiers: [...ids], visualTags: [...plan.visualTags], shield: plan.shield,
      damageMultiplier: base.baseDamage > 0 ? plan.baseDamage / base.baseDamage : 1,
      speedMultiplier: base.speed > 0 ? plan.speed / base.speed : 1,
      elapsedSeconds: 0, deathTriggered: false
    };
  }

  /** Execute elite effects using the same damage/status entry points as normal combat. */
  private tickElites(dt: number): void {
    const pending = this.eliteQueue;
    this.eliteQueue = [];
    for (const entry of pending) {
      entry.remaining -= dt;
      if (entry.remaining > 0) { this.eliteQueue.push(entry); continue; }
      const source = this.units.find(unit => unit.actor.id === entry.sourceId);
      if (!source) continue;
      if (entry.kind === 'teleport') {
        if (!source.actor.alive) continue;
        const angle = this.rng.next() * 2 * Math.PI;
        const target = { x: source.actor.x + Math.cos(angle) * entry.radius,
          y: source.actor.y + Math.sin(angle) * entry.radius };
        if (canOccupy(target, ACTOR_RADIUS, this.world.obstacles)) {
          source.actor.x = target.x;
          source.actor.y = target.y;
        }
      } else if (this.player.alive
        && !(this.zone === 'wilderness' && distance(this.player, this.world.camp) <= CAMP_RADIUS)
        && distance(this.player, entry.position) <= entry.radius) {
        const base = ENEMY_DEFINITIONS[source.actor.type].baseDamage + this.level * 2;
        this.dealPlayerDamage(base * entry.multiplier * (source.elite?.damageMultiplier ?? 1),
          entry.damageType, entry.sourceId);
      }
    }

    for (const unit of [...this.units]) {
      if (!unit.actor.alive || !unit.elite) continue;
      const start = unit.elite.elapsedSeconds;
      const period = eliteOnPeriodicPlan(unit.elite.modifiers, {
        actorId: unit.actor.id, position: { x: unit.actor.x, y: unit.actor.y },
        elapsedSeconds: start, deltaSeconds: dt
      });
      unit.elite.elapsedSeconds = Math.min(86400, start + dt);
      for (const action of period?.actions ?? []) this.dispatchEliteAction(unit, action);
    }
  }

  private dispatchEliteAction(unit: EnemyUnit, action: ElitePlannedAction): void {
    if (action.kind === 'telegraph') {
      this.events.push({ type: 'eliteCue', enemyId: unit.actor.id,
        effect: action.telegraphId, x: action.position.x, y: action.position.y,
        radius: action.radius });
    } else if (action.kind === 'status') {
      if (action.targetId === unit.actor.id && action.statusId === 'regeneration') {
        const heal = resolveHealing(unit.actor.health, unit.actor.maxHealth,
          Math.max(1, Math.round(unit.actor.maxHealth * action.magnitude)));
        unit.actor.health = heal.health;
        if (heal.healed > 0) this.events.push({
          type: 'enemyHeal', enemyId: unit.actor.id,
          targetId: unit.actor.id, amount: heal.healed
        });
      } else if (action.targetId === this.player.id) {
        this.applyCanonicalStatus('player', action.statusId, unit.actor.id,
          action.magnitude, action.durationSeconds);
      }
    } else if (action.kind === 'damage') {
      this.eliteQueue.push({
        kind: 'pulse', remaining: action.delaySeconds, sourceId: unit.actor.id,
        position: { ...action.position }, radius: action.radius,
        multiplier: action.baseMultiplier, damageType: action.damageType
      });
    } else if (action.kind === 'hazard') {
      for (let tick = action.tickIntervalSeconds; tick <= action.durationSeconds;
        tick += action.tickIntervalSeconds) {
        this.eliteQueue.push({
          kind: 'pulse', remaining: tick, sourceId: unit.actor.id,
          position: { ...action.position }, radius: action.radius,
          multiplier: action.baseMultiplier, damageType: action.damageType
        });
      }
    } else if (action.kind === 'teleport') {
      this.eliteQueue.push({
        kind: 'teleport', remaining: action.castSeconds, sourceId: unit.actor.id,
        position: { x: unit.actor.x, y: unit.actor.y }, radius: action.maxDistance,
        multiplier: 0, damageType: 'fire'
      });
    } else if (action.kind === 'summon') {
      const active = this.units.filter(other => other.summoned && other.actor.alive).length;
      if (active >= action.maxActive || this.units.length >= PACK_SIZE + 2) return;
      const offsets = [{ x: 55, y: 22 }, { x: -55, y: -22 }, { x: 34, y: -48 }];
      const offset = offsets[this.units.length - PACK_SIZE] ?? offsets[0]!;
      const position = { x: unit.actor.x + offset.x, y: unit.actor.y + offset.y };
      if (!canOccupy(position, ACTOR_RADIUS, this.world.obstacles)) return;
      const base = ENEMY_DEFINITIONS.skeleton;
      const health = base.health + Math.max(0, this.level - 1) * 12;
      const id = 'summon-' + this.wave + '-' + this.units.length;
      this.units.push({
        actor: { id, type: 'skeleton', ...position,
          health, maxHealth: health, alive: true },
        summoned: true, intent: null, cooldown: 1, effects: []
      });
    }
  }

  private awardExperience(amount: number): void {
    const award = awardProgression({ level: this.level, xp: this.xp }, amount);
    if (!award) return;
    const prior = this.level;
    this.level = award.state.level;
    this.xp = award.state.xp;
    this.skillPoints += award.skillPointsGained;
    this.talentPoints += award.talentPointsGained;
    // Every level increases derived attributes, HP and class resource capacity.
    for (let level = prior + 1; level <= this.level; level++) {
      const stats = deriveStats(this.classId, this.equipment, level);
      updateHealthLimit(this.player, stats.maxHealth);
      this.resource = Math.min(stats.maxResource, this.resource + 2);
      this.player.health = resolveHealing(
        this.player.health, this.player.maxHealth,
        Math.round(this.player.maxHealth * 0.25)
      ).health;
      this.events.push({ type: 'levelUp', level });
    }
  }

  private defeatEnemy(unit: EnemyUnit): void {
    unit.actor.alive = false;
    const mini = this.miniBossStates.get(unit.actor.id);
    if (mini && !this.defeatedMiniBossIds.has(mini.bossId)) {
      const result = stepMiniBoss(mini, {
        deltaSeconds: 0, health: 0, maxHealth: unit.actor.maxHealth,
        alive: false, position: { x: unit.actor.x, y: unit.actor.y }, target: null,
        arena: this.miniBossArena(mini.bossId, unit.actor)
      });
      const proposal = result && planMiniBossDefeat(result.state, {
        processedOccurrenceIds: [...this.defeatedMiniBossIds]
      });
      if (proposal?.proposal) {
        this.miniBossStates.set(unit.actor.id, proposal.state);
        this.defeatedMiniBossIds.add(mini.bossId);
        this.gold += 45;
        this.awardExperience(rewardForActivity('boss', this.level, this.level));
        this.events.push({ type: 'miniBossCue', enemyId: unit.actor.id,
          bossId: mini.bossId, kind: 'death', x: unit.actor.x, y: unit.actor.y,
          radius: 76, phase: result!.state.phase });
      }
    }
    if (unit.elite && !unit.elite.deathTriggered) {
      const plan = eliteOnDeathPlan(unit.elite.modifiers, {
        actorId: unit.actor.id, position: { x: unit.actor.x, y: unit.actor.y },
        alive: false, alreadyTriggered: false
      });
      unit.elite.deathTriggered = true;
      for (const action of plan?.actions ?? []) this.dispatchEliteAction(unit, action);
    }
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
    this.awardExperience(Math.round(rewardForActivity('enemy', this.level, this.level)
      * (unit.elite ? 1.75 : 1)));
    if (this.zone === 'wilderness') {
      this.commitQuestTransition(
        advanceObjective(ACT_I_QUEST_CATALOG, this.actILedger,
          FIRST_QUEST_ID, 'enemy_defeated', 'enemy_' + this.kills), FIRST_QUEST_ID
      );
      if (unit.actor.type === 'corruptedBoar') {
        this.storyEvent('blighted_pack', 'infected_beast_slain', 'boar_' + this.kills);
      }
      if (unit.actor.id === 'morrow_gravebound') {
        this.recordWorldFact('uniqueEnemyDefeated', 'act1.grave_warden');
        this.storyEvent('morrow_gravebound', 'morrow_gravebound_slain', 'morrow_defeat');
      }
    }
    if (unit.actor.type === 'crypt_lord') {
      if (this.zone === 'crypt') this.storyEvent('crypt_lord_fallen', 'crypt_lord_slain', 'crypt_lord_defeat');
      this.gold += 100;
      this.awardExperience(rewardForActivity('boss', this.level, this.level));
    }
    this.dropEnemyLoot(unit);
    this.events.push({ type: 'defeat', targetId: unit.actor.id, kills: this.kills });
    if (this.aliveEnemies.length === 0) this.respawnTimer = this.zone === 'crypt' && this.dungeonStage === 1 ? 0 : 3.2;
  }
  /** The one runtime path for normal, elite and boss drops; rolls share catalog+affixes. */
  private dropEnemyLoot(unit: EnemyUnit): void {
    const boss = unit.actor.type === 'crypt_lord' || this.defeatedMiniBossIds.has(unit.actor.id as MiniBossId);
    const context: LootContext = {
      playerLevel: this.level, monsterLevel: this.level, enemyType: unit.actor.type,
      zone: this.zone, isBoss: boss, difficulty: 'normal',
      eliteModifiers: unit.elite?.modifiers ?? [],
      magicFind: deriveStats(this.classId, this.equipment, this.level).magicFind
    };
    const selected = rollLootTable(context, this.rng);
    const rolls: LootRoll[] = [
      ...bossGuaranteedLoot(context), ...(selected ? [selected] : [])
    ];
    for (const [index, roll] of rolls.entries()) {
      if (this.groundLoot.length >= 100) break;
      const id = 'drop-' + this.kills + '-' + index;
      const item = rollItemForBase(
        roll.itemBaseId, 'drop-' + this.kills + '-item-' + index,
        roll.itemLevel, roll.rarity, this.rng
      );
      if (!item) continue;
      this.groundLoot.push({ id, x: unit.actor.x + index * 16, y: unit.actor.y, item });
      this.events.push({ type: 'loot', id });
    }
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
      skillPoints: this.skillPoints,
      talentPoints: this.talentPoints,
      gold: this.gold,
      kills: this.kills,
      inventory: this.inventory.map(cloneItem),
      equipment: cloneEquipment(this.equipment),
      stash: this.stash.map(cloneItem),
      ...(Object.keys(this.itemFlags).length ? { itemFlags: Object.fromEntries(
        Object.entries(this.itemFlags).map(([id, flags]) => [id, { ...flags }])) } : {}),
      quest: { ...this.quest },
      questLedger: structuredClone(this.actILedger)
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
      skillPoints: progress.skillPoints ?? Math.max(0, Math.min(MAX_LEVEL - 1, progress.level - 1)),
      talentPoints: progress.talentPoints ?? Math.floor(Math.min(MAX_LEVEL, progress.level) / 5),
      gold: progress.gold,
      kills: progress.kills,
      inventory: progress.inventory,
      equipment: progress.equipment,
      stash: progress.stash === undefined ? Array(STASH_SIZE).fill(null) : progress.stash,
      itemFlags: progress.itemFlags,
      quest: progress.quest,
      questLedger: progress.questLedger ?? createActIQuestLedger(progress.quest)!
    };
    if (!scratch.restore(candidate)) return false;

    this.reset(progress.classId, seed);
    this.level = progress.level;
    this.xp = progress.xp;
    this.skillPoints = scratch.skillPoints;
    this.talentPoints = scratch.talentPoints;
    this.gold = progress.gold;
    this.kills = progress.kills;
    this.inventory = progress.inventory.map(cloneItem);
    this.stash = (progress.stash === undefined ? Array(STASH_SIZE).fill(null) : progress.stash).map(cloneItem);
    this.equipment = cloneEquipment(progress.equipment);
    this.itemFlags = { ...scratch.itemFlags };
    this.quest = { ...progress.quest };
    this.actILedger = createActIQuestLedger(progress.questLedger ?? progress.quest)!;
    this.refreshHealthLimit();
    this.player.health = this.player.maxHealth;
    this.units = createPack(0, this.level, this.world.encounterPositions);
    this.spawnMorrow();
    this.events.splice(0);
    return true;
  }

  snapshot(): GameSnapshot {
    const focus = this.focusedUnit;
    const status = this.paused ? 'paused' : !this.player.alive ? 'dead'
      : this.attackTarget || this.pendingSkill || this.warriorAction || this.warriorPending
        || this.classAction ? 'combat'
      : this.movePath.length || this.pickupTarget || this.pendingObject
        || this.pendingNpc || this.pendingTown || this.pendingPortal ? 'moving' : 'ready';
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
      skillPoints: this.skillPoints,
      talentPoints: this.talentPoints,
      gold: this.gold,
      resource: this.resource,
      rngState: this.rng.state,
      cooldowns: { ...this.cooldowns },
      warriorCooldowns: { ...this.warriorCooldowns },
      warriorAction: this.warriorAction ? {
        ...this.warriorAction, timeline: { ...this.warriorAction.timeline }
      } : null,
      classAction: this.classAction ? {
        ...this.classAction, timeline: { ...this.classAction.timeline },
        ...(this.classAction.aim ? { aim: structuredClone(this.classAction.aim) } : {})
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
      stats: deriveStats(this.classId, this.equipment, this.level),
      inventory: this.inventory.map(cloneItem),
      equipment: cloneEquipment(this.equipment),
      stash: this.stash.map(cloneItem),
      ...(Object.keys(this.itemFlags).length ? { itemFlags: Object.fromEntries(
        Object.entries(this.itemFlags).map(([id, flags]) => [id, { ...flags }])) } : {}),
      groundLoot: this.groundLoot.map(loot => ({ ...loot, item: cloneItem(loot.item)! })),
      quest: { ...this.quest },
      questLedger: structuredClone(this.actILedger),
      actIIUnlocked: this.questStatus('vesnas_report') === 'completed',
      ...(this.mapDiscovery ? { mapDiscovery: structuredClone(this.mapDiscovery) } : {}),
      ...(this.worldFacts ? { worldFacts: structuredClone(this.worldFacts) } : {}),
      cryptInteractables: this.cryptInteractables(),
      cryptUsedPropIds: [...this.cryptUsedPropIds],
      cryptTriggeredTrapIds: [...this.cryptTriggeredTrapIds],
      miniBossStates: Object.fromEntries([...this.miniBossStates]
        .map(([id, state]) => [id, structuredClone(state)])),
      miniBossDefeatedIds: [...this.defeatedMiniBossIds],
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
      ? (s.zone === 'crypt' ? buildCryptWorld(s.worldSeed).layout : buildWilderness(s.worldSeed).layout)
      : null;
    const restoredWilderness = layout ? buildWilderness(s.worldSeed) : null;
    const restoredIndex = restoredWilderness ? createChunkIndex(restoredWilderness) : null;
    const restoredMapWorld = restoredWilderness ? this.mapInput(restoredWilderness) : null;
    const cryptManifest = layout && (s.zone === 'crypt'
      || !!s.cryptUsedPropIds?.length || !!s.cryptTriggeredTrapIds?.length)
      ? buildCryptWorld(s.worldSeed).theme : null;
    const validMiniStates = (states: unknown): boolean => {
      if (states === undefined) return true;
      if (!states || typeof states !== 'object' || Array.isArray(states)) return false;
      const entries = Object.entries(states);
      if (entries.length > MINI_BOSS_IDS.length) return false;
      return entries.every(([id, state]) => MINI_BOSS_IDS.includes(id as MiniBossId)
        && validateMiniBossState(state) && state.bossId === id
        && state.occurrenceId === id
        && Array.isArray(s.enemies) && s.enemies.some(unit => unit?.actor?.id === id
          && unit.actor.type === getMiniBossDefinition(id)?.enemyType));
    };
    const validDungeonIds = (ids: unknown, known: readonly string[]): boolean =>
      ids === undefined || (Array.isArray(ids) && ids.length <= 128
        && ids.every(id => typeof id === 'string' && known.includes(id))
        && new Set(ids).size === ids.length);
    if (!s || !layout || s.version !== 5 || !isClassId(s.classId)
      || (s.mapDiscovery !== undefined && (!restoredMapWorld
        || !validateMapDiscovery(s.mapDiscovery, restoredMapWorld)))
      || (s.worldFacts !== undefined && (!restoredIndex
        || !validateWorldFactLedger(restoredIndex, s.worldFacts)))
      || !validMiniStates(s.miniBossStates)
      || (s.miniBossDefeatedIds !== undefined && (!Array.isArray(s.miniBossDefeatedIds)
        || s.miniBossDefeatedIds.length > MINI_BOSS_IDS.length
        || new Set(s.miniBossDefeatedIds).size !== s.miniBossDefeatedIds.length
        || s.miniBossDefeatedIds.some(id => !MINI_BOSS_IDS.includes(id))))
      || !validDungeonIds(s.cryptUsedPropIds,
        cryptManifest?.interactables.map(prop => prop.id) ?? [])
      || !validDungeonIds(s.cryptTriggeredTrapIds,
        cryptManifest?.traps.map(trap => trap.id) ?? [])
      || (s.cryptInteractables !== undefined && (!Array.isArray(s.cryptInteractables)
        || JSON.stringify(s.cryptInteractables) !== JSON.stringify(
          s.zone === 'crypt' ? (cryptManifest?.interactables ?? []).filter(prop =>
            prop.initiallyVisible && !(s.cryptUsedPropIds ?? []).includes(prop.id)) : [])))
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
      || !Number.isSafeInteger(s.level) || s.level < 1 || s.level > MAX_LEVEL
      || !Number.isSafeInteger(s.xp) || s.xp < 0
      || (s.level === MAX_LEVEL ? s.xp !== 0 : s.xp >= xpRequiredForLevel(s.level))
      || (s.skillPoints !== undefined && (!Number.isSafeInteger(s.skillPoints)
        || s.skillPoints < 0 || s.skillPoints > s.level - 1))
      || (s.talentPoints !== undefined && (!Number.isSafeInteger(s.talentPoints)
        || s.talentPoints < 0 || s.talentPoints > Math.floor(s.level / 5)))
      || !Number.isSafeInteger(s.gold) || s.gold < 0
      || !validQuest(s.quest)
      || !createActIQuestLedger(s.questLedger ?? s.quest)
      || (() => {
        const ledger = createActIQuestLedger(s.questLedger ?? s.quest);
        const original = ledger && firstQuestFromLedger({ quests: [ledger.quests[0]!] });
        return !original || original.id !== s.quest.id
          || original.status !== s.quest.status || original.defeated !== s.quest.defeated;
      })()
      || !Number.isInteger(s.rngState) || s.rngState < 0 || s.rngState > 0xffffffff
      || !Number.isFinite(s.resource) || s.resource < 0 || s.resource > CLASSES[s.classId].resourceMax + (s.level - 1) * 2
      || !Number.isFinite(s.respawnTimer) || s.respawnTimer < 0 || s.respawnTimer > 5
      || !Number.isFinite(s.shield) || s.shield < 0 || s.shield > 100000
      || !Array.isArray(s.projectiles) || s.projectiles.length > 80
      || !s.projectiles.every(p => !!p && typeof p.id === 'string'
        && typeof p.sourceId === 'string' && !!p.target
        && [p.x, p.y, p.target.x, p.target.y, p.speed, p.radius, p.remaining, p.base].every(Number.isFinite)
        && p.speed > 0 && p.remaining > 0 && p.remaining <= 5
        && p.radius > 0 && p.radius <= 250 && p.base >= 0
        && (p.statusId === undefined || (typeof p.statusId === 'string'
          && Object.hasOwn(STATUS_DEFINITIONS, p.statusId)))
        && (p.statusDuration === undefined || (Number.isFinite(p.statusDuration)
          && p.statusDuration > 0 && p.statusDuration <= 120))
        && (p.statusMagnitude === undefined || (Number.isFinite(p.statusMagnitude)
          && p.statusMagnitude >= 0 && p.statusMagnitude <= 10000))
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
      || !validWaveBState(s)
      || !s.effects || !Array.isArray(s.effects.player)
      || s.effects.player.length > 8 || !s.effects.player.every(isActiveEffect)
      || !Array.isArray(s.enemies) || s.enemies.length < PACK_SIZE || s.enemies.length > PACK_SIZE + 2
      || !s.enemies.every((unit, index) =>
        !!unit && !!unit.actor && validEnemyType(unit.actor.type)
        && (s.zone === 'crypt'
          ? (index >= PACK_SIZE ? unit.summoned === true && unit.actor.type === 'skeleton'
            : unit.actor.type === (s.dungeonStage === 0
              ? (['skeleton', 'wolf', 'wraith'] as const)[index]
              : (['crypt_lord', 'skeleton', 'wraith'] as const)[index]))
          : index >= PACK_SIZE ? (MINI_BOSS_IDS.includes(unit.actor.id as MiniBossId)
              ? unit.actor.type === getMiniBossDefinition(unit.actor.id)?.enemyType
                && unit.summoned !== true
              : unit.summoned === true
                && (unit.actor.type === 'skeleton' || unit.actor.type === 'spider'))
            : unit.actor.type === packTypesForWave(s.wave)[index])
        && validActor(unit.actor, index >= PACK_SIZE
          ? (MINI_BOSS_IDS.includes(unit.actor.id as MiniBossId) && s.zone === 'wilderness'
              ? unit.actor.id : 'summon-' + s.wave + '-' + index)
          : unit.actor.type + '-' + (s.wave * PACK_SIZE + index + 1), layout.obstacles)
        && (unit.elite === undefined || (
          validateEliteSet(unit.elite.modifiers) && unit.elite.modifiers.length > 0
          && Array.isArray(unit.elite.visualTags)
          && unit.elite.visualTags.length <= 15
          && Number.isFinite(unit.elite.shield) && unit.elite.shield >= 0 && unit.elite.shield <= 1000000
          && Number.isFinite(unit.elite.damageMultiplier) && unit.elite.damageMultiplier >= 1 && unit.elite.damageMultiplier <= 8
          && Number.isFinite(unit.elite.speedMultiplier) && unit.elite.speedMultiplier >= 1 && unit.elite.speedMultiplier <= 8
          && Number.isFinite(unit.elite.elapsedSeconds) && unit.elite.elapsedSeconds >= 0 && unit.elite.elapsedSeconds <= 86400
          && typeof unit.elite.deathTriggered === 'boolean'))
        && validIntent(unit.intent)
        && (unit.intent?.abilityId === undefined
          || monsterAction(unit.actor.type, unit.intent.abilityId) !== undefined)
        && (unit.intent === null
          || unit.intent.abilityId !== undefined
          || unit.intent.pattern === ENEMY_DEFINITIONS[unit.actor.type].attack)
        && Number.isFinite(unit.cooldown) && unit.cooldown >= 0 && unit.cooldown <= 20
        && (unit.abilityCooldowns === undefined || (!!unit.abilityCooldowns
          && !Array.isArray(unit.abilityCooldowns)
          && typeof unit.abilityCooldowns === 'object'
          && Object.entries(unit.abilityCooldowns).every(([id, cd]) =>
            !!monsterAction(unit.actor.type, id) && Number.isFinite(cd) && cd >= 0 && cd <= 30)))
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
      || !validateStashContents({ inventory: s.inventory, equipment: s.equipment,
        stash: s.stash === undefined ? Array(STASH_SIZE).fill(null) : s.stash,
        ...(s.itemFlags !== undefined ? { flags: s.itemFlags } : {}) })
      || !Array.isArray(s.groundLoot) || s.groundLoot.length > 100
      || !s.groundLoot.every(loot => !!loot && typeof loot.id === 'string'
        && canOccupy(loot, 0, layout.obstacles) && isItem(loot.item))
    ) return false;

    this.world = layout;
    this.cryptTheme = s.zone === 'crypt' ? buildCryptWorld(s.worldSeed).theme : null;
    this.cryptArmedTraps.clear();
    this.pendingCryptPropId = null;
    this.cryptUsedPropIds.clear();
    this.cryptTriggeredTrapIds.clear();
    for (const id of s.cryptUsedPropIds ?? []) this.cryptUsedPropIds.add(id);
    for (const id of s.cryptTriggeredTrapIds ?? []) this.cryptTriggeredTrapIds.add(id);
    this.storyFeatures = restoredWilderness!.features;
    this.initWorldSystems(restoredWilderness!);
    if (s.mapDiscovery) this.mapDiscovery = structuredClone(s.mapDiscovery);
    if (s.worldFacts) this.worldFacts = structuredClone(s.worldFacts);
    this.actILedger = createActIQuestLedger(s.questLedger ?? s.quest)!;
    this.eliteQueue = [];
    this.zone = s.zone;
    this.dungeonStage = s.dungeonStage;
    this.dungeonCleared = s.dungeonCleared;
    this.classId = s.classId;
    this.quest = { ...s.quest };
    this.equipment = cloneEquipment(s.equipment);
    this.inventory = s.inventory.map(cloneItem);
    this.stash = (s.stash === undefined ? Array(STASH_SIZE).fill(null) : s.stash).map(cloneItem);
    this.itemFlags = Object.fromEntries(Object.entries(s.itemFlags ?? {})
      .map(([id, flags]) => [id, { ...flags }]));
    this.groundLoot = s.groundLoot.map(loot => ({ ...loot, item: cloneItem(loot.item)! }));
    this.player = { ...s.player };
    this.units = s.enemies.map(cloneUnit);
    this.miniBossStates.clear();
    for (const [id, state] of Object.entries(s.miniBossStates ?? {})) {
      this.miniBossStates.set(id, structuredClone(state));
    }
    this.defeatedMiniBossIds.clear();
    for (const id of s.miniBossDefeatedIds ?? []) this.defeatedMiniBossIds.add(id);
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
    this.skillPoints = s.skillPoints ?? s.level - 1;
    this.talentPoints = s.talentPoints ?? Math.floor(s.level / 5);
    this.gold = s.gold;
    this.resource = s.resource;
    this.rng = new SeededRng(s.rngState);
    this.cooldowns = { ...s.cooldowns };
    this.warriorCooldowns = s.warriorCooldowns ? { ...s.warriorCooldowns } : {};
    this.warriorAction = s.warriorAction ? {
      ...s.warriorAction, timeline: { ...s.warriorAction.timeline }
    } : null;
    this.classAction = s.classAction ? {
      ...s.classAction, timeline: { ...s.classAction.timeline },
      ...(s.classAction.aim ? { aim: structuredClone(s.classAction.aim) } : {})
    } : null;
    this.warriorPending = null;
    this.statusEffects = {
      player: (s.statusEffects?.player ?? []).map(e => ({ ...e })),
      enemies: Object.fromEntries(Object.entries(s.statusEffects?.enemies ?? {})
        .map(([id, arr]) => [id, arr.map(e => ({ ...e }))]))
    };
    this.effects = { player: s.effects.player.map(effect => ({ ...effect })), enemy: [] };
    this.importLegacyStatuses();
    this.paused = false;
    this.movePath = [];
    this.attackTarget = null;
    this.pendingSkill = null;
    this.pendingAim = null;
    this.pendingNpc = null;
    this.pendingTown = null;
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
    this.cryptTheme = null;
    this.cryptUsedPropIds.clear();
    this.cryptTriggeredTrapIds.clear();
    this.cryptArmedTraps.clear();
    this.pendingCryptPropId = null;
    this.miniBossStates.clear();
    this.defeatedMiniBossIds.clear();
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
    const wilderness = buildWilderness(seed);
    this.world = wilderness.layout;
    this.storyFeatures = wilderness.features;
    this.initWorldSystems(wilderness);
    this.classId = classId;
    this.equipment = createEquipment();
    this.inventory = Array(INVENTORY_SIZE).fill(null);
    this.stash = Array(STASH_SIZE).fill(null);
    this.itemFlags = {};
    this.rng = new SeededRng(seed === 0 ? 0x49ac127b : ((seed ^ 0x49ac127b) >>> 0));
    this.cooldowns = emptyCooldowns();
    this.warriorCooldowns = {};
    this.warriorAction = null;
    this.classAction = null;
    this.warriorPending = null;
    this.eliteQueue = [];
    this.statusEffects = { player: [], enemies: {} };
    this.effects = emptyEffects();
    this.quest = freshQuest();
    this.actILedger = createActIQuestLedger(this.quest)!;
    this.pendingNpc = null;
    this.pendingTown = null;
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
    this.skillPoints = 0;
    this.talentPoints = 0;
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
