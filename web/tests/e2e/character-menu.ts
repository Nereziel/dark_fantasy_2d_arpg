import type { Page } from '@playwright/test';

/** Use the real character creation workflow, including a valid name. */
export async function openCharacterCreation(page: Page, name = 'Test hero') {
  await page.getByTestId('new-character').click();
  await page.getByTestId('character-name').fill(name);
}

/** Menu continues a selected character; the pause dialog still has explicit Load. */
export function loadCharacterControl(page: Page) {
  return page.getByTestId('continue-character').or(page.getByRole('button', { name: 'Load', exact: true }));
}
