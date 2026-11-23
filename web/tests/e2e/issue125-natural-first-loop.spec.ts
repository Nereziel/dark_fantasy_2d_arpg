import { errors, expect, test, type Page } from '@playwright/test';

/** Uses only ordinary user-visible controls on the production Vite build.
 * No GameBridge, debug hooks, direct commands, seeded snapshot injection,
 * canvas-state mutation or synthetic GameEvents.
 */
async function activeQuestCount(page: Page): Promise<number> {
  const questText = await page.locator('.quest-journal').innerText();
  const match = questText.match(/(?:^|\D)([0-3])\/3(?:\D|$)/);
  return match ? Number(match[1]) : -1;
}

async function keepFighting(
  page: Page, until: number, timeoutMs: number, nextQuestTitle?: string
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const roster = page.locator('.enemy-roster');
  let previousCount = -1;
  let lastTargetRefreshAt = 0;
  while (Date.now() < deadline) {
    const journal = await page.locator('.quest-journal').innerText();
    // The starter hunt is NPC-gated and stays at 3/3. Act I boar kills,
    // by contrast, immediately auto-complete and activate Forgotten Graves:
    // 3/3 is never guaranteed to remain visible for a polling interval.
    if (nextQuestTitle ? journal.includes(nextQuestTitle)
      : (await activeQuestCount(page)) >= until) return;
    const achieved = await activeQuestCount(page);
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
    const huntBoars = nextQuestTitle !== undefined;
    const liveTargets = roster.locator('button:not([disabled])');
    // Presentation sorts minibosses ahead of ordinary enemies. During the
    // mandatory boar hunt, clearing the real encounter pack (then selecting
    // the three actual boars) takes priority over optional wandering bosses.
    const boars = liveTargets.filter({ hasText: 'Corrupted Boar' });
    const otherEncounterTargets = roster.locator('button:not([disabled]):not(.bossTarget)');
    const boarVisible = huntBoars && await boars.count() > 0;
    const candidates = boarVisible ? boars
      : huntBoars && await otherEncounterTargets.count() > 0
        ? otherEncounterTargets : liveTargets;
    const refreshTarget = huntBoars && (Date.now() - lastTargetRefreshAt > 10_000
      || (boarVisible && await activeTarget.filter({ hasText: 'Corrupted Boar' }).count() === 0));
    if (await activeTarget.count() === 0 || achieved !== previousCount || refreshTarget) {
      if (await candidates.count()) {
        try {
          // A real click may race with an enemy death, as in PR #187. Bound
          // only the transient control wait, never the quest/death conditions.
          await candidates.first().click({ timeout: 1_500 });
          lastTargetRefreshAt = Date.now();
        } catch (error) {
          if (!(error instanceof errors.TimeoutError)) throw error;
        }
      }
    }
    previousCount = achieved;
    await page.waitForTimeout(400);
  }
  const rosterText = await roster.innerText();
  const game = page.locator('.game-screen');
  throw new Error('Natural quest playthrough timed out at ' +
    await activeQuestCount(page) + '/3 kills; target ' + until
    + '; active quest: ' + (await page.locator('.quest-journal').innerText())
    + '; enemies: ' + rosterText.replaceAll('\n', ' ')
    + '; player position: ' + await game.getAttribute('data-player-x')
    + ',' + await game.getAttribute('data-player-y'));
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
    // Start along the old road south of the northern forest obstacles.
    // Clicking directly northeast can leave a procedural seed pinned at
    // the north edge (observed x≈883,y=140 in PR #189 CI).
    { x: 860, y: 470 }, { x: 1110, y: 470 }, { x: 1320, y: 440 },
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
    // If the path is pinned against an obstacle, make a real short sideways
    // world click, then retry the authored region search. No simulation
    // teleport, hidden map marker or obstacle lookup is involved.
    const target = stalled >= 2
      ? { x: Math.max(100, Math.min(2080, x + (waypointIndex % 2 ? -90 : 115))),
        y: y < 570 ? Math.min(1200, y + 270) : Math.max(120, y - 230) }
      : waypoints[waypointIndex]!;
    const waypoint = target;
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

/** Find the actual procedurally placed graveyard by walking the wilderness,
 * using only visible canvas input. Authored map anchors are search regions,
 * not an authoritative feature-coordinate lookup or a teleport.
 */
async function walkToAbandonedGraveyard(page: Page, timeoutMs: number): Promise<void> {
  const game = page.locator('.game-screen');
  const canvas = page.locator('.phaser-container canvas');
  const journal = page.locator('.quest-journal');
  const deadline = Date.now() + timeoutMs;
  let index = 0;
  let ticks = 0;
  let stalled = 0;
  const waypoints = [
    // Survey the authored graveyard area from the northern approach and
    // sweep south. Keep intermediate waypoints reachable with normal input;
    // the actual feature marker may shift with the procedural layout.
    { x: 1610, y: 390 }, { x: 1690, y: 280 }, { x: 1820, y: 280 },
    { x: 1980, y: 360 }, { x: 2000, y: 520 }, { x: 1950, y: 670 },
    { x: 1880, y: 690 }, { x: 2000, y: 780 }, { x: 1870, y: 830 },
    { x: 1780, y: 960 }, { x: 1940, y: 980 }, { x: 2040, y: 670 },
    { x: 1860, y: 570 }, { x: 1780, y: 450 }
  ];
  while (Date.now() < deadline) {
    // A genuine graveyard discovery auto-completes Forgotten Graves and
    // immediately activates Morrow; the 1/1 intermediate state is transient.
    if ((await journal.innerText()).includes('Morrow, Gravebound')) return;
    if (await page.getByTestId('death-overlay').count()) {
      throw new Error('Natural Act I exploration: hero died before finding the graveyard');
    }

    const x = Number(await game.getAttribute('data-player-x'));
    const y = Number(await game.getAttribute('data-player-y'));
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);

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
    if (!rect) throw new Error('Phaser canvas missing during graveyard exploration');
    const { width, height } = await canvas.evaluate(node => ({
      width: node.width, height: node.height
    }));
    // Recover if a procedural obstacle blocks a specific eastward click.
    // This uses real viewport movement; it does not inspect map obstacles.
    const waypoint = stalled >= 2
      ? { x: Math.max(100, x - 160),
        y: y >= 570 ? Math.max(130, y - 330) : Math.min(1260, y + 310) }
      : waypoints[index]!;
    const scrollX = Math.max(0, Math.min(2200 - width, x - width / 2));
    const scrollY = Math.max(0, Math.min(1400 - height, y - height / 2));
    // At the east world edge the camera can no longer follow the hero.
    // Clamping at 67% capped the maximum world-click x to 1777 in a 1280px
    // viewport (2200 - 1280 + 0.67 * 1280): the exact repeated CI failure.
    // 78% stays left of the right HUD but reaches the graveyard at x≈1900.
    const screenX = Math.max(width * 0.35,
      Math.min(width * 0.78, waypoint.x - scrollX));
    const screenY = Math.max(height * 0.23,
      Math.min(height * 0.68, waypoint.y - scrollY));
    await page.mouse.click(rect.x + rect.width * screenX / width,
      rect.y + rect.height * screenY / height, { button: 'middle' });
    await page.waitForTimeout(1200);

    const nextX = Number(await game.getAttribute('data-player-x'));
    const nextY = Number(await game.getAttribute('data-player-y'));
    stalled = Math.hypot(nextX - x, nextY - y) < 6 ? stalled + 1 : 0;
    ticks += 1;
    if (Math.hypot(nextX - waypoint.x, nextY - waypoint.y) < 48
      || ticks >= 7 || stalled >= 3) {
      index = (index + 1) % waypoints.length;
      ticks = 0;
      stalled = 0;
    }
  }
  throw new Error('Natural graveyard exploration timed out at ('
    + await game.getAttribute('data-player-x') + ','
    + await game.getAttribute('data-player-y') + '), waypoint: '
    + index + ' (' + waypoints[index]!.x + ',' + waypoints[index]!.y
    + '), journal: ' + await journal.innerText());
}

