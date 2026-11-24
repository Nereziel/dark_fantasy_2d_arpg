// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { terrainTexture, planTerrainChunks, wildernessGroundLayout, cryptGroundLayout, type GroundTile } from '../../src/game/phaser/isometricTerrain';
import { projectIsometric } from '../../src/game/phaser/isometricProjection';

const origin = { x: 1400, y: 100 };
const tiles: GroundTile[] = [
  { x: 0, y: 0, width: 80, height: 80, terrainId: 'dark_grass', variant: 0 },
  { x: 80, y: 0, width: 80, height: 80, terrainId: 'dead_leaves', variant: 1 },
  { x: 160, y: 0, width: 40, height: 80, terrainId: 'broken_stone', variant: 2 }
];
const road = { id: 'road-test', from: { x: 0, y: 40 }, to: { x: 200, y: 40 },
  points: [{ x: 0, y: 40 }, { x: 100, y: 50 }, { x: 200, y: 40 }], width: 20 };

describe('Issue #210/#124: textured isometric terrain', () => {
  it('generates bounded, opaque, deterministic original material textures with four variants', () => {
    const materials = ['town_clearing','dark_grass','dead_leaves','corrupted_soil',
      'broken_stone','dirt_road','crypt_floor','crypt_wall'] as const;
    const signatures = new Set<string>();
    for (const material of materials) {
      for (let variant = 0; variant < 4; variant++) {
        const pixels = terrainTexture(material, variant);
        expect(pixels).toHaveLength(32 * 32 * 4);
        expect(pixels).toEqual(terrainTexture(material, variant));
        expect(pixels.filter((_, i) => i % 4 === 3).every(a => a === 255)).toBe(true);
        signatures.add(pixels.join(','));
      }
    }
    expect(signatures.size).toBe(32);
  });

  it('preserves authoritative partial edge tiles and road geometry across chunk boundaries', () => {
    const chunks = planTerrainChunks({ width: 200, height: 80, tiles, roads: [road] }, origin, 80);
    expect(chunks).toHaveLength(3);
    expect(chunks.map(c => c.tiles.length)).toEqual([1,1,1]);
    expect(chunks.map(c => c.roads[0]?.points)).toEqual([road.points, road.points, road.points]);
    expect(chunks[2]?.world.width).toBe(40);
    expect(chunks[2]?.projected.width).toBe(120);
    const p = projectIsometric({ x: 160, y: 80 }, 0, origin);
    expect(chunks[2]?.projected.x).toBe(p.x);
    expect(chunks[2]?.projected.y).toBe(projectIsometric({ x: 160, y: 0 }, 0, origin).y);
    expect(tiles[2]?.width).toBe(40);
  });

  it('clips crossing tiles by chunk at paint time and excludes remote roads', () => {
    const crossing: GroundTile = { x: 60, y: 0, width: 80, height: 80, terrainId: 'dark_grass', variant: 0 };
    const chunks = planTerrainChunks({ width: 240, height: 80, tiles: [crossing], roads: [
      { ...road, points: [{x:0,y:20},{x:20,y:20}] }
    ] }, origin, 80);
    expect(chunks.map(c => c.tiles.length)).toEqual([1,1,0]);
    expect(chunks.map(c => c.roads.length)).toEqual([1,0,0]);
  });

  it('rejects invalid dimensions and texture variants', () => {
    expect(() => terrainTexture('dark_grass', -1)).toThrow(RangeError);
    expect(() => planTerrainChunks({ width: 0, height: 80, tiles, roads: [] }, origin)).toThrow(RangeError);
    expect(() => planTerrainChunks({ width: 200, height: 80, tiles, roads: [] }, origin, 0)).toThrow(RangeError);
  });
});

describe('authoritative terrain adapters', () => {
  it('passes wilderness material, variant and roads through unchanged', () => {
    const world = { width: 200, height: 80,
      tiles: [{x:0,y:0,width:80,height:80,terrainId:'dark_grass' as const,variant:3}],
      roads: [road] };
    const result = wildernessGroundLayout(world);
    expect(result).toEqual(world);
    expect(result.tiles[0]).toBe(world.tiles[0]);
    expect(result.roads[0]).toBe(road);
  });
  it('uses only the crypt geometry to choose floor and wall material', () => {
    const dungeon = { seed: 123, width: 80, height: 40, tiles: [
      {id:'floor',x:0,y:0,kind:'floor' as const},
      {id:'wall',x:40,y:0,kind:'wall' as const}
    ] };
    const layout = cryptGroundLayout(dungeon);
    expect(layout.tiles.map(t=>[t.x,t.y,t.width,t.height,t.terrainId]))
      .toEqual([[0,0,40,40,'crypt_floor'],[40,0,40,40,'crypt_wall']]);
    expect(layout.roads).toEqual([]);
    expect(cryptGroundLayout(dungeon)).toEqual(layout);
    expect(layout.tiles.every(t=>t.variant>=0 && t.variant<4)).toBe(true);
  });
});
