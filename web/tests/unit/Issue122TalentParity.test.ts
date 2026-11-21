// Issue #122: all six classes have simulation-owned, save-compatible talents.
// GPL-3.0-only.
import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import {
  allTalentsForClass, canSpendTalent, getTalent, planRespecTalents,
  planSpendTalent, projectTalentBonuses, validateTalentBuild
} from '../../src/game/progression/talentTree';

const classes = ['NECROMANCER', 'ROGUE', 'WARLOCK'] as const;
const branches: Record<(typeof classes)[number], string[]> = {
  NECROMANCER: ['bone', 'summoning', 'blood'],
  ROGUE: ['assassin', 'shadow', 'trapper'],
  WARLOCK: ['demonology', 'corruption', 'soul']
};

describe('Issue #122 — class talent parity', () => {
  it.each(classes)('%s has 9 gameplay-affecting nodes across three real branches', klass => {
    const nodes = allTalentsForClass(klass);
    expect(nodes).toHaveLength(9);
    expect([...new Set(nodes.map(node => node.branch))]).toEqual(branches[klass]);
    expect(nodes.every(node => node.classId === klass)).toBe(true);
    expect(nodes.every(node => node.effects.length > 0 && node.maxRank >= 2)).toBe(true);
    expect(nodes.every(node => node.prerequisites.every(p => nodes.some(n => n.id === p.id)))).toBe(true);
    expect(new Set(nodes.map(node => node.id)).size).toBe(9);
  });

  it.each(classes)('%s cannot forge cross-class ranks or skip tier prerequisites', klass => {
    const nodes = allTalentsForClass(klass);
    const root = nodes[0]!, middle = nodes[1]!, capstone = nodes[2]!;
    expect(canSpendTalent(klass, 15, 3, {}, middle.id)).toMatchObject({ ok: false, reason: 'missingPrerequisite' });
    expect(canSpendTalent(klass, 15, 3, {}, capstone.id)).toMatchObject({ ok: false, reason: 'missingPrerequisite' });
    const first = planSpendTalent(klass, 15, 3, {}, root.id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = planSpendTalent(klass, 15, first.unspent, first.ranks, middle.id);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const third = planSpendTalent(klass, 15, second.unspent, second.ranks, capstone.id);
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(validateTalentBuild(klass, 15, 0, third.ranks)).toBe(true);
    expect(validateTalentBuild(klass, 15, 0, { ...third.ranks, 'berserker.battleFury': 1 })).toBe(false);
    expect(validateTalentBuild('WARRIOR', 15, 0, third.ranks)).toBe(false);
    expect(projectTalentBonuses(third.ranks)).not.toEqual(projectTalentBonuses({}));
    expect(planRespecTalents(klass, 15, 0, third.ranks, 2000)).toMatchObject({
      ok: true, unspent: 3, ranks: {}
    });
  });

  it.each(classes)('%s saves, restores and rejects a cross-class corrupted build', klass => {
    const sim = new GameSimulation(611);
    sim.command({ type: 'reset', classId: klass, seed: 611 });
    const progress = sim.character();
    const withPoints = { ...progress, level: 15, xp: 0, talentPoints: 3, gold: 2000 };
    expect(sim.restoreCharacter(withPoints, 611)).toBe(true);
    const nodes = allTalentsForClass(klass);
    const before = sim.snapshot().stats;
    sim.command({ type: 'spendTalent', id: nodes[0]!.id });
    sim.command({ type: 'spendTalent', id: nodes[1]!.id });
    sim.command({ type: 'spendTalent', id: nodes[2]!.id });
    const saved = sim.character();
    expect(saved.talentRanks).toMatchObject(Object.fromEntries(nodes.slice(0, 3).map(n => [n.id, 1])));
    expect(sim.snapshot().talentPoints).toBe(0);
    const loaded = new GameSimulation(999);
    expect(loaded.restoreCharacter(saved, 72)).toBe(true);
    expect(loaded.character().talentRanks).toEqual(saved.talentRanks);
    expect(loaded.snapshot().worldSeed).toBe(72);
    const forged = { ...saved, classId: 'WARRIOR' as const };
    expect(new GameSimulation(611).restoreCharacter(forged, 74)).toBe(false);
    expect(sim.snapshot().stats.maxHealth).toBeGreaterThan(0);
    expect(before.maxHealth).toBeGreaterThan(0);
    sim.command({ type: 'respecTalents' });
    expect(sim.character().talentRanks ?? {}).toEqual({});
    expect(sim.snapshot().talentPoints).toBe(3);
    expect(loaded.snapshot().stats.maxHealth).toBeGreaterThan(0);
  });

  it('rejects invalid rank data and exposes exact lookup keys', () => {
    expect(validateTalentBuild('WARLOCK', 100, 0, { 'warlock.soulFeast': 99 })).toBe(false);
    expect(getTalent('warlock.soulFeast')?.classId).toBe('WARLOCK');
    expect(getTalent('__proto__')).toBeNull();
    expect(canSpendTalent('ROGUE', 10, 1, {}, 'necro.boneSpear')).toMatchObject({
      ok: false, reason: 'unknownTalent'
    });
  });
});
