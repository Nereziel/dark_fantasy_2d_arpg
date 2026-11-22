import { expect, test } from '@playwright/test';

test('seven-bus audio settings persist safely and remain usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.locator('.game-header .top-actions .small-button').nth(1).click();
  await page.getByTestId('open-visual-settings').click();

  const panel = page.getByTestId('visual-settings-dialog');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Audio and volume')).toBeVisible();
  for (const bus of ['master','music','ambience','combat','monsters','spells','ui']) {
    await expect(page.getByTestId('audio-' + bus)).toHaveCount(1);
  }
  await page.getByTestId('audio-master').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('audio-master')).toHaveValue('5');
  await page.getByTestId('audio-monsters').focus();
  await page.keyboard.press('End');
  await expect(page.getByTestId('audio-monsters')).toHaveValue('100');
  await page.getByTestId('audio-muted').check();

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('aether-ruin-audio-v1') || '{}')
  );
  expect(stored).toMatchObject({ master: 0.05, monsters: 1, muted: true });
  await page.getByTestId('visual-settings-close').click();
  await page.reload();
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.locator('.game-header .top-actions .small-button').nth(1).click();
  await page.getByTestId('open-visual-settings').click();

  await expect(page.getByTestId('audio-master')).toHaveValue('5');
  await expect(page.getByTestId('audio-monsters')).toHaveValue('100');
  await expect(page.getByTestId('audio-muted')).toBeChecked();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 720 });
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    await page.getByTestId('audio-ui').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('audio-ui')).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});
