/**
 * Prompt 43 — Warlock: five extra Soul Power skills complement Life Drain/Soul Burn.
 * Stateless, deterministic casting plans; all damage, controls and summons are
 * committed only by the fixed-step GameSimulation at their impact frame.
 * GPL-3.0-only.
 */
import type {SkillAim} from '../input/skillAiming';

export const WARLOCK_EXTRA_IDS=Object.freeze([
  'shadowBolt','demonSummoning','corruption','fear','hellfire'
] as const);
export type WarlockExtraSpellId=typeof WARLOCK_EXTRA_IDS[number];
export type WarlockCooldowns=Partial<Record<WarlockExtraSpellId,number>>;
export interface WarlockSpell {
  readonly id:WarlockExtraSpellId;
  readonly kind:'bolt'|'summon'|'curse'|'fear'|'nova';
  readonly icon:string;readonly color:number;readonly cost:number;
  readonly cooldown:number;readonly range:number;readonly power:number;
  readonly radius:number;readonly duration:number;
  readonly aimMode:'TARGET_ENTITY'|'SELF';
}
export const WARLOCK_EXTRA_SPELLS:Readonly<Record<WarlockExtraSpellId,Readonly<WarlockSpell>>>=
Object.freeze({
  shadowBolt:Object.freeze({id:'shadowBolt',kind:'bolt',
    icon:'✦',color:0x9c75dc,cost:14,cooldown:2.4,range:305,power:1.65,
    radius:0,duration:0,aimMode:'TARGET_ENTITY'}),
  demonSummoning:Object.freeze({id:'demonSummoning',kind:'summon',
    icon:'♜',color:0xc16d94,cost:28,cooldown:11,range:0,power:1,
    radius:0,duration:22,aimMode:'SELF'}),
  corruption:Object.freeze({id:'corruption',kind:'curse',
    icon:'☩',color:0x9671a9,cost:20,cooldown:8,range:285,power:0,
    radius:0,duration:7,aimMode:'TARGET_ENTITY'}),
  fear:Object.freeze({id:'fear',kind:'fear',
    icon:'◉',color:0xa985ce,cost:24,cooldown:13,range:260,power:0,
    radius:0,duration:2,aimMode:'TARGET_ENTITY'}),
  hellfire:Object.freeze({id:'hellfire',kind:'nova',
    icon:'♨',color:0xe8896a,cost:32,cooldown:12,range:0,power:1.25,
    radius:145,duration:4,aimMode:'SELF'})
});
export function getWarlockSpell(id:unknown):Readonly<WarlockSpell>|null{
  return typeof id==='string'&&Object.hasOwn(WARLOCK_EXTRA_SPELLS,id)
    ?WARLOCK_EXTRA_SPELLS[id as WarlockExtraSpellId]:null;
}
export function validWarlockCooldowns(value:unknown):value is WarlockCooldowns{
  return !!value&&typeof value==='object'&&!Array.isArray(value)
    &&Object.entries(value).length<=WARLOCK_EXTRA_IDS.length
    &&Object.entries(value).every(([id,n])=>getWarlockSpell(id)!==null
      &&typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=360);
}
export function advanceWarlockCooldowns(value:unknown,dt:unknown):WarlockCooldowns|null{
  if(!validWarlockCooldowns(value)||typeof dt!=='number'||!Number.isFinite(dt)
    ||dt<0||dt>1)return null;
  return Object.fromEntries(Object.entries(value).map(([id,n])=>
    [id,Math.max(0,Math.round((n-dt)*10000)/10000)])) as WarlockCooldowns;
}
interface Position{readonly x:number;readonly y:number}
function point(p:unknown):p is Position{
  if(!p||typeof p!=='object')return false;
  const q=p as Partial<Position>;
  return typeof q.x==='number'&&Number.isFinite(q.x)&&q.x>=0&&q.x<=2200
    &&typeof q.y==='number'&&Number.isFinite(q.y)&&q.y>=0&&q.y<=1400;
}
export interface WarlockCastContext{
  readonly soul:number;readonly cooldowns:WarlockCooldowns;
  readonly origin:Position;readonly targetId:string|null;
  readonly targetPosition:Position|null;readonly targetAlive:boolean;
  readonly targetVisible:boolean;
}
export type WarlockCastPlan=
  {readonly ok:true;readonly soulAfter:number;readonly cooldowns:WarlockCooldowns;
    readonly aim:SkillAim}
  |{readonly ok:false;readonly reason:'unknown'|'invalid'|'soul'|'cooldown'|
    'target'|'range'|'lineOfSight'};
export function planWarlockCast(id:unknown,value:unknown):WarlockCastPlan{
  const spell=getWarlockSpell(id);
  if(!spell)return {ok:false,reason:'unknown'};
  if(!value||typeof value!=='object')return {ok:false,reason:'invalid'};
  const c=value as Partial<WarlockCastContext>;
  if(typeof c.soul!=='number'||!Number.isFinite(c.soul)||c.soul<0||c.soul>100000
    ||!validWarlockCooldowns(c.cooldowns)||!point(c.origin)
    ||typeof c.targetAlive!=='boolean'||typeof c.targetVisible!=='boolean'
    ||(c.targetId!==null&&c.targetId!==undefined
      &&(typeof c.targetId!=='string'||c.targetId.length===0||c.targetId.length>128))
    ||(c.targetPosition!==null&&c.targetPosition!==undefined&&!point(c.targetPosition)))
    return {ok:false,reason:'invalid'};
  if((c.cooldowns[spell.id]??0)>0.0001)return {ok:false,reason:'cooldown'};
  if(c.soul<spell.cost)return {ok:false,reason:'soul'};
  let aim:SkillAim={mode:'SELF'};
  if(spell.aimMode==='TARGET_ENTITY'){
    if(!c.targetAlive||!c.targetId||!c.targetPosition)
      return {ok:false,reason:'target'};
    if(Math.hypot(c.origin.x-c.targetPosition.x,c.origin.y-c.targetPosition.y)>spell.range)
      return {ok:false,reason:'range'};
    if(!c.targetVisible)return {ok:false,reason:'lineOfSight'};
    aim={mode:'TARGET_ENTITY',targetId:c.targetId};
  }
  return {ok:true,soulAfter:c.soul-spell.cost,
    cooldowns:{...c.cooldowns,[spell.id]:spell.cooldown},aim};
}
