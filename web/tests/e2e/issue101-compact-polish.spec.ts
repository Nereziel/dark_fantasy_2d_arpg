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
  await shield.scrollIntoViewIfNeeded();
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
  await expect.poll(async()=>Number(await page.locator('canvas[data-renderer="isometric-preview"]').getAttribute('data-world-labels'))).toBeGreaterThan(0);
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

test('passive HUD surfaces hit the canvas, quest journal collapses, help stays in menu',async({page})=>{
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await enterWorld(page);
  await expect(page.getByTestId('onboarding-guide')).toHaveCount(0);
  const journal=page.locator('.quest-journal');
  const toggle=page.getByTestId('quest-collapse');
  await expect(toggle).toHaveAttribute('aria-expanded','true');
  const before=await journal.boundingBox();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  await expect(journal.locator('#quest-journal-body')).toHaveCount(0);
  const after=await journal.boundingBox();
  expect(after!.height).toBeLessThan(before!.height);
  await toggle.click();
  await expect(journal.locator('#quest-journal-body')).toBeVisible();
  for(const selector of ['[data-minimap="active"] .map-canvas',' .quest-journal .quest-progress']){
    const node=page.locator(selector).first();
    await expect(node).toBeVisible();
    expect(await node.evaluate(el=>{
      const b=el.getBoundingClientRect();
      return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.tagName;
    })).toBe('CANVAS');
  }
  await page.keyboard.press('m');
  await expect(page.getByTestId('world-map-dialog')).toBeVisible();
  await page.keyboard.press('m');
  await expect(page.getByTestId('world-map-dialog')).toHaveCount(0);
  await page.getByTestId('system-menu').click();
  await page.getByTestId('pause-guide').click();
  await expect(page.getByTestId('onboarding-guide')).toBeVisible();
  await page.getByTestId('close-guide').click();
  await expect(page.getByTestId('onboarding-guide')).toHaveCount(0);
});

test.describe('passive minimap touch',()=>{
  test.use({hasTouch:true,viewport:{width:390,height:740}});
  test('single tap passes through; a completed double tap opens full map',async({page})=>{
    await page.goto('./');
    await page.locator('#menu-language').selectOption('en');
    await openCharacterCreation(page);
    await enterWorld(page);
    const mini=page.locator('[data-minimap="active"] .map-canvas');
    await expect(mini).toBeVisible();
    const b=await mini.boundingBox();
    expect(b).not.toBeNull();
    const x=b!.x+b!.width/2,y=b!.y+b!.height/2;
    expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,{x,y})).toBe('CANVAS');
    await page.touchscreen.tap(x,y);
    await expect(page.getByTestId('world-map-dialog')).toHaveCount(0);
    await expect(page.locator('.game-screen [aria-modal="true"]')).toHaveCount(0);
    // Separate the first single tap from the following double gesture.
    await page.waitForTimeout(500);
    await page.touchscreen.tap(x,y);
    await page.touchscreen.tap(x,y);
    await expect(page.getByTestId('world-map-dialog')).toBeVisible();
    await page.getByTestId('map-close').tap();
    await expect(page.getByTestId('world-map-dialog')).toHaveCount(0);
  });
});
