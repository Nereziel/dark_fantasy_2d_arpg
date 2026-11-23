import { test, expect } from '@playwright/test';

test('switches Czech/English in the menu and game without losing the scene', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Aether & Ruin' })).toBeVisible();

  await page.locator('#menu-language').selectOption('cs');
  await expect(page.getByRole('button', { name: 'Vstoupit do světa' })).toBeVisible();

  await page.getByRole('button', { name: 'Vstoupit do světa' }).click();
  await expect(page.locator('.game-hud')).toBeVisible();
  await expect(page.locator('.phaser-container canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Poražení nepřátelé')).toBeVisible();
  await expect(page.locator('.enemy-roster')).toContainText('Přízrak');

  await page.locator('#game-language').selectOption('en');
  await expect(page.getByText('Enemies defeated')).toBeVisible();
  await expect(page.locator('.enemy-roster')).toContainText('Wraith');
  // The overworld can add deterministic optional enemies; roster cardinality is not fixed.
  const roster = page.locator('.enemy-roster button');
  await expect(roster.nth(2)).toBeVisible();
  const rosterCount = await roster.count();
  expect(rosterCount).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.enemy-roster-title')).toContainText(`${rosterCount}/${rosterCount}`);
  const skeleton = page.locator('.enemy-roster button').filter({ hasText: 'Skeleton Warrior' });
  await skeleton.click();
  await expect(skeleton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.enemy-roster button.targeted')).toContainText('Skeleton Warrior');
  await expect(page.locator('.game-hud')).toBeVisible();

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await page.reload();
  await expect(page.locator('#menu-language')).toHaveValue('en');
});

test('creates a Rogue, opens localized inventory, saves and reloads its class', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  const rogue = page.getByRole('button', { name: /Rogue/ });
  await expect(rogue).toBeVisible();
  await rogue.click();
  await expect(rogue).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await expect(page.getByText('Rogue · Level 1')).toBeVisible();
  await page.getByRole('button', { name: 'Inventory (I)' }).click();
  await expect(page.getByRole('dialog', { name: 'Inventory & Equipment' })).toBeVisible();
  await expect(page.getByText('Helmet')).toBeVisible();
  await page.locator('#game-language').selectOption('cs');
  await expect(page.getByRole('dialog', { name: 'Inventář a výbava' })).toBeVisible();
  await page.getByRole('button', { name: 'Zavřít' }).click();
  await page.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.getByRole('status')).toContainText('Postava uložena');
  await page.reload();
  await expect(page.locator('#menu-language')).toHaveValue('cs');
  await page.getByRole('button', { name: 'Načíst' }).click();
  await expect(page.getByText('Tulák · Úroveň 1')).toBeVisible();
});

test('casts a Paladin ability and localizes effects without restarting the game', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: /Paladin/ }).click();
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const skill = page.getByRole('button', { name: 'Consecration' });
  await expect(skill).toBeEnabled();
  await skill.click();
  await expect(skill).toBeDisabled();
  await expect(page.locator('.effect-chip.beneficial').filter({ hasText: 'Consecration' })).toHaveCount(1);
  await page.locator('#game-language').selectOption('cs');
  await expect(page.getByRole('button', { name: 'Posvěcená půda' })).toBeDisabled();
  await expect(page.locator('.effect-chip.beneficial').filter({ hasText: 'Posvěcení' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.getByRole('status')).toContainText('Postava uložena');
  await page.reload();
  await page.getByRole('button', { name: 'Načíst' }).click();
  await expect(page.getByText('Paladin · Úroveň 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Posvěcená půda' })).toBeEnabled();
  await expect(page.locator('.effect-chip.beneficial')).toHaveCount(0);
  // Seeded optional encounters can add an extra hostile actor to the initial pack.
  await expect(page.locator('.enemy-roster-title')).toContainText(new RegExp('[34]/[34]'));
});

