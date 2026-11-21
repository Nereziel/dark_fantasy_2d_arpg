// GPL-3.0-only. Prompt 43: pure Soul Power plans and validation.
import {describe,expect,it} from 'vitest';
import {
  WARLOCK_EXTRA_IDS,WARLOCK_EXTRA_SPELLS,planWarlockCast,
  advanceWarlockCooldowns,validWarlockCooldowns,getWarlockSpell
} from '../../src/game/skills/warlockKit';

const context=()=>({
  soul:100,cooldowns:{},origin:{x:400,y:400},targetId:'wraith-1',
  targetPosition:{x:490,y:410},targetAlive:true,targetVisible:true
});

describe('Prompt 43 — Warlock pure spell planning',()=>{
  it('defines five new abilities alongside the existing Life Drain/Soul Burn',()=>{
    expect(WARLOCK_EXTRA_IDS).toEqual([
      'shadowBolt','demonSummoning','corruption','fear','hellfire'
    ]);
    for(const id of WARLOCK_EXTRA_IDS)expect(WARLOCK_EXTRA_SPELLS[id].id).toBe(id);
    expect(getWarlockSpell('__proto__')).toBeNull();
    expect(getWarlockSpell('lifeDrain')).toBeNull();
  });
  it('spends Soul Power exactly once and starts a bounded cooldown',()=>{
    const initial=context();
    const plan=planWarlockCast('shadowBolt',initial);
    expect(plan.ok).toBe(true);
    if(!plan.ok)return;
    expect(plan.soulAfter).toBe(100-WARLOCK_EXTRA_SPELLS.shadowBolt.cost);
    expect(plan.aim).toEqual({mode:'TARGET_ENTITY',targetId:'wraith-1'});
    expect(planWarlockCast('shadowBolt',{...initial,soul:plan.soulAfter,
      cooldowns:plan.cooldowns})).toMatchObject({ok:false,reason:'cooldown'});
    expect(advanceWarlockCooldowns(plan.cooldowns,1)?.shadowBolt)
      .toBeCloseTo(WARLOCK_EXTRA_SPELLS.shadowBolt.cooldown-1,3);
  });
  it('rejects missing, invisible, distant and dead targets without resource spend',()=>{
    expect(planWarlockCast('corruption',{...context(),targetAlive:false}))
      .toMatchObject({ok:false,reason:'target'});
    expect(planWarlockCast('fear',{...context(),targetVisible:false}))
      .toMatchObject({ok:false,reason:'lineOfSight'});
    expect(planWarlockCast('shadowBolt',{...context(),
      targetPosition:{x:2100,y:1400}})).toMatchObject({ok:false,reason:'range'});
    expect(planWarlockCast('shadowBolt',{...context(),soul:0}))
      .toMatchObject({ok:false,reason:'soul'});
  });
  it('allows self-cast summon/nova without a target and rejects corrupted input',()=>{
    const c={...context(),targetId:null,targetPosition:null,targetAlive:false};
    expect(planWarlockCast('demonSummoning',c)).toMatchObject({
      ok:true,aim:{mode:'SELF'}});
    expect(planWarlockCast('hellfire',c)).toMatchObject({ok:true,aim:{mode:'SELF'}});
    expect(planWarlockCast('shadowBolt',{...context(),soul:NaN})).toMatchObject({
      ok:false,reason:'invalid'});
    expect(planWarlockCast('shadowBolt',{...context(),
      cooldowns:{constructor:1}})).toMatchObject({ok:false,reason:'invalid'});
    expect(validWarlockCooldowns({shadowBolt:Infinity})).toBe(false);
    expect(advanceWarlockCooldowns({shadowBolt:1},-1)).toBeNull();
    expect(advanceWarlockCooldowns({shadowBolt:0.1},0.5)).toEqual({shadowBolt:0});
  });
});
