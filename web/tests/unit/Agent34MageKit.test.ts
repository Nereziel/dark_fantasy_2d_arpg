// GPL-3.0-only — Prompt 40, Agent 34. RED first: Mage pure class contract.
import { describe, expect, it } from 'vitest';
import { CLASSES } from '../../src/game/data/classes';
import { SKILLS } from '../../src/game/skills/skills';
import {
  MAGE_EXTRA_IDS, MAGE_EXTRA_SPELLS, MAGE_TALENT_TREE, MAGE_AFFIX_TAGS,
  getMageSpell, validMageCooldowns, planMageCast, advanceMageCooldowns
} from '../../src/game/skills/mageKit';

const at = { x: 200, y: 200 };
const bounds = { width: 2200, height: 1400 };
const context = (overrides: Record<string, unknown> = {}) => ({
  mana: 120, cooldowns: {}, origin: at, cursor: { x: 350, y: 200 },
  targetId: 'bandit-1', targetPosition: { x: 350, y: 200 },
  targetAlive: true, destinationWalkable: true, bounds, ...overrides
});

describe('Prompt 40 — isolated Mage kit', () => {
  it('retains the two original Mage slots and adds exactly five unique spells', () => {
    expect(CLASSES.MAGE.resourceId).toBe('mana');
    expect(SKILLS.MAGE.rmb.id).toBe('fireball');
    expect(SKILLS.MAGE.slot1.id).toBe('frostNova');
    expect(MAGE_EXTRA_IDS).toEqual([
      'chainLightning', 'meteor', 'teleport', 'arcaneBarrier', 'blizzard'
    ]);
    expect(new Set([SKILLS.MAGE.rmb.id, SKILLS.MAGE.slot1.id, ...MAGE_EXTRA_IDS]).size).toBe(7);
    expect(new Set(MAGE_EXTRA_IDS.map(id => MAGE_EXTRA_SPELLS[id].element)))
      .toEqual(new Set(['lightning', 'fire', 'arcane', 'frost']));
    for (const id of MAGE_EXTRA_IDS) {
      const spell = getMageSpell(id)!;
      expect(spell).toBe(MAGE_EXTRA_SPELLS[id]);
      expect(spell.cost).toBeGreaterThan(0);
      expect(spell.cooldown).toBeGreaterThan(0);
      expect(spell.range).toBeGreaterThanOrEqual(0);
      expect(Object.isFrozen(spell)).toBe(true);
    }
    for (const id of ['__proto__', 'constructor', 'toString', 'warCry', 0, null, ''])
      expect(getMageSpell(id)).toBeNull();
  });

  it('validates cooldowns strictly and refuses prototypes, invalid time or forged keys', () => {
    expect(validMageCooldowns({})).toBe(true);
    expect(validMageCooldowns({ meteor: 8, blizzard: 0 })).toBe(true);
    for (const invalid of [
      { meteor: -0.1 }, { blizzard: Infinity }, { teleport: NaN },
      { chainLightning: 999 }, { warCry: 2 }, [],
      JSON.parse('{"__proto__":2}'), null, 1
    ]) expect(validMageCooldowns(invalid)).toBe(false);
    expect(advanceMageCooldowns({ meteor: 3, blizzard: 1 }, 0.5))
      .toEqual({ meteor: 2.5, blizzard: 0.5 });
    expect(advanceMageCooldowns({ meteor: 3 }, 8)).toEqual({ meteor: 0 });
    expect(advanceMageCooldowns({ meteor: 3 }, -1)).toBeNull();
    expect(advanceMageCooldowns({ meteor: Infinity } as never, 1)).toBeNull();
  });

  it('commits immutable chain-lightning entity aim with authoritative Mana and cooldown plan', () => {
    const source = context();
    const result = planMageCast('chainLightning', source);
    expect(result).toMatchObject({
      ok: true, spell: { id: 'chainLightning', element: 'lightning' },
      manaAfter: 120 - MAGE_EXTRA_SPELLS.chainLightning.cost,
      aim: { mode: 'TARGET_ENTITY', targetId: 'bandit-1' }
    });
    if (!result.ok) return;
    expect(result.cooldowns.chainLightning).toBe(MAGE_EXTRA_SPELLS.chainLightning.cooldown);
    expect(source.cooldowns).toEqual({});
    expect(planMageCast('chainLightning', context({ cooldowns: result.cooldowns })))
      .toEqual({ ok: false, reason: 'cooldown' });
    expect(planMageCast('chainLightning', context({ mana: 0 })))
      .toEqual({ ok: false, reason: 'mana' });
    expect(planMageCast('chainLightning', context({ targetAlive: false })))
      .toEqual({ ok: false, reason: 'target' });
    expect(planMageCast('chainLightning', context({ targetId: '__none__', targetPosition: null })))
      .toEqual({ ok: false, reason: 'target' });
    expect(planMageCast('chainLightning', context({ targetPosition: { x: 2100, y: 200 } })))
      .toEqual({ ok: false, reason: 'range' });
  });

  it('uses exact cursor ground positions for Meteor and Blizzard, with world and range gates', () => {
    for (const id of ['meteor', 'blizzard'] as const) {
      const p = { x: 340, y: 276 };
      const result = planMageCast(id, context({ cursor: p }));
      expect(result).toMatchObject({ ok: true, aim: { mode: 'GROUND_POSITION', position: p } });
      if (!result.ok) continue;
      p.x = 999;
      expect(result.aim).toMatchObject({ mode: 'GROUND_POSITION', position: { x: 340, y: 276 } });
      expect(planMageCast(id, context({ cursor: null }))).toEqual({ ok: false, reason: 'aim' });
      expect(planMageCast(id, context({ cursor: { x: 2201, y: 200 } })))
        .toEqual({ ok: false, reason: 'aim' });
      expect(planMageCast(id, context({ cursor: { x: 1900, y: 200 } })))
        .toEqual({ ok: false, reason: 'range' });
    }
    expect(MAGE_EXTRA_SPELLS.meteor.status).toBe('burning');
    expect(MAGE_EXTRA_SPELLS.blizzard.status).toBe('chilled');
    expect(MAGE_EXTRA_SPELLS.blizzard.tickInterval).toBeGreaterThan(0);
  });

  it('requires an actual collision-safe destination for Teleport', () => {
    expect(planMageCast('teleport', context({ cursor: { x: 360, y: 200 } })))
      .toMatchObject({ ok: true, aim: { mode: 'GROUND_POSITION', position: { x: 360, y: 200 } } });
    expect(planMageCast('teleport', context({ destinationWalkable: false })))
      .toEqual({ ok: false, reason: 'blocked' });
    expect(planMageCast('teleport', context({ destinationWalkable: undefined })))
      .toEqual({ ok: false, reason: 'blocked' });
    expect(planMageCast('teleport', context({ cursor: { x: 1100, y: 200 } })))
      .toEqual({ ok: false, reason: 'range' });
    expect(planMageCast('teleport', context({ cursor: { x: Infinity, y: 200 } })))
      .toEqual({ ok: false, reason: 'aim' });
  });

  it('uses SELF aim for Arcane Barrier without requiring an enemy or cursor', () => {
    const result = planMageCast('arcaneBarrier', context({
      cursor: null, targetAlive: false, targetId: null, targetPosition: null
    }));
    expect(result).toMatchObject({ ok: true, aim: { mode: 'SELF' } });
    expect(MAGE_EXTRA_SPELLS.arcaneBarrier.shieldRatio).toBeGreaterThan(0);
    expect(MAGE_EXTRA_SPELLS.arcaneBarrier.duration).toBeGreaterThan(0);
  });

  it('fails closed on malformed values without mutating the incoming context', () => {
    for (const id of ['__proto__', 'warCry', '', null])
      expect(planMageCast(id, context())).toEqual({ ok: false, reason: 'invalid' });
    for (const overrides of [
      { mana: NaN }, { mana: -1 }, { mana: Infinity }, { mana: 10001 },
      { cooldowns: { blizzard: -1 } }, { origin: { x: NaN, y: 200 } },
      { bounds: { width: Infinity, height: 1400 } }, { bounds: null }
    ]) expect(planMageCast('meteor', context(overrides))).toEqual({ ok: false, reason: 'invalid' });
    expect(planMageCast('meteor', null)).toEqual({ ok: false, reason: 'invalid' });
    expect(planMageCast('meteor', context({ mana: 1 }))).toEqual({ ok: false, reason: 'mana' });
  });

  it('ships four complete Mage talent schools with valid acyclic prerequisites and item tags', () => {
    expect(new Set(MAGE_TALENT_TREE.map(t => t.school)))
      .toEqual(new Set(['fire', 'frost', 'lightning', 'arcane']));
    expect(MAGE_TALENT_TREE).toHaveLength(12);
    expect(new Set(MAGE_TALENT_TREE.map(t => t.id)).size).toBe(12);
    const seen = new Set<string>();
    for (const t of MAGE_TALENT_TREE) {
      expect(t.maxRank).toBeGreaterThan(0);
      expect(t.minLevel).toBeGreaterThanOrEqual(5);
      expect(t.effects.length).toBeGreaterThan(0);
      for (const prereq of t.requires) expect(seen.has(prereq)).toBe(true);
      seen.add(t.id);
    }
    expect(MAGE_AFFIX_TAGS).toEqual(['mage.fire', 'mage.frost', 'mage.lightning', 'mage.arcane']);
  });
});
