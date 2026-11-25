import { expect, test } from '@playwright/test';

// Only the canvas may open panels; only empty modal backdrops may close them.
test('mouse-bound map shortcut opens and closes on backdrop, then persists on reload', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const canvas = page.locator('canvas[data-renderer="isometric-preview"]');
  await expect(canvas).toBeVisible();

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls' }).click();
  const controls = page.getByRole('dialog', { name: 'Input bindings' });
  const secondary = controls.locator('.binding-row').filter({ hasText: 'Secondary skill' });
  await secondary.getByRole('button', { name: 'Change' }).click();
  await page.keyboard.press('y');
  await expect(secondary.locator('code')).toHaveText('KeyY');
  const map = controls.locator('.binding-row').filter({ hasText: 'Map' });
  await map.getByRole('button', { name: 'Change' }).click();
  await page.mouse.click(180, 180, { button: 'right' });
  await expect(map.locator('code')).toHaveText('Mouse 2');
  await controls.getByRole('button', { name: 'Back' }).click();
  await page.keyboard.press('Escape');

  await page.keyboard.press('m');
  await expect(page.getByTestId('world-map-dialog')).toHaveCount(0);
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.click(rect!.x + rect!.width / 2 - 80,
    rect!.y + rect!.height / 2 + 75, { button: 'right' });
  const dialog = page.getByTestId('world-map-dialog');
  await expect(dialog).toBeVisible();
  // Inner content must be inert to a mouse shortcut; the map remains usable.
  await dialog.getByTestId('map-zoom-in').click({ button: 'right' });
  await expect(dialog).toBeVisible();
  const shield = await dialog.boundingBox();
  expect(shield).not.toBeNull();
  await page.mouse.click(shield!.x + 3, shield!.y + 3, { button: 'right' });
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.game-screen')).toBeVisible();

  await page.reload();
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await expect(page.locator('.minimap-overlay button')).toContainText('RMB');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls' }).click();
  const reopened = page.getByRole('dialog', { name: 'Input bindings' });
  await expect(reopened.locator('.binding-row').filter({ hasText: 'Map' }).locator('code'))
    .toHaveText('Mouse 2');
});

test('mouse-mapped menu opens pause and resumes without world input', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const canvas = page.locator('canvas[data-renderer="isometric-preview"]');
  await expect(canvas).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls' }).click();
  const controls = page.getByRole('dialog', { name: 'Input bindings' });
  const secondary = controls.locator('.binding-row').filter({ hasText: 'Secondary skill' });
  await secondary.getByRole('button', { name: 'Change' }).click();
  await page.keyboard.press('y');
  const menu = controls.locator('.binding-row').filter({ hasText: 'Menu / pause' });
  await menu.getByRole('button', { name: 'Change' }).click();
  await page.mouse.click(180, 180, { button: 'right' });
  await expect(menu.locator('code')).toHaveText('Mouse 2');
  await controls.getByRole('button', { name: 'Back' }).click();
  // Escape was intentionally unbound; the native resume button still works.
  await page.getByRole('dialog', { name: 'Paused' }).getByRole('button', { name: 'Resume' }).click();
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.click(rect!.x + rect!.width / 2 - 80,
    rect!.y + rect!.height / 2 + 75, { button: 'right' });
  const paused = page.getByRole('dialog', { name: 'Paused' });
  await expect(paused).toBeVisible();
  const shield = page.locator('.modal-shield').filter({ has: paused });
  const box = await shield.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + 3, box!.y + 3, { button: 'right' });
  await expect(paused).toHaveCount(0);
  await expect(page.locator('.game-screen')).toBeVisible();
});