/** Defeat the unique Act I miniboss through the visible HUD and ordinary
 * player auto-attack/healing. Only the actual boss kill advances the ledger;
 * merely targeting, reaching the marker or waiting cannot pass this check.
 */
async function defeatMorrowNaturally(page: Page, timeoutMs: number): Promise<void> {
  const journal = page.locator('.quest-journal');
  const morrow = page.locator('.enemy-roster button')
    .filter({ hasText: 'Morrow, Graveyard Warden' });
  const deadline = Date.now() + timeoutMs;
  let lastTargetAt = 0;
  let sawTargeting = false;
  while (Date.now() < deadline) {
    const story = await journal.innerText();
    if (story.includes('The Seal of Rot')) return;
    if (await page.getByTestId('death-overlay').count()) {
      throw new Error('Natural Act I Morrow fight: the hero died before the Seal of Rot quest');
    }
    const hpText = await page.locator('.vital-top').first().innerText();
    const hp = hpText.match(/(\d+)\s*\/\s*(\d+)/);
    if (hp && Number(hp[1]) / Number(hp[2]) < 0.73) {
      const heal = page.locator('[data-paladin-ability="healingLight"]');
      if (await heal.isEnabled()) await heal.click();
      else {
        const potion = page.getByTestId('use-potion');
        if (await potion.isEnabled()) await potion.click();
      }
    }

    const aliveBoss = page.locator('.enemy-roster button:not([disabled])')
      .filter({ hasText: 'Morrow, Graveyard Warden' });
    if (await aliveBoss.count() === 0) {
      // A dead Morrow must cause an authoritative quest transition, not be
      // counted as success merely because the target disappeared.
      await page.waitForTimeout(400);
      continue;
    }
    const targeted = await morrow.getAttribute('aria-pressed') === 'true';
    sawTargeting ||= targeted;
    if (!targeted || Date.now() - lastTargetAt > 10_000) {
      try {
        await morrow.click({ timeout: 1_500 });
        lastTargetAt = Date.now();
      } catch (error) {
        // Live targets can die or become temporarily disabled as the
        // simulation advances; never suppress unrelated click failures.
        if (!(error instanceof errors.TimeoutError)) throw error;
      }
    }
    await page.waitForTimeout(400);
  }
  throw new Error('Natural Act I Morrow fight timed out; target was selected: '
    + sawTargeting + '; journal: ' + await journal.innerText()
    + '; enemy roster: ' + (await page.locator('.enemy-roster').innerText()).replaceAll('\n', ' '));
}

