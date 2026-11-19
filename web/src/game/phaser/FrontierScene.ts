import Phaser from 'phaser';
import type { GameBridge } from '../bridge/GameBridge';
import { CLASSES } from '../data/classes';
import { RARITIES } from '../data/items';
import { SKILLS } from '../skills/skills';
import type { GameEvent, ZoneId } from '../core/types';
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
  private wardenMarker!: Phaser.GameObjects.Text;
  private readonly enemyGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  private readonly campDecor: Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Text> = [];
  private healthBar!: Phaser.GameObjects.Graphics;
  private groundItems!: Phaser.GameObjects.Graphics;
  private statusVisuals!: Phaser.GameObjects.Graphics;
  private telegraph!: Phaser.GameObjects.Graphics;
  private terrain!: Phaser.GameObjects.Graphics;
  private renderedSeed: number | null = null;
  private renderedZone: ZoneId | null = null;

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
    this.hero.setDepth(50);

    this.healthBar = this.add.graphics().setDepth(60);
    this.groundItems = this.add.graphics().setDepth(44);
    this.statusVisuals = this.add.graphics().setDepth(47);
    this.telegraph = this.add.graphics().setDepth(46);

    this.cameras.main.setBounds(0, 0, WIDTH, HEIGHT);
    this.cameras.main.setZoom(1);
    this.cameras.main.startFollow(this.hero, true, 0.1, 0.1);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', this.onWorldClick, this);
    const unsubscribeEvents = this.bridge.onEvent(event => this.onGameEvent(event));
    this.input.keyboard?.on('keydown-SPACE', this.onSpace, this);
    this.input.keyboard?.on('keydown-ESC', this.onSpace, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.onWorldClick, this);
      this.input.keyboard?.off('keydown-SPACE', this.onSpace, this);
      this.input.keyboard?.off('keydown-ESC', this.onSpace, this);
      unsubscribeEvents();
      for (const actor of this.enemyGraphics.values()) actor.destroy();
      this.enemyGraphics.clear();
    });
  }

  private onSpace(event: KeyboardEvent): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement &&
      (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(active.tagName)
        || document.querySelector('.inventory-overlay, .npc-dialog-shield, .trade-overlay'))) return;
    event.preventDefault();
    this.bridge.command({ type: 'pause', value: !this.bridge.snapshot().paused });
  }

  private onWorldClick(pointer: Phaser.Input.Pointer): void {
    if (this.bridge.snapshot().paused) return;
    if (pointer.button === 2) {
      this.bridge.command({ type: 'cast', slot: 'rmb' });
      return;
    }
    if (pointer.button !== 0) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const state = this.bridge.snapshot();
    const portal = state.zone === 'wilderness' ? CRYPT_GATE : CRYPT_EXIT;
    if (Phaser.Math.Distance.Between(world.x, world.y, portal.x, portal.y) < 64) {
      this.bridge.command({ type: 'usePortal' });
      return;
    }
    const npc = state.zone === 'wilderness'
      ? (Object.keys(NPC_POSITIONS) as NpcId[]).find(id =>
      Phaser.Math.Distance.Between(
        world.x, world.y, NPC_POSITIONS[id].x, NPC_POSITIONS[id].y
      ) < 40
    ) : undefined;
    if (npc) {
      this.bridge.command({ type: 'interactNpc', npcId: npc });
      return;
    }
    const loot = state.groundLoot.find(g =>
      Phaser.Math.Distance.Between(world.x, world.y, g.x, g.y) < 30
    );
    if (loot) {
      this.bridge.command({ type: 'pickup', id: loot.id });
    } else {
      const target = state.enemies
        .filter(unit => unit.actor.alive)
        .map(unit => unit.actor)
        .find(enemy => Phaser.Math.Distance.Between(
          world.x, world.y, enemy.x, enemy.y
        ) < 43);
      if (target) {
        this.bridge.command({ type: 'attack', targetId: target.id });
      } else {
        this.bridge.command({ type: 'move', destination: { x: world.x, y: world.y } });
      }
    }
  }

  private drawEnemy(type: EnemyType, g: Phaser.GameObjects.Graphics): void {
    g.clear();
    const color = ENEMY_DEFINITIONS[type].color;
    if (type === 'wraith') {
      g.fillStyle(0x080c13, 0.55).fillEllipse(0, 20, 49, 17);
      g.fillStyle(0x3b314a).fillEllipse(0, 0, 44, 43);
      g.fillStyle(color).fillTriangle(-20, 12, 20, 12, 0, -28);
      g.fillStyle(0x24192e).fillEllipse(0, -8, 24, 22);
      g.fillStyle(0xf4a9bc).fillCircle(-7, -9, 3).fillCircle(7, -9, 3);
      g.lineStyle(2, 0xbc9ed8, 0.65).strokeEllipse(0, 4, 43, 42);
    } else if (type === 'skeleton') {
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
    } else if (type === 'wolf') {
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

  private onGameEvent(event: GameEvent): void {
    if (event.type === 'cast') {
      const definition = Object.values(SKILLS)
        .flatMap(kit => Object.values(kit))
        .find(skill => skill.id === event.skillId);
      const ring = this.add.graphics().setPosition(event.x, event.y).setDepth(85);
      ring.lineStyle(4, definition?.color ?? 0xffddaa, 0.95).strokeCircle(0, 0, 18);
      this.tweens.add({
        targets: ring, alpha: 0, scaleX: 3.3, scaleY: 3.3, duration: 470,
        onComplete: () => ring.destroy()
      });
    } else if (event.type === 'hit') {
      const state = this.bridge.snapshot();
      const actor = event.targetId === 'hero' ? state.player
        : state.enemies.find(unit => unit.actor.id === event.targetId)?.actor;
      if (!actor) return;
      const label = this.add.text(actor.x, actor.y - 39, '-' + event.damage, {
        fontFamily: 'Georgia, serif', fontSize: '17px',
        color: event.targetId === 'hero' ? '#ff8d8d' : '#f6d29a',
        stroke: '#070b11', strokeThickness: 3
      }).setOrigin(0.5).setDepth(90);
      this.tweens.add({
        targets: label, y: label.y - 32, alpha: 0, duration: 750,
        onComplete: () => label.destroy()
      });
    }
  }

  update(_time: number, delta: number): void {
    this.bridge.tick(delta);
    const state = this.bridge.snapshot();
    if (this.renderedSeed !== state.worldSeed || this.renderedZone !== state.zone) {
      this.paintWorld(state.worldSeed, state.zone);
    }
    for (const actor of this.campDecor) actor.setVisible(state.zone === 'wilderness');
    this.hero.setPosition(state.player.x, state.player.y);
    this.wardenMarker.setText(state.quest.status === 'ready' ? '?'
      : state.quest.status === 'available' ? '!' : '·');
    this.wardenMarker.setVisible(state.zone === 'wilderness' && state.quest.status !== 'completed');
    this.hero.setVisible(state.player.alive);
    const ids = new Set(state.enemies.map(unit => unit.actor.id));
    for (const [id, sprite] of this.enemyGraphics) {
      if (!ids.has(id)) {
        sprite.destroy();
        this.enemyGraphics.delete(id);
      }
    }
    for (const { actor } of state.enemies) {
      let sprite = this.enemyGraphics.get(actor.id);
      if (!sprite) {
        sprite = this.add.graphics().setDepth(48);
        this.drawEnemy(actor.type, sprite);
        this.enemyGraphics.set(actor.id, sprite);
      }
      const bob = actor.type === 'wraith'
        ? Math.sin(this.time.now * 0.0045 + actor.x) * 4
        : Math.sin(this.time.now * (actor.type === 'wolf' ? 0.015 : 0.008) + actor.y) * 1.5;
      sprite.setPosition(actor.x, actor.y + bob);
      sprite.setVisible(actor.alive);
    }

    this.healthBar.clear();
    this.telegraph.clear();
    this.statusVisuals.clear();
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
    this.groundItems.clear();
    for (const drop of state.groundLoot) {
      const hex = RARITIES[drop.item.rarity].color.replace('#', '');
      const color = Number.parseInt(hex, 16);
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
