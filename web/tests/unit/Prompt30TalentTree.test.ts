import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import {
  TALENT_TREE, canSpendTalent, planSpendTalent, planRespecTalents,
  projectTalentBonuses, validateTalentBuild, respecGoldCost,
  applyTalentStats
} from '../../src/game/progression/talentTree';
import { deriveStats } from '../../src/game/stats/deriveStats';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';

function leveled(level = 25): GameSimulation {
  const sim = new GameSimulation(42);
  const state = sim.snapshot();
  expect(sim.restore({
    ...state, level, xp: 0, skillPoints: level - 1,
    talentPoints: Math.floor(level / 5)
  })).toBe(true);
  return sim;
}

describe('Prompt 30 — pure talent tree model', () => {
  it('publishes 3 Warrior branches, sane ranks, prerequisites and effects', () => {
    expect(new Set(TALENT_TREE.map(n => n.branch)))
      .toEqual(new Set(['berserker', 'guardian', 'warlord']));
    expect(TALENT_TREE.length).toBeGreaterThanOrEqual(12);
    expect(new Set(TALENT_TREE.map(n => n.id)).size).toBe(TALENT_TREE.length);
    for (const node of TALENT_TREE) {
      expect(node.maxRank).toBeGreaterThanOrEqual(1);
      expect(node.maxRank).toBeLessThanOrEqual(3);
      expect(node.unlockLevel).toBeGreaterThanOrEqual(5);
      expect(node.effects.length).toBeGreaterThan(0);
    }
    expect(canSpendTalent('WARRIOR', 5, 1, {}, 'berserker.battleFury').ok).toBe(true);
    expect(canSpendTalent('WARRIOR', 5, 1, {}, 'berserker.bloodlust').ok).toBe(false);
    expect(canSpendTalent('MAGE', 25, 5, {}, 'berserker.battleFury').ok).toBe(false);
    expect(canSpendTalent('WARRIOR', 25, 5, {}, '__proto__').ok).toBe(false);
  });

  it('spends atomically, gates levels and prerequisites, prevents duplicate overspending', () => {
    const one=planSpendTalent('WARRIOR',25,5,{},'berserker.battleFury');
    expect(one.ok).toBe(true);
    if(!one.ok) return;
    expect(one.unspent).toBe(4);
    expect(one.ranks).toEqual({'berserker.battleFury':1});
    expect(planSpendTalent('WARRIOR',25,4,one.ranks,'berserker.bloodlust').ok).toBe(true);
    expect(planSpendTalent('WARRIOR',25,0,one.ranks,'berserker.bloodlust').ok).toBe(false);
    expect(planSpendTalent('WARRIOR',25,4,one.ranks,'warlord.commander').ok).toBe(false);
    expect(planSpendTalent('WARRIOR',25,4,one.ranks,'berserker.battleFury').ok).toBe(true);
    expect(planSpendTalent('WARRIOR',5,0,one.ranks,'berserker.battleFury').ok).toBe(false);
    expect(validateTalentBuild('WARRIOR',25,4,{'berserker.battleFury':1})).toBe(true);
    expect(validateTalentBuild('WARRIOR',25,5,{'berserker.battleFury':1})).toBe(false);
    expect(validateTalentBuild('WARRIOR',25,4,{'berserker.bloodlust':1})).toBe(false);
    expect(validateTalentBuild('WARRIOR',25,4,JSON.parse('{"__proto__":1}'))).toBe(false);
    expect(validateTalentBuild('MAGE',25,5,{'berserker.battleFury':1})).toBe(false);
    expect(validateTalentBuild('WARRIOR',25,4,{'berserker.battleFury':99})).toBe(false);
    expect(validateTalentBuild('WARRIOR',25,4,{'berserker.battleFury':0})).toBe(false);
  });

  it('applies character stats and reusable skill/passive effects without mutating base', () => {
    const base=deriveStats('WARRIOR',new GameSimulation().snapshot().equipment,25);
    const ranks={'berserker.battleFury':1,'guardian.ironSkin':2,'warlord.commandingCry':1};
    const bonuses=projectTalentBonuses(ranks);
    const improved=applyTalentStats(base,ranks);
    expect(improved).not.toBe(base);
    expect(improved.maxResource).toBeGreaterThan(base.maxResource);
    expect(improved.armor).toBeGreaterThan(base.armor);
    expect(improved.physicalResist).toBeGreaterThan(base.physicalResist);
    expect(bonuses.rageGain).toBeGreaterThan(0);
    expect(bonuses.warCryDuration).toBeGreaterThan(0);
    expect(base.maxResource).toBe(deriveStats('WARRIOR',new GameSimulation().snapshot().equipment,25).maxResource);
    expect(projectTalentBonuses({'berserker.lastStand':1}).lowHealthDamageMultiplier).toBeGreaterThan(0);
    expect(projectTalentBonuses({'guardian.bulwark':1}).shieldOnWarCryPercent).toBeGreaterThan(0);
  });

  it('respec quotes charge real gold, refund exactly spent ranks and leave unaffordable state alone', () => {
    const ranks={'guardian.ironSkin':2};
    const quote=respecGoldCost(25,ranks);
    expect(quote).toBeGreaterThan(0);
    expect(planRespecTalents('WARRIOR',25,3,ranks,quote-1).ok).toBe(false);
    const ok=planRespecTalents('WARRIOR',25,3,ranks,quote);
    expect(ok.ok).toBe(true);
    if(!ok.ok) return;
    expect(ok.unspent).toBe(5);
    expect(ok.gold).toBe(0);
    expect(ok.ranks).toEqual({});
    expect(planRespecTalents('WARRIOR',25,5,{},10000).ok).toBe(false);
  });
});

