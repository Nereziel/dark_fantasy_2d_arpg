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
</script>

<div class="inventory-overlay">
  <section class="inventory-window" role="dialog" aria-modal="true" aria-label={$t('inventory.title')}>
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
        <div class="bag-grid">
          {#each view.inventory as item, index (index)}
            <div class="bag-slot" title={item ? $t('item.base.' + item.templateId) : $t('inventory.empty')}>
              {#if item}
                <div class="item-card">
                  <div class="item-visual" style:color={RARITIES[item.rarity].color}>{item.icon}</div>
                  <div class="item-title" style:color={RARITIES[item.rarity].color}>{$t('item.base.' + item.templateId)}</div>
                  <div class="item-rarity">{$t('item.rarity.' + item.rarity)}</div>
                  {#each item.affixes as affix (affix.id)}
                    <div class="item-affix">{$t('item.affix.' + affix.id)} +{affix.value} {$t('stat.' + affix.stat)}</div>
                  {/each}
                  <button class="item-action" onclick={() => equip(index)}>{$t('inventory.equip')}</button>
                </div>
              {:else}
                <span class="empty-symbol" aria-hidden="true">◇</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  </section>
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
  .empty-symbol{display:grid;place-items:center;height:100%;color:#28353e}
  .item-card{display:flex;flex-direction:column;gap:4px;min-height:90px}
  .item-visual{font-size:1.2rem}.item-title{font-size:.77rem}
  .item-rarity,.item-affix{font-size:.63rem;color:#adb5b8}
  @media(max-width:750px){.inventory-layout{grid-template-columns:1fr}.inventory-window{height:96vh}.bag-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
</style>
