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

/** Follow the ordinary world canvas from the finished first quest to Act I's next
 * exploration objective. No debug bridge, state mutation or feature teleport. */
async function walkToCorruptionSite(page: Page, timeoutMs: number): Promise<void> {
  const game = page.locator('.game-screen');
  const canvas = page.locator('.phaser-container canvas');
  const journal = page.locator('.quest-journal');
  const deadline = Date.now() + timeoutMs;
  let stalled = 0;
  let waypointIndex = 0;
  let waypointTicks = 0;
  // Search the authored region, not a hidden procedural feature coordinate.
  // The mandatory site can shift to the nearest reachable grid candidate.
  const waypoints = [
    { x: 1550, y: 280 }, { x: 1490, y: 200 }, { x: 1620, y: 200 },
    { x: 1640, y: 320 }, { x: 1550, y: 390 }, { x: 1440, y: 330 },
    { x: 1420, y: 190 }, { x: 1720, y: 280 }, { x: 1700, y: 410 },
    { x: 1420, y: 420 }
  ];
  while (Date.now() < deadline) {
    if ((await journal.innerText()).includes('The Blighted Pack')) return;
    if (await page.getByTestId('death-overlay').count()) {
      throw new Error('Natural Act I exploration: hero died en route to the corruption site');
    }
    const x = Number(await game.getAttribute('data-player-x'));
    const y = Number(await game.getAttribute('data-player-y'));
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);

    // Ordinary player healing, without overriding health or pausing combat.
    const hp = (await page.locator('.vital-top').first().innerText())
      .match(/(\d+)\s*\/\s*(\d+)/);
    if (hp && Number(hp[1]) / Number(hp[2]) < 0.68) {
      const healing = page.locator('[data-paladin-ability="healingLight"]');
      if (await healing.isEnabled()) await healing.click();
      else {
        const potion = page.getByTestId('use-potion');
        if (await potion.isEnabled()) await potion.click();
      }
    }

    const rect = await canvas.boundingBox();
    if (!rect) throw new Error('Phaser canvas missing during story exploration');
    const { width, height } = await canvas.evaluate(node => ({
      width: node.width, height: node.height
    }));
    const waypoint = waypoints[waypointIndex]!;
    // Phaser's camera clamps to world edges: a hero north of the viewport
    // midpoint is NOT drawn at canvas center. Project the target using the
    // clamped camera scroll, then choose a safe on-screen middle-mouse click.
    const scrollX = Math.max(0, Math.min(2200 - width, x - width / 2));
    const scrollY = Math.max(0, Math.min(1400 - height, y - height / 2));
    const screenX = Math.max(width * 0.35,
      Math.min(width * 0.67, waypoint.x - scrollX));
    const screenY = Math.max(height * 0.23,
      Math.min(height * 0.68, waypoint.y - scrollY));
    await page.mouse.click(rect.x + rect.width * screenX / width,
      rect.y + rect.height * screenY / height, { button: 'middle' });
    await page.waitForTimeout(1200);
    const nextX = Number(await game.getAttribute('data-player-x'));
    const nextY = Number(await game.getAttribute('data-player-y'));
    stalled = Math.hypot(nextX - x, nextY - y) < 6 ? stalled + 1 : 0;
    waypointTicks += 1;
    if (Math.hypot(nextX - waypoint.x, nextY - waypoint.y) < 45
      || waypointTicks >= 12 || stalled >= 4) {
      waypointIndex = (waypointIndex + 1) % waypoints.length;
      waypointTicks = 0;
      stalled = 0;
    }
  }
  throw new Error('Natural Act I exploration timed out at (' +
    await game.getAttribute('data-player-x') + ',' +
    await game.getAttribute('data-player-y') + '), objective: ' +
    await journal.innerText());
}

