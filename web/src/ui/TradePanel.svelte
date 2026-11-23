<script lang="ts">
  import { _ as t, locale } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import type { GameBridge } from '../game/bridge/GameBridge';
  import ItemArt from './ItemArt.svelte';
  import { itemDisplayName } from '../game/items/itemName';
  import { RARITIES, type Item } from '../game/data/items';
  import {
    SHOP_OFFERS, createShopItem, canTemper, temperItem
  } from '../game/trade/commerce';
  import { quotePurchase, quoteSale, quoteTempering } from '../game/trade/economyRules';
  import { MATERIAL_IDS, quoteCraft, type CraftKind } from '../game/crafting/craftingRules';
  import GemForgePanel from './GemForgePanel.svelte';
  import {
    MERCHANT_ID, BLACKSMITH_ID, type TradeNpcId
  } from '../game/world/npcs';

  let {
    view, bridge, npc, close
  }: {
    view: GameSnapshot;
    bridge: GameBridge;
    npc: TradeNpcId;
    close: () => void;
  } = $props();

  let bagFull = $derived(view.inventory.every(item => item !== null));
  function money(value: number): string {
    return new Intl.NumberFormat($locale === 'cs' ? 'cs-CZ' : 'en-US').format(value);
  }
  function displayName(item: Item): string {
    return itemDisplayName(item, $locale ?? 'en', $t('item.base.' + item.templateId));
  }
  function salePrice(item: Item): number {
    const quote = quoteSale(item);
    return quote.ok ? quote.price : 0;
  }
  function forgePrice(item: Item): number {
    const quote = quoteTempering(item);
    return quote.ok ? quote.price : 0;
  }
  function hasCraftBudget(kind: CraftKind,item: Item): boolean {
    const quote=quoteCraft(kind,item);
    return !!quote && view.gold>=quote.gold && MATERIAL_IDS.every(id=>
      (view.materials?.[id]??0)>=(quote.materials[id]??0))
      && !view.itemFlags?.[item.id]?.locked && !view.itemFlags?.[item.id]?.favorite;
  }
  function craftCost(kind: CraftKind,item: Item): string {
    const quote=quoteCraft(kind,item);
    if(!quote)return '';
    return [...Object.entries(quote.materials).filter(([,count])=>count>0)
      .map(([id,count])=>count+' '+$t('crafting.materials.'+id)),
      ...(quote.gold?[money(quote.gold)+' '+$t('hud.gold')]:[])].join(', ');
  }
  function craft(kind: CraftKind,index: number,affixIndex?:number): void {
    bridge.command({type:'craft',kind,index,...(affixIndex!==undefined?{affixIndex}:{})});
  }
</script>

