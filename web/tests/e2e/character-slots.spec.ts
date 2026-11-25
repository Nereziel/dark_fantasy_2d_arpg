import { openCharacterCreation, loadCharacterControl } from './character-menu';
// Issue #100 / Prompt 45 — browser-managed character slots. GPL-3.0-only.
import { test, expect } from '@playwright/test';

async function createHero(page: import('@playwright/test').Page, classId: string) {
  await openCharacterCreation(page, classId === 'WARRIOR' ? 'Warrior' : 'Mage');
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
  await page.goto('./?view=iso');
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
  await loadCharacterControl(page).click();
  await expect(page.locator('.hud-details')).toContainText('Warrior · Level 1');
  await expect(page.locator('.game-screen')).toHaveAttribute('data-world-seed', warriorSeed!);

  await page.reload();
  await expect(page.locator('.saved-character-row')).toHaveCount(2);
  await page.locator('.saved-character-row').filter({ hasText: 'Mage' }).locator('.saved-select').click();
  await loadCharacterControl(page).click();
  await expect(page.locator('.hud-details')).toContainText('Mage · Level 1');
});

test('two-step deletion removes only its own saved character and world record', async ({ page }) => {
  await page.goto('./?view=iso');
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
  await loadCharacterControl(page).click();
  await expect(page.locator('.hud-details')).toContainText('Warrior · Level 1');
});

test('legacy single-slot hero and its world are preserved when a new hero is created', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await createHero(page, 'WARRIOR');
  await expect.poll(async () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('aether-ruin-web', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction('saves', 'readonly');
      const a = tx.objectStore('saves').get('first-character');
      const w = tx.objectStore('saves').get('world:first-character');
      tx.oncomplete = () => { db.close(); resolve(a.result && w.result ? a.result.characterId : null); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  })).toMatch(/^char-[0-9a-f]{32}$/);
  // Collapse the database to the old first-character/world:first-character layout.
  const id = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('aether-ruin-web', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise<string>((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const alias = store.get('first-character');
      let result = '';
      alias.onsuccess = () => {
        result = alias.result.characterId;
        store.delete('character:' + result);
        store.delete('world:character:' + result);
      };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  });
  expect(id).toMatch(/^char-[0-9a-f]{32}$/);
  await page.getByRole('button', { name: 'Main menu' }).click();
  await expect(page.locator('.saved-character-row')).toHaveCount(1);
  await createHero(page, 'MAGE');
  await page.getByRole('button', { name: 'Main menu' }).click();
  await expect(page.locator('.saved-character-row')).toHaveCount(2);
  const savedWorld = await page.evaluate(async characterId => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('aether-ruin-web', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction('saves', 'readonly');
      const c = tx.objectStore('saves').get('character:' + characterId);
      const w = tx.objectStore('saves').get('world:character:' + characterId);
      tx.oncomplete = () => { db.close(); resolve(c.result?.characterId === characterId
        && w.result?.characterId === characterId); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }, id);
  expect(savedWorld).toBe(true);
});
