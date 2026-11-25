// GPL-3.0-only — original procedural pixel textures, no simulation authority.
import type { Point } from '../core/types';
import type { OptionalDungeonId } from '../world/optionalDungeonVisit';
import type { TerrainId, WildernessTerrainResult } from '../world/wildernessTerrain';
import { DUNGEON_TILE_SIZE, type ProceduralDungeonResult } from '../world/proceduralDungeon';
import { isometricFootprint, type IsometricRect } from './isometricProjection';

export type GroundMaterial = TerrainId | 'crypt_floor' | 'crypt_wall' | 'mine_floor' | 'mine_wall' | 'cave_floor' | 'cave_wall';
export type GroundTile = IsometricRect & { terrainId: GroundMaterial; variant: number };
export interface GroundRoad {
  readonly id: string;
  readonly points: readonly Readonly<Point>[];
  readonly width: number;
}
export interface GroundLayout {
  readonly width: number; readonly height: number;
  readonly tiles: readonly Readonly<GroundTile>[];
  readonly roads: readonly GroundRoad[];
}
export interface TerrainChunk {
  readonly id: string;
  readonly world: IsometricRect;
  readonly projected: IsometricRect;
  readonly tiles: readonly Readonly<GroundTile>[];
  readonly roads: readonly GroundRoad[];
}
export const GROUND_TEXTURE_SIZE = 32;
export const GROUND_VARIANTS = 4;
export const GROUND_CHUNK_SIZE = 400;

type RGB = readonly [number, number, number];
type MaterialStyle = { base: RGB; light: RGB; dark: RGB; detail: RGB; pattern: 'grass' | 'leaves' | 'soil' | 'stone' };
const STYLES: Record<GroundMaterial, MaterialStyle> = {
  town_clearing: {base:[66,62,49], light:[91,83,64], dark:[48,46,39], detail:[110,97,70], pattern:'soil'},
  dark_grass: {base:[39,53,42], light:[58,73,48], dark:[27,38,32], detail:[82,91,54], pattern:'grass'},
  dead_leaves: {base:[61,53,40], light:[93,68,44], dark:[43,39,32], detail:[116,79,43], pattern:'leaves'},
  corrupted_soil: {base:[62,46,48], light:[89,58,63], dark:[43,34,39], detail:[113,64,73], pattern:'soil'},
  broken_stone: {base:[66,67,65], light:[86,88,81], dark:[39,43,43], detail:[89,94,77], pattern:'stone'},
  dirt_road: {base:[83,67,48], light:[106,88,63], dark:[60,50,39], detail:[130,105,74], pattern:'soil'},
  crypt_floor: {base:[64,64,73], light:[82,81,91], dark:[36,38,47], detail:[97,91,92], pattern:'stone'},
  crypt_wall: {base:[34,36,43], light:[49,51,57], dark:[23,25,31], detail:[62,60,63], pattern:'stone'},
  mine_floor: {base:[81,65,49], light:[111,89,62], dark:[48,39,31], detail:[179,151,106], pattern:'soil'},
  mine_wall: {base:[45,36,28], light:[65,52,41], dark:[29,24,20], detail:[102,81,59], pattern:'soil'},
  cave_floor: {base:[53,72,68], light:[78,100,83], dark:[32,46,44], detail:[140,168,138], pattern:'soil'},
  cave_wall: {base:[30,43,42], light:[43,59,57], dark:[19,29,29], detail:[70,91,79], pattern:'soil'}
};
const MATERIALS = Object.keys(STYLES) as GroundMaterial[];
const SIZE = GROUND_TEXTURE_SIZE;
function hash(seed: number, x: number, y: number): number {
  let h = seed ^ Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  return (h ^ (h >>> 15)) >>> 0;
}
function checkVariant(variant: number): void {
  if (!Number.isInteger(variant) || variant < 0 || variant >= GROUND_VARIANTS)
    throw new RangeError('Invalid ground variant');
}

/** RGBA texture in Cartesian material space; projected by the chunk painter.
 * Each variant is entirely opaque and uses bounded periodic detail coordinates.
 */
