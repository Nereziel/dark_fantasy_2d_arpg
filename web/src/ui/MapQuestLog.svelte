<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { JournalEntry } from '../game/ui/questTracking';
  let {entries,trackedId,select,compact=false}:{entries:JournalEntry[];trackedId:string|null;select:(id:string)=>void;compact?:boolean}=$props();
  let inspectedId=$state<string|null>(null);
  let inspected=$derived(entries.find(e=>e.id===inspectedId)??entries.find(e=>e.id===trackedId)??entries[0]??null);
  let openEntries=$derived(entries.filter(e=>e.status!=='completed'));
  let completed=$derived(entries.filter(e=>e.status==='completed'));
</script>
{#snippet row(entry:JournalEntry)}
  <button type="button" class="quest-row" class:tracked={entry.id===trackedId} class:inspected={!compact&&entry.id===inspected?.id}
    data-testid={compact?'track-quest-'+entry.id:'inspect-quest-'+entry.id}
    aria-pressed={compact?entry.id===trackedId:entry.id===inspected?.id}
    title={compact?$t(entry.id===trackedId?'map.untrack':'map.track'):undefined}
    onclick={()=>{if(compact)select(entry.id);else inspectedId=entry.id;}}>
    <span aria-hidden="true">{entry.id===trackedId?'◆':entry.status==='completed'?'✓':'◇'}</span>
    <span><strong>{$t(entry.titleKey)}</strong><small>{$t('map.'+entry.status)}{#if entry.status==='active'} · {entry.count}/{entry.goal}{/if}</small></span>
  </button>
{/snippet}
{#if compact}
  <aside class="quest-selector" data-testid="map-quest-selector" aria-label={$t('map.tracked')}>
    <h3>{$t('map.questLog')}</h3>
    {#if openEntries.length}<p class="tracking-hint">{$t(trackedId?'map.toggleTracking':'map.noTracking')}</p>{/if}
    {#each openEntries as entry (entry.id)}{@render row(entry)}{:else}<p>{$t('map.noQuests')}</p>{/each}
  </aside>
{:else}
  <div class="quest-book" data-testid="quest-book">
    <aside class="quest-selector" aria-label={$t('map.questLog')}>
      <h3>{$t('map.active')}</h3>
      {#each openEntries as entry (entry.id)}{@render row(entry)}{:else}<p>{$t('map.noQuests')}</p>{/each}
      {#if completed.length}<h3>{$t('map.completed')}</h3>{#each completed as entry (entry.id)}{@render row(entry)}{/each}{/if}
    </aside>
    <article class="quest-detail" data-testid="quest-detail">
      {#if inspected}
        <h3>{$t(inspected.titleKey)}</h3>
        <small>{$t('map.'+inspected.status)}</small>
        <p class="description">{$t(inspected.descriptionKey)}</p>
        <h4>{$t('map.objective')}</h4>
        <p>{$t(inspected.hintKey??inspected.objectiveKey)}</p>
        {#if inspected.status==='active'||inspected.status==='ready'}
          <progress value={inspected.count} max={inspected.goal} aria-label={$t(inspected.objectiveKey)}></progress>
          <small>{inspected.count}/{inspected.goal}</small>
        {/if}
        <h4>{$t('quest.ashes.reward')}</h4>
        <p class="reward">{inspected.gold} {$t('hud.gold')} · {inspected.xp} XP</p>
        {#if inspected.status!=='completed'}<button type="button" class="track-action" data-testid={'journal-track-'+inspected.id} aria-pressed={inspected.id===trackedId}
          onclick={()=>{if(inspected)select(inspected.id);}}>{inspected.id===trackedId?'◆ ':''}{$t(inspected.id===trackedId?'map.untrack':'map.track')}</button>{/if}
      {:else}<p>{$t('map.noQuests')}</p>{/if}
    </article>
  </div>
{/if}
<style>
  .quest-book{display:grid;grid-template-columns:minmax(150px,30%) minmax(0,1fr);gap:12px;min-height:0;overflow:hidden}
  .quest-selector,.quest-detail{min-width:0;min-height:0;overflow:auto;scrollbar-gutter:stable;background:#111a24;border:1px solid #6f5a3e;padding:10px}
  h3{font:1rem Georgia,serif;color:#e8ce9c;margin:0 0 9px}
  .quest-row{display:grid;grid-template-columns:auto minmax(0,1fr);gap:7px;text-align:left;width:100%;padding:8px;margin-bottom:5px;background:#18232d;border:1px solid #44515a;color:#d4c2a0}
  .quest-row.tracked{border-color:#d8ad68}
  .tracking-hint{font-size:.68rem;color:#b8c3c4;margin-bottom:8px}
  .quest-row.inspected{background:#302b23}
  .quest-row strong{display:block;font:.8rem Georgia,serif;color:#ecd8b5;overflow-wrap:anywhere}
  small{font-size:.69rem;color:#d2bc96}
  .quest-detail{padding:20px}
  .quest-detail h3{font-size:1.35rem}
  h4{font:.9rem Georgia,serif;color:#e8ce9c;margin:18px 0 6px}
  p{font-size:.8rem;line-height:1.5;margin:6px 0;color:#d4d5cd}
  .description{color:#b8c3c4}
  .reward{color:#d9bc82}
  progress{width:100%;height:7px;accent-color:#d7b471}
  .track-action{min-height:36px;background:#262d35;border:1px solid #847052;color:#e9d4ae;padding:7px 14px;margin-top:10px}
  .track-action[aria-pressed=true]{border-color:#dcba78;color:#ffe4aa}
</style>
