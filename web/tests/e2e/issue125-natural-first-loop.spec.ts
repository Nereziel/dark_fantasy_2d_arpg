import { expect, test, type Page } from '@playwright/test';

/** Uses only ordinary user-visible controls on the production Vite build.
 * No GameBridge, debug hooks, direct commands, seeded snapshot injection,
 * canvas-state mutation or synthetic GameEvents.
 */
async function activeQuestCount(page: Page): Promise<number> {
  const questText = await page.locator('.quest-journal').innerText();
  const match = questText.match(/(?:^|\D)([0-3])\/3(?:\D|$)/);
  return match ? Number(match[1]) : -1;
}

async function keepFighting(page: Page, until: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const roster = page.locator('.enemy-roster');
  let previousCount = -1;
  while (Date.now() < deadline) {
    const achieved = await activeQuestCount(page);
    if (achieved >= until) return;
    if (await page.getByTestId('death-overlay').count()) {
      throw new Error('Natural quest playthrough: the hero died before ' + until + '/3 kills');
    }

    const current = await page.locator('.vital-top').first().innerText();
    const hp = current.match(/(\d+)\s*\/\s*(\d+)/);
    if (hp && Number(hp[1]) / Number(hp[2]) < 0.67) {
      const healingLight = page.locator('[data-paladin-ability="healingLight"]');
      if (await healingLight.isEnabled()) {
        await healingLight.click();
      } else {
        const potion = page.getByTestId('use-potion');
        if (await potion.isEnabled()) await potion.click();
      }
    }

    const activeTarget = roster.locator('button.targeted:not([disabled])');
    if (await activeTarget.count() === 0 || achieved !== previousCount) {
      const liveTargets = roster.locator('button:not([disabled])');
      if (await liveTargets.count()) await liveTargets.first().click();
    }
    previousCount = achieved;
    await page.waitForTimeout(400);
  }
  throw new Error('Natural quest playthrough timed out at ' +
    await activeQuestCount(page) + '/3 kills; target ' + until);
}

