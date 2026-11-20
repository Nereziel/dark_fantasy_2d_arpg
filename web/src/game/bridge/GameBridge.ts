import { GameSimulation } from '../core/GameSimulation';
import { newSessionSeed } from '../world/generator';
import { resolveSkillAim, type SkillAim } from '../input/skillAiming';
import { GAME_BINDINGS } from '../input/gameBindings';
import type { InputBinding } from '../input/bindings';
import { SKILLS, type SkillSlot } from '../skills/skills';
import type { CharacterProgress, GameCommand, GameEvent, GameSnapshot, GameStateReader, Point } from '../core/types';

/** UI-facing presentation adapter; game state is owned by the simulation. */
export class GameBridge implements GameStateReader {
  private readonly simulation = new GameSimulation();
  private readonly listeners = new Set<(state: GameSnapshot) => void>();
  private readonly events = new Set<(event: GameEvent) => void>();
  private notificationClock = 0;
  private pointerWorld: Point | null = null;
  private pointerEnemy: string | null = null;
  private bindingMap: readonly InputBinding[] = GAME_BINDINGS;

  bindings(): readonly InputBinding[] { return this.bindingMap; }
  setBindings(bindings: readonly InputBinding[]): void {
    this.bindingMap = bindings.map(binding => ({ ...binding }));
  }
  setPointerAim(point: Point, targetId: string | null): void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    this.pointerWorld = { ...point };
    this.pointerEnemy = targetId;
  }
  pointerPosition(): Point | null {
    return this.pointerWorld ? { ...this.pointerWorld } : null;
  }
  skillAim(slot: SkillSlot): SkillAim | null {
    const state = this.snapshot();
    const skill = SKILLS[state.classId][slot];
    const mode = skill.aimMode ?? (skill.target === 'self' ? 'SELF' : 'TARGET_ENTITY');
    const target = this.pointerEnemy && state.enemies.some(unit =>
      unit.actor.id === this.pointerEnemy && unit.actor.alive)
      ? this.pointerEnemy : state.selectedTargetId ?? state.enemy.id;
    return resolveSkillAim(mode, state.player, this.pointerWorld, target);
  }

  snapshot(): GameSnapshot { return this.simulation.snapshot(); }
  character(): CharacterProgress { return this.simulation.character(); }
  previewEquipment(index: number, slot?: EquipmentSlot): ReturnType<GameSimulation['previewEquipment']> {
    return this.simulation.previewEquipment(index, slot);
  }
  restoreCharacter(progress: CharacterProgress): boolean {
    this.pointerWorld = null;
    this.pointerEnemy = null;
    const restored = this.simulation.restoreCharacter(progress, newSessionSeed());
    if (restored) this.emit();
    return restored;
  }

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
    if (command.type === 'reset') { this.pointerWorld = null; this.pointerEnemy = null; }
    this.simulation.command(command.type === 'reset'
      ? { ...command, seed: command.seed ?? newSessionSeed() }
      : command);
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
