import { describe, expect, it } from 'vitest';
import { journalEntries, trackedQuest, navigationArrow } from '../../src/game/ui/questTracking';
import { rewardForActivity } from '../../src/game/progression/progressionRules';
import { freshQuest } from '../../src/game/quests/firstQuest';

describe('read-only quest tracking', () => {
  it('defaults to the starter offer and never lists locked future story quests', () => {
    const entries = journalEntries({ quest: freshQuest() });
    expect(entries.map(q => q.id)).toEqual(['ashes_at_gate']);
    expect(trackedQuest(entries, null)?.id).toBe('ashes_at_gate');
    expect(trackedQuest(entries, 'future_fake')?.id).toBe('ashes_at_gate');
  });
  it('keeps manual tracking off even when a new objective becomes available',()=>{
    const entries=journalEntries({quest:freshQuest()});
    expect(trackedQuest(entries,false)).toBeNull();
    const next=journalEntries({quest:{...freshQuest(),status:'completed',defeated:3},questLedger:{quests:[
      {questId:'trail_of_black_ash',status:'active',counters:{traced:0},processedEventIds:[],rewardClaimed:false}
    ]}});
    expect(trackedQuest(next,false)).toBeNull();
    expect(trackedQuest(next,'trail_of_black_ash')?.id).toBe('trail_of_black_ash');
  });
  it('shows actual accepted side quests and falls back from completed choices', () => {
    const entries = journalEntries({quest: {...freshQuest(), status: 'completed', defeated: 3},
      questLedger: {quests: [
        {questId:'village_smith_supplies',status:'active',counters:{visit:0},processedEventIds:[],rewardClaimed:false},
        {questId:'trail_of_black_ash',status:'active',counters:{traced:0},processedEventIds:[],rewardClaimed:false}
      ]}});
    expect(entries.map(q=>q.id)).toContain('village_smith_supplies');
    expect(trackedQuest(entries,'village_smith_supplies')?.id).toBe('village_smith_supplies');
    expect(trackedQuest(entries,'ashes_at_gate')?.id).toBe('trail_of_black_ash');
  });
  it('reports the real level-scaled starter reward and the ready side quest return hint',()=>{
    const entries=journalEntries({quest:freshQuest(),level:12,questLedger:{quests:[
      {questId:'village_smith_supplies',status:'ready',counters:{visit:1},processedEventIds:['visit'],rewardClaimed:false}
    ]}});
    expect(entries.find(q=>q.id==='ashes_at_gate')?.xp).toBe(Math.max(100,rewardForActivity('quest',12,12)));
    expect(entries.find(q=>q.id==='village_smith_supplies')?.hintKey).toBe('map.returnToGiver');
  });
  it('clamps a direction indicator within the viewport and hides it for a local or unknown target', () => {
    const viewport={x:0,y:0,width:480,height:320};
    const player={x:240,y:160};
    expect(navigationArrow(viewport,player,null)).toBeNull();
    expect(navigationArrow(viewport,player,{x:300,y:160})).toBeNull();
    expect(navigationArrow(viewport,player,{x:1000,y:160})).toEqual({x:456,y:160,angle:0});
  });
});
