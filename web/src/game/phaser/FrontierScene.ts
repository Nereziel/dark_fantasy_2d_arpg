import Phaser from 'phaser';
import { get } from 'svelte/store';
import { _ as translate, locale } from 'svelte-i18n';
import { planCombatVfx } from './combatVfxPlan';
import { planCombatReadability, type CombatReadabilityInput } from './combatReadabilityPlan';
import { statusVisuals } from '../status/statusVisuals';
import type { StatusInstance } from '../status/statusRuntime';
import type { GameBridge } from '../bridge/GameBridge';
import { CLASSES } from '../data/classes';
import { RARITIES } from '../data/items';
import { itemDisplayName } from '../items/itemName';
import { SKILLS } from '../skills/skills';
import { getPaladinAbility } from '../skills/paladinKit';
import { getMageSpell } from '../skills/mageKit';
import { getNecroSpell } from '../skills/necromancerKit';
import { getRogueAbility } from '../skills/rogueKit';
import { getWarlockSpell } from '../skills/warlockKit';
import type { GameEvent, ZoneId, Point } from '../core/types';
import type { EnvironmentObjectId } from '../world/environmentInteractions';
import {
  resolvePointerContext, contextToCommand, cursorForContext,
  type ContextTarget, type ResolvedPointerContext
} from '../input/contextResolver';
import { resolvePointerAction } from '../input/bindings';
import { HeldPointerMovement } from '../input/heldMovement';
import { playerAnimation } from '../entities/playerAnimation';
import {
  PIXEL_ANIMATIONS, PIXEL_ANIMATION_FRAMES, PIXEL_FRAME_HEIGHT, PIXEL_FRAME_WIDTH,
  pixelAtlasKey, pixelFrame, pixelTimelineFrame, renderPixelAtlas, type PixelActor, type PixelAnimation
} from './pixelSpriteAtlas';
import { ACTOR_RADIUS, canOccupy, type Obstacle } from '../world/navigation';
import { ENEMY_DEFINITIONS, type EnemyType } from '../enemies/enemies';
import {
  CAMP_RADIUS, CRYPT_GATE, CRYPT_EXIT, CRYPT_BOSS_POSITIONS
} from '../world/generator';
import { buildWilderness } from '../world/wildernessRuntime';
import { buildCryptWorld } from '../world/dungeonRuntime';
import type { ProceduralDungeonResult, DungeonRoomType } from '../world/proceduralDungeon';
import type { CryptThemePlan } from '../world/cryptTheme';
import {
  createChunkIndex, planVisibleChunks,
  type ChunkIndex, type ChunkManifest
} from '../world/chunkStreaming';
import type { WildernessFeature } from '../world/wildernessFeatures';
import { ACT_I_MILESTONES } from '../quests/actIQuestChain';
import {
  WARDEN_POSITION, NPC_POSITIONS, MERCHANT_ID, BLACKSMITH_ID
} from '../world/npcs';
import { getTownManifest, townEntry } from '../world/townManifest';

const WIDTH = 2200;
const HEIGHT = 1400;

/**
 * Visual / pointer adapter only. All combat and navigation decisions are made
 * by the renderer-independent GameSimulation.
 */
export class FrontierScene extends Phaser.Scene {
  private readonly bridge: GameBridge;
  private hero!: Phaser.GameObjects.Graphics;
  private heroSprite!: Phaser.GameObjects.Sprite;
  private readonly enemySprites = new Map<string, Phaser.GameObjects.Sprite>();
  /** Friendly actors are never added to the hostile enemy roster. */
  private readonly summonSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private corpsesVisual!: Phaser.GameObjects.Graphics;
  private rogueTrapsVisual!: Phaser.GameObjects.Graphics;
  private readonly enemyPositions = new Map<string, Point>();
  private readonly enemyDeadUntil = new Map<string, number>();
  private heroDeadUntil = 0;
  private wardenMarker!: Phaser.GameObjects.Text;
  private readonly enemyGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  private readonly impactPool: Phaser.GameObjects.Graphics[] = [];
  private readonly enemyHitUntil = new Map<string, number>();
  private readonly enemyBlockUntil = new Map<string, number>();
  private heroHitUntil = 0;
  private heroBlockUntil = 0;
  private readonly campDecor: Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Text> = [];
  private healthBar!: Phaser.GameObjects.Graphics;
  private groundItems!: Phaser.GameObjects.Graphics;
  private readonly groundLabels = new Map<string, Phaser.GameObjects.Text>();
  private statusVisuals!: Phaser.GameObjects.Graphics;
  private telegraph!: Phaser.GameObjects.Graphics;
  private terrain!: Phaser.GameObjects.Graphics;
  private streamIndex: ChunkIndex | null = null;
  private readonly chunkGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  private activeChunkIds: string[] = [];
  private nextStreamUpdate = 0;
  private renderedSeed: number | null = null;
  private renderedZone: ZoneId | null = null;
  private activeObstacles: readonly Obstacle[] = [];
  private activeStoryFeatures: readonly WildernessFeature[] = [];
  private readonly heldMovement = new HeldPointerMovement();
  private hoveredId: string | null = null;
  private interactableVisuals!: Phaser.GameObjects.Graphics;
  private projectileVisuals!: Phaser.GameObjects.Graphics;
  private debugMarkers!: Phaser.GameObjects.Graphics;
  private readonly debugMovement = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('debug');

  constructor(bridge: GameBridge) {
    super({ key: 'Frontier' });
    this.bridge = bridge;
  }

