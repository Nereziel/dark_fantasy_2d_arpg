// GPL-3.0-only — #207 B2b1: finite quest roster and replay-safe objective credit.
// Planning never spawns actors or awards XP/loot. Runtime owns death and rewards.
import type {Point} from '../core/types';
import type {EnemyType} from '../enemies/enemies';
import type {QuestLedger} from '../quests/questDialogue';
import {ACTOR_RADIUS,canOccupy,findPath} from './navigation';
import {planWildernessPopulation,populationReservations,type WildernessPopulation,type PopulationMember} from './wildernessPopulation';
import type {WildernessRuntimeWorld} from './wildernessRuntime';

export const HUNT_GROUP_ID='quest-blighted-pack';
export const HUNT_MEMBER_IDS=['quest-blighted-pack-1','quest-blighted-pack-2','quest-blighted-pack-3'] as const;
export interface QuestPopulation {
  readonly seed:number;
  readonly id:typeof HUNT_GROUP_ID;
  readonly anchor:Point;
  readonly territoryRadius:number;
  readonly members:readonly PopulationMember[];
}
export interface QuestKillActor {
  readonly id:string;
  readonly type:EnemyType;
  readonly alive:boolean;
  readonly health:number;
}
const distance=(a:Readonly<Point>,b:Readonly<Point>)=>Math.hypot(a.x-b.x,a.y-b.y);
const TERRITORY=240;
const SEPARATION=ACTOR_RADIUS*2+8;

/** The authored hunt marker reserves the surrounding area for this group.
 * Prefer nearby spawn points and use bounded rings only if obstacles require
 * alternatives. Never substitute a nonreachable or occupied position. */
export function planQuestPopulation(world:WildernessRuntimeWorld,
  ordinary:WildernessPopulation=planWildernessPopulation(world)):QuestPopulation{
  const {layout,features}=world;
  if(ordinary.seed!==layout.seed)throw new RangeError('Mismatched population seed');
  const feature=features.find(f=>f.id==='act1.tainted_beasts');
  if(!feature)throw new RangeError('Required hunt anchor missing');
  const anchor={...feature.position};
  const reservations=populationReservations(world).filter(r=>
    !(r.position.x===anchor.x&&r.position.y===anchor.y&&r.radius===feature.radius+80));
  const occupied=ordinary.groups.flatMap(g=>g.members.map(m=>m.spawn));
  const candidates:Point[]=[anchor];
  const rotation=(layout.seed>>>0)%16;
  for(const radius of [48,80,112,144,176,208,236]){
    for(let i=0;i<16;i++){
      const theta=(i+rotation)*Math.PI/8;
      candidates.push({x:anchor.x+Math.round(radius*Math.cos(theta)),
        y:anchor.y+Math.round(radius*Math.sin(theta))});
    }
  }
  const valid=candidates.filter(p=>distance(p,anchor)<=TERRITORY
    &&reservations.every(r=>distance(p,r.position)>=r.radius)
    &&occupied.every(o=>distance(p,o)>=SEPARATION)
    &&canOccupy(p,ACTOR_RADIUS,layout.obstacles));
  const members:PopulationMember[]=[];
  for(const p of valid){
    if(members.some(m=>distance(m.spawn,p)<SEPARATION)
      ||findPath(layout.camp,p,ACTOR_RADIUS,layout.obstacles).length===0
      ||(distance(anchor,p)>0&&findPath(anchor,p,ACTOR_RADIUS,layout.obstacles).length===0))continue;
    members.push({id:HUNT_MEMBER_IDS[members.length]!,type:'corruptedBoar',spawn:{...p}});
    if(members.length===HUNT_MEMBER_IDS.length)break;
  }
  if(members.length!==HUNT_MEMBER_IDS.length)throw new RangeError('Required hunt population unavailable');
  return {seed:layout.seed,id:HUNT_GROUP_ID,anchor,territoryRadius:TERRITORY,members};
}

/** Project only actual authoritative canonical deaths into the existing quest
 * engine. Run on quest activation and on hunt defeat. The ledger remains the
 * sole authority for objective counters and one-shot quest reward plans.
 * No XP, gold, loot, resurrection or synthetic death is performed here. */
export function questKillCredits(plan:QuestPopulation,actors:readonly QuestKillActor[],
  ledger:QuestLedger):string[]{
  const quest=ledger.quests.find(q=>q.questId==='blighted_pack');
  if(quest?.status!=='active')return [];
  const processed=new Set(quest.processedEventIds);
  return plan.members.filter(member=>{
    if(member.type!=='corruptedBoar'||!HUNT_MEMBER_IDS.some(id=>id===member.id)
      ||processed.has(member.id))return false;
    const matches=actors.filter(a=>a.id===member.id);
    return matches.length===1&&matches[0]!.type===member.type
      &&matches[0]!.alive===false&&matches[0]!.health===0;
  }).map(m=>m.id);
}
