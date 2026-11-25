import { openCharacterCreation, enterWorld, continueGame, saveFromMenu } from './character-menu';
import { test, expect } from '@playwright/test';

/** Real UI projection from validated, character-only v11 data, not a debug API. */
test('Whirlwind shows modifier radius and pull from learned Warrior talents', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  await saveFromMenu(page);
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await page.reload(); // The live session/autosaver must not overwrite the fixture.

  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('aether-ruin-web', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('saves', 'readwrite');
        const get = tx.objectStore('saves').get('first-character');
        get.onerror = () => reject(get.error);
        get.onsuccess = () => {
          const record = get.result as { format: number; character: {
            level: number; xp: number; skillPoints: number; talentPoints: number;
            talentRanks?: Record<string, number>;
          }};
          if (record?.format !== 11) {
            reject(new Error('Expected saved v11 Warrior'));
            return;
          }
          Object.assign(record.character, {
            level: 10, xp: 0, skillPoints: 9, talentPoints: 0,
            talentRanks: { 'warlord.commandingCry': 1, 'warlord.shockwave': 1 }
          });
          tx.objectStore('saves').put(record, 'first-character');
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
  });

  await continueGame(page);
  const whirlwind = page.getByRole('button', { name: 'Whirlwind' });
  await expect(whirlwind).toBeVisible();
  await expect(whirlwind.getByTestId('modified-whirlwind')).toContainText('Enhanced');
  await expect(whirlwind).toHaveAttribute('title', /Radius: 136.*Pull: 36/);
  await whirlwind.click();
  await expect(whirlwind).toBeDisabled();
});
