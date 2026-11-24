// GPL-3.0-only
import { describe, expect, it, vi } from 'vitest';
import { CAMP, type WorldLayout } from '../../src/game/world/generator';
import { ACTOR_RADIUS, canOccupy, findPath } from '../../src/game/world/navigation';
import { planVillagePopulation } from '../../src/game/world/villagePopulation';
import { planSettlementStructures } from '../../src/game/world/settlementStructures';
import type { RegionalSettlement } from '../../src/game/world/regionalTopology';

vi.mock('../../src/game/world/settlementStructures',async importOriginal=>{
  const original=await importOriginal<typeof import('../../src/game/world/settlementStructures')>();
  return {...original,planSettlementStructures:vi.fn(original.planSettlementStructures)};
});

describe('Issue #208: atomic village retries',()=>{
  it.each(['north-village','east-village'] as const)('retries %s when buildings fit but residents do not',id=>{
    const planner=vi.mocked(planSettlementStructures);
    const original=planner.getMockImplementation()!;
    const layout:WorldLayout={seed:123,camp:{...CAMP},obstacles:[],encounterPositions:[]};
    const p=id==='north-village'?{x:1120,y:230}:{x:1910,y:960};
    const settlement:RegionalSettlement={id,anchor:p,position:p,radius:72,nameKey:'region.'+id};
    const camp:RegionalSettlement={id:'camp',anchor:CAMP,position:CAMP,radius:165,nameKey:'region.camp'};
    planner.mockClear();
    // Inject a resident-blocking result on the first otherwise viable
    // building proposal. Subsequent attempts use the real planner.
    planner.mockImplementationOnce((...args)=>{
      const result=original(...args);
      expect(result.structures.length).toBeGreaterThan(0);
      if(id==='east-village')expect(result.structures.some(s=>s.kind==='smithy')).toBe(true);
      return {...result,obstacles:[...result.obstacles,
        {id:'rejected-proposal',x:p.x-80,y:p.y-80,width:160,height:160}]};
    });
    try{
      const result=planVillagePopulation(layout,[camp,settlement],[],[]);
      expect(planner.mock.calls.length).toBeGreaterThan(1);
      expect(result.skipped).toEqual([]);
      expect(result.villages.map(v=>v.id)).toEqual([id]);
      const village=result.villages[0]!;
      expect(village.residents).toHaveLength(2);
      expect(village.structures.length).toBeGreaterThan(0);
      if(id==='east-village')expect(village.structures.some(s=>s.kind==='smithy')).toBe(true);
      expect(result.obstacles.some(o=>o.id==='rejected-proposal')).toBe(false);
      for(const resident of village.residents){
        expect(canOccupy(resident.position,ACTOR_RADIUS,result.obstacles)).toBe(true);
        expect(findPath(CAMP,resident.position,ACTOR_RADIUS,result.obstacles).length).toBeGreaterThan(0);
      }
      expect(layout.obstacles).toEqual([]);
    }finally{planner.mockImplementation(original);}
  });
  it('retries a village when the runtime rejects its candidate geometry, keeping accepted neighbours',()=>{
    const layout:WorldLayout={seed:123,camp:{...CAMP},obstacles:[],encounterPositions:[]};
    const settlements:RegionalSettlement[]=[
      {id:'camp',anchor:CAMP,position:CAMP,radius:165,nameKey:'region.camp'},
      {id:'north-village',anchor:{x:1120,y:230},position:{x:1120,y:230},radius:72,nameKey:'region.north-village'},
      {id:'east-village',anchor:{x:1910,y:960},position:{x:1910,y:960},radius:72,nameKey:'region.east-village'}
    ];
    const accept=vi.fn((walls:readonly WorldLayout['obstacles'][number][])=>walls.length>0);
    accept.mockReturnValueOnce(false);
    const result=planVillagePopulation(layout,settlements,[],[],accept);
    expect(accept.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(result.villages.map(v=>v.id)).toEqual(['north-village','east-village']);
    expect(result.skipped).toEqual([]);
    const acceptedNorth=accept.mock.calls[1]![0];
    for(const wall of acceptedNorth)expect(result.obstacles).toContainEqual(wall);
    expect(result.obstacles).toEqual(accept.mock.calls.at(-1)![0]);
    expect(layout.obstacles).toEqual([]);
  });
  it('does not publish any rejected village geometry',()=>{
    const layout:WorldLayout={seed:123,camp:{...CAMP},obstacles:[],encounterPositions:[]};
    const p={x:1120,y:230};
    const north:RegionalSettlement={id:'north-village',anchor:p,position:p,radius:72,nameKey:'region.north-village'};
    const accept=vi.fn(()=>false);
    const result=planVillagePopulation(layout,[north],[],[],accept);
    expect(accept).toHaveBeenCalled();
    expect(result.villages).toEqual([]);
    expect(result.skipped).toEqual(['north-village']);
    expect(result.obstacles).toEqual([]);
  });
});
