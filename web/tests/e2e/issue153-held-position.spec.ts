import { test, expect } from '@playwright/test';

test('mouse HOLD_POSITION follows down/up, clears on pause, persists after reload', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const game = page.locator('.game-screen'), canvas = page.locator('.phaser-container canvas');
  await expect(canvas).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls' }).click();
  const panel = page.getByRole('dialog', { name: 'Input bindings' });
  const secondary = panel.locator('.binding-row').filter({ hasText: 'Secondary skill' });
  await secondary.getByRole('button', { name: 'Change' }).click();
  await page.keyboard.press('y');
  const hold = panel.locator('.binding-row').filter({ hasText: 'Hold position' });
  await hold.getByRole('button', { name: 'Change' }).click();
  await page.mouse.click(180, 180, { button: 'right' });
  await expect(hold.locator('code')).toHaveText('Mouse 2');
  await panel.getByRole('button', { name: 'Back' }).click();
  await page.keyboard.press('Escape');
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x + rect!.width / 2 - 80, rect!.y + rect!.height / 2 + 75);
  await expect(game).toHaveAttribute('data-hold-position', 'false');
  await page.mouse.down({ button: 'right' });
  await expect(game).toHaveAttribute('data-hold-position', 'true');
  await page.mouse.up({ button: 'right' });
  await expect(game).toHaveAttribute('data-hold-position', 'false');
  await page.mouse.down({ button: 'right' });
  await page.keyboard.press('Escape');
  await expect(game).toHaveAttribute('data-hold-position', 'false');
  const paused = page.getByRole('dialog', { name: 'Paused' });
  await expect(paused).toBeVisible();
  await page.mouse.up({ button: 'right' });
  await paused.getByRole('button', { name: 'Resume' }).click();
  await expect(game).toHaveAttribute('data-hold-position', 'false');

  await page.reload();
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls' }).click();
  await expect(page.getByRole('dialog', { name: 'Input bindings' })
    .locator('.binding-row').filter({ hasText: 'Hold position' }).locator('code'))
    .toHaveText('Mouse 2');
});

test('Shift and mouse are independent; blur and pointercancel unhold safely', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.setItem('aether-ruin-controls-v1', JSON.stringify([
    { action: 'SECONDARY', device: 'keyboard', code: 'KeyY' },
    { action: 'HOLD_POSITION', device: 'keyboard', code: 'ShiftLeft' },
    { action: 'HOLD_POSITION', device: 'keyboard', code: 'ShiftRight' },
    { action: 'HOLD_POSITION', device: 'mouse', button: 2 }
  ])));
  await page.reload();
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const canvas = page.locator('.phaser-container canvas'), game = page.locator('.game-screen');
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x + rect!.width / 2 - 80, rect!.y + rect!.height / 2 + 75);
  await page.keyboard.down('Shift');
  await expect(game).toHaveAttribute('data-hold-position', 'true');
  await page.mouse.down({ button: 'right' });
  await page.keyboard.up('Shift');
  await expect(game).toHaveAttribute('data-hold-position', 'true');
  await page.mouse.up({ button: 'right' });
  await expect(game).toHaveAttribute('data-hold-position', 'false');
  await page.mouse.down({ button: 'right' });
  await expect(game).toHaveAttribute('data-hold-position', 'true');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(game).toHaveAttribute('data-hold-position', 'false');
  await page.mouse.up({ button: 'right' });
  await page.mouse.down({ button: 'right' });
  await expect(game).toHaveAttribute('data-hold-position', 'true');
  await canvas.evaluate(el => el.dispatchEvent(new PointerEvent('pointercancel', {
    bubbles: true, pointerId: 1, pointerType: 'mouse', button: 2
  })));
  await expect(game).toHaveAttribute('data-hold-position', 'false');
  await page.mouse.up({ button: 'right' });
});
