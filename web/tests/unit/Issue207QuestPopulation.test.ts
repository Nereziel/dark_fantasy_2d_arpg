// GPL-3.0-only — #207 B2b1, guaranteed hunt and early kill reconciliation.
import {describe,it,expect} from 'vitest';
import {buildWilderness} from '../../src/game/world/wildernessRuntime';
import {ACTOR_RADIUS,canOccupy,findPath} from '../../src/game/world/navigation';
import {planWildernessPopulation} from '../../src/game/world/wildernessPopulation';
import {planQuestPopulation,questKillCredits} from '../../src/game/world/questPopulation';
import {CAMPAIGN_QUEST_CATALOG} from '../../src/game/quests/campaignQuestLedger';
import {createQuestLedger,acceptQuest,advanceObjective,turnInQuest} from '../../src/game/quests/questDialogue';
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
describe('#207 B2b1: finite required quest population',()=>{
  it.each([0,1,42,245489,411788,4775157,7808134,0xffffffff])('seed %i has a reachable three-boar roster',seed=>{
    const world=buildWilderness(seed);
    const plan=planQuestPopulation(world);
    expect(planQuestPopulation(world)).toEqual(plan);
    expect(plan.members).toHaveLength(3);
    expect(new Set(plan.members.map(m=>m.id)).size).toBe(3);
    const ordinary=planWildernessPopulation(world);
    for(const m of plan.members){
      expect(m.type).toBe('corruptedBoar');
      expect(distance(m.spawn,plan.anchor)).toBeLessThanOrEqual(plan.territoryRadius);
      expect(canOccupy(m.spawn,ACTOR_RADIUS,world.layout.obstacles)).toBe(true);
      expect(findPath(world.layout.camp,m.spawn,ACTOR_RADIUS,world.layout.obstacles).length).toBeGreaterThan(0);
      for(const other of plan.members)if(other.id!==m.id)expect(distance(m.spawn,other.spawn)).toBeGreaterThanOrEqual(ACTOR_RADIUS*2);
      for(const group of ordinary.groups)for(const other of group.members)
        expect(distance(m.spawn,other.spawn)).toBeGreaterThanOrEqual(ACTOR_RADIUS*2);
    }
  },30000);
  it('credits only actual dead canonical beasts, once, after quest unlock',()=>{
    const world=buildWilderness(42),plan=planQuestPopulation(world);
    const roster=plan.members.map(m=>({id:m.id,type:m.type,alive:false,health:0}));
    let ledger=createQuestLedger(CAMPAIGN_QUEST_CATALOG)!;
    expect(questKillCredits(plan,roster,ledger)).toEqual([]);
    ledger=acceptQuest(CAMPAIGN_QUEST_CATALOG,ledger,'ashes_at_gate')!.ledger;
    for(let i=0;i<3;i++)ledger=advanceObjective(CAMPAIGN_QUEST_CATALOG,ledger,'ashes_at_gate','enemy_defeated','test_'+i)!.ledger;
    ledger=turnInQuest(CAMPAIGN_QUEST_CATALOG,ledger,'ashes_at_gate')!.ledger;
    ledger=acceptQuest(CAMPAIGN_QUEST_CATALOG,ledger,'trail_of_black_ash')!.ledger;
    ledger=advanceObjective(CAMPAIGN_QUEST_CATALOG,ledger,'trail_of_black_ash','corruption_traced','test_corruption')!.ledger;
    ledger=turnInQuest(CAMPAIGN_QUEST_CATALOG,ledger,'trail_of_black_ash')!.ledger;
    ledger=acceptQuest(CAMPAIGN_QUEST_CATALOG,ledger,'blighted_pack')!.ledger;
    const partial=[roster[0]!,{...roster[1]!,alive:true,health:1},{...roster[2]!,type:'wolf' as const}, {id:'fake-boar',type:'corruptedBoar' as const,alive:false,health:0}];
    const credits=questKillCredits(plan,partial,ledger);
    expect(credits).toEqual([plan.members[0]!.id]);
    ledger=advanceObjective(CAMPAIGN_QUEST_CATALOG,ledger,'blighted_pack','infected_beast_slain',credits[0]!)!.ledger;
    expect(questKillCredits(plan,roster,ledger)).toEqual(plan.members.slice(1).map(m=>m.id));
    for(const id of questKillCredits(plan,roster,ledger))ledger=advanceObjective(CAMPAIGN_QUEST_CATALOG,ledger,'blighted_pack','infected_beast_slain',id)!.ledger;
    expect(ledger.quests.find(q=>q.questId==='blighted_pack')?.status).toBe('ready');
    expect(questKillCredits(plan,roster,ledger)).toEqual([]);
  });
});
