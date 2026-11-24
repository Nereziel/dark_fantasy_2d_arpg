// GPL-3.0-only — opt-in engineering preview, not the production renderer.
import Phaser from 'phaser';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';
import type { GameBridge } from '../bridge/GameBridge';
import type { GameSnapshot, Point, ZoneId } from '../core/types';
import { CLASSES } from '../data/classes';
import { ENEMY_DEFINITIONS } from '../enemies/enemies';
import { CRYPT_GATE, CRYPT_EXIT } from '../world/generator';
import { buildWilderness } from '../world/wildernessRuntime';
import { buildCryptWorld } from '../world/dungeonRuntime';
import { DUNGEON_TILE_SIZE } from '../world/proceduralDungeon';
import { getTownManifest, townEntry } from '../world/townManifest';
import type { EnvironmentObjectId } from '../world/environmentInteractions';
import { ACTOR_RADIUS, WORLD_WIDTH, WORLD_HEIGHT, canOccupy, type Obstacle } from '../world/navigation';
import { contextToCommand, cursorForContext } from '../input/contextResolver';
import { resolvePointerAction } from '../input/bindings';
import { dispatchCombatAction } from '../input/combatActionDispatcher';
import { HeldPointerMovement } from '../input/heldMovement';
import { projectIsometric, isometricFootprint, isometricBounds, isometricDepth } from './isometricProjection';
import { pickIsometricPointer, type IsometricTarget } from './isometricPicking';

const ORIGIN = { x: WORLD_HEIGHT, y: 100 };
const project = (p: Readonly<Point>, z = 0) => projectIsometric(p, z, ORIGIN);
const PALETTE: Record<string, number> = {
  town_clearing: 0x454b3d, dark_grass: 0x293c31, dead_leaves: 0x484432,
  corrupted_soil: 0x47333b, broken_stone: 0x48494b, dirt_road: 0x655542
};

export class IsometricPreviewScene extends Phaser.Scene {
  private floor!: Phaser.GameObjects.Graphics;
  private anchor!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;
  private readonly walls: Phaser.GameObjects.Graphics[] = [];
  private readonly actors = new Map<string, Phaser.GameObjects.Graphics>();
  private obstacles: readonly Obstacle[] = [];
  private seed: number | undefined;
  private zone: ZoneId | undefined;
  private readonly held = new HeldPointerMovement();

  constructor(private readonly bridge: GameBridge) { super({ key: 'IsometricPreview' }); }

