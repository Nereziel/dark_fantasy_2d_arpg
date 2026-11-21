// Issue #128: mobile combat threat hierarchy must not mutate authoritative roster.
// GPL-3.0-only.
import { describe, expect, it } from 'vitest';
import { prioritizeCombatRoster } from '../../src/game/ui/combatRoster';

function unit(id: string, alive = true, elite = false) {
  return Object.freeze({
    actor: Object.freeze({ id, alive }),
    ...(elite ? { elite: Object.freeze({ modifiers: ['fireAura'] }) } : {})
  });
}

describe('Issue 128: boss and elite HUD roster projection', () => {
  it('keeps active bosses, minibosses and elites above regular enemies on mobile', () => {
    const units = Object.freeze([
      unit('normal-1'), unit('dead-1', false), unit('normal-2'),
      unit('elite-1', true, true), unit('crypt_lord-4'),
      unit('morrow_gravebound'), unit('normal-selected'),
      unit('dead-boss', false, true)
    ]);
    const before = JSON.stringify(units);
    const result = prioritizeCombatRoster(units,
      { morrow_gravebound: { bossId: 'morrow_gravebound' } },
      'normal-selected');
    expect(result.map(value => value.actor.id)).toEqual([
      'crypt_lord-4', 'morrow_gravebound', 'elite-1',
      'normal-selected', 'normal-1', 'normal-2', 'dead-1', 'dead-boss'
    ]);
    expect(JSON.stringify(units)).toBe(before);
    expect(result).not.toBe(units);
    expect(result).toEqual(prioritizeCombatRoster(units,
      { morrow_gravebound: { bossId: 'morrow_gravebound' } },
      'normal-selected'));
  });

  it('does not promote stale dead bosses or modify original simulation selection', () => {
    const units = Object.freeze([
      unit('crypt_lord-4', false), unit('normal-1'),
      unit('morrow_gravebound', false), unit('normal-2')
    ]);
    const result = prioritizeCombatRoster(units,
      { morrow_gravebound: { bossId: 'morrow_gravebound' } }, 'normal-2');
    expect(result.map(value => value.actor.id)).toEqual([
      'normal-2', 'normal-1', 'crypt_lord-4', 'morrow_gravebound'
    ]);
    expect(units[0]?.actor.id).toBe('crypt_lord-4');
  });

  it('is deterministic and stable even with 40 actors and missing miniboss metadata', () => {
    const units = Object.freeze(Array.from({ length: 40 }, (_, index) =>
      unit('normal-' + index, true, index === 33)));
    const ordered = prioritizeCombatRoster(units, undefined, 'normal-39');
    expect(ordered).toHaveLength(40);
    expect(ordered[0]?.actor.id).toBe('normal-33');
    expect(ordered[1]?.actor.id).toBe('normal-39');
    expect(ordered.slice(2).map(u => u.actor.id))
      .toEqual(units.filter((u, index) => index !== 33 && index !== 39)
        .map(u => u.actor.id));
    expect(prioritizeCombatRoster([], {}, null)).toEqual([]);
  });
});
