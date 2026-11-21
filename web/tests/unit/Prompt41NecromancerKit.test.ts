// GPL-3.0-only — Prompt 41 RED first ability economy and target authority.
import { describe, expect, it } from 'vitest';
import {
  NECRO_EXTRA_IDS, NECRO_EXTRA_SPELLS, getNecroSpell,
  planNecroCast, validNecroCooldowns, advanceNecroCooldowns
} from '../../src/game/skills/necromancerKit';
const origin={x:240,y:300};
const base={essence:100,cooldowns:{},origin,targetId:'skeleton-1',
  targetPosition:{x:320,y:300},targetAlive:true,corpseAvailable:true,
  cursor:{x:320,y:300}};
describe('Prompt 41 Necromancer five extra skills',()=>{
  it('defines seven total skills and five isolated extras',()=>{
    expect(NECRO_EXTRA_IDS).toEqual([
      'corpseExplosion','bloodDrain','curse','summonGolem','deathNova'
    ]);
    expect(Object.keys(NECRO_EXTRA_SPELLS)).toHaveLength(5);
    expect(NECRO_EXTRA_IDS.every(id=>getNecroSpell(id)?.id===id)).toBe(true);
    expect(getNecroSpell('__proto__')).toBeNull();
    expect(getNecroSpell('toString')).toBeNull();
    expect(getNecroSpell('boneSpear')).toBeNull(); // existing base slot
  });
  it('charges Essence atomically and refuses cooldown or insufficient resource',()=>{
    const result=planNecroCast('bloodDrain',base);
    expect(result.ok).toBe(true);
    if(!result.ok)return;
    expect(result.essenceAfter).toBe(100-NECRO_EXTRA_SPELLS.bloodDrain.cost);
    expect(result.cooldowns.bloodDrain).toBe(NECRO_EXTRA_SPELLS.bloodDrain.cooldown);
    expect(planNecroCast('bloodDrain',{...base,cooldowns:result.cooldowns}))
      .toEqual({ok:false,reason:'cooldown'});
    expect(planNecroCast('bloodDrain',{...base,essence:0}))
      .toEqual({ok:false,reason:'essence'});
    expect(validNecroCooldowns(result.cooldowns)).toBe(true);
    expect(advanceNecroCooldowns({bloodDrain:1},0.4)).toEqual({bloodDrain:0.6});
  });
  it('requires a real accessible corpse before spending explosion cost',()=>{
    expect(planNecroCast('corpseExplosion',{...base,corpseAvailable:false}))
      .toEqual({ok:false,reason:'corpse'});
    expect(planNecroCast('corpseExplosion',{...base,corpseAvailable:true,cursor:null}))
      .toEqual({ok:false,reason:'aim'});
    expect(planNecroCast('corpseExplosion',base)).toMatchObject({ok:true,
      aim:{mode:'GROUND_POSITION',position:base.cursor}});
  });
  it('requires alive authoritative targets, range and line of sight',()=>{
    expect(planNecroCast('curse',{...base,targetId:null}))
      .toEqual({ok:false,reason:'target'});
    expect(planNecroCast('bloodDrain',{...base,targetAlive:false}))
      .toEqual({ok:false,reason:'target'});
    expect(planNecroCast('curse',{...base,targetPosition:{x:2100,y:1200}}))
      .toEqual({ok:false,reason:'range'});
    expect(planNecroCast('curse',{...base,targetVisible:false}))
      .toEqual({ok:false,reason:'lineOfSight'});
  });
  it('self-casts Death Nova and Golem, and rejects hostile input',()=>{
    expect(planNecroCast('summonGolem',{...base,targetId:null,targetPosition:null}))
      .toMatchObject({ok:true,aim:{mode:'SELF'}});
    expect(planNecroCast('deathNova',{...base,targetId:null,targetPosition:null}))
      .toMatchObject({ok:true,aim:{mode:'SELF'}});
    expect(validNecroCooldowns({__proto__:1})).toBe(true); // object literal has no own prototype key
    expect(validNecroCooldowns(JSON.parse('{"__proto__":1}'))).toBe(false);
    expect(validNecroCooldowns({curse:Infinity})).toBe(false);
    expect(planNecroCast('curse',{...base,essence:NaN}))
      .toEqual({ok:false,reason:'invalid'});
    expect(planNecroCast('curse',{...base,origin:{x:Infinity,y:3}}))
      .toEqual({ok:false,reason:'invalid'});
  });
});
