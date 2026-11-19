/** Renderer-independent state and command contracts. Language strings are never saved. */
import type { ClassId } from '../data/classes';
import type { Equipment, GroundItem, Item, DerivedStats, EquipmentSlot } from '../data/items';
import type { ActiveEffects, Cooldowns, SkillSlot } from '../skills/skills';
import type { EnemySnapshot, EnemyIntent } from '../enemies/enemies';

export interface Point { x: number; y: number }
export type GameStatus = 'ready' | 'moving' | 'combat' | 'dead' | 'paused';
export interface ActorSnapshot extends Point {
  id: string;
  health: number;
  maxHealth: number;
  alive: boolean;
}
export interface GameSnapshot {
  version: 4;
  classId: ClassId;
  player: ActorSnapshot;
  enemy: EnemySnapshot;
  enemyIntent: EnemyIntent | null;
  enemyCooldown: number;
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
  paused: boolean;
  status: GameStatus;
}
export type GameCommand =
  | { type: 'move'; destination: Point }
  | { type: 'attack'; targetId: string }
  | { type: 'cast'; slot: SkillSlot }
  | { type: 'pickup'; id: string }
  | { type: 'equip'; index: number }
  | { type: 'unequip'; slot: EquipmentSlot }
  | { type: 'pause'; value: boolean }
  | { type: 'reset'; classId?: ClassId };

export type GameEvent =
  | { type: 'cast'; skillId: string; x: number; y: number }
  | { type: 'hit'; targetId: string; damage: number }
  | { type: 'defeat'; targetId: string; kills: number }
  | { type: 'loot'; id: string }
  | { type: 'pickup'; id: string }
  | { type: 'levelUp'; level: number }
  | { type: 'playerDeath' }
  | { type: 'enemyWindup'; enemyId: string; pattern: 'bolt' | 'sweep' | 'leap' }
  | { type: 'enemyAttack'; enemyId: string; hit: boolean };
export interface GameStateReader {
  snapshot(): GameSnapshot;
  subscribe(listener: (state: GameSnapshot) => void): () => void;
  command(command: GameCommand): void;
}
