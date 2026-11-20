/** Renderer-independent state and command contracts. Language strings are never saved. */
import type { ClassId } from '../data/classes';
import type { Equipment, GroundItem, Item, DerivedStats, EquipmentSlot } from '../data/items';
import type { ItemFlags } from '../inventory/equipmentRules';
import type { ActiveEffects, Cooldowns, SkillSlot } from '../skills/skills';
import type { EnemySnapshot, EnemyIntent, EnemyUnit } from '../enemies/enemies';
import type { QuestProgress } from '../quests/firstQuest';
import type { NpcId } from '../world/npcs';
import type { ShopOfferId } from '../trade/commerce';
import type { DamageType } from '../combat/typedDamage';
import type { SkillAim } from '../input/skillAiming';
import type { WarriorAbilityId } from '../skills/warriorKit';
import type { CombatTimelineState } from '../animation/combatTimeline';
import type { StatusInstance } from '../status/statusRuntime';
import type { StatusId } from '../status/statusDefinitions';
import type { WorldObject, WorldObjectId } from '../world/interactables';

export interface Point { x: number; y: number }
export type GameStatus = 'ready' | 'moving' | 'combat' | 'dead' | 'paused';
export type ZoneId = 'wilderness' | 'crypt';
export interface ActorSnapshot extends Point {
  id: string;
  health: number;
  maxHealth: number;
  alive: boolean;
}
/**
 * Only permanent character progression crosses save boundaries.
 * Entire world snapshots are temporary and never written to IndexedDB.
 */
export interface CharacterProgress {
  classId: ClassId;
  level: number;
  xp: number;
  /** Unspent points, reconstructible on migration from v8 characters. */
  skillPoints?: number;
  talentPoints?: number;
  gold: number;
  kills: number;
  inventory: Array<Item | null>;
  equipment: Equipment;
  itemFlags?: Record<string, ItemFlags>;
  quest: QuestProgress;
}

/** Session-only authoritative missile; never included in CharacterProgress. */
export interface ProjectileSnapshot extends Point {
  id: string;
  sourceId: string;
  target: Point;
  type: DamageType;
  speed: number;
  radius: number;
  remaining: number;
  base: number;
  /** Optional on-hit effects from a catalog monster's telegraphed projectile. */
  statusId?: StatusId;
  statusDuration?: number;
  statusMagnitude?: number;
}

export interface GameSnapshot {
  version: 5;
  /** Ephemeral map seed. This is never included in CharacterProgress saves. */
  worldSeed: number;
  /** All area and dungeon fields are transient and excluded from character saves. */
  zone: ZoneId;
  dungeonStage: 0 | 1;
  dungeonCleared: boolean;
  classId: ClassId;
  player: ActorSnapshot;
  /** Focused enemy for the existing HUD; authoritative enemy state is in enemies. */
  enemy: EnemySnapshot;
  enemyIntent: EnemyIntent | null;
  enemyCooldown: number;
  enemies: EnemyUnit[];
  selectedTargetId: string | null;
  wave: number;
  respawnTimer: number;
  /** Session-only movement and dodge input state. */
  holdPosition: boolean;
  evadeCooldown: number;
  shield: number;
  projectiles: ProjectileSnapshot[];
  interactables: WorldObject[];
  usedInteractables: WorldObjectId[];
  moveDestination: Point | null;
  kills: number;
  level: number;
  xp: number;
  skillPoints?: number;
  talentPoints?: number;
  gold: number;
  resource: number;
  rngState: number;
  cooldowns: Cooldowns;
  /** Runtime Warrior actions and status effects are never part of CharacterProgress. */
  warriorCooldowns?: Partial<Record<WarriorAbilityId, number>>;
  warriorAction?: { id: WarriorAbilityId; targetId: string | null; aim?: SkillAim; timeline: CombatTimelineState; hitCount: number } | null;
  /** Transient hit-frame state of the other five classes, never persisted. */
  classAction?: {
    kind: 'basic' | 'skill';
    slot: SkillSlot | null;
    targetId: string | null;
    aim?: SkillAim;
    timeline: CombatTimelineState;
  } | null;
  statusEffects?: { player: StatusInstance[]; enemies: Record<string, StatusInstance[]> };
  effects: ActiveEffects;
  stats: DerivedStats;
  inventory: Array<Item | null>;
  equipment: Equipment;
  groundLoot: GroundItem[];
  itemFlags?: Record<string, ItemFlags>;
  quest: QuestProgress;
  paused: boolean;
  status: GameStatus;
}
export type GameCommand =
  | { type: 'move'; destination: Point }
  | { type: 'holdPosition'; value: boolean }
  | { type: 'evade' }
  | { type: 'attack'; targetId: string }
  | { type: 'cast'; slot: SkillSlot; targetId?: string; aim?: SkillAim }
  | { type: 'warriorAbility'; id: WarriorAbilityId; targetId?: string }
  | { type: 'interactNpc'; npcId: NpcId }
  | { type: 'usePortal' }
  | { type: 'interactObject'; id: WorldObjectId }
  | { type: 'buyItem'; offerId: ShopOfferId }
  | { type: 'sellItem'; index: number }
  | { type: 'temperItem'; slot: EquipmentSlot }
  | { type: 'questAccept' }
  | { type: 'questTurnIn' }
  | { type: 'pickup'; id: string }
  | { type: 'equip'; index: number; slot?: EquipmentSlot }
  | { type: 'unequip'; slot: EquipmentSlot }
  | { type: 'swapInventory'; fromIndex: number; toIndex: number }
  | { type: 'sortInventory' }
  | { type: 'setItemFlag'; itemId: string; flag: 'locked' | 'favorite'; value: boolean }
  | { type: 'dropInventory'; index: number }
  | { type: 'pause'; value: boolean }
  | { type: 'reset'; classId?: ClassId; seed?: number };

export type GameEvent =
  | { type: 'cast'; skillId: string; x: number; y: number }
  | { type: 'hit'; targetId: string; damage: number }
  | { type: 'damageResolved'; sourceId: string; targetId: string; damageType: DamageType;
      damage: number; absorbed: number; critical: boolean; dodged: boolean; blocked: boolean }
  | { type: 'projectileLaunch'; id: string; sourceId: string }
  | { type: 'projectileImpact'; id: string; hit: boolean }
  | { type: 'worldInteract'; id: WorldObjectId; kind: 'shrine' | 'chest' }
  | { type: 'defeat'; targetId: string; kills: number }
  | { type: 'loot'; id: string }
  | { type: 'pickup'; id: string }
  | { type: 'levelUp'; level: number }
  | { type: 'playerDeath' }
  | { type: 'warriorImpact'; id: WarriorAbilityId; x: number; y: number }
  | { type: 'npcDialogue'; npcId: NpcId }
  | { type: 'zoneChanged'; zone: ZoneId }
  | { type: 'dungeonCleared' }
  | { type: 'questUpdated'; status: QuestProgress['status']; defeated: number }
  | { type: 'enemyWindup'; enemyId: string; pattern: 'bolt' | 'sweep' | 'leap' }
  | { type: 'enemyAttack'; enemyId: string; hit: boolean }
  | { type: 'enemyHeal'; enemyId: string; targetId: string; amount: number }
  | { type: 'enemyBuff'; enemyId: string; abilityId: string }
  | { type: 'eliteCue'; enemyId: string; effect: string; x: number; y: number; radius: number };
export interface GameStateReader {
  snapshot(): GameSnapshot;
  subscribe(listener: (state: GameSnapshot) => void): () => void;
  command(command: GameCommand): void;
}
