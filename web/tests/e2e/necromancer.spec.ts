import {test,expect} from '@playwright/test';

test('Necromancer summons real allies, shows corpse HUD and reloads character-only',async({page})=>{
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button',{name:/Necromancer/}).click();
  await page.getByRole('button',{name:'Enter the world'}).click();
  await expect(page.getByText('Necromancer · Level 1')).toBeVisible();
  const skills=page.locator('[data-necro-ability]');
  await expect(skills).toHaveCount(5);
  await expect(page.getByTestId('necromancer-minions')).toContainText('Minions: 0/5');
  await page.getByRole('button',{name:'Raise Skeleton'}).click();
  await expect(page.getByTestId('necromancer-minions')).toContainText('Minions: 1/5');
  const golem=page.locator('[data-necro-ability="summonGolem"]');
  await expect(golem).toBeEnabled();
  await golem.click();
  await expect(page.getByTestId('necromancer-minions')).toContainText('Minions: 2/5');
  await expect(golem).toBeDisabled();
  await page.locator('#game-language').selectOption('cs');
  await expect(page.getByTestId('necromancer-minions')).toContainText('Přisluhovači: 2/5');
  await page.getByRole('button',{name:'Uložit'}).click();
  await expect(page.getByRole('status')).toContainText('Postava uložena');
  await page.reload();
  await page.getByRole('button',{name:'Načíst'}).click();
  await expect(page.getByTestId('necromancer-minions')).toContainText('Přisluhovači: 0/5');
});
