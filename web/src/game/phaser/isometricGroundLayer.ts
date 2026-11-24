// GPL-3.0-only — Phaser adapter for the independent textured ground plan.
import Phaser from 'phaser';
import type { Point } from '../core/types';
import { createGroundAtlas, paintTerrainChunk, planTerrainChunks,
  type GroundAtlas, type GroundLayout } from './isometricTerrain';

let nextLayerId = 0;

/** A static ground image per chunk, drawn below telegraphs and actors.
 * The owning scene calls rebuild on seed/zone changes and clear at shutdown.
 * Texture keys are instance-local; no cache survives a zone rebuild by accident.
 */
export class IsometricGroundLayer {
  private readonly prefix = 'iso-ground-' + nextLayerId++ + '/';
  private atlas: GroundAtlas | undefined;
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly keys: string[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  get count(): number { return this.images.length; }

  rebuild(layout: GroundLayout, origin: Readonly<Point>): void {
    this.clear();
    this.atlas ??= createGroundAtlas();
    const chunks = planTerrainChunks(layout, origin);
    try {
      for (const chunk of chunks) {
        const key = this.prefix + chunk.id;
        const texture = this.scene.textures.addCanvas(key, paintTerrainChunk(chunk, origin, this.atlas));
        if (!texture) throw new Error('Unable to register ground chunk '+key);
        this.keys.push(key);
        texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        const image = this.scene.add.image(chunk.projected.x, chunk.projected.y, key)
          .setOrigin(0,0).setDepth(-100);
        this.images.push(image);
      }
    } catch (error) {
      this.clear();
      throw error;
    }
  }

  clear(): void {
    for (const image of this.images) image.destroy();
    this.images.length=0;
    for (const key of this.keys) this.scene.textures.remove(key);
    this.keys.length=0;
  }
}
