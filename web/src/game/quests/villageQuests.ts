// GPL-3.0-only — pure Act I side-quest contracts, no world/save/reward authority.
import { advanceObjective, validateQuestCatalog, type QuestCatalog,
  type QuestLedger, type QuestTransition } from './questDialogue';

type Copy={title:string;description:string;objective:string;briefing:string;accept:string;turnIn:string;close:string};
interface VillageQuestSpec {
  readonly id:string;
  readonly giverId:string;
  readonly targetId:string;
  readonly nodeId:string;
  readonly eventId:string;
  readonly gold:number;
  readonly xp:number;
  readonly cs:Copy;
  readonly en:Copy;
}

/** Stable resident IDs, never coordinates or seed-specific quest identity. */
export const VILLAGE_QUESTS:readonly VillageQuestSpec[]=[
  {
    id:'village_smith_supplies',giverId:'north-village-civilian',
    targetId:'east-village-blacksmith',nodeId:'village.supplies.root',
    eventId:'village_supplies_confirmed',gold:45,xp:65,
    cs:{title:'Zásoby pro sever',description:'Severní osada potřebuje nové nástroje. Domluv jejich dodávku s kovářem ve východní vesnici a vrať se se zprávou.',
      objective:'Promluv s východním kovářem a vrať se k zadavateli.',
      briefing:'Staré nástroje se rozpadají. Zjisti u kováře, zda nám může připravit nové.',
      accept:'Zajdu za kovářem.',turnIn:'Přináším zprávu od kováře.',close:'Odejít'},
    en:{title:'Supplies for the North',description:'The northern settlement needs new tools. Ask the eastern blacksmith about a delivery and return with the answer.',
      objective:'Speak to the eastern blacksmith and return to the quest giver.',
      briefing:'Our old tools are falling apart. Ask the blacksmith if new ones can be prepared.',
      accept:'I will speak to the blacksmith.',turnIn:'I have the blacksmith’s answer.',close:'Leave'}
  },
  {
    id:'village_healer_message',giverId:'east-village-quest',
    targetId:'north-village-healer',nodeId:'village.healer.root',
    eventId:'village_healer_notified',gold:50,xp:75,
    cs:{title:'Zpráva pro léčitele',description:'Východní osada očekává nemocné poutníky. Varuj severního léčitele, aby připravil zásoby, a podej zprávu.',
      objective:'Předej zprávu severnímu léčiteli a vrať se k zadavateli.',
      briefing:'Na cestách přibývá nemocných. Léčitel na severu se musí připravit.',
      accept:'Doručím zprávu.',turnIn:'Léčitel byl zpraven.',close:'Odejít'},
    en:{title:'A Message for the Healer',description:'The eastern settlement expects sick travellers. Warn the northern healer to prepare supplies, then report back.',
      objective:'Deliver the message to the northern healer and return to the quest giver.',
      briefing:'More travellers are falling ill. The northern healer must prepare.',
      accept:'I will deliver the message.',turnIn:'The healer has been warned.',close:'Leave'}
  }
];

export const VILLAGE_QUEST_CATALOG:QuestCatalog={
  quests:VILLAGE_QUESTS.map(q=>({
    id:q.id,category:'side',titleKey:'quest.village.'+q.id+'.title',
    descriptionKey:'quest.village.'+q.id+'.description',
    objectiveKey:'quest.village.'+q.id+'.objective',
    prerequisites:[],objectives:[{id:'visit',eventId:q.eventId,targetCount:1}],
    reward:{gold:q.gold,xp:q.xp}
  })),
  dialogueNodes:VILLAGE_QUESTS.map(q=>({
    id:q.nodeId,npcId:q.giverId,textKey:'quest.village.'+q.id+'.briefing',
    options:[
      {id:'accept',textKey:'quest.village.'+q.id+'.accept',action:{type:'acceptQuest',questId:q.id}},
      {id:'turnIn',textKey:'quest.village.'+q.id+'.turnIn',action:{type:'turnInQuest',questId:q.id}},
      {id:'close',textKey:'quest.village.'+q.id+'.close',action:{type:'close'}}
    ]
  }))
};
if(!validateQuestCatalog(VILLAGE_QUEST_CATALOG))throw Error('Invalid village quest catalog');

export const VILLAGE_QUEST_TEXT:Readonly<Record<'cs'|'en',Readonly<Record<string,string>>>>={
  cs:Object.fromEntries(VILLAGE_QUESTS.flatMap(q=>Object.entries(q.cs).map(([k,v])=>['quest.village.'+q.id+'.'+k,v]))),
  en:Object.fromEntries(VILLAGE_QUESTS.flatMap(q=>Object.entries(q.en).map(([k,v])=>['quest.village.'+q.id+'.'+k,v])))
};

/** Caller MUST verify actual NPC interaction, range, LOS and world manifest.
 * This pure adapter never accepts client event kinds or creates rewards.
 * Concrete occurrence IDs come from the authoritative simulation.
 */
export function advanceVillageVisit(catalog:QuestCatalog,ledger:QuestLedger,
  npcId:unknown,occurrenceId:string):QuestTransition|null {
  const quest=VILLAGE_QUESTS.find(q=>q.targetId===npcId);
  return quest?advanceObjective(catalog,ledger,quest.id,quest.eventId,occurrenceId):null;
}
