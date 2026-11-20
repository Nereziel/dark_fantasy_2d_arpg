import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createEquipment, rollItemForBase, SeededRng } from '../../src/game/data/items';
import { WARRIOR_ABILITIES } from '../../src/game/skills/warriorKit';
import {
  composeSkillModifiers, projectEquippedSkill, type SkillModifier
} from '../../src/game/skills/skillModifiers';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';

describe('Prompt 31: generic, composable skill behavior', () => {
  it('preserves an unchanged base for zero modifiers and never mutates its sources', () => {
    const base = { id: 'whirlwind', radius: 120, projectileCount: 1, summonCount: 0 };
    const same = composeSkillModifiers(base, []);
    expect(same).toMatchObject({ radius: 120, projectileCount: 1, summonCount: 0,
      pullDistance: 0, pierceCount: 0, statuses: [], modifierIds: [] });
    expect(base).toEqual({ id: 'whirlwind', radius: 120, projectileCount: 1, summonCount: 0 });
    expect(projectEquippedSkill('whirlwind', 120, {}, createEquipment()).modifierIds).toEqual([]);
  });

  it('accepts typed reusable operation hooks for Fireball and Raise Skeleton projections', () => {
    const modifiers: SkillModifier[] = [
      { id: 'fireball.extra', kind: 'extraProjectiles', value: 2 },
      { id: 'fireball.radius', kind: 'radius', value: 22 },
      { id: 'fireball.pierce', kind: 'pierce', value: 1 },
      { id: 'fireball.burn', kind: 'status', statusId: 'burning', duration: 4, magnitude: 3 }
    ];
    const base = { id: 'fireball', radius: 66, projectileCount: 1, summonCount: 0 };
    const fireball = composeSkillModifiers(base, modifiers);
    expect(fireball.projectileCount).toBe(3);
    expect(fireball.pierceCount).toBe(1);
    expect(fireball.radius).toBe(88);
    expect(fireball.statuses).toEqual([
      { id: 'burning', duration: 4, magnitude: 3 }
    ]);
    const skeleton = composeSkillModifiers({
      id: 'raiseSkeleton', radius: 0, projectileCount: 0, summonCount: 1
    }, [
      { id:'summon.two', kind:'extraSummons', value: 2 },
      { id:'summon.armor', kind:'summonArmor', value: 20 }
    ]);
    expect(skeleton.summonCount).toBe(3);
    expect(skeleton.summonArmor).toBe(20);
    expect(base.radius).toBe(66);
    expect(modifiers[0]).toEqual({ id: 'fireball.extra', kind:'extraProjectiles', value: 2 });
  });

  it('resolves talent, skillRank affix and legendary item contributions deterministically', () => {
    const gear = createEquipment();
    const sword = rollItemForBase('greatsword', 'modifier-sword', 25, 'LEGENDARY',
      new SeededRng(13))!;
    expect(sword).toBeTruthy();
    sword.affixes.push({ id:'talent-skill', stat:'skillRank', value: 2 });
    // An arbitrary test fixture must remain an otherwise valid equipped item.
    sword.affixes = sword.affixes.slice(0, 6);
    gear.MAIN_HAND = sword;
    const ranks = {
      'warlord.commandingCry': 1,
      'warlord.shockwave': 1,
      'berserker.battleFury': 1,
      'berserker.bloodlust': 1
    } as const;
    const plan = projectEquippedSkill('whirlwind', 120, ranks, gear);
    expect(plan.radius).toBeGreaterThan(120);
    expect(plan.pullDistance).toBeGreaterThan(0);
    expect(plan.statuses.some(s => s.id === 'bleeding')).toBe(true);
    expect(plan.modifierIds).toContain('talent.warlord.shockwave.pull');
    expect(plan.modifierIds).toContain('equipment.skillRank.whirlwind.radius');
    expect(plan.modifierIds).toContain('equipment.power.greatsword.whirlwind.radius');
    expect(projectEquippedSkill('whirlwind', 120, ranks, gear)).toEqual(plan);
  });

  it('bounds malicious effects and excludes prototype keys, duplicates and invalid amounts', () => {
    expect(composeSkillModifiers({id:'fireball',radius:70,projectileCount:1,summonCount:0}, [
      {id:'x',kind:'radius',value:1e12}, {id:'x',kind:'radius',value:1e12},
      {id:'bad',kind:'radius',value:NaN}, {id:'proto',kind:'__proto__' as 'pull',value:20},
      {id:'pierce',kind:'pierce',value:99}
    ]).radius).toBeLessThanOrEqual(300);
    expect(composeSkillModifiers({id:'fireball',radius:70,projectileCount:1,summonCount:0}, [
      {id:'x',kind:'radius',value:1e12}, {id:'x',kind:'radius',value:1e12}
    ]).modifierIds).toEqual(['x']);
    expect(composeSkillModifiers({id:'fireball',radius:70,projectileCount:1,summonCount:0}, [
      {id:'status',kind:'status',statusId:'__proto__' as 'burning',duration:4,magnitude:2}
    ]).statuses).toEqual([]);
  });
});

