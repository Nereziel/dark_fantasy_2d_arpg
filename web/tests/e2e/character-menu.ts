import type { Page, Locator } from '@playwright/test';

/** Use the real character creation workflow, including a valid name. */
export async function openCharacterCreation(page: Page, name = 'Test hero') {
  await page.getByTestId('new-character').click({ timeout: 10_000 });
  await page.getByTestId('character-name').fill(name, { timeout: 10_000 });
}

/** Menu continues a selected character; the pause dialog still has explicit Load. */
export function loadCharacterControl(page: Page) {
  return page.getByTestId('continue-character').or(page.getByRole('button', { name: /^(Load|Načíst)$/ }));
}

type Gesture = 'click' | 'tap';

async function activateAndWait(page: Page, button: Locator, gesture: Gesture) {
  await button[gesture]({ timeout: 10_000 });
  // Creating/continuing can await IndexedDB. A successful click is not proof
  // that gameplay has mounted; never send Escape/skills to the old menu.
  await page.locator('.main-menu').waitFor({ state: 'hidden', timeout: 15_000 });
  await page.locator('.game-screen').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('canvas[data-renderer="isometric-preview"]').waitFor({ state: 'visible', timeout: 15_000 });
}

export async function enterWorld(page: Page, gesture: Gesture = 'click') {
  await activateAndWait(page, page.getByRole('button', {
    name: /^(Enter the world|Vstoupit do světa)$/
  }), gesture);
}

export async function continueGame(page: Page, gesture: Gesture = 'click') {
  await activateAndWait(page, loadCharacterControl(page), gesture);
  // In-game Load (pause dialog) uses the same control helper.
  await page.getByRole('dialog', { name: /^(Paused|Pozastaveno)$/ }).waitFor({
    state: 'hidden', timeout: 15_000
  });
}
