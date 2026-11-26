<script lang="ts">
  import { _ as t, locale } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import type { GameBridge } from '../game/bridge/GameBridge';
  import { itemDisplayName } from '../game/items/itemName';
  import ItemArt from './ItemArt.svelte';
  import { itemBaseProperties } from '../game/items/itemPresentation';
  import { RARITIES, type Item, type RarityId } from '../game/data/items';
  import { STASH_SIZE, STASH_TAB_COUNT, emptyStashTabs, projectStashItems,
    type StashCategory, type StashSort } from '../game/inventory/stashRules';

  let { view, bridge, nameKey, descriptionKey, close }: { view: GameSnapshot; bridge: GameBridge; nameKey: string; descriptionKey: string; close: () => void } = $props();
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
    selectedId = source.id;
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
  /** Any change to the stash view invalidates a pending tap-to-transfer.
   * Otherwise a filtered-out item can still be moved by tapping a tab. */
  function cancelPendingMove(): void {
    pendingMove = null;
    clearDrag();
    moveMessage = '';
  }
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

  type PreviewEntry = { source: DragSource; item: Item };
  let selectedId = $state<string | null>(null);
  const bagEntries = $derived(view.inventory.flatMap((item, index): PreviewEntry[] =>
    item ? [{ source: { kind: 'bag', index, id: item.id }, item }] : []));
  const storedEntries = $derived(storedRows.map(({ index, item }): PreviewEntry =>
    ({ source: { kind: 'stash', index, tab: activeTab, id: item.id }, item })));
  const selected = $derived([...bagEntries, ...storedEntries].find(e => e.item.id === selectedId)
    ?? bagEntries[0] ?? storedEntries[0] ?? null);
  function name(item: Item): string {
    return itemDisplayName(item, $locale ?? 'en', $t('item.base.' + item.templateId));
  }
  // Pin the action target on explicit click/tap; crossing another slot with
  // the mouse must never silently retarget a deposit or withdrawal.
  function inspect(item: Item): void {
    if (pendingMove && pendingMove.id !== item.id) cancelPendingMove();
    selectedId = item.id;
  }
  function quickTransfer(entry: PreviewEntry): void {
    const { source } = entry;
    if (!liveSource(source)) return;
    selectedId = source.id;
    pendingMove = null;
    if (source.kind === 'bag' && hasFreeStash) {
      bridge.command({ type: 'stashDeposit', index: source.index, tab: activeTab });
    } else if (source.kind === 'stash' && hasFreeBag) {
      bridge.command({ type: 'stashWithdraw', index: source.index, tab: source.tab });
    }
  }
</script>

