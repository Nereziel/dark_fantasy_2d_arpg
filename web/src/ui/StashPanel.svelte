<script lang="ts">
  import { _ as t, locale } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import type { GameBridge } from '../game/bridge/GameBridge';
  import { itemDisplayName } from '../game/items/itemName';
  import { RARITIES, type RarityId } from '../game/data/items';
  import { STASH_SIZE, STASH_TAB_COUNT, emptyStashTabs, projectStashItems,
    type StashCategory, type StashSort } from '../game/inventory/stashRules';

  let { view, bridge }: { view: GameSnapshot; bridge: GameBridge } = $props();
  const tabs = Array.from({ length: STASH_TAB_COUNT }, (_, i) => i);
  const rarityIds = Object.keys(RARITIES) as RarityId[];
  const categories: StashCategory[] = ['weapon', 'armor', 'accessory'];
  const sortModes: StashSort[] = ['rarity', 'level', 'name'];
  let activeTab = $state(0);
  let rarity = $state<RarityId | ''>('');
  let category = $state<StashCategory | ''>('');
  let query = $state('');
  let sort = $state<StashSort>('rarity');

  let stash = $derived(activeTab === 0
    ? view.stash ?? Array(STASH_SIZE).fill(null)
    : view.stashTabs?.[activeTab - 1] ?? emptyStashTabs()[activeTab - 1]!);
  let hasFreeStash = $derived(stash.some(item => item === null));
  let hasFreeBag = $derived(view.inventory.some(item => item === null));
  let storedRows = $derived(projectStashItems(stash, {
    ...(rarity ? { rarity } : {}),
    ...(category ? { category } : {}),
    ...(query ? { query } : {}),
    sort
  }));
  let usedSlots = $derived(stash.filter(Boolean).length);

  function moveTo(index: number, targetValue: string, target: HTMLSelectElement): void {
    const toTab = Number(targetValue);
    if (/^[012]$/.test(targetValue) && toTab < STASH_TAB_COUNT
      && toTab !== activeTab) {
      bridge.command({ type: 'stashMove', fromTab: activeTab, index, toTab });
    }
    target.value = '';
  }
</script>

