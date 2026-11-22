<script lang="ts">
  import { _ as t, locale } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import type { GameBridge } from '../game/bridge/GameBridge';
  import { nearbyGroundLoot } from '../game/ui/nearbyGroundLoot';
  import { itemDisplayName } from '../game/items/itemName';
  import ItemArt from './ItemArt.svelte';

  let { view, bridge }: { view: GameSnapshot; bridge: GameBridge } = $props();
  // The filter applies before the projection: hidden ground items are never
  // disclosed here, and tapping cannot duplicate a pickup or mutate loot.
  let drops = $derived(nearbyGroundLoot(
    bridge.visibleGroundLoot(view), view.player
  ));
</script>

{#if drops.length > 0}
  <aside class="nearby-loot" data-testid="nearby-loot" aria-label={$t('nearbyLoot.title')}>
    <strong class="nearby-title">{$t('nearbyLoot.title')}</strong>
    {#each drops as drop (drop.id)}
      {@const name = itemDisplayName(drop.item, $locale ?? 'en',
        $t('item.base.' + drop.item.templateId))}
      <button type="button" data-loot-id={drop.id}
        aria-label={$t('nearbyLoot.pickup') + ': ' + name}
        title={$t('nearbyLoot.pickup') + ': ' + name}
        onclick={() => bridge.command({ type: 'pickup', id: drop.id })}>
        <span class="loot-art" aria-hidden="true"><ItemArt item={drop.item} /></span>
        <span class="loot-name">{name}</span>
        <span class="loot-action" aria-hidden="true">↧</span>
      </button>
    {/each}
  </aside>
{/if}

<style>
  .nearby-loot {
    min-width:0;max-width:100%;flex-shrink:0;
    display:grid;gap:4px;padding:7px;
    background:#101b24f0;border:1px solid #786b50;
    border-left:3px solid #bba472;
    box-shadow:0 7px 18px #0009;
  }
  .nearby-title {
    color:#e6c998;font-size:.71rem;line-height:1.25;
  }
  button {
    width:100%;display:flex;align-items:center;gap:5px;
    min-width:0;min-height:44px;padding:4px 5px;
    text-align:left;background:#24303a;border:1px solid #776951;
    color:#f0e2c9;touch-action:manipulation;
  }
  button:hover,button:focus-visible{border-color:#f3d18a;background:#34404a}
  .loot-art{flex:0 0 23px;width:23px;height:23px;display:grid;place-items:center;overflow:hidden}
  .loot-art :global(svg){max-width:23px;max-height:23px}
  .loot-name{flex:1;min-width:0;overflow-wrap:anywhere;line-height:1.2;font-size:.68rem}
  .loot-action{flex:0 0 auto;color:#dbbf88;font-size:.85rem}
  @media(max-width:650px) {
    .nearby-loot{padding:5px;gap:3px}
    button{min-height:44px;padding:3px}
    .loot-art{flex-basis:18px;width:18px;height:18px}
    .loot-name{font-size:.61rem}
    .loot-action{font-size:.73rem}
  }
</style>
