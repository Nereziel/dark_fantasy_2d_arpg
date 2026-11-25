import { openCharacterCreation } from './character-menu';
// Issue #102: browser-local visual preferences survive reload and remain
// accessible by keyboard and on narrow mobile screens. GPL-3.0-only.
import { test, expect } from '@playwright/test';

test('visual accessibility preferences persist across reload without changing game saves', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await expect(page.locator('.phaser-container canvas')).toBeVisible();

  async function openSettings() {
    await page.locator('.game-header .top-actions .small-button').nth(1).click();
    await page.getByTestId('open-visual-settings').click();
    return page.getByTestId('visual-settings-dialog');
  }

  const panel = await openSettings();
  await expect(panel).toBeVisible();
  await page.getByTestId('visual-motion').selectOption('full');
  await page.getByTestId('visual-shake').selectOption('0');
  await page.getByTestId('visual-scale').selectOption('1.1');
  await page.getByTestId('visual-floating-text').uncheck();
  await page.getByTestId('visual-high-contrast').check();
  expect(await page.evaluate(() => ({
    scale: document.documentElement.style.fontSize,
    contrast: document.documentElement.dataset.arHighContrast,
    prefs: JSON.parse(localStorage.getItem('aether-ruin-visual-preferences-v1') || '{}')
  }))).toMatchObject({
    scale: '17.6px', contrast: 'true',
    prefs: {
      motion: 'full', shake: 0, uiScale: 1.1,
      floatingCombatText: false, highContrast: true
    }
  });
  await page.getByTestId('visual-settings-close').click();
  await expect(panel).toHaveCount(0);

  await page.reload();
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await expect(page.locator('.phaser-container canvas')).toBeVisible();
  const restored = await openSettings();
  await expect(restored).toBeVisible();
  await expect(page.getByTestId('visual-motion')).toHaveValue('full');
  await expect(page.getByTestId('visual-shake')).toHaveValue('0');
  await expect(page.getByTestId('visual-scale')).toHaveValue('1.1');
  await expect(page.getByTestId('visual-floating-text')).not.toBeChecked();
  await expect(page.getByTestId('visual-high-contrast')).toBeChecked();

  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 720 });
    const box = await restored.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(box.y).toBeGreaterThanOrEqual(-1);
      expect(box.y + box.height).toBeLessThanOrEqual(721);
    }
    await expect(page.getByTestId('visual-settings-close')).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(restored).toHaveCount(0);
});
