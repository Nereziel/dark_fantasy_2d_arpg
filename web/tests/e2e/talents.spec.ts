import { openCharacterCreation, loadCharacterControl } from './character-menu';
import { test, expect } from '@playwright/test';

/**
 * Play a real Svelte talent dialog, while using a valid level-10 character
 * fixture to avoid requiring hours of enemy grinding in every browser CI run.
 * The fixture uses the public v11 IndexedDB record, never a debug simulation API.
 */
test('spends, saves, reloads and refunds Warrior talent ranks through the UI', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Hero saved');
  // Stop the running session/autosaver before modifying the v11 test fixture.
  await page.reload();

  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('aether-ruin-web', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('saves', 'readwrite');
        const store = tx.objectStore('saves');
        const read = store.get('first-character');
        read.onsuccess = () => {
          const record = read.result as {
            format: number;
            character: { level: number; xp: number; skillPoints: number;
              talentPoints: number; gold: number; };
          };
          if (!record || record.format !== 11) {
            reject(new Error('Missing v11 character for talent fixture'));
            return;
          }
          record.character.level = 10;
          record.character.xp = 0;
          record.character.skillPoints = 9;
          record.character.talentPoints = 2;
          record.character.gold = 1000;
          store.put(record, 'first-character');
        };
        read.onerror = () => reject(read.error);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
  });

  await loadCharacterControl(page).click();
  await expect(page.getByText('Warrior · Level 10')).toBeVisible();
  await page.getByRole('button', { name: /Talents/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Warrior Talent Tree' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Unspent talent points: 2');

  const fury = dialog.locator('[data-talent-id="berserker.battleFury"]');
  const bloodlust = dialog.locator('[data-talent-id="berserker.bloodlust"]');
  await expect(bloodlust.getByRole('button')).toBeDisabled();
  await fury.getByRole('button', { name: 'Invest in Battle Fury' }).click();
  await expect(fury.locator('.ranks')).toHaveText('1/3');
  await expect(bloodlust.getByRole('button')).toBeEnabled();
  await bloodlust.getByRole('button').click();
  await expect(bloodlust.locator('.ranks')).toHaveText('1/3');
  await expect(dialog).toContainText('Unspent talent points: 0');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await page.reload();
  await loadCharacterControl(page).click();
  await page.getByRole('button', { name: 'Talents' }).click();
  const reloaded = page.getByRole('dialog', { name: 'Warrior Talent Tree' });
  await expect(reloaded.locator('[data-talent-id="berserker.battleFury"] .ranks')).toHaveText('1/3');
  await expect(reloaded.locator('[data-talent-id="berserker.bloodlust"] .ranks')).toHaveText('1/3');
  await reloaded.getByRole('button', { name: 'Respec talents' }).click();
  await expect(reloaded).toContainText('Unspent talent points: 2');
  await expect(reloaded.locator('[data-talent-id="berserker.battleFury"] .ranks')).toHaveText('0/3');
  await expect(reloaded.getByRole('button', { name: 'Respec talents' })).toBeDisabled();
});
