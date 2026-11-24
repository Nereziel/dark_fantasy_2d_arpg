// GPL-3.0-only — opt-in engineering preview, not the production renderer.
import Phaser from 'phaser';
import { get } from 'svelte/store';
import { _ as translate, locale } from 'svelte-i18n';
import type { GameBridge } from '../bridge/GameBridge';
import type { GameEvent, GameSnapshot, Point, ZoneId } from '../core/types';
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
import { createIsometricPrism, type IsometricOccluder } from './isometricOcclusion';
import { heroCutaway } from './isometricCutaway';
import { activeFacingAim, directionalPixelView, resolveActorFacing, type DirectionalPixelView } from './isometricActorFacing';
import type { IsometricFacing } from './isometricProjection';
import { playerAnimation } from '../entities/playerAnimation';
import { projectCombatCircle, projectCombatCone, combatHealthBar } from './isometricCombat';
import { classGroundEffects, summonPresentation } from './isometricClassEffects';
import { planIsometricImpact } from './isometricImpactFeedback';
import { getVisualPreferences, shouldReduceMotion } from '../ui/visualPreferences';
import {
  PIXEL_ANIMATIONS, PIXEL_ANIMATION_FRAMES, PIXEL_FRAME_WIDTH, PIXEL_FRAME_HEIGHT,
  directionalPixelAtlasKey, pixelFrame, pixelTimelineFrame, renderPixelAtlas,
  type PixelActor, type PixelAnimation
} from './pixelSpriteAtlas';

const ORIGIN = { x: WORLD_HEIGHT, y: 100 };
const project = (p: Readonly<Point>, z = 0) => projectIsometric(p, z, ORIGIN);
const PALETTE: Record<string, number> = {
  town_clearing: 0x454b3d, dark_grass: 0x293c31, dead_leaves: 0x484432,
  corrupted_soil: 0x47333b, broken_stone: 0x48494b, dirt_road: 0x655542
};

type ImpactVisual = {
  object: Phaser.GameObjects.Graphics | Phaser.GameObjects.Text;
  position: Readonly<Point>; started: number; duration: number; rise: number;
};
const MAX_IMPACT_VISUALS = 64;

export class IsometricPreviewScene extends Phaser.Scene {
  private readonly impacts: ImpactVisual[] = [];
  private floor!: Phaser.GameObjects.Graphics;
  private warnings!: Phaser.GameObjects.Graphics;
  private missiles!: Phaser.GameObjects.Graphics;
  private healthBars!: Phaser.GameObjects.Graphics;
  private anchor!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;
  private readonly walls: Phaser.GameObjects.Graphics[] = [];
  private readonly occluders: IsometricOccluder[] = [];
  private opaqueOccluders: readonly IsometricOccluder[] = [];
  private lastCutawayHero: Point | undefined;
  private readonly actors = new Map<string, Phaser.GameObjects.Graphics>();
  private readonly sprites = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly lastEnemyPositions = new Map<string, Point>();
  private readonly facingMemory = new Map<string, { point: Point; facing: IsometricFacing }>();
  private obstacles: readonly Obstacle[] = [];
  private seed: number | undefined;
  private zone: ZoneId | undefined;
  private readonly held = new HeldPointerMovement();

  constructor(private readonly bridge: GameBridge) { super({ key: 'IsometricPreview' }); }