test('Issue #125 — natural first Act I loop: Warden, movement, combat, loot, equip, turn-in', async ({ page }) => {
  test.setTimeout(230_000);
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
  // Optional discoveries are permitted when the hero actually passed near
  // them. Record the *discovered set*, not an invalid zero-marker assumption.
  const optionalBeforeSave = await map.locator('[data-marker-kind="optionalPoi"]')
    .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-map-marker')).sort());
  await map.getByTestId('map-close').click();
  await expect(guide).toHaveAttribute('data-guide-step', 'story');

  // The *current* objective is localized live, not a stale Warden message.
  await page.locator('#game-language').selectOption('cs');
  await expect(guide).toContainText('Prozkoumej ohnisko korupce');
  await expect(guide.getByRole('button', { name: 'Zobrazit objevenou mapu' })).toBeVisible();
  await page.locator('#game-language').selectOption('en');

  // Regression guard: a genuine first-quest turn-in must survive a character
  // save without changing XP, gold or the active story objective. No test-only
  // bridge commands or fabricated character/quest state are involved.
  // The actual item equipped from ground loot must retain its identity and
  // slot after reload, not merely survive as a duplicated bag item.
  await page.locator('[data-quick-action="inventory"]').click();
  const gearBeforeSave = await inventory.locator('.equipment-slot.has-item')
    .evaluateAll(nodes => nodes.map(node => ({
      slot: node.getAttribute('data-equipment-slot'),
      label: node.getAttribute('aria-label')
    })));
  expect(gearBeforeSave.length).toBeGreaterThan(0);
  await inventory.locator('.close-button').click();

  const progressBeforeSave = await guide.getByTestId('onboarding-xp').innerText();
  const hudBeforeSave = await page.locator('.hud-details span').allTextContents();
  const journalProgress = page.locator('.quest-journal strong, .quest-journal .quest-progress');
  const objectiveBeforeSave = await journalProgress.allTextContents();
  expect(await game.getAttribute('data-zone')).toBe('wilderness');
  // Optional POIs legitimately discovered during combat are visible in the
  // minimap; map IDs before/after reload are compared below.

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText('Hero saved');
  await page.reload();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(guide.getByTestId('onboarding-xp')).toHaveText(progressBeforeSave);
  await expect(page.locator('.hud-details span')).toHaveText(hudBeforeSave);
  await expect(journalProgress).toHaveText(objectiveBeforeSave);
  await page.locator('[data-quick-action="inventory"]').click();
  const gearAfterSave = await inventory.locator('.equipment-slot.has-item')
    .evaluateAll(nodes => nodes.map(node => ({
      slot: node.getAttribute('data-equipment-slot'),
      label: node.getAttribute('aria-label')
    })));
  expect(gearAfterSave).toEqual(gearBeforeSave);
  await inventory.locator('.close-button').click();
  await expect(game).toHaveAttribute('data-zone', 'wilderness');

  // Reloaded map must still reveal only discovered locations. The active
  // story hint cannot accidentally turn future quest markers into spoilers.
  await guide.getByRole('button', { name: 'View discovered map' }).click();
  await expect(map).toBeVisible();
  await expect(map.locator('[data-fog="unexplored"]').first()).toBeVisible();
  const optionalAfterLoad = await map.locator('[data-marker-kind="optionalPoi"]')
    .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-map-marker')).sort());
  expect(optionalAfterLoad).toEqual(optionalBeforeSave);
  await map.getByTestId('map-close').click();
  // Turn-in immediately starts the next genuine Act I objective;
  // the journal correctly replaces the completed starter quest.
  await expect(page.locator('.quest-journal')).toContainText('Trail of Black Ash');
  await expect(guide).toHaveAttribute('data-guide-step', 'story');
  await expect(guide).toContainText('Investigate the corruption site');
  await expect(guide.getByTestId('onboarding-xp')).toContainText(/Level \d+ · XP \d+\/\d+/);
  // Continue using actual player movement after loading the genuine quest save.
  // The corruption-site discovery must grant its reward exactly once and
  // automatically activate the next story quest, not a second Vesna turn-in.
  await walkToCorruptionSite(page, 95_000);
  await expect(page.locator('.quest-journal')).toContainText('The Blighted Pack');
  await expect(page.locator('.quest-journal')).toContainText('Defeat three corrupted boars');
  await expect(game).toHaveAttribute('data-zone', 'wilderness');
  // The journey may legitimately discover optional POIs on the travelled
  // path; only the unexplored region's secrets must remain hidden.

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
