import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { CLASSES } from '../../src/game/data/classes';
import { SKILLS } from '../../src/game/skills/skills';
import {
 PALADIN_EXTRA_IDS, PALADIN_EXTRA_SKILLS, getPaladinAbility,
 planPaladinCast, validPaladinCooldowns
} from '../../src/game/skills/paladinKit';
import { PALADIN_TALENT_TREE, planSpendTalent, planRespecTalents,
  validateTalentBuild, projectTalentBonuses } from '../../src/game/progression/talentTree';
import { rollAffixes, validateAffixCombination } from '../../src/game/items/affixGeneration';
import { SeededRng, rollItemForBase, deriveStats, createEquipment } from '../../src/game/data/items';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';

const frame=16.667;
function tick(sim:GameSimulation,frames=65):void {
  for(let i=0;i<frames;i++)sim.advance(frame);
}
function paladin(level=1):GameSimulation {
  const sim=new GameSimulation(42);
  sim.command({type:'reset',classId:'PALADIN',seed:42});
  if(level>1){
    const s=sim.snapshot();
    expect(sim.restore({...s,level,skillPoints:level-1,
      talentPoints:Math.floor(level/5),xp:0,resource:CLASSES.PALADIN.resourceMax,
      player:{...s.player,maxHealth:deriveStats('PALADIN',s.equipment,level).maxHealth,
        health:deriveStats('PALADIN',s.equipment,level).maxHealth}})).toBe(true);
  }
  return sim;
}

describe('Prompt 39 — pure Paladin class kit',()=>{
  it('retains Judgment and Consecration and supplies exactly five new typed skills',()=>{
    expect(CLASSES.PALADIN.resourceId).toBe('faith');
    expect(SKILLS.PALADIN.rmb.id).toBe('judgment');
    expect(SKILLS.PALADIN.slot1.id).toBe('consecration');
    expect(PALADIN_EXTRA_IDS).toEqual([
      'holyStrike','divineShield','healingLight','holyAura','smite'
    ]);
    const seven=new Set([SKILLS.PALADIN.rmb.id,SKILLS.PALADIN.slot1.id,...PALADIN_EXTRA_IDS]);
    expect(seven.size).toBe(7);
    for(const id of PALADIN_EXTRA_IDS){
      const def=getPaladinAbility(id)!;
      expect(def).toEqual(PALADIN_EXTRA_SKILLS[id]);
      expect(def.cost).toBeGreaterThan(0);
      expect(def.cooldown).toBeGreaterThan(0);
      expect(def.color).toBeGreaterThan(0);
    }
    for(const forged of ['__proto__','warCry',null,''])expect(getPaladinAbility(forged)).toBeNull();
  });
  it('rejects invalid costs, forged ids, cooldowns, enemy range and insufficient Faith',()=>{
    expect(planPaladinCast('holyStrike',100,{},40,true)).toMatchObject({ok:true});
    expect(planPaladinCast('holyStrike',0,{},40,true)).toMatchObject({ok:false});
    expect(planPaladinCast('holyStrike',100,{},1000,true)).toMatchObject({ok:false});
    expect(planPaladinCast('smite',100,{},200,false)).toMatchObject({ok:false});
    expect(planPaladinCast('divineShield',100,{},999,false)).toMatchObject({ok:true});
    expect(planPaladinCast('smite',100,{smite:2},100,true)).toMatchObject({ok:false});
    expect(planPaladinCast('__proto__',100,{},40,true)).toMatchObject({ok:false});
    expect(validPaladinCooldowns({})).toBe(true);
    expect(validPaladinCooldowns({holyStrike:1,smite:5})).toBe(true);
    expect(validPaladinCooldowns({smite:-1})).toBe(false);
    expect(validPaladinCooldowns({smite:Infinity})).toBe(false);
    expect(validPaladinCooldowns(JSON.parse('{"__proto__":3}'))).toBe(false);
  });
});

