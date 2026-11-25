import { openCharacterCreation } from './character-menu';
/**
 * Issue #102: browser fullscreen and pixel-art interpolation stay visual only.
 * The mocked Fullscreen API makes unsupported/headless CI deterministic; this
 * does not claim that the browser granted a native fullscreen OS window.
 */
import { expect, test } from '@playwright/test';

test('fullscreen toggle and smooth pixels preserve the live game, save and mobile modal', async ({ page }) => {
  await page.addInitScript(() => {
    let active: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true, get: () => active
    });
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true, get: () => true
    });
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value: async function (this: Element) {
        if ((window as Window & { denyFullscreen?: boolean }).denyFullscreen)
          throw new Error('Permission denied');
        active = this;
        document.dispatchEvent(new Event('fullscreenchange'));
      }
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: async () => {
        active = null;
        document.dispatchEvent(new Event('fullscreenchange'));
      }
    });
  });

  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const canvas = page.locator('.phaser-container canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.phaser-container')).toHaveAttribute('data-render-mode', 'sharp');

  await page.locator('.game-header .top-actions .small-button').nth(1).click();
  await page.getByTestId('open-visual-settings').click();
  const panel = page.getByTestId('visual-settings-dialog');
  await expect(panel).toBeVisible();
  const seed = await page.locator('.game-screen').getAttribute('data-world-seed');
  const x = await page.locator('.game-screen').getAttribute('data-player-x');
  const y = await page.locator('.game-screen').getAttribute('data-player-y');

  await canvas.evaluate(element => element.setAttribute('data-old-canvas', 'true'));
  await page.getByTestId('visual-pixel-filter').selectOption('smooth');
  await expect(page.locator('.phaser-container')).toHaveAttribute('data-render-mode', 'smooth');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect(canvas).not.toHaveAttribute('data-old-canvas', 'true');
  await expect(page.locator('.phaser-container canvas')).toHaveCount(1);
  await expect(page.locator('.game-screen')).toHaveAttribute('data-world-seed', seed!);
  await expect(page.locator('.game-screen')).toHaveAttribute('data-player-x', x!);
  await expect(page.locator('.game-screen')).toHaveAttribute('data-player-y', y!);
  await expect(panel).toBeVisible();

  const fullscreen = page.getByTestId('visual-fullscreen');
  await expect(fullscreen).toContainText('Enter fullscreen');
  await fullscreen.click();
  await expect(fullscreen).toContainText('Exit fullscreen');
  expect(await page.evaluate(() => document.fullscreenElement?.className)).toBe('app-frame');

  await fullscreen.click();
  await expect(fullscreen).toContainText('Enter fullscreen');
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();

  await page.evaluate(() => {
    (window as Window & { denyFullscreen?: boolean }).denyFullscreen = true;
  });
  await fullscreen.click();
  await expect(panel.getByRole('alert')).toContainText('browser did not allow');

  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 720 });
    const bounds = await panel.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(-1);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    await expect(page.getByTestId('visual-pixel-filter')).toBeVisible();
    await expect(page.getByTestId('visual-fullscreen')).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  await page.reload();
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await expect(page.locator('.phaser-container')).toHaveAttribute('data-render-mode', 'smooth');
  await expect(page.locator('.phaser-container canvas')).toBeVisible();
});
