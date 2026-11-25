import { openCharacterCreation, loadCharacterControl } from './character-menu';
// Issue #122: new class talents are playable, localized and persistent.
// GPL-3.0-only.
import { test, expect, type Page } from '@playwright/test';

type ClassUnderTest = 'NECROMANCER' | 'ROGUE' | 'WARLOCK';
const examples: readonly {
  id: ClassUnderTest;
  title: string;
  nodes: readonly [string, string, string];
}[] = [
  { id: 'NECROMANCER', title: 'Necromancer Talent Tree',
    nodes: ['necro.boneSpear', 'necro.boneFracture', 'necro.corpseMastery'] },
  { id: 'ROGUE', title: 'Rogue Talent Tree',
    nodes: ['rogue.precision', 'rogue.execution', 'rogue.hemorrhage'] },
  { id: 'WARLOCK', title: 'Warlock Talent Tree',
    nodes: ['warlock.abyssalPower', 'warlock.demonBlood', 'warlock.soulPact'] }
];

async function grantThreeTalentPoints(page: Page): Promise<void> {
  // Public v11 persistence fixture; no hidden debug simulation bypasses the UI.
  await page.evaluate(async () => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('aether-ruin-web', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const read = store.get('first-character');
      read.onsuccess = () => {
        const record = read.result;
        if (!record || record.format !== 11) {
          reject(new Error('Missing v11 character fixture')); return;
        }
        record.character.level = 15;
        record.character.xp = 0;
        record.character.skillPoints = 14;
        record.character.talentPoints = 3;
        record.character.gold = 2000;
        store.put(record, 'first-character');
      };
      read.onerror = () => reject(read.error);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
}

for (const { id, title, nodes } of examples) {
  test(`${id} can invest, persist, respec and localize three linked talents`, async ({ page }) => {
    await page.goto('./?view=iso');
    await page.locator('#menu-language').selectOption('en');
    await openCharacterCreation(page);
    await page.getByRole('button', { name: new RegExp(id === 'NECROMANCER' ? 'Necromancer' :
      id === 'WARLOCK' ? 'Warlock' : 'Rogue') }).click();
    await page.getByRole('button', { name: 'Enter the world' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Hero saved');
    await page.reload();
    await grantThreeTalentPoints(page);
    await loadCharacterControl(page).click();
    await page.getByRole('button', { name: /Talents/ }).click();
    const dialog = page.getByRole('dialog', { name: title });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-talent-id]')).toHaveCount(9);
    for (let i = 0; i < nodes.length; i++) {
      const card = dialog.locator(`[data-talent-id="${nodes[i]}"]`);
      if (i > 0) await expect(card.getByRole('button')).toBeEnabled();
      await card.getByRole('button').click();
      await expect(card.locator('.ranks')).toHaveText('1/3');
      await expect(card.getByTestId(`talent-preview-${nodes[i]}`)).toContainText('1/3');
    }
    await expect(dialog).toContainText('Unspent talent points: 0');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Hero saved');
    await page.reload();
    await loadCharacterControl(page).click();
    await page.getByRole('button', { name: 'Talents' }).click();
    const reloaded = page.getByRole('dialog', { name: title });
    for (const talentId of nodes)
      await expect(reloaded.locator(`[data-talent-id="${talentId}"] .ranks`)).toHaveText('1/3');
    // The header is correctly inert while the talent modal owns keyboard focus.
    // Close, change locale with the normal accessible selector, then reopen.
    await page.keyboard.press('Escape');
    await page.locator('#game-language').selectOption('cs');
    await page.getByRole('button', { name: 'Talenty' }).click();
    const localized = page.getByRole('dialog', { name: /Strom talentů/ });
    await expect(localized).toContainText('Aktuální stupeň');
    await localized.getByRole('button', { name: 'Přerozdělit talenty' }).click();
    await expect(localized).toContainText('Volné talentové body: 3');
    for (const talentId of nodes)
      await expect(localized.locator(`[data-talent-id="${talentId}"] .ranks`)).toHaveText('0/3');
  });
}
