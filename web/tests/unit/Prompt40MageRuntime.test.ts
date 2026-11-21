// GPL-3.0-only — Prompt 40 runtime acceptance checks (draft, requires CI).
import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { CLASSES } from '../../src/game/data/classes';
import { MAGE_EXTRA_SPELLS, planMageCast } from '../../src/game/skills/mageKit';
import {
  allTalentsForClass, planSpendTalent, planRespecTalents,
  projectTalentBonuses, validateTalentBuild
} from '../../src/game/progression/talentTree';
import { validateAffixCombination } from '../../src/game/items/affixGeneration';

function mage(): GameSimulation {
  const sim = new GameSimulation(42);
  sim.command({ type: 'reset', classId: 'MAGE', seed: 42 });
  return sim;
}
function tick(sim: GameSimulation, frames = 40): void {
  for (let i = 0; i < frames; i++) sim.advance(16.667);
}
function nearTarget(sim: GameSimulation) {
  const before = sim.snapshot();
  const target = before.enemies.find(u => u.actor.alive)!;
  expect(sim.restore({
    ...before,
    player: { ...before.player, x: target.actor.x, y: target.actor.y }
  })).toBe(true);
  return target;
}

describe('Prompt 40 — Mage runtime integration', () => {
  it('commits Mana exactly once and applies Arcane Barrier at the class hit frame', () => {
    const sim = mage();
    const before = sim.snapshot();
    expect(before.resource).toBe(CLASSES.MAGE.resourceInitial);
    expect(before.shield).toBe(0);
    sim.command({ type: 'mageAbility', id: 'arcaneBarrier' });
    const committed = sim.snapshot();
    expect(committed.resource).toBe(before.resource - MAGE_EXTRA_SPELLS.arcaneBarrier.cost);
    expect(committed.shield).toBe(0);
    expect(committed.classAction?.mageAbilityId).toBe('arcaneBarrier');
    expect(committed.mageCooldowns?.arcaneBarrier).toBe(MAGE_EXTRA_SPELLS.arcaneBarrier.cooldown);
    sim.command({ type: 'mageAbility', id: 'arcaneBarrier' });
    expect(sim.snapshot().resource).toBe(committed.resource);
    tick(sim, 32);
    expect(sim.snapshot().shield).toBeGreaterThan(0);
  });

  it('uses canonical lightning damage at the shared hit frame, without free recasts', () => {
    const sim = mage();
    const enemy = nearTarget(sim);
    const before = sim.snapshot();
    sim.command({ type: 'mageAbility', id: 'chainLightning', targetId: enemy.actor.id });
    const committed = sim.snapshot();
    expect(committed.resource).toBe(before.resource - MAGE_EXTRA_SPELLS.chainLightning.cost);
    expect(committed.enemies.find(u => u.actor.id === enemy.actor.id)?.actor.health).toBe(enemy.actor.health);
    sim.command({ type: 'mageAbility', id: 'chainLightning', targetId: enemy.actor.id });
    expect(sim.snapshot().resource).toBe(committed.resource);
    tick(sim, 28);
    expect(sim.snapshot().enemies.find(u => u.actor.id === enemy.actor.id)?.actor.health)
      .toBeLessThan(enemy.actor.health);
  });

  it('supports ground-targeted Meteor with one-shot impact and Blizzard with bounded zones', () => {
    const meteor = mage();
    const target = nearTarget(meteor);
    const point = { x: target.actor.x, y: target.actor.y };
    meteor.command({ type: 'mageAbility', id: 'meteor', position: point });
    expect(meteor.snapshot().classAction?.aim).toEqual({ mode: 'GROUND_POSITION', position: point });
    tick(meteor, 90);
    expect(meteor.snapshot().enemies.find(u => u.actor.id === target.actor.id)?.actor.health)
      .toBeLessThan(target.actor.health);
    const blizzard = mage();
    const other = nearTarget(blizzard);
    blizzard.command({ type: 'mageAbility', id: 'blizzard',
      position: { x: other.actor.x, y: other.actor.y } });
    tick(blizzard, 32);
    expect(blizzard.snapshot().mageZones?.length).toBe(1);
    expect(blizzard.snapshot().mageZones?.[0]?.remaining).toBeGreaterThan(0);
  });

  it('rejects blocked or missing teleport aim without spending Mana', () => {
    const sim = mage();
    const before = sim.snapshot();
    sim.command({ type: 'mageAbility', id: 'teleport' });
    expect(sim.snapshot().resource).toBe(before.resource);
    sim.command({ type: 'mageAbility', id: 'teleport',
      position: { x: Infinity, y: 300 } });
    expect(sim.snapshot().resource).toBe(before.resource);
    sim.command({ type: 'mageAbility', id: 'teleport',
      position: { x: 1, y: 1 } });
    expect(sim.snapshot().resource).toBe(before.resource);
    expect(sim.snapshot().player).toEqual(before.player);
  });

  it('allows valid in-flight snapshots, rejects forged Mage spell identities and survives class resets', () => {
    const sim = mage();
    sim.command({ type: 'mageAbility', id: 'arcaneBarrier' });
    const snap = sim.snapshot();
    expect(sim.restore(structuredClone(snap))).toBe(true);
    expect(sim.snapshot()).toEqual(snap);
    const forged = { ...snap, classAction: { ...snap.classAction!, mageAbilityId: '__proto__' } };
    expect(sim.restore(forged as never)).toBe(false);
    expect(sim.snapshot()).toEqual(snap);
    expect(sim.restore({ ...snap, mageCooldowns: { teleport: -1 } })).toBe(false);
    expect(sim.snapshot()).toEqual(snap);
    sim.command({ type: 'reset', classId: 'WARRIOR' });
    const warrior = sim.snapshot();
    expect(warrior.mageCooldowns).toEqual({});
    expect(warrior.mageZones).toEqual([]);
    expect(sim.restore(structuredClone(warrior))).toBe(true);
    const before = sim.snapshot();
    sim.command({ type: 'mageAbility', id: 'arcaneBarrier' });
    expect(sim.snapshot().resource).toBe(before.resource);
  });

  it('does not place Mage runtime zones or cooldowns in character-only persistence', () => {
    const sim = mage();
    sim.command({ type: 'mageAbility', id: 'arcaneBarrier' });
    expect(sim.snapshot().mageCooldowns?.arcaneBarrier).toBeGreaterThan(0);
    const character = sim.character();
    expect('mageCooldowns' in character).toBe(false);
    expect('mageZones' in character).toBe(false);
  });
  it('offers four Mage school talent branches and ranks through shared character progression', () => {
    const nodes = allTalentsForClass('MAGE');
    expect(nodes).toHaveLength(12);
    expect(new Set(nodes.map(n => n.branch))).toEqual(
      new Set(['fire', 'frost', 'lightning', 'arcane']));
    const spent = planSpendTalent('MAGE', 25, 5, {}, 'mage.focus');
    expect(spent.ok).toBe(true);
    if (!spent.ok) return;
    expect(validateTalentBuild('MAGE', 25, spent.unspent, spent.ranks)).toBe(true);
    expect(validateTalentBuild('PALADIN', 25, spent.unspent, spent.ranks)).toBe(false);
    expect(projectTalentBonuses(spent.ranks).manaEfficiency).toBeCloseTo(0.04);
    expect(planRespecTalents('MAGE',25,spent.unspent,spent.ranks,1000).ok).toBe(true);
  });

  it('applies Arcane talent discounts and forbids invalid over-discounted Mana casts', () => {
    const basic = {
      mana: 35, cooldowns: {}, origin: { x: 200, y: 200 },
      cursor: { x: 300, y: 200 }, targetId: null, targetPosition: null,
      targetAlive: false, destinationWalkable: true,
      bounds: { width: 2200, height: 1400 }
    };
    expect(planMageCast('meteor',basic)).toEqual({ok:false,reason:'mana'});
    expect(planMageCast('meteor',{ ...basic, manaDiscount: 0.2 }))
      .toMatchObject({ok:true,manaAfter:3});
    expect(planMageCast('meteor',{ ...basic, manaDiscount: 1 }))
      .toEqual({ok:false,reason:'invalid'});
  });

  it('restricts Mage class affixes to explicitly tagged caster gear', () => {
    const fire = {
      id:'flamebound',stat:'fireDamage',kind:'prefix',tier:1,value:4
    } as const;
    const full = {rarity:'RARE',itemLevel:25,
      tags:['weapon','caster','mage.fire']} as const;
    expect(validateAffixCombination([fire],full)).toBe(true);
    expect(validateAffixCombination([fire],{
      ...full,tags:['weapon','caster']
    })).toBe(false);
    expect(validateAffixCombination([fire],{
      ...full,tags:['weapon','melee','mage.fire']
    })).toBe(false);
  });

});
