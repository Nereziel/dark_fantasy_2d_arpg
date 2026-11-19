<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import { CLASS_IDS, CLASSES, type ClassId } from '../game/data/classes';
  let { selected, choose }: {
    selected: ClassId;
    choose: (id: ClassId) => void;
  } = $props();
</script>

<div class="class-picker">
  <div class="picker-heading">{$t('menu.selectClass')}</div>
  <div class="class-grid">
    {#each CLASS_IDS as id (id)}
      <button class:chosen={selected === id} class="class-card"
        aria-pressed={selected === id} onclick={() => choose(id)}>
        <span class="class-symbol" aria-hidden="true">{CLASSES[id].icon}</span>
        <span class="class-name">{$t('classes.' + id + '.name')}</span>
        <span class="class-description">{$t('classes.' + id + '.desc')}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .class-picker { width:100%; margin: 15px auto 18px }
  .picker-heading { color:#d3bb90; letter-spacing:.16em; text-transform:uppercase; font-size:.76rem; margin-bottom:11px }
  .class-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px }
  .class-card { display:flex; flex-direction:column;align-items:center;gap:5px;padding:13px 8px 11px;background:#131a23db;border:1px solid #54545b;min-height:115px;transition:.18s }
  .class-card:hover,.class-card:focus-visible {background:#202a34;border-color:#b59a70}
  .class-card.chosen {background:#2e2a26;border-color:#d6ae76;box-shadow:inset 0 0 0 1px #a58a5d}
  .class-symbol {font-family:Georgia,serif;color:#d8b985;font-size:1.65rem}
  .class-name {font-family:Georgia,serif;font-size:.93rem;color:#ece3d3}
  .class-description {color:#a7b2b9;font-size:.62rem;line-height:1.35}
  @media(max-width:560px){.class-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.class-card{min-height:88px}.class-description{display:none}}
</style>