test('Issue #125 — natural first Act I loop: Warden, movement, combat, loot, equip, turn-in', async ({ page }) => {
  test.setTimeout(125_000);
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: /Paladin/ }).click();
  await page.getByRole('button', { name: 'Enter the world' }).click();

  const game = page.locator('.game-screen');
  const guide = page.getByTestId('onboarding-guide');
  await expect(guide).toHaveAttribute('data-guide-step', 'warden');
  await page.getByRole('button', { name: 'Speak to the warden' }).click();
  const warden = page.getByRole('dialog', { name: 'Warden Vesna' });
  await expect(warden).toBeVisible();
  await warden.getByRole('button', { name: 'Accept quest' }).click();
  await warden.getByRole('button', { name: 'Leave' }).click();
  expect(await activeQuestCount(page)).toBe(0);

  // Real left-click walk (not a simulation command) followed by real roster combat.
  const canvas = page.locator('.phaser-container canvas');
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  const startX = Number(await game.getAttribute('data-player-x'));
  await page.mouse.click(rect!.x + rect!.width * 0.63,
    rect!.y + rect!.height * 0.43);
  await expect.poll(async () => Math.abs(
    Number(await game.getAttribute('data-player-x')) - startX
  ), { timeout: 8_000 }).toBeGreaterThan(14);

  await keepFighting(page, 1, 45_000);
  await expect(guide).toHaveAttribute('data-guide-step', 'loot');
  const loot = page.getByTestId('nearby-loot');
  await expect(loot).toBeVisible({ timeout: 10_000 });
  const target = loot.locator('[data-loot-id]').first();
  const lootId = await target.getAttribute('data-loot-id');
  expect(lootId).not.toBeNull();
  await target.click();
  await expect(loot.locator('[data-loot-id="' + lootId + '"]'))
    .toHaveCount(0, { timeout: 12_000 });

  await page.locator('[data-quick-action="inventory"]').click();
  const inventory = page.getByRole('dialog', { name: 'Inventory & Equipment' });
  await expect(inventory).toBeVisible();
  const bag = inventory.locator('.bag-slot.occupied');
  await expect(bag.first()).toBeVisible();
  await bag.first().click();
  const equip = inventory.getByRole('button', { name: 'Equip', exact: true });
  await expect(equip).toBeEnabled();
  await equip.click();
  await inventory.locator('.close-button').click();
  await expect(guide).toHaveAttribute('data-guide-step', 'objective');

  await keepFighting(page, 3, 50_000);
  await expect(guide).toHaveAttribute('data-guide-step', 'return');
  await expect(page.locator('.quest-journal')).toContainText('Return to Warden Vesna');

  // UI NPC button sends the same natural auto-approach as a world click.
  await page.getByRole('button', { name: 'Speak to the warden' }).click();
  await expect(warden).toBeVisible({ timeout: 18_000 });
  await warden.getByRole('button', { name: 'Complete quest' }).click();
  await warden.getByRole('button', { name: 'Leave' }).click();
  // Turn-in immediately starts the next genuine Act I objective;
  // the journal correctly replaces the completed starter quest.
  await expect(page.locator('.quest-journal')).toContainText('Trail of Black Ash');
  await expect(guide).toHaveAttribute('data-guide-step', 'story');
  await expect(guide).toContainText('Investigate the corruption site');
  await expect(guide.getByTestId('onboarding-xp')).toContainText(/Level \d+ · XP \d+\/\d+/);

  // The optional guide opens the same discovered-only map as the HUD;
  // it does not reveal any future quest coordinate or mutate progression.
  await guide.getByRole('button', { name: 'View discovered map' }).click();
  const map = page.getByTestId('world-map-dialog');
  await expect(map).toBeVisible();
  await map.getByTestId('map-close').click();
  await expect(guide).toHaveAttribute('data-guide-step', 'story');

  // The *current* objective is localized live, not a stale Warden message.
  await page.locator('#game-language').selectOption('cs');
  await expect(guide).toContainText('Prozkoumej ohnisko korupce');
  await expect(guide.getByRole('button', { name: 'Zobrazit objevenou mapu' })).toBeVisible();
  await page.locator('#game-language').selectOption('en');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await page.reload();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  // Turn-in immediately starts the next genuine Act I objective;
  // the journal correctly replaces the completed starter quest.
  await expect(page.locator('.quest-journal')).toContainText('Trail of Black Ash');
  await expect(guide).toHaveAttribute('data-guide-step', 'followup');
});

test.describe('touch input', () => {
  test.use({ hasTouch: true });
  test('Issue #125 — touch loot affordance is reachable without canvas pinpoint', async ({ page }) => {
  test.setTimeout(85_000);
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto('./');
  await page.locator('#menu-language').selectOption('cs');
  await page.getByRole('button', { name: /Paladin/ }).click();
  await page.getByRole('button', { name: 'Vstoupit do světa' }).click();
  await page.getByRole('button', { name: 'Promluvit se strážkyní' }).click();
  const dialog = page.getByRole('dialog', { name: 'Strážkyně Vesna' });
  await dialog.getByRole('button', { name: 'Přijmout úkol' }).click();
  await dialog.getByRole('button', { name: 'Odejít' }).click();
  const target = page.locator('.enemy-roster button:not([disabled])').first();
  await target.tap();
  await expect.poll(() => activeQuestCount(page), { timeout: 55_000 })
    .toBeGreaterThan(0);
  const loot = page.getByTestId('nearby-loot');
  const button = loot.locator('[data-loot-id]').first();
  await expect(button).toBeInViewport({ ratio: 0.85 });
  const bounds = await button.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.height).toBeGreaterThanOrEqual(43);
  const lootId = await button.getAttribute('data-loot-id');
  expect(lootId).not.toBeNull();
  await button.tap();
  // Another drop may immediately become the new first button. Assert the
  // original item ID was collected, not that the nearest-list is empty.
  await expect(loot.locator('[data-loot-id="' + lootId + '"]'))
    .toHaveCount(0, { timeout: 12_000 });
  await page.locator('[data-quick-action="inventory"]').tap();
  await expect(page.getByRole('dialog', { name: 'Inventář a výbava' })).toBeVisible();
});

});
