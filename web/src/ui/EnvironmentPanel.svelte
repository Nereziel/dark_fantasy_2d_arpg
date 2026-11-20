<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';

  let {view}:{view:GameSnapshot}=$props();
  let near=$derived((view.environmentObjects??[])
    .filter(obj=>Math.hypot(obj.position.x-view.player.x,
      obj.position.y-view.player.y)<=190)
    .sort((a,b)=>Math.hypot(a.position.x-view.player.x,a.position.y-view.player.y)
      -Math.hypot(b.position.x-view.player.x,b.position.y-view.player.y))
    .slice(0,3));
  let blessings=$derived(view.environmentBlessings??[]);
</script>

{#if view.zone==='wilderness'&&view.player.alive&&(near.length||blessings.length)}
  <aside class="environment-panel" aria-label={$t('environment.title')} data-environment-panel>
    <h3>{$t('environment.title')}</h3>
    {#each near as obj (obj.id)}
      <div class="environment-object" data-environment-object={obj.id}>
        <span>{$t('environment.objects.'+obj.id.slice(4))}</span>
        {#if obj.requiresId && !view.environmentUsedIds?.includes(obj.requiresId)}
          <small>{$t('environment.locked')}</small>
        {:else}
          <small>{$t('environment.click')}</small>
        {/if}
      </div>
    {/each}
    {#each blessings as buff (buff.kind)}
      <div class="environment-buff" data-blessing={buff.kind}>
        <span>{$t('environment.bonuses.'+buff.kind)}</span>
        <small>{Math.ceil(buff.remaining)}s</small>
      </div>
    {/each}
  </aside>
{/if}

<style>
  .environment-panel{
    position:fixed;left:18px;bottom:116px;z-index:9;
    width:min(235px,35vw);padding:9px 11px;
    background:#121c27ed;border:1px solid #74614d;
    color:#dfceb7;pointer-events:none;max-height:230px;overflow:hidden;
    box-shadow:0 6px 17px #0008;
  }
  .environment-panel h3{
    color:#e9c68b;font-family:Georgia,serif;
    margin:0 0 8px;font-size:.79rem;letter-spacing:.06em;
  }
  .environment-object,.environment-buff{
    border-top:1px solid #554935;padding:4px 0;
    display:flex;align-items:center;justify-content:space-between;gap:9px;
    font-size:.72rem;
  }
  .environment-object small{color:#aca598;font-size:.64rem;text-align:right;}
  .environment-buff span{color:#abd8bc;}
  .environment-buff small{font-variant-numeric:tabular-nums;color:#cedfbf;}
  @media(max-width:700px){
    .environment-panel{left:6px;bottom:96px;width:150px;padding:6px;max-height:153px;}
    .environment-object,.environment-buff{font-size:.64rem;}
  }
</style>
