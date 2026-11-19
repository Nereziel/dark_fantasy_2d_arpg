/** Renderer-independent state and command contracts. Language strings are never saved. */
import type { ClassId } from '../data/classes';
import type { Equipment, GroundItem, Item, DerivedStats, EquipmentSlot } from '../data/items';
import type { ActiveEffects, Cooldowns, SkillSlot } from '../skills/skills';
import type { EnemySnapshot, EnemyIntent, EnemyUnit } from '../enemies/enemies';
import type { QuestProgress } from '../quests/firstQuest';

export interface Point { x: number; y: number }
export type GameStatus = 'ready' | 'moving' | 'combat' | 'dead' | 'paused';
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
  gold: number;
  kills: number;
  inventory: Array<Item | null>;
  equipment: Equipment;
  quest: QuestProgress;
}

export interface GameSnapshot {
  version: 5;
  /** Ephemeral map seed. This is never included in CharacterProgress saves. */
  worldSeed: number;
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
  kills: number;
  level: number;
  xp: number;
  gold: number;
  resource: number;
  rngState: number;
  cooldowns: Cooldowns;
  effects: ActiveEffects;
  stats: DerivedStats;
  inventory: Array<Item | null>;
  equipment: Equipment;
  groundLoot: GroundItem[];
  quest: QuestProgress;
  paused: boolean;
  status: GameStatus;
}
export type GameCommand =
  | { type: 'move'; destination: Point }
  | { type: 'attack'; targetId: string }
  | { type: 'cast'; slot: SkillSlot }
  | { type: 'interactNpc'; npcId: 'warden_vesna' }
  | { type: 'questAccept' }
  | { type: 'questTurnIn' }
  | { type: 'pickup'; id: string }
  | { type: 'equip'; index: number }
  | { type: 'unequip'; slot: EquipmentSlot }
  | { type: 'pause'; value: boolean }
  | { type: 'reset'; classId?: ClassId; seed?: number };

export type GameEvent =
  | { type: 'cast'; skillId: string; x: number; y: number }
  | { type: 'hit'; targetId: string; damage: number }
  | { type: 'defeat'; targetId: string; kills: number }
  | { type: 'loot'; id: string }
  | { type: 'pickup'; id: string }
  | { type: 'levelUp'; level: number }
  | { type: 'playerDeath' }
  | { type: 'npcDialogue'; npcId: 'warden_vesna' }
  | { type: 'questUpdated'; status: QuestProgress['status']; defeated: number }
  | { type: 'enemyWindup'; enemyId: string; pattern: 'bolt' | 'sweep' | 'leap' }
  | { type: 'enemyAttack'; enemyId: string; hit: boolean };
export interface GameStateReader {
  snapshot(): GameSnapshot;
  subscribe(listener: (state: GameSnapshot) => void): () => void;
  command(command: GameCommand): void;
}
