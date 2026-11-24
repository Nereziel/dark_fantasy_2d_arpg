// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { ACT_I_QUEST_CATALOG } from '../../src/game/quests/actIQuestChain';
import { acceptQuest, chooseDialogueOption, createQuestLedger, turnInQuest,
  validateQuestCatalog, validateQuestLedger } from '../../src/game/quests/questDialogue';
import { VILLAGE_QUEST_CATALOG, VILLAGE_QUESTS, VILLAGE_QUEST_TEXT,
  advanceVillageVisit } from '../../src/game/quests/villageQuests';

const catalog={quests:[...ACT_I_QUEST_CATALOG.quests,...VILLAGE_QUEST_CATALOG.quests],
  dialogueNodes:[...ACT_I_QUEST_CATALOG.dialogueNodes,...VILLAGE_QUEST_CATALOG.dialogueNodes]};

describe('Issue #208: local village quest contracts',()=>{
  it('adds two independent quests without modifying the story catalog or leaving untranslated keys',()=>{
    expect(VILLAGE_QUESTS).toHaveLength(2);
    expect(validateQuestCatalog(catalog)).toBe(true);
    for(const q of VILLAGE_QUEST_CATALOG.quests){
      expect(q.prerequisites).toEqual([]);
      expect(ACT_I_QUEST_CATALOG.quests.some(old=>old.id===q.id)).toBe(false);
    }
    const keys=[...VILLAGE_QUEST_CATALOG.quests.flatMap(q=>[q.titleKey,q.descriptionKey,q.objectiveKey]),
      ...VILLAGE_QUEST_CATALOG.dialogueNodes.flatMap(n=>[n.textKey,...n.options.map(o=>o.textKey)])];
    for(const key of keys){
      expect(VILLAGE_QUEST_TEXT.cs[key]).toBeTruthy();
      expect(VILLAGE_QUEST_TEXT.en[key]).toBeTruthy();
    }
  });
  it.each(VILLAGE_QUESTS)('requires the correct recipient and original quest giver for $id',q=>{
    const fresh=createQuestLedger(catalog)!;
    const context={npcId:q.giverId};
    expect(chooseDialogueOption(catalog,fresh,q.nodeId,'accept',{npcId:q.targetId})).toBeNull();
    expect(chooseDialogueOption(catalog,fresh,q.nodeId,'accept',context)?.action)
      .toEqual({type:'acceptQuest',questId:q.id});
    expect(advanceVillageVisit(catalog,fresh,q.targetId,'visit.before')?.changed).toBe(false);
    const active=acceptQuest(catalog,fresh,q.id)!.ledger;
    expect(turnInQuest(catalog,active,q.id)).toBeNull();
    expect(advanceVillageVisit(catalog,active,'forged-npc','visit.fake')).toBeNull();
    expect(advanceVillageVisit(catalog,active,q.giverId,'visit.giver')).toBeNull();
    const ready=advanceVillageVisit(catalog,active,q.targetId,'visit.target')!;
    expect(ready.changed).toBe(true);
    expect(ready.rewardPlan).toBeNull();
    expect(advanceVillageVisit(catalog,ready.ledger,q.targetId,'visit.target')?.changed).toBe(false);
    expect(chooseDialogueOption(catalog,ready.ledger,q.nodeId,'turnIn',{npcId:q.targetId})).toBeNull();
    expect(chooseDialogueOption(catalog,ready.ledger,q.nodeId,'turnIn',context)?.action)
      .toEqual({type:'turnInQuest',questId:q.id});
    const complete=turnInQuest(catalog,ready.ledger,q.id)!;
    expect(complete.rewardPlan).toMatchObject({questId:q.id,gold:q.gold,xp:q.xp});
    const restored=JSON.parse(JSON.stringify(complete.ledger));
    expect(validateQuestLedger(catalog,restored)).toBe(true);
    expect(turnInQuest(catalog,restored,q.id)?.rewardPlan).toBeNull();
    expect(acceptQuest(catalog,restored,q.id)).toBeNull();
    expect(advanceVillageVisit(catalog,restored,q.targetId,'visit.otherseed')?.changed).toBe(false);
  });
});
