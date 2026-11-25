// GPL-3.0-only
import {describe,expect,it} from 'vitest';
import {buildActIDungeonInterior} from '../../src/game/world/actIDungeonEntrances';
import {planOptionalDungeonDecorations} from '../../src/game/world/optionalDungeonDecorations';
import {DUNGEON_TILE_SIZE} from '../../src/game/world/proceduralDungeon';

describe('Issue #208 C3.3: optional dungeon decoration',()=>{
  it.each([0,42,99,15838,0xffffffff])('keeps every mine and cave decoration on its own floor tile (%i)',seed=>{
    for(const id of ['mine','cave'] as const){
      const d=buildActIDungeonInterior(seed,id),before=JSON.stringify(d);
      const plan=planOptionalDungeonDecorations(d,id);
      expect(plan).toEqual(planOptionalDungeonDecorations(d,id));
      expect(new Set(plan.map(p=>p.id)).size).toBe(plan.length);
      expect(plan.length).toBeLessThanOrEqual(d.tiles.length*4);
      const tiles=new Map(d.tiles.map(t=>[t.id,t]));
      for(const item of plan){
        const tile=tiles.get(item.tileId)!;
        expect(tile.kind).toBe('floor');
        expect(item.points.length).toBeGreaterThanOrEqual(3);
        expect(item.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)
          &&p.x>=tile.x&&p.x<=tile.x+DUNGEON_TILE_SIZE
          &&p.y>=tile.y&&p.y<=tile.y+DUNGEON_TILE_SIZE)).toBe(true);
        if(item.kind==='rail'||item.kind==='sleeper')expect(tile.doorId).toBeDefined();
      }
      const kinds=new Set(plan.map(p=>p.kind));
      expect(kinds).toEqual(new Set(id==='mine'?['rail','sleeper','supportFoot']:['crystal','moss']));
      expect(JSON.stringify(d)).toBe(before);
      expect(planOptionalDungeonDecorations(d,undefined)).toEqual([]);
    }
  },30000);
});
