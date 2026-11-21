/**
 * Prompt 39 — Paladin class kit.
 *
 * The two baseline slot abilities (Judgment/Consecration) remain in SKILLS.
 * Five additional abilities share the existing class combat timeline, damage,
 * status and faith economy. No Warrior-specific cooldowns or rage machinery.
 * GPL-3.0-only.
 */
import type { SkillDefinition } from './skills';

export const PALADIN_EXTRA_IDS = [
  'holyStrike','divineShield','healingLight','holyAura','smite'
] as const;
export type PaladinAbilityId=typeof PALADIN_EXTRA_IDS[number];

export const PALADIN_EXTRA_SKILLS:Readonly<Record<PaladinAbilityId,Readonly<SkillDefinition>>> =
  Object.freeze({
    holyStrike:Object.freeze({
      id:'holyStrike',icon:'✝',kind:'strike',target:'enemy',
      cost:12,cooldown:4,range:94,power:1.45,color:0xf5cb75
    }),
    divineShield:Object.freeze({
      id:'divineShield',icon:'⬡',kind:'aura',target:'self',
      cost:32,cooldown:22,range:20,power:0,color:0xffeac4,
      duration:6
    }),
    healingLight:Object.freeze({
      id:'healingLight',icon:'✚',kind:'aura',target:'self',
      cost:27,cooldown:12,range:20,power:0,color:0xb1efbd
    }),
    holyAura:Object.freeze({
      id:'holyAura',icon:'☼',kind:'aura',target:'self',
      cost:36,cooldown:20,range:140,power:0.45,color:0xffe79a,
      duration:12
    }),
    smite:Object.freeze({
      id:'smite',icon:'✧',kind:'strike',target:'enemy',
      cost:24,cooldown:6,range:260,power:2.1,color:0xffda8b
    })
  });

export type PaladinCooldowns=Partial<Record<PaladinAbilityId,number>>;

export function getPaladinAbility(id:unknown):Readonly<SkillDefinition>|null {
  return typeof id==='string' && Object.hasOwn(PALADIN_EXTRA_SKILLS,id)
    ? PALADIN_EXTRA_SKILLS[id as PaladinAbilityId] : null;
}
export function validPaladinCooldowns(value:unknown):value is PaladinCooldowns {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const entries=Object.entries(value);
  return entries.length<=PALADIN_EXTRA_IDS.length
    &&entries.every(([id,time])=>getPaladinAbility(id)
      &&typeof time==='number'&&Number.isFinite(time)&&time>=0&&time<=360);
}

export type PaladinCastDecision =
  {readonly ok:true;readonly ability:Readonly<SkillDefinition>} |
  {readonly ok:false;readonly reason:'invalid'|'cooldown'|'faith'|'target'|'range'};

/**
 * Pure refusal before any action is queued, with range checks for enemy casts.
 * Self spells ignore target distance but still validate Faith and cooldowns.
 */
export function planPaladinCast(
  id:unknown,faith:unknown,cooldowns:unknown,
  targetDistance:unknown,targetAlive:unknown
):PaladinCastDecision {
  const ability=getPaladinAbility(id);
  if(!ability||typeof faith!=='number'||!Number.isFinite(faith)
    ||faith<0||faith>10000||!validPaladinCooldowns(cooldowns))
    return {ok:false,reason:'invalid'};
  if((cooldowns as PaladinCooldowns)[id as PaladinAbilityId]!>0.0001)
    return {ok:false,reason:'cooldown'};
  if(faith+0.0001<ability.cost)return {ok:false,reason:'faith'};
  if(ability.target==='enemy'){
    if(targetAlive!==true)return {ok:false,reason:'target'};
    if(typeof targetDistance!=='number'||!Number.isFinite(targetDistance)
      ||targetDistance<0||targetDistance>ability.range+0.5)
      return {ok:false,reason:'range'};
  }
  return {ok:true,ability};
}

export function advancePaladinCooldowns(value:PaladinCooldowns,deltaSeconds:number):PaladinCooldowns {
  if(!validPaladinCooldowns(value)||!Number.isFinite(deltaSeconds)||deltaSeconds<0)return {};
  return Object.fromEntries(Object.entries(value).map(([id,time])=>
    [id,Math.max(0,time-deltaSeconds)])) as PaladinCooldowns;
}
