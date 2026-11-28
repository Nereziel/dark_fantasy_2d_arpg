// GPL-3.0-only — #207 B2b2: one authoritative ordinary + hunt roster.
import {describe,it,expect} from 'vitest';
import {buildWilderness} from '../../src/game/world/wildernessRuntime';
import {ActIWildernessSession} from '../../src/game/world/actIWildernessSession';
import {CAMPAIGN_QUEST_CATALOG} from '../../src/game/quests/campaignQuestLedger';
import {createQuestLedger,acceptQuest,advanceObjective,turnInQuest} from '../../src/game/quests/questDialogue';
import {resolveEnemyHome} from '../../src/game/enemies/enemyHome';
function activeHunt(){
  const c=CAMPAIGN_QUEST_CATALOG;
  let l=createQuestLedger(c)!;
  l=acceptQuest(c,l,'ashes_at_gate')!.ledger;
  l=advanceObjective(c,l,'ashes_at_gate','enemy_defeated','test_first',3)!.ledger;
  l=turnInQuest(c,l,'ashes_at_gate')!.ledger;
  l=acceptQuest(c,l,'trail_of_black_ash')!.ledger;
  l=advanceObjective(c,l,'trail_of_black_ash','corruption_traced','test_trail')!.ledger;
  l=turnInQuest(c,l,'trail_of_black_ash')!.ledger;
  return acceptQuest(c,l,'blighted_pack')!.ledger;
}
const near=(p:{x:number;y:number})=>({player:p,visible:{minX:p.x-10,maxX:p.x+10,minY:p.y-10,maxY:p.y+10}});
const far=near({x:-10000,y:-10000});
describe('#207 B2b2: authoritative shared session roster',()=>{
  it('allocates ordinary and required hunt actors exactly once before activation',()=>{
    const s=new ActIWildernessSession(buildWilderness(42),3,'sessionA');
    const all=s.population.allUnits();
    expect(all).toHaveLength(s.ordinary.groups.flatMap(g=>g.members).length+3);
    expect(new Set(all.map(u=>u.actor.id)).size).toBe(all.length);
    expect(s.population.activeUnits()).toEqual([]);
    const m=s.hunt.members[0]!,u=all.find(u=>u.actor.id===m.id)!;
    expect(resolveEnemyHome(u,{wave:0,positions:[],population:s.manifest})?.origin).toEqual(m.spawn);
    s.population.refresh(near(s.hunt.anchor));
    expect(s.population.activeUnits()).toContain(u);
    u.actor.health=0;u.actor.alive=false;u.cooldown=2;
    s.population.refresh(far);
    expect(s.population.activeUnits()).toEqual([]);
    expect(s.population.allUnits().find(v=>v.actor.id===m.id)).toBe(u);
    s.population.refresh(near(s.hunt.anchor));
    expect(s.population.activeUnits()).toContain(u);
    expect(u.actor.health).toBe(0);
    expect(u.cooldown).toBe(2);
  });
  it('credits a dead hunt actor when inactive and scopes occurrence to a new session even with the same seed',()=>{
    const world=buildWilderness(42),a=new ActIWildernessSession(world,1,'sessionA');
    const id=a.hunt.members[0]!.id;
    const kill=(s:ActIWildernessSession)=>{
      const u=s.population.allUnits().find(u=>u.actor.id===id)!;
      u.actor.health=0;u.actor.alive=false;
    };
    kill(a);
    let ledger=activeHunt();
    const first=a.huntCredits(ledger);
    expect(first).toHaveLength(1);
    ledger=advanceObjective(CAMPAIGN_QUEST_CATALOG,ledger,'blighted_pack','infected_beast_slain',first[0]!)!.ledger;
    expect(a.huntCredits(ledger)).toEqual([]);
    const b=new ActIWildernessSession(world,1,'sessionB');
    expect(b.huntCredits(ledger)).toEqual([]);
    kill(b);
    expect(b.huntCredits(ledger)).toHaveLength(1);
    expect(b.huntCredits(ledger)[0]).not.toBe(first[0]);
  });
  it('rejects invalid occurrence namespace',()=>{
    expect(()=>new ActIWildernessSession(buildWilderness(42),1,'invalid / token')).toThrow();
  });
});
