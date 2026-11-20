<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import type { GameBridge } from '../game/bridge/GameBridge';
  import { RARITIES } from '../game/data/items';
  let { view, bridge, close }: {
    view: GameSnapshot;
    bridge: GameBridge;
    close: () => void;
  } = $props();

  function equip(index: number): void {
    bridge.command({ type: 'equip', index });
  }
  function unequip(slot: keyof GameSnapshot['equipment']): void {
    bridge.command({ type: 'unequip', slot });
  }
  let rarityFilter = $state('ALL');
  let moveSource = $state<number | null>(null);
  function move(index: number): void {
    if (moveSource === null) { moveSource = index; return; }
    bridge.command({ type: 'swapInventory', fromIndex: moveSource, toIndex: index });
    moveSource = null;
  }
  function flag(itemId: string, kind: 'locked' | 'favorite'): void {
    const old = view.itemFlags?.[itemId]?.[kind] ?? false;
    bridge.command({ type: 'setItemFlag', itemId, flag: kind, value: !old });
  }
</script>

<div class="inventory-overlay">
  <div class="inventory-window" role="dialog" aria-modal="true" aria-label={$t('inventory.title')}>
    <header class="inventory-header">
      <div><div class="inventory-kicker">AETHER &amp; RUIN</div><h2>{$t('inventory.title')}</h2></div>
      <button class="close-button" onclick={close} aria-label={$t('inventory.close')}>✕</button>
    </header>

    <div class="inventory-layout">
      <div class="equipment-section">
        <h3>{$t('inventory.equipped')}</h3>
        <div class="equipment-grid">
          {#each Object.entries(view.equipment) as [slot, item] (slot)}
            <div class="equipment-item">
              <div class="equipment-slot-name">{$t('item.slot.' + slot)}</div>
              {#if item}
                <div class="equipment-name" style:color={RARITIES[item.rarity].color}>
                  {item.icon} {$t('item.base.' + item.templateId)}
                </div>
                {#if item.upgrades > 0}
                  <div class="item-temper">{$t('trade.tempering')} +{item.upgrades}/3</div>
                {/if}
                <button class="item-action" onclick={() => unequip(slot as keyof GameSnapshot['equipment'])}>
                  {$t('inventory.unequip')}
                </button>
              {:else}
                <span class="empty-slot">{$t('inventory.empty')}</span>
              {/if}
            </div>
          {/each}
        </div>
        <div class="stat-list">
          <div><span>{$t('stat.armor')}</span><strong>{view.stats.armor}</strong></div>
          <div><span>{$t('stat.strength')}</span><strong>{view.stats.strength}</strong></div>
          <div><span>{$t('stat.dexterity')}</span><strong>{view.stats.dexterity}</strong></div>
          <div><span>{$t('stat.intelligence')}</span><strong>{view.stats.intelligence}</strong></div>
          <div><span>{$t('stat.vitality')}</span><strong>{view.stats.vitality}</strong></div>
          <div><span>{$t('stat.critChance')}</span><strong>{view.stats.critChance}%</strong></div>
        </div>
      </div>

      <div class="backpack-section">
        <div class="bag-heading"><h3>{$t('inventory.bag')}</h3><span>{view.inventory.filter(Boolean).length}/24</span></div>
        <div class="bag-toolbar">
          <button onclick={() => bridge.command({ type: 'sortInventory' })}>{$t('inventory.sort')}</button>
          <label>{$t('inventory.filter')}
            <select bind:value={rarityFilter} aria-label={$t('inventory.filter')}>
              <option value="ALL">{$t('inventory.all')}</option>
              {#each Object.keys(RARITIES) as rarity (rarity)}
                <option value={rarity}>{$t('item.rarity.' + rarity)}</option>
              {/each}
            </select>
          </label>
          {#if moveSource !== null}<span role="status">{$t('inventory.swapPrompt')}</span>{/if}
        </div>
        <div class="bag-grid">
          {#each view.inventory as item, index (index)}
            <div class="bag-slot" class:pending-move={moveSource === index}
              title={item ? $t('item.base.' + item.templateId) : $t('inventory.empty')}>
              {#if item && (rarityFilter === 'ALL' || item.rarity === rarityFilter)}
                {@const delta = bridge.previewEquipment(index)}
                <div class="item-card">
                  <div class="item-visual" style:color={RARITIES[item.rarity].color}>{item.icon}</div>
                  <div class="item-title" style:color={RARITIES[item.rarity].color}>{$t('item.base.' + item.templateId)}</div>
                  <div class="item-rarity">{$t('item.rarity.' + item.rarity)}</div>
                  {#if item.twoHanded}<div class="item-affix">{$t('inventory.twoHanded')}</div>{/if}
                  {#if (item.requiredLevel ?? 1) > 1}
                    <div class="item-affix">{$t('inventory.requireLevel')}: {item.requiredLevel}</div>
                  {/if}
                  {#if (item.sockets?.length ?? 0) > 0}<div class="item-affix">◯ × {item.sockets?.length}</div>{/if}
                  {#if item.legendaryPower}<div class="item-affix">{item.legendaryPower.id}: {item.legendaryPower.magnitude}</div>{/if}
                  {#if item.upgrades > 0}
                    <div class="item-temper">{$t('trade.tempering')} +{item.upgrades}/3</div>
                  {/if}
                  {#each item.affixes as affix (affix.id)}
                    <div class="item-affix">{$t('item.affix.' + affix.id)} +{affix.value} {$t('stat.' + affix.stat)}</div>
                  {/each}
                  {#if delta}
                    <div class="item-affix">{$t('inventory.comparison')}:
                      {$t('stat.armor')} {delta.armor >= 0 ? '+' : ''}{delta.armor},
                      {$t('stat.damageMin')} {delta.damageMin >= 0 ? '+' : ''}{delta.damageMin},
                      {$t('stat.maxHealth')} {delta.maxHealth >= 0 ? '+' : ''}{delta.maxHealth}
                    </div>
                  {/if}
                  <button class="item-action" onclick={() => equip(index)}>{$t('inventory.equip')}</button>
                  <div class="bag-actions">
                    <button onclick={() => flag(item.id, 'favorite')}>{$t(view.itemFlags?.[item.id]?.favorite ? 'inventory.unfavorite' : 'inventory.favorite')}</button>
                    <button onclick={() => flag(item.id, 'locked')}>{$t(view.itemFlags?.[item.id]?.locked ? 'inventory.unlock' : 'inventory.lock')}</button>
                    <button onclick={() => move(index)}>{$t('inventory.move')}</button>
                    <button onclick={() => bridge.command({ type: 'dropInventory', index })}>{$t('inventory.drop')}</button>
                  </div>
                </div>
              {:else}
                {#if moveSource !== null}<button class="empty-symbol" onclick={() => move(index)} aria-label={$t('inventory.move')}>◇</button>
                {:else}<span class="empty-symbol" aria-hidden="true">◇</span>{/if}
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .inventory-overlay {position:absolute;inset:0;z-index:7;background:#05070abd;display:grid;place-items:center;padding:22px}
  .inventory-window {width:min(1050px,100%);height:min(770px,92vh);background:linear-gradient(145deg,#1b232c,#0b1018);border:1px solid #a0875f;box-shadow:0 22px 85px #000e;display:flex;flex-direction:column;overflow:hidden}
  .inventory-header{display:flex;align-items:center;justify-content:space-between;padding:17px 24px;border-bottom:1px solid #554a38}
  h2{font:1.5rem Georgia,serif;color:#ecddbd;margin:5px 0 0}
  h3{font:1.12rem Georgia,serif;color:#cbb58e;margin:0 0 13px}
  .inventory-kicker{font-size:.59rem;letter-spacing:.24em;color:#897e6a}
  .close-button{padding:9px 13px}
  .inventory-layout{display:grid;grid-template-columns:1fr 1.25fr;gap:20px;padding:22px 24px;overflow:auto}
  .equipment-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .equipment-item{border:1px solid #41454b;background:#101823;padding:10px;min-height:78px;display:flex;flex-direction:column;gap:5px}
  .equipment-slot-name{color:#a6a9a8;font-size:.7rem}
  .equipment-name{font-size:.82rem}
  .item-action{border:1px solid #766346;background:#30281e;color:#e8d6b3;font-size:.69rem;padding:5px 7px;align-self:flex-start;margin-top:auto}
  .empty-slot{color:#68727b;font-size:.72rem;margin:auto 0}
  .stat-list{margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:8px;color:#bdc5c7;font-size:.76rem}
  .stat-list>div{display:flex;justify-content:space-between;gap:5px;border-bottom:1px solid #424a4f;padding:6px}
  .stat-list strong{color:#eadab5}
  .bag-heading{display:flex;justify-content:space-between;color:#b3b2ae}
  .bag-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
  .bag-slot{border:1px solid #3a434c;min-height:100px;background:#0c131b;padding:7px}
  .empty-symbol{display:grid;place-items:center;height:100%;color:#28353e;background:transparent;border:0;width:100%}
  .pending-move{outline:2px solid #c99c67}
  .bag-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0 10px;font-size:.72rem}
  .bag-toolbar select{background:#101823;color:#e0d5ba;border:1px solid #746448;margin-left:6px}
  .bag-toolbar button,.bag-actions button{background:#1b2630;color:#e0d6be;border:1px solid #5c6470;padding:3px 5px;font-size:.65rem}
  .bag-actions{display:flex;flex-wrap:wrap;gap:4px}
  .item-card{display:flex;flex-direction:column;gap:4px;min-height:90px}
  .item-visual{font-size:1.2rem}.item-title{font-size:.77rem}
  .item-rarity,.item-affix{font-size:.63rem;color:#adb5b8}
  .item-temper{font-size:.66rem;color:#e8c080}
  @media(max-width:750px){.inventory-layout{grid-template-columns:1fr}.inventory-window{height:96vh}.bag-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
</style>
