<script lang="ts">
  import { onMount } from 'svelte';
  import { _ as t, locale } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import type { GameBridge } from '../game/bridge/GameBridge';
  import type { Item, RarityId } from '../game/data/items';
  import ItemArt from './ItemArt.svelte';
  import { normalizeGroundLootFilter, type GroundLootFilter,
    type GroundLootCategory } from '../game/items/groundLootVisibility';
  import { RARITIES } from '../game/data/items';
  import { WEAPON_TYPES } from '../game/items/itemCatalog';
  import { itemDisplayName } from '../game/items/itemName';

  let { view, bridge, close }: { view: GameSnapshot; bridge: GameBridge; close: () => void } = $props();
  type EquipmentSlot = keyof GameSnapshot['equipment'];
  type Source = { kind: 'bag'; index: number } | { kind: 'gear'; slot: EquipmentSlot };

  const slots: readonly EquipmentSlot[] = [
    'HELMET', 'MAIN_HAND', 'CHEST', 'OFF_HAND', 'GLOVES', 'BELT',
    'BOOTS', 'RING_1', 'AMULET', 'RING_2', 'RELIC', 'CHARM'
  ];
  let rarityFilter = $state('ALL');
  // Read initial props through a closure, then keep selection as independent UI state.
  function initialSelection(): Source | null {
    const index = view.inventory.findIndex(Boolean);
    if (index >= 0) return { kind: 'bag', index };
    const slot = slots.find(slot => !!view.equipment[slot]);
    return slot ? { kind: 'gear', slot } : null;
  }
  let selected = $state<Source | null>(initialSelection());
  let hovered = $state<Source | null>(null);
  let dragged = $state<Source | null>(null);
  let dropHover = $state<Source | null>(null);
  let helpOpen = $state(false);
  let placementMessage = $state('');
  const groundFilterStorageKey = 'aether-ruin-ground-loot-filter-v1';
  let lootFilter: GroundLootFilter = $state(bridge.groundLootFilter());
  onMount(() => {
    try {
      const saved = window.localStorage.getItem(groundFilterStorageKey);
      if (saved) {
        lootFilter = normalizeGroundLootFilter(JSON.parse(saved));
        bridge.setGroundLootFilter(lootFilter);
      }
    } catch { /* Invalid preferences never break inventory or save. */ }
  });
  function updateLootFilter(next: GroundLootFilter): void {
    lootFilter = normalizeGroundLootFilter(next);
    bridge.setGroundLootFilter(lootFilter);
    try { window.localStorage.setItem(groundFilterStorageKey, JSON.stringify(lootFilter)); }
    catch { /* Private browsing still permits session-only filters. */ }
  }
  // A touch tap inspects. Reorganizing items requires the explicit mobile move action.
  let touchInput = $state(false);
  let moveArmed = $state(false);

  let placementSource = $derived(dragged ?? (moveArmed ? selected : null));
  function canPlace(target: Source, source: Source | null = placementSource): boolean {
    if (!source) return false;
    if (target.kind === 'gear') return source.kind === 'bag'
      && !!view.inventory[source.index] && bridge.previewEquipment(source.index, target.slot) !== null;
    if (source.kind === 'bag') return source.index !== target.index && !!view.inventory[source.index];
    if (!view.equipment[source.slot]) return false;
    return !view.inventory[target.index]
      || bridge.previewEquipment(target.index, source.slot) !== null;
  }
  function isDropHover(target: Source): boolean {
    if (!dropHover || dropHover.kind !== target.kind) return false;
    if (dropHover.kind === 'bag' && target.kind === 'bag') {
      return dropHover.index === target.index;
    }
    return dropHover.kind === 'gear' && target.kind === 'gear'
      && dropHover.slot === target.slot;
  }
  function clearDrag(): void { dragged = null; dropHover = null; }

  let displayed = $derived(touchInput ? selected : (hovered ?? selected));
  let inspected = $derived.by((): Item | null => {
    if (!displayed) return null;
    return displayed.kind === 'bag' ? view.inventory[displayed.index] ?? null
      : view.equipment[displayed.slot];
  });
  let comparedSlot = $derived.by((): EquipmentSlot | null => {
    if (!displayed || !inspected) return null;
    return displayed.kind === 'gear' ? displayed.slot : inspected.slot;
  });
  let equippedItem = $derived(comparedSlot ? view.equipment[comparedSlot] : null);
  let delta = $derived(displayed?.kind === 'bag'
    ? bridge.previewEquipment(displayed.index) : null);

  function itemName(item: Item): string {
    return itemDisplayName(item, $locale ?? 'en', $t('item.base.' + item.templateId));
  }
  function equip(index: number, slot?: EquipmentSlot): void {
    const item = view.inventory[index];
    if (!item) return;
    if (bridge.previewEquipment(index, slot) === null) {
      placementMessage = $t('inventory.invalidPlacement');
      return;
    }
    bridge.command({ type: 'equip', index, ...(slot ? { slot } : {}) });
    selected = { kind: 'gear', slot: slot ?? item.slot };
    placementMessage = '';
    moveArmed = false;
  }
  function unequip(slot: EquipmentSlot): void {
    if (!view.equipment[slot]) return;
    bridge.command({ type: 'unequip', slot });
    selected = null;
    moveArmed = false;
  }
  function flag(item: Item, kind: 'favorite' | 'locked'): void {
    bridge.command({ type: 'setItemFlag', itemId: item.id, flag: kind,
      value: !(view.itemFlags?.[item.id]?.[kind] ?? false) });
  }
  function pickBag(index: number): void {
    if (touchInput && !moveArmed) {
      selected = view.inventory[index] ? { kind: 'bag', index } : null;
      return;
    }
    if (touchInput && moveArmed && selected && !canPlace({ kind: 'bag', index }, selected)) {
      placementMessage = $t('inventory.invalidPlacement'); return;
    }
    placementMessage = '';
    moveArmed = false;
    if (selected?.kind === 'bag' && selected.index !== index) {
      bridge.command({ type: 'swapInventory', fromIndex: selected.index, toIndex: index });
      selected = null;
    } else if (selected?.kind === 'gear') {
      if (view.inventory[index]) equip(index, selected.slot);
      else bridge.command({ type: 'unequipTo', slot: selected.slot, index });
      selected = null;
    } else {
      selected = view.inventory[index] ? { kind: 'bag', index } : null;
    }
  }
  function pickGear(slot: EquipmentSlot): void {
    if (touchInput && !moveArmed) {
      selected = view.equipment[slot] ? { kind: 'gear', slot } : null;
      return;
    }
    if (touchInput && moveArmed && selected && !canPlace({ kind: 'gear', slot }, selected)) {
      placementMessage = $t('inventory.invalidPlacement'); return;
    }
    placementMessage = '';
    moveArmed = false;
    if (selected?.kind === 'bag') equip(selected.index, slot);
    else selected = view.equipment[slot] ? { kind: 'gear', slot } : null;
  }
  function startDrag(event: DragEvent, source: Source): void {
    moveArmed = false;
    dragged = source;
    selected = source;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', 'aether-inventory');
    }
  }
  function permitDrop(event: DragEvent, target: Source): void {
    if (!dragged) return;
    event.preventDefault();
    dropHover = target;
    if (event.dataTransfer) event.dataTransfer.dropEffect = canPlace(target, dragged) ? 'move' : 'none';
  }
  function dropBag(event: DragEvent, index: number): void {
    if (!dragged) return;
    event.preventDefault();
    const source = dragged;
    const valid = canPlace({ kind: 'bag', index }, source);
    clearDrag();
    if (!valid) { placementMessage = $t('inventory.invalidPlacement'); return; }
    placementMessage = '';
    moveArmed = false;
    if (source.kind === 'bag' && source.index !== index) {
      bridge.command({ type: 'swapInventory', fromIndex: source.index, toIndex: index });
    } else if (source.kind === 'gear') {
      if (view.inventory[index]) equip(index, source.slot);
      else bridge.command({ type: 'unequipTo', slot: source.slot, index });
    }
    selected = null;
  }
  function dropGear(event: DragEvent, slot: EquipmentSlot): void {
    if (!dragged) return;
    event.preventDefault();
    const source = dragged;
    const valid = canPlace({ kind: 'gear', slot }, source);
    clearDrag();
    if (!valid) { placementMessage = $t('inventory.invalidPlacement'); return; }
    placementMessage = '';
    moveArmed = false;
    if (source.kind === 'bag') equip(source.index, slot);
    selected = null;
  }
  const stats = [
    { key: 'armor', label: 'stat.armor' },
    { key: 'damageMin', label: 'stat.damageMin' },
    { key: 'damageMax', label: 'stat.damageMax' },
    { key: 'maxHealth', label: 'stat.maxHealth' },
    { key: 'critChance', label: 'stat.critChance' },
    { key: 'attackSpeed', label: 'stat.attackSpeed' },
    { key: 'blockChance', label: 'stat.blockChance' },
    { key: 'fireResist', label: 'stat.fireResist' }
  ] as const;
  function sign(value: number): string {
    return value > 0 ? '+' + value : String(value);
  }
  function equipInspected(slot?: EquipmentSlot): void {
    if (displayed?.kind === 'bag') equip(displayed.index, slot);
  }
  function unequipInspected(): void {
    if (displayed?.kind === 'gear') unequip(displayed.slot);
  }
  function flagInspected(kind: 'locked' | 'favorite'): void {
    if (inspected) flag(inspected, kind);
  }
  function dropInspected(): void {
    if (displayed?.kind === 'bag') bridge.command({ type: 'dropInventory', index: displayed.index });
  }