<div class="modal-shield stash-overlay">
  <section class="stash-window" role="dialog" aria-modal="true" aria-label={$t(nameKey)}>
    <header class="stash-header">
      <div><h2>{$t(nameKey)}</h2><p>{$t(descriptionKey)}</p></div>
      <button class="close-button" type="button" aria-label={$t('inventory.close')} onclick={close}>✕</button>
    </header>
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


    <div class="stash-body">
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
    <button type="button" onclick={cancelPendingMove}>
      {$locale === 'cs' ? 'Zrušit přesun' : 'Cancel move'}
    </button>
  </div>
{/if}
{#if moveMessage}
  <p class="stash-transfer-error" role="status">{moveMessage}</p>
{/if}


      <div class="stash-filters">
        <div class="stash-controls">
      <label>
        <span>{$t('stash.search')}</span>
        <input type="search" value={query} maxlength="64"
          aria-label={$t('stash.search')} oninput={event => { query = event.currentTarget.value; cancelPendingMove(); }} />
      </label>
      <label>
        <span>{$t('stash.rarity')}</span>
        <select aria-label={$t('stash.rarity')}
          value={rarity} onchange={event => { rarity = event.currentTarget.value as RarityId | ''; cancelPendingMove(); }}>
          <option value="">{$t('stash.all')}</option>
          {#each rarityIds as id}
            <option value={id}>{$t('item.rarity.' + id)}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>{$t('stash.category')}</span>
        <select aria-label={$t('stash.category')} value={category}
          onchange={event => { category = event.currentTarget.value as StashCategory | ''; cancelPendingMove(); }}>
          <option value="">{$t('stash.all')}</option>
          {#each categories as id}
            <option value={id}>{$t('stash.categoryNames.' + id)}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>{$t('stash.sort')}</span>
        <select aria-label={$t('stash.sort')} value={sort}
          onchange={event => { sort = event.currentTarget.value as StashSort; cancelPendingMove(); }}>
          {#each sortModes as id}
            <option value={id}>{$t('stash.sortModes.' + id)}</option>
          {/each}
        </select>
      </label>
    </div>
    <button class="stash-organize" onclick={() => { cancelPendingMove(); bridge.command({ type: 'stashSort', tab: activeTab }); }}>
      {$t('stash.organize')}
    </button>

      </div>
      <div class="stash-columns">
        <section class="stash-pane">
          <h3>{$t('town.stashBag')} ({view.inventory.filter(Boolean).length}/{view.inventory.length})</h3>
          <div class="stash-list" data-stash-bag role="region" aria-label={$t('town.stashBag')}
            class:drop-ready={canDropBag()} class:drop-hover={dropHover === 'bag' && canDropBag()}
            ondragover={(event) => allowDrop(event, 'bag')}
            ondragleave={() => { if (dropHover === 'bag') dropHover = null; }} ondrop={dropIntoBag}>
            {#each view.inventory as item, index (index)}
              {#if item}
                <button type="button" class="stash-cell occupied" class:selected={selected?.item.id === item.id}
                  class:move-source={pendingMove?.id === item.id}
                  data-stash-cell data-item-id={item.id} data-bag-index={index}
                  style:border-color={RARITIES[item.rarity].color}
                  style:color={RARITIES[item.rarity].color}
                  aria-label={name(item)} aria-pressed={selected?.item.id === item.id} title={name(item)}
                  draggable={!view.itemFlags?.[item.id]?.locked && !view.itemFlags?.[item.id]?.favorite}
                  onclick={() => inspect(item)}
                  ondragstart={event => dragStart(event, { kind: 'bag', index, id: item.id })} ondragend={clearDrag}>
                  <span class="stash-item-ident"><ItemArt {item} /></span>
                  {#if item.upgrades}<small>+{item.upgrades}</small>{/if}
                  {#if view.itemFlags?.[item.id]?.locked || view.itemFlags?.[item.id]?.favorite}<span class="protected-mark" aria-hidden="true">◆</span>{/if}
                </button>
              {:else}
                <span class="stash-cell empty" data-stash-cell aria-hidden="true"></span>
              {/if}
            {/each}
          </div>
        </section>
        <section class="stash-pane">
          <h3>{$t('town.stashStored')} ({usedSlots}/{STASH_SIZE})</h3>
          <div class="stash-list" data-stash-items={activeTab} role="tabpanel" tabindex="0"
            class:drop-ready={!!transferSource && canDropTab(activeTab)} class:drop-hover={dropHover === 'stash' && canDropTab(activeTab)}
            ondragover={event => allowDrop(event, 'stash')}
            ondragleave={() => { if (dropHover === 'stash') dropHover = null; }} ondrop={event => dropIntoTab(event, activeTab)}>
            {#each storedRows as { index, item } (item.id)}
              <button type="button" class="stash-cell occupied" class:selected={selected?.item.id === item.id}
                class:move-source={pendingMove?.id === item.id}
                data-stash-cell data-item-id={item.id} data-slot-index={index}
                style:border-color={RARITIES[item.rarity].color} style:color={RARITIES[item.rarity].color}
                aria-label={name(item)} aria-pressed={selected?.item.id === item.id} title={name(item)}
                draggable="true"
                onclick={() => inspect(item)}
                ondragstart={event => dragStart(event, { kind: 'stash', tab: activeTab, index, id: item.id })} ondragend={clearDrag}>
                <span class="stash-item-ident"><ItemArt {item} /></span>
                {#if item.upgrades}<small>+{item.upgrades}</small>{/if}
              </button>
            {/each}
            {#each Array.from({length: STASH_SIZE - storedRows.length}, (_, i) => i) as index (index)}
              <span class="stash-cell empty" class:filtered={index < usedSlots - storedRows.length} data-stash-cell aria-hidden="true"></span>
            {/each}
          </div>
          {#if usedSlots === 0}<p class="stash-empty">{$t('town.stashEmpty')}</p>
          {:else if storedRows.length === 0}<p class="stash-empty">{$t('stash.noMatches')}</p>{/if}
        </section>
        <aside class="stash-inspector" data-testid="stash-inspector" aria-label={$t('inventory.comparison')}>
          <h3>{$locale === 'cs' ? 'Detail předmětu' : 'Item details'}</h3>
          {#if selected}
            {@const entry = selected}
            {@const item = entry.item}
            <div class="detail-heading">
              <span class="detail-art" style:color={RARITIES[item.rarity].color}><ItemArt {item} detail /></span>
              <div><small>{$t(entry.source.kind === 'bag' ? 'town.stashBag' : 'town.stashStored')}</small>
                <strong style:color={RARITIES[item.rarity].color}>{name(item)}</strong>
                <small>{$t('item.rarity.' + item.rarity)} · {$t('inventory.requireLevel')} {item.requiredLevel ?? 1}</small></div>
            </div>
            {#each itemBaseProperties(item) as property (property.key)}
              <div class="detail-stat"><span>{#if property.key === 'damage'}{$t('stat.damageMin')}–{$t('stat.damageMax')}{:else}{$t(property.key === 'armor' ? 'stat.armor' : 'stat.blockChance')}{/if}</span><strong>{property.value}</strong></div>
            {/each}
            {#each item.affixes as affix, index (index)}
              <p class="detail-affix">{$t('item.affix.' + affix.id)} · +{affix.value} {$t('stat.' + affix.stat)}</p>
            {/each}
            {#if item.twoHanded}<p>{$t('inventory.twoHanded')}</p>{/if}
            {#if item.upgrades}<p>{$t('trade.tempering')} +{item.upgrades}</p>{/if}
            {#if item.sockets?.length}<p>◯ {item.sockets.length}</p>{/if}
            {#if item.legendaryPower}<p>{$t('inventory.legendaryPower')}: +{item.legendaryPower.magnitude}</p>{/if}
            <div class="stash-actions">
              <button type="button" disabled={!liveSource(entry.source) || (entry.source.kind === 'bag' ? !hasFreeStash : !hasFreeBag)}
                onclick={() => quickTransfer(entry)}>{$t(entry.source.kind === 'bag' ? 'town.stashDeposit' : 'town.stashWithdraw')}</button>
              <button type="button" class="stash-move-select" aria-pressed={pendingMove?.id === item.id}
                disabled={!liveSource(entry.source)} onclick={() => beginMove(entry.source)}>
                {$locale === 'cs' ? 'Vybrat k přesunu' : 'Select for move'}</button>
              {#if entry.source.kind === 'stash'}
                <select aria-label={$t('stash.moveTo') + ': ' + item.id} value=""
                  onchange={event => moveTo(entry.source.index, event.currentTarget.value, event.currentTarget)}>
                  <option value="">{$t('stash.moveTo')}</option>
                  {#each tabs.filter(tab => tab !== activeTab) as tab}
                    <option value={tab}>{$t('stash.tab')} {tab + 1}</option>
                  {/each}
                </select>
              {/if}
            </div>
          {:else}
            <p class="stash-empty">{$locale === 'cs' ? 'Vyber předmět v batohu nebo úschovně.' : 'Select an item in the backpack or stash.'}</p>
          {/if}
        </aside>
      </div>
    </div>
    <footer class="stash-footer">
      <small>{$t('town.stashProtected')} · {$locale === 'cs' ? 'Přetáhni předmět nebo zvol přesun.' : 'Drag an item or select it for transfer.'}</small>
      <button class="secondary" onclick={close}>{$t('npc.leave')}</button>
    </footer>
  </section>
</div>

<style>
  .stash-overlay{padding:clamp(6px,2vh,18px);grid-template:minmax(0,1fr)/minmax(0,1fr)}
  .stash-window{width:min(1200px,100%);height:min(780px,100%);min-height:0;min-width:0;overflow:hidden;display:flex;flex-direction:column;background:linear-gradient(155deg,#20242c,#0b111a 70%);border:1px solid #9d845d;box-shadow:0 25px 90px #000e}
  .stash-header,.stash-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 18px;flex-shrink:0}
  .stash-header{border-bottom:1px solid #61513b}
  h2{font:1.5rem Georgia,serif;color:#ecdcc0;margin:0}
  .stash-header p{font-size:.75rem;color:#aeb8b9;margin:4px 0 0}
  .close-button{min-width:40px;min-height:40px}
  .stash-tabs{display:flex;gap:6px;padding:8px 18px;flex-shrink:0}
  .stash-tabs button{flex:1;min-width:0;min-height:40px;background:#1c222a;border:1px solid #736044;color:#d8c8ab;padding:6px;cursor:pointer}
  .stash-tabs button.active{background:#393128;border-color:#e7b86e;color:#ffe0a2}
  .stash-tabs button.drop-ready{outline:2px solid #81cfa2;outline-offset:-2px}
  .stash-tabs button.drop-hover{outline:3px solid #c2f7bc;background:#294636}
  .stash-tabs small{font-size:.65rem;margin-left:4px}
  .stash-body{flex:1 1 0;min-height:0;overflow:auto;scrollbar-gutter:stable;padding:8px 18px 12px}
  .stash-filters{display:flex;gap:8px;align-items:flex-end;margin-bottom:12px}
  .stash-controls{flex:1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
  .stash-controls label{display:flex;flex-direction:column;gap:3px;min-width:0;font-size:.69rem;color:#cdbb9b}
  .stash-controls input,.stash-controls select,.stash-actions select{width:100%;min-width:0;min-height:36px;color:#eee2c7;border:1px solid #675845;background:#17202a;padding:6px;font-size:.75rem}
  .stash-organize,.stash-actions button,.stash-click-transfer button{min-height:40px;padding:7px 10px;border:1px solid #8b7a5f;background:#2d3137;color:#e7dac0;cursor:pointer}
  .stash-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(200px,.85fr);gap:14px;align-items:start}
  .stash-pane,.stash-inspector{min-width:0;background:#111b24;border:1px solid #4f5047;padding:12px}
  h3{font:1rem Georgia,serif;color:#e3c99e;margin:0 0 10px}
  .stash-list{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;padding:3px;border:2px solid transparent}
  .stash-list.drop-ready{border-color:#81cfa2;border-style:dashed}
  .stash-list.drop-hover{border-style:solid;background:#24403277}
  .stash-cell{position:relative;min-width:0;aspect-ratio:1;display:grid;place-items:center;padding:3px;border:1px solid #39434c;background:#101820}
  .stash-cell.occupied{background:radial-gradient(circle at 50% 30%,#26313a,#111820 75%);cursor:grab}
  .stash-cell.empty{background:#0b121a}
  .stash-cell.filtered{background:repeating-linear-gradient(135deg,#151e25,#151e25 5px,#0b121a 5px,#0b121a 10px)}
  .stash-cell.selected{outline:2px solid #e8cc91;outline-offset:-2px}
  .stash-cell.move-source{outline:2px solid #86c9a2;background:#233a32;outline-offset:-2px}
  .stash-cell[draggable="false"]{cursor:default}
  .stash-cell small,.protected-mark{position:absolute;font-size:.64rem;bottom:1px;right:3px;color:#f2d7a0}
  .protected-mark{top:1px;left:3px;bottom:auto;right:auto}
  .stash-item-ident{display:block;width:100%;max-width:46px;aspect-ratio:1}
  .stash-inspector{min-height:200px;max-height:460px;overflow:auto;scrollbar-gutter:stable}
  .detail-heading{display:flex;align-items:center;gap:9px;margin-bottom:10px}
  .detail-heading>div{display:flex;flex-direction:column;gap:4px;min-width:0;overflow-wrap:anywhere}
  .detail-heading small{font-size:.68rem;color:#aeb8b9}
  .detail-heading strong{font:1rem Georgia,serif}
  .detail-art{width:54px;height:54px;flex-shrink:0}
  .detail-stat{display:flex;justify-content:space-between;gap:6px;padding:6px 0;border-bottom:1px solid #29313b;font-size:.77rem;color:#c2cbd0}
  .detail-stat strong{color:#f0ddbd}
  .detail-affix{font-size:.73rem;color:#b1d1b7;overflow-wrap:anywhere}
  .stash-inspector p{font-size:.76rem}
  .stash-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
  .stash-actions button,.stash-actions select{flex:1 1 100%}
  .stash-actions button:disabled,.stash-click-transfer button:disabled{opacity:.45;cursor:not-allowed}
  .stash-click-transfer{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px;padding:7px;border:1px solid #6e8c76;background:#1b3329;color:#d3ebd6;font-size:.74rem}
  .stash-transfer-error{color:#f0b9a2;font-size:.73rem}
  .stash-empty,.stash-footer small{color:#b9b5a7;font-size:.72rem}
  .stash-footer{border-top:1px solid #61513b}
  .stash-footer button{min-height:40px}
  @media(max-width:900px){.stash-columns{grid-template-columns:repeat(2,minmax(0,1fr))}.stash-inspector{grid-column:1/-1;max-height:none;min-height:140px}.stash-actions button,.stash-actions select{flex:1 1 120px}}
  @media(max-width:600px){.stash-header,.stash-footer{padding:7px 9px}.stash-header p,.stash-footer small{display:none}.stash-tabs{padding:6px 9px}.stash-tabs small{display:block;margin:1px 0 0}.stash-body{padding:6px 9px}.stash-filters{flex-wrap:wrap}.stash-controls{flex-basis:100%;grid-template-columns:repeat(2,minmax(0,1fr))}.stash-columns{gap:7px}.stash-pane,.stash-inspector{padding:7px}.stash-list{grid-template-columns:repeat(4,minmax(0,1fr));gap:3px;padding:1px}.stash-inspector{min-height:120px}.stash-actions button,.stash-click-transfer button,.stash-organize{min-height:44px}h2{font-size:1.2rem}h3{font-size:.82rem}}
  @media(max-height:460px){.stash-header,.stash-footer{padding:5px 10px}.stash-header p,.stash-footer small{display:none}.stash-tabs{padding:4px 10px}.stash-body{padding:5px 10px}h2{font-size:1.15rem}}
</style>