test('Issue #125 — natural first Act I loop: Warden, movement, combat, loot, equip, turn-in', async ({ page }) => {
  // Continuous natural run: real first quest, corruption, boar hunt, graveyard,
  // then a fresh real Save/Load proving the unique Morrow encounter persists.
  test.setTimeout(700_000);
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
  // This item was genuinely looted from a defeated enemy, not purchased or
  // placed into the test via GameBridge. Preserve its canonical identity.
  const lootedItemId = await bag.first().getAttribute('data-item-id');
  expect(lootedItemId).toBeTruthy();
  await bag.first().click();
  const equip = inventory.getByRole('button', { name: 'Equip', exact: true });
  await expect(equip).toBeEnabled();
  await equip.click();

  // Regression: a real acquired item must be able to leave and re-enter its
  // equipment socket. Confirm a true unequip + native HTML5 drag, preserving
  // identity rather than accepting just a visual highlight of a valid slot.
  // Select by stable ID instead of presentation label or arbitrary item icon.
  const slotWithLoot = inventory.locator('.equipment-slot[data-item-id="' + lootedItemId + '"]');
  await expect(slotWithLoot).toHaveCount(1);
  const slotName = await slotWithLoot.getAttribute('data-equipment-slot');
  expect(slotName).toBeTruthy();
  await slotWithLoot.click();
  await inventory.getByTestId('item-inspector')
    .getByRole('button', { name: 'Unequip', exact: true }).click();
  const returnedLoot = inventory.locator('.bag-slot[data-item-id="' + lootedItemId + '"]');
  await expect(returnedLoot).toHaveCount(1);
  const gearDestination = inventory.locator('[data-equipment-slot="' + slotName + '"]');
  await expect(gearDestination).not.toHaveClass(/has-item/);
  await returnedLoot.dragTo(gearDestination);
  await expect(gearDestination).toHaveAttribute('data-item-id', lootedItemId!);
  await expect(returnedLoot).toHaveCount(0);
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
  await walkToCorruptionSite(page, 110_000);
  await expect(page.locator('.quest-journal')).toContainText('The Blighted Pack');
  await expect(page.locator('.quest-journal')).toContainText('Defeat three corrupted boars');
  await expect(game).toHaveAttribute('data-zone', 'wilderness');
  // The journey may legitimately discover optional POIs on the travelled
  // path; only the unexplored region's secrets must remain hidden.

  // A real enemy kill, not crossing a marker, advances this hunt. Finish the
  // existing pack through the same visible combat roster. Once the last
  // enemy falls the simulation spawns its actual three-corrupted-boar wave.
  // The objective cannot advance from ordinary skeleton/wolf/wraith kills.
  await expect(page.locator('.quest-journal')).toContainText('0/3');
  await keepFighting(page, 3, 105_000, 'The Forgotten Graves');
  await expect(page.locator('.quest-journal')).toContainText('Forgotten Graves');
  await expect(page.locator('.quest-journal')).toContainText('graveyard');
  await expect(page.locator('.quest-journal')).not.toContainText('The Blighted Pack');
  await expect(game).toHaveAttribute('data-zone', 'wilderness');

  // A completed story-hunt reward must be committed with the new quest.
  // Reload via the ordinary Save/Load controls, not a restored fixture,
  // and ensure the unlocked objective, stats and looted gear ID persist.
  const afterHuntHud = await page.locator('.hud-details span').allTextContents();
  const afterHuntProgress = await guide.getByTestId('onboarding-xp').innerText();
  const afterHuntObjective = await journalProgress.allTextContents();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText('Hero saved');
  await page.reload();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.quest-journal')).toContainText('Forgotten Graves');
  await expect(page.locator('.quest-journal')).not.toContainText('The Blighted Pack');
  await expect(journalProgress).toHaveText(afterHuntObjective);
  await expect(page.locator('.hud-details span')).toHaveText(afterHuntHud);
  await expect(guide.getByTestId('onboarding-xp')).toHaveText(afterHuntProgress);
  await page.locator('[data-quick-action="inventory"]').click();
  await expect(inventory.locator('.equipment-slot[data-item-id="' + lootedItemId + '"]'))
    .toHaveCount(1);
  await inventory.locator('.close-button').click();
  await expect(game).toHaveAttribute('data-zone', 'wilderness');

  // The next story objective is a location discovery, not an enemy kill:
  // Morrow must not already exist before the real graveyard is found.
  const morrow = page.locator('.enemy-roster button')
    .filter({ hasText: 'Morrow, Graveyard Warden' });
  await expect(morrow).toHaveCount(0);
  await expect(page.locator('.quest-journal')).toContainText('Discover the abandoned graveyard');
  await walkToAbandonedGraveyard(page, 130_000);
  await expect(page.locator('.quest-journal')).toContainText('Morrow, Gravebound');
  await expect(page.locator('.quest-journal')).toContainText('Defeat Morrow at the graveyard');
  await expect(page.locator('.quest-journal')).not.toContainText('The Forgotten Graves');
  await expect(morrow).toHaveCount(1, { timeout: 15_000 });
  await expect(morrow).toHaveAttribute('data-threat', 'boss');
  await expect(morrow).toBeEnabled();

  // Recreate the transient world from the character-only save. The real
  // previously discovered story location must remain completed, the next
  // boss quest active, and the unique actor must respawn exactly once.
  const afterGravesHud = await page.locator('.hud-details span').allTextContents();
  const afterGravesProgress = await guide.getByTestId('onboarding-xp').innerText();
  const afterGravesObjective = await journalProgress.allTextContents();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText('Hero saved');
  await page.reload();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(game).toHaveAttribute('data-zone', 'wilderness');
  await expect(page.locator('.quest-journal')).toContainText('Morrow, Gravebound');
  await expect(page.locator('.quest-journal')).not.toContainText('The Forgotten Graves');
  await expect(journalProgress).toHaveText(afterGravesObjective);
  await expect(page.locator('.hud-details span')).toHaveText(afterGravesHud);
  await expect(guide.getByTestId('onboarding-xp')).toHaveText(afterGravesProgress);
  await expect(morrow).toHaveCount(1, { timeout: 15_000 });
  await expect(morrow).toHaveAttribute('data-threat', 'boss');
  await page.locator('[data-quick-action="inventory"]').click();
  await expect(inventory.locator('.equipment-slot[data-item-id="' + lootedItemId + '"]'))
    .toHaveCount(1);
  await inventory.locator('.close-button').click();

  // A genuine boss kill, not the earlier discovery or a mere target click,
  // must unlock the next authoritative story beat. Morrow has a real
  // two-phase miniboss plan and cannot be marked slain from UI test state.
  await expect(page.locator('.quest-journal'))
    .toContainText('Defeat Morrow at the graveyard');
  await expect(morrow).toBeEnabled();
  await defeatMorrowNaturally(page, 150_000);
  await expect(page.locator('.quest-journal')).toContainText('The Seal of Rot');
  await expect(page.locator('.quest-journal'))
    .toContainText('Recover evidence leading to the crypt');
  await expect(page.locator('.quest-journal')).not.toContainText('Morrow, Gravebound');
  await expect(morrow).not.toBeEnabled();

  // Reload the genuine character after the unique miniboss reward. A
  // completed boss may never respawn or award its one-time reward again.
  const afterMorrowHud = await page.locator('.hud-details span').allTextContents();
  const afterMorrowXp = await guide.getByTestId('onboarding-xp').innerText();
  const afterMorrowJournal = await journalProgress.allTextContents();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText('Hero saved');
  await page.reload();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(game).toHaveAttribute('data-zone', 'wilderness');
  await expect(page.locator('.quest-journal')).toContainText('The Seal of Rot');
  await expect(page.locator('.quest-journal')).not.toContainText('Morrow, Gravebound');
  await expect(journalProgress).toHaveText(afterMorrowJournal);
  await expect(page.locator('.hud-details span')).toHaveText(afterMorrowHud);
  await expect(guide.getByTestId('onboarding-xp')).toHaveText(afterMorrowXp);
  await expect(morrow).toHaveCount(0);
  await page.locator('[data-quick-action="inventory"]').click();
  await expect(inventory.locator('.equipment-slot[data-item-id="' + lootedItemId + '"]'))
    .toHaveCount(1);
  await inventory.locator('.close-button').click();
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
