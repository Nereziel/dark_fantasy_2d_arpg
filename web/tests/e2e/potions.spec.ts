import { openCharacterCreation, enterWorld, continueGame } from './character-menu';
import { test, expect } from '@playwright/test';

test('Q uses an authoritative combat potion, saves charges and refills at the apothecary', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);

  const resistance = page.locator('[data-potion-id="resistance"]');
  await resistance.click();
  await expect(resistance).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('use-potion')).toContainText('1');
  await page.keyboard.press('q');
  await expect(page.getByTestId('use-potion')).toContainText('0');
  await expect(page.getByTestId('use-potion')).toContainText('s');
  await expect(page.getByTestId('use-potion')).toBeDisabled();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await page.reload();
  await continueGame(page);
  await expect(page.locator('[data-potion-id="resistance"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('use-potion')).toContainText('0');

  await page.getByRole('button', { name: 'Visit apothecary' }).click();
  const vendor = page.getByRole('dialog', { name: 'Apothecary Lena' });
  await expect(vendor).toBeVisible();
  await expect(vendor.locator('[data-potion-refill="resistance"]')).toContainText('0/1');
  await vendor.locator('[data-potion-refill="resistance"]').getByRole('button', { name: /Refill 1/ }).click();
  await expect(vendor.locator('[data-potion-refill="resistance"]')).toContainText('1/1');
  await vendor.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Hero saved');
  // Both the active legacy alias and the canonical character slot must be
  // committed before the browser navigates away.
  const persistedCharges = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('aether-ruin-web', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<[number, number]>((resolve, reject) => {
      const tx = db.transaction('saves', 'readonly');
      const store = tx.objectStore('saves');
      const alias = store.get('first-character');
      let canonical!: IDBRequest<any>;
      alias.onsuccess = () => {
        canonical = store.get('character:' + alias.result.characterId);
      };
      tx.oncomplete = () => {
        db.close();
        resolve([
          alias.result.character.potionCharges?.resistance ?? 1,
          canonical.result.character.potionCharges?.resistance ?? 1
        ]);
      };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  });
  expect(persistedCharges).toEqual([1, 1]);
  await page.reload();
  await continueGame(page);
  await expect(page.locator('[data-potion-id="resistance"]')).toContainText('1');
});
