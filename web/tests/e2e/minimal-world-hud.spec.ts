import { test, expect } from '@playwright/test';
import { openCharacterCreation, enterWorld, openSystemMenu, toggleHotbarEditor } from './character-menu';

test('default HUD is minimal, settings show clear modes and editor is a separate modal',async({page})=>{
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page,'Minimal hero');
  await page.evaluate(()=>localStorage.removeItem('aether-ruin-world-hud-v2'));
  await enterWorld(page);
  await expect(page.locator('.enemy-roster,.camp-services,.dungeon-panel,.environment-panel')).toHaveCount(0);
  await expect(page.getByTestId('loot-label-mode')).toHaveCount(0);
  const dock=page.getByTestId('combat-dock');
  const bounds=await dock.evaluate(el=>['.health-meter','.skill-ui','.resource-meter','.hud-actions'].map(sel=>{
    const b=el.querySelector(sel)!.getBoundingClientRect();return {left:b.left,right:b.right};
  }));
  for(let i=1;i<bounds.length;i++)expect(bounds[i]!.left).toBeGreaterThanOrEqual(bounds[i-1]!.right-1);
  await openSystemMenu(page);
  await page.getByTestId('open-visual-settings').click();
  const mode=page.getByTestId('loot-label-mode');
  await expect(mode).toHaveValue('hover');
  await mode.selectOption('always');
  await expect(mode).toHaveValue('always');
  await page.getByTestId('visual-settings-close').click();
  await page.getByTestId('pause-edit-hotbar').click();
  const editor=page.getByTestId('skill-editor-dialog');
  await expect(editor).toBeVisible();
  await expect(dock.getByTestId('hotbar-editor')).toHaveCount(0);
  await expect(dock.locator('.skill-toolbar')).toBeVisible();
  await toggleHotbarEditor(page);
  await expect(editor).toHaveCount(0);
});
