/**
 * Prompt 42 / Rogue ability kit: pure, data-driven Energy plans.
 * Existing skills.shadowDash is Dash, poisonBlade is Poison Blade.
 * Five extras complete the seven-skill class. GPL-3.0-only.
 */
import type {SkillAim} from '../input/skillAiming';
export const ROGUE_EXTRA_IDS=Object.freeze([
  'backstab','multishot','shadowStep','trap','fanOfKnives'
] as const);
export type RogueExtraAbilityId=typeof ROGUE_EXTRA_IDS[number];
export type RogueCooldowns=Partial<Record<RogueExtraAbilityId,number>>;
export interface RogueAbility {
  readonly id:RogueExtraAbilityId;
  readonly kind:'strike'|'volley'|'mobility'|'trap'|'nova';
  readonly icon:string;readonly color:number;readonly cost:number;
  readonly cooldown:number;readonly range:number;readonly power:number;
  readonly radius:number;readonly duration:number;
  readonly aimMode:'TARGET_ENTITY'|'GROUND_POSITION'|'SELF';
}
export const ROGUE_EXTRA_SKILLS:Readonly<Record<RogueExtraAbilityId,Readonly<RogueAbility>>> =
Object.freeze({
  backstab:Object.freeze({id:'backstab',kind:'strike',icon:'⚔',color:0xf4d6a5,
    cost:24,cooldown:5,range:94,power:2.15,radius:0,duration:0,
    aimMode:'TARGET_ENTITY'}),
  multishot:Object.freeze({id:'multishot',kind:'volley',icon:'➶',color:0xb4d4bf,
    cost:28,cooldown:8,range:345,power:0.92,radius:105,duration:0,
    aimMode:'GROUND_POSITION'}),
  shadowStep:Object.freeze({id:'shadowStep',kind:'mobility',icon:'✧',color:0x9a9ef1,
    cost:30,cooldown:13,range:255,power:0,radius:0,duration:3,
    aimMode:'TARGET_ENTITY'}),
  trap:Object.freeze({id:'trap',kind:'trap',icon:'✣',color:0x87c790,
    cost:22,cooldown:7,range:185,power:1.3,radius:58,duration:18,
    aimMode:'GROUND_POSITION'}),
  fanOfKnives:Object.freeze({id:'fanOfKnives',kind:'nova',icon:'✺',color:0xd9b8a8,
    cost:32,cooldown:11,range:0,power:1.25,radius:155,duration:0,
    aimMode:'SELF'})
});
export function getRogueAbility(id:unknown):Readonly<RogueAbility>|null{
  return typeof id==='string'&&Object.hasOwn(ROGUE_EXTRA_SKILLS,id)
    ?ROGUE_EXTRA_SKILLS[id as RogueExtraAbilityId]:null;
}
export function validRogueCooldowns(value:unknown):value is RogueCooldowns{
  return !!value&&typeof value==='object'&&!Array.isArray(value)
    &&Object.entries(value).length<=5
    &&Object.entries(value).every(([key,n])=>!!getRogueAbility(key)
      &&typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=360);
}
export function advanceRogueCooldowns(value:unknown,dt:unknown):RogueCooldowns|null{
  if(!validRogueCooldowns(value)||typeof dt!=='number'||!Number.isFinite(dt)
    ||dt<0||dt>1)return null;
  return Object.fromEntries(Object.entries(value).map(([k,n])=>
    [k,Math.max(0,Math.round((n-dt)*10000)/10000)])) as RogueCooldowns;
}
interface Position{readonly x:number;readonly y:number}
const point=(v:unknown):v is Position=>{
  if(!v||typeof v!=='object')return false;
  const {x,y}=v as Partial<Position>;
  return typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=2200
    &&typeof y==='number'&&Number.isFinite(y)&&y>=0&&y<=1400;
};
export interface RogueCastContext {
  readonly energy:number;readonly cooldowns:RogueCooldowns;readonly origin:Position;
  readonly targetId:string|null;readonly targetPosition:Position|null;
  readonly targetAlive:boolean;readonly targetVisible:boolean;
  readonly cursor:Position|null;
}
export type RogueCastPlan={readonly ok:true;readonly energyAfter:number;
  readonly cooldowns:RogueCooldowns;readonly aim:SkillAim}|
  {readonly ok:false;readonly reason:'unknown'|'invalid'|'cooldown'|'energy'|
    'target'|'range'|'aim'|'lineOfSight'};
export function planRogueCast(id:unknown,value:unknown):RogueCastPlan{
  const spell=getRogueAbility(id);
  if(!spell)return {ok:false,reason:'unknown'};
  if(!value||typeof value!=='object')return {ok:false,reason:'invalid'};
  const c=value as Partial<RogueCastContext>;
  if(typeof c.energy!=='number'||!Number.isFinite(c.energy)||c.energy<0
    ||c.energy>100000||!validRogueCooldowns(c.cooldowns)||!point(c.origin)
    ||typeof c.targetAlive!=='boolean'||typeof c.targetVisible!=='boolean'
    ||(c.targetId!==null&&c.targetId!==undefined
      &&(typeof c.targetId!=='string'||c.targetId.length===0||c.targetId.length>128))
    ||(c.targetPosition!==null&&c.targetPosition!==undefined&&!point(c.targetPosition))
    ||(c.cursor!==null&&c.cursor!==undefined&&!point(c.cursor)))
    return {ok:false,reason:'invalid'};
  if((c.cooldowns[spell.id]??0)>0.0001)return {ok:false,reason:'cooldown'};
  if(c.energy<spell.cost)return {ok:false,reason:'energy'};
  let aim:SkillAim;
  if(spell.aimMode==='TARGET_ENTITY'){
    if(!c.targetAlive||!c.targetId||!c.targetPosition)
      return {ok:false,reason:'target'};
    if(Math.hypot(c.origin.x-c.targetPosition.x,c.origin.y-c.targetPosition.y)>spell.range)
      return {ok:false,reason:'range'};
    if(!c.targetVisible)return {ok:false,reason:'lineOfSight'};
    aim={mode:'TARGET_ENTITY',targetId:c.targetId};
  }else if(spell.aimMode==='GROUND_POSITION'){
    if(!c.cursor)return {ok:false,reason:'aim'};
    if(Math.hypot(c.origin.x-c.cursor.x,c.origin.y-c.cursor.y)>spell.range)
      return {ok:false,reason:'range'};
    aim={mode:'GROUND_POSITION',position:{...c.cursor}};
  }else aim={mode:'SELF'};
  return {ok:true,energyAfter:c.energy-spell.cost,
    cooldowns:{...c.cooldowns,[spell.id]:spell.cooldown},aim};
}