<div class="stash-tabs" role="tablist" aria-label={$t('stash.tabs')}>
  {#each tabs as tab}
    <button role="tab" aria-selected={activeTab === tab} class:active={activeTab === tab}
      data-stash-tab={tab} onclick={() => { activeTab = tab; }}>
      {$t('stash.tab')} {tab + 1}
      <small>({(tab === 0 ? view.stash : view.stashTabs?.[tab - 1])?.filter(Boolean).length ?? 0}/{STASH_SIZE})</small>
    </button>
  {/each}
</div>

<div class="stash-columns">
  <section>
    <h3>{$t('town.stashBag')} ({view.inventory.filter(Boolean).length}/24)</h3>
    <div class="stash-list" data-stash-bag>
      {#each view.inventory as item, index (index)}
        {#if item}
          <div class="stash-row" data-item-id={item.id}>
            <span style:color={RARITIES[item.rarity].color}>{item.icon} {itemDisplayName(item, $locale ?? 'en', $t('item.base.' + item.templateId))}</span>
            <button disabled={!hasFreeStash || !!view.itemFlags?.[item.id]?.locked || !!view.itemFlags?.[item.id]?.favorite}
              onclick={() => bridge.command({ type: 'stashDeposit', index, tab: activeTab })}>
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
    <h3>{$t('town.stashStored')} ({usedSlots}/{STASH_SIZE})</h3>
    <div class="stash-controls">
      <label>
        <span>{$t('stash.search')}</span>
        <input type="search" value={query} maxlength="64"
          aria-label={$t('stash.search')} oninput={event => { query = event.currentTarget.value; }} />
      </label>
      <label>
        <span>{$t('stash.rarity')}</span>
        <select aria-label={$t('stash.rarity')}
          value={rarity} onchange={event => { rarity = event.currentTarget.value as RarityId | ''; }}>
          <option value="">{$t('stash.all')}</option>
          {#each rarityIds as id}
            <option value={id}>{$t('item.rarity.' + id)}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>{$t('stash.category')}</span>
        <select aria-label={$t('stash.category')} value={category}
          onchange={event => { category = event.currentTarget.value as StashCategory | ''; }}>
          <option value="">{$t('stash.all')}</option>
          {#each categories as id}
            <option value={id}>{$t('stash.categoryNames.' + id)}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>{$t('stash.sort')}</span>
        <select aria-label={$t('stash.sort')} value={sort}
          onchange={event => { sort = event.currentTarget.value as StashSort; }}>
          {#each sortModes as id}
            <option value={id}>{$t('stash.sortModes.' + id)}</option>
          {/each}
        </select>
      </label>
    </div>
    <button class="stash-organize" onclick={() => bridge.command({ type: 'stashSort', tab: activeTab })}>
      {$t('stash.organize')}
    </button>
    <div class="stash-list" data-stash-items={activeTab} role="tabpanel">
      {#each storedRows as { index, item } (item.id)}
        <div class="stash-row" data-item-id={item.id} data-slot-index={index}>
          <span style:color={RARITIES[item.rarity].color}>{item.icon} {itemDisplayName(item, $locale ?? 'en', $t('item.base.' + item.templateId))}</span>
          <div class="stash-row-actions">
            <button disabled={!hasFreeBag}
              onclick={() => bridge.command({ type: 'stashWithdraw', index, tab: activeTab })}>
              {$t('town.stashWithdraw')}
            </button>
            <select aria-label={$t('stash.moveTo') + ': ' + item.id} value=""
              onchange={event => moveTo(index, event.currentTarget.value, event.currentTarget)}>
              <option value="">{$t('stash.moveTo')}</option>
              {#each tabs.filter(tab => tab !== activeTab) as tab}
                <option value={tab}>{$t('stash.tab')} {tab + 1}</option>
              {/each}
            </select>
          </div>
        </div>
      {/each}
      {#if usedSlots === 0}
        <p class="stash-empty">{$t('town.stashEmpty')}</p>
      {:else if storedRows.length === 0}
        <p class="stash-empty">{$t('stash.noMatches')}</p>
      {/if}
    </div>
  </section>
</div>
<p class="stash-hint">{$t('town.stashProtected')}</p>

<style>
  .stash-tabs{display:flex;gap:6px;margin:8px 0 13px;flex-wrap:wrap}
  .stash-tabs button{background:#1c222a;border:1px solid #736044;color:#d8c8ab;padding:8px 12px;cursor:pointer}
  .stash-tabs button.active{background:#393128;border-color:#e7b86e;color:#ffe0a2}
  .stash-tabs button small{font-size:.62rem;margin-left:5px}
  .stash-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:850px}
  .stash-columns section{min-width:0}
  .stash-columns h3{color:#f0d5a3;font-size:.85rem;margin:4px 0 10px}
  .stash-list{max-height:240px;overflow:auto;display:flex;flex-direction:column;gap:7px}
  .stash-row{display:flex;gap:8px;align-items:center;justify-content:space-between;background:#17202ab8;padding:8px}
  .stash-row span{font-size:.75rem;min-width:0;overflow:hidden;text-overflow:ellipsis}
  .stash-row button,.stash-organize{white-space:nowrap;font-size:.72rem;border:1px solid #8b7a5f;background:#2d3137;color:#e7dac0;padding:7px;cursor:pointer}
  .stash-row button:disabled{opacity:.45;cursor:not-allowed}
  .stash-row-actions{display:flex;flex-wrap:wrap;gap:5px;justify-content:flex-end}
  .stash-row select{max-width:105px;font-size:.72rem;border:1px solid #8b7a5f;background:#2d3137;color:#e7dac0;padding:6px}
  .stash-controls{display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;margin:0 0 8px}
  .stash-controls label{display:flex;flex-direction:column;gap:3px;min-width:84px;flex:1;font-size:.66rem;color:#cdbb9b}
  .stash-controls select,.stash-controls input{box-sizing:border-box;width:100%;min-width:0;color:#eee2c7;border:1px solid #675845;background:#17202a;padding:6px;font-size:.7rem}
  .stash-organize{margin-bottom:8px}
  .stash-empty,.stash-hint{color:#c4b8a6;font-size:.76rem}
  @media(max-width:660px){.stash-columns{grid-template-columns:1fr}.stash-list{max-height:145px}.stash-tabs button{padding:7px 9px}.stash-controls label{min-width:105px}}
</style>
