// GPL-3.0-only — single character ledger for story and local quests.
import { ACT_I_QUEST_CATALOG, createActIQuestLedger } from './actIQuestChain';
import { VILLAGE_QUEST_CATALOG } from './villageQuests';
import { createQuestLedger, validateQuestCatalog, validateQuestLedger, type QuestCatalog,
  type QuestLedger } from './questDialogue';

export const CAMPAIGN_QUEST_CATALOG:QuestCatalog={
  quests:[...ACT_I_QUEST_CATALOG.quests,...VILLAGE_QUEST_CATALOG.quests],
  dialogueNodes:[...ACT_I_QUEST_CATALOG.dialogueNodes,...VILLAGE_QUEST_CATALOG.dialogueNodes]
};
if(!validateQuestCatalog(CAMPAIGN_QUEST_CATALOG))throw Error('Invalid campaign quest catalog');

/** Only a completely valid historical ledger may acquire the two new entries.
 * Never reconstruct a partially populated new ledger or reset claimed rewards.
 */
export function createCampaignQuestLedger(source:unknown):QuestLedger|null {
  if(validateQuestLedger(CAMPAIGN_QUEST_CATALOG,source))return structuredClone(source);
  const old=createActIQuestLedger(source);
  if(!old)return null;
  const local=createQuestLedger(VILLAGE_QUEST_CATALOG);
  if(!local)return null;
  const expanded={quests:[...old.quests,...local.quests]};
  return validateQuestLedger(CAMPAIGN_QUEST_CATALOG,expanded)?expanded:null;
}
