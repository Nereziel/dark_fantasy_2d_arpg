import { describe, expect, it } from 'vitest';
import { itemBaseProperties } from '../../src/game/items/itemPresentation';

describe('inventory item base property presentation', () => {
  it('shows weapon damage without zero defense', () => {
    expect(itemBaseProperties({ minDmg: 10, maxDmg: 18, armor: 0, block: 0 }))
      .toEqual([{ key: 'damage', value: '10–18' }]);
  });
  it('shows armor and shield block without zero attack', () => {
    expect(itemBaseProperties({ minDmg: 0, maxDmg: 0, armor: 28, block: 0 }))
      .toEqual([{ key: 'armor', value: '28' }]);
    expect(itemBaseProperties({ minDmg: 0, maxDmg: 0, armor: 14, block: 12 }))
      .toEqual([{ key: 'armor', value: '14' }, { key: 'block', value: '12%' }]);
  });
  it('keeps accessories empty and preserves actual hybrid properties', () => {
    expect(itemBaseProperties({ minDmg: 0, maxDmg: 0, armor: 0, block: 0 })).toEqual([]);
    expect(itemBaseProperties({ minDmg: 0, maxDmg: 5, armor: 2, block: 0 }))
      .toEqual([{ key: 'damage', value: '0–5' }, { key: 'armor', value: '2' }]);
  });
});
