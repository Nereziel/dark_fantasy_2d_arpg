import { openCharacterCreation, enterWorld } from './character-menu';
import { test, expect } from '@playwright/test';

/** Chromium can emulate the observable AltGr/AltGraph event flags,
 * but cannot certify physical keyboard behavior on Windows/Linux/macOS.
 */
test('AltGr is ignored during Controls capture, and valid chords work afterward', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls' }).click();

  const panel = page.getByRole('dialog', { name: 'Input bindings' });
  const map = panel.locator('.binding-row').filter({ hasText: 'Map' });
  await map.getByRole('button', { name: 'Change' }).click();
  await expect(panel.locator('.capture-hint')).toBeVisible();

  await page.evaluate(() => {
    function send(type: 'keydown' | 'keyup', code: string, key: string,
      ctrlKey: boolean, altKey: boolean) {
      window.dispatchEvent(new KeyboardEvent(type, {
        bubbles: true, cancelable: true, code, key, ctrlKey, altKey
      }));
    }
    // Representative AltGr sequence: browsers can expose Right Alt with both
    // Control and Alt set, then deliver a printable symbol.
    send('keydown', 'AltRight', 'AltGraph', true, true);
    send('keydown', 'KeyE', '€', true, true);
    send('keyup', 'KeyE', '€', true, true);
    send('keyup', 'AltRight', 'AltGraph', false, false);
  });

  await expect(panel.locator('.capture-hint')).toBeVisible();
  await expect(map.locator('code')).toHaveText('KeyM');
  await page.keyboard.press('Control+m');
  await expect(map.locator('code')).toHaveText('Ctrl+M');
  await expect(panel.locator('.capture-hint')).toHaveCount(0);
});

test('AltGr key events cannot activate rebound standalone AltRight hold', async ({ page }) => {
  await page.goto('./?view=iso');
  await page.evaluate(() => {
    localStorage.setItem('aether-ruin-controls-v1', JSON.stringify([
      { action: 'HOLD_POSITION', device: 'keyboard', code: 'AltRight' }
    ]));
  });
  await page.reload();
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  const game = page.locator('.game-screen');
  await expect(game).toHaveAttribute('data-hold-position', 'false');
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, code: 'AltRight', key: 'AltGraph',
      ctrlKey: true, altKey: true
    }));
    window.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, code: 'KeyE', key: '€',
      ctrlKey: true, altKey: true
    }));
  });
  await expect(game).toHaveAttribute('data-hold-position', 'false');
});
