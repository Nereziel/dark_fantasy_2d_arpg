// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { planSettlementStructures, type StructureSite } from '../../src/game/world/settlementStructures';
import { canOccupy, findPath, ACTOR_RADIUS } from '../../src/game/world/navigation';
import { CAMP } from '../../src/game/world/generator';

const sites: StructureSite[] = [
  { id:'camp.house', kind:'house', anchor:{x:180,y:350} },
  { id:'camp.smithy', kind:'smithy', anchor:{x:575,y:355} },
  { id:'wild.cabin', kind:'cabin', anchor:{x:900,y:900} },
  { id:'wild.mine', kind:'mine', anchor:{x:1500,y:850} }
];
const road = {id:'main',width:38,points:[{x:390,y:470},{x:1800,y:470}]};
const layout = {seed:123,camp:{...CAMP},obstacles:[],encounterPositions:[{x:700,y:500}]};
const reserved = [{x:312,y:445},{x:432,y:407},{x:473,y:517},{x:690,y:390}];

describe('Issue #208: seeded settlement structures', () => {
  it('places stable named houses, smithy, cabin and mine with walkable approaches', () => {
    const plan = planSettlementStructures(layout,[road],reserved,sites);
    expect(plan.structures.map(s=>s.id)).toEqual(sites.map(s=>s.id));
    expect(plan.skipped).toEqual([]);
    expect(plan.structures.map(s=>s.kind)).toEqual(sites.map(s=>s.kind));
    for(const structure of plan.structures) {
      expect(structure.obstacle.id).toBe('structure-'+structure.id.replaceAll('.','-'));
      expect(canOccupy(structure.approach,ACTOR_RADIUS,plan.obstacles)).toBe(true);
      expect(findPath(CAMP,structure.approach,ACTOR_RADIUS,plan.obstacles).length).toBeGreaterThan(0);
      expect(canOccupy({x:structure.obstacle.x+structure.obstacle.width/2,
        y:structure.obstacle.y+structure.obstacle.height/2},ACTOR_RADIUS,plan.obstacles)).toBe(false);
    }
    expect(planSettlementStructures(layout,[road],reserved,sites)).toEqual(plan);
    expect(planSettlementStructures({...layout,seed:124},[road],reserved,sites).structures)
      .not.toEqual(plan.structures);
    expect(layout.obstacles).toEqual([]);
  });
  it('protects the complete road width, all reserved targets and existing collision', () => {
    const plan=planSettlementStructures({...layout,obstacles:[
      {id:'wall',x:150,y:300,width:80,height:100}
    ]},[road],reserved,sites);
    for(const s of plan.structures) {
      const b=s.obstacle;
      expect(b.y+b.height<=451 || b.y>=489 || b.x+b.width<=390 || b.x>=1800).toBe(true);
    }
    for(const p of [CAMP,...layout.encounterPositions,...reserved]) {
      expect(canOccupy(p,ACTOR_RADIUS,plan.obstacles)).toBe(true);
      if(p!==CAMP) expect(findPath(CAMP,p,ACTOR_RADIUS,plan.obstacles).length).toBeGreaterThan(0);
    }
    expect(plan.obstacles[0]?.id).toBe('wall');
  });
  it('skips an impossible site instead of adding blocked geometry', () => {
    const input={...layout,obstacles:[{id:'large',x:900,y:800,width:400,height:400}]};
    const result=planSettlementStructures(input,[],[],[
      {id:'blocked',kind:'house',anchor:{x:1100,y:1000}}
    ]);
    expect(result.structures).toEqual([]);
    expect(result.skipped).toEqual(['blocked']);
    expect(result.obstacles).toEqual(input.obstacles);
  });
  it('rejects duplicate ids and invalid seeds before placing anything', () => {
    expect(()=>planSettlementStructures(layout,[],[],[sites[0]!,sites[0]!])).toThrow(RangeError);
    expect(()=>planSettlementStructures({...layout,seed:-1},[],[],sites)).toThrow(RangeError);
  });
});
