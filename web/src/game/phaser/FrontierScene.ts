import Phaser from 'phaser';
import type { GameBridge } from '../bridge/GameBridge';
import { CLASSES } from '../data/classes';
import { RARITIES } from '../data/items';
import { SKILLS } from '../skills/skills';
import type { GameEvent } from '../core/types';
import { ENEMY_DEFINITIONS, type EnemyType } from '../enemies/enemies';
import { CAMP_RADIUS, generateWorld } from '../world/generator';

const WIDTH = 2200;
const HEIGHT = 1400;

/**
 * Visual / pointer adapter only. All combat and navigation decisions are made
 * by the renderer-independent GameSimulation.
 */
export class FrontierScene extends Phaser.Scene {
  private readonly bridge: GameBridge;
  private hero!: Phaser.GameObjects.Graphics;
  private readonly enemyGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  private healthBar!: Phaser.GameObjects.Graphics;
  private groundItems!: Phaser.GameObjects.Graphics;
  private statusVisuals!: Phaser.GameObjects.Graphics;
  private telegraph!: Phaser.GameObjects.Graphics;
  private terrain!: Phaser.GameObjects.Graphics;
  private renderedSeed: number | null = null;

  constructor(bridge: GameBridge) {
    super({ key: 'Frontier' });
    this.bridge = bridge;
  }

  create(): void {
    this.paintWorld(this.bridge.snapshot().worldSeed);

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
        || document.querySelector('.inventory-overlay'))) return;
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
    } else {
      g.fillStyle(0x080c13, 0.58).fillEllipse(0, 18, 64, 14);
      g.fillStyle(0x553b36).fillEllipse(-8, 0, 50, 26);
      g.fillStyle(color).fillEllipse(12, -8, 28, 22);
      g.fillStyle(0x6e4c41).fillTriangle(1, -15, 8, -34, 15, -16)
        .fillTriangle(17, -16, 28, -30, 29, -7);
      g.lineStyle(5, 0x59382d).lineBetween(-22, 4, -25, 23)
        .lineBetween(-1, 6, 2, 25).lineBetween(10, 7, 13, 25);
      g.fillStyle(0xecb5a0).fillCircle(21, -11, 3);
      g.lineStyle(4, 0x644238).lineBetween(-29, -5, -39, -22);
    }
  }

  /** Visual feedback only: combat rules never rely on an animation frame. */
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
    if (this.renderedSeed !== state.worldSeed) this.paintWorld(state.worldSeed);
    this.hero.setPosition(state.player.x, state.player.y);
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

  private paintWorld(worldSeed: number): void {
    const layout = generateWorld(worldSeed);
    if (!this.terrain) this.terrain = this.add.graphics().setDepth(-100);
    const ground = this.terrain;
    ground.clear();
    this.renderedSeed = worldSeed;
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

    // A visible playable border makes the initial sandbox readable.
    ground.lineStyle(9, 0x364149, 0.65).strokeRect(5, 5, WIDTH - 10, HEIGHT - 10);
  }
}
