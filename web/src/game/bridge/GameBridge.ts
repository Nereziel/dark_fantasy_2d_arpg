import { GameSimulation } from '../core/GameSimulation';
import type { GameCommand, GameEvent, GameSnapshot, GameStateReader } from '../core/types';

/** UI-facing presentation adapter; game state is owned by the simulation. */
export class GameBridge implements GameStateReader {
  private readonly simulation = new GameSimulation();
  private readonly listeners = new Set<(state: GameSnapshot) => void>();
  private readonly events = new Set<(event: GameEvent) => void>();
  private notificationClock = 0;

  snapshot(): GameSnapshot { return this.simulation.snapshot(); }

  subscribe(listener: (state: GameSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => { this.listeners.delete(listener); };
  }

  onEvent(listener: (event: GameEvent) => void): () => void {
    this.events.add(listener);
    return () => { this.events.delete(listener); };
  }

  command(command: GameCommand): void {
    this.simulation.command(command);
    this.emit();
  }

  tick(milliseconds: number): void {
    this.simulation.advance(milliseconds);
    for (const event of this.simulation.drainEvents()) {
      for (const listener of this.events) listener(event);
    }
    // Svelte HUD refresh <= 8 Hz; Phaser can inspect simulation every frame.
    this.notificationClock += milliseconds;
    if (this.notificationClock >= 125) {
      this.notificationClock = 0;
      this.emit();
    }
  }

  restore(snapshot: GameSnapshot): boolean {
    const restored = this.simulation.restore(snapshot);
    if (restored) this.emit();
    return restored;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