  create(): void {
    const entry = this.bridge.snapshot();
    this.paintWorld(entry.worldSeed, entry.zone);

    // The warden is an in-world NPC. Interaction uses simulation commands.
    const warden = this.add.graphics().setPosition(WARDEN_POSITION.x, WARDEN_POSITION.y).setDepth(49);
    this.campDecor.push(warden);
    warden.fillStyle(0x080c11, 0.5).fillEllipse(0, 21, 46, 14);
    warden.fillStyle(0x4b3639).fillTriangle(-16, 19, 16, 19, 0, -18);
    warden.fillStyle(0x9e8570).fillRoundedRect(-11, -22, 22, 21, 4);
    warden.fillStyle(0xd3b798).fillCircle(0, -24, 11);
    warden.fillStyle(0x473939).fillTriangle(-13, -26, 13, -26, 0, -41);
    warden.lineStyle(4, 0xa6a3a0).lineBetween(14, 15, 23, -31);
    warden.fillStyle(0xe1ba75).fillCircle(23, -34, 5);
    this.wardenMarker = this.add.text(WARDEN_POSITION.x, WARDEN_POSITION.y - 66, '!', {
      fontFamily: 'Georgia, serif', fontSize: '24px', color: '#ffdc9b',
      stroke: '#131923', strokeThickness: 4
    }).setOrigin(0.5).setDepth(82);
    this.campDecor.push(this.wardenMarker);

    // Merchant and blacksmith use distinct silhouettes and world click targets.
    for (const id of [MERCHANT_ID, BLACKSMITH_ID] as const) {
      const pos = NPC_POSITIONS[id];
      const smith = id === BLACKSMITH_ID;
      const actor = this.add.graphics().setPosition(pos.x, pos.y).setDepth(49);
      this.campDecor.push(actor);
      actor.fillStyle(0x080c11, 0.65).fillEllipse(0, 21, 42, 11);
      actor.fillStyle(smith ? 0x39404b : 0x486052)
        .fillTriangle(-15, 18, 15, 18, 0, -19);
      actor.fillStyle(smith ? 0x817f83 : 0x9c846e).fillRoundedRect(-11, -21, 22, 20, 3);
      actor.fillStyle(0xd6b995).fillCircle(0, -26, 10);
      actor.fillStyle(smith ? 0x535962 : 0x5b3c2c)
        .fillTriangle(-13, -28, 13, -28, 0, -42);
      if (smith) {
        actor.lineStyle(5, 0xaaa9ad).lineBetween(19, 14, 25, -20);
        actor.fillStyle(0x737a85).fillRoundedRect(17, -31, 22, 14, 2);
      } else {
        actor.fillStyle(0xc2a36d).fillCircle(-16, -1, 8);
        actor.lineStyle(3, 0x735846).strokeCircle(-16, -1, 8);
      }
      const vendorMarker = this.add.text(pos.x, pos.y - 64, smith ? '⚒' : '¤', {
        fontFamily: 'Georgia, serif', fontSize: '23px',
        color: '#e8c58c', stroke: '#0c121b', strokeThickness: 4
      }).setOrigin(0.5).setDepth(82);
      this.campDecor.push(vendorMarker);
    }

    // Services and civilians share the seed-independent town manifest. Only the
    // three original NPCs have dedicated silhouettes; new entries are distinct.
    for (const entry of getTownManifest().filter(value => value.capability !== 'existing')) {
      const { x, y } = entry.position;
      const actor = this.add.graphics().setPosition(x, y).setDepth(49);
      const civilian = entry.role === 'civilian';
      const structure = entry.role === 'stash' || entry.role === 'waypoint';
      actor.fillStyle(0x0b121c, 0.6).fillEllipse(0, 16, 36, 11);
      actor.fillStyle(civilian ? 0x54616e : structure ? 0x6e596a : 0x546e65)
        .fillRoundedRect(-12, -19, 24, 35, 5);
      actor.fillStyle(structure ? 0xb6a47e : 0xe2c1a0).fillCircle(0, -22, 9);
      this.campDecor.push(actor);
      const symbol = entry.role === 'healer' ? '+' : entry.role === 'potionVendor' ? '✦'
        : entry.role === 'stash' ? '▣' : entry.role === 'waypoint' ? '◈' : '·';
      const marker = this.add.text(x, y - 55, symbol, {
        fontFamily: 'Georgia, serif', fontSize: '21px', color: civilian ? '#a9b4bd' : '#efd0a2',
        stroke: '#0a1420', strokeThickness: 4
      }).setOrigin(0.5).setDepth(82);
      this.campDecor.push(marker);
    }

    this.hero = this.add.graphics();
    this.hero.fillStyle(0x131f30).fillCircle(0, 3, 19);
    this.hero.fillStyle(0x8e9caa).fillCircle(0, -5, 13);
    this.hero.fillStyle(CLASSES[this.bridge.snapshot().classId].color).fillTriangle(-14, 8, 14, 8, 0, -26);
    this.hero.fillStyle(0xd7c3a0).fillCircle(0, -13, 5);
    this.hero.lineStyle(4, 0xb7a77a).lineBetween(14, 5, 25, -22);
    this.hero.setDepth(50).setVisible(false); // camera-follow anchor (gameplay lives in simulation)
    const heroKey = this.ensurePixelAtlas(entry.classId);
    this.heroSprite = this.add.sprite(entry.player.x, entry.player.y, heroKey,
      pixelFrame('idle', 0)).setOrigin(0.5, 0.9).setDepth(52);
    this.heroSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.healthBar = this.add.graphics().setDepth(60);
    this.corpsesVisual = this.add.graphics().setDepth(46);
    this.rogueTrapsVisual = this.add.graphics().setDepth(46);
    this.groundItems = this.add.graphics().setDepth(44);
    this.statusVisuals = this.add.graphics().setDepth(47);
    this.telegraph = this.add.graphics().setDepth(46);
    this.interactableVisuals = this.add.graphics().setDepth(43);
    this.projectileVisuals = this.add.graphics().setDepth(61);
    this.debugMarkers = this.add.graphics().setDepth(70);

    this.cameras.main.setBounds(0, 0, WIDTH, HEIGHT);
    this.cameras.main.setZoom(1);
    this.cameras.main.startFollow(this.hero, true, 0.1, 0.1);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', this.onWorldClick, this);
    this.input.on('pointermove', this.onPointerHover, this);
    this.input.on('pointerup', this.onPointerRelease, this);
    this.input.on('gameout', this.onPointerCancel, this);
    const unsubscribeEvents = this.bridge.onEvent(event => this.onGameEvent(event));
    // Game.destroy() emits DESTROY without necessarily emitting SHUTDOWN. The
    // bridge survives menu -> game transitions, so stale scene listeners must
    // be detached before Phaser nulls the old GameObjectFactory display list.
    const onDestroy = () => unsubscribeEvents();
    this.events.once(Phaser.Scenes.Events.DESTROY, onDestroy);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribeEvents();
      this.events.off(Phaser.Scenes.Events.DESTROY, onDestroy);
      this.input.off('pointerdown', this.onWorldClick, this);
      this.input.off('pointermove', this.onPointerHover, this);
      this.input.off('pointerup', this.onPointerRelease, this);
      this.input.off('gameout', this.onPointerCancel, this);
      this.heldMovement.release();
      if (this.game.canvas) this.game.canvas.style.cursor = 'default';
      for (const actor of this.enemyGraphics.values()) actor.destroy();
      this.enemyGraphics.clear();
      for (const actor of this.enemySprites.values()) actor.destroy();
      this.enemySprites.clear();
      for (const sprite of this.summonSprites.values()) sprite.destroy();
      this.summonSprites.clear();
      this.enemyPositions.clear();
      this.enemyDeadUntil.clear();
      this.heroSprite.destroy();
      for (const graphic of this.impactPool) graphic.destroy();
      this.impactPool.length = 0;
      for (const label of this.groundLabels.values()) label.destroy();
      this.groundLabels.clear();
      this.enemyHitUntil.clear();
      this.enemyBlockUntil.clear();
      this.releaseChunkGraphics();
    });
  }

  /** One-time Canvas2D-generated sprite atlases, shared by all actors of a type. */
  private ensurePixelAtlas(actor: PixelActor): string {
    const key = pixelAtlasKey(actor);
    if (this.textures.exists(key)) return key;
    const texture = this.textures.addCanvas(key, renderPixelAtlas(actor));
    if (!texture) throw new Error('Unable to register original pixel atlas: ' + key);
    PIXEL_ANIMATIONS.forEach((animation, row) => {
      for (let frame = 0; frame < PIXEL_ANIMATION_FRAMES; frame++) {
        texture.add(pixelFrame(animation, frame), 0,
          frame * PIXEL_FRAME_WIDTH, row * PIXEL_FRAME_HEIGHT,
          PIXEL_FRAME_WIDTH, PIXEL_FRAME_HEIGHT);
      }
    });
    return key;
  }

  private pixelPose(animation: ReturnType<typeof playerAnimation>): PixelAnimation {
    if (animation === 'running') return 'run';
    if (animation === 'attacking') return 'attack';
    if (animation === 'casting') return 'cast';
    if (animation === 'channeling') return 'channel';
    if (animation === 'evading') return 'dodge';
    if (animation === 'stunned') return 'hit';
    if (animation === 'dead') return 'death';
    return 'idle';
  }

  private timedFrame(elapsed: number, total: number): number {
    return Math.max(0, Math.min(3, Math.floor(4 * elapsed / Math.max(1, total))));
  }

  /** Entire status catalog is represented with consistent passive combat glyphs. */
  private drawStatuses(x:number,y:number,statuses:readonly StatusInstance[]):void {
    const visuals = statusVisuals(statuses);
    for(let i=0;i<visuals.length;i++) {
      const visual = visuals[i]!;
      const radius = 24 + Math.min(i,8)*3;
      const pulse = 0.72 + 0.18*Math.sin(this.time.now*0.005+i*1.7);
      this.statusVisuals.lineStyle(2,visual.color,pulse)
        .strokeCircle(x,y,radius);
      if (visual.glyph === 'shield') {
        this.statusVisuals.lineStyle(3,visual.color,pulse)
          .strokeTriangle(x-8,y-22,x+8,y-22,x,y-10);
      } else if (visual.glyph === 'root') {
        this.statusVisuals.lineStyle(3,visual.color,pulse)
          .lineBetween(x-16,y+18,x-7,y+28).lineBetween(x+16,y+18,x+7,y+28);
      } else if(visual.glyph === 'cross') {
        this.statusVisuals.lineStyle(3,visual.color,pulse)
          .lineBetween(x-11,y-30,x+11,y-12)
          .lineBetween(x-11,y-12,x+11,y-30);
      } else if(visual.glyph === 'rune') {
        this.statusVisuals.lineStyle(2,visual.color,pulse)
          .strokeTriangle(x-11,y-35,x+11,y-35,x,y-16);
      } else if(visual.glyph === 'spark') {
        this.statusVisuals.fillStyle(visual.color,pulse)
          .fillCircle(x+16,y-22,4).fillCircle(x-14,y-28,3);
      }
    }
  }

  private uiCapturesPointer(): boolean {
    return this.bridge.snapshot().paused || !!document.querySelector(
      '.inventory-overlay, .character-sheet-backdrop, .npc-dialog-shield, .trade-overlay, .modal-shield'
    );
  }

  /** Context choice is owned by Agent 03's pure resolver, not Phaser hit-order. */
  private pointerContext(point: Point): ResolvedPointerContext {
    const state = this.bridge.snapshot();
    const portal = state.zone === 'wilderness' ? CRYPT_GATE : CRYPT_EXIT;
    const targets: ContextTarget[] = [
      { kind: 'INTERACTABLE', id: 'crypt-portal', position: portal, hitRadius: 64 },
      ...(state.cryptInteractables ?? []).map(prop => ({
        kind: 'INTERACTABLE' as const, id: prop.id,
        position: prop.position, hitRadius: prop.hitRadius
      })),
      ...(state.environmentObjects ?? []).map(object => ({
        kind: 'INTERACTABLE' as const, id: object.id,
        position: object.position, hitRadius: object.hitRadius
      })),
      ...state.interactables.map(object => ({
        kind: 'INTERACTABLE' as const, id: object.id,
        position: object.position, hitRadius: object.hitRadius
      })),
      ...this.bridge.visibleGroundLoot(state).map(drop => ({
        kind: 'LOOT' as const, id: drop.id, position: { x: drop.x, y: drop.y }, hitRadius: 30
      })),
      ...state.enemies.map(unit => ({
        kind: 'ENEMY' as const, id: unit.actor.id,
        position: { x: unit.actor.x, y: unit.actor.y },
        hitRadius: unit.actor.type === 'crypt_lord' ? 58 : 43, alive: unit.actor.alive
      }))
    ];
    if (state.zone === 'wilderness') {
      for (const entry of getTownManifest()) {
        targets.push({ kind: 'NPC', id: entry.id, position: entry.position,
          hitRadius: Math.max(24, entry.collisionRadius + 12) });
      }
    }
    return resolvePointerContext({
      pointer: point,
      uiCaptured: this.uiCapturesPointer(),
      walkable: canOccupy(point, ACTOR_RADIUS, this.activeObstacles),
      targets
    });
  }

  private onPointerHover(pointer: Phaser.Input.Pointer): void {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const context = this.pointerContext(world);
    this.hoveredId = context.kind === 'ENEMY' || context.kind === 'LOOT'
      || context.kind === 'NPC' || context.kind === 'INTERACTABLE'
      ? context.id : null;
    this.bridge.setPointerAim(world, context.kind === 'ENEMY' ? context.id : null);
    const cursor = cursorForContext(context);
    const cursors = {
      move: 'crosshair', hostile: 'crosshair', talk: 'pointer',
      loot: 'grab', interact: 'pointer', blocked: 'not-allowed', ui: 'default'
    } as const;
    this.game.canvas.style.cursor = cursors[cursor];

    // A held ground click follows the cursor, at most ~9 path requests/second.
    if (!pointer.isDown || this.uiCapturesPointer() || !this.bridge.snapshot().player.alive) {
      this.heldMovement.release();
      return;
    }
    const destination = this.heldMovement.update(world, this.time.now);
    if (destination) this.bridge.command({ type: 'move', destination });
  }

  private onPointerRelease(): void {
    this.heldMovement.release();
  }

  private onPointerCancel(): void {
    this.heldMovement.release();
    this.hoveredId = null;
  }

  private onWorldClick(pointer: Phaser.Input.Pointer): void {
    const action = resolvePointerAction({
      button: pointer.button, uiCaptured: this.uiCapturesPointer()
    }, this.bridge.bindings());
    if (!action) return;

    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const context = this.pointerContext(world);
    this.bridge.setPointerAim(world, context.kind === 'ENEMY' ? context.id : null);

    if (action === 'SECONDARY') {
      const aim = this.bridge.skillAim('rmb');
      this.bridge.command({
        type: 'cast', slot: 'rmb',
        ...(aim ? { aim } : {}),
        ...(context.kind === 'ENEMY' ? { targetId: context.id } : {})
      });
      return;
    }
    if (action === 'EVADE') {
      this.bridge.command({ type: 'evade' });
      return;
    }
    if (action !== 'PRIMARY' && action !== 'FORCE_MOVE') return;
    if (action === 'FORCE_MOVE') {
      this.heldMovement.begin(world, this.time.now);
      this.bridge.command({ type: 'move', destination: { x: world.x, y: world.y } });
      return;
    }
    // The pure pointer resolver keeps NPC hit-testing uniform; new services
    // use a separate typed command until their original NPCs gain full roles.
    if (context.kind === 'NPC' && townEntry(context.id)?.capability !== 'existing') {
      this.bridge.command({ type: 'interactTown', entryId: context.id });
      this.heldMovement.release();
      return;
    }
    if(context.kind==='INTERACTABLE' && context.id.startsWith('env.')) {
      this.bridge.command({type:'interactEnvironment',id:context.id as EnvironmentObjectId});
      this.heldMovement.release();
      return;
    }
    if (context.kind === 'INTERACTABLE' && context.id.startsWith('crypt/')) {
      this.bridge.command({ type: 'interactCrypt', id: context.id });
      this.heldMovement.release();
      return;
    }
    const command = contextToCommand(context);
    if (command) {
      this.bridge.command(command);
      if (context.kind === 'GROUND') this.heldMovement.begin(world, this.time.now);
      else this.heldMovement.release();
    } else if (context.kind === 'INVALID') {
      this.heldMovement.begin(world, this.time.now);
      this.bridge.command({ type: 'move', destination: { x: world.x, y: world.y } });
    }
  }

  private drawEnemy(type: EnemyType, g: Phaser.GameObjects.Graphics): void {
    g.clear();
    const color = ENEMY_DEFINITIONS[type].color;
    if (type === 'wraith' || (type !== 'crypt_lord' && ENEMY_DEFINITIONS[type].attack === 'bolt' && !type.toLowerCase().includes('skeleton'))) {
      g.fillStyle(0x080c13, 0.55).fillEllipse(0, 20, 49, 17);
      g.fillStyle(0x3b314a).fillEllipse(0, 0, 44, 43);
      g.fillStyle(color).fillTriangle(-20, 12, 20, 12, 0, -28);
      g.fillStyle(0x24192e).fillEllipse(0, -8, 24, 22);
      g.fillStyle(0xf4a9bc).fillCircle(-7, -9, 3).fillCircle(7, -9, 3);
      g.lineStyle(2, 0xbc9ed8, 0.65).strokeEllipse(0, 4, 43, 42);
    } else if (type === 'skeleton' || type.toLowerCase().includes('skeleton')
      || type.toLowerCase().includes('bandit') || type.toLowerCase().includes('cult')
      || type === 'zombie' || type === 'ghoul' || type === 'fanatic') {
      g.fillStyle(0x080c13, 0.55).fillEllipse(0, 21, 49, 13);
      g.lineStyle(5, 0x6f6b61).lineBetween(-19, 18, -15, -11)
        .lineBetween(19, 18, 15, -11);
      g.fillStyle(color).fillRoundedRect(-16, -4, 32, 24, 4);
      g.lineStyle(2, 0x30333b).lineBetween(-10, 1, 10, 1)
        .lineBetween(-11, 7, 11, 7).lineBetween(-10, 13, 10, 13);
      g.fillStyle(0xe3dec8).fillCircle(0, -20, 19);
      g.fillStyle(0x1c222c).fillCircle(-7, -24, 5).fillCircle(7, -24, 5);
      g.fillStyle(0x7a6d5e).fillTriangle(-3, -16, 3, -16, 0, -9);
      g.lineStyle(3, 0xbcb6a4).lineBetween(18, -11, 28, -34);
    } else if (type === 'wolf' || type === 'spider' || type === 'corruptedBoar') {
      g.fillStyle(0x080c13, 0.58).fillEllipse(0, 18, 64, 14);
      g.fillStyle(0x553b36).fillEllipse(-8, 0, 50, 26);
      g.fillStyle(color).fillEllipse(12, -8, 28, 22);
      g.fillStyle(0x6e4c41).fillTriangle(1, -15, 8, -34, 15, -16)
        .fillTriangle(17, -16, 28, -30, 29, -7);
      g.lineStyle(5, 0x59382d).lineBetween(-22, 4, -25, 23)
        .lineBetween(-1, 6, 2, 25).lineBetween(10, 7, 13, 25);
      g.fillStyle(0xecb5a0).fillCircle(21, -11, 3);
      g.lineStyle(4, 0x644238).lineBetween(-29, -5, -39, -22);
    } else {
      this.drawCryptLord(g);
    }
  }

  // Brighter silhouette and crown for the unique crypt boss.
  private drawCryptLord(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x080b13, 0.65).fillEllipse(0, 28, 99, 25);
    g.fillStyle(0x3b2831).fillEllipse(0, 0, 71, 78);
    g.fillStyle(0x805053).fillTriangle(-35, 28, 35, 28, 0, -48);
    g.fillStyle(0xd0b69c).fillCircle(0, -34, 24);
    g.fillStyle(0x33242b).fillCircle(-10, -38, 5).fillCircle(10, -38, 5);
    g.fillStyle(0xe2a466).fillTriangle(-23, -49, -17, -78, -8, -48)
      .fillTriangle(-9, -51, 0, -87, 9, -51)
      .fillTriangle(8, -48, 18, -78, 23, -49);
    g.lineStyle(5, 0xd49362).lineBetween(33, 26, 50, -50);
    g.fillStyle(0xad6952).fillRoundedRect(43, -60, 32, 12, 2);
    g.lineStyle(3, 0xda9870, 0.7).strokeEllipse(0, 0, 76, 82);
  }

  /** Reuse short-lived combat graphics instead of allocating per impact. */
  private obtainImpact(x: number, y: number, depth = 85): Phaser.GameObjects.Graphics {
    const graphic = this.impactPool.pop() ?? this.add.graphics();
    graphic.clear().setVisible(true).setAlpha(1).setScale(1)
      .setPosition(x, y).setDepth(depth);
    return graphic;
  }

  private releaseImpact(graphic: Phaser.GameObjects.Graphics): void {
    graphic.clear().setVisible(false);
    if (this.impactPool.length < 64) this.impactPool.push(graphic);
    else graphic.destroy();
  }

  /** Respect operating-system reduced-motion preference without touching game timing. */
  private reducedCombatMotion(): boolean {
    return typeof window !== 'undefined'
      && (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false);
  }

  /** Geometry-only overlay; gameplay state and authoritative hit timing never change. */
  private showCombatReadability(event: CombatReadabilityInput): void {
    const cue = planCombatReadability(event);
    if (!cue) return;
    const graphic = this.obtainImpact(cue.position.x, cue.position.y, 89);
    if (cue.ring) {
      graphic.lineStyle(cue.strokeWidth + 4, 0x08121c, 0.96)
        .strokeCircle(0, 0, cue.radius);
      graphic.lineStyle(cue.strokeWidth, cue.color, 0.98)
        .strokeCircle(0, 0, cue.radius);
      graphic.fillStyle(cue.color, 0.07).fillCircle(0, 0, cue.radius);
    } else if (cue.sector) {
      // Render only the authoritative attack wedge. A circle would falsely
      // mark safe space around a cleave/lunge as hazardous.
      const { fromRadians, toRadians } = cue.sector;
      graphic.fillStyle(cue.color, 0.08);
      graphic.slice(0, 0, cue.radius, fromRadians, toRadians, false).fillPath();
      graphic.lineStyle(cue.strokeWidth + 4, 0x08121c, 0.96);
      graphic.slice(0, 0, cue.radius, fromRadians, toRadians, false).strokePath();
      graphic.lineStyle(cue.strokeWidth, cue.color, 0.98);
      graphic.slice(0, 0, cue.radius, fromRadians, toRadians, false).strokePath();
    }
    graphic.lineStyle(cue.strokeWidth + 4, 0x08121c, 0.96);
    for (const line of cue.segments)
      graphic.lineBetween(line.x1, line.y1, line.x2, line.y2);
    graphic.lineStyle(cue.strokeWidth, cue.color, 0.98);
    for (const line of cue.segments)
      graphic.lineBetween(line.x1, line.y1, line.x2, line.y2);

    if (this.reducedCombatMotion()) {
      // A stationary readable mark, kept for the original warning duration.
      this.time.delayedCall(cue.durationMs, () => this.releaseImpact(graphic));
    } else {
      this.tweens.add({ targets: graphic, alpha: 0, scaleX: 1.12, scaleY: 1.12,
        duration: cue.durationMs, onComplete: () => this.releaseImpact(graphic) });
    }
  }

  private showDeathFeedback(actorId: string, position: Point): void {
    const cues = planCombatVfx({ type: 'death', position, actorId });
    for (const cue of cues) {
      if (cue.type !== 'deathHook' && cue.type !== 'particles') continue;
      const graphic = this.obtainImpact(position.x, position.y, 87);
      graphic.lineStyle(3, 0x9f7a96, 0.9).strokeCircle(0, 0, 23);
      if (cue.type === 'particles') {
        for (let n = 0; n < cue.count; n++) {
          const rad = n * 2 * Math.PI / cue.count;
          const radius = 10 + n % 4 * 7;
          graphic.fillStyle(0xc8a6ba, 0.8)
            .fillCircle(Math.cos(rad) * radius, Math.sin(rad) * radius, 2);
        }
      }
      this.tweens.add({
        targets: graphic, alpha: 0, scaleX: 2.1, scaleY: 2.1,
        duration: cue.durationMs, onComplete: () => this.releaseImpact(graphic)
      });
    }
  }

  private onGameEvent(event: GameEvent): void {
    // An event during shutdown must never recreate graphics on a dead scene.
    if (!this.sys.isActive()) return;
    if(event.type==='environmentInteracted') {
      const visual=this.obtainImpact(event.x,event.y,86);
      const shrine=event.kind==='shrine';
      const color=shrine?0x89d9bd:event.kind==='trap'?0xd96176:0xe4bb85;
      visual.lineStyle(3,color,.95).strokeCircle(0,0,shrine?34:22);
      visual.fillStyle(color,.10).fillCircle(0,0,shrine?34:22);
      this.tweens.add({targets:visual,alpha:0,scaleX:shrine?2.3:1.7,
        scaleY:shrine?2.3:1.7,duration:650,
        onComplete:()=>this.releaseImpact(visual)});
      return;
    }
    if(event.type === 'worldEventStarted' || event.type === 'worldEventCompleted') {
      // Visual cue only: event eligibility, kills and rewards belong to simulation.
      const completed=event.type==='worldEventCompleted';
      const color=completed?0xd8b975:0xb37fc9;
      const cue=this.obtainImpact(event.x,event.y,88);
      cue.lineStyle(4,color,0.9).strokeCircle(0,0,completed?48:65);
      cue.lineStyle(2,color,0.58).strokeCircle(0,0,completed?70:87);
      this.tweens.add({
        targets:cue,alpha:0,scaleX:completed?2.2:1.6,scaleY:completed?2.2:1.6,
        duration:completed?850:650,onComplete:()=>this.releaseImpact(cue)
      });
      this.cameras.main.flash(completed?240:130,
        completed?150:105,completed?115:70,completed?70:155);
      return;
    }
    if (event.type === 'waypointTravel') {
      // The simulation already relocated the hero. Phaser owns presentation only.
      this.heldMovement.release();
      this.heroDeadUntil = 0;
      this.heroHitUntil = 0;
      this.heroBlockUntil = 0;
      this.cameras.main.flash(550, 97, 174, 207);
      return;
    }
    if (event.type === 'playerRespawn') {
      this.heldMovement.release();
      this.heroDeadUntil = 0;
      this.heroHitUntil = 0;
      this.heroBlockUntil = 0;
      this.cameras.main.flash(420, 120, 190, 155);
      return;
    }
    if (event.type === 'potionUsed') {
      // Rendering only: simulation already validated and applied the consumption.
      const tint = event.potionId === 'healing' ? 0x83d4a6
        : event.potionId === 'resource' ? 0x8dbfec
        : event.potionId === 'resistance' ? 0xc7b3e4 : 0xe8a46c;
      const ring = this.obtainImpact(event.x, event.y, 88);
      ring.lineStyle(4, tint, 0.95).strokeCircle(0, 0, 22);
      ring.fillStyle(tint, 0.15).fillCircle(0, 0, 20);
      this.tweens.add({
        targets: ring, alpha: 0, scaleX: 2.6, scaleY: 2.6, duration: 550,
        onComplete: () => this.releaseImpact(ring)
      });
      return;
    }
    if (event.type === 'hollowKingCue') {
      if (event.kind === 'telegraph') {
        // A GameEvent carries a radius only. The updated simulation snapshot
        // contains the exact circle/cone geometry. Never invent a full circle
        // if the warning has already been retired by a later simulation tick.
        const warning = this.bridge.snapshot().hollowKing?.warning;
        if (warning && warning.ability === event.ability) {
          const g = warning.geometry;
          this.showCombatReadability({
            type: 'telegraph', threat: 'boss',
            position: { x: g.position.x, y: g.position.y }, radius: g.radius,
            shape: g.shape, angleRadians: g.angleRadians, arcDegrees: g.arcDegrees
          });
        }
      } else {
        const ring = this.obtainImpact(event.x, event.y, 88);
        const tint = event.kind === 'phaseChanged' ? 0xb59ae9
          : event.kind === 'hitWindow' ? 0xf06c6f : 0x8eaeaf;
        ring.lineStyle(3, tint, 0.90)
          .strokeCircle(0, 0, Math.min(128, Math.max(18, event.radius)));
        ring.fillStyle(tint, 0.11).fillCircle(0, 0,
          Math.min(128, Math.max(18, event.radius)));
        this.tweens.add({ targets: ring, alpha: 0, scaleX: 1.16, scaleY: 1.16,
          duration: 360, onComplete: () => this.releaseImpact(ring) });
      }
    } else if (event.type === 'miniBossCue') {
      if (event.kind === 'telegraph') {
        this.showCombatReadability({
          type: 'telegraph', threat: 'miniboss',
          position: { x: event.x, y: event.y }, radius: event.radius
        });
      } else {
        const graphic = this.obtainImpact(event.x, event.y, 88);
        const color = event.kind === 'impact' ? 0xe16a67
          : event.kind === 'phase' ? 0xa691db : 0x93b4b5;
        graphic.lineStyle(3, color, 0.92)
          .strokeCircle(0, 0, Math.max(18, Math.min(140, event.radius)));
        graphic.fillStyle(color, 0.1)
          .fillCircle(0, 0, Math.max(18, Math.min(140, event.radius)));
        this.tweens.add({ targets: graphic, alpha: 0,
          scaleX: 1.2, scaleY: 1.2, duration: 480,
          onComplete: () => this.releaseImpact(graphic) });
      }
    } else if (event.type === 'cryptTrapWindup' || event.type === 'cryptTrap') {
      if (event.type === 'cryptTrapWindup') {
        this.showCombatReadability({
          type: 'telegraph', threat: 'trap',
          position: { x: event.x, y: event.y }, radius: event.radius
        });
      } else {
        const ring = this.obtainImpact(event.x, event.y, 89);
        ring.lineStyle(4, 0xe26973, 0.95).strokeCircle(0, 0, 23);
        ring.fillStyle(0xe26973, 0.13).fillCircle(0, 0, 23);
        this.tweens.add({
          targets: ring, alpha: 0, scaleX: 1.2, scaleY: 1.2,
          duration: 380, onComplete: () => this.releaseImpact(ring)
        });
      }
    } else if (event.type === 'cryptInteract') {
      const prop = buildCryptWorld(this.bridge.snapshot().worldSeed).theme.interactables
        .find(value => value.id === event.id);
      if (prop) {
        const ring = this.obtainImpact(prop.position.x, prop.position.y, 85);
        ring.lineStyle(3, 0xebcb85).strokeCircle(0, 0, 24);
        this.tweens.add({ targets: ring, alpha: 0, scaleX: 1.6, scaleY: 1.6,
          duration: 430, onComplete: () => this.releaseImpact(ring) });
      }
    } else if (event.type === 'eliteCue') {
      const visual = this.obtainImpact(event.x, event.y, 86);
      const tint = event.effect === 'fireAura' || event.effect === 'deathExplosion'
        ? 0xed7745 : event.effect === 'hazardousGround' ? 0x83b368 : 0x90bde8;
      visual.lineStyle(4, tint, 0.92).strokeCircle(0, 0, event.radius);
      visual.fillStyle(tint, 0.10).fillCircle(0, 0, event.radius);
      this.tweens.add({
        targets: visual, alpha: 0, scaleX: 1.09, scaleY: 1.09, duration: 550,
        onComplete: () => this.releaseImpact(visual)
      });
    } else if (event.type === 'cast') {
      const definition = Object.values(SKILLS)
        .flatMap(kit => Object.values(kit))
        .find(skill => skill.id === event.skillId) ?? getPaladinAbility(event.skillId)
        ?? getMageSpell(event.skillId) ?? getNecroSpell(event.skillId)
        ?? getRogueAbility(event.skillId) ?? getWarlockSpell(event.skillId);
      const ring = this.obtainImpact(event.x, event.y, 85);
      ring.lineStyle(4, definition?.color ?? 0xffddaa, 0.95).strokeCircle(0, 0, 18);
      this.tweens.add({
        targets: ring, alpha: 0, scaleX: 3.3, scaleY: 3.3, duration: 470,
        onComplete: () => this.releaseImpact(ring)
      });
    } else if (event.type === 'defeat' || event.type === 'playerDeath') {
      const state = this.bridge.snapshot();
      const actor = event.type === 'playerDeath' ? state.player
        : state.enemies.find(unit => unit.actor.id === event.targetId)?.actor;
      if (actor) {
        this.showDeathFeedback(actor.id, { x: actor.x, y: actor.y });
        if (event.type === 'playerDeath') this.heroDeadUntil = this.time.now + 650;
        else this.enemyDeadUntil.set(actor.id, this.time.now + 650);
      }
    } else if (event.type === 'enemyBuff') {
      const actor = this.bridge.snapshot().enemies.find(u => u.actor.id === event.enemyId)?.actor;
      if (!actor) return;
      const ring = this.obtainImpact(actor.x, actor.y, 85);
      ring.lineStyle(3, 0xb4ca98, 0.92).strokeCircle(0, 0, 27);
      this.tweens.add({
        targets: ring, alpha: 0, scaleX: 1.5, scaleY: 1.5, duration: 580,
        onComplete: () => this.releaseImpact(ring)
      });
    } else if (event.type === 'enemyHeal') {
      const target = this.bridge.snapshot().enemies.find(u => u.actor.id === event.targetId)?.actor;
      if (!target) return;
      const label = this.add.text(target.x, target.y - 42, '+' + event.amount, {
        fontFamily: 'Georgia, serif', fontSize: '17px',
        color: '#91e4b4', stroke: '#070b11', strokeThickness: 3
      }).setOrigin(0.5).setDepth(90);
      this.tweens.add({
        targets: label, y: label.y - 28, alpha: 0, duration: 750,
        onComplete: () => label.destroy()
      });
    } else if (event.type === 'warriorImpact') {
      const transformed = (event.modifierIds?.length ?? 0) > 0;
      const radius = transformed ? Math.max(35, Math.min(300, event.radius ?? 35)) : 35;
      const ring = this.obtainImpact(event.x, event.y, 86);
      ring.lineStyle(transformed ? 6 : 5, transformed ? 0xcf769b : 0xf4ce80, 0.95)
        .strokeCircle(0, 0, radius);
      if (transformed) {
        ring.lineStyle(3, 0xffd38f, 0.82)
          .strokeCircle(0, 0, Math.max(20, radius - 13));
        ring.fillStyle(0xcf769b, 0.11).fillCircle(0, 0, radius);
      }
      this.tweens.add({
        targets: ring, alpha: 0, scaleX: transformed ? 1.14 : 2.3,
        scaleY: transformed ? 1.14 : 2.3,
        duration: transformed ? 360 : 280,
        onComplete: () => this.releaseImpact(ring)
      });
    } else if (event.type === 'damageResolved') {
      const state = this.bridge.snapshot();
      const actor = event.targetId === 'hero' ? state.player
        : state.enemies.find(unit => unit.actor.id === event.targetId)?.actor;
      if (!actor) return;
      this.showCombatReadability({
        type: 'impact', position: { x: actor.x, y: actor.y }, damage: event.damage,
        outcome: event.dodged ? 'dodged' : event.blocked ? 'blocked' : 'hit',
        critical: event.critical
      });
      if (event.damage > 0) {
        if (event.targetId === 'hero') this.heroHitUntil = this.time.now + 140;
        else this.enemyHitUntil.set(event.targetId, this.time.now + 140);
      } else if (event.blocked) {
        if (event.targetId === 'hero') this.heroBlockUntil = this.time.now + 190;
        else this.enemyBlockUntil.set(event.targetId, this.time.now + 190);
      }
      const source = event.sourceId === 'hero' ? state.player
        : state.enemies.find(u => u.actor.id === event.sourceId)?.actor;
      const cues = planCombatVfx({
        type: 'impact', position: { x: actor.x, y: actor.y },
        damage: event.damage, absorbed: event.absorbed,
        outcome: event.dodged ? 'dodged' : event.blocked ? 'blocked' : 'hit',
        delivery: state.enemies.some(u => u.actor.id === event.sourceId
          && ENEMY_DEFINITIONS[u.actor.type].attack === 'bolt')
          || (event.sourceId === 'hero' && event.damageType !== 'physical')
          ? 'projectile' : 'melee',
        critical: event.critical, strong: event.critical || event.damage >= 45,
        ...(source ? { direction: {
          x: actor.x - source.x, y: actor.y - source.y
        } } : {})
      });
      for (const cue of cues) {
        if (cue.type === 'screenShake') {
          if (!this.reducedCombatMotion())
            this.cameras.main.shake(cue.durationMs, 0.0025 * cue.intensity);
        } else if (cue.type === 'floatText') {
          const text = cue.content.kind === 'damage'
            ? '-' + cue.content.amount : get(translate)(cue.content.key);
          const label = this.add.text(cue.position.x, cue.position.y - 39, text, {
            fontFamily: 'Georgia, serif',
            fontSize: cue.emphasis === 'critical' ? '21px' : '17px',
            color: event.targetId === 'hero' ? '#ff8d8d' : cue.emphasis === 'critical' ? '#ffe2a0' : '#f6d29a',
            stroke: '#070b11', strokeThickness: 3
          }).setOrigin(0.5).setDepth(90);
          this.tweens.add({
            targets: label, y: label.y - 32, alpha: 0, duration: cue.durationMs,
            onComplete: () => label.destroy()
          });
        } else if (cue.type === 'impactFlash' || cue.type === 'particles'
          || cue.type === 'weaponTrail' || cue.type === 'knockbackCue') {
          const flash = this.obtainImpact(cue.position.x, cue.position.y, 84);
          const color = cue.type === 'impactFlash' && cue.tone === 'critical' ? 0xffedaa
            : cue.type === 'impactFlash' && cue.tone === 'blocked' ? 0x9fbde5 : 0xf1b88b;
          if (cue.type === 'knockbackCue') {
            flash.lineStyle(4, 0xffce9e, 0.8)
              .lineBetween(0, 0, cue.direction.x * cue.distance, cue.direction.y * cue.distance);
          } else if (cue.type === 'particles') {
            const count = Math.min(32, cue.count);
            for (let n = 0; n < count; n++) {
              const rad = n * 2 * Math.PI / count;
              const radius = 10 + n % 5 * 4;
              flash.fillStyle(color, 0.7)
                .fillCircle(Math.cos(rad) * radius, Math.sin(rad) * radius, 2.2);
            }
          } else if (cue.type === 'weaponTrail') {
            flash.lineStyle(3, color, 0.9)
              .lineBetween(-20, 13, 20, -13);
          } else {
            flash.lineStyle(4, color, 0.9).strokeCircle(0, 0, 13);
          }
          this.tweens.add({
            targets: flash, alpha: 0, scaleX: 2.2, scaleY: 2.2,
            duration: cue.durationMs,
            onComplete: () => this.releaseImpact(flash)
          });
        }
      }
    }
  }

  update(_time: number, delta: number): void {
    this.bridge.tick(delta);
    // Camera-follow changes the world coordinate beneath a stationary held cursor.
    // Update it at the same throttled cadence even without pointermove events.
    if (this.heldMovement.active && this.input.activePointer.isDown) {
      if (this.uiCapturesPointer()) this.heldMovement.release();
      else {
        const pointer = this.input.activePointer;
        const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const goal = this.heldMovement.update(world, this.time.now);
        if (goal) this.bridge.command({ type: 'move', destination: goal });
      }
    }
    const state = this.bridge.snapshot();
    if (this.renderedSeed !== state.worldSeed || this.renderedZone !== state.zone) {
      this.paintWorld(state.worldSeed, state.zone);
    }
    if (state.zone === 'wilderness' && this.time.now >= this.nextStreamUpdate) {
      this.advanceChunkGraphics(state.player, 4);
      this.nextStreamUpdate = this.time.now + 120;
    }
    for (const actor of this.campDecor) actor.setVisible(state.zone === 'wilderness');
    this.hero.setPosition(state.player.x, state.player.y);
    if (this.heroSprite.texture.key !== pixelAtlasKey(state.classId)) {
      this.heroSprite.setTexture(this.ensurePixelAtlas(state.classId), pixelFrame('idle', 0));
    }
    this.heroSprite.setPosition(state.player.x, state.player.y);
    const animation = playerAnimation(state);
    const oscillation = Math.sin(this.time.now * 0.015);
    this.hero.setScale(animation === 'running' ? 1 + oscillation * 0.045
      : animation === 'channeling' ? 1 + oscillation * 0.035
      : animation === 'casting' ? 1 + oscillation * 0.02
      : animation === 'attacking' ? 1 + oscillation * 0.025
      : animation === 'evading' ? 0.9 : 1);
    this.hero.setAlpha(this.time.now < this.heroHitUntil ? 0.45
      : animation === 'stunned' ? 0.72 : 1);
    this.wardenMarker.setText(state.questLedger?.quests.some(quest =>
      quest.questId === 'vesnas_report' && quest.status === 'ready') ? '?'
      : state.quest.status === 'ready' ? '?'
      : state.quest.status === 'available' ? '!' : '·');
    this.wardenMarker.setVisible(state.zone === 'wilderness' && (state.quest.status !== 'completed'
      || state.questLedger?.quests.some(quest => quest.questId === 'vesnas_report'
        && (quest.status === 'active' || quest.status === 'ready')) === true));
    this.hero.setVisible(false);
    const visualPose = this.time.now < this.heroBlockUntil ? 'block'
      : this.time.now < this.heroHitUntil ? 'hit' : this.pixelPose(animation);
    const castTicks = state.warriorAction?.timeline ?? state.classAction?.timeline;
    const heroFrame = castTicks && (visualPose === 'attack' || visualPose === 'cast'
      || visualPose === 'channel')
      ? pixelTimelineFrame(castTicks)
      : Math.floor(this.time.now / (visualPose === 'run' ? 95 : 150)) % PIXEL_ANIMATION_FRAMES;
    this.heroSprite.setFrame(pixelFrame(visualPose, heroFrame));
    this.heroSprite.setVisible(state.player.alive || this.time.now < this.heroDeadUntil);
    this.heroSprite.setAlpha(this.time.now < this.heroHitUntil ? 0.6
      : (state.rogueStealthSeconds??0)>0 ? 0.62 : 1);
    this.heroSprite.setScale(animation === 'evading' ? 0.92 : 1);
    const ids = new Set(state.enemies.map(unit => unit.actor.id));
    for (const [id, sprite] of this.enemyGraphics) {
      if (!ids.has(id)) {
        sprite.destroy();
        this.enemyGraphics.delete(id);
        this.enemySprites.get(id)?.destroy();
        this.enemySprites.delete(id);
        this.enemyPositions.delete(id);
        this.enemyDeadUntil.delete(id);
        this.enemyHitUntil.delete(id);
        this.enemyBlockUntil.delete(id);
      }
    }
    for (const { actor } of state.enemies) {
      let sprite = this.enemyGraphics.get(actor.id);
      if (!sprite) {
        sprite = this.add.graphics().setDepth(48);
        this.drawEnemy(actor.type, sprite);
        this.enemyGraphics.set(actor.id, sprite);
        const art = this.add.sprite(actor.x, actor.y, this.ensurePixelAtlas(actor.type),
          pixelFrame('idle', 0)).setOrigin(0.5, 0.9).setDepth(49);
        art.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        this.enemySprites.set(actor.id, art);
      }
      const bob = actor.type === 'wraith'
        ? Math.sin(this.time.now * 0.0045 + actor.x) * 4
        : Math.sin(this.time.now * (actor.type === 'wolf' ? 0.015 : 0.008) + actor.y) * 1.5;
      sprite.setPosition(actor.x, actor.y + bob).setVisible(false);
      const art = this.enemySprites.get(actor.id);
      if (art) {
        const last = this.enemyPositions.get(actor.id);
        const moving = !!last && Math.hypot(actor.x-last.x, actor.y-last.y) > 0.3;
        const underHit = this.time.now < (this.enemyHitUntil.get(actor.id) ?? 0);
        const pose: PixelAnimation = !actor.alive ? 'death'
          : this.time.now < (this.enemyBlockUntil.get(actor.id) ?? 0) ? 'block'
          : underHit ? 'hit' : state.enemies.find(u => u.actor.id === actor.id)?.intent
            ? ENEMY_DEFINITIONS[actor.type].attack === 'bolt' ? 'cast' : 'attack'
            : moving ? 'run' : 'idle';
        const intent = state.enemies.find(u => u.actor.id === actor.id)?.intent;
        const progress = intent && (pose === 'attack' || pose === 'cast')
          ? this.timedFrame(intent.total-intent.remaining, intent.total)
          : Math.floor(this.time.now / (pose === 'run' ? 110 : 170)) % PIXEL_ANIMATION_FRAMES;
        const frame = !actor.alive
          ? this.timedFrame(650 - Math.max(0,(this.enemyDeadUntil.get(actor.id) ?? 0)-this.time.now),650)
          : progress;
        art.setPosition(actor.x,actor.y+bob).setFrame(pixelFrame(pose,frame))
          .setVisible(actor.alive || this.time.now < (this.enemyDeadUntil.get(actor.id) ?? 0))
          .setAlpha(underHit ? 0.55 : 1);
      }
      this.enemyPositions.set(actor.id, { x: actor.x, y: actor.y });
    }

    // Summon sprites are distinct friendly entities with their own stable IDs.
    const allies=state.summons??[];
    const activeSummons=new Set(allies.map(a=>a.id));
    for(const [id,sprite] of this.summonSprites){
      if(!activeSummons.has(id)){
        sprite.destroy();
        this.summonSprites.delete(id);
      }
    }
    for(const summon of allies){
      let sprite=this.summonSprites.get(summon.id);
      if(!sprite){
        const atlas=this.ensurePixelAtlas(summon.kind==='golem'?'crypt_lord':
          summon.kind==='demon'?'wraith':'skeleton');
        sprite=this.add.sprite(summon.x,summon.y,atlas,pixelFrame('idle',0))
          .setOrigin(0.5,0.9).setDepth(49.5)
          .setTint(summon.kind==='golem'?0xa2d4b7:
            summon.kind==='demon'?0xcb72d1:0x68d4ca);
        sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        this.summonSprites.set(summon.id,sprite);
      }
      const moving=summon.targetId!==null;
      sprite.setPosition(summon.x,summon.y)
        .setFrame(pixelFrame(moving?'run':'idle',
          Math.floor(this.time.now/(moving?110:170))%PIXEL_ANIMATION_FRAMES))
        .setAlpha(summon.remaining<3?0.6:1);
    }
    this.corpsesVisual.clear();
    for(const corpse of state.corpses??[]){
      this.corpsesVisual.lineStyle(2,0x81c1a4,0.72);
      this.corpsesVisual.strokeEllipse(corpse.x,corpse.y+10,28,11);
      this.corpsesVisual.fillStyle(0x477f69,0.2);
      this.corpsesVisual.fillEllipse(corpse.x,corpse.y+10,23,8);
    }
    this.rogueTrapsVisual.clear();
    for (const trap of state.rogueTraps??[]){
      this.rogueTrapsVisual.lineStyle(3,0x81c58a,0.88);
      this.rogueTrapsVisual.strokeCircle(trap.x,trap.y,16);
      this.rogueTrapsVisual.lineStyle(1,0xc2ef9b,0.38);
      this.rogueTrapsVisual.strokeCircle(trap.x,trap.y,trap.radius);
    }
    this.healthBar.clear();
    this.telegraph.clear();
    this.statusVisuals.clear();
    if (state.zone === 'crypt' && state.hollowKing) {
      const king = state.hollowKing;
      const warning = king.warning;
      if (warning) {
        const g = warning.geometry;
        const progress = 1 - warning.remainingSeconds / Math.max(0.01, warning.windupSeconds);
        const alpha = Math.min(0.5, 0.10 + progress * 0.28);
        this.telegraph.fillStyle(0xe96569, alpha);
        this.telegraph.lineStyle(4 + progress * 4, 0xffd294, 0.72 + progress * 0.28);
        if (g.shape === 'circle') {
          this.telegraph.fillCircle(g.position.x, g.position.y, g.radius);
          this.telegraph.strokeCircle(g.position.x, g.position.y, g.radius);
        } else {
          const arc = g.arcDegrees * Math.PI / 360;
          const from = g.angleRadians - arc, to = g.angleRadians + arc;
          this.telegraph.slice(g.position.x, g.position.y, g.radius, from, to, false);
          this.telegraph.fillPath();
          this.telegraph.slice(g.position.x, g.position.y, g.radius, from, to, false);
          this.telegraph.strokePath();
        }
      }
      for (const hazard of king.hazards) {
        const pulse = 0.22 + 0.08 * Math.sin(this.time.now * 0.013);
        const c = hazard.type === 'rune_storm' ? 0xb085ea : 0x8cc8a3;
        this.telegraph.fillStyle(c, pulse)
          .fillCircle(hazard.position.x, hazard.position.y, hazard.radius);
        this.telegraph.lineStyle(4, c, 0.85)
          .strokeCircle(hazard.position.x, hazard.position.y, hazard.radius);
      }
    }
    // The current story objective, not every optional POI, receives a pulsing
    // readable quest marker. All positions originate from the validated world.
    const currentStory = state.questLedger?.quests.find(quest =>
      quest.questId !== 'ashes_at_gate' && (quest.status === 'active' || quest.status === 'ready'));
    const beat = ACT_I_MILESTONES.find(milestone => milestone.questId === currentStory?.questId);
    if (beat) {
      const featureIds: Record<string, string> = {
        corruption_site: 'act1.corruption_site',
        infected_beast_den: 'act1.tainted_beasts',
        abandoned_graveyard: 'act1.abandoned_graveyard',
        gravebound_morrow: 'act1.grave_warden',
        crypt_evidence: 'act1.evidence_lead',
        crypt_entrance: 'act1.crypt_entrance'
      };
      const feature = this.activeStoryFeatures.find(entry => entry.id === featureIds[beat.markerId]);
      const position = beat.markerId === 'warden_vesna' && state.zone === 'wilderness'
        ? WARDEN_POSITION : beat.markerId === 'crypt_boss_chamber' && state.zone === 'crypt'
          ? CRYPT_BOSS_POSITIONS[0] : state.zone === 'wilderness' ? feature?.position : undefined;
      if (position) {
        const pulse = 38 + Math.sin(this.time.now * 0.003) * 6;
        this.statusVisuals.lineStyle(4, 0xf4ca7f, 0.88).strokeCircle(position.x, position.y, pulse);
        this.statusVisuals.fillStyle(0xf4ca7f, 0.86).fillTriangle(
          position.x - 8, position.y - pulse - 25,
          position.x + 8, position.y - pulse - 25,
          position.x, position.y - pulse - 10
        );
      }
    }
    if (animation === 'channeling' || animation === 'casting') {
      const progress = (state.warriorAction?.timeline ?? state.classAction?.timeline)?.elapsedTicks ?? 0;
      this.statusVisuals.lineStyle(2, animation === 'channeling' ? 0xe5b56a : 0xc8ceee, 0.65)
        .strokeCircle(state.player.x, state.player.y, 27 + Math.sin(progress * 0.12) * 4);
    }
    if (state.zone === 'wilderness' && this.hoveredId) {
      const npc = townEntry(this.hoveredId)?.position;
      if (npc) this.statusVisuals.lineStyle(2, 0xf3d49e, 0.86)
        .strokeCircle(npc.x, npc.y, 34);
    }
    const portal = state.zone === 'wilderness' ? CRYPT_GATE : CRYPT_EXIT;
    if (this.hoveredId === 'crypt-portal') {
      this.statusVisuals.lineStyle(3, 0xb8e6dc, 0.85)
        .strokeCircle(portal.x, portal.y, 66);
    }
    for (const unit of state.enemies) {
      const { actor, intent } = unit;
      if (!actor.alive) continue;
      if (intent) {
        const progress = Math.max(0, 1 - intent.remaining / intent.total);
        this.telegraph.fillStyle(0xde504e, 0.12 + progress * 0.24)
          .fillCircle(intent.x, intent.y, intent.radius);
        this.telegraph.lineStyle(3 + progress * 3, 0xf5b38b, 0.5 + progress * 0.5)
          .strokeCircle(intent.x, intent.y, intent.radius);
        this.telegraph.fillStyle(0xffd3a7, 0.55 + progress * 0.4)
          .fillCircle(intent.x, intent.y, 4);
        // Static four-point ticks remain readable at small mobile viewport
        // sizes, even without depending on the warning's red fill.
        const edge = Math.max(8, intent.radius);
        const tick = Math.min(12, Math.max(5, edge * 0.2));
        this.telegraph.lineStyle(4, 0x101722, 0.96);
        for (const sign of [-1, 1]) {
          this.telegraph.lineBetween(intent.x + sign * (edge - tick), intent.y,
            intent.x + sign * edge, intent.y);
          this.telegraph.lineBetween(intent.x, intent.y + sign * (edge - tick),
            intent.x, intent.y + sign * edge);
        }
        this.telegraph.lineStyle(2, 0xffe0a9, 0.96);
        for (const sign of [-1, 1]) {
          this.telegraph.lineBetween(intent.x + sign * (edge - tick), intent.y,
            intent.x + sign * edge, intent.y);
          this.telegraph.lineBetween(intent.x, intent.y + sign * (edge - tick),
            intent.x, intent.y + sign * edge);
        }
      }
      if (unit.elite) {
        this.statusVisuals.lineStyle(3, 0xefbd67, 0.95)
          .strokeEllipse(actor.x, actor.y + 6, 74, 56);
        if (unit.elite.modifiers.includes('fireAura')) {
          this.statusVisuals.lineStyle(2, 0xf07742, 0.45)
            .strokeCircle(actor.x, actor.y, 105);
        }
        if (unit.elite.shield > 0) {
          this.statusVisuals.lineStyle(3, 0x82c8fa, 0.72)
            .strokeCircle(actor.x, actor.y, 35);
        }
      }
      this.drawStatuses(actor.x,actor.y,state.statusEffects?.enemies?.[actor.id] ?? []);
      this.healthBar.fillStyle(0x080a10, 0.9)
        .fillRect(actor.x - 26, actor.y - 45, 52, 8);
      this.healthBar.fillStyle(0xa3494c)
        .fillRect(actor.x - 24, actor.y - 43, 48 * (actor.health / actor.maxHealth), 4);
      if (this.hoveredId === actor.id) {
        this.healthBar.lineStyle(2, 0xf5dbb8, 0.8)
          .strokeEllipse(actor.x, actor.y + 8, 70, 48);
      }
      if (state.selectedTargetId === actor.id) {
        this.healthBar.lineStyle(2, 0xf0c783, 0.95).strokeEllipse(actor.x, actor.y + 8, 63, 43);
        this.healthBar.lineStyle(1, 0xf6e0ae, 0.75)
          .strokeRect(actor.x - 30, actor.y - 49, 60, 16);
      }
    }
    if (state.effects.player.some(effect => effect.id === 'consecration')) {
      this.statusVisuals.lineStyle(3, 0xffe0a1, 0.48)
        .strokeCircle(state.player.x, state.player.y, 105);
    }
    if (state.effects.player.some(effect => effect.id === 'skeleton')) {
      this.statusVisuals.fillStyle(0x79d0bc, 0.65)
        .fillCircle(state.player.x - 32, state.player.y + 30, 10);
      this.statusVisuals.fillStyle(0x0b2830, 1)
        .fillCircle(state.player.x - 35, state.player.y + 27, 2)
        .fillCircle(state.player.x - 29, state.player.y + 27, 2);
    }
    this.interactableVisuals.clear();
    for (const prop of state.cryptInteractables ?? []) {
      const x = prop.position.x, y = prop.position.y;
      const chest = prop.capability === 'lootContainer';
      this.interactableVisuals.fillStyle(chest ? 0x75522f : 0x5b5368, 0.97)
        .fillRoundedRect(x - 13, y - 11, 26, 22, 4);
      this.interactableVisuals.lineStyle(2, chest ? 0xe5bb73 : 0xc1b2b1, 0.88)
        .strokeRoundedRect(x - 13, y - 11, 26, 22, 4);
      if (this.hoveredId === prop.id) {
        this.interactableVisuals.lineStyle(3, 0xffd38d)
          .strokeCircle(x, y, prop.hitRadius + 5);
      }
    }
    for(const object of state.environmentObjects??[]) {
      const x=object.position.x,y=object.position.y;
      const shrine=object.kind==='shrine',door=object.kind==='door'
        ||object.kind==='lockedDoor'||object.kind==='hiddenWall';
      const color=shrine?0x6a9e89:door?0x88746c:object.kind==='trap'?0x9e655e
        :object.kind==='lore'?0x8a8eaa:0x986f47;
      this.interactableVisuals.fillStyle(0x101a20,.72).fillEllipse(x,y+15,35,11);
      this.interactableVisuals.fillStyle(color,.94);
      if(door) {
        this.interactableVisuals.fillRoundedRect(x-15,y-19,30,38,4);
        this.interactableVisuals.lineStyle(3,0xc4ae88,.88)
          .strokeRoundedRect(x-15,y-19,30,38,4);
        this.interactableVisuals.fillStyle(0xf4d898).fillCircle(x+7,y+1,3);
      } else if(shrine) {
        this.interactableVisuals.fillTriangle(x-15,y+17,x+15,y+17,x,y-24);
        this.interactableVisuals.lineStyle(2,0xb6e4b8).strokeCircle(x,y,21);
      } else if(object.kind==='trap') {
        this.interactableVisuals.fillTriangle(x-16,y+12,x+16,y+12,x,y-16);
      } else {
        this.interactableVisuals.fillRoundedRect(x-14,y-13,28,26,3);
        this.interactableVisuals.lineStyle(2,0xebd3a0,.84)
          .strokeRoundedRect(x-14,y-13,28,26,3);
        if(object.kind==='lore') {
          this.interactableVisuals.lineStyle(2,0xe1d7b6).lineBetween(x-8,y-4,x+8,y-4);
          this.interactableVisuals.lineBetween(x-8,y+3,x+8,y+3);
        }
      }
      if(this.hoveredId===object.id) {
        this.interactableVisuals.lineStyle(3,0xffd38d).strokeCircle(x,y,object.hitRadius+5);
      }
    }
    for (const object of state.interactables) {
      const x = object.position.x, y = object.position.y;
      if (object.kind === 'chest') {
        this.interactableVisuals.fillStyle(0x59432e).fillRoundedRect(x - 22, y - 13, 44, 27, 4);
        this.interactableVisuals.lineStyle(3, 0xb69b62).strokeRoundedRect(x - 22, y - 13, 44, 27, 4);
        this.interactableVisuals.fillStyle(0xe4c879).fillRect(x - 4, y - 4, 8, 12);
      } else {
        this.interactableVisuals.fillStyle(0x556b66, 0.75).fillCircle(x, y, 22);
        this.interactableVisuals.lineStyle(3, 0xa7d4b9).strokeCircle(x, y, 20);
      }
      if (this.hoveredId === object.id) {
        this.interactableVisuals.lineStyle(3, 0xffd38d).strokeCircle(x, y, object.hitRadius);
      }
    }
    this.projectileVisuals.clear();
    for (const missile of state.projectiles) {
      const color = missile.type === 'shadow' ? 0xa78bcd
        : missile.type === 'frost' ? 0x7fd6f4
        : missile.type === 'poison' ? 0x80d48a
        : missile.type === 'holy' ? 0xf2d887 : 0xe8a25f;
      this.projectileVisuals.fillStyle(color, 0.25).fillCircle(missile.x, missile.y, 14);
      this.projectileVisuals.fillStyle(color, 0.95).fillCircle(missile.x, missile.y, 6);
    }
    this.debugMarkers.clear();
    if (this.debugMovement && state.moveDestination) {
      const p = state.moveDestination;
      this.debugMarkers.lineStyle(2, 0x76d9af, 0.85).strokeCircle(p.x, p.y, 12);
      this.debugMarkers.lineStyle(1, 0x76d9af, 0.65)
        .lineBetween(state.player.x, state.player.y, p.x, p.y);
    }
    this.drawStatuses(state.player.x,state.player.y,state.statusEffects?.player ?? []);
    if (state.player.alive && (state.respawnProtectionSeconds ?? 0) > 0) {
      const pulse = 28 + Math.sin(this.time.now * 0.012) * 3;
      this.statusVisuals.lineStyle(3, 0x8fd9bf, 0.75)
        .strokeCircle(state.player.x, state.player.y, pulse);
    }
    if (state.shield > 0 && !(state.statusEffects?.player.some(s=>s.id==='shielded'))) {
      this.statusVisuals.lineStyle(3, 0x8dc6f6, 0.65)
        .strokeCircle(state.player.x, state.player.y, 27);
    }
    this.groundItems.clear();
    const visibleDrops = this.bridge.visibleGroundLoot(state);
    const activeDrops = new Set(visibleDrops.map(drop => drop.id));
    for (const [id, label] of this.groundLabels) {
      if (activeDrops.has(id)) continue;
      label.destroy();
      this.groundLabels.delete(id);
    }
    const translateItem = get(translate);
    const language = get(locale) ?? 'en';
    for (const drop of visibleDrops) {
      const hex = RARITIES[drop.item.rarity].color.replace('#', '');
      const color = Number.parseInt(hex, 16);
      if (this.hoveredId === drop.id) {
        this.groundItems.lineStyle(3, 0xffdc8d).strokeCircle(drop.x, drop.y, 25);
      }
      this.groundItems.lineStyle(4, color, 0.35)
        .lineBetween(drop.x, drop.y - 10, drop.x, drop.y - 44);
      this.groundItems.fillStyle(color, 0.13).fillCircle(drop.x, drop.y, 21);
      this.groundItems.lineStyle(2, color, 0.95).strokeCircle(drop.x, drop.y, 17);
      this.groundItems.fillStyle(color).fillRect(drop.x - 7, drop.y - 7, 14, 14);
      this.groundItems.lineStyle(2, 0xece6d7, 0.5).strokeRect(drop.x - 7, drop.y - 7, 14, 14);
      let label = this.groundLabels.get(drop.id);
      if (!label) {
        label = this.add.text(drop.x, drop.y - 58, '', {
          fontFamily: 'Georgia, serif', fontSize: '12px', color: '#' + hex,
          stroke: '#090c11', strokeThickness: 3, align: 'center'
        }).setOrigin(0.5).setDepth(55);
        this.groundLabels.set(drop.id, label);
      }
      label.setPosition(drop.x, drop.y - 58).setColor('#' + hex).setText(
        itemDisplayName(drop.item, language,
          translateItem('item.base.' + drop.item.templateId))
      );
    }

  }


  /** Release all visible tile resources on zone change, reset and scene shutdown. */
  private releaseChunkGraphics(): void {
    for (const graphics of this.chunkGraphics.values()) graphics.destroy();
    this.chunkGraphics.clear();
    this.activeChunkIds = [];
    this.streamIndex = null;
    this.nextStreamUpdate = 0;
  }

  /**
   * Apply a bounded chunk delta, not a full-world repaint.
   * Only active chunks own terrain/road/wall Graphics. The authoritative
   * collision layout remains held by GameSimulation, never by this adapter.
   */
  private advanceChunkGraphics(player: Point, budget: number): void {
    if (!this.streamIndex) return;
    const plan = planVisibleChunks(this.streamIndex, player, this.activeChunkIds, {
      loadRadius: 1, unloadRadius: 2, loadBudget: budget, unloadBudget: budget
    });
    if (!plan.ok) return;
    for (const id of plan.unload) {
      this.chunkGraphics.get(id)?.destroy();
      this.chunkGraphics.delete(id);
    }
    for (const id of plan.load) {
      const chunk = this.streamIndex.chunks.find(candidate => candidate.id === id);
      if (!chunk || this.chunkGraphics.has(id)) continue;
      const graphics = this.add.graphics().setDepth(-90);
      this.paintChunk(graphics, chunk);
      this.chunkGraphics.set(id, graphics);
    }
    this.activeChunkIds = [...plan.nextActive];
  }

  private paintChunk(g: Phaser.GameObjects.Graphics, chunk: ChunkManifest): void {
    const palette: Record<string, number> = {
      town_clearing: 0x25302e, dark_grass: 0x1b2928,
      dead_leaves: 0x293029, corrupted_soil: 0x342729,
      broken_stone: 0x343536, dirt_road: 0x3b382f
    };
    for (const tile of chunk.tiles) {
      g.fillStyle(palette[tile.terrainId] ?? 0x172222, 0.72 + tile.variant * 0.06);
      g.fillRect(tile.x, tile.y, tile.width, tile.height);
    }
    // Paths are ground, not golden quest arrows. Small deterministic bends,
    // soft soil edges and muted earth tones keep roads readable without UI-like lines.
    for (const segment of chunk.roads) {
      const dx = segment.to.x - segment.from.x;
      const dy = segment.to.y - segment.from.y;
      const length = Math.hypot(dx, dy);
      if (length < 0.1) continue;
      const points: Point[] = [];
      const steps = Math.max(3, Math.ceil(length / 35));
      const bend = Math.min(9, segment.width * 0.15);
      const nx = -dy / length, ny = dx / length;
      const phase = (segment.from.x * 0.019 + segment.to.y * 0.027) % 6.28;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const offset = Math.sin(Math.PI * t) * Math.sin(t * 7.2 + phase) * bend;
        points.push({
          x: segment.from.x + dx * t + nx * offset,
          y: segment.from.y + dy * t + ny * offset
        });
      }
      for (const stroke of [
        { width: segment.width + 8, color: 0x101711, alpha: 0.18 },
        { width: segment.width, color: 0x483d32, alpha: 0.50 },
        { width: segment.width * 0.70, color: 0x392f27, alpha: 0.36 }
      ]) {
        g.lineStyle(stroke.width, stroke.color, stroke.alpha);
        g.beginPath();
        g.moveTo(points[0]!.x, points[0]!.y);
        for (const point of points.slice(1)) g.lineTo(point.x, point.y);
        g.strokePath();
      }
    }
    for (const wall of chunk.obstacles) {
      if (wall.id === 'shrine') continue;
      g.fillStyle(0x48515a, 0.96)
        .fillRoundedRect(wall.x, wall.y, wall.width, wall.height, 5);
      g.lineStyle(3, 0x747c7e, 0.75)
        .strokeRoundedRect(wall.x, wall.y, wall.width, wall.height, 5);
    }
    // Decorations are deterministic for this chunk and discarded on unload.
    let state = chunk.seed;
    const rand = (): number => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    for (let i = 0; i < 14; i++) {
      const x = chunk.bounds.minX + rand() * (chunk.bounds.maxX - chunk.bounds.minX);
      const y = chunk.bounds.minY + rand() * (chunk.bounds.maxY - chunk.bounds.minY);
      if (Math.hypot(x - 390, y - 470) < CAMP_RADIUS + 45) continue;
      const size = 12 + rand() * 17;
      g.fillStyle(0x0a1117, 0.45).fillEllipse(x + 6, y + 8, size * 2, 13);
      g.fillStyle(0x34443d, 0.88)
        .fillTriangle(x - size, y + 5, x + size, y + 5, x, y - size * 1.8);
    }
    if (chunk.anchors.some(anchor => anchor.kind === 'camp')) {
      g.fillStyle(0x151f22, 0.88).fillCircle(390, 470, CAMP_RADIUS);
      g.lineStyle(4, 0x8a7956, 0.84)
        .strokeCircle(390, 470, CAMP_RADIUS - 9);
      g.fillStyle(0xdb793d, 0.92).fillCircle(422, 532, 13);
    }
    const featureIds = new Set(chunk.featureIds);
    for (const feature of this.activeStoryFeatures) {
      if (!featureIds.has(feature.id) || feature.kind === 'cryptEntrance') continue;
      const color = feature.kind === 'graveyard' ? 0xa6a2a8
        : feature.kind === 'evidence' ? 0xd3b273
        : feature.kind === 'miniBoss' ? 0xc77580
        : feature.kind === 'forest' ? 0x718f6b
        : feature.kind === 'corruption' ? 0xa36aa0 : 0x79958b;
      const radius = Math.min(30, feature.radius * 0.5);
      g.fillStyle(color, feature.mandatory ? 0.25 : 0.12)
        .fillCircle(feature.position.x, feature.position.y, radius);
      g.lineStyle(feature.mandatory ? 3 : 1, color, 0.78)
        .strokeCircle(feature.position.x, feature.position.y, radius);
    }
    if (chunk.anchors.some(anchor => anchor.kind === 'cryptGate')) {
      this.paintPortal(g, CRYPT_GATE.x, CRYPT_GATE.y, 0x96afbc);
    }
  }

  private paintPortal(g: Phaser.GameObjects.Graphics, x: number, y: number, glow: number): void {
    g.fillStyle(0x090f17, 0.8).fillEllipse(x, y + 24, 115, 35);
    g.fillStyle(0x30343f).fillRoundedRect(x - 50, y - 45, 100, 69, 8);
    g.fillStyle(0x606a73).fillTriangle(x - 61, y - 44, x + 61, y - 44, x, y - 89);
    g.fillStyle(0x0d121e).fillEllipse(x, y - 14, 67, 99);
    g.fillStyle(glow, 0.2).fillEllipse(x, y - 14, 52, 82);
    g.lineStyle(4, glow, 0.85).strokeEllipse(x, y - 14, 54, 85);
    g.lineStyle(2, 0xd1d3c1, 0.45).strokeEllipse(x, y - 14, 75, 100);
  }

  private paintCrypt(
    g: Phaser.GameObjects.Graphics, seed: number,
    walls: readonly { x: number; y: number; width: number; height: number }[],
    dungeon: ProceduralDungeonResult, theme: CryptThemePlan
  ): void {
    g.fillStyle(0x0a0c14).fillRect(0, 0, WIDTH, HEIGHT);
    // Render only walkable tiles supplied by the same pure plan as collisions.
    // No decorative path is allowed to pass through an authoritative wall.
    const roomPalette: Record<DungeonRoomType, number> = {
      entrance: 0x343a3a, corridor: 0x2d323b, combat: 0x3b3034,
      elite: 0x45313b, event: 0x333c42, treasure: 0x4c4031,
      trap: 0x49363b, secret: 0x303b39, boss: 0x493038
    };
    const roomById = new Map(dungeon.rooms.map(room => [room.id, room]));
    for (const tile of dungeon.tiles) {
      if (tile.kind !== 'floor') continue;
      const room = tile.roomId ? roomById.get(tile.roomId) : undefined;
      const palette = room ? roomPalette[room.type] : 0x34313b;
      const shade = ((tile.x / 40 + tile.y / 40 + seed) % 4) * 0.035;
      g.fillStyle(palette, 0.76 + shade).fillRect(tile.x + 1, tile.y + 1, 38, 38);
      g.lineStyle(1, 0x786c76, 0.11)
        .strokeRect(tile.x + 2, tile.y + 2, 36, 36);
    }
    for (const door of dungeon.doors) {
      const color = door.kind === 'hidden' ? 0x64837c : 0x9b8481;
      g.lineStyle(3, color, door.kind === 'hidden' ? 0.42 : 0.7)
        .lineBetween(door.portalA.x, door.portalA.y,
          door.portalB.x, door.portalB.y);
    }
    for (const room of dungeon.rooms) {
      if (!room.feature) continue;
      const color = room.type === 'trap' ? 0xbd565c
        : room.type === 'treasure' ? 0xc8a46e
        : room.type === 'secret' ? 0x63968d
        : room.type === 'boss' ? 0xd28187 : 0x827c9f;
      g.lineStyle(room.type === 'boss' ? 4 : 2, color, 0.42)
        .strokeCircle(room.center.x, room.center.y, room.type === 'boss' ? 120 : 52);
    }
    for (const wall of walls) {
      g.fillStyle(0x42434f).fillRoundedRect(wall.x, wall.y, wall.width, wall.height, 4);
      g.lineStyle(3, 0x77727a, 0.85)
        .strokeRoundedRect(wall.x, wall.y, wall.width, wall.height, 4);
      if (wall.width > 120) {
        g.lineStyle(2, 0x232530, 0.8)
          .lineBetween(wall.x + 13, wall.y + 14, wall.x + wall.width - 13, wall.y + 14);
      }
    }

    // Agent31's seed-bound Corrupted Crypt theme overlays the same validated
    // room geometry as navigation. Props are visual/nonblocking until the
    // integrator's authoritative interactables and trap damage are connected.
    const themedRoomIds = new Set(dungeon.rooms.map(room => room.id));
    for (const visual of theme.roomVisuals) {
      if (!themedRoomIds.has(visual.roomId) || !visual.initiallyVisible) continue;
      const bounds = visual.bounds;
      g.lineStyle(2, visual.lighting.tint, Math.min(0.65, visual.lighting.intensity * 0.65))
        .strokeRoundedRect(bounds.x + 10, bounds.y + 10,
          Math.max(0, bounds.width - 20), Math.max(0, bounds.height - 20), 6);
      for (const layer of visual.layers) {
        if (layer.layer === 'lighting') {
          g.fillStyle(layer.fallback.color, Math.min(0.15, layer.fallback.alpha * 0.12))
            .fillCircle(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5, 80);
        }
      }
    }
    for (const prop of theme.props) {
      if (prop.capability !== 'decorative') continue;
      if (!theme.roomVisuals.find(room => room.roomId === prop.roomId)?.initiallyVisible) continue;
      const x = prop.position.x, y = prop.position.y, r = prop.footprintRadius;
      const color = prop.fallback.color;
      g.fillStyle(0x070a10, 0.6).fillEllipse(x + 3, y + 5, r * 2.5, r * 1.1);
      if (prop.kind === 'lantern' || prop.kind === 'candelabrum') {
        g.fillStyle(0xb5a99c, 0.9).fillRect(x - 3, y - r, 6, r + 8);
        g.fillStyle(0xeec888, 0.28).fillCircle(x, y - r, 20);
        g.fillStyle(0xffd093, 0.87).fillCircle(x, y - r, 5);
      } else if (prop.kind === 'coffin' || prop.kind === 'sarcophagus') {
        g.fillStyle(0x373f45, 0.92).fillRoundedRect(x - r, y - r / 2, r * 2, r * 1.3, 3);
        g.lineStyle(3, color, 0.76).strokeRoundedRect(x - r, y - r / 2, r * 2, r * 1.3, 3);
      } else if (prop.kind === 'treasureChest') {
        g.fillStyle(0x6a492d, 0.98).fillRoundedRect(x - r, y - r, r * 2, r * 1.65, 4);
        g.lineStyle(3, 0xd3ae65, 0.85).strokeRoundedRect(x - r, y - r, r * 2, r * 1.65, 4);
        g.fillStyle(0xe7c880, 0.94).fillCircle(x, y - 2, 3);
      } else {
        g.fillStyle(color, prop.fallback.alpha).fillCircle(x, y, r * 0.8);
        g.lineStyle(2, 0xb2a6a1, 0.65).strokeCircle(x, y, r * 0.9);
      }
    }
    for (const trap of theme.traps) {
      g.lineStyle(2, trap.kind === 'poison' ? 0x80b57f
        : trap.kind === 'runic' ? 0x9982bd : 0xb46d67, 0.5)
        .strokeCircle(trap.trigger.center.x, trap.trigger.center.y, trap.trigger.radius);
    }

    // Boss arena sigil and the return portal.
    const boss = dungeon.bossSpawn;
    g.lineStyle(5, 0xa24f58, 0.52).strokeCircle(boss.x, boss.y, 174);
    g.lineStyle(2, 0xcf8584, 0.48).strokeCircle(boss.x, boss.y, 141);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      g.fillStyle(0xb56c65, 0.65)
        .fillCircle(boss.x + Math.cos(a) * 155, boss.y + Math.sin(a) * 155, 5);
    }
    this.paintPortal(g, CRYPT_EXIT.x, CRYPT_EXIT.y, 0xa4c7b0);
    g.lineStyle(12, 0x6a656d, 0.8).strokeRect(6, 6, WIDTH - 12, HEIGHT - 12);
  }

  private paintWorld(worldSeed: number, zone: ZoneId): void {
    const wilderness = zone === 'wilderness' ? buildWilderness(worldSeed) : null;
    const crypt = zone === 'crypt' ? buildCryptWorld(worldSeed) : null;
    const layout = crypt?.layout ?? wilderness!.layout;
    if (!this.terrain) this.terrain = this.add.graphics().setDepth(-100);
    const ground = this.terrain;
    ground.clear();
    this.releaseChunkGraphics();
    this.renderedSeed = worldSeed;
    this.renderedZone = zone;
    this.activeObstacles = layout.obstacles;
    this.activeStoryFeatures = wilderness?.features ?? [];
    if (zone === 'crypt') {
      this.paintCrypt(ground, worldSeed, layout.obstacles, crypt!.dungeon, crypt!.theme);
      return;
    }
    ground.fillStyle(0x10161d).fillRect(0, 0, WIDTH, HEIGHT);
    this.streamIndex = createChunkIndex(wilderness!);
    this.advanceChunkGraphics(this.bridge.snapshot().player, 9);
  }
}
