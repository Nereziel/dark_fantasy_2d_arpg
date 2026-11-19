import Phaser from 'phaser';
import type { GameBridge } from '../bridge/GameBridge';
import { CLASSES } from '../data/classes';
import { RARITIES } from '../data/items';

const WIDTH = 2200;
const HEIGHT = 1400;

/**
 * Visual / pointer adapter only. All combat and navigation decisions are made
 * by the renderer-independent GameSimulation.
 */
export class FrontierScene extends Phaser.Scene {
  private readonly bridge: GameBridge;
  private hero!: Phaser.GameObjects.Graphics;
  private wraith!: Phaser.GameObjects.Graphics;
  private healthBar!: Phaser.GameObjects.Graphics;
  private groundItems!: Phaser.GameObjects.Graphics;

  constructor(bridge: GameBridge) {
    super({ key: 'Frontier' });
    this.bridge = bridge;
  }

  create(): void {
    this.paintWorld();

    this.hero = this.add.graphics();
    this.hero.fillStyle(0x131f30).fillCircle(0, 3, 19);
    this.hero.fillStyle(0x8e9caa).fillCircle(0, -5, 13);
    this.hero.fillStyle(CLASSES[this.bridge.snapshot().classId].color).fillTriangle(-14, 8, 14, 8, 0, -26);
    this.hero.fillStyle(0xd7c3a0).fillCircle(0, -13, 5);
    this.hero.lineStyle(4, 0xb7a77a).lineBetween(14, 5, 25, -22);
    this.hero.setDepth(50);

    this.wraith = this.add.graphics();
    this.wraith.fillStyle(0x1a1424, 0.6).fillEllipse(0, 17, 35, 12);
    this.wraith.fillStyle(0x45313e).fillCircle(0, 0, 22);
    this.wraith.fillStyle(0x887389).fillTriangle(-18, 14, 18, 14, 0, -28);
    this.wraith.fillStyle(0xd99b68).fillCircle(-7, -8, 3).fillCircle(7, -8, 3);
    this.wraith.setDepth(48);

    this.healthBar = this.add.graphics().setDepth(60);
    this.groundItems = this.add.graphics().setDepth(44);

    this.cameras.main.setBounds(0, 0, WIDTH, HEIGHT);
    this.cameras.main.setZoom(1);
    this.cameras.main.startFollow(this.hero, true, 0.1, 0.1);

    this.input.on('pointerdown', this.onWorldClick, this);
    this.input.keyboard?.on('keydown-SPACE', this.onSpace, this);
    this.input.keyboard?.on('keydown-ESC', this.onSpace, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.onWorldClick, this);
      this.input.keyboard?.off('keydown-SPACE', this.onSpace, this);
      this.input.keyboard?.off('keydown-ESC', this.onSpace, this);
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
    if (pointer.button !== 0 || this.bridge.snapshot().paused) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const state = this.bridge.snapshot();
    const loot = state.groundLoot.find(g =>
      Phaser.Math.Distance.Between(world.x, world.y, g.x, g.y) < 30
    );
    if (loot) {
      this.bridge.command({ type: 'pickup', id: loot.id });
    } else if (state.enemy.alive && Phaser.Math.Distance.Between(
      world.x, world.y, state.enemy.x, state.enemy.y
    ) < 46) {
      this.bridge.command({ type: 'attack', targetId: state.enemy.id });
    } else {
      this.bridge.command({ type: 'move', destination: { x: world.x, y: world.y } });
    }
  }

  update(_time: number, delta: number): void {
    this.bridge.tick(delta);
    const state = this.bridge.snapshot();
    this.hero.setPosition(state.player.x, state.player.y);
    this.hero.setVisible(state.player.alive);
    this.wraith.setPosition(state.enemy.x, state.enemy.y);
    this.wraith.setVisible(state.enemy.alive);

    this.healthBar.clear();
    this.groundItems.clear();
    for (const drop of state.groundLoot) {
      const hex = RARITIES[drop.item.rarity].color.replace('#', '');
      const color = Number.parseInt(hex, 16);
      this.groundItems.fillStyle(color, 0.13).fillCircle(drop.x, drop.y, 21);
      this.groundItems.lineStyle(2, color, 0.95).strokeCircle(drop.x, drop.y, 17);
      this.groundItems.fillStyle(color).fillRect(drop.x - 7, drop.y - 7, 14, 14);
      this.groundItems.lineStyle(2, 0xece6d7, 0.5).strokeRect(drop.x - 7, drop.y - 7, 14, 14);
    }
    if (state.enemy.alive) {
      this.healthBar.fillStyle(0x080a10, 0.9).fillRect(state.enemy.x - 26, state.enemy.y - 43, 52, 8);
      this.healthBar.fillStyle(0xa3494c).fillRect(state.enemy.x - 24, state.enemy.y - 41, 48 * (state.enemy.health / state.enemy.maxHealth), 4);
    }
  }

  private paintWorld(): void {
    const ground = this.add.graphics().setDepth(-100);
    ground.fillStyle(0x131921).fillRect(0, 0, WIDTH, HEIGHT);

    // Deterministic visual variations; cosmetic only, never collision/loot state.
    let seed = 0x8237ab19;
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

    // Cracked shrine and runic wisps; animation can be introduced later.
    ground.fillStyle(0x141924).fillEllipse(1030, 412, 150, 42);
    ground.fillStyle(0x49535a).fillRoundedRect(1001, 345, 58, 60, 6);
    ground.fillStyle(0x737e83).fillTriangle(990, 350, 1070, 350, 1030, 315);
    ground.lineStyle(3, 0x92c2ac, 0.5).strokeCircle(1030, 385, 14);

    // A visible playable border makes the initial sandbox readable.
    ground.lineStyle(9, 0x364149, 0.65).strokeRect(5, 5, WIDTH - 10, HEIGHT - 10);
  }
}
