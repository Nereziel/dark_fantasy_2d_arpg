import { describe, expect, it } from 'vitest';
import cs from '../../src/i18n/locales/cs.json';
import en from '../../src/i18n/locales/en.json';
import { ITEM_BASES, ITEM_RARITIES } from '../../src/game/items/itemCatalog';
import { AFFIX_PREFIXES, AFFIX_SUFFIXES } from '../../src/game/items/affixGeneration';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { rollItemForBase, SeededRng } from '../../src/game/data/items';

describe('Wave C bilingual names and immutable loot instances', () => {
  it('provides every catalog base, affix and rarity key in Czech and English', () => {
    for (const [language, translations] of [['cs', cs], ['en', en]] as const) {
      for (const id of Object.keys(ITEM_BASES)) {
        expect(translations.item.base, language + ':base:' + id)
          .toHaveProperty(id);
        expect((translations.item.base as Record<string,string>)[id]?.trim().length)
          .toBeGreaterThan(0);
      }
      for (const rarity of Object.keys(ITEM_RARITIES)) {
        expect((translations.item.rarity as Record<string,string>)[rarity],language + ':rarity:' + rarity)
          .toBeTruthy();
      }
      for (const affix of [...AFFIX_PREFIXES, ...AFFIX_SUFFIXES]) {
        expect((translations.item.affix as Record<string,string>)[affix.id],language + ':affix:' + affix.id)
          .toBeTruthy();
      }
      for (const slot of ['RELIC','CHARM','MAIN_HAND','OFF_HAND']) {
        expect((translations.item.slot as Record<string,string>)[slot]).toBeTruthy();
      }
      expect(translations.inventory.offHandEquip).toBeTruthy();
      expect(translations.inventory.legendaryPower).toBeTruthy();
    }
  });

  it('changes only text, never affix generation or instance IDs', () => {
    const sim = new GameSimulation(919);
    const item = rollItemForBase('greatsword', 'localization-stable-item', 72,
      'LEGENDARY', new SeededRng(919))!;
    const hero = sim.character();
    const updated = { ...hero, level: 72, xp: 0, skillPoints: 71, talentPoints: 14,
      inventory: hero.inventory.map((entry, i) => i === 0 ? item : entry) };
    expect(sim.restoreCharacter(updated)).toBe(true);
    const before = sim.character();
    for (const labels of [cs, en, cs, en]) {
      expect((labels.item.base as Record<string,string>)[item.templateId]).toBeTruthy();
      for (const affix of item.affixes) {
        expect((labels.item.affix as Record<string,string>)[affix.id]).toBeTruthy();
      }
      expect(sim.character()).toEqual(before);
    }
    expect(sim.character().inventory[0]?.affixes).toEqual(item.affixes);
  });
});
