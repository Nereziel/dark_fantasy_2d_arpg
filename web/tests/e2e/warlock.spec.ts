import { openCharacterCreation, enterWorld, continueGame } from './character-menu';
import {test,expect} from '@playwright/test';

test('Warlock exposes seven abilities, summons a real demon, and reloads without transient allies',async({page})=>{
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await page.getByRole('button',{name:/Warlock/}).click();
  await enterWorld(page);
  const skills=page.locator('[data-warlock-ability]');
  await expect(skills).toHaveCount(5);
  await expect(page.locator('.skill-button')).toHaveCount(7);
  await expect(page.getByTestId('warlock-demons')).toContainText('Demons: 0/3');
  await page.locator('[data-warlock-ability="demonSummoning"]').click();
  await expect(page.getByTestId('warlock-demons')).toContainText('Demons: 1/3');
  await expect(page.locator('[data-warlock-ability="demonSummoning"]')).toBeDisabled();
  await page.locator('#game-language').selectOption('cs');
  await expect(page.getByTestId('warlock-demons')).toContainText('Démoni: 1/3');
  await page.getByRole('button',{name:'Uložit'}).click();
  await page.reload();
  await continueGame(page);
  await expect(page.getByTestId('warlock-demons')).toContainText('Démoni: 0/3');
});
