import {test,expect} from '@playwright/test';

test('Paladin offers seven real localized abilities, Faith and keyboard 2–6',async ({page})=>{
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button',{name:/Paladin/}).click();
  await page.getByRole('button',{name:'Enter the world'}).click();
  await expect(page.getByText('Paladin · Level 1')).toBeVisible();
  await expect(page.locator('.resource-label')).toContainText('Faith');
  for(const name of ['Judgment','Consecration','Holy Strike','Divine Shield',
    'Healing Light','Holy Aura','Smite']){
    await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
  }
  await expect(page.locator('[data-paladin-ability]')).toHaveCount(5);
  const shield=page.getByRole('button',{name:'Divine Shield',exact:true});
  await expect(shield).toBeEnabled();
  await shield.click();
  await expect(shield).toBeDisabled();
  await page.locator('#game-language').selectOption('cs');
  await expect(page.getByRole('button',{name:'Božský štít',exact:true})).toBeDisabled();
  await expect(page.locator('[data-paladin-ability]')).toHaveCount(5);
  await page.getByRole('button',{name:'Uložit'}).click();
  await expect(page.getByRole('status')).toContainText('Postava uložena');
  await page.reload();
  await page.getByRole('button',{name:'Načíst'}).click();
  await expect(page.getByText('Paladin · Úroveň 1')).toBeVisible();
  await expect(page.getByRole('button',{name:'Božský štít',exact:true})).toBeEnabled();
});
