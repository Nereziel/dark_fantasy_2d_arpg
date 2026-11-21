<script lang="ts">
  import type { Item } from '../game/data/items';
  import { itemArtKind } from '../game/items/itemArt';

  let { item, detail = false }: { item: Item; detail?: boolean } = $props();
  let kind = $derived(itemArtKind(item.templateId));
</script>

<!-- Original vector artwork avoids platform-dependent missing Unicode glyphs.
     The parent owns the translated item name and rarity outline. -->
<svg class="item-art" class:detail viewBox="0 0 48 48"
  xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"
  data-item-art={item.templateId} data-icon-kind={kind}>
  <path d="M24 2 44 13v22L24 46 4 35V13Z" fill="#0d1822" stroke="currentColor"
    stroke-opacity=".35" stroke-width="1.1" />
  <path d="M9 15 24 7 39 15M10 33l14 8 14-8" fill="none"
    stroke="currentColor" stroke-width=".8" opacity=".25"/>
  {#if kind === 'sword' || kind === 'greatsword' || kind === 'dagger'}
    <path d={kind === 'dagger' ? 'M24 8 28 22 24 30 20 22Z' :
      kind === 'greatsword' ? 'M24 5 30 13 28 31H20L18 13Z' :
      'M24 6 28 11 27 31H21L20 11Z'}
      fill="#b7c5c8" stroke="#e7f1ec" stroke-width="1.2"/>
    <path d="M24 9v21" stroke="#495e6e" stroke-width="1.5"/>
    <path d="M12 31h24l-5 4H17Z" fill="#96774b" stroke="#d1b47b"/>
    <path d="M22 34h4v9h-4z" fill="#835a42"/>
    <circle cx="24" cy="42" r="2.8" fill="#d5a968"/>
  {:else if kind === 'axe' || kind === 'greataxe' || kind === 'mace' || kind === 'hammer'}
    <path d="M20 8h5v34h-5z" fill="#8d6f56" stroke="#d1a875" stroke-width="1"/>
    {#if kind === 'axe' || kind === 'greataxe'}
      <path d={kind === 'greataxe' ? 'M23 8 39 5Q32 18 41 27L25 23 23 19 8 27Q16 17 7 5Z' :
        'M23 9 39 7Q33 16 39 25L25 22 23 17Z'}
        fill="#c5d2d2" stroke="#e0ebe6" stroke-width="1.2"/>
    {:else if kind === 'hammer'}
      <path d="M8 9h32v14H8z" fill="#899daa" stroke="#cfdcdd" stroke-width="1.7"/>
      <path d="M11 12h26M11 19h26" stroke="#465968" stroke-width="2"/>
    {:else}
      <path d="M24 7 35 14v13l-11 7-11-7V14Z" fill="#8597a2" stroke="#d3ddda" stroke-width="1.3"/>
      <path d="M17 16h14M17 25h14" stroke="#4c5a62" stroke-width="2"/>
    {/if}
  {:else if kind === 'spear'}
    <path d="M22 20h4v25h-4z" fill="#a07852" stroke="#cfab75"/>
    <path d="M24 3 32 17l-8 10-8-10Z" fill="#c1d3d6" stroke="#e5ede9" stroke-width="1.4"/>
    <path d="M24 8v15" stroke="#5e7a83" stroke-width="1.4"/>
  {:else if kind === 'bow' || kind === 'crossbow'}
    <path d={kind === 'bow' ? 'M14 6Q43 24 14 42' : 'M7 12Q24 2 41 12'}
      fill="none" stroke="#b88754" stroke-width="4"/>
    <path d={kind === 'bow' ? 'M14 6V42' : 'M7 12H41'} fill="none"
      stroke="#e6ddbd" stroke-width="1.2"/>
    {#if kind === 'crossbow'}
      <path d="M22 9h4v33h-4z" fill="#a28b65" stroke="#e0c991"/>
      <path d="M24 5 28 13 20 13Z" fill="#d8dee2"/>
    {:else}
      <path d="M14 24h24m-8-5 8 5-8 5" fill="none" stroke="#a6c5ca" stroke-width="2"/>
    {/if}
  {:else if kind === 'staff' || kind === 'wand'}
    <path d={kind === 'wand' ? 'M16 38 29 14' : 'M17 42 29 9'} stroke="#a58463"
      stroke-width={kind === 'staff' ? 5 : 3} stroke-linecap="round" />
    <path d="M29 6 38 14 29 23 20 14Z" fill="#a5d0ce"
      stroke="#e8f0d7" stroke-width="1.5"/>
    <path d="M29 9v12M23 14h12" stroke="#427a88" stroke-width="1.2"/>
    <circle cx="29" cy="14" r="3.2" fill="#e9dfb5"/>
  {:else if kind === 'spellbook'}
    <path d="M11 9Q19 6 24 10Q32 6 38 9v31Q29 36 24 40Q19 36 11 40Z"
      fill="#667d92" stroke="#c2d6d2" stroke-width="1.7"/>
    <path d="M24 11v29" stroke="#cfb47e" stroke-width="2"/>
    <path d="M16 17h5m-5 5h5m6-5h6m-6 5h6" stroke="#e8d4a6" stroke-width="1.5"/>
    <circle cx="24" cy="29" r="3" fill="#d2bd7b"/>
  {:else if kind === 'shield'}
    <path d="M24 6 39 11v16Q35 36 24 42 13 36 9 27V11Z"
      fill="#7b8991" stroke="#d9d5bd" stroke-width="2"/>
    <path d="M24 11v25M14 20h20" stroke="#c9ad76" stroke-width="3"/>
    <path d="M24 16 29 24l-5 8-5-8Z" fill="#344c59" stroke="#e3d3a2"/>
  {:else if kind === 'helmet'}
    <path d="M10 24Q8 8 24 7Q40 8 38 24l-6 17h-5V28h-6v13h-5Z"
      fill="#929b9e" stroke="#d3d8d2" stroke-width="1.5"/>
    <path d="M12 24h25M24 9v14" stroke="#596d7b" stroke-width="3"/>
    <path d="M15 29h7m5 0h7" stroke="#121d29" stroke-width="2.5"/>
  {:else if kind === 'armor'}
    <path d="M15 8 9 14 6 27 15 30 17 42h14l2-12 9-3-3-13-7-6-8 6Z"
      fill="#879c9b" stroke="#d9d9c7" stroke-width="1.4"/>
    <path d="M15 13 24 19 33 13M17 23l7 6 7-6M24 19v20" fill="none"
      stroke="#d5ae74" stroke-width="2"/>
  {:else if kind === 'gloves'}
    <path d="M13 19 10 12 14 10 19 18V8h4v10l3-11 4 2-2 13 6-6 3 3-9 15-4 7H15l-6-13Z"
      fill="#8b958b" stroke="#e0d4b8" stroke-width="1.5"/>
    <path d="M14 28h17M17 34h12" stroke="#b29060" stroke-width="2"/>
  {:else if kind === 'boots'}
    <path d="M15 9h14l-2 18 10 4 3 7H9v-6l7-4Z"
      fill="#876b5b" stroke="#e2bc8d" stroke-width="1.5"/>
    <path d="M16 16h12M14 23h14M9 36h31" stroke="#c0a383" stroke-width="2"/>
  {:else if kind === 'belt'}
    <path d="M7 17h34v15H7Z" fill="#8a674b" stroke="#dbc39c" stroke-width="1.5"/>
    <path d="M17 13h14v23H17z" fill="#ad9875" stroke="#f1d9a6" stroke-width="2"/>
    <path d="M23 19h6v10h-6Z" fill="#26333f"/>
  {:else if kind === 'ring' || kind === 'amulet'}
    {#if kind === 'ring'}
      <circle cx="24" cy="28" r="12" fill="none" stroke="#d8b67d" stroke-width="6"/>
      <path d="M24 6 34 15l-10 10-10-10Z" fill="#8bd1cd" stroke="#eef0d3" stroke-width="1.4"/>
    {:else}
      <path d="M11 10Q24 29 37 10" fill="none" stroke="#d4b584" stroke-width="2.5"/>
      <path d="M24 17 36 29 24 43 12 29Z" fill="#b45468" stroke="#f2d6be" stroke-width="2"/>
      <path d="M24 20v19M15 29h18" stroke="#e4a9a5" stroke-width="1.2"/>
    {/if}
  {:else if kind === 'relic'}
    <path d="M24 5 34 16 41 25 33 37 24 44 15 37 7 25 14 16Z"
      fill="#5b6f7c" stroke="#e3d0a2" stroke-width="1.7"/>
    <path d="M24 11v26M11 25h26M16 16l16 20M32 16 16 36" stroke="#b6d4cf" stroke-width="2"/>
    <circle cx="24" cy="25" r="5" fill="#ecc889"/>
  {:else if kind === 'charm'}
    <path d="M24 7 36 19 31 38 17 38 12 19Z" fill="#62617f"
      stroke="#e4cbb1" stroke-width="2"/>
    <path d="M24 13 30 21 24 32 18 21Z" fill="#cfaac9"
      stroke="#f7dcca" stroke-width="1.5"/>
    <circle cx="24" cy="9" r="2" fill="#e9ce9f"/>
  {:else}
    <!-- Invalid legacy template still has a visible fallback, never an empty glyph. -->
    <path d="M24 7 39 24 24 41 9 24Z" fill="#617781" stroke="#e3dbbf"/>
    <path d="M24 14v14m0 5v3" stroke="#f1d7ac" stroke-width="3"/>
  {/if}
  <path d="M13 6l3 2M34 40l2 3" stroke="currentColor" stroke-width="1.2" opacity=".7"/>
</svg>

<style>
  .item-art {
    display:block;width:100%;height:100%;max-width:48px;max-height:48px;
    margin:auto;overflow:visible;filter:drop-shadow(0 2px 3px #000c);
    flex:0 0 auto;pointer-events:none;
  }
  .item-art.detail { max-width:68px;max-height:68px; }
</style>
