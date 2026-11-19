/** Domain types: no Phaser, DOM, Svelte or translation dependencies. */
export interface Point { x: number; y: number }
export type GameStatus = 'ready' | 'moving' | 'combat' | 'dead' | 'paused';

export interface ActorSnapshot extends Point {
  id: string;
  health: number;
  maxHealth: number;
  alive: boolean;
}
export interface GameSnapshot {
  version: 1;
  player: ActorSnapshot;
  enemy: ActorSnapshot;
  kills: number;
  level: number;
  paused: boolean;
  status: GameStatus;
}
export type GameCommand =
  | { type: 'move'; destination: Point }
  | { type: 'attack'; targetId: string }
  | { type: 'pause'; value: boolean }
  | { type: 'reset' };

export type GameEvent =
  | { type: 'hit'; targetId: string; damage: number }
  | { type: 'defeat'; targetId: string; kills: number }
  | { type: 'playerDeath' };

export interface GameStateReader {
  snapshot(): GameSnapshot;
  subscribe(listener: (state: GameSnapshot) => void): () => void;
  command(command: GameCommand): void;
}