export function terrainTexture(material: GroundMaterial, variant: number): Uint8ClampedArray {
  checkVariant(variant);
  const style = STYLES[material];
  if (!style) throw new RangeError('Unknown ground material');
  const seed = (MATERIALS.indexOf(material) + 1) * 47 + variant * 131;
  const pixels = new Uint8ClampedArray(SIZE * SIZE * 4);
  const put = (x: number, y: number, color: RGB, shade = 0) => {
    const i = (((y + SIZE) % SIZE) * SIZE + (x + SIZE) % SIZE) * 4;
    pixels[i] = color[0] + shade; pixels[i+1] = color[1] + shade;
    pixels[i+2] = color[2] + shade; pixels[i+3] = 255;
  };
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const noise = hash(seed, x, y);
    const patch = hash(seed, Math.floor(x/4), Math.floor(y/4)) % 9 - 4;
    const color = style.pattern === 'stone'
      ? (y % 8 === 0 || (x + (Math.floor(y/8)%2)*8) % 16 === 0 ? style.dark
        : y % 8 === 1 ? style.light : style.base)
      : style.base;
    put(x, y, color, patch + noise % 7 - 3);
  }
  for (let n = 0; n < 26; n++) {
    const value = hash(seed, n, 71);
    const x = value % SIZE, y = (value >>> 8) % SIZE;
    if (style.pattern === 'grass') {
      put(x, y, style.dark); put(x, y-1, style.light);
      put(x+1, y-2, style.detail); put(x-1, y-1, style.light);
    } else if (style.pattern === 'leaves') {
      put(x, y, style.dark); put(x+1, y, style.light);
      put(x, y-1, style.detail); put(x+2, y+1, style.light);
    } else {
      put(x, y, style.dark); put(x+1, y, style.light);
      if (n % 3 === 0) put(x+1, y-1, style.detail);
    }
  }
  return pixels;
}
function intersects(a: IsometricRect, b: IsometricRect): boolean {
  return a.x < b.x+b.width && a.x+a.width > b.x
    && a.y < b.y+b.height && a.y+a.height > b.y;
}
function roadTouches(road: GroundRoad, rect: IsometricRect): boolean {
  const r = road.width/2;
  for (let i=1; i<road.points.length; i++) {
    const a=road.points[i-1]!, b=road.points[i]!;
    if (Math.min(a.x,b.x)-r <= rect.x+rect.width && Math.max(a.x,b.x)+r >= rect.x
      && Math.min(a.y,b.y)-r <= rect.y+rect.height && Math.max(a.y,b.y)+r >= rect.y) return true;
  }
  return false;
}

/** Preserve source geometry, including full road polylines for joins across chunks.
 * Raster clipping occurs in world space rather than changing navigation data.
 */
export function planTerrainChunks(layout: GroundLayout, origin: Readonly<Point>,
  chunkSize = GROUND_CHUNK_SIZE): TerrainChunk[] {
  const valid = (n: number) => Number.isInteger(n) && n>0 && n<=16384;
  if (!valid(layout.width) || !valid(layout.height) || !valid(chunkSize) || chunkSize>800
    || Math.ceil(layout.width/chunkSize)*Math.ceil(layout.height/chunkSize)>4096)
    throw new RangeError('Invalid ground chunk dimensions');
  const result: TerrainChunk[] = [];
  for (let y=0; y<layout.height; y+=chunkSize) for (let x=0; x<layout.width; x+=chunkSize) {
    const world = { x,y,width:Math.min(chunkSize,layout.width-x),height:Math.min(chunkSize,layout.height-y) };
    const corners = isometricFootprint(world,0,origin);
    const minX=Math.min(...corners.map(p=>p.x)), maxX=Math.max(...corners.map(p=>p.x));
    const minY=Math.min(...corners.map(p=>p.y)), maxY=Math.max(...corners.map(p=>p.y));
    result.push({id:'ground/'+x+'/'+y, world,
      projected:{x:minX,y:minY,width:maxX-minX,height:maxY-minY},
      tiles:layout.tiles.filter(tile=>intersects(tile,world)),
      roads:layout.roads.filter(road=>roadTouches(road,world))});
  }
  return result;
}

