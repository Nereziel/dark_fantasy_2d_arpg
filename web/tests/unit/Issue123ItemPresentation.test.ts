// Issue #123 — all inventory templates have distinct and reliable rendered artwork.
// GPL-3.0-only.
import { describe, expect, it } from 'vitest';
import { ITEM_TEMPLATES, rollItemForBase, SeededRng } from '../../src/game/data/items';
import { ITEM_BASES } from '../../src/game/items/itemCatalog';
import { itemArtKind } from '../../src/game/items/itemArt';
import {
  DEFAULT_GROUND_LOOT_FILTER, filterVisibleGroundLoot,
  normalizeGroundLootFilter
} from '../../src/game/items/groundLootVisibility';

describe('Issue 123: deterministic item artwork', () => {
  it('maps every real template to a non-empty and stable icon identity', () => {
    const kinds = new Set<string>();
    for (const base of ITEM_TEMPLATES) {
      const art = itemArtKind(base.id);
      expect(art).not.toBe('missing');
      expect(art).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
      expect(itemArtKind(base.id)).toBe(art);
      kinds.add(art);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(17);
    expect(Object.keys(ITEM_BASES).length).toBe(ITEM_TEMPLATES.length);
    expect(itemArtKind('__proto__')).toBe('missing');
    expect(itemArtKind('')).toBe('missing');
  });
});

describe('Issue 123: presentation-only loot filters', () => {
  it('never mutates original drops, their item IDs, rarity, seed, or order', () => {
    const rng = new SeededRng(42);
    const sword = rollItemForBase('broadsword','sword-1',1,'COMMON',rng)!;
    const helm = rollItemForBase('helm','helm-1',1,'RARE',rng)!;
    const charm = rollItemForBase('charm','charm-1',10,'LEGENDARY',rng)!;
    const drops = [
      {id:'ground-1',x:10,y:20,item:sword},
      {id:'ground-2',x:20,y:25,item:helm},
      {id:'ground-3',x:30,y:30,item:charm}
    ];
    const json = JSON.stringify(drops);
    const stateBefore = rng.state;
    const filtered = filterVisibleGroundLoot(drops, {}, {
      minRarity:'RARE', category:'armor', alwaysShowFavorites:true
    });
    expect(filtered.map(x=>x.id)).toEqual(['ground-2']);
    expect(JSON.stringify(drops)).toBe(json);
    expect(rng.state).toBe(stateBefore);
    expect(filterVisibleGroundLoot(drops, {}, DEFAULT_GROUND_LOOT_FILTER)).toEqual(drops);
    expect(filterVisibleGroundLoot(drops, {'sword-1':{favorite:true,locked:false}}, {
      minRarity:'RARE', category:'armor', alwaysShowFavorites:true
    }).map(x=>x.id)).toEqual(['ground-1','ground-2']);
  });
  it('sanitizes arbitrary saved preferences without trusting object prototypes', () => {
    expect(normalizeGroundLootFilter({minRarity:'MYTHIC',category:'weapons',alwaysShowFavorites:false}))
      .toEqual({minRarity:'MYTHIC',category:'weapons',alwaysShowFavorites:false});
    expect(normalizeGroundLootFilter({minRarity:'invalid',category:'hack',alwaysShowFavorites:1}))
      .toEqual(DEFAULT_GROUND_LOOT_FILTER);
    expect(normalizeGroundLootFilter(null)).toEqual(DEFAULT_GROUND_LOOT_FILTER);
    expect(normalizeGroundLootFilter(JSON.parse('{"__proto__":{},"minRarity":"RARE"}')))
      .toEqual(DEFAULT_GROUND_LOOT_FILTER);
  });
});
