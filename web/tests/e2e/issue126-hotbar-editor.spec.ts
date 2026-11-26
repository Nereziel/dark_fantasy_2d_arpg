import { openCharacterCreation, enterWorld, continueGame, saveFromMenu, toggleHotbarEditor } from './character-menu';
// F1 — actual editable hotbar and character save/load. GPL-3.0-only.
import { test, expect } from '@playwright/test';

test('hotbar supports drag, keyboard activation, reset and per-hero reload', async ({ page }) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(12_000);
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await page.getByRole('button', { name: /Warrior/ }).click();
  await enterWorld(page);
  const toolbar = page.locator('.skill-toolbar');
  const slots = toolbar.locator('[data-hotbar-ability]');
  await expect(slots).toHaveCount(7);
  const original = await slots.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-hotbar-ability')));
  expect(original[1]).toBe('charge');
  expect(original[3]).toBe('warCry');
  await toggleHotbarEditor(page);
  const editor = page.getByTestId('hotbar-editor');
  await editor.locator('[data-hotbar-edit-slot="SLOT_1"]').dragTo(editor.locator('[data-hotbar-edit-slot="SLOT_3"]'));
  await toggleHotbarEditor(page);
  await expect(slots.nth(1)).toHaveAttribute('data-hotbar-ability', 'warCry');
  await expect(slots.nth(1)).toHaveAttribute('data-hotbar-slot', 'SLOT_1');
  await page.keyboard.press('1');
  await expect(slots.nth(1)).toHaveClass(/cooldown/);
  await saveFromMenu(page);
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await page.reload();
  await continueGame(page);
  await expect(slots.nth(1)).toHaveAttribute('data-hotbar-ability', 'warCry');
  await toggleHotbarEditor(page);
  await page.getByTestId('reset-hotbar').click();
  await toggleHotbarEditor(page);
  await expect(slots.nth(1)).toHaveAttribute('data-hotbar-ability', 'charge');
});

test('touch hotbar slot selection fits a 320px viewport without casting', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173/dark_fantasy_2d_arpg/', viewport: { width: 320, height: 740 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await page.goto('./?view=iso');
    await page.locator('#menu-language').selectOption('en');
    await openCharacterCreation(page);
    await page.getByRole('button', { name: /Warrior/ }).click();
  await enterWorld(page, 'tap');
    await toggleHotbarEditor(page, 'tap');
    const editor = page.getByTestId('hotbar-editor');
    await expect(editor).toBeVisible();
    const source = editor.locator('[data-hotbar-edit-slot="SLOT_1"]');
    const destination = editor.locator('[data-hotbar-edit-slot="SLOT_3"]');
    await source.tap();
    await expect(source).toHaveAttribute('aria-pressed', 'true');
    await destination.tap();
    await expect(source).toHaveAttribute('data-hotbar-edit-ability', 'warCry');
    await expect(source).toHaveAttribute('aria-pressed', 'false');
    const box = await editor.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(321);
    await toggleHotbarEditor(page, 'tap');
    await expect(page.locator('[data-hotbar-ability="warCry"]')).not.toHaveClass(/cooldown/);
  } finally {
    await context.close();
  }
});
