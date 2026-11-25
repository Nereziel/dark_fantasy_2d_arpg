import { test, expect } from '@playwright/test';
import { openCharacterCreation, enterWorld } from './character-menu';

test('compact HUD exposes skill descriptions and hamburger commands without casting',async({page})=>{
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await page.locator('[data-class-id="PALADIN"]').click();
  await enterWorld(page);
  const dock=page.getByTestId('combat-dock');
  const shield=dock.locator('[data-paladin-ability="divineShield"]');
  await shield.hover();
  const hint=page.getByTestId('skill-hint');
  await expect(hint).toContainText('Divine Shield');
  await expect(hint).toContainText('Faith');
  await expect(shield).toBeEnabled();
  await dock.getByTestId('skill-info-mode').click();
  await shield.click();
  await expect(hint).toContainText('Divine Shield');
  await expect(shield).not.toHaveClass(/cooldown/);
  await page.keyboard.press('Escape');
  await expect(hint).toHaveCount(0);
  await shield.click();
  await expect(shield).toHaveClass(/cooldown/);
  await dock.getByTestId('system-menu').click();
  const menu=page.getByRole('dialog',{name:'Paused'});
  await expect(menu.getByRole('button',{name:'Save',exact:true})).toBeVisible();
  await expect(menu.getByRole('button',{name:'Load',exact:true})).toBeVisible();
  await expect(menu.getByRole('button',{name:'Display & accessibility'})).toBeVisible();
  await menu.getByRole('button',{name:'Resume'}).click();
  const toggle=dock.getByTestId('toggle-loot-labels');
  await expect(toggle).toHaveAttribute('aria-pressed','true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed','true');
});

test.describe('touch info mode',()=>{
  test.use({hasTouch:true,viewport:{width:390,height:740}});
  test('tap inspection remains separate from casting',async({page})=>{
    await page.goto('./');
    await page.locator('#menu-language').selectOption('cs');
    await openCharacterCreation(page);
    await page.locator('[data-class-id="PALADIN"]').click();
    await enterWorld(page);
    const dock=page.getByTestId('combat-dock');
    const skill=dock.locator('[data-paladin-ability="divineShield"]');
    await dock.getByTestId('skill-info-mode').tap();
    await skill.tap();
    await expect(page.getByTestId('skill-hint')).toContainText('Božský štít');
    await expect(skill).not.toHaveClass(/cooldown/);
    await dock.getByTestId('skill-info-mode').tap();
    await skill.tap();
    await expect(skill).toHaveClass(/cooldown/);
  });
});