describe('Prompt 30 — authoritative simulation and save integration', () => {
  it('spend/respec changes combat-relevant derived stats and only respec pays gold', () => {
    const sim=leveled();
    const before=sim.snapshot();
    sim.command({type:'spendTalent',id:'guardian.ironSkin'});
    const after=sim.snapshot();
    expect(after.talentPoints).toBe(4);
    expect(after.talentRanks).toEqual({'guardian.ironSkin':1});
    expect(after.stats.armor).toBeGreaterThan(before.stats.armor);
    expect(after.gold).toBe(before.gold);
    sim.command({type:'spendTalent',id:'warlord.commander'});
    expect(sim.snapshot().talentPoints).toBe(4);
    const quote=respecGoldCost(25,after.talentRanks!);
    // A levelled debug snapshot defaults to starter gold; charge only after enough gold.
    const funded={...sim.snapshot(),gold:quote};
    expect(sim.restore(funded)).toBe(true);
    sim.command({type:'respecTalents'});
    const reset=sim.snapshot();
    expect(reset.gold).toBe(0);
    expect(reset.talentPoints).toBe(5);
    expect(reset.talentRanks).toEqual({});
    expect(reset.stats.armor).toBe(before.stats.armor);
  });

  it('stores talent ranks in v11 character-only save and blocks invalid or forged builds', () => {
    const sim=leveled(25);
    sim.command({type:'spendTalent',id:'berserker.battleFury'});
    sim.command({type:'spendTalent',id:'berserker.bloodlust'});
    const p=sim.character();
    expect(p.talentRanks).toEqual({
      'berserker.battleFury':1,'berserker.bloodlust':1
    });
    const record=createSaveRecord(p);
    expect(record?.format).toBe(11);
    expect(record?.character.talentRanks).toEqual(p.talentRanks);
    expect(readSaveRecord(record)).toEqual(p);
    const recovered=new GameSimulation(42);
    expect(recovered.restoreCharacter(p,42)).toBe(true);
    expect(recovered.snapshot().talentRanks).toEqual(p.talentRanks);
    expect(recovered.snapshot().stats.attackSpeed).toBeGreaterThan(
      deriveStats('WARRIOR',recovered.snapshot().equipment,25).attackSpeed);
    expect(recovered.restoreCharacter({
      ...p,talentRanks:{'berserker.executioner':1}
    })).toBe(false);
    expect(recovered.character()).toEqual(p);
    expect(readSaveRecord({...record,character:{...p,talentPoints:5}})).toBeNull();
    // Historical v11 saves without a talentRanks property remain loadable.
    const legacy={...p};delete legacy.talentRanks;
    expect(readSaveRecord({...record,character:legacy})?.talentRanks).toBeUndefined();
  });

  it('keeps non-Warrior characters unaffected and dead heroes unable to spend', () => {
    const sim=leveled(25);
    const before=sim.snapshot();
    sim.command({type:'reset',classId:'MAGE',seed:42});
    expect(sim.snapshot().talentRanks).toEqual({});
    sim.command({type:'spendTalent',id:'berserker.battleFury'});
    expect(sim.snapshot().talentRanks).toEqual({});
    expect(sim.restore(before)).toBe(true);
    const health=sim.snapshot().player.health;
    (sim as unknown as {hitPlayer(amount:number):void}).hitPlayer(health+10);
    sim.command({type:'spendTalent',id:'guardian.ironSkin'});
    expect(sim.snapshot().talentRanks).toEqual({});
  });
});