test('retains character-only save v11 and resumes separate seed-scoped world record', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: /Rogue/ }).click();
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await expect(page.locator('.zone-name')).toHaveText('Emberwatch Camp');
  const firstSeed = await page.locator('.game-screen').getAttribute('data-world-seed');
  expect(firstSeed).not.toBeNull();
  // New character creation triggers a real IndexedDB autosave, no manual button.
  await expect.poll(async () => page.evaluate(async () => {
    return await new Promise<number | null>((resolve) => {
      const open = indexedDB.open('aether-ruin-web', 1);
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        const db = open.result;
        const get = db.transaction('saves', 'readonly')
          .objectStore('saves').get('first-character');
        get.onerror = () => { db.close(); resolve(null); };
        get.onsuccess = () => {
          const record = get.result as {
            format?: number; character?: {
              classId?: string; stash?: unknown[];
              questLedger?: { quests?: unknown[] };
            }
          } | undefined;
          db.close();
          resolve(record?.format === 11 && record.character?.classId === 'ROGUE'
            && record.character.stash?.length === 24
            && record.character.questLedger?.quests?.length === 9 ? 11 : null);
        };
      };
    });
  })).toBe(11);

  await page.reload();
  await page.getByRole('button', { name: 'Load' }).click();
  await expect(page.getByText('Rogue · Level 1')).toBeVisible();
  await expect(page.locator('.zone-name')).toHaveText('Emberwatch Camp');
  const secondSeed = await page.locator('.game-screen').getAttribute('data-world-seed');
  // Wave F world-instance store retains the seed for discovered map and opened chests.
  // The persistent hero record remains strictly character-only format 11.
  expect(secondSeed).toBe(firstSeed);
  await expect(page.locator('.enemy-roster-title')).toContainText('3/3');
  await expect(page.locator('.effect-chip')).toHaveCount(0);
});