describe('Prompt 31: authoritative Whirlwind transformation', () => {
  it('materially changes Whirlwind hit behavior and exposes the actual radius as a combat cue', () => {
    const sim = new GameSimulation(42);
    const snap = sim.snapshot();
    const ranks = {
      'warlord.commandingCry':1,
      'warlord.shockwave':1,
      'berserker.battleFury':1,
      'berserker.bloodlust':1
    } as const;
    const target = snap.enemies[0]!.actor;
    const near = { x: target.x - 90, y: target.y };
    const edited = {
      ...snap, level: 25, skillPoints: 24, talentPoints: 1,
      talentRanks: ranks, resource: 90,
      player: { ...snap.player, ...near },
      enemies: snap.enemies.map((unit,index) =>
        index === 0 ? { ...unit, cooldown: 10,
          actor:{...unit.actor,health:unit.actor.maxHealth} } : unit)
    };
    expect(sim.restore(edited)).toBe(true);
    const projected = projectEquippedSkill('whirlwind',
      WARRIOR_ABILITIES.whirlwind.radius!,ranks,edited.equipment);
    expect(projected.pullDistance).toBeGreaterThan(0);
    sim.command({type:'warriorAbility',id:'whirlwind'});
    for(let i=0;i<52;i++) sim.advance(16.667);
    const after = sim.snapshot();
    const cue=sim.drainEvents().find(e=>e.type==='warriorImpact'&&e.id==='whirlwind');
    expect(cue).toMatchObject({
      type:'warriorImpact', id:'whirlwind', radius:projected.radius
    });
    expect(after.statusEffects?.enemies[target.id]?.some(e=>e.id==='bleeding')).toBe(true);
    expect(after.enemies[0]!.actor.health).toBeLessThan(target.health);
    expect(Math.hypot(after.enemies[0]!.actor.x-near.x,after.enemies[0]!.actor.y-near.y))
      .toBeLessThan(Math.hypot(target.x-near.x,target.y-near.y));
    const record=createSaveRecord(sim.character())!;
    expect(readSaveRecord(record)?.talentRanks).toEqual(ranks);
    expect(sim.character()).not.toHaveProperty('skillModifiers');
  });

  it('does not invent effects for other classes without equipped or learned modifiers',()=>{
    const sim=new GameSimulation(0);
    const snap=sim.snapshot();
    sim.command({type:'reset',classId:'MAGE',seed:0});
    const mage=sim.snapshot();
    expect(projectEquippedSkill('fireball',66,mage.talentRanks??{},mage.equipment))
      .toMatchObject({radius:66,projectileCount:1,modifierIds:[]});
    expect(sim.restore(snap)).toBe(true);
  });
});
