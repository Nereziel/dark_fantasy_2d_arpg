<script lang="ts">
  import { _ as t, locale } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import type { GameBridge } from '../game/bridge/GameBridge';
  import { itemDisplayName } from '../game/items/itemName';
  import { RARITIES } from '../game/data/items';
  let { view, bridge }: { view: GameSnapshot; bridge: GameBridge } = $props();
  let stash = $derived(view.stash ?? []);
  let hasFreeStash = $derived(stash.some(item => item === null));
  let hasFreeBag = $derived(view.inventory.some(item => item === null));
</script>

<div class="stash-columns">
  <section>
    <h3>{$t('town.stashBag')} ({view.inventory.filter(Boolean).length}/24)</h3>
    <div class="stash-list">
      {#each view.inventory as item, index (index)}
        {#if item}
          <div class="stash-row">
            <span style:color={RARITIES[item.rarity].color}>{item.icon} {itemDisplayName(item, $locale ?? 'en', $t('item.base.' + item.templateId))}</span>
            <button disabled={!hasFreeStash || !!view.itemFlags?.[item.id]?.locked || !!view.itemFlags?.[item.id]?.favorite}
              onclick={() => bridge.command({ type: 'stashDeposit', index })}>
              {$t('town.stashDeposit')}
            </button>
          </div>
        {/if}
      {/each}
      {#if view.inventory.every(item => item === null)}
        <p class="stash-empty">{$t('trade.noItems')}</p>
      {/if}
    </div>
  </section>
  <section>
    <h3>{$t('town.stashStored')} ({stash.filter(Boolean).length}/24)</h3>
    <div class="stash-list">
      {#each stash as item, index (index)}
        {#if item}
          <div class="stash-row">
            <span style:color={RARITIES[item.rarity].color}>{item.icon} {itemDisplayName(item, $locale ?? 'en', $t('item.base.' + item.templateId))}</span>
            <button disabled={!hasFreeBag}
              onclick={() => bridge.command({ type: 'stashWithdraw', index })}>
              {$t('town.stashWithdraw')}
            </button>
          </div>
        {/if}
      {/each}
      {#if stash.every(item => item === null)}
        <p class="stash-empty">{$t('town.stashEmpty')}</p>
      {/if}
    </div>
  </section>
</div>
<p class="stash-hint">{$t('town.stashProtected')}</p>

<style>
  .stash-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:760px}
  .stash-columns section{min-width:0}
  .stash-columns h3{color:#f0d5a3;font-size:.85rem;margin:4px 0 10px}
  .stash-list{max-height:240px;overflow:auto;display:flex;flex-direction:column;gap:7px}
  .stash-row{display:flex;gap:8px;align-items:center;justify-content:space-between;background:#17202ab8;padding:8px}
  .stash-row span{font-size:.75rem;min-width:0;overflow:hidden;text-overflow:ellipsis}
  .stash-row button{white-space:nowrap;font-size:.72rem;border:1px solid #8b7a5f;background:#2d3137;color:#e7dac0;padding:7px;cursor:pointer}
  .stash-row button:disabled{opacity:.45;cursor:not-allowed}
  .stash-empty,.stash-hint{color:#c4b8a6;font-size:.76rem}
  @media(max-width:560px){.stash-columns{grid-template-columns:1fr}.stash-list{max-height:150px}}
</style>
