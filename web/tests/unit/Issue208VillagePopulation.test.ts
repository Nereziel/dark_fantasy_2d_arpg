// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { CAMP, type WorldLayout } from '../../src/game/world/generator';
import { ACTOR_RADIUS, canOccupy, findPath } from '../../src/game/world/navigation';
import { planVillagePopulation } from '../../src/game/world/villagePopulation';
import { regionalRoadClear, type RegionalSettlement } from '../../src/game/world/regionalTopology';

const layout:WorldLayout={seed:123,camp:{...CAMP},obstacles:[],encounterPositions:[]};
const settlements:RegionalSettlement[]=[
  {id:'camp',anchor:CAMP,position:CAMP,radius:165,nameKey:'region.camp'},
  {id:'north-village',anchor:{x:1120,y:230},position:{x:1120,y:230},radius:72,nameKey:'region.north-village'},
  {id:'east-village',anchor:{x:1910,y:960},position:{x:1910,y:960},radius:72,nameKey:'region.east-village'}
];
const roads=[{id:'road-trade-north-east',width:40,points:[settlements[1]!.position,settlements[2]!.position]}];
describe('Issue #208: regional village population proposal',()=>{
  it('gives each village distinct buildings and stable planned service roles without blocking travel',()=>{
    const result=planVillagePopulation(layout,settlements,roads,[]);
    expect(result.villages.map(v=>v.id)).toEqual(['north-village','east-village']);
    expect(result.villages.every(v=>v.structures.length>0&&v.residents.length===2)).toBe(true);
    const residents=result.villages.flatMap(v=>v.residents);
    expect(new Set(residents.map(n=>n.id)).size).toBe(4);
    expect(residents.map(n=>n.role)).toEqual(['healer','civilian','blacksmith','quest']);
    expect(residents.every(n=>n.capability==='planned')).toBe(true);
    for(const p of [...residents.map(n=>n.position),...result.villages.flatMap(v=>v.structures.map(s=>s.approach))]){
      expect(canOccupy(p,ACTOR_RADIUS,result.obstacles)).toBe(true);
      expect(findPath(CAMP,p,ACTOR_RADIUS,result.obstacles).length).toBeGreaterThan(0);
    }
    expect(regionalRoadClear(roads[0]!.points,40,result.obstacles)).toBe(true);
    expect(planVillagePopulation(layout,settlements,roads,[])).toEqual(result);
    expect(layout.obstacles).toEqual([]);
  });
  it('skips a blocked village rather than exposing invalid services or footprints',()=>{
    const blocked={...layout,obstacles:[{id:'blocked',x:900,y:0,width:440,height:450}]};
    const result=planVillagePopulation(blocked,settlements,[],[]);
    expect(result.villages.some(v=>v.id==='north-village')).toBe(false);
    expect(result.skipped).toContain('north-village');
    expect(result.obstacles).toContainEqual(blocked.obstacles[0]);
  });
});
