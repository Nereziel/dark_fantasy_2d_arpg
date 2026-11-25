import { openCharacterCreation, enterWorld, continueGame } from './character-menu';
import {test,expect} from '@playwright/test';

const names=['Warrior','Paladin','Mage','Necromancer','Rogue','Warlock'] as const;
for(const name of names){
  test('Prompt 44 creates and reloads '+name+' with a stable hero ID and starter gear',async({page})=>{
    await page.goto('./?view=iso');
    await page.locator('#menu-language').selectOption('en');
    await openCharacterCreation(page);
    await page.getByRole('button',{name:new RegExp('^'+name)}).click();
    const preview=page.getByTestId('class-preview');
    await expect(preview).toContainText(name);
    await expect(preview).toContainText('Starting equipment');
    await expect(preview).toContainText('Strengths');
    await enterWorld(page);
    await expect(page.locator('canvas[data-renderer="isometric-preview"]')).toBeVisible();
    await expect(page.locator('.hud-details')).toContainText(name+' · Level 1');
    const seed=await page.locator('.game-screen').getAttribute('data-world-seed');
    await expect.poll(async()=>page.evaluate(async()=>{
      return await new Promise<{
        format:number;id:string;characterId:string;worldId:string;
        classId:string;level:number;xp:number;equipped:number;seed:number;
      }|null>((resolve,reject)=>{
        const open=indexedDB.open('aether-ruin-web',1);
        open.onerror=()=>reject(open.error);
        open.onsuccess=()=>{
          const db=open.result,tx=db.transaction('saves','readonly');
          const character=tx.objectStore('saves').get('first-character');
          const world=tx.objectStore('saves').get('world:first-character');
          tx.oncomplete=()=>{
            db.close();
            const c=character.result,w=world.result;
            resolve(c&&w&&c.character?.characterId===w.characterId?{
              format:c.format,id:c.characterId,characterId:c.character?.characterId,
              worldId:w.characterId,classId:c.character?.classId,level:c.character?.level,
              xp:c.character?.xp,
              equipped:Object.values(c.character?.equipment??{}).filter(Boolean).length,
              seed:w.progress?.seed
            }:null);
          };
          tx.onerror=()=>{db.close();reject(tx.error);};
        };
      });
    })).toMatchObject({format:11,classId:name.toUpperCase(),level:1,xp:0});
    // Read the exact saved slot after the poll resolves.
    const record=await page.evaluate(async()=>{
      return await new Promise<{id:string;worldId:string;classId:string;equipped:number;seed:number}>((resolve,reject)=>{
        const o=indexedDB.open('aether-ruin-web',1);
        o.onerror=()=>reject(o.error);
        o.onsuccess=()=>{
          const db=o.result,t=db.transaction('saves','readonly');
          const c=t.objectStore('saves').get('first-character');
          const w=t.objectStore('saves').get('world:first-character');
          t.oncomplete=()=>{
            db.close();
            resolve({
              id:c.result.character.characterId,worldId:w.result.characterId,
              classId:c.result.character.classId,
              equipped:Object.values(c.result.character.equipment).filter(Boolean).length,
              seed:w.result.progress.seed
            });
          };
        };
      });
    });
    expect(record.id).toMatch(/^char-[0-9a-f]{32}$/);
    expect(record.worldId).toBe(record.id);
    expect(record.classId).toBe(name.toUpperCase());
    expect(record.equipped).toBeGreaterThan(0);
    expect(String(record.seed)).toBe(seed);
    await page.reload();
    await continueGame(page);
    await expect(page.locator('canvas[data-renderer="isometric-preview"]')).toBeVisible();
    await expect(page.locator('.hud-details')).toContainText(name+' · Level 1');
    await expect(page.locator('.game-screen')).toHaveAttribute('data-world-seed',seed!);
  });
}

test('Prompt 44 class selector is keyboard accessible and preserves descriptions on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:780});
  await page.goto('./?view=iso');
  await page.locator('#menu-language').selectOption('cs');
  await openCharacterCreation(page);
  const cards=page.locator('[data-class-id]');
  await expect(cards).toHaveCount(6);
  const warlock=page.locator('[data-class-id="WARLOCK"]');
  await warlock.focus();
  await page.keyboard.press('Enter');
  await expect(warlock).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('class-preview')).toContainText('Černokněžník');
  await expect(page.getByTestId('class-preview')).toContainText('Počáteční výbava');
  await expect(warlock.locator('.class-description')).toBeVisible();
});
