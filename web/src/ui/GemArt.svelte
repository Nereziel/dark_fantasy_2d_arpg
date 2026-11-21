<script lang="ts">
  import type { GemId } from '../game/gems/gemCatalog';
  import { gemArtVariant } from '../game/gems/gemArt';
  let { gemId, compact = false }: { gemId: GemId; compact?: boolean } = $props();
  let art = $derived(gemArtVariant(gemId));
  let color = $derived(art?.baseId === 'gem.ruby' ? '#df5f67'
    : art?.baseId === 'gem.sapphire' ? '#6dafe4'
    : art?.baseId === 'gem.emerald' ? '#65c99c'
    : art?.baseId === 'rune.ash' ? '#d59b62'
    : art?.baseId === 'rune.ward' ? '#c4c2a1' : '#aa9bd9');
</script>

<svg viewBox="0 0 48 48" class="gem-art" class:compact
  xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"
  data-gem-art={art?.baseId ?? 'invalid'} data-gem-tier={art?.tier ?? 0}>
  <circle cx="24" cy="24" r="21" fill="#111b24" stroke={color}
    stroke-opacity=".5" stroke-width="1.4"/>
  {#if art?.kind === 'gem'}
    {#if art.baseId === 'gem.ruby'}
      <path d="M15 7h18l11 14-20 24L4 21Z"
        fill={color} stroke="#ffdfd2" stroke-width="1.6"/>
      <path d="M15 7 12 21l12 24 12-24-3-14M4 21h40M12 21h24"
        fill="none" stroke="#572631" stroke-width="1.8" opacity=".8"/>
    {:else if art.baseId === 'gem.sapphire'}
      <path d="M24 3 40 13v22L24 45 8 35V13Z"
        fill={color} stroke="#d8f3ff" stroke-width="1.6"/>
      <path d="M24 3v42M8 13h32M8 35h32M8 13l16 12 16-12M8 35l16-10 16 10"
        fill="none" stroke="#345c8a" stroke-width="1.6"/>
      <circle cx="24" cy="25" r="4" fill="#edf9ff"/>
    {:else}
      <path d="M16 4h16l10 12v17L32 44H16L6 33V16Z"
        fill={color} stroke="#d8ffe1" stroke-width="1.6"/>
      <path d="M16 4v40M32 4v40M6 16h36M6 33h36M16 16l8 9 8-9M16 33l8-8 8 8"
        fill="none" stroke="#276d5b" stroke-width="1.5"/>
    {/if}
    <path d="M15 13 20 10" stroke="#fff8e0" stroke-width="2.5" stroke-linecap="round"/>
  {:else if art?.kind === 'rune'}
    <path d="M24 4 39 11 43 29 30 43 12 40 5 22 13 8Z"
      fill={art.baseId === 'rune.ash' ? '#544638' :
        art.baseId === 'rune.ward' ? '#495659' : '#4b4860'}
      stroke={color} stroke-width="1.8"/>
    <path d="M11 14 17 10M12 36l7 4M32 9l6 5M32 38l6-9"
      fill="none" stroke={color} stroke-opacity=".45" stroke-width="1.3"/>
    {#if art.baseId === 'rune.ash'}
      <path d="M25 8 16 27h9l-4 13 14-20h-9Z"
        fill="#ad6b3a" stroke="#f7d69a" stroke-width="2"/>
      <path d="m23 14-2 9h5" fill="none" stroke="#ffd8a4" stroke-width="1.5"/>
    {:else if art.baseId === 'rune.ward'}
      <path d="M24 8 36 15v13Q31 37 24 41Q17 37 12 28V15Z"
        fill="#728487" stroke="#d9dfd1" stroke-width="2"/>
      <path d="M24 12v24M16 24h16" stroke="#f1d99e" stroke-width="3"/>
    {:else}
      <path d="M24 8 34 18 24 39 14 18Z" fill="#9b86cf"
        stroke="#e6d8ff" stroke-width="2"/>
      <circle cx="24" cy="21" r="5" fill="#e5d3ff"/>
      <path d="M24 9v7M24 27v10" stroke="#5a428f" stroke-width="2"/>
    {/if}
  {:else}
    <path d="M24 10 39 24 24 39 9 24Z" fill={color}/>
  {/if}
  {#each Array.from({length:art?.tier ?? 0},(_,i)=>i) as tier (tier)}
    <circle cx={19 + tier * 5} cy="44" r="2.1" fill="#f5e5b6"
      stroke="#1b1b23" stroke-width=".6"/>
  {/each}
</svg>

<style>
  .gem-art{display:inline-block;vertical-align:middle;width:38px;height:38px;
    flex:0 0 38px;filter:drop-shadow(0 2px 3px #000b);pointer-events:none;}
  .gem-art.compact{width:27px;height:27px;flex-basis:27px;}
</style>