test('talks to Warden Vesna, accepts the quest and loads its persistent progress', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const journal = page.locator('.quest-journal');
  await expect(journal).toContainText('Ashes at the Gate');
  await expect(journal).toContainText('Warden Vesna has a task');
  await page.getByRole('button', { name: 'Speak to the warden' }).click();
  const dialog = page.getByRole('dialog', { name: 'Warden Vesna' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Our last patrol vanished');
  // Wave D: real branching dialogue is evaluated from current quest progress.
  await dialog.getByRole('button', { name: 'Ask about the source of corruption' }).click();
  await expect(dialog).toContainText('Dust and dark whispers');
  await dialog.getByRole('button', { name: 'Back to the quest' }).click();
  await dialog.getByRole('button', { name: 'Accept quest' }).click();
  await expect(dialog).toContainText('0/3');
  await dialog.getByRole('button', { name: 'Leave' }).click();
  await expect(journal).toContainText('0/3');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await page.reload();
  await page.getByRole('button', { name: 'Load' }).click();
  await expect(journal).toContainText('0/3');
  await expect(journal).toContainText('Ashes at the Gate');
  await page.getByRole('button', { name: 'Speak to the warden' }).click();
  await expect(dialog).toContainText('The fire still protects us');
  await expect(dialog.getByRole('button', { name: 'Accept quest' })).toHaveCount(0);
  await page.locator('#game-language').selectOption('cs');
  await expect(page.getByRole('dialog', { name: 'Strážkyně Vesna' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Strážkyně Vesna' })).toContainText('Popel u bran');
});

test('buys equipment, tempers it at the smith and reloads persistent upgrades', async ({ page }) => {
  // Buying, tempering, two service visits and real Save/Load all happen in one
  // acceptance flow; permit this scenario realistic time under concurrent CI.
  test.setTimeout(60_000);
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.getByRole('button', { name: 'Browse wares' }).click();

  const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
  await expect(merchant).toBeVisible();
  await expect(merchant.locator('.trade-gold')).toContainText('75');
  await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).click();
  await expect(merchant.locator('.trade-gold')).toContainText('43');
  await expect(merchant.getByRole('button', { name: 'Sell Studded War Belt' })).toBeVisible();
  await merchant.getByRole('button', { name: 'Leave' }).click();

  await page.getByRole('button', { name: 'Inventory (I)' }).click();
  const inventory = page.getByRole('dialog', { name: 'Inventory & Equipment' });
  await expect(inventory).toContainText('Studded War Belt');
  await inventory.getByRole('button', { name: 'Equip' }).click();
  await inventory.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Visit blacksmith' }).click();
  const smith = page.getByRole('dialog', { name: 'Blacksmith Odan' });
  await expect(smith).toBeVisible();
  await smith.getByRole('button', { name: 'Temper Studded War Belt' }).click();
  await expect(smith.locator('.trade-gold')).toContainText('15');
  await expect(smith).toContainText('Upgrades 1/3');
  await expect(smith.getByRole('button', { name: 'Temper Studded War Belt' })).toBeDisabled();
  await smith.getByRole('button', { name: 'Leave' }).click();

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await page.reload();
  await page.getByRole('button', { name: 'Load' }).click();
  await page.getByRole('button', { name: 'Visit blacksmith' }).click();
  const loadedSmith = page.getByRole('dialog', { name: 'Blacksmith Odan' });
  await expect(loadedSmith).toContainText('Upgrades 1/3');
  await expect(loadedSmith.locator('.trade-gold')).toContainText('15');
  await loadedSmith.getByRole('button', { name: 'Leave' }).click();

  await page.getByRole('button', { name: 'Inventory (I)' }).click();
  // New heroes have starter gear; target the purchased belt, not the first item.
  await page.getByRole('dialog', { name: 'Inventory & Equipment' }).locator('[data-equipment-slot="BELT"]').click();
  await page.getByRole('dialog', { name: 'Inventory & Equipment' }).getByRole('button', { name: 'Unequip' }).click();
  await page.getByRole('dialog', { name: 'Inventory & Equipment' }).getByRole('button', { name: 'Close' }).click();
  // Confirm the modal was removed before clicking the exposed world merchant;
  // a lingering overlay must not consume or block the next real UI action.
  await expect(page.getByRole('dialog', { name: 'Inventory & Equipment' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Browse wares' }).click();
  const merchantAgain = page.getByRole('dialog', { name: 'Merchant Bram' });
  await merchantAgain.getByRole('button', { name: 'Sell Studded War Belt' }).click();
  await expect(merchantAgain.locator('.trade-gold')).toContainText('35');
  await expect(merchantAgain.getByRole('button', { name: 'Sell Studded War Belt' })).toHaveCount(0);
});

test('enters a separate procedurally generated crypt, returns to camp and reloads outdoors', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await expect(page.locator('.game-screen')).toHaveAttribute('data-zone', 'wilderness');
  const seed = await page.locator('.game-screen').getAttribute('data-world-seed');
  await expect(page.getByRole('button', { name: 'Enter the crypt' })).toBeEnabled();
  await page.getByRole('button', { name: 'Enter the crypt' }).click();
  await expect(page.locator('.game-screen')).toHaveAttribute('data-zone', 'crypt', { timeout: 20_000 });
  await expect(page.locator('.zone-name')).toHaveText('Crypt of the Hollow Crown');
  await expect(page.getByText('Crypt guardians')).toBeVisible();
  await expect(page.locator('.enemy-roster button')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Browse wares' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Speak to the warden' })).toBeDisabled();
  await expect(page.locator('.game-screen')).toHaveAttribute('data-world-seed', seed!);

  await page.getByRole('button', { name: 'Return to camp' }).click();
  await expect(page.locator('.game-screen')).toHaveAttribute('data-zone', 'wilderness');
  await expect(page.locator('.zone-name')).toHaveText('Emberwatch Camp');
  await expect(page.getByRole('button', { name: 'Browse wares' })).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await page.reload();
  await page.getByRole('button', { name: 'Load' }).click();
  await expect(page.locator('.game-screen')).toHaveAttribute('data-zone', 'wilderness');
  await expect(page.locator('.enemy-roster-title')).toContainText('3/3');
});

test('opens the derived character sheet, switches locales live, and closes with C or Escape', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.getByRole('button', { name: 'Character (C)' }).click();
  const english = page.getByRole('dialog', { name: 'Character and Attributes' });
  await expect(english).toBeVisible();
  await expect(english).toContainText('Primary attributes');
  await expect(english).toContainText('Offense');
  await expect(english).toContainText('Fire resistance');
  await expect(english).toContainText('Maximum health');
  await expect(english).toContainText('Strength');
  await page.locator('#game-language').selectOption('cs');
  const czech = page.getByRole('dialog', { name: 'Postava a atributy' });
  await expect(czech).toBeVisible();
  await expect(czech).toContainText('Odolnost proti ohni');
  await expect(czech).toContainText('Maximální životy');
  await page.keyboard.press('Escape');
  await expect(czech).toHaveCount(0);
  await page.keyboard.press('c');
  await expect(page.getByRole('dialog', { name: 'Postava a atributy' })).toBeVisible();
  await page.keyboard.press('c');
  await expect(page.getByRole('dialog', { name: 'Postava a atributy' })).toHaveCount(0);
  await expect(page.locator('.game-hud')).toBeVisible();
});

test('new input mappings evade on Space and toggle pause on Escape', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const game = page.locator('.game-screen');
  const beforeEvade = await game.evaluate(element => ({
    x: Number(element.getAttribute('data-player-x')),
    y: Number(element.getAttribute('data-player-y'))
  }));
  await page.keyboard.press('Space');
  // Evade intentionally moves AWAY from the nearest enemy, which can be on
  // either side of the hero for procedurally seeded wilderness layouts.
  // Test authoritative displacement, not a hardcoded +X direction.
  await expect.poll(async () => {
    const after = await game.evaluate(element => ({
      x: Number(element.getAttribute('data-player-x')),
      y: Number(element.getAttribute('data-player-y'))
    }));
    return Math.hypot(after.x - beforeEvade.x, after.y - beforeEvade.y);
  }).toBeGreaterThan(50);
  const afterEvade = await game.evaluate(element => ({
    x: Number(element.getAttribute('data-player-x')),
    y: Number(element.getAttribute('data-player-y'))
  }));
  await page.keyboard.press('Space');
  await expect.poll(async () => game.evaluate(element => ({
    x: Number(element.getAttribute('data-player-x')),
    y: Number(element.getAttribute('data-player-y'))
  }))).toEqual(afterEvade);
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-shield')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-shield')).toHaveCount(0);
  await page.keyboard.press('c');
  await expect(page.getByRole('dialog', { name: 'Character and Attributes' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Character and Attributes' })).toHaveCount(0);
});

test('rebinds inventory from I to O in the controls panel and reloads this preference', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls' }).click();
  const controls = page.getByRole('dialog', { name: 'Input bindings' });
  await expect(controls).toBeVisible();
  const inventory = controls.locator('.binding-row').filter({ hasText: 'Inventory' });
  await inventory.getByRole('button', { name: 'Change' }).click();
  await page.keyboard.press('o');
  await expect(inventory.locator('code')).toHaveText('KeyO');
  await controls.getByRole('button', { name: 'Back' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('o');
  await expect(page.getByRole('dialog', { name: 'Inventory & Equipment' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await page.keyboard.press('o');
  await expect(page.getByRole('dialog', { name: 'Inventory & Equipment' })).toBeVisible();
});

test('holding mouse movement updates the destination without creating combat commands', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const canvas = page.locator('.phaser-container canvas');
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const game = page.locator('.game-screen');
  const before = Number(await game.getAttribute('data-player-x'));
  await page.mouse.move(bounds!.x + bounds!.width * 0.61, bounds!.y + bounds!.height * 0.40);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * 0.77, bounds!.y + bounds!.height * 0.40, { steps: 8 });
  await expect.poll(async () => Number(await game.getAttribute('data-player-x')), { timeout: 5_000 })
    .toBeGreaterThan(before + 12);
  await page.mouse.up();
});

test('Warrior War Cry uses the simulation timeline and localizes active buffs', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const cry = page.getByRole('button', { name: 'War Cry' });
  await expect(cry).toBeVisible();
  await expect(cry).toBeEnabled();
  await cry.click();
  await expect(cry).toBeDisabled();
  await expect(page.locator('.effect-chip.beneficial').filter({ hasText: 'Haste' })).toBeVisible();
  await expect(page.locator('.effect-chip.beneficial').filter({ hasText: 'Fortified' })).toBeVisible();
  await page.locator('#game-language').selectOption('cs');
  await expect(page.getByRole('button', { name: 'Válečný pokřik' })).toBeDisabled();
  await expect(page.locator('.effect-chip.beneficial').filter({ hasText: 'Spěch' })).toBeVisible();
});

test('stores a purchased item in the permanent camp stash and retrieves it after reloading', async ({ page }) => {
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();

  await page.getByRole('button', { name: 'Browse wares' }).click();
  const merchant = page.getByRole('dialog', { name: 'Merchant Bram' });
  await merchant.getByRole('button', { name: 'Buy Studded War Belt' }).click();
  await expect(merchant.locator('.trade-gold')).toContainText('43');
  await merchant.getByRole('button', { name: 'Leave' }).click();

  await page.getByRole('button', { name: 'Open stash' }).click();
  const stash = page.getByRole('dialog', { name: 'Camp Stash' });
  await expect(stash).toBeVisible();
  await expect(stash).toContainText('Backpack (1/24)');
  await stash.getByRole('button', { name: 'Store' }).click();
  await expect(stash).toContainText('Stash (1/24)');
  await expect(stash).toContainText('Backpack (0/24)');
  await stash.getByRole('button', { name: 'Leave' }).click();

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await page.reload();
  await page.getByRole('button', { name: 'Load' }).click();
  await page.getByRole('button', { name: 'Open stash' }).click();
  const recovered = page.getByRole('dialog', { name: 'Camp Stash' });
  await expect(recovered).toContainText('Stash (1/24)');
  await expect(recovered).toContainText('Studded War Belt');
  await recovered.getByRole('button', { name: 'Retrieve' }).click();
  await expect(recovered).toContainText('Stash (0/24)');
  await expect(recovered).toContainText('Backpack (1/24)');
});

test('re-entering the game releases destroyed scene event listeners and keeps movement running', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button', { name: 'Enter the world' }).click();
  const canvas = page.locator('.phaser-container canvas');
  await expect(canvas).toBeVisible();

  // App reuses its GameBridge, but Svelte destroys and recreates the Phaser game.
  await page.getByRole('button', { name: 'Main menu' }).click();
  await expect(page.getByRole('button', { name: 'Enter the world' })).toBeVisible();
  await page.getByRole('button', { name: 'Enter the world' }).click();
  await expect(canvas).toBeVisible();

  // Potion VFX calls obtainImpact() via GameBridge.tick(). A stale listener
  // used to call this.add.graphics() on the destroyed scene and crash here.
  await page.locator('[data-potion-id="resistance"]').click();
  await page.keyboard.press('q');
  await expect(page.getByTestId('use-potion')).toContainText('0');

  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const screen = page.locator('.game-screen');
  const before = Number(await screen.getAttribute('data-player-x'));
  await page.mouse.move(bounds!.x + bounds!.width * 0.61, bounds!.y + bounds!.height * 0.40);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * 0.77, bounds!.y + bounds!.height * 0.40, { steps: 8 });
  await expect.poll(async () => Number(await screen.getAttribute('data-player-x')), { timeout: 5_000 })
    .toBeGreaterThan(before + 12);
  await page.mouse.up();
  expect(errors).toEqual([]);
});
