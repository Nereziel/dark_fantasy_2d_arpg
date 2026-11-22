<script lang="ts">
  import { _ as t, locale } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import type { GameBridge } from '../game/bridge/GameBridge';
  import { itemDisplayName } from '../game/items/itemName';
  import ItemArt from './ItemArt.svelte';
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
  type DragSource = { kind: 'bag'; index: number; id: string }
    | { kind: 'stash'; index: number; tab: number; id: string };
  let dragged = $state<DragSource | null>(null);
  // Native HTML drag events are not reliable on touch browsers. The user
  // explicitly arms one source, then taps a destination tab or bag action.
  let pendingMove = $state<DragSource | null>(null);
  let moveMessage = $state('');
  let dropHover = $state<'bag' | 'stash' | number | null>(null);
  let transferSource = $derived(dragged ?? pendingMove);
  const tabItems = (tab: number) => tab === 0
    ? view.stash ?? Array(STASH_SIZE).fill(null)
    : view.stashTabs?.[tab - 1] ?? emptyStashTabs()[tab - 1]!;
  function availableTab(tab: number): boolean {
    return tabItems(tab).some(item => item === null);
  }
  function liveSource(source: DragSource | null): boolean {
    return !!source && (source.kind === 'bag'
      ? view.inventory[source.index]?.id === source.id
        && !view.itemFlags?.[source.id]?.locked && !view.itemFlags?.[source.id]?.favorite
      : tabItems(source.tab)[source.index]?.id === source.id);
  }
  function canDropBag(): boolean {
    return transferSource?.kind === 'stash'
      && liveSource(transferSource) && hasFreeBag;
  }
  function canDropTab(tab: number): boolean {
    return !!transferSource && liveSource(transferSource) && availableTab(tab)
      && (transferSource.kind === 'bag' || transferSource.tab !== tab);
  }
  function beginMove(source: DragSource): void {
    if (!liveSource(source)) {
      moveMessage = $locale === 'cs' ? 'Tento předmět nelze přesunout.' : 'This item cannot be moved.';
      return;
    }
    pendingMove = pendingMove?.id === source.id ? null : source;
    moveMessage = '';
  }
  function moveFailure(): void {
    moveMessage = $locale === 'cs'
      ? 'Přesun se nezdařil. Zkontroluj místo v úschovně nebo v batohu.'
      : 'Move failed. Check the available space in the stash or backpack.';
  }
  function transferToTab(tab: number): void {
    const source = pendingMove;
    if (!source || !canDropTab(tab)) { moveFailure(); return; }
    if (source.kind === 'bag') {
      bridge.command({ type: 'stashDeposit', index: source.index, tab });
    } else {
      bridge.command({ type: 'stashMove', fromTab: source.tab, index: source.index, toTab: tab });
    }
    const latest = bridge.snapshot();
    const destination = tab === 0 ? latest.stash : latest.stashTabs?.[tab - 1];
    if (!destination?.some(item => item?.id === source.id)) { moveFailure(); return; }
    pendingMove = null;
    moveMessage = '';
    activeTab = tab;
  }
  function transferToBag(): void {
    const source = pendingMove;
    if (!source || source.kind !== 'stash' || !canDropBag()) { moveFailure(); return; }
    bridge.command({ type: 'stashWithdraw', tab: source.tab, index: source.index });
    if (!bridge.snapshot().inventory.some(item => item?.id === source.id)) {
      moveFailure();
      return;
    }
    pendingMove = null;
    moveMessage = '';
  }
  function dragStart(event: DragEvent, source: DragSource): void {
    if (!liveSource(source)) { event.preventDefault(); return; }
    pendingMove = null;
    moveMessage = '';
    dragged = source;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', 'aether-stash');
    }
  }
  function clearDrag(): void { dragged = null; dropHover = null; }
  function allowDrop(event: DragEvent, target: 'bag' | 'stash' | number): void {
    if (!dragged) return;
    const valid = target === 'bag' ? canDropBag()
      : canDropTab(target === 'stash' ? activeTab : target);
    event.preventDefault();
    dropHover = target;
    if (event.dataTransfer) event.dataTransfer.dropEffect = valid ? 'move' : 'none';
  }
  function dropIntoBag(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const source = dragged;
    const valid = canDropBag();
    clearDrag();
    if (valid && source?.kind === 'stash') bridge.command({
      type: 'stashWithdraw', tab: source.tab, index: source.index
    });
    pendingMove = null;
  }
  function dropIntoTab(event: DragEvent, tab: number): void {
    event.preventDefault();
    event.stopPropagation();
    const source = dragged;
    const valid = canDropTab(tab);
    clearDrag();
    if (!source || !valid) return;
    if (source.kind === 'bag') bridge.command({ type: 'stashDeposit', index: source.index, tab });
    else bridge.command({ type: 'stashMove', fromTab: source.tab, index: source.index, toTab: tab });
    activeTab = tab;
    pendingMove = null;
  }

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
      pendingMove = null;
    }
    target.value = '';
  }
</script>

