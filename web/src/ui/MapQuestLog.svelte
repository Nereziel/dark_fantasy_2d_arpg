<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { JournalEntry } from '../game/ui/questTracking';
  let {entries,trackedId,select}:{entries:JournalEntry[];trackedId:string|null;select:(id:string)=>void}=$props();
</script>
<aside class="map-quest-log" data-testid="map-quest-log" aria-label={$t('map.questLog')}>
  <h3>{$t('map.questLog')}</h3>
  {#each entries as entry (entry.id)}
    <article class:tracked={entry.id===trackedId} class:finished={entry.status==='completed'}>
      <div class="quest-title"><strong>{$t(entry.titleKey)}</strong><small>{$t('map.'+entry.status)}</small></div>
      {#if entry.status!=='completed'}
        <p>{$t(entry.hintKey??entry.objectiveKey)}</p>
        {#if entry.status==='active'}<progress value={entry.count} max={entry.goal} aria-label={$t(entry.objectiveKey)}></progress><small>{entry.count}/{entry.goal}</small>{/if}
        <p class="description">{$t(entry.descriptionKey)}</p>
        <p class="reward">{$t('quest.ashes.reward')}: {entry.gold} {$t('hud.gold')} · {entry.xp} XP</p>
        <button type="button" data-testid={'track-quest-'+entry.id} aria-pressed={entry.id===trackedId}
          onclick={()=>select(entry.id)}>{entry.id===trackedId?'◆ ':''}{$t(entry.id===trackedId?'map.tracked':'map.track')}</button>
      {/if}
    </article>
  {:else}<p>{$t('map.noQuests')}</p>{/each}
</aside>
<style>
  .map-quest-log{min-width:0;min-height:0;overflow:auto;scrollbar-gutter:stable;background:#111a24;border:1px solid #6f5a3e;padding:10px}
  h3{font:1rem Georgia,serif;color:#e8ce9c;margin:0 0 9px}
  article{padding:9px;margin-bottom:7px;background:#18232d;border:1px solid #44515a;overflow-wrap:anywhere}
  article.tracked{border-color:#d8ad68;background:#302b23}
  article.finished{opacity:.75}
  .quest-title{display:flex;flex-wrap:wrap;align-items:center;gap:3px 8px;justify-content:space-between}
  strong{font:.85rem Georgia,serif;color:#ecd8b5}
  small{font-size:.68rem;color:#d2bc96}
  p{font-size:.73rem;line-height:1.4;margin:6px 0;color:#d4d5cd}
  .description{color:#aeb9bb}
  .reward{color:#d9bc82}
  progress{width:100%;height:6px;accent-color:#d7b471}
  button{width:100%;min-height:36px;background:#262d35;border:1px solid #847052;color:#e9d4ae;font-size:.75rem;padding:6px}
  button[aria-pressed=true]{border-color:#dcba78;color:#ffe4aa}
  @media(pointer:coarse){button{min-height:44px}}
</style>
