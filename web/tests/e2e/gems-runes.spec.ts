import { test, expect } from '@playwright/test';

test('forges a Ruby from naturally salvaged material and persists the gem wallet', async ({page})=>{
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button',{name:'Enter the world'}).click();
  await page.getByRole('button',{name:'Browse wares'}).click();
  const merchant=page.getByRole('dialog',{name:'Merchant Bram'});
  await merchant.getByRole('button',{name:'Buy Studded War Belt'}).click();
  await merchant.getByRole('button',{name:'Leave'}).click();
  await page.getByRole('button',{name:'Visit blacksmith'}).click();
  const smith=page.getByRole('dialog',{name:'Blacksmith Odan'});
  await expect(smith).toContainText('Gems and Runes');
  await expect(smith.locator('[data-gem-base="gem.ruby"]').getByRole('button',{name:'Forge'})).toBeDisabled();
  const belt=smith.locator('[data-craft-id^="trade-belt-"]');
  await belt.getByRole('button',{name:/Salvage/}).click();
  await expect(smith.locator('[data-material="iron"]')).toHaveText('1');
  await smith.locator('[data-gem-base="gem.ruby"]').getByRole('button',{name:'Forge'}).click();
  await expect(smith.locator('[data-gem-id="gem.ruby.1"]')).toContainText('Ruby');
  await expect(smith.locator('[data-gem-id="gem.ruby.1"] strong')).toHaveText('1');
  await smith.getByRole('button',{name:'Leave'}).click();
  await page.getByRole('button',{name:'Save'}).click();
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await page.reload();
  await page.getByRole('button',{name:'Load'}).click();
  await page.getByRole('button',{name:'Visit blacksmith'}).click();
  await expect(page.getByRole('dialog',{name:'Blacksmith Odan'})
    .locator('[data-gem-id="gem.ruby.1"] strong')).toHaveText('1');
});

test('inserts gem into a real socket, saves the socket and extracts stone at the smith', async ({page})=>{
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await page.getByRole('button',{name:'Enter the world'}).click();
  await page.getByRole('button',{name:'Browse wares'}).click();
  await page.getByRole('dialog',{name:'Merchant Bram'})
    .getByRole('button',{name:'Buy Studded War Belt'}).click();
  await page.getByRole('dialog',{name:'Merchant Bram'})
    .getByRole('button',{name:'Leave'}).click();
  await page.getByRole('button',{name:'Save'}).click();
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await page.reload(); // Prevent the live autosaver overwriting this valid v11 fixture.
  // The existing item schema permits one belt socket. The fixture provides
  // a valid empty socket and one gem without inventing an external debug API.
  await page.evaluate(async ()=>{
    await new Promise<void>((resolve,reject)=>{
      const request=indexedDB.open('aether-ruin-web',1);
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result,tx=db.transaction('saves','readwrite');
        const store=tx.objectStore('saves');
        const get=store.get('first-character');
        get.onerror=()=>reject(get.error);
        get.onsuccess=()=>{
          const record=get.result as {format:number;character:{
            inventory:({templateId:string;sockets?:Array<string|null>}|null)[];
            gems?:Record<string,number>;gold:number
          }};
          if(record?.format!==11){reject(new Error('Expected valid v11 save'));return;}
          const belt=record.character.inventory.find(item=>item?.templateId==='belt');
          if(!belt){reject(new Error('Missing purchased belt'));return;}
          belt.sockets=[null];
          record.character.gems={'gem.ruby.1':1};
          record.character.gold=500;
          store.put(record,'first-character');
        };
        tx.oncomplete=()=>{db.close();resolve();};
        tx.onerror=()=>{db.close();reject(tx.error);};
        tx.onabort=()=>{db.close();reject(tx.error);};
      };
    });
  });
  await page.getByRole('button',{name:'Load'}).click();
  await page.getByRole('button',{name:'Visit blacksmith'}).click();
  let smith=page.getByRole('dialog',{name:'Blacksmith Odan'});
  let belt=smith.locator('[data-testid^="socket-item-trade-belt-"]');
  await expect(belt).toContainText('Empty');
  await belt.getByRole('button',{name:'Insert Ruby Tier 1'}).click();
  await expect(belt).toContainText('Ruby Tier 1');
  await expect(belt).toContainText('+3 fire resistance');
  await expect(smith.locator('[data-gem-id="gem.ruby.1"]')).toHaveCount(0);
  await smith.getByRole('button',{name:'Leave'}).click();
  await page.getByRole('button',{name:'Save'}).click();
  await expect(page.getByRole('status')).toContainText('Hero saved');
  await page.reload();
  await page.getByRole('button',{name:'Load'}).click();
  await page.getByRole('button',{name:'Visit blacksmith'}).click();
  smith=page.getByRole('dialog',{name:'Blacksmith Odan'});
  belt=smith.locator('[data-testid^="socket-item-trade-belt-"]');
  await expect(belt).toContainText('Ruby Tier 1');
  await belt.getByRole('button',{name:/Extract/}).click();
  await expect(belt).toContainText('Empty');
  await expect(smith.locator('[data-gem-id="gem.ruby.1"] strong')).toHaveText('1');
});