<div class="stash-tabs" role="tablist" aria-label={$t('stash.tabs')}>
  {#each tabs as tab}
    <button role="tab" aria-selected={activeTab === tab} class:active={activeTab === tab}
      data-stash-tab={tab} class:drop-ready={!!transferSource && canDropTab(tab)}
      class:drop-hover={dropHover === tab && canDropTab(tab)}
      ondragover={(event) => allowDrop(event, tab)}
      ondragleave={() => { if (dropHover === tab) dropHover = null; }}
      ondrop={(event) => dropIntoTab(event, tab)}
      onclick={() => {
        if (pendingMove && canDropTab(tab)) transferToTab(tab);
        else if (pendingMove && tab !== (pendingMove.kind === 'stash' ? pendingMove.tab : -1)) {
          activeTab = tab;
          moveFailure();
        } else activeTab = tab;
      }}>
      {$t('stash.tab')} {tab + 1}
      <small>({(tab === 0 ? view.stash : view.stashTabs?.[tab - 1])?.filter(Boolean).length ?? 0}/{STASH_SIZE})</small>
    </button>
  {/each}
</div>

{#if pendingMove}
  <div class="stash-click-transfer" role="group"
    aria-label={$locale === 'cs' ? 'Přesun předmětu' : 'Move item'}>
    <span role="status">{$locale === 'cs'
      ? 'Vyber cílovou záložku nebo batoh.'
      : 'Choose a destination tab or backpack.'}</span>
    {#if pendingMove.kind === 'stash'}
      <button type="button" data-stash-move-bag disabled={!canDropBag()}
        onclick={transferToBag}>
        {$locale === 'cs' ? 'Do batohu' : 'To backpack'}
      </button>
    {/if}
    {#if canDropTab(activeTab)}
      <button type="button" data-stash-move-current
        onclick={() => transferToTab(activeTab)}>
        {$locale === 'cs' ? 'Do vybrané záložky' : 'To selected tab'}
      </button>
    {/if}
    <button type="button" onclick={() => { pendingMove = null; moveMessage = ''; }}>
      {$locale === 'cs' ? 'Zrušit přesun' : 'Cancel move'}
    </button>
  </div>
{/if}
{#if moveMessage}
  <p class="stash-transfer-error" role="status">{moveMessage}</p>
{/if}

<div class="stash-columns">
  <section>
    <h3>{$t('town.stashBag')} ({view.inventory.filter(Boolean).length}/24)</h3>
    <div class="stash-list" data-stash-bag role="region" aria-label={$t('town.stashBag')}
      class:drop-ready={canDropBag()}
      class:drop-hover={dropHover === 'bag' && canDropBag()}
      ondragover={(event) => allowDrop(event, 'bag')}
      ondragleave={() => { if (dropHover === 'bag') dropHover = null; }}
      ondrop={dropIntoBag}>
      {#each view.inventory as item, index (index)}
        {#if item}
          <div class="stash-row" role="group" aria-label={item.id} data-item-id={item.id} data-bag-index={index}
            class:move-source={pendingMove?.id === item.id}
            draggable={!view.itemFlags?.[item.id]?.locked && !view.itemFlags?.[item.id]?.favorite}
            ondragstart={(event) => dragStart(event, { kind: 'bag', index, id: item.id })}
            ondragend={clearDrag}>
            <span class="stash-item-ident" style:color={RARITIES[item.rarity].color}>
              <span class="stash-art"><ItemArt {item} /></span>
              <span class="stash-item-label">{itemDisplayName(item, $locale ?? 'en', $t('item.base.' + item.templateId))}</span>
            </span>
            <button type="button" class="stash-move-select"
              aria-pressed={pendingMove?.id === item.id}
              disabled={!!view.itemFlags?.[item.id]?.locked || !!view.itemFlags?.[item.id]?.favorite}
              onclick={() => beginMove({ kind: 'bag', index, id: item.id })}>
              {$locale === 'cs' ? 'Vybrat k přesunu' : 'Select for move'}
            </button>
            <button disabled={!hasFreeStash || !!view.itemFlags?.[item.id]?.locked || !!view.itemFlags?.[item.id]?.favorite}
              onclick={() => { pendingMove = null; bridge.command({ type: 'stashDeposit', index, tab: activeTab }); }}>
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
    <button class="stash-organize" onclick={() => { pendingMove = null; bridge.command({ type: 'stashSort', tab: activeTab }); }}>
      {$t('stash.organize')}
    </button>
    <div class="stash-list" data-stash-items={activeTab} role="tabpanel" tabindex="0"
      class:drop-ready={!!transferSource && canDropTab(activeTab)}
      class:drop-hover={dropHover === 'stash' && canDropTab(activeTab)}
      ondragover={(event) => allowDrop(event, 'stash')}
      ondragleave={() => { if (dropHover === 'stash') dropHover = null; }}
      ondrop={(event) => dropIntoTab(event, activeTab)}>
      {#each storedRows as { index, item } (item.id)}
        <div class="stash-row" role="group" aria-label={item.id} data-item-id={item.id} data-slot-index={index} draggable="true"
          class:move-source={pendingMove?.id === item.id}
          ondragstart={(event) => dragStart(event, { kind: 'stash', tab: activeTab, index, id: item.id })}
          ondragend={clearDrag}>
          <span class="stash-item-ident" style:color={RARITIES[item.rarity].color}>
              <span class="stash-art"><ItemArt {item} /></span>
              <span class="stash-item-label">{itemDisplayName(item, $locale ?? 'en', $t('item.base.' + item.templateId))}</span>
            </span>
          <div class="stash-row-actions">
            <button type="button" class="stash-move-select" aria-pressed={pendingMove?.id === item.id}
              onclick={() => beginMove({ kind: 'stash', index, tab: activeTab, id: item.id })}>
              {$locale === 'cs' ? 'Vybrat k přesunu' : 'Select for move'}
            </button>
            <button disabled={!hasFreeBag}
              onclick={() => { pendingMove = null; bridge.command({ type: 'stashWithdraw', index, tab: activeTab }); }}>
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
<p class="stash-hint">{$t('town.stashProtected')} · {$locale === 'cs'
    ? 'Přetáhni předmět, nebo zvol Vybrat k přesunu a cílovou záložku či batoh.'
    : 'Drag an item, or choose Select for move and a destination tab or backpack.'}</p>

<style>
  .stash-tabs{display:flex;gap:6px;margin:8px 0 13px;flex-wrap:wrap}
  .stash-click-transfer{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0 0 10px;padding:7px 9px;border:1px solid #6e8c76;background:#1b3329}
  .stash-click-transfer span{font-size:.73rem;color:#d3ebd6}
  .stash-click-transfer button{min-height:40px;padding:6px 10px;border:1px solid #87b79b;background:#294637;color:#e2f3db;cursor:pointer}
  .stash-click-transfer button:disabled{opacity:.4;cursor:not-allowed}
  .stash-transfer-error{color:#f0b9a2;font-size:.73rem;margin:0 0 8px}
  .stash-row.move-source{outline:2px solid #86c9a2;background:#233a32}
  .stash-tabs button{background:#1c222a;border:1px solid #736044;color:#d8c8ab;padding:8px 12px;cursor:pointer}
  .stash-tabs button.active{background:#393128;border-color:#e7b86e;color:#ffe0a2}
  .stash-tabs button.drop-ready{outline:2px solid #81cfa2;outline-offset:2px;box-shadow:0 0 12px #5cbb8299}
  .stash-tabs button.drop-hover{outline:3px solid #c2f7bc;background:#294636}
  .stash-tabs button small{font-size:.62rem;margin-left:5px}
  .stash-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:850px}
  .stash-columns section{min-width:0}
  .stash-columns h3{color:#f0d5a3;font-size:.85rem;margin:4px 0 10px}
  .stash-list{max-height:240px;overflow:auto;display:flex;flex-direction:column;gap:7px;min-height:80px;border:1px solid transparent;padding:4px}
  .stash-list.drop-ready{border:2px dashed #81cfa2;box-shadow:inset 0 0 14px #356d4c88}
  .stash-list.drop-hover{border-style:solid;background:#24403277;box-shadow:inset 0 0 18px #4ca36a66}
  .stash-row{display:flex;gap:8px;align-items:center;justify-content:space-between;background:#17202ab8;padding:8px}
  .stash-row[draggable="true"]{cursor:grab}
  .stash-row[draggable="true"]:active{cursor:grabbing}
  .stash-row[draggable="false"]{cursor:not-allowed}
  .stash-row span{font-size:.75rem;min-width:0;overflow:hidden;text-overflow:ellipsis}
  .stash-item-ident{display:flex;flex:1 1 140px;align-items:center;gap:8px;min-width:0}
  .stash-art{width:32px;height:32px;flex:0 0 32px}
  .stash-item-label{min-width:0;white-space:normal;overflow-wrap:anywhere;text-overflow:clip}
  .stash-row button,.stash-organize{white-space:nowrap;font-size:.72rem;border:1px solid #8b7a5f;background:#2d3137;color:#e7dac0;padding:7px;cursor:pointer}
  .stash-row button:disabled{opacity:.45;cursor:not-allowed}
  .stash-row-actions{display:flex;flex-wrap:wrap;gap:5px;justify-content:flex-end}
  .stash-row select{max-width:105px;font-size:.72rem;border:1px solid #8b7a5f;background:#2d3137;color:#e7dac0;padding:6px}
  .stash-controls{display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;margin:0 0 8px}
  .stash-controls label{display:flex;flex-direction:column;gap:3px;min-width:84px;flex:1;font-size:.66rem;color:#cdbb9b}
  .stash-controls select,.stash-controls input{box-sizing:border-box;width:100%;min-width:0;color:#eee2c7;border:1px solid #675845;background:#17202a;padding:6px;font-size:.7rem}
  .stash-organize{margin-bottom:8px}
  .stash-empty,.stash-hint{color:#c4b8a6;font-size:.76rem}
  @media(max-width:660px){.stash-columns{grid-template-columns:1fr}.stash-list{max-height:145px}.stash-tabs button{padding:7px 9px}.stash-controls label{min-width:105px}.stash-row{flex-wrap:wrap}.stash-row-actions{margin-left:auto}}
</style>