<div class="trade-overlay">
  <div class="trade-window" role="dialog" aria-modal="true"
    aria-label={$t(npc === MERCHANT_ID ? 'npc.merchant.name' : 'npc.blacksmith.name')}>
    <header class="trade-header">
      <div>
        <div class="trade-kicker">{$t('trade.campServices')}</div>
        <h2>{$t(npc === MERCHANT_ID ? 'npc.merchant.name' : 'npc.blacksmith.name')}</h2>
        <p>{$t(npc === MERCHANT_ID ? 'npc.merchant.description' : 'npc.blacksmith.description')}</p>
      </div>
      <button class="trade-close" aria-label={$t('inventory.close')} onclick={close}>✕</button>
    </header>
    <div class="trade-gold">{$t('hud.gold')}: <strong>{money(view.gold)}</strong></div>

    {#if npc === MERCHANT_ID}
      <div class="trade-columns">
        <section>
          <h3>{$t('trade.stock')}</h3>
          <div class="trade-list">
            {#each SHOP_OFFERS as offer (offer.id)}
              {@const preview = createShopItem(offer, 'preview')}
              {@const quote = quotePurchase(offer)}
              <div class="trade-item">
                <span class="trade-icon" style:border-color={RARITIES[preview.rarity].color}><ItemArt item={preview} /></span>
                <div class="trade-item-name">
                  <strong>{$t('item.base.' + offer.templateId)}</strong>
                  <small>{$t('item.slot.' + preview.slot)}</small>
                </div>
                <span class="trade-price">{money(quote.ok ? quote.price : 0)} {$t('hud.gold')}</span>
                <button disabled={!quote.ok || view.gold < (quote.ok ? quote.price : Infinity) || bagFull}
                  aria-label={$t('trade.buy') + ' ' + $t('item.base.' + offer.templateId)}
                  onclick={() => bridge.command({ type: 'buyItem', offerId: offer.id })}>
                  {$t('trade.buy')}
                </button>
              </div>
            {/each}
          </div>
          {#if bagFull}<p class="trade-note">{$t('trade.bagFull')}</p>{/if}
        </section>
        <section>
          <h3>{$t('trade.yourItems')}</h3>
          <div class="trade-list">
            {#each view.inventory as item, index (index)}
              {#if item}
                <div class="trade-item">
                  <span class="trade-icon" style:border-color={RARITIES[item.rarity].color}><ItemArt {item} /></span>
                  <div class="trade-item-name">
                    <strong>{displayName(item)}</strong>
                    <small>{$t('item.rarity.' + item.rarity)} · +{item.upgrades}</small>
                  </div>
                  <span class="trade-price">{money(salePrice(item))} {$t('hud.gold')}</span>
                  <button disabled={salePrice(item) === 0 || !!view.itemFlags?.[item.id]?.locked || !!view.itemFlags?.[item.id]?.favorite}
                    aria-label={$t('trade.sell') + ' ' + $t('item.base.' + item.templateId)}
                    onclick={() => bridge.command({ type: 'sellItem', index })}>
                    {$t('trade.sell')}
                  </button>
                </div>
              {/if}
            {/each}
            {#if view.inventory.every(item => item === null)}
              <p class="trade-note">{$t('trade.noItems')}</p>
            {/if}
          </div>
        </section>
      </div>
    {:else if npc === BLACKSMITH_ID}
      <section>
        <h3>{$t('trade.temperTitle')}</h3>
        <p class="trade-note">{$t('trade.temperHint')}</p>
        <div class="trade-list">
          {#each Object.entries(view.equipment) as [slot, item] (slot)}
            {#if item && canTemper(item)}
              {@const upgraded = temperItem(item)}
              <div class="trade-item">
                <span class="trade-icon" style:border-color={RARITIES[item.rarity].color}><ItemArt {item} /></span>
                <div class="trade-item-name">
                  <strong>{displayName(item)}</strong>
                  <small>{$t('item.slot.' + slot)} · {$t('trade.tempering')} {item.upgrades}/3</small>
                  {#if upgraded}
                    <small class="upgrade-preview">
                      {#if upgraded.armor !== item.armor}
                        {$t('stat.armor')} {item.armor} → {upgraded.armor}
                      {:else}
                        {$t('stat.damageMin')}–{$t('stat.damageMax')}
                        {item.minDmg}–{item.maxDmg} → {upgraded.minDmg}–{upgraded.maxDmg}
                      {/if}
                    </small>
                  {/if}
                </div>
                <span class="trade-price">{money(forgePrice(item))} {$t('hud.gold')}</span>
                <button disabled={forgePrice(item) === 0 || view.gold < forgePrice(item)}
                  aria-label={$t('trade.temper') + ' ' + $t('item.base.' + item.templateId)}
                  onclick={() => bridge.command({ type: 'temperItem', slot: slot as keyof GameSnapshot['equipment'] })}>
                  {$t('trade.temper')}
                </button>
              </div>
            {:else if item && item.upgrades === 3}
              <div class="trade-item">
                <span class="trade-icon" style:border-color={RARITIES[item.rarity].color}><ItemArt {item} /></span>
                <div class="trade-item-name">
                  <strong>{displayName(item)}</strong>
                  <small>{$t('trade.maximum')}</small>
                </div>
              </div>
            {/if}
          {/each}
          {#if !Object.values(view.equipment).some(item => item !== null && canTemper(item))}
            <p class="trade-note">{$t('trade.noForgeable')}</p>
          {/if}
        </div>
      </section>
      <section class="crafting-section">
        <h3>{$t('crafting.title')}</h3>
        <p class="trade-note">{$t('crafting.description')}</p>
        <div class="materials-rows" data-testid="materials-wallet">
          {#each MATERIAL_IDS as id (id)}
            <div><span>{$t('crafting.materials.'+id)}</span>
              <strong data-material={id}>{view.materials?.[id]??0}</strong></div>
          {/each}
        </div>
        <div class="trade-list crafting-list">
          {#each view.inventory as item,index (index)}
            {#if item}
              <div class="crafting-item" data-craft-id={item.id}>
                <div class="crafting-head">
                  <span class="crafting-name" style:color={RARITIES[item.rarity].color}>
                    <span class="trade-icon" style:border-color={RARITIES[item.rarity].color}><ItemArt {item} /></span>
                    {displayName(item)}
                  </span>
                  <small>{$t('item.rarity.'+item.rarity)} · +{item.upgrades}/3</small>
                </div>
                {#if view.itemFlags?.[item.id]?.locked || view.itemFlags?.[item.id]?.favorite}
                  <p class="trade-note">{$t('crafting.protected')}</p>
                {:else}
                  <div class="craft-actions">
                    {#each ['salvage','upgrade','enchant','socket'] as action (action)}
                      {@const kind=action as CraftKind}
                      {@const quote=quoteCraft(kind,item)}
                      <button disabled={!hasCraftBudget(kind,item)}
                        title={craftCost(kind,item)}
                        onclick={()=>craft(kind,index)}>
                        {$t('crafting.actions.'+kind)}
                        {#if quote}<small>{craftCost(kind,item)||
                          $t('crafting.free')}</small>{/if}
                      </button>
                    {/each}
                  </div>
                  {#if item.affixes.length}
                    <div class="craft-actions">
                      {#each item.affixes as affix,affixIndex (affixIndex)}
                        <button disabled={!hasCraftBudget('reroll',item)}
                          title={craftCost('reroll',item)}
                          onclick={()=>craft('reroll',index,affixIndex)}>
                          {$t('crafting.actions.reroll')}:
                          {$t('item.affix.'+affix.id)}
                          <small>{craftCost('reroll',item)}</small>
                        </button>
                      {/each}
                    </div>
                  {/if}
                {/if}
              </div>
            {/if}
          {/each}
          {#if view.inventory.every(item=>item===null)}
            <p class="trade-note">{$t('trade.noItems')}</p>
          {/if}
        </div>
      </section>
      <GemForgePanel {view} {bridge} />
    {/if}
    <footer class="trade-footer">
      <button class="secondary" onclick={close}>{$t('npc.leave')}</button>
    </footer>
  </div>
</div>

<style>
  .trade-overlay{position:absolute;inset:0;z-index:12;background:#060911df;display:grid;place-items:center;padding:16px}
  .trade-window{width:min(96vw,930px);max-height:92vh;overflow:auto;background:linear-gradient(155deg,#202c32,#0d131c);
    border:1px solid #aa8b62;box-shadow:0 23px 80px #000;padding:24px}
  .trade-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:1px solid #64533d;padding-bottom:12px}
  .trade-kicker{font-size:.62rem;color:#b2a07f;text-transform:uppercase;letter-spacing:.18em}
  h2{font:1.55rem Georgia,serif;margin:6px 0;color:#efd8b0}
  h3{font:1.06rem Georgia,serif;color:#e3c99e;margin:0 0 12px}
  .trade-header p{color:#b7c3c1;font-size:.79rem;margin:5px 0}
  .trade-close{padding:7px 12px}
  .trade-gold{padding:11px 0;text-align:right;color:#dfbf82;font-size:.82rem}
  .trade-gold strong{font-size:1.15rem}
  .trade-columns{display:grid;grid-template-columns:1fr 1fr;gap:24px}
  .trade-list{display:flex;flex-direction:column;gap:7px;max-height:54vh;overflow:auto;padding:2px}
  .trade-item{display:flex;align-items:center;gap:8px;background:#141e28;border:1px solid #41505a;padding:9px}
  .trade-icon{display:block;width:38px;height:38px;flex:0 0 38px;border:1px solid;
    background:radial-gradient(#26313a,#111820 75%)}
  .trade-item-name .upgrade-preview{color:#a8ddb1}
  .crafting-name{display:flex;align-items:center;gap:8px;overflow-wrap:anywhere}
  .trade-item-name{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
  .trade-item-name strong{font-size:.75rem;color:#e4ddcd;font-weight:500}
  .trade-item-name small{font-size:.62rem;color:#a9b1af}
  .trade-price{font-size:.7rem;white-space:nowrap;color:#d7ba85}
  .trade-item button{font-size:.69rem;min-height:40px;padding:7px 9px;white-space:nowrap}
  .trade-note{font-size:.74rem;color:#adb9b9;line-height:1.6}
  .crafting-section{margin-top:18px;padding-top:15px;border-top:1px solid #5d533e}
  .materials-rows{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:10px 0}
  .materials-rows>div{display:flex;gap:8px;justify-content:space-between;
    padding:7px;background:#13202a;border:1px solid #44505b;font-size:.73rem}
  .materials-rows strong{color:#edce92;font-variant-numeric:tabular-nums}
  .crafting-list{max-height:42vh}
  .crafting-item{border:1px solid #3a4955;background:#121b25;padding:10px}
  .crafting-head{display:flex;justify-content:space-between;gap:8px;font-size:.8rem}
  .crafting-head small{color:#aeb4b0}
  .craft-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
  .craft-actions button{display:flex;flex-direction:column;align-items:flex-start;
    gap:4px;font-size:.73rem;background:#252d36;border:1px solid #75644e;
    color:#e6d4b3;padding:7px 9px}
  .craft-actions button small{font-size:.59rem;color:#c1a47a;text-align:left}
  .craft-actions button:disabled{opacity:.4;cursor:not-allowed}
  .trade-footer{display:flex;justify-content:flex-end;margin-top:16px;border-top:1px solid #594d3e;padding-top:14px}
  .trade-footer button{font-size:.78rem;padding:9px 21px}
  @media(max-width:720px){.trade-window{padding:12px}.trade-columns{grid-template-columns:1fr;gap:13px}
    .trade-list{max-height:28vh}.trade-item{padding:5px;gap:5px}.trade-price{font-size:.6rem}
    .trade-item button{font-size:.64rem;padding:5px}.trade-item-name strong{font-size:.68rem}}
</style>
