// GPL-3.0-only — #207 B2b2c. Validate complete canonical population before mutation.
import {ENEMY_DEFINITIONS,validIntent,type EnemyUnit} from '../enemies/enemies';
import {monsterAction} from '../enemies/monsterRuntime';
import {validateEliteSet} from '../enemies/eliteModifiers';
import {isActiveEffect} from '../skills/skills';
import {ACTOR_RADIUS,canOccupy,type Obstacle} from './navigation';

export interface PopulationSnapshot {
  seed:number;
  sessionId:string;
  enemies:EnemyUnit[];
}

/** Validate against the immutable identity/type list supplied by the live roster.
 * No partial roster, duplicate, foreign actor or summoned actor may be restored.
 * Return detached records in canonical order, or reject the whole input. */
export function validatedPopulationUnits(raw:unknown,canonical:readonly EnemyUnit[],
  obstacles:readonly Obstacle[]):EnemyUnit[]|null{
  if(!Array.isArray(raw)||raw.length!==canonical.length)return null;
  const expected=new Map(canonical.map(u=>[u.actor.id,u.actor.type]));
  const seen=new Map<string,EnemyUnit>();
  for(const candidate of raw){
    if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))return null;
    const u=candidate as EnemyUnit,a=u.actor;
    if(!a||typeof a!=='object'||typeof a.id!=='string'||!expected.has(a.id)
      ||expected.get(a.id)!==a.type||seen.has(a.id)
      ||(u.summoned!==undefined&&u.summoned!==false)
      ||!Number.isSafeInteger(a.level)||a.level!<1||a.level!>100
      ||![a.x,a.y,a.health,a.maxHealth].every(Number.isFinite)
      ||a.maxHealth<=0||a.health<0||a.health>a.maxHealth
      ||a.alive!==(a.health>0)||!canOccupy(a,ACTOR_RADIUS,obstacles)
      ||!validIntent(u.intent)
      ||(u.intent!==null&&(u.intent.abilityId!==undefined
        ? !monsterAction(a.type,u.intent.abilityId)
        : u.intent.pattern!==ENEMY_DEFINITIONS[a.type].attack))
      ||!Number.isFinite(u.cooldown)||u.cooldown<0||u.cooldown>20
      ||!Array.isArray(u.effects)||u.effects.length>8||!u.effects.every(isActiveEffect))return null;
    if(u.abilityCooldowns!==undefined&&(!u.abilityCooldowns
      ||typeof u.abilityCooldowns!=='object'||Array.isArray(u.abilityCooldowns)
      ||Object.entries(u.abilityCooldowns).some(([id,cd])=>
        !monsterAction(a.type,id)||!Number.isFinite(cd)||cd<0||cd>30)))return null;
    const e=u.elite;
    if(e!==undefined&&(!e||!validateEliteSet(e.modifiers)||e.modifiers.length===0
      ||!Array.isArray(e.visualTags)||e.visualTags.length>15
      ||e.visualTags.some(tag=>typeof tag!=='string')
      ||!Number.isFinite(e.shield)||e.shield<0||e.shield>1000000
      ||!Number.isFinite(e.damageMultiplier)||e.damageMultiplier<1||e.damageMultiplier>8
      ||!Number.isFinite(e.speedMultiplier)||e.speedMultiplier<1||e.speedMultiplier>8
      ||!Number.isFinite(e.elapsedSeconds)||e.elapsedSeconds<0||e.elapsedSeconds>86400
      ||typeof e.deathTriggered!=='boolean'))return null;
    // Reject unsupported fields by reconstructing only the runtime contract.
    const unit:EnemyUnit={actor:{id:a.id,type:a.type,level:a.level,x:a.x,y:a.y,
      health:a.health,maxHealth:a.maxHealth,alive:a.alive},
      cooldown:u.cooldown,intent:u.intent?{...u.intent}:null,
      effects:u.effects.map(effect=>({...effect})),
      ...(u.abilityCooldowns?{abilityCooldowns:{...u.abilityCooldowns}}:{}),
      ...(e?{elite:{...e,modifiers:[...e.modifiers],visualTags:[...e.visualTags]}}:{})};
    seen.set(a.id,unit);
  }
  try{return structuredClone(canonical.map(u=>seen.get(u.actor.id)!));}
  catch{return null;}
}