  create(): void {
    this.floor = this.add.graphics().setDepth(-100);
    this.warnings = this.add.graphics().setDepth(-90);
    this.missiles = this.add.graphics().setDepth(9000);
    this.healthBars = this.add.graphics().setDepth(9100);
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
    const unsubscribe = this.bridge.onEvent(event => this.onImpactEvent(event));
    const onDestroy = () => { unsubscribe(); this.impacts.length = 0; };
    this.events.once(Phaser.Scenes.Events.DESTROY, onDestroy);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe();
      this.events.off(Phaser.Scenes.Events.DESTROY, onDestroy);
      this.clearImpacts();
      this.input.off('pointerdown', this.click, this);
      this.input.off('pointermove', this.hover, this);
      this.input.off('pointerup', this.release, this);
      this.input.off('gameout', this.release, this);
      this.release();
      this.actors.clear();
      this.sprites.clear();
      this.lastEnemyPositions.clear();
      this.facingMemory.clear();
      this.walls.length = 0;
      this.occluders.length = 0;
      this.opaqueOccluders = [];
      this.lastCutawayHero = undefined;
      if (this.game.canvas) {
        delete this.game.canvas.dataset.renderer;
        this.game.canvas.style.cursor = 'default';
      }
    });
  }

  private polygon(g: Phaser.GameObjects.Graphics, points: readonly Point[], color: number): void {
    g.fillStyle(color).fillPoints(points.map(p => new Phaser.Math.Vector2(p.x, p.y)), true);
  }

  private rebuild(state: GameSnapshot): void {
    this.seed = state.worldSeed;
    this.zone = state.zone;
    this.floor.clear();
    this.clearImpacts();
    for (const wall of this.walls) wall.destroy();
    this.walls.length = 0;
    this.occluders.length = 0;
    this.opaqueOccluders = [];
    this.lastCutawayHero = undefined;
    for (const actor of this.actors.values()) actor.destroy();
    this.actors.clear();
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.lastEnemyPositions.clear();
    this.facingMemory.clear();
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
        const prism = createIsometricPrism(rect, state.zone === 'crypt' ? 44 : 32, ORIGIN);
        const g = this.add.graphics().setDepth(prism.depth);
        this.polygon(g, prism.faces[0]!, 0x383839);
        this.polygon(g, prism.faces[1]!, 0x474744);
        this.polygon(g, prism.faces[2]!, 0x66645b);
        this.walls.push(g);
        this.occluders.push(prism);
      }
    }
    this.updateCutaway(state.player);
  }

  private updateCutaway(hero: Readonly<Point>): void {
    if (this.lastCutawayHero?.x === hero.x && this.lastCutawayHero.y === hero.y) return;
    const result = heroCutaway(hero, ORIGIN, this.occluders);
    this.lastCutawayHero = { x: hero.x, y: hero.y };
    this.opaqueOccluders = result.opaque;
    this.walls.forEach((wall, i) => {
      const alpha = result.alphas[i]!;
      if (wall.alpha !== alpha) wall.setAlpha(alpha);
    });
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
        alive: e.alive, bodyHeight: 50, bodyHalfWidth: 24 }))
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
      occluders: this.opaqueOccluders,
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
      this.polygon(g, [{ x: -12, y: 0 }, { x: 0, y: -9 },
        { x: 12, y: 0 }, { x: 0, y: 9 }], color);
    }
  }

  private ensureAtlas(actor: PixelActor, view: DirectionalPixelView): string {
    const key = directionalPixelAtlasKey(actor, view);
    if (this.textures.exists(key)) return key;
    const texture = this.textures.addCanvas(key, renderPixelAtlas(actor, view));
    if (!texture) throw new Error('Unable to register pixel atlas: ' + key);
    PIXEL_ANIMATIONS.forEach((animation, row) => {
      for (let frame = 0; frame < PIXEL_ANIMATION_FRAMES; frame++) {
        texture.add(pixelFrame(animation, frame), 0,
          frame * PIXEL_FRAME_WIDTH, row * PIXEL_FRAME_HEIGHT,
          PIXEL_FRAME_WIDTH, PIXEL_FRAME_HEIGHT);
      }
    });
    return key;
  }

  private sprite(key: string, actor: PixelActor, point: Readonly<Point>,
    pose: PixelAnimation, frame: number, aim?: Readonly<Point>): void {
    const memory = this.facingMemory.get(key);
    const facing = resolveActorFacing({ position: point, previous: memory?.point, last: memory?.facing, aim });
    this.facingMemory.set(key, { point: { x: point.x, y: point.y }, facing });
    const { view, flipX } = directionalPixelView(facing);
    const texture = this.ensureAtlas(actor, view);
    let sprite = this.sprites.get(key);
    if (!sprite) {
      sprite = this.add.sprite(0, 0, texture, pixelFrame(pose, frame)).setOrigin(0.5, 0.9);
      this.sprites.set(key, sprite);
    } else if (sprite.texture.key !== texture) sprite.setTexture(texture);
    sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const p = project(point);
    sprite.setPosition(p.x, p.y).setDepth(isometricDepth(point) + 0.5)
      .setFlipX(flipX).setFrame(pixelFrame(pose, frame)).setVisible(true);
  }

  private combatArea(points: readonly Point[], color: number, alpha: number): void {
    const vertices = points.map(p => new Phaser.Math.Vector2(p.x, p.y));
    this.warnings.fillStyle(color, alpha).fillPoints(vertices, true);
    this.warnings.lineStyle(3, color, 0.95).strokePoints(vertices, true);
  }

  private renderCombat(state: GameSnapshot): void {
    this.warnings.clear();
    this.missiles.clear();
    this.healthBars.clear();
    const effectStyles = {
      frost: [0x7fd6f4, 0.18], fire: [0xe89a56, 0.2],
      'trap-range': [0x81c58a, 0.04], trap: [0xc2ef9b, 0.22],
      corpse: [0x81c1a4, 0.2]
    } as const;
    for (const effect of classGroundEffects(state, ORIGIN)) {
      const [color, alpha] = effectStyles[effect.kind];
      this.combatArea(effect.points, color, alpha);
    }
    for (const unit of state.enemies) {
      if (!unit.actor.alive) continue;
      if (unit.intent && unit.intent.radius > 0) {
        const intent = unit.intent;
        const progress = Math.max(0, Math.min(1, 1 - intent.remaining / Math.max(0.01, intent.total)));
        this.combatArea(projectCombatCircle(intent, intent.radius, ORIGIN),
          0xe96569, 0.12 + progress * 0.24);
      }
      const bar = combatHealthBar(unit.actor, unit.actor.health, unit.actor.maxHealth, ORIGIN);
      this.healthBars.fillStyle(0x080a10, 0.9).fillRect(bar.x, bar.y, bar.width, bar.height);
      this.healthBars.fillStyle(unit.elite ? 0xd2ab64 : 0xa3494c)
        .fillRect(bar.x + 2, bar.y + 2, (bar.width - 4) * bar.fraction, bar.height - 4);
      if (state.selectedTargetId === unit.actor.id) {
        const outline = projectCombatCircle(unit.actor, ACTOR_RADIUS + 10, ORIGIN);
        this.warnings.lineStyle(2, 0xf0c783, 0.95)
          .strokePoints(outline.map(p => new Phaser.Math.Vector2(p.x, p.y)), true);
      }
    }
    const king = state.zone === 'crypt' ? state.hollowKing : undefined;
    if (king?.warning) {
      const warning = king.warning;
      const g = warning.geometry;
      const points = g.shape === 'circle'
        ? projectCombatCircle(g.position, g.radius, ORIGIN)
        : projectCombatCone(g.position, g.radius, g.angleRadians, g.arcDegrees, ORIGIN);
      const progress = Math.max(0, Math.min(1,
        1 - warning.remainingSeconds / Math.max(0.01, warning.windupSeconds)));
      this.combatArea(points, 0xffb18d, 0.12 + 0.32 * progress);
    }
    for (const hazard of king?.hazards ?? []) {
      this.combatArea(projectCombatCircle(hazard.position, hazard.radius, ORIGIN),
        hazard.type === 'rune_storm' ? 0xb085ea : 0x8cc8a3, 0.24);
    }
    for (const missile of state.projectiles) {
      const p = project(missile, 14);
      const color = missile.type === 'shadow' ? 0xa78bcd
        : missile.type === 'frost' ? 0x7fd6f4 : missile.type === 'poison' ? 0x80d48a
        : missile.type === 'holy' ? 0xf2d887 : 0xe8a25f;
      this.missiles.fillStyle(color, 0.25).fillCircle(p.x, p.y, 12);
      this.missiles.fillStyle(color, 0.95).fillCircle(p.x, p.y, 5);
    }
  }

  private clearImpacts(): void {
    for (const impact of this.impacts) impact.object.destroy();
    this.impacts.length = 0;
  }

  private onImpactEvent(event: GameEvent): void {
    if (event.type === 'zoneChanged' || event.type === 'playerRespawn' || event.type === 'waypointTravel') {
      this.clearImpacts();
      return;
    }
    if (event.type !== 'damageResolved') return;
    const state = this.bridge.snapshot();
    if (state.zone !== this.zone || state.worldSeed !== this.seed) return;
    const target = event.targetId === 'hero' ? state.player
      : state.enemies.find(unit => unit.actor.id === event.targetId)?.actor
        ?? state.summons?.find(summon => summon.id === event.targetId);
    if (!target) return;
    const settings = getVisualPreferences();
    const reducedMotion = shouldReduceMotion(settings,
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const cues = planIsometricImpact(event, target, ORIGIN, {
      floatingCombatText: settings.floatingCombatText, reducedMotion
    });
    for (const cue of cues) {
      let object: ImpactVisual['object'];
      let rise = 0;
      if (cue.type === 'floatText') {
        const text = cue.content.kind === 'damage' ? '-' + cue.content.amount
          : get(translate)(cue.content.key);
        object = this.add.text(cue.position.x, cue.position.y, text, {
          fontFamily: 'Georgia, serif', fontSize: cue.emphasis === 'critical' ? '21px' : '17px',
          color: event.targetId === 'hero' ? '#ff8d8d'
            : cue.emphasis === 'critical' ? '#ffe2a0' : '#f6d29a',
          stroke: '#070b11', strokeThickness: 3
        }).setOrigin(0.5).setDepth(9200);
        rise = cue.rise;
      } else {
        const g = this.add.graphics().setPosition(cue.position.x, cue.position.y)
          .setDepth(isometricDepth(target) + 0.75);
        if (cue.type === 'impactFlash') {
          const color = cue.tone === 'critical' ? 0xffedaa
            : cue.tone === 'blocked' ? 0x9fbde5 : 0xf1b88b;
          g.lineStyle(3, color, 0.9).strokeCircle(0, 0, 13);
        } else {
          const count = Math.min(32, cue.count);
          for (let n = 0; n < count; n++) {
            const angle = n * 2 * Math.PI / count;
            const radius = 10 + n % 5 * 4;
            g.fillStyle(0xf1b88b, 0.7)
              .fillCircle(Math.cos(angle) * radius, Math.sin(angle) * radius, 2);
          }
        }
        object = g;
      }
      if (this.impacts.length >= MAX_IMPACT_VISUALS) this.impacts.shift()?.object.destroy();
      this.impacts.push({ object, position: cue.position, started: this.time.now,
        duration: cue.durationMs, rise });
    }
  }

  private updateImpacts(): void {
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const impact = this.impacts[i]!;
      const progress = Math.max(0, (this.time.now - impact.started) / impact.duration);
      if (progress >= 1) {
        impact.object.destroy();
        this.impacts.splice(i, 1);
      } else {
        impact.object.setPosition(impact.position.x, impact.position.y - impact.rise * progress)
          .setAlpha(1 - progress);
      }
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
    this.updateCutaway(state.player);
    if (this.held.active && this.input.activePointer.isDown && state.player.alive) {
      this.hover(this.input.activePointer);
    }
    else if (this.held.active) this.release();
    const hero = project(state.player);
    this.anchor.setPosition(hero.x, hero.y);
    const visible = new Set<string>(['hero']);
    const heroPose = playerAnimation(state);
    const pose: PixelAnimation = heroPose === 'running' ? 'run'
      : heroPose === 'attacking' ? 'attack' : heroPose === 'casting' ? 'cast'
      : heroPose === 'channeling' ? 'channel' : heroPose === 'evading' ? 'dodge'
      : heroPose === 'stunned' ? 'hit' : heroPose === 'dead' ? 'death' : 'idle';
    const timeline = state.warriorAction?.timeline ?? state.classAction?.timeline;
    const frame = !state.player.alive ? PIXEL_ANIMATION_FRAMES - 1
      : timeline && (pose === 'attack' || pose === 'cast' || pose === 'channel')
        ? pixelTimelineFrame(timeline)
        : Math.floor(this.time.now / (pose === 'run' ? 95 : 150)) % PIXEL_ANIMATION_FRAMES;
    const enemies = new Map(state.enemies.map(unit => [unit.actor.id, unit]));
    const liveEnemy = (id: string) => {
      const actor = enemies.get(id)?.actor;
      return actor?.alive ? actor : undefined;
    };
    const action = state.warriorAction ?? state.classAction;
    const combatPose = pose === 'attack' || pose === 'cast' || pose === 'channel';
    const aim = combatPose ? activeFacingAim(state.player, action?.aim,
      action ? action.targetId : state.selectedTargetId, liveEnemy) : undefined;
    this.sprite('hero', state.classId, state.player, pose, frame, aim);
    for (const t of this.targets(state)) {
      if (t.alive === false) continue;
      const key = t.kind + '/' + t.id;
      visible.add(key);
      const unit = enemies.get(t.id);
      if (t.kind === 'ENEMY' && unit) {
        const previous = this.lastEnemyPositions.get(t.id);
        const moving = previous && Math.hypot(previous.x - t.position.x, previous.y - t.position.y) > 0.3;
        const pose: PixelAnimation = unit.intent
          ? ENEMY_DEFINITIONS[unit.actor.type].attack === 'bolt' ? 'cast' : 'attack'
          : moving ? 'run' : 'idle';
        const frame = unit.intent
          ? Math.max(0, Math.min(3, Math.floor(4 * (unit.intent.total - unit.intent.remaining)
              / Math.max(1, unit.intent.total))))
          : Math.floor(this.time.now / (pose === 'run' ? 110 : 170)) % PIXEL_ANIMATION_FRAMES;
        this.sprite(key, unit.actor.type, t.position, pose, frame, unit.intent ?? undefined);
        this.lastEnemyPositions.set(t.id, { ...t.position });
      } else {
        const color = t.kind === 'NPC' ? 0xb0986c : t.kind === 'LOOT' ? 0xe2bf67 : 0x8d83bd;
        this.entity(key, t.position, color, t.bodyHeight > 0);
      }
    }
    // Friendly allies use the same depth/cleanup rules as the other actors.
    for (const summon of state.summons ?? []) {
      if (summon.zone !== state.zone || summon.remaining <= 0 || summon.health <= 0) continue;
      const key = 'summon/' + summon.id;
      visible.add(key);
      const style = summonPresentation(summon.kind, summon.remaining);
      const moving = summon.targetId !== null;
      this.sprite(key, style.actor, summon, moving ? 'run' : 'idle',
        Math.floor(this.time.now / (moving ? 110 : 170)) % PIXEL_ANIMATION_FRAMES,
        summon.targetId ? liveEnemy(summon.targetId) : undefined);
      this.sprites.get(key)?.setTint(style.tint).setAlpha(style.alpha);
    }
    for (const [key, g] of this.actors) {
      if (!visible.has(key)) { g.destroy(); this.actors.delete(key); }
    }
    for (const [key, sprite] of this.sprites) {
      if (!visible.has(key)) { sprite.destroy(); this.sprites.delete(key); this.facingMemory.delete(key); }
    }
    for (const id of this.lastEnemyPositions.keys()) {
      if (!visible.has('ENEMY/' + id)) this.lastEnemyPositions.delete(id);
    }
    this.renderCombat(state);
    this.updateImpacts();
    this.label.setText(get(locale) === 'cs'
      ? '2,5D – vývojový náhled' : '2.5D – development preview');
  }
}
