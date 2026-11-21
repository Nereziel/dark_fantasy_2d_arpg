// Issue #100 / Prompt 45 — browser-managed character slots. GPL-3.0-only.
import { test, expect } from '@playwright/test';

async function createHero(page: import('@playwright/test').Page, classId: string) {
  await page.locator('[data-class-id="' + classId + '"]').click();
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await expect(page.locator('.hud-details')).toContainText(classId === 'WARRIOR' ? 'Warrior' : 'Mage');
  await expect.poll(async () => page.evaluate(async () => {
    const request = indexedDB.open('aether-ruin-web', 1);
    return new Promise<number>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('saves', 'readonly');
        const keys = tx.objectStore('saves').getAllKeys();
        tx.oncomplete = () => { db.close(); resolve(keys.result.filter(k => String(k).startsWith('character:')).length); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  })).toBeGreaterThan(0);
}

test('two different heroes retain separate slots and character/world identity after reload', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await createHero(page, 'WARRIOR');
  const warriorSeed = await page.locator('.game-screen').getAttribute('data-world-seed');
  await page.getByRole('button', { name: 'Main menu' }).click();
  await expect(page.locator('.saved-character-row')).toHaveCount(1);

  await createHero(page, 'MAGE');
  await page.getByRole('button', { name: 'Main menu' }).click();
  await expect(page.locator('.saved-character-row')).toHaveCount(2);
  const warrior = page.locator('.saved-character-row').filter({ hasText: 'Warrior' });
  await warrior.locator('.saved-select').click();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.hud-details')).toContainText('Warrior · Level 1');
  await expect(page.locator('.game-screen')).toHaveAttribute('data-world-seed', warriorSeed!);

  await page.reload();
  await expect(page.locator('.saved-character-row')).toHaveCount(2);
  await page.locator('.saved-character-row').filter({ hasText: 'Mage' }).locator('.saved-select').click();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.hud-details')).toContainText('Mage · Level 1');
});

test('two-step deletion removes only its own saved character and world record', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await createHero(page, 'WARRIOR');
  await page.getByRole('button', { name: 'Main menu' }).click();
  await createHero(page, 'MAGE');
  await page.getByRole('button', { name: 'Main menu' }).click();
  const mage = page.locator('.saved-character-row').filter({ hasText: 'Mage' });
  await mage.getByRole('button', { name: 'Delete: Mage' }).click();
  await expect(mage.getByRole('button', { name: 'Delete permanently?' })).toBeVisible();
  await mage.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.saved-character-row')).toHaveCount(2);
  await mage.getByRole('button', { name: 'Delete: Mage' }).click();
  await mage.getByRole('button', { name: 'Delete permanently?' }).click();
  await expect(page.locator('.saved-character-row')).toHaveCount(1);
  await expect(page.locator('.saved-character-row').first()).toContainText('Warrior');
  await page.reload();
  await expect(page.locator('.saved-character-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.hud-details')).toContainText('Warrior · Level 1');
});
