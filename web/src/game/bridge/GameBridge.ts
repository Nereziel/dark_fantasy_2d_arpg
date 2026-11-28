import { GameSimulation } from '../core/GameSimulation';
import { isCharacterId } from '../creation/characterCreation';
import type { ClassId } from '../data/classes';
import type { EquipmentSlot, GroundItem } from '../data/items';
import { DEFAULT_GROUND_LOOT_FILTER, filterVisibleGroundLoot, normalizeGroundLootFilter,
  type GroundLootFilter } from '../items/groundLootVisibility';
import { newSessionSeed } from '../world/generator';
import { resolveSkillAim, type SkillAim } from '../input/skillAiming';
import { GAME_BINDINGS } from '../input/gameBindings';
import type { InputBinding } from '../input/bindings';
import { SKILLS, type SkillSlot } from '../skills/skills';
import type { CharacterProgress, GameCommand, GameEvent, GameSnapshot, GameStateReader, Point, WorldSessionProgress } from '../core/types';
import type { MapProjection, MapProjectionOptions } from '../world/mapDiscovery';

/** UI-facing presentation adapter; game state is owned by the simulation. */
export class GameBridge implements GameStateReader {
  private simulation = new GameSimulation();
  private readonly liveCharacters=new Map<string,GameSimulation>();
  constructor(private readonly sessions:{finitePopulation?:boolean;nextSeed?:()=>number;nextSessionId?:()=>string}={}) {}

  private freshLiveWorld():GameSimulation|null {
    const seed=(this.sessions.nextSeed??newSessionSeed)();
    if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)return null;
    return new GameSimulation(seed);
  }
  private selectLiveWorld(id:string,simulation:GameSimulation):boolean {
    this.liveCharacters.set(id,simulation);
    this.simulation=simulation;
    this.pointerWorld=null;this.pointerEnemy=null;
    this.notificationClock=0;
    simulation.command({type:'pause',value:false});
    this.emit();return true;
  }
  private prepareFiniteWorld(simulation:GameSimulation):boolean {
    return !this.sessions.finitePopulation||simulation.startFinitePopulation(
      (this.sessions.nextSessionId??(()=>crypto.randomUUID()))());
  }
  /** New named hero, new instance. Existing live heroes remain frozen. */
  createLiveCharacter(classId:ClassId,id:string):boolean {
    if(!isCharacterId(id)||this.liveCharacters.has(id))return false;
    const simulation=this.freshLiveWorld();
    if(!simulation)return false;
    simulation.command({type:'createCharacter',classId,characterId:id,seed:simulation.snapshot().worldSeed});
    if(simulation.character().characterId!==id||simulation.character().classId!==classId
      ||!this.prepareFiniteWorld(simulation))return false;
    return this.selectLiveWorld(id,simulation);
  }
  /** Resume only this application's live instance. Disk progress is character
   * data, never authority for the seed of a newly launched world. */
  openLiveCharacter(progress:CharacterProgress):boolean {
    const id=progress?.characterId??'hero';
    if(!progress||!isCharacterId(id))return false;
    const live=this.liveCharacters.get(id);
    if(live)return live.character().classId===progress.classId&&this.selectLiveWorld(id,live);
    const simulation=this.freshLiveWorld();
    if(!simulation||!simulation.restoreCharacter(progress,simulation.snapshot().worldSeed)
      ||!this.prepareFiniteWorld(simulation))return false;
    return this.selectLiveWorld(id,simulation);
  }
  forgetLiveCharacter(id:string):void {this.liveCharacters.delete(id);}
  private readonly listeners = new Set<(state: GameSnapshot) => void>();
  private readonly events = new Set<(event: GameEvent) => void>();
  private notificationClock = 0;
  private pointerWorld: Point | null = null;
  private pointerEnemy: string | null = null;
  private bindingMap: readonly InputBinding[] = GAME_BINDINGS;
  /** Local presentation preference, deliberately excluded from character/world saves. */
  private groundFilter: GroundLootFilter = { ...DEFAULT_GROUND_LOOT_FILTER };

  groundLootFilter(): GroundLootFilter { return { ...this.groundFilter }; }
  setGroundLootFilter(input: unknown): void {
    this.groundFilter = normalizeGroundLootFilter(input);
  }
  visibleGroundLoot(state: Pick<GameSnapshot, 'groundLoot' | 'itemFlags'>): GroundItem[] {
    return filterVisibleGroundLoot(state.groundLoot, state.itemFlags ?? {}, this.groundFilter);
  }
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
  worldProgress(): WorldSessionProgress | null { return this.simulation.worldProgress(); }
  mapProjection(mode: 'world' | 'minimap' = 'world',
    options: Pick<MapProjectionOptions, 'zoom' | 'center' | 'trackedQuestId'> = {}): MapProjection | null {
    return this.simulation.mapProjection(mode, options);
  }
  restoreWorldProgress(progress: WorldSessionProgress): boolean {
    const restored = this.simulation.restoreWorldProgress(progress);
    if (restored) this.emit();
    return restored;
  }
  previewEquipment(index: number, slot?: EquipmentSlot): ReturnType<GameSimulation['previewEquipment']> {
    return this.simulation.previewEquipment(index, slot);
  }
  /** Read-only default equipment slot used by both the inspector and equip. */
  equipmentTargetSlot(index: number): ReturnType<GameSimulation['equipmentTargetSlot']> {
    return this.simulation.equipmentTargetSlot(index);
  }
  /** Read-only reason from the same planner as the actual equip command. */
  equipmentPlacementError(index: number, slot?: EquipmentSlot):
    ReturnType<GameSimulation['equipmentPlacementError']> {
    return this.simulation.equipmentPlacementError(index, slot);
  }
  /** Read-only reason for the first free bag cell or one exact drag target. */
  equipmentRemovalError(slot: EquipmentSlot, destinationIndex?: number):
    ReturnType<GameSimulation['equipmentRemovalError']> {
    return this.simulation.equipmentRemovalError(slot, destinationIndex);
  }
  restoreCharacter(progress: CharacterProgress, worldSeed = newSessionSeed()): boolean {
    this.pointerWorld = null;
    this.pointerEnemy = null;
    const restored = this.simulation.restoreCharacter(progress, worldSeed);
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
    if (command.type === 'reset' || command.type === 'createCharacter'
      || command.type === 'respawn' || command.type === 'travelWaypoint') {
      this.pointerWorld = null;
      this.pointerEnemy = null;
    }
    this.simulation.command(command.type === 'reset' || command.type === 'createCharacter'
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
