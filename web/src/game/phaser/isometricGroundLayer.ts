// GPL-3.0-only — Phaser adapter for the independent textured ground plan.
import Phaser from 'phaser';
import type { Point } from '../core/types';
import type { IsometricRect } from './isometricProjection';
import { createGroundAtlas, paintTerrainChunk, planTerrainChunks,
  type GroundAtlas, type GroundLayout, type TerrainChunk } from './isometricTerrain';
import { planGroundResidency } from './isometricGroundResidency';

let nextLayerId = 0;

/** Retain the complete CPU-side plan, bake only camera-near GPU textures.
 * The owning scene calls rebuild on seed/zone changes and clear at shutdown.
 * Texture keys are instance-local; no chunk texture survives a rebuild.
 */
export class IsometricGroundLayer {
  private readonly prefix = 'iso-ground-' + nextLayerId++ + '/';
  private atlas: GroundAtlas | undefined;
  private chunks: readonly TerrainChunk[] = [];
  private origin: Readonly<Point> = { x: 0, y: 0 };
  private readonly resident = new Map<string, Phaser.GameObjects.Image>();

  constructor(private readonly scene: Phaser.Scene) {}

  get count(): number { return this.resident.size; }
  get total(): number { return this.chunks.length; }

  rebuild(layout: GroundLayout, origin: Readonly<Point>): void {
    this.clear();
    this.atlas ??= createGroundAtlas();
    this.origin = { ...origin };
    this.chunks = planTerrainChunks(layout, origin);
  }

  sync(view: Readonly<IsometricRect>): void {
    if (!this.atlas) return;
    const delta = planGroundResidency(this.chunks, new Set(this.resident.keys()), view);
    for (const id of delta.unload) {
      this.resident.get(id)?.destroy();
      this.resident.delete(id);
      this.scene.textures.remove(this.prefix + id);
    }
    for (const chunk of delta.load) {
      const key = this.prefix + chunk.id;
      const texture = this.scene.textures.addCanvas(key, paintTerrainChunk(chunk, this.origin, this.atlas));
      if (!texture) throw new Error('Unable to register ground chunk ' + key);
      try {
        texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        const image = this.scene.add.image(chunk.projected.x, chunk.projected.y, key)
          .setOrigin(0, 0).setDepth(-100);
        this.resident.set(chunk.id, image);
      } catch (error) {
        this.scene.textures.remove(key);
        throw error;
      }
    }
  }

  clear(): void {
    for (const [id, image] of this.resident) {
      image.destroy();
      this.scene.textures.remove(this.prefix + id);
    }
    this.resident.clear();
    this.chunks = [];
  }
}
