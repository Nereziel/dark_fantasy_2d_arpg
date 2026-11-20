<script lang="ts">
  import { _ as t, locale } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import type { GameBridge } from '../game/bridge/GameBridge';
  import { RARITIES, type Item } from '../game/data/items';
  import {
    SHOP_OFFERS, createShopItem, canTemper
  } from '../game/trade/commerce';
  import { quotePurchase, quoteSale, quoteTempering } from '../game/trade/economyRules';
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

  let emptyBag = $derived(view.inventory.every(item => item !== null));
  function money(value: number): string {
    return new Intl.NumberFormat($locale === 'cs' ? 'cs-CZ' : 'en-US').format(value);
  }
  function salePrice(item: Item): number {
    const quote = quoteSale(item);
    return quote.ok ? quote.price : 0;
  }
  function forgePrice(item: Item): number {
    const quote = quoteTempering(item);
    return quote.ok ? quote.price : 0;
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
                <span class="trade-icon">{preview.icon}</span>
                <div class="trade-item-name">
                  <strong>{$t('item.base.' + offer.templateId)}</strong>
                  <small>{$t('item.slot.' + preview.slot)}</small>
                </div>
                <span class="trade-price">{money(quote.ok ? quote.price : 0)} {$t('hud.gold')}</span>
                <button disabled={!quote.ok || view.gold < (quote.ok ? quote.price : Infinity) || emptyBag}
                  aria-label={$t('trade.buy') + ' ' + $t('item.base.' + offer.templateId)}
                  onclick={() => bridge.command({ type: 'buyItem', offerId: offer.id })}>
                  {$t('trade.buy')}
                </button>
              </div>
            {/each}
          </div>
          {#if emptyBag}<p class="trade-note">{$t('trade.bagFull')}</p>{/if}
        </section>
        <section>
          <h3>{$t('trade.yourItems')}</h3>
          <div class="trade-list">
            {#each view.inventory as item, index (index)}
              {#if item}
                <div class="trade-item">
                  <span class="trade-icon" style:color={RARITIES[item.rarity].color}>{item.icon}</span>
                  <div class="trade-item-name">
                    <strong>{$t('item.base.' + item.templateId)}</strong>
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
              <div class="trade-item">
                <span class="trade-icon" style:color={RARITIES[item.rarity].color}>{item.icon}</span>
                <div class="trade-item-name">
                  <strong>{$t('item.base.' + item.templateId)}</strong>
                  <small>{$t('item.slot.' + slot)} · {$t('trade.tempering')} {item.upgrades}/3</small>
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
                <span class="trade-icon" style:color={RARITIES[item.rarity].color}>{item.icon}</span>
                <div class="trade-item-name">
                  <strong>{$t('item.base.' + item.templateId)}</strong>
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
  .trade-icon{font-size:1.25rem;flex:0 0 27px}
  .trade-item-name{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
  .trade-item-name strong{font-size:.75rem;color:#e4ddcd;font-weight:500}
  .trade-item-name small{font-size:.62rem;color:#a9b1af}
  .trade-price{font-size:.7rem;white-space:nowrap;color:#d7ba85}
  .trade-item button{font-size:.69rem;padding:7px 9px;white-space:nowrap}
  .trade-note{font-size:.74rem;color:#adb9b9;line-height:1.6}
  .trade-footer{display:flex;justify-content:flex-end;margin-top:16px;border-top:1px solid #594d3e;padding-top:14px}
  .trade-footer button{font-size:.78rem;padding:9px 21px}
  @media(max-width:720px){.trade-window{padding:12px}.trade-columns{grid-template-columns:1fr;gap:13px}
    .trade-list{max-height:28vh}.trade-item{padding:5px;gap:5px}.trade-price{font-size:.6rem}
    .trade-item button{font-size:.64rem;padding:5px}.trade-item-name strong{font-size:.68rem}}
</style>
