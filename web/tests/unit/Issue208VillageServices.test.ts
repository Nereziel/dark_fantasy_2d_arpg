// GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';
import { villageTownEntries } from '../../src/game/world/villageDialogue';
import { ACTOR_RADIUS, canOccupy } from '../../src/game/world/navigation';
import { SHOP_OFFERS, createShopItem } from '../../src/game/trade/commerce';
import { quoteTempering } from '../../src/game/trade/economyRules';

function resident(role:'healer'|'blacksmith'){
  for(const seed of [0,1,123,0xffffffff,2,3,42,99]){
    const entry=villageTownEntries(buildWilderness(seed).villages).find(n=>n.role===role);
    if(entry)return {seed,entry};
  }
  throw Error('No populated village for '+role);
}
describe('Issue #208 B2: regional services',()=>{
  it('opens local healer dialogue and charges exactly once for actual healing',()=>{
    const {seed,entry}=resident('healer'),sim=new GameSimulation(seed);
    const snapshot=sim.snapshot();
    snapshot.player={...snapshot.player,...entry.position,health:Math.floor(snapshot.player.maxHealth/2)};
    snapshot.gold=100;
    expect(sim.restore(snapshot)).toBe(true);
    sim.drainEvents();
    sim.command({type:'interactTown',entryId:entry.id});
    expect(sim.drainEvents()).toContainEqual({type:'townInteraction',entryId:entry.id,role:'healer'});
    sim.command({type:'pause',value:true});
    sim.command({type:'useTownService',entryId:entry.id});
    expect(sim.snapshot().player.health).toBe(sim.snapshot().player.maxHealth);
    expect(sim.snapshot().gold).toBe(85);
    sim.command({type:'useTownService',entryId:entry.id});
    expect(sim.snapshot().gold).toBe(85);
  });
  it('allows the same atomic temper transaction at a real regional forge, but not at a distant player',()=>{
    const {seed,entry}=resident('blacksmith'),sim=new GameSimulation(seed);
    const offer=SHOP_OFFERS.find(o=>createShopItem(o,'preview').slot==='MAIN_HAND')!;
    expect(offer).toBeDefined();
    const funded=sim.snapshot();
    funded.gold=10000;
    expect(sim.restore(funded)).toBe(true);
    // Purchase through the original merchant and equip through the public command.
    sim.command({type:'buyItem',offerId:offer.id});
    const index=sim.snapshot().inventory.findIndex(item=>item?.templateId===offer.templateId);
    expect(index).toBeGreaterThanOrEqual(0);
    sim.command({type:'equip',index});
    const snapshot=sim.snapshot();
    const item=snapshot.equipment.MAIN_HAND!;
    expect(item).not.toBeNull();
    const quote=quoteTempering(item);
    expect(quote.ok).toBe(true);
    if(!quote.ok)throw Error('starter weapon cannot be tempered');
    snapshot.gold=10000;
    snapshot.player={...snapshot.player};
    // At camp the original smith is reachable, so choose a validated distant point.
    const layout=buildWilderness(seed).layout;
    const distant=[{x:100,y:100},{x:200,y:100},{x:100,y:200}].find(p=>canOccupy(p,ACTOR_RADIUS,layout.obstacles))!;
    expect(distant).toBeDefined();
    snapshot.player={...snapshot.player,...distant};
    expect(sim.restore(snapshot)).toBe(true);
    sim.command({type:'temperItem',slot:'MAIN_HAND'});
    expect(sim.snapshot().gold).toBe(10000);
    const near=sim.snapshot();
    near.player={...near.player,...entry.position};
    expect(sim.restore(near)).toBe(true);
    sim.command({type:'interactTown',entryId:entry.id});
    expect(sim.drainEvents()).toContainEqual({type:'townInteraction',entryId:entry.id,role:'blacksmith'});
    sim.command({type:'pause',value:true});
    sim.command({type:'temperItem',slot:'MAIN_HAND'});
    expect(sim.snapshot().gold).toBe(10000-quote.price);
    expect(sim.snapshot().equipment.MAIN_HAND?.id).toBe(item.id);
    expect(sim.snapshot().equipment.MAIN_HAND?.upgrades).toBe(item.upgrades+1);
  });
});