describe('Prompt 39 — existing combat timeline and Faith authority',()=>{
  it('plays Holy Strike and Smite at hit frame, consumes Faith and forbids cooldown/recast exploit',()=>{
    const sim=paladin();
    const enemy=sim.snapshot().enemies.find(x=>x.actor.alive)!;
    const near=sim.snapshot();
    // Position player in attack range without changing the existing encounter roster.
    // The enemy's own validated tile is guaranteed walkable by the world generator.
    expect(sim.restore({...near,player:{...near.player,x:enemy.actor.x,y:enemy.actor.y}})).toBe(true);
    const before=sim.snapshot();
    sim.command({type:'paladinAbility',id:'holyStrike',targetId:enemy.actor.id});
    expect(sim.snapshot().resource).toBe(before.resource-PALADIN_EXTRA_SKILLS.holyStrike.cost);
    expect(sim.snapshot().enemies.find(x=>x.actor.id===enemy.actor.id)?.actor.health)
      .toBe(before.enemies.find(x=>x.actor.id===enemy.actor.id)?.actor.health);
    expect(sim.snapshot().classAction?.timeline.actionId).toBe('holyStrike');
    tick(sim,20);
    const struck=sim.snapshot();
    expect(struck.enemies.find(x=>x.actor.id===enemy.actor.id)?.actor.health).toBeLessThan(enemy.actor.health);
    expect(struck.resource).toBeGreaterThanOrEqual(0);
    const used=struck.resource;
    sim.command({type:'paladinAbility',id:'holyStrike',targetId:enemy.actor.id});
    expect(sim.snapshot().resource).toBe(used);
    // Smite has its own clean battlefield so the first target's health,
    // AI movement or previous combat cannot make the assertion flaky.
    const smite=paladin();
    const rangeStart=smite.snapshot();
    const rangeTarget=rangeStart.enemies.find(x=>x.actor.alive)!;
    expect(smite.restore({...rangeStart,player:{...rangeStart.player,
      x:rangeTarget.actor.x,y:rangeTarget.actor.y}})).toBe(true);
    smite.command({type:'paladinAbility',id:'smite',targetId:rangeTarget.actor.id});
    expect(smite.snapshot().paladinCooldowns?.smite).toBeGreaterThan(0);
    tick(smite,24);
    expect(smite.snapshot().enemies.find(x=>x.actor.id===rangeTarget.actor.id)?.actor.health)
      .toBeLessThan(rangeTarget.actor.health);
  });
  it('applies real Divine Shield, Healing Light and Holy Aura effects without duplicating Warrior actions',()=>{
    const shield=paladin();
    shield.command({type:'paladinAbility',id:'divineShield'});
    tick(shield,38);
    expect(shield.snapshot().shield).toBeGreaterThan(0);
    expect(shield.snapshot().statusEffects?.player.some(x=>x.id==='fortified')).toBe(true);
    expect(shield.snapshot().warriorAction).toBeNull();
    const healed=paladin();
    const before=healed.snapshot();
    expect(healed.restore({...before,player:{...before.player,health:before.player.health-80}})).toBe(true);
    healed.command({type:'paladinAbility',id:'healingLight'});
    tick(healed,38);
    expect(healed.snapshot().player.health).toBeGreaterThan(before.player.health-80);
    expect(healed.snapshot().player.health).toBeLessThanOrEqual(healed.snapshot().player.maxHealth);
    const aura=paladin();
    aura.command({type:'paladinAbility',id:'holyAura'});
    tick(aura,38);
    expect(aura.snapshot().statusEffects?.player.some(x=>x.id==='regeneration')).toBe(true);
  });
  it('rejects forged action snapshots and restores in-flight cast/cooldown state',()=>{
    const sim=paladin();
    sim.command({type:'paladinAbility',id:'divineShield'});
    const inFlight=sim.snapshot();
    expect(inFlight.classAction?.paladinAbilityId).toBe('divineShield');
    expect(sim.restore(structuredClone(inFlight))).toBe(true);
    expect(sim.snapshot()).toEqual(inFlight);
    const forged={...inFlight,classAction:{...inFlight.classAction!,paladinAbilityId:'__proto__'}} as unknown as typeof inFlight;
    expect(sim.restore(forged)).toBe(false);
    expect(sim.snapshot()).toEqual(inFlight);
    expect(sim.restore({...inFlight,paladinCooldowns:{smite:-1}})).toBe(false);
    expect(sim.snapshot()).toEqual(inFlight);
    sim.command({type:'reset',classId:'WARRIOR'});
    expect(sim.snapshot().paladinCooldowns).toEqual({});
  });
});