export type GroundAtlas = ReadonlyMap<string, HTMLCanvasElement>;
const textureKey = (material: GroundMaterial, variant: number) => material+'/'+variant;

/** Generate once per scene/game, reuse all material textures across both zones. */
export function createGroundAtlas(): GroundAtlas {
  const atlas = new Map<string,HTMLCanvasElement>();
  for (const material of MATERIALS) for (let variant=0; variant<GROUND_VARIANTS; variant++) {
    const canvas = document.createElement('canvas');
    canvas.width=SIZE; canvas.height=SIZE;
    const ctx=canvas.getContext('2d');
    if (!ctx) throw new Error('Ground atlas requires Canvas2D');
    const data=ctx.createImageData(SIZE,SIZE);
    data.data.set(terrainTexture(material,variant));
    ctx.putImageData(data,0,0);
    atlas.set(textureKey(material,variant),canvas);
  }
  return atlas;
}

/** Bake one projected chunk. The canvas can be registered as a Phaser texture
 * and positioned at chunk.projected.x/y with origin (0,0).
 * No per-frame draw work and no world exploration/discovery mask.
 */
export function paintTerrainChunk(chunk: TerrainChunk, origin: Readonly<Point>,
  atlas: GroundAtlas): HTMLCanvasElement {
  const canvas=document.createElement('canvas');
  canvas.width=Math.ceil(chunk.projected.width);
  canvas.height=Math.ceil(chunk.projected.height);
  const ctx=canvas.getContext('2d');
  if (!ctx) throw new Error('Ground chunk requires Canvas2D');
  ctx.imageSmoothingEnabled=false;
  ctx.setTransform(1,0.5,-1,0.5,origin.x-chunk.projected.x,origin.y-chunk.projected.y);
  const {x,y,width,height}=chunk.world;
  ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();
  for (const tile of chunk.tiles) {
    const texture=atlas.get(textureKey(tile.terrainId,tile.variant));
    if (!texture) throw new Error('Missing ground texture '+tile.terrainId+'/'+tile.variant);
    ctx.drawImage(texture,tile.x,tile.y,tile.width,tile.height);
  }
  const gravel=atlas.get(textureKey('dirt_road',0));
  const gravelPattern=gravel && ctx.createPattern(gravel,'repeat');
  ctx.lineJoin='round';ctx.lineCap='round';
  for (const road of chunk.roads) {
    if (road.points.length<2) continue;
    ctx.beginPath();ctx.moveTo(road.points[0]!.x,road.points[0]!.y);
    for (const point of road.points.slice(1)) ctx.lineTo(point.x,point.y);
    ctx.strokeStyle='#433b2e';ctx.lineWidth=road.width;ctx.stroke();
    ctx.strokeStyle=gravelPattern || '#65523b';ctx.lineWidth=road.width*0.88;ctx.stroke();
  }
  return canvas;
}

/** Rendering consumes the same immutable geometry as the existing world. */
export function wildernessGroundLayout(terrain: Pick<WildernessTerrainResult, 'width'|'height'|'tiles'|'roads'>): GroundLayout {
  return { width:terrain.width,height:terrain.height,tiles:terrain.tiles,roads:terrain.roads };
}

export function cryptGroundLayout(dungeon: Pick<ProceduralDungeonResult, 'seed'|'width'|'height'|'tiles'>, id?: OptionalDungeonId): GroundLayout {
  return {width:dungeon.width,height:dungeon.height,roads:[],tiles:dungeon.tiles.map(tile=>({
    x:tile.x,y:tile.y,width:DUNGEON_TILE_SIZE,height:DUNGEON_TILE_SIZE,
    terrainId:tile.kind==='floor'?(id==='mine'?'mine_floor':id==='cave'?'cave_floor':'crypt_floor')
      :(id==='mine'?'mine_wall':id==='cave'?'cave_wall':'crypt_wall'),
    variant:hash(dungeon.seed,tile.x,tile.y)%GROUND_VARIANTS
  }))};
}
