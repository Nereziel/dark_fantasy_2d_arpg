// GPL-3.0-only — read-only quest presentation, never movement authority.
import type { GameSnapshot, Point } from '../core/types';
import type { MapViewport } from '../world/mapDiscovery';
import { ACT_I_QUEST_CATALOG } from '../quests/actIQuestChain';
import { VILLAGE_QUEST_CATALOG } from '../quests/villageQuests';
import { FIRST_QUEST_ID } from '../quests/firstQuest';
import { activeStoryRegionHint } from './storyRegionHints';
export interface JournalEntry {
  id:string; titleKey:string; objectiveKey:string; descriptionKey:string;
  status:'available'|'active'|'ready'|'completed'; count:number;goal:number;
  gold:number;xp:number;hintKey:string|null;
}
export function journalEntries(view:Pick<GameSnapshot,'quest'|'questLedger'>):JournalEntry[]{
  const result:JournalEntry[]=[];
  for(const definition of [...ACT_I_QUEST_CATALOG.quests,...VILLAGE_QUEST_CATALOG.quests]){
    const state=view.questLedger?.quests.find(q=>q.questId===definition.id);
    const starter=definition.id===FIRST_QUEST_ID;
    const status=starter?view.quest.status:state?.status;
    if(status!=='active'&&status!=='ready'&&status!=='completed'&&!(starter&&status==='available'))continue;
    const objective=definition.objectives[0];
    const count=starter?view.quest.defeated:state?.counters[objective?.id??'']??0;
    const hintKey=starter&&status==='available'?'quest.ashes.unstarted':starter&&status==='ready'?'quest.ashes.readyHint':
      status==='ready'&&definition.id==='vesnas_report'?'quest.actI.returnToVesna':activeStoryRegionHint(definition.id,status);
    result.push({id:definition.id,titleKey:definition.titleKey,objectiveKey:definition.objectiveKey,
      descriptionKey:definition.descriptionKey,status,count,goal:objective?.targetCount??1,
      gold:definition.reward.gold,xp:definition.reward.xp,hintKey});
  }
  return result;
}
export function trackedQuest(entries:readonly JournalEntry[],selected:string|null):JournalEntry|null{
  const open=entries.filter(q=>q.status!=='completed');
  return open.find(q=>q.id===selected)??open.find(q=>q.status==='ready')??open.find(q=>q.status==='active')??open[0]??null;
}
/** Direction only for a known target outside the local map. */
export function navigationArrow(viewport:MapViewport,player:Readonly<Point>|null,target:Readonly<Point>|null):
 {x:number;y:number;angle:number}|null{
  if(!player||!target)return null;
  if(target.x>=viewport.x&&target.x<viewport.x+viewport.width&&target.y>=viewport.y&&target.y<viewport.y+viewport.height)return null;
  const dx=target.x-player.x,dy=target.y-player.y;
  const margin=Math.min(24,viewport.width/4,viewport.height/4);
  const x0=Math.max(viewport.x+margin,Math.min(viewport.x+viewport.width-margin,player.x));
  const y0=Math.max(viewport.y+margin,Math.min(viewport.y+viewport.height-margin,player.y));
  const sx=dx>0?(viewport.x+viewport.width-margin-x0)/dx:dx<0?(viewport.x+margin-x0)/dx:Infinity;
  const sy=dy>0?(viewport.y+viewport.height-margin-y0)/dy:dy<0?(viewport.y+margin-y0)/dy:Infinity;
  const scale=Math.min(sx,sy);
  if(!Number.isFinite(scale))return null;
  return {x:x0+dx*scale,y:y0+dy*scale,angle:Math.atan2(dy,dx)*180/Math.PI};
}