describe('Prompt 39 — Paladin talents and class-specific affixes',()=>{
  it('provides four Paladin talent branches, validated prerequisites and non-Warrior isolation',()=>{
    expect(new Set(PALADIN_TALENT_TREE.map(x=>x.branch))).toEqual(
      new Set(['holyWarrior','paladinGuardian','auraMaster','holyCaster']));
    expect(PALADIN_TALENT_TREE.length).toBeGreaterThanOrEqual(8);
    expect(planSpendTalent('PALADIN',25,5,{},'paladin.zeal').ok).toBe(true);
    expect(planSpendTalent('PALADIN',25,5,{},'paladin.righteousFire').ok).toBe(false);
    const first=planSpendTalent('PALADIN',25,5,{},'paladin.zeal');
    if(!first.ok)return;
    const second=planSpendTalent('PALADIN',25,4,first.ranks,'paladin.righteousFire');
    expect(second.ok).toBe(true);
    expect(validateTalentBuild('PALADIN',25,3,second.ok?second.ranks:{})).toBe(true);
    expect(validateTalentBuild('WARRIOR',25,4,first.ranks)).toBe(false);
    expect(validateTalentBuild('MAGE',25,4,first.ranks)).toBe(false);
    expect(projectTalentBonuses(first.ranks).holyDamage).toBeGreaterThan(0);
    expect(planRespecTalents('PALADIN',25,4,first.ranks,1000).ok).toBe(true);
  });
  it('spends talents in the real Paladin, persists through v11 and rejects cross-class tampering',()=>{
    const sim=paladin(25);
    const before=sim.snapshot();
    sim.command({type:'spendTalent',id:'paladin.zeal'});
    expect(sim.snapshot().talentRanks).toEqual({'paladin.zeal':1});
    expect(sim.snapshot().talentPoints).toBe(before.talentPoints!-1);
    const p=sim.character();
    expect(readSaveRecord(createSaveRecord(p))).toEqual(p);
    const restored=new GameSimulation(42);
    expect(restored.restoreCharacter(p,42)).toBe(true);
    expect(restored.snapshot().talentRanks).toEqual(p.talentRanks);
    expect(restored.restoreCharacter({...p,classId:'WARRIOR'})).toBe(false);
  });
  it('rolls Paladin-only equipment affixes from the same generator, not on other classes',()=>{
    const paladinInput={rarity:'LEGENDARY' as const,itemLevel:90,tags:['weapon','melee','paladin'] as const};
    const baseline={...paladinInput,tags:['weapon','melee'] as const};
    let count=0;
    for(let seed=0;seed<320;seed++){
      const a=rollAffixes(paladinInput,new SeededRng(seed));
      const b=rollAffixes(paladinInput,new SeededRng(seed));
      expect(a).toEqual(b);
      expect(validateAffixCombination(a,paladinInput)).toBe(true);
      count+=a.filter(x=>x.id==='consecrated'||x.id==='ofFaith').length;
      expect(rollAffixes(baseline,new SeededRng(seed)).some(x=>
        x.id==='consecrated'||x.id==='ofFaith')).toBe(false);
    }
    expect(count).toBeGreaterThan(0);
    const paladinItem=rollItemForBase('mace','paladin-test',90,'LEGENDARY',new SeededRng(42),'PALADIN');
    const warriorItem=rollItemForBase('mace','warrior-test',90,'LEGENDARY',new SeededRng(42),'WARRIOR');
    expect(paladinItem).not.toBeNull();
    expect(warriorItem).not.toBeNull();
    expect(paladinItem!.affixes.every(x=>x.id!=='__proto__')).toBe(true);
    expect(warriorItem!.affixes.every(x=>x.id!=='consecrated'&&x.id!=='ofFaith')).toBe(true);
  });
});
