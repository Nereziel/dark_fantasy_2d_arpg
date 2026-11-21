<script lang="ts">
  import type { GemBaseId, GemId } from '../game/gems/gemCatalog';

  let { id }: { id: GemBaseId | GemId } = $props();
  let tier = $derived(id.endsWith('.3') ? 3 : id.endsWith('.2') ? 2 : 1);
  let isRune = $derived(id.startsWith('rune.'));
</script>

<!-- Original vector silhouettes: each gem/rune family has a distinct shape,
     and tier markers remain legible without relying on hue alone. -->
<svg class="gem-art" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true" focusable="false" data-gem-art={id}
  data-art-kind={isRune ? 'rune' : 'gem'} data-art-tier={tier}>
  <path d="M24 2 44 13v23L24 46 4 36V13Z"
    fill="#0b141d" stroke="#827b75" stroke-width="1.2" />
  {#if id.startsWith('gem.ruby')}
    <path d="M24 5 39 19 33 39 15 39 9 19Z"
      fill="#b84b54" stroke="#f4bbc0" stroke-width="2"/>
    <path d="M24 5v34M9 19h30M15 39l9-20 9 20" fill="none"
      stroke="#ffd8bd" stroke-width="1.4" opacity=".85"/>
  {:else if id.startsWith('gem.sapphire')}
    <path d="M13 9h22l7 15-18 18L6 24Z"
      fill="#426eac" stroke="#b8d6f4" stroke-width="2"/>
    <path d="M13 9 24 20 35 9M6 24h36M24 20v22" fill="none"
      stroke="#dbf1fa" stroke-width="1.5" opacity=".9"/>
  {:else if id.startsWith('gem.emerald')}
    <path d="M14 7h20l8 10v14l-8 10H14L6 31V17Z"
      fill="#39886d" stroke="#bbebc6" stroke-width="2"/>
    <path d="M14 7 18 17h12l4-10M6 17h12v14H6m12 0h12l4 10M30 17h12M30 31h12"
      fill="none" stroke="#e1f5d8" stroke-width="1.35" opacity=".85"/>
  {:else if id.startsWith('rune.ash')}
    <path d="M24 6Q36 18 32 29Q29 20 26 18Q28 28 19 36Q13 30 16 20Q8 29 15 39Q24 45 33 36Q42 25 24 6Z"
      fill="#c8784c" stroke="#f9cb96" stroke-width="2"/>
    <path d="M24 23Q32 34 24 39Q16 34 24 23Z" fill="#f4d590"/>
    <path d="M24 8v12M13 39l6-4M35 38l-6-5" stroke="#ffe7bc" stroke-width="1.5"/>
  {:else if id.startsWith('rune.ward')}
    <path d="M24 5 39 12v14Q35 37 24 43 13 37 9 26V12Z"
      fill="#626c95" stroke="#d3d8f4" stroke-width="2"/>
    <path d="M24 10v29M13 20h22M16 30l8-7 8 7"
      fill="none" stroke="#dfe8fb" stroke-width="3"/>
    <circle cx="24" cy="23" r="3" fill="#a8d8e8"/>
  {:else if id.startsWith('rune.focus')}
    <path d="M24 4 40 24 24 44 8 24Z" fill="#8871ac" stroke="#e4cbf1" stroke-width="2"/>
    <path d="M12 24Q24 11 36 24Q24 37 12 24Z"
      fill="#cdb4dd" stroke="#f7e4d7" stroke-width="1.7"/>
    <circle cx="24" cy="24" r="5" fill="#354c71" stroke="#f1d5a5" stroke-width="1.5"/>
    <path d="M24 7v9M24 33v8" stroke="#eee1bd" stroke-width="2"/>
  {/if}
  {#if tier >= 1}<circle cx="18" cy="43" r="2.1" fill="#f7d9a2" stroke="#222733" stroke-width=".6"/>{/if}
  {#if tier >= 2}<circle cx="24" cy="43" r="2.1" fill="#f7d9a2" stroke="#222733" stroke-width=".6"/>{/if}
  {#if tier >= 3}<circle cx="30" cy="43" r="2.1" fill="#f7d9a2" stroke="#222733" stroke-width=".6"/>{/if}
</svg>

<style>
  .gem-art {
    display:block;width:100%;height:100%;max-width:40px;max-height:40px;
    flex:0 0 auto;pointer-events:none;
    filter:drop-shadow(0 2px 3px #000b);
  }
</style>
