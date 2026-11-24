// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { CAMP, type WorldLayout } from '../../src/game/world/generator';
import { ACTOR_RADIUS, canOccupy, findPath } from '../../src/game/world/navigation';
import { planSettlementStructures } from '../../src/game/world/settlementStructures';

describe('Issue #208: structure clearance is local to a proposed obstacle',()=>{
  it('allows a distant building when a valid protected destination is near the world edge',()=>{
    const layout:WorldLayout={seed:123,camp:{...CAMP},obstacles:[],encounterPositions:[]};
    const edge={x:ACTOR_RADIUS+2,y:600};
    expect(canOccupy(edge,ACTOR_RADIUS,layout.obstacles)).toBe(true);
    expect(canOccupy(edge,ACTOR_RADIUS+18,layout.obstacles)).toBe(false);
    expect(findPath(CAMP,edge,ACTOR_RADIUS,layout.obstacles).length).toBeGreaterThan(0);
    const sites=[{id:'test.house',kind:'house' as const,anchor:{x:1120,y:230}}];
    const result=planSettlementStructures(layout,[],[edge],sites);
    expect(result.structures).toHaveLength(1);
    expect(result.skipped).toEqual([]);
    expect(findPath(CAMP,edge,ACTOR_RADIUS,result.obstacles).length).toBeGreaterThan(0);
    expect(findPath(CAMP,result.structures[0]!.approach,ACTOR_RADIUS,result.obstacles).length).toBeGreaterThan(0);
    expect(planSettlementStructures(layout,[],[edge],sites)).toEqual(result);
    expect(layout.obstacles).toEqual([]);
  });
  it('still rejects a protected destination outside actor bounds',()=>{
    const layout:WorldLayout={seed:123,camp:{...CAMP},obstacles:[],encounterPositions:[]};
    const result=planSettlementStructures(layout,[],[{x:ACTOR_RADIUS-1,y:600}],
      [{id:'test.house',kind:'house',anchor:{x:1120,y:230}}]);
    expect(result.structures).toEqual([]);
    expect(result.skipped).toEqual(['test.house']);
  });
});