  create(): void {
    this.floor = this.add.graphics().setDepth(-100);
    const state = this.bridge.snapshot();
    this.rebuild(state);
    const p = project(state.player);
    this.anchor = this.add.graphics().setPosition(p.x, p.y).setVisible(false);
    const bounds = isometricBounds(WORLD_WIDTH, WORLD_HEIGHT, 90, 40, ORIGIN);
    this.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height)
      .setZoom(1).centerOn(p.x, p.y).startFollow(this.anchor, true, 0.12, 0.12);
    this.label = this.add.text(12, 12, '', { fontSize: '13px', color: '#f0dbab',
      backgroundColor: '#141a20', padding: { x: 6, y: 4 } })
      .setScrollFactor(0).setDepth(10000);
    this.game.canvas.dataset.renderer = 'isometric-preview';
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', this.click, this);
    this.input.on('pointermove', this.hover, this);
    this.input.on('pointerup', this.release, this);
    this.input.on('gameout', this.release, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.click, this);
      this.input.off('pointermove', this.hover, this);
      this.input.off('pointerup', this.release, this);
      this.input.off('gameout', this.release, this);
      this.release();
      this.actors.clear();
      this.walls.length = 0;
      if (this.game.canvas) {
        delete this.game.canvas.dataset.renderer;
        this.game.canvas.style.cursor = 'default';
      }
    });
  }

  private polygon(g: Phaser.GameObjects.Graphics, points: readonly Point[], color: number): void {
    g.fillStyle(color).fillPoints([...points], true);
  }

  private rebuild(state: GameSnapshot): void {
    this.seed = state.worldSeed;
    this.zone = state.zone;
    this.floor.clear();
    for (const wall of this.walls) wall.destroy();
    this.walls.length = 0;
    for (const actor of this.actors.values()) actor.destroy();
    this.actors.clear();
    if (state.zone === 'wilderness') {
      const world = buildWilderness(state.worldSeed);
      this.obstacles = world.layout.obstacles;
      for (const tile of world.terrain.tiles) {
        this.polygon(this.floor, isometricFootprint(tile, 0, ORIGIN), PALETTE[tile.terrainId] ?? 0x303a30);
      }
      for (const road of world.terrain.roads) {
        for (let i = 1; i < road.points.length; i++) {
          const a = road.points[i - 1]!, b = road.points[i]!;
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          if (!length) continue;
          const nx = -(b.y - a.y) / length * road.width / 2;
          const ny = (b.x - a.x) / length * road.width / 2;
          this.polygon(this.floor, [
            project({ x: a.x + nx, y: a.y + ny }), project({ x: b.x + nx, y: b.y + ny }),
            project({ x: b.x - nx, y: b.y - ny }), project({ x: a.x - nx, y: a.y - ny })
          ], 0x736044);
        }
      }
    } else {
      const world = buildCryptWorld(state.worldSeed);
      this.obstacles = world.layout.obstacles;
      for (const tile of world.dungeon.tiles) {
        this.polygon(this.floor, isometricFootprint({ ...tile, width: DUNGEON_TILE_SIZE,
          height: DUNGEON_TILE_SIZE }, 0, ORIGIN), tile.kind === 'floor' ? 0x44434a : 0x191b24);
      }
    }
    // The exact collision footprint becomes a simple raised prism. Split into
    // bounded sections so a long wall doesn't get one global painter depth.
    for (const wall of this.obstacles) {
      for (let dy = 0; dy < wall.height; dy += 80) for (let dx = 0; dx < wall.width; dx += 80) {
        const rect = { x: wall.x + dx, y: wall.y + dy,
          width: Math.min(80, wall.width - dx), height: Math.min(80, wall.height - dy) };
        const ground = isometricFootprint(rect, 0, ORIGIN);
        const top = isometricFootprint(rect, state.zone === 'crypt' ? 44 : 32, ORIGIN);
        const g = this.add.graphics().setDepth(isometricDepth({
          x: rect.x + rect.width, y: rect.y + rect.height }));
        this.polygon(g, [ground[1]!, ground[2]!, top[2]!, top[1]!], 0x383839);
        this.polygon(g, [ground[2]!, ground[3]!, top[3]!, top[2]!], 0x474744);
        this.polygon(g, top, 0x66645b);
        this.walls.push(g);
      }
    }
  }

  private targets(state: GameSnapshot): IsometricTarget[] {
    const ground = { bodyHeight: 0, bodyHalfWidth: 0 };
    const actor = { bodyHeight: 42, bodyHalfWidth: 18 };
    const targets: IsometricTarget[] = [
      { kind: 'INTERACTABLE', id: 'crypt-portal',
        position: state.zone === 'wilderness' ? CRYPT_GATE : CRYPT_EXIT, hitRadius: 64, ...ground },
      ...(state.cryptInteractables ?? []).map(p => ({ kind: 'INTERACTABLE' as const,
        id: p.id, position: p.position, hitRadius: p.hitRadius, ...ground })),
      ...(state.environmentObjects ?? []).map(p => ({ kind: 'INTERACTABLE' as const,
        id: p.id, position: p.position, hitRadius: p.hitRadius, ...ground })),
      ...state.interactables.map(p => ({ kind: 'INTERACTABLE' as const,
        id: p.id, position: p.position, hitRadius: p.hitRadius, ...ground })),
      ...this.bridge.visibleGroundLoot(state).map(p => ({ kind: 'LOOT' as const,
        id: p.id, position: { x: p.x, y: p.y }, hitRadius: 30, ...ground })),
      ...state.enemies.map(({ actor: e }) => ({ kind: 'ENEMY' as const, id: e.id,
        position: { x: e.x, y: e.y }, hitRadius: e.type === 'crypt_lord' ? 58 : 43,
        alive: e.alive, ...actor }))
    ];
    if (state.zone === 'wilderness') for (const npc of getTownManifest()) {
      targets.push({ kind: 'NPC', id: npc.id, position: npc.position,
        hitRadius: Math.max(24, npc.collisionRadius + 12), ...actor });
    }
    return targets;
  }

  private captured(): boolean {
    return this.bridge.snapshot().paused || !!document.querySelector(
      '.inventory-overlay, .character-sheet-backdrop, .npc-dialog-shield, .trade-overlay, .modal-shield');
  }

  private pick(pointer: Phaser.Input.Pointer) {
    return pickIsometricPointer({
      projected: this.cameras.main.getWorldPoint(pointer.x, pointer.y), origin: ORIGIN,
      uiCaptured: this.captured(), targets: this.targets(this.bridge.snapshot()),
      canWalk: point => canOccupy(point, ACTOR_RADIUS, this.obstacles)
    });
  }

  private release(): void { this.held.release(); }

  private hover(pointer: Phaser.Input.Pointer): void {
    const { context, ground, aim } = this.pick(pointer);
    this.bridge.setPointerAim(aim, context.kind === 'ENEMY' ? context.id : null);
    const cursors = { move: 'crosshair', hostile: 'crosshair', talk: 'pointer', loot: 'grab',
      interact: 'pointer', blocked: 'not-allowed', ui: 'default' } as const;
    this.game.canvas.style.cursor = cursors[cursorForContext(context)];
    if (!pointer.isDown || this.captured() || !this.bridge.snapshot().player.alive) {
      this.release(); return;
    }
    const destination = this.held.update(ground, this.time.now);
    if (destination) this.bridge.command({ type: 'move', destination });
  }

  private click(pointer: Phaser.Input.Pointer): void {
    const action = resolvePointerAction({ button: pointer.button, uiCaptured: this.captured() },
      this.bridge.bindings());
    if (!action) return;
    const { context, ground, aim } = this.pick(pointer);
    this.bridge.setPointerAim(aim, context.kind === 'ENEMY' ? context.id : null);
    if (dispatchCombatAction(this.bridge, action, context.kind === 'ENEMY' ? context.id : undefined)) return;
    if (action !== 'PRIMARY' && action !== 'FORCE_MOVE') return;
    if (action === 'FORCE_MOVE' || context.kind === 'GROUND' || context.kind === 'INVALID') {
      this.held.begin(ground, this.time.now);
      this.bridge.command({ type: 'move', destination: ground });
      return;
    }
    this.release();
    if (context.kind === 'NPC' && townEntry(context.id)?.capability !== 'existing') {
      this.bridge.command({ type: 'interactTown', entryId: context.id });
    } else if (context.kind === 'INTERACTABLE' && context.id.startsWith('env.')) {
      this.bridge.command({ type: 'interactEnvironment', id: context.id as EnvironmentObjectId });
    } else if (context.kind === 'INTERACTABLE' && context.id.startsWith('crypt/')) {
      this.bridge.command({ type: 'interactCrypt', id: context.id });
    } else {
      const command = contextToCommand(context);
      if (command) this.bridge.command(command);
    }
  }

  private entity(key: string, point: Readonly<Point>, color: number, upright: boolean): void {
    let g = this.actors.get(key);
    if (!g) {
      g = this.add.graphics();
      this.actors.set(key, g);
    }
    const p = project(point);
    g.clear().setPosition(p.x, p.y).setDepth(isometricDepth(point) + 0.5);
    g.fillStyle(0x0a1011, 0.55).fillEllipse(0, 0, upright ? 38 : 24, 12);
    if (upright) {
      g.fillStyle(color).fillRoundedRect(-12, -32, 24, 30, 4);
      g.fillStyle(0xd4bea2).fillCircle(0, -36, 8);
    } else {
      g.fillStyle(color).fillPoints([{ x: -12, y: 0 }, { x: 0, y: -9 },
        { x: 12, y: 0 }, { x: 0, y: 9 }], true);
    }
  }

  update(_time: number, delta: number): void {
    this.bridge.tick(delta);
    const state = this.bridge.snapshot();
    if (state.worldSeed !== this.seed || state.zone !== this.zone) {
      this.release();
      this.rebuild(state);
      const p = project(state.player);
      this.cameras.main.centerOn(p.x, p.y);
    }
    if (this.held.active && this.input.activePointer.isDown && state.player.alive) {
      this.hover(this.input.activePointer);
    }
    else if (this.held.active) this.release();
    const hero = project(state.player);
    this.anchor.setPosition(hero.x, hero.y);
    const visible = new Set<string>(['hero']);
    this.entity('hero', state.player, CLASSES[state.classId].color, true);
    this.actors.get('hero')?.setVisible(state.player.alive);
    const enemies = new Map(state.enemies.map(({ actor }) => [actor.id, actor]));
    for (const t of this.targets(state)) {
      if (t.alive === false) continue;
      const key = t.kind + '/' + t.id;
      visible.add(key);
      const enemy = enemies.get(t.id);
      const color = t.kind === 'ENEMY' && enemy ? ENEMY_DEFINITIONS[enemy.type].color
        : t.kind === 'NPC' ? 0xb0986c : t.kind === 'LOOT' ? 0xe2bf67 : 0x8d83bd;
      this.entity(key, t.position, color, t.bodyHeight > 0);
    }
    for (const [key, g] of this.actors) {
      if (!visible.has(key)) { g.destroy(); this.actors.delete(key); }
    }
    this.label.setText(get(locale) === 'cs'
      ? '2,5D – vývojový náhled' : '2.5D – development preview');
  }
}