</script>

<div class="inventory-overlay">
  <div class="inventory-window" role="dialog" aria-modal="true" aria-label={$t('inventory.title')}>
    <header class="inventory-header">
      <div>
        <span class="kicker">AETHER &amp; RUIN / EQUIPMENT</span>
        <h2>{$t('inventory.title')}</h2>
      </div>
      <div class="header-controls">
        <button class="help-toggle" onclick={() => { helpOpen = !helpOpen; }} aria-expanded={helpOpen}>
          {$locale === 'cs' ? 'Ovládání' : 'Controls'}
        </button>
        <button class="close-button" onclick={close} aria-label={$t('inventory.close')}>✕</button>
      </div>
    </header>

    {#if helpOpen}
      <p class="help-note">
        {$locale === 'cs'
          ? 'Mobil: klepnutím zobrazíš statistiky, tlačítkem Přesunout klepnutím zvolíš cílový slot. Na počítači přetahuj předměty mezi batohem a výbavou, dvojklikem nasazuj nebo sundávej. Najeď myší pro porovnání.'
          : 'Touch: tap an item to inspect it, then use Move by tap to choose a destination. Desktop: drag between bag and equipment, double-click to equip or unequip, or hover to compare.'}
      </p>
    {/if}

    <div class="inventory-layout">
      <section class="equipment-section" aria-label={$t('inventory.equipped')}>
        <h3>{$t('inventory.equipped')}</h3>
        <div class="equipment-grid">
          {#each slots as slot (slot)}
            {@const item = view.equipment[slot]}
            <button type="button" class="equipment-slot"
              class:has-item={!!item}
              class:selected={selected?.kind === 'gear' && selected.slot === slot}
               class:drop-valid={!!placementSource && canPlace({ kind: 'gear', slot })}
               class:drop-hover-valid={!!placementSource && isDropHover({ kind: 'gear', slot }) && canPlace({ kind: 'gear', slot })}
               class:drop-invalid={!!placementSource && isDropHover({ kind: 'gear', slot }) && !canPlace({ kind: 'gear', slot })}
              style:grid-area={slot}
              style:border-color={item ? RARITIES[item.rarity].color : undefined}
              data-equipment-slot={slot}
              draggable={!!item}
              onpointerdown={(event) => { touchInput = event.pointerType !== 'mouse'; }}
              ondragstart={(event) => startDrag(event, { kind: 'gear', slot })}
              ondragend={clearDrag}
              ondragover={(event) => permitDrop(event, { kind: 'gear', slot })}
               ondragleave={() => { if (isDropHover({ kind: 'gear', slot })) dropHover = null; }}
              ondrop={(event) => dropGear(event, slot)}
              onpointerenter={() => { hovered = { kind: 'gear', slot }; }}
              onpointerleave={() => { hovered = null; }}
              onfocus={() => { hovered = { kind: 'gear', slot }; }}
              onclick={() => pickGear(slot)}
              ondblclick={() => { if (!touchInput) unequip(slot); }}
              aria-label={$t('item.slot.' + slot) + (item ? ': ' + itemName(item) : ': ' + $t('inventory.empty'))}
              title={item ? itemName(item) : $t('inventory.empty')}>
              <span class="slot-label">{$t('item.slot.' + slot)}</span>
              <span class="slot-icon" style:color={item ? RARITIES[item.rarity].color : '#55616a'}>
                {#if item}<ItemArt {item} />{:else}<span aria-hidden="true">◇</span>{/if}
              </span>
              {#if item?.upgrades}<span class="slot-level">+{item.upgrades}</span>{/if}
            </button>
          {/each}
        </div>
        <div class="core-stats">
          <div><span>{$t('stat.armor')}</span><strong>{view.stats.armor}</strong></div>
          <div><span>{$t('stat.damageMin')}–{$t('stat.damageMax')}</span>
            <strong>{view.stats.damageMin}–{view.stats.damageMax}</strong></div>
          <div><span>{$t('stat.critChance')}</span><strong>{view.stats.critChance}%</strong></div>
          <div><span>{$t('stat.maxHealth')}</span><strong>{view.stats.maxHealth}</strong></div>
        </div>
      </section>

      <section class="backpack-section" aria-label={$t('inventory.bag')}>
        <div class="bag-heading">
          <h3>{$t('inventory.bag')}</h3>
          <span>{view.inventory.filter(Boolean).length} / {view.inventory.length}</span>
        </div>
        <div class="bag-toolbar">
          <label>
            {$t('inventory.filter')}
            <select value={rarityFilter} aria-label={$t('inventory.filter')}
              onchange={(event) => {
                rarityFilter = event.currentTarget.value;
                selected = null;
                hovered = null;
                dragged = null;
                moveArmed = false;
              }}>
              <option value="ALL">{$t('inventory.all')}</option>
              {#each Object.keys(RARITIES) as rarity (rarity)}
                <option value={rarity}>{$t('item.rarity.' + rarity)}</option>
              {/each}
            </select>
          </label>
          <button onclick={() => { selected = null; bridge.command({ type: 'sortInventory' }); }}>
            {$t('inventory.sort')}
          </button>
        </div>
        <div class="ground-loot-settings" data-testid="ground-loot-filter">
          <strong>{$t('inventory.groundLootFilter')}</strong>
          <label>
            {$t('inventory.minRarity')}
            <select aria-label={$t('inventory.minRarity')} value={lootFilter.minRarity}
              onchange={event => updateLootFilter({ ...lootFilter,
                minRarity: event.currentTarget.value as RarityId })}>
              {#each Object.keys(RARITIES) as rarity (rarity)}
                <option value={rarity}>{$t('item.rarity.' + rarity)}</option>
              {/each}
            </select>
          </label>
          <label>
            {$t('inventory.itemCategory')}
            <select aria-label={$t('inventory.itemCategory')} value={lootFilter.category}
              onchange={event => updateLootFilter({ ...lootFilter,
                category: event.currentTarget.value as GroundLootCategory })}>
              <option value="all">{$t('inventory.lootAll')}</option>
              <option value="weapons">{$t('inventory.lootWeapons')}</option>
              <option value="armor">{$t('inventory.lootArmor')}</option>
              <option value="accessories">{$t('inventory.lootAccessories')}</option>
            </select>
          </label>
          <label class="favorite-filter">
            <input type="checkbox" checked={lootFilter.alwaysShowFavorites}
              onchange={event => updateLootFilter({ ...lootFilter,
                alwaysShowFavorites: event.currentTarget.checked })} />
            {$t('inventory.alwaysShowFavorites')}
          </label>
        </div>
        <div class="bag-grid" role="group" aria-label={$t('inventory.bag')}>
          {#each view.inventory as item,index (index)}
            {@const filtered = !!item && rarityFilter !== 'ALL' && item.rarity !== rarityFilter}
            <button type="button" class="bag-slot"
              class:occupied={!!item}
              class:filtered-out={filtered}
              class:selected={!filtered && selected?.kind === 'bag' && selected.index === index}
              class:favorite={!!(item && view.itemFlags?.[item.id]?.favorite)}
              class:locked={!!(item && view.itemFlags?.[item.id]?.locked)}
               class:drop-valid={!filtered && !!placementSource && canPlace({ kind: 'bag', index })}
               class:drop-hover-valid={!filtered && !!placementSource && isDropHover({ kind: 'bag', index }) && canPlace({ kind: 'bag', index })}
               class:drop-invalid={!!placementSource && isDropHover({ kind: 'bag', index }) && !canPlace({ kind: 'bag', index })}
              style:border-color={item ? RARITIES[item.rarity].color : undefined}
              data-bag-index={index}
              disabled={filtered}
              draggable={!!item && !filtered}
              onpointerdown={(event) => { touchInput = event.pointerType !== 'mouse'; }}
              ondragstart={(event) => { if (filtered) event.preventDefault(); else startDrag(event, { kind: 'bag', index }); }}
              ondragend={clearDrag}
              ondragover={(event) => { if (!filtered) permitDrop(event, { kind: 'bag', index }); }}
               ondragleave={() => { if (isDropHover({ kind: 'bag', index })) dropHover = null; }}
              ondrop={(event) => { if (!filtered) dropBag(event,index); }}
              onpointerenter={() => { hovered = item && !filtered ? { kind: 'bag', index } : null; }}
              onpointerleave={() => { hovered = null; }}
              onfocus={() => { hovered = item && !filtered ? { kind: 'bag', index } : null; }}
              onclick={() => { if (!filtered) pickBag(index); }}
              ondblclick={() => { if (item && !filtered && !touchInput) equip(index); }}
              oncontextmenu={(event) => { if (item && !filtered) { event.preventDefault(); if (!touchInput) equip(index); } }}
              aria-label={item ? itemName(item) : $t('inventory.empty')}
              title={item ? itemName(item) : $t('inventory.empty')}>
              {#if item}
                <span class="bag-item-icon" style:color={RARITIES[item.rarity].color}>
                  <ItemArt {item} />
                </span>
                <span class="sr-only">{itemName(item)}</span>
                <span class="item-level">{item.level}</span>
                {#if view.itemFlags?.[item.id]?.favorite}<span class="favorite-mark">★</span>{/if}
                {#if view.itemFlags?.[item.id]?.locked}<span class="lock-mark">◆</span>{/if}
              {:else}
                <span class="empty-icon" aria-hidden="true">·</span>
              {/if}
            </button>
          {/each}
        </div>
        <div class="bag-footer">
          <span class="desktop-hint">{$locale === 'cs' ? 'Přetahování · dvojklik pro nasazení' : 'Drag & drop · double-click to equip'}</span>
          <span class="touch-hint">{$locale === 'cs' ? 'Klepni pro náhled · přesun přes tlačítko výše' : 'Tap to inspect · use Move by tap'}</span>
          {#if selected?.kind === 'bag'}
            <button onclick={() => { selected = null; }}>{$locale === 'cs' ? 'Zrušit výběr' : 'Clear selection'}</button>
          {/if}
        </div>
      </section>

      <aside class="item-inspector" data-testid="item-inspector"
        aria-label={$locale === 'cs' ? 'Porovnání výbavy' : 'Equipment comparison'}>
        <h3>{$t('inventory.comparison')}</h3>
        {#if inspected}
          <div class="touch-move-bar">
            <button type="button" aria-pressed={moveArmed}
              onclick={() => { touchInput = true; placementMessage = ''; moveArmed = !moveArmed; }}>
              {$locale === 'cs'
                ? (moveArmed ? 'Zrušit přesun' : 'Přesunout klepnutím')
                : (moveArmed ? 'Cancel move' : 'Move by tap')}
            </button>
            {#if moveArmed}
              <span role="status">{$locale === 'cs'
                ? 'Klepni na cílový slot.'
                : 'Tap the destination slot.'}</span>
            {/if}
          </div>
          {#if placementMessage}
            <p class="placement-error" role="status">{placementMessage}</p>
          {/if}
          <div class="comparison-grid">
            <section class="item-detail">
              <span class="detail-tag">{$locale === 'cs'
                ? (displayed?.kind === 'gear' ? 'NASAZENO' : 'V BATOHU')
                : (displayed?.kind === 'gear' ? 'EQUIPPED' : 'IN BAG')}</span>
              <span class="detail-icon" style:color={RARITIES[inspected.rarity].color}>
                <ItemArt item={inspected} detail />
              </span>
              <strong class="item-title" style:color={RARITIES[inspected.rarity].color}>
                {itemName(inspected)}
              </strong>
              <span class="rarity-label">{$t('item.rarity.' + inspected.rarity)} · {$t('inventory.requireLevel')} {inspected.requiredLevel ?? 1}</span>
              <div class="item-property"><span>{$t('stat.damageMin')}–{$t('stat.damageMax')}</span><strong>{inspected.minDmg}–{inspected.maxDmg}</strong></div>
              <div class="item-property"><span>{$t('stat.armor')}</span><strong>{inspected.armor}</strong></div>
              <div class="item-property"><span>{$t('stat.blockChance')}</span><strong>{inspected.block}%</strong></div>
              {#if inspected.twoHanded}
                <p>{$t('inventory.twoHanded')}</p>
                {#if displayed?.kind === 'bag' && view.equipment.OFF_HAND}
                  <p class="two-hand-warning">{$t('inventory.twoHandPreview')}</p>
                {/if}
              {/if}
              {#if inspected.sockets?.length}<p>◯ {inspected.sockets?.length}</p>{/if}
              {#if inspected.upgrades > 0}<p>{$t('trade.tempering')} +{inspected.upgrades}</p>{/if}
              {#if inspected.legendaryPower}<p>{$t('inventory.legendaryPower')}: +{inspected.legendaryPower.magnitude}</p>{/if}
              {#each inspected.affixes as affix,i (i)}
                <div class="affix-line">{$t('item.affix.' + affix.id)} · +{affix.value} {$t('stat.' + affix.stat)}</div>
              {/each}
            </section>
            <section class="item-detail comparison-equipped">
              <span class="detail-tag">{$locale === 'cs' ? 'SROVNÁNÍ S NASAZENÝM' : 'CURRENT EQUIPMENT'}</span>
              {#if displayed?.kind === 'bag' && equippedItem}
                <span class="detail-icon" style:color={RARITIES[equippedItem.rarity].color}>
                  <ItemArt item={equippedItem} detail />
                </span>
                <strong class="item-title" style:color={RARITIES[equippedItem.rarity].color}>{itemName(equippedItem)}</strong>
                <span class="rarity-label">{$t('item.rarity.' + equippedItem.rarity)}</span>
                <div class="item-property"><span>{$t('stat.damageMin')}–{$t('stat.damageMax')}</span><strong>{equippedItem.minDmg}–{equippedItem.maxDmg}</strong></div>
                <div class="item-property"><span>{$t('stat.armor')}</span><strong>{equippedItem.armor}</strong></div>
                <div class="item-property"><span>{$t('stat.blockChance')}</span><strong>{equippedItem.block}%</strong></div>
                {#each equippedItem.affixes as affix,i (i)}
                  <div class="affix-line">{$t('item.affix.' + affix.id)} · +{affix.value} {$t('stat.' + affix.stat)}</div>
                {/each}
              {:else if displayed?.kind === 'gear'}
                <p class="detail-placeholder">
                  {$locale === 'cs' ? 'Tento předmět je nasazen. Najeď na předmět v batohu pro srovnání.' : 'This item is equipped. Hover a bag item for a side-by-side comparison.'}
                </p>
              {:else}
                <p class="detail-placeholder">
                  {$locale === 'cs' ? 'Prázdný slot. Předmět lze nasadit dvojklikem nebo přetažením.' : 'Empty equipment slot. Double-click or drag the item to equip it.'}
                </p>
              {/if}
            </section>
          </div>
          {#if displayed?.kind === 'bag'}
            <div class="stat-deltas" data-testid="item-stat-comparison">
              <h4>{$locale === 'cs' ? 'Změna statistik po nasazení' : 'Stats after equipping'}</h4>
              {#if delta}
                {#each stats as stat (stat.key)}
                  <div data-stat={stat.key}>
                    <span>{$t(stat.label)}</span>
                    <span class="before">{view.stats[stat.key]}</span>
                    <span class="arrow">→</span>
                    <strong class:gain={delta[stat.key] > 0} class:loss={delta[stat.key] < 0}>
                      {view.stats[stat.key] + delta[stat.key]}
                      <small>({sign(delta[stat.key])})</small>
                    </strong>
                  </div>
                {/each}
              {:else}
                <p class="invalid-equip">{$locale === 'cs'
                  ? 'Předmět nelze nasadit: zkontroluj úroveň, typ slotu nebo druhou ruku.'
                  : 'Cannot equip: check the required level, slot type or two-handed conflict.'}</p>
              {/if}
            </div>
            <div class="inspector-actions">
              <button class="primary-action" disabled={!delta} onclick={() => equipInspected()}>
                {$t('inventory.equip')}
              </button>
              {#if inspected.weaponType && WEAPON_TYPES[inspected.weaponType].canOffHand}
                <button onclick={() => equipInspected('OFF_HAND')}>{$t('inventory.offHandEquip')}</button>
              {/if}
              <button onclick={() => flagInspected('favorite')}>
                {$t(view.itemFlags?.[inspected.id]?.favorite ? 'inventory.unfavorite' : 'inventory.favorite')}
              </button>
              <button onclick={() => flagInspected('locked')}>
                {$t(view.itemFlags?.[inspected.id]?.locked ? 'inventory.unlock' : 'inventory.lock')}
              </button>
              <button onclick={dropInspected}>
                {$t('inventory.drop')}
              </button>
            </div>
          {:else if displayed?.kind === 'gear'}
            <div class="inspector-actions">
              <button class="primary-action" onclick={unequipInspected}>
                {$t('inventory.unequip')}
              </button>
            </div>
          {/if}
        {:else}
          <div class="inspect-placeholder">
            <span class="placeholder-glyph">✧</span>
            <p>{$locale === 'cs'
              ? 'Najeď kurzorem na předmět v batohu nebo na nasazenou výbavu. Tady se ukážou vlastnosti a přesné rozdíly.'
              : 'Hover a bag item or equipped gear to see its attributes and exact character-stat differences.'}</p>
          </div>
        {/if}
      </aside>
    </div>
  </div>
</div>

<style>
  .inventory-overlay{position:absolute;inset:0;z-index:40;display:grid;place-items:center;background:#03060bdf;padding:clamp(8px,2vh,24px)}
  .inventory-window{width:min(1320px,100%);max-height:min(850px,96dvh);min-height:0;display:flex;flex-direction:column;overflow:hidden;background:linear-gradient(155deg,#20242c,#0b111a 70%);border:1px solid #9d845d;box-shadow:0 25px 90px #000e}
  .inventory-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 20px;border-bottom:1px solid #61513b}
  .kicker{font-size:.58rem;letter-spacing:.2em;color:#a59678}
  h2{font:1.5rem Georgia,serif;color:#ecdcc0;margin:3px 0 0}
  h3{font:1.1rem Georgia,serif;color:#d8bd8e;margin:0 0 12px}
  .header-controls{display:flex;gap:7px}
  .header-controls button,.bag-toolbar button,.bag-footer button,.inspector-actions button{border:1px solid #70614d;background:#202831;color:#e9dcc1;font-size:.74rem;padding:7px 10px}
  .help-note{padding:9px 20px;margin:0;color:#e2cda9;background:#232620;border-bottom:1px solid #625745;font-size:.76rem}
  .inventory-layout{display:grid;grid-template-columns:minmax(245px,.95fr) minmax(275px,1fr) minmax(300px,1.2fr);gap:18px;min-height:0;overflow:auto;padding:18px}
  .equipment-section,.backpack-section,.item-inspector{min-width:0}
  .equipment-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-areas:
    ". HELMET ."
    "MAIN_HAND CHEST OFF_HAND"
    "GLOVES BELT BOOTS"
    "RING_1 AMULET RING_2"
    ". RELIC CHARM";gap:8px;justify-items:stretch}
  .equipment-slot{position:relative;min-width:0;aspect-ratio:1.2;border:1px solid #45505a;background:radial-gradient(circle at center,#1c2930,#0a121a);padding:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
  .equipment-slot.has-item{background:radial-gradient(circle at center,#222d36,#131822)}
  .equipment-slot.selected,.bag-slot.selected{outline:2px solid #f0d199;outline-offset:1px}
  .equipment-slot.drop-valid,.bag-slot.drop-valid{outline:2px solid #81cfa2;outline-offset:-3px;box-shadow:inset 0 0 13px #357b4c66,0 0 10px #5dbb8280}
  .equipment-slot.drop-hover-valid,.bag-slot.drop-hover-valid{outline:3px solid #c2f7bc;outline-offset:-2px;background:#294636;box-shadow:0 0 18px #87e29d91}
  .equipment-slot.drop-invalid,.bag-slot.drop-invalid{outline:2px dashed #d57e80;outline-offset:-3px;box-shadow:inset 0 0 9px #9a393944}
  .equipment-slot:focus-visible,.bag-slot:focus-visible{outline:2px solid #d8bf8d;outline-offset:1px}
  .slot-label{font-size:clamp(.55rem,.65vw,.7rem);color:#b4b3ae;text-align:center;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .slot-icon{font:clamp(1.3rem,2vw,2rem) Georgia,serif;line-height:1.1}
  .slot-level{font-size:.6rem;color:#ddb36c;position:absolute;right:4px;bottom:3px}
  .core-stats{display:grid;gap:6px;margin-top:15px}
  .core-stats div{display:flex;justify-content:space-between;gap:8px;padding:7px 9px;background:#141d24;border-bottom:1px solid #3c484e;font-size:.76rem;color:#abb8b9}
  .core-stats strong{color:#ebd9b3;font-variant-numeric:tabular-nums}
  .bag-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#cfc0a9}
  .bag-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;font-size:.72rem;color:#b2b5ae}
  .bag-toolbar label{display:flex;align-items:center;gap:6px;min-width:0}
  .bag-toolbar select{min-width:0;max-width:125px;padding:5px;color:#ddd1b9;border:1px solid #77674d;background:#192027;font-size:.72rem}
  .bag-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px}
  .bag-slot{position:relative;min-width:0;aspect-ratio:1/1.15;display:grid;place-items:center;padding:3px;border:1px solid #39434c;background:#101820}
  .bag-slot.occupied{background:radial-gradient(circle at 50% 30%,#26313a,#111820 75%)}
  .bag-slot.filtered-out{opacity:.35;filter:grayscale(.7);cursor:not-allowed}
  .bag-slot.favorite:before{content:' ';position:absolute;inset:2px;border:1px solid #efc87b80;pointer-events:none}
  .bag-item-icon{font:clamp(1.2rem,2vw,1.8rem) Georgia,serif;color:#ebd6b0;text-shadow:0 2px 7px #000}
  .item-level{position:absolute;bottom:2px;right:4px;font-size:.55rem;color:#a5bbbd}
  .favorite-mark{position:absolute;top:1px;left:3px;font-size:.55rem;color:#eec776}
  .lock-mark{position:absolute;top:1px;right:3px;font-size:.5rem;color:#a6c9d5}
  .empty-icon{font-size:1rem;color:#36434b}
  .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  .bag-footer{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:12px;font-size:.67rem;color:#8f9b9c}
  .item-inspector{padding:14px;border:1px solid #4f5047;background:linear-gradient(#141e26,#0b141c);overflow:auto;max-height:100%}
  .comparison-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .item-detail{min-width:0;display:flex;flex-direction:column;gap:6px;background:#0b121a;border:1px solid #38434b;padding:10px}
  .comparison-equipped{background:#121921}
  .detail-tag{font-size:.58rem;letter-spacing:.1em;color:#b4a17b}
  .detail-icon{font:1.9rem Georgia,serif;text-align:center;margin:4px}
  .item-title{font: .82rem/1.3 Georgia,serif;overflow-wrap:anywhere}
  .rarity-label{font-size:.67rem;color:#acb5b8}
  .item-property{display:flex;justify-content:space-between;gap:4px;font-size:.64rem;color:#aeb8b9;padding:4px 0;border-bottom:1px solid #29313b}
  .item-property strong{color:#f0ddbd;white-space:nowrap}
  .affix-line{font-size:.64rem;line-height:1.4;color:#b1d1b7;overflow-wrap:anywhere}
  .item-detail p{margin:3px 0;font-size:.67rem;color:#cbb18a}
  .detail-placeholder{font-size:.7rem!important;line-height:1.6;color:#a9b4b7!important}
  .stat-deltas{margin-top:12px;border-top:1px solid #5b5143;padding-top:10px}
  h4{font: .85rem Georgia,serif;color:#dec393;margin:0 0 9px}
  .stat-deltas>div{display:grid;grid-template-columns:minmax(90px,1fr) auto auto minmax(68px,auto);align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid #29333c;font-size:.73rem}
  .stat-deltas .before{color:#a6a9a8}.stat-deltas .arrow{color:#756b60}
  .stat-deltas strong{color:#e4ddd0;text-align:right;font-variant-numeric:tabular-nums}
  .stat-deltas small{font-size:.65rem;display:block;color:inherit}
  .stat-deltas .gain{color:#91d6a6}.stat-deltas .loss{color:#e2a098}
  .invalid-equip{font-size:.72rem;color:#e2af8c}
  .inspector-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:13px}
  .inspector-actions .primary-action{border-color:#ba9361;background:#4b3a29}
  .inspect-placeholder{text-align:center;display:grid;place-items:center;min-height:220px;color:#99a8a7;font-size:.8rem;line-height:1.65;padding:16px}
  .placeholder-glyph{font:3rem Georgia,serif;color:#796c55}
  @media(max-width:950px){.inventory-layout{grid-template-columns:minmax(235px,.9fr) minmax(280px,1.1fr)}.item-inspector{grid-column:1/-1;max-height:none}.comparison-grid{grid-template-columns:1fr 1fr}}
  .touch-move-bar,.touch-hint{display:none}
  /* Touch layout: the same full item inspector stays pinned while the player browses
     the bag; no hover-only tooltip or duplicate comparison logic is necessary. */
  @media(max-width:650px){
    .inventory-overlay{padding:4px}
    .inventory-window{max-height:99dvh}
    .inventory-header{padding:9px 10px;gap:7px}
    .kicker{display:none}
    h2{font-size:clamp(1rem,4.5vw,1.3rem)}
    .header-controls{flex-shrink:0;gap:5px}
    .header-controls button{font-size:.65rem;min-height:40px;padding:6px 8px}
    .inventory-layout{
      grid-template-columns:minmax(0,1fr);grid-auto-rows:max-content;
      align-content:start;padding:8px;gap:12px;overscroll-behavior:contain;
    }
    .item-inspector{
      grid-column:1;order:-2;position:sticky;top:0;z-index:5;
      max-height:clamp(170px,34dvh,300px);min-height:0;
      padding:9px 11px;overflow-y:auto;overscroll-behavior:contain;
      box-shadow:0 8px 22px #000b;
    }
    .item-inspector h3{margin:0 0 7px}
    .touch-hint{display:inline}
    .desktop-hint{display:none}
    .touch-move-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px}
    .touch-move-bar button{min-height:38px;padding:6px 10px;background:#46392a;border-color:#af8a58}
    .touch-move-bar button[aria-pressed="true"]{background:#705032;color:#fff3dc}
    .touch-move-bar span{font-size:.73rem;color:#ebd2a0}
    .comparison-grid{grid-template-columns:minmax(0,1fr);gap:7px}
    .item-detail{gap:4px;padding:8px}
    .detail-icon{font-size:1.5rem;margin:2px}
    .item-property,.affix-line{font-size:.72rem}
    .stat-deltas>div{grid-template-columns:minmax(78px,1fr) auto auto minmax(52px,auto);gap:4px}
    .inspect-placeholder{min-height:90px;padding:8px}
    .placeholder-glyph{font-size:1.5rem}
    .backpack-section{order:-1}
    .equipment-section{order:0}
    .bag-grid{max-width:490px;margin:auto}
    .bag-slot{aspect-ratio:1;min-height:40px}
    .equipment-grid{max-width:410px;margin:auto;gap:6px}
    .equipment-slot{aspect-ratio:1.35}
    .inspector-actions button{min-height:38px}
    .help-note{padding:7px 11px}
  }
</style>
