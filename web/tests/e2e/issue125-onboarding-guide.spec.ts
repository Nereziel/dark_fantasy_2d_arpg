import { test, expect } from '@playwright/test';

test('Issue #125: new player gets an optional, quest-aware first-play guide', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const guide = page.getByTestId('onboarding-guide');
  await expect(guide).toBeVisible();
  await expect(guide).toHaveAttribute('data-guide-step', 'warden');
  await expect(guide).toContainText('Vesna');
  await expect(guide.getByRole('button', { name: 'Open talents' })).toHaveCount(0);
  await expect(guide.getByRole('button', { name: 'View discovered map' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Speak to the warden' }).click();
  const dialog = page.getByRole('dialog', { name: 'Warden Vesna' });
  await expect(dialog).toBeVisible();
  await expect(guide).toBeHidden();
  await dialog.getByRole('button', { name: 'Accept quest' }).click();
  await dialog.getByRole('button', { name: 'Leave' }).click();
  await expect(guide).toHaveAttribute('data-guide-step', 'move');
  await guide.getByRole('button', { name: 'Next tip' }).click();
  await expect(guide).toHaveAttribute('data-guide-step', 'attack');

  await guide.getByRole('button', { name: 'Hide tips' }).click();
  await expect(guide).toHaveAttribute('data-guide-collapsed', 'true');
  await guide.getByRole('button', { name: 'Show tips' }).click();
  await expect(guide).toHaveAttribute('data-guide-step', 'attack');
  await expect(guide).toHaveAttribute('data-guide-collapsed', 'false');
  await guide.getByRole('button', { name: 'Restart tips' }).click();
  await expect(guide).toHaveAttribute('data-guide-step', 'move');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await guide.getByRole('button', { name: 'Next tip' }).click();
  await expect(guide).toHaveAttribute('data-guide-step', 'attack');
  await page.reload();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(guide).toHaveAttribute('data-guide-step', 'attack');
});

test('Issue #125: Czech/touch guide stays in scroll-safe HUD and never blocks other panels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('./');
  await page.locator('#menu-language').selectOption('cs');
  await page.getByRole('button', { name: 'Vstoupit do světa' }).click();
  const guide = page.getByTestId('onboarding-guide');
  await expect(guide).toHaveAttribute('data-guide-step', 'warden');
  await expect(guide).toContainText('Vesn');
  const geometry = await guide.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const left = node.closest('.hud-left-column')!.getBoundingClientRect();
    return {
      left: rect.left, right: rect.right,
      columnLeft: left.left, columnRight: left.right,
      width: innerWidth
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(geometry.columnLeft - 1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.columnRight + 1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
  await page.locator('[data-quick-action="inventory"]').click();
  await expect(page.getByRole('dialog', { name: /Inventář/ })).toBeVisible();
  await expect(guide).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(guide).toBeVisible();
  await page.locator('#game-language').selectOption('en');
  await expect(guide).toContainText('Vesna');
  await guide.getByRole('button', { name: 'Hide tips' }).click();
  await expect(guide).toHaveAttribute('data-guide-collapsed', 'true');
  const record = await page.evaluate(() => Object.keys(localStorage)
    .filter(k => k.startsWith('aether-ruin-onboarding-v1:')));
  expect(record).toHaveLength(1);
  await expect(page.getByTestId('combat-dock')).toBeVisible();
});
