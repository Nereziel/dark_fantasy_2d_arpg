// Issue #123 stage 2: SVG artwork survives stash transfers and gem/rune UI.
import { test, expect } from '@playwright/test';

test('stash shows the same item illustration in bag, stored rows and after withdrawal at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.getByRole('button', { name: 'Browse wares' }).click();
  const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
  await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).click();
  await merchant.getByRole('button', { name: 'Leave' }).click();

  await page.getByRole('button', { name: 'Open stash' }).click();
  const stash = page.getByRole('dialog', { name: 'Camp Stash' });
  await expect(stash.locator('[data-stash-bag] .stash-item-ident svg[data-item-art="belt"]'))
    .toBeVisible();
  await stash.getByRole('button', { name: 'Store' }).click();
  await expect(stash.locator('[data-stash-items="0"] .stash-item-ident svg[data-item-art="belt"]'))
    .toBeVisible();
  await expect(stash.locator('[data-stash-bag] svg[data-item-art="belt"]')).toHaveCount(0);
  await stash.getByRole('button', { name: 'Retrieve' }).click();
  await expect(stash.locator('[data-stash-bag] svg[data-item-art="belt"]')).toBeVisible();
});

test('forge catalog and gem wallet display distinct original gem and rune artwork', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.getByRole('button', { name: 'Browse wares' }).click();
  const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
  await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).click();
  await merchant.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Visit blacksmith' }).click();
  const smith = page.getByRole('dialog', { name: 'Blacksmith Odan' });
  await expect(smith.locator('.gem-catalog svg[data-art-kind="gem"]')).toHaveCount(3);
  await expect(smith.locator('.gem-catalog svg[data-art-kind="rune"]')).toHaveCount(3);
  for (const family of ['gem.ruby', 'gem.sapphire', 'gem.emerald',
    'rune.ash', 'rune.ward', 'rune.focus']) {
    const art = smith.locator('[data-gem-base="' + family + '"] svg[data-gem-art="' + family + '.1"]');
    await expect(art, family).toBeVisible();
    await expect(art).toHaveAttribute('data-art-tier', '1');
  }
  const belt = smith.locator('[data-craft-id^="trade-belt-"]');
  await belt.getByRole('button', { name: /Salvage/ }).click();
  await smith.locator('[data-gem-base="gem.ruby"]').getByRole('button', { name: 'Forge' }).click();
  await expect(smith.locator('[data-gem-id="gem.ruby.1"] svg[data-gem-art="gem.ruby.1"]'))
    .toBeVisible();
  await expect(smith.locator('[data-gem-id="gem.ruby.1"] strong')).toHaveText('1');
});
