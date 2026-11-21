/**
 * Issue #128: real Chromium/Phaser 4 draw smoke for forty simultaneous actor
 * sprites plus warning circles, exercised for 120 animation frames.
 * Standalone browser fixture: never inject fake enemies into GameSimulation,
 * never ship a debug hook in the production ARPG.
 * GPL-3.0-only.
 */
import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test('Phaser 4 draws 40 animated actor sprites and 40 warnings without a renderer failure', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto('about:blank');
  // Use the exact installed Phaser version, offline. No CDN, web request or
  // production debug API is needed for this isolated rendering stress smoke.
  await page.addScriptTag({ path: resolve(process.cwd(), 'node_modules/phaser/dist/phaser.js') });
  await page.evaluate(() => {
    const BrowserPhaser = (window as Window & {
      Phaser?: typeof import('phaser').default
    }).Phaser;
    if (!BrowserPhaser) throw new Error('Local Phaser browser bundle not available');
    const host = document.createElement('div');
    host.id = 'stress-render-host';
    document.body.appendChild(host);

    const sprites: Array<{ x: number; y: number; setPosition(x: number, y: number): unknown }> = [];
    const warnings: Array<{ setPosition(x: number, y: number): unknown }> = [];
    const reportTarget = window as Window & {
      __arActorStress?: {
        frames: number; sprites: number; warnings: number;
        finitePositions: boolean; rendererType: number
      };
    };

    class FortyActorScene extends BrowserPhaser.Scene {
      private frames = 0;

      create(): void {
        // A 48x56 procedural actor texture matching the actual game's cell
        // size; distinct physical sprites rather than 40 DOM decorations.
        const tile = document.createElement('canvas');
        tile.width = 48;
        tile.height = 56;
        const ctx = tile.getContext('2d');
        if (!ctx) throw new Error('Canvas2D unavailable in actor stress fixture');
        ctx.fillStyle = '#3a4a5b';
        ctx.fillRect(12, 16, 24, 31);
        ctx.fillStyle = '#c6b4a1';
        ctx.fillRect(16, 7, 16, 15);
        ctx.fillStyle = '#d8b474';
        ctx.fillRect(34, 15, 4, 28);
        ctx.fillStyle = '#101922';
        ctx.fillRect(18, 13, 4, 3);
        this.textures.addCanvas('actor-stress-cell', tile);

        for (let index = 0; index < 40; index++) {
          const x = 66 + (index % 10) * 90;
          const y = 68 + Math.floor(index / 10) * 124;
          const actor = this.add.sprite(x, y, 'actor-stress-cell')
            .setOrigin(0.5, 0.5).setDepth(45);
          const ring = this.add.graphics().setPosition(x, y).setDepth(46);
          ring.lineStyle(3, 0xffd59c, 0.88).strokeCircle(0, 0, 28);
          ring.lineStyle(2, 0x0a141c, 0.96).strokeCircle(0, 0, 23);
          sprites.push(actor);
          warnings.push(ring);
        }
      }

      update(): void {
        this.frames++;
        for (let i = 0; i < sprites.length; i++) {
          const x = 66 + (i % 10) * 90 + Math.sin((this.frames + i) / 12) * 6;
          const y = 68 + Math.floor(i / 10) * 124
            + Math.cos((this.frames + i * 2) / 17) * 5;
          sprites[i]!.setPosition(x, y);
          warnings[i]!.setPosition(x, y);
        }
        if (this.frames === 120) {
          reportTarget.__arActorStress = {
            frames: this.frames,
            sprites: sprites.length,
            warnings: warnings.length,
            finitePositions: sprites.every(actor =>
              Number.isFinite(actor.x) && Number.isFinite(actor.y)),
            rendererType: this.game.renderer.type
          };
        }
      }
    }
    new BrowserPhaser.Game({
      type: BrowserPhaser.AUTO,
      parent: host,
      width: 960, height: 540,
      backgroundColor: '#0a0e15',
      pixelArt: true,
      scene: [FortyActorScene]
    });
  });

  await expect(page.locator('#stress-render-host canvas')).toBeVisible();
  await page.waitForFunction(
    () => (window as Window & { __arActorStress?: { frames: number } })
      .__arActorStress?.frames === 120,
    undefined, { timeout: 20_000 }
  );
  const report = await page.evaluate(() =>
    (window as Window & { __arActorStress?: {
      frames: number; sprites: number; warnings: number;
      finitePositions: boolean; rendererType: number
    } }).__arActorStress
  );
  expect(report).toMatchObject({
    frames: 120, sprites: 40, warnings: 40, finitePositions: true
  });
  expect(Number.isInteger(report?.rendererType)).toBe(true);
});
