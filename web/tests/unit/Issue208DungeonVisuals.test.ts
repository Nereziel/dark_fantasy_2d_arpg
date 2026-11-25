// GPL-3.0-only
import {describe,expect,it} from 'vitest';
import {buildActIDungeonInterior} from '../../src/game/world/actIDungeonEntrances';
import {optionalDungeonVisualStyle} from '../../src/game/world/optionalDungeonVisuals';
import {cryptGroundLayout,terrainTexture} from '../../src/game/phaser/isometricTerrain';
import {obstacleMaterial,planObstacleArt} from '../../src/game/phaser/isometricProps';

describe('Issue #208 C3.1: distinct optional dungeon visuals',()=>{
  it('has deterministic distinct mine and cave palettes, leaving the legacy crypt untouched',()=>{
    expect(optionalDungeonVisualStyle(undefined)).toBeNull();
    const mine=optionalDungeonVisualStyle('mine')!,cave=optionalDungeonVisualStyle('cave')!;
    expect(mine).not.toEqual(cave);
    expect(mine.wall).not.toBe(cave.wall);
    expect(mine.floor).not.toBe(cave.floor);
    expect(mine).toEqual(optionalDungeonVisualStyle('mine'));
  });
  it.each(['mine','cave'] as const)('renders %s floor and wall materials without changing any tile footprint',id=>{
    const dungeon=buildActIDungeonInterior(42,id);
    const before=JSON.stringify(dungeon);
    const regular=cryptGroundLayout(dungeon);
    const styled=cryptGroundLayout(dungeon,id);
    expect(styled.tiles.map(({terrainId,...rest})=>rest))
      .toEqual(regular.tiles.map(({terrainId,...rest})=>rest));
    expect(new Set(styled.tiles.map(t=>t.terrainId))).toEqual(new Set([id+'_floor',id+'_wall']));
    for(const material of [styled.tiles.find(t=>t.terrainId===id+'_floor')!.terrainId,
      styled.tiles.find(t=>t.terrainId===id+'_wall')!.terrainId]){
      for(let v=0;v<4;v++){
        const pixels=terrainTexture(material,v);
        expect(pixels).toEqual(terrainTexture(material,v));
        expect(pixels).toHaveLength(32*32*4);
        expect(pixels.every((n,i)=>i%4!==3||n===255)).toBe(true);
        expect(pixels).not.toEqual(terrainTexture('crypt_floor',v));
      }
    }
    expect(JSON.stringify(dungeon)).toBe(before);
  });
  it('uses distinct wall art while preserving the crypt collision silhouette and cutaway',()=>{
    const rect={x:400,y:280,width:80,height:40},origin={x:1400,y:100};
    const crypt=planObstacleArt(rect,'crypt',42,origin);
    const mine=planObstacleArt(rect,obstacleMaterial('wall','crypt','mine'),42,origin);
    const cave=planObstacleArt(rect,obstacleMaterial('wall','crypt','cave'),42,origin);
    expect(mine.base).toEqual(crypt.base);
    expect(cave.base).toEqual(crypt.base);
    expect(mine.occluder).toEqual(crypt.occluder);
    expect(cave.occluder).toEqual(crypt.occluder);
    expect(mine.paint).not.toEqual(cave.paint);
    expect(mine.paint).not.toEqual(crypt.paint);
    expect(obstacleMaterial('wall','crypt')).toBe('crypt');
    expect(obstacleMaterial('wall','wilderness','mine')).toBe('ruin');
  });
});
