import { test, expect } from '@playwright/test';

test('Q uses an authoritative combat potion, saves charges and refills at the apothecary', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();

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
  await page.getByRole('button', { name: 'Load', exact: true }).click();
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
  await page.reload();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('[data-potion-id="resistance"]')).toContainText('1');
});
