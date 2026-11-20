import Phaser from 'phaser';
import { get } from 'svelte/store';
import { _ as translate } from 'svelte-i18n';
import { planCombatVfx } from './combatVfxPlan';
import type { GameBridge } from '../bridge/GameBridge';
import { CLASSES } from '../data/classes';
import { RARITIES } from '../data/items';
import { SKILLS } from '../skills/skills';
import type { GameEvent, ZoneId, Point } from '../core/types';
import {
  resolvePointerContext, contextToCommand, cursorForContext,
  type ContextTarget, type ResolvedPointerContext
} from '../input/contextResolver';
import { resolvePointerAction } from '../input/bindings';
import { HeldPointerMovement } from '../input/heldMovement';
import { playerAnimation } from '../entities/playerAnimation';
import {
  PIXEL_ANIMATIONS, PIXEL_ANIMATION_FRAMES, PIXEL_FRAME_HEIGHT, PIXEL_FRAME_WIDTH,
  pixelAtlasKey, pixelFrame, renderPixelAtlas, type PixelActor, type PixelAnimation
} from './pixelSpriteAtlas';
import { ACTOR_RADIUS, canOccupy, type Obstacle } from '../world/navigation';
import { ENEMY_DEFINITIONS, type EnemyType } from '../enemies/enemies';
import {
  CAMP_RADIUS, CRYPT_GATE, CRYPT_EXIT, CRYPT_BOSS_POSITIONS,
  generateWorld, generateCrypt
} from '../world/generator';
import {
  WARDEN_POSITION, NPC_POSITIONS, MERCHANT_ID, BLACKSMITH_ID, type NpcId
} from '../world/npcs';

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
  private readonly enemyPositions = new Map<string, Point>();
  private readonly enemyDeadUntil = new Map<string, number>();
  private heroDeadUntil = 0;
  private wardenMarker!: Phaser.GameObjects.Text;
  private readonly enemyGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  private readonly impactPool: Phaser.GameObjects.Graphics[] = [];
  private readonly enemyHitUntil = new Map<string, number>();
  private heroHitUntil = 0;
  private readonly campDecor: Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Text> = [];
  private healthBar!: Phaser.GameObjects.Graphics;
  private groundItems!: Phaser.GameObjects.Graphics;
  private statusVisuals!: Phaser.GameObjects.Graphics;
  private telegraph!: Phaser.GameObjects.Graphics;
  private terrain!: Phaser.GameObjects.Graphics;
  private renderedSeed: number | null = null;
  private renderedZone: ZoneId | null = null;
  private activeObstacles: readonly Obstacle[] = [];
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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.onWorldClick, this);
      this.input.off('pointermove', this.onPointerHover, this);
      this.input.off('pointerup', this.onPointerRelease, this);
      this.input.off('gameout', this.onPointerCancel, this);
      this.heldMovement.release();
      this.game.canvas.style.cursor = 'default';
      unsubscribeEvents();
      for (const actor of this.enemyGraphics.values()) actor.destroy();
      this.enemyGraphics.clear();
      for (const actor of this.enemySprites.values()) actor.destroy();
      this.enemySprites.clear();
      this.enemyPositions.clear();
      this.enemyDeadUntil.clear();
      this.heroSprite.destroy();
      for (const graphic of this.impactPool) graphic.destroy();
      this.impactPool.length = 0;
      this.enemyHitUntil.clear();
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
      ...state.interactables.map(object => ({
        kind: 'INTERACTABLE' as const, id: object.id,
        position: object.position, hitRadius: object.hitRadius
      })),
      ...state.groundLoot.map(drop => ({
        kind: 'LOOT' as const, id: drop.id, position: { x: drop.x, y: drop.y }, hitRadius: 30
      })),
      ...state.enemies.map(unit => ({
        kind: 'ENEMY' as const, id: unit.actor.id,
        position: { x: unit.actor.x, y: unit.actor.y },
        hitRadius: unit.actor.type === 'crypt_lord' ? 58 : 43, alive: unit.actor.alive
      }))
    ];
    if (state.zone === 'wilderness') {
      for (const id of Object.keys(NPC_POSITIONS) as NpcId[]) {
        targets.push({ kind: 'NPC', id, position: NPC_POSITIONS[id], hitRadius: 40 });
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
    if (event.type === 'cast') {
      const definition = Object.values(SKILLS)
        .flatMap(kit => Object.values(kit))
        .find(skill => skill.id === event.skillId);
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
      const ring = this.obtainImpact(event.x, event.y, 86);
      ring.lineStyle(5, 0xf4ce80, 0.95).strokeCircle(0, 0, 35);
      this.tweens.add({
        targets: ring, alpha: 0, scaleX: 2.3, scaleY: 2.3, duration: 280,
        onComplete: () => this.releaseImpact(ring)
      });
    } else if (event.type === 'damageResolved') {
      const state = this.bridge.snapshot();
      const actor = event.targetId === 'hero' ? state.player
        : state.enemies.find(unit => unit.actor.id === event.targetId)?.actor;
      if (!actor) return;
      if (event.damage > 0) {
        if (event.targetId === 'hero') this.heroHitUntil = this.time.now + 140;
        else this.enemyHitUntil.set(event.targetId, this.time.now + 140);
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
    this.wardenMarker.setText(state.quest.status === 'ready' ? '?'
      : state.quest.status === 'available' ? '!' : '·');
    this.wardenMarker.setVisible(state.zone === 'wilderness' && state.quest.status !== 'completed');
    this.hero.setVisible(false);
    const visualPose = this.time.now < this.heroHitUntil ? 'hit' : this.pixelPose(animation);
    const castTicks = state.warriorAction?.timeline ?? state.classAction?.timeline;
    const heroFrame = castTicks && (visualPose === 'attack' || visualPose === 'cast'
      || visualPose === 'channel')
      ? this.timedFrame(castTicks.elapsedTicks, castTicks.totalTicks ?? 1)
      : Math.floor(this.time.now / (visualPose === 'run' ? 95 : 150)) % PIXEL_ANIMATION_FRAMES;
    this.heroSprite.setFrame(pixelFrame(visualPose, heroFrame));
    this.heroSprite.setVisible(state.player.alive || this.time.now < this.heroDeadUntil);
    this.heroSprite.setAlpha(this.time.now < this.heroHitUntil ? 0.6 : 1);
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

    this.healthBar.clear();
    this.telegraph.clear();
    this.statusVisuals.clear();
    if (animation === 'channeling' || animation === 'casting') {
      const progress = state.warriorAction?.timeline.elapsedTicks ?? 0;
      this.statusVisuals.lineStyle(2, animation === 'channeling' ? 0xe5b56a : 0xc8ceee, 0.65)
        .strokeCircle(state.player.x, state.player.y, 27 + Math.sin(progress * 0.12) * 4);
    }
    if (state.zone === 'wilderness' && this.hoveredId) {
      const npc = NPC_POSITIONS[this.hoveredId as NpcId];
      if (npc) this.statusVisuals.lineStyle(2, 0xf3d49e, 0.86)
        .strokeCircle(npc.x, npc.y, 34);
    }
    const portal = state.zone === 'wilderness' ? CRYPT_GATE : CRYPT_EXIT;
    if (this.hoveredId === 'crypt-portal') {
      this.statusVisuals.lineStyle(3, 0xb8e6dc, 0.85)
        .strokeCircle(portal.x, portal.y, 66);
    }
    for (const unit of state.enemies) {
      const { actor, intent, effects } = unit;
      if (!actor.alive) continue;
      if (intent) {
        const progress = Math.max(0, 1 - intent.remaining / intent.total);
        this.telegraph.fillStyle(0xde504e, 0.12 + progress * 0.24)
          .fillCircle(intent.x, intent.y, intent.radius);
        this.telegraph.lineStyle(3 + progress * 3, 0xf5b38b, 0.5 + progress * 0.5)
          .strokeCircle(intent.x, intent.y, intent.radius);
        this.telegraph.fillStyle(0xffd3a7, 0.55 + progress * 0.4)
          .fillCircle(intent.x, intent.y, 4);
      }
      const canonicalEffects = state.statusEffects?.enemies?.[actor.id] ?? [];
      if (canonicalEffects.some(effect => effect.id === 'fortified')) {
        this.statusVisuals.lineStyle(3, 0x9ac7ee, 0.9).strokeCircle(actor.x, actor.y, 33);
      }
      if (canonicalEffects.some(effect => effect.id === 'poisoned')) {
        this.statusVisuals.fillStyle(0x73d478, 0.24).fillCircle(actor.x, actor.y, 31);
      }
      if (effects.some(effect => effect.id === 'stunned')) {
        this.statusVisuals.lineStyle(4, 0xf6cc73, 0.95)
          .strokeCircle(actor.x, actor.y, 30);
      } else if (effects.some(effect => effect.id === 'chilled')) {
        this.statusVisuals.lineStyle(4, 0x89d8ff, 0.8)
          .strokeCircle(actor.x, actor.y, 28);
      }
      if (effects.some(effect => effect.id === 'burning')) {
        this.statusVisuals.fillStyle(0xff7041, 0.22).fillCircle(actor.x, actor.y, 31);
      }
      if (effects.some(effect => effect.id === 'poisoned')) {
        this.statusVisuals.fillStyle(0x73d478, 0.24).fillCircle(actor.x, actor.y, 31);
      }
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
      const color = missile.type === 'shadow' ? 0xa78bcd : 0xe8a25f;
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
    if (state.shield > 0) {
      this.statusVisuals.lineStyle(3, 0x8dc6f6, 0.65)
        .strokeCircle(state.player.x, state.player.y, 27);
    }
    this.groundItems.clear();
    for (const drop of state.groundLoot) {
      const hex = RARITIES[drop.item.rarity].color.replace('#', '');
      const color = Number.parseInt(hex, 16);
      if (this.hoveredId === drop.id) {
        this.groundItems.lineStyle(3, 0xffdc8d).strokeCircle(drop.x, drop.y, 25);
      }
      this.groundItems.fillStyle(color, 0.13).fillCircle(drop.x, drop.y, 21);
      this.groundItems.lineStyle(2, color, 0.95).strokeCircle(drop.x, drop.y, 17);
      this.groundItems.fillStyle(color).fillRect(drop.x - 7, drop.y - 7, 14, 14);
      this.groundItems.lineStyle(2, 0xece6d7, 0.5).strokeRect(drop.x - 7, drop.y - 7, 14, 14);
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
    walls: readonly { x: number; y: number; width: number; height: number }[]
  ): void {
    g.fillStyle(0x0a0c14).fillRect(0, 0, WIDTH, HEIGHT);
    let state = (seed ^ 0x7aa0b1c3) >>> 0;
    const random = () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    for (let y = 0; y < HEIGHT; y += 52) {
      for (let x = 0; x < WIDTH; x += 52) {
        g.fillStyle(random() > 0.5 ? 0x1b1f29 : 0x24232e, 0.95)
          .fillRect(x + 1, y + 1, 50, 50);
        if (random() < 0.10) {
          g.lineStyle(2, 0x4d4050, 0.32)
            .lineBetween(x + 8, y + 9, x + 37, y + 31);
        }
      }
    }
    // Worn central processional path towards the tomb throne.
    g.fillStyle(0x37303b, 0.55)
      .fillRoundedRect(230, 560, 1490, 248, 35);
    g.lineStyle(3, 0x6b515c, 0.4)
      .strokeRoundedRect(235, 566, 1480, 238, 30);
    for (const wall of walls) {
      g.fillStyle(0x42434f).fillRoundedRect(wall.x, wall.y, wall.width, wall.height, 4);
      g.lineStyle(3, 0x77727a, 0.85)
        .strokeRoundedRect(wall.x, wall.y, wall.width, wall.height, 4);
      if (wall.width > 120) {
        g.lineStyle(2, 0x232530, 0.8)
          .lineBetween(wall.x + 13, wall.y + 14, wall.x + wall.width - 13, wall.y + 14);
      }
    }
    // Boss arena sigil and the return portal.
    const boss = CRYPT_BOSS_POSITIONS[0]!;
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
    const layout = zone === 'crypt' ? generateCrypt(worldSeed) : generateWorld(worldSeed);
    if (!this.terrain) this.terrain = this.add.graphics().setDepth(-100);
    const ground = this.terrain;
    ground.clear();
    this.renderedSeed = worldSeed;
    this.renderedZone = zone;
    this.activeObstacles = layout.obstacles;
    if (zone === 'crypt') {
      this.paintCrypt(ground, worldSeed, layout.obstacles);
      return;
    }
    ground.fillStyle(0x131921).fillRect(0, 0, WIDTH, HEIGHT);

    // Deterministic visual variations; cosmetic only, never collision/loot state.
    let seed = (worldSeed ^ 0x8237ab19) >>> 0;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let y = 0; y < HEIGHT; y += 48) {
      for (let x = 0; x < WIDTH; x += 48) {
        const shades = [0x1a2429, 0x1e292c, 0x202b2f, 0x182228];
        ground.fillStyle(shades[Math.floor(random() * shades.length)], 0.6)
          .fillRect(x, y, 47, 47);
        if (random() < 0.2) {
          ground.fillStyle(0x475345, 0.35).fillRect(x + 9, y + 25, 4, 7);
        }
      }
    }

    // A safe encampment is the hero's spawn and re-entry point.
    const camp = layout.camp;
    ground.fillStyle(0x151f22, 0.96).fillCircle(camp.x, camp.y, CAMP_RADIUS);
    ground.lineStyle(5, 0x8a7956, 0.82)
      .strokeCircle(camp.x, camp.y, CAMP_RADIUS - 9);
    ground.lineStyle(2, 0xc9aa73, 0.42)
      .strokeCircle(camp.x, camp.y, CAMP_RADIUS - 22);
    // Dark tents, banners and a central brazier. Purely cosmetic.
    for (const dx of [-105, 110]) {
      ground.fillStyle(0x111823).fillEllipse(camp.x + dx, camp.y - 82, 69, 18);
      ground.fillStyle(0x46515a).fillTriangle(
        camp.x + dx - 33, camp.y - 78,
        camp.x + dx + 33, camp.y - 78,
        camp.x + dx, camp.y - 122);
      ground.lineStyle(3, 0x9b8767, 0.65).lineBetween(
        camp.x + dx, camp.y - 78, camp.x + dx, camp.y - 122);
    }
    ground.fillStyle(0x0b1017).fillCircle(camp.x + 34, camp.y + 65, 24);
    ground.lineStyle(5, 0x6d5345).strokeCircle(camp.x + 34, camp.y + 65, 21);
    ground.fillStyle(0xdb793d, 0.92).fillTriangle(
      camp.x + 21, camp.y + 68, camp.x + 47, camp.y + 68, camp.x + 34, camp.y + 32);
    ground.fillStyle(0xffd49a, 0.86).fillTriangle(
      camp.x + 26, camp.y + 64, camp.x + 42, camp.y + 64, camp.x + 34, camp.y + 44);

    // A pale trade route leads toward the first encounter.
    ground.fillStyle(0x34352f, 0.7).fillRoundedRect(230, 425, 1080, 160, 60);
    ground.lineStyle(2, 0x505147, 0.45).strokeRoundedRect(235, 429, 1070, 150, 60);

    for (let i = 0; i < 120; i++) {
      const x = 60 + random() * (WIDTH - 120);
      const y = 60 + random() * (HEIGHT - 120);
      if (y > 350 && y < 660 && x < 1400) continue;
      const size = 12 + random() * 24;
      ground.fillStyle(0x090f14, 0.5).fillEllipse(x + 7, y + 8, size * 2.2, 14);
      ground.fillStyle(0x202d2c).fillTriangle(x - size, y + 7, x + size, y + 7, x, y - size * 1.8);
      ground.fillStyle(0x34443d).fillTriangle(x - size * 0.7, y, x + size * 0.7, y, x, y - size * 1.8);
      if (random() < 0.15) {
        ground.fillStyle(0x64745a, 0.25).fillCircle(x, y - size * 0.6, size * 0.55);
      }
    }

    // Walkability and visuals share the same authoritative obstacle definitions.
    for (const wall of layout.obstacles) {
      if (wall.id === 'shrine') continue;
      ground.fillStyle(0x48515a, 0.95)
        .fillRoundedRect(wall.x, wall.y, wall.width, wall.height, 5);
      ground.lineStyle(4, 0x747c7e, 0.75)
        .strokeRoundedRect(wall.x, wall.y, wall.width, wall.height, 5);
      ground.lineStyle(2, 0x27313d, 0.75)
        .lineBetween(wall.x + 20, wall.y + 8, wall.x + wall.width - 16, wall.y + wall.height - 9);
    }

    // Cracked shrine and runic wisps; animation can be introduced later.
    ground.fillStyle(0x141924).fillEllipse(1030, 412, 150, 42);
    ground.fillStyle(0x49535a).fillRoundedRect(1001, 345, 58, 60, 6);
    ground.fillStyle(0x737e83).fillTriangle(990, 350, 1070, 350, 1030, 315);
    ground.lineStyle(3, 0x92c2ac, 0.5).strokeCircle(1030, 385, 14);

    // The old crypt gateway is a physical interaction point.
    this.paintPortal(ground, CRYPT_GATE.x, CRYPT_GATE.y, 0x96afbc);

    // A visible playable border makes the initial sandbox readable.
    ground.lineStyle(9, 0x364149, 0.65).strokeRect(5, 5, WIDTH - 10, HEIGHT - 10);
  }
}
