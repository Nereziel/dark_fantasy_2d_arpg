<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import { worldEventReward } from '../game/world/worldEvents';

  let { view }: { view: GameSnapshot } = $props();
  let entries = $derived((view.worldEvents ?? []).filter(event =>
    event.status === 'active'
    || Math.hypot(event.position.x - view.player.x, event.position.y - view.player.y) < 225));
</script>

{#if view.zone === 'wilderness' && view.player.alive && entries.length}
  <aside class="event-panel" aria-label={$t('worldEvents.title')} data-world-events>
    <h3>{$t('worldEvents.title')}</h3>
    {#each entries as event (event.id)}
      {@const reward = worldEventReward(event.kind, view.level)}
      <div class="event-row" data-world-event={event.id} data-event-state={event.status}>
        <div class="event-name">
          <strong>{$t('worldEvents.kinds.' + event.kind)}</strong>
          <span>{$t('worldEvents.regions.' + event.region)}</span>
        </div>
        <div class="event-progress">
          {#if event.status === 'active'}
            {$t('worldEvents.defeatGuards')}: {event.total - event.remaining}/{event.total}
          {:else}
            {$t('worldEvents.status.' + event.status)}
          {/if}
        </div>
        {#if reward}
          <div class="event-reward">
            {$t('worldEvents.reward')}: {reward.xp} {$t('worldEvents.xp')},
            {reward.gold} {$t('hud.gold')} · {$t('worldEvents.materialsAndLoot')}
          </div>
        {/if}
      </div>
    {/each}
  </aside>
{/if}

<style>
  .event-panel{position:fixed;top:110px;right:18px;z-index:10;
    width:min(272px,35vw);max-height:270px;overflow:hidden;
    border:1px solid #836950;background:#111b26ed;
    box-shadow:0 7px 20px #0009;color:#efdec6;padding:12px;
    pointer-events:none}
  .event-panel h3{font-family:Georgia,serif;letter-spacing:.07em;
    margin:0 0 9px;font-size:.82rem;color:#e4be80}
  .event-row{padding:6px 0;border-top:1px solid #504636}
  .event-name{display:flex;justify-content:space-between;gap:8px;align-items:center}
  .event-name strong{font-size:.78rem}
  .event-name span{font-size:.65rem;color:#a7c8c7}
  .event-progress,.event-reward{font-size:.7rem;color:#d1be9d;margin-top:5px}
  .event-row[data-event-state="completed"] .event-progress{color:#9cca9b}
  @media(max-width:700px){.event-panel{top:90px;right:7px;width:155px;padding:7px}
    .event-name{display:block}.event-name span{display:block}
    .event-panel h3{font-size:.72rem}.event-reward{font-size:.62rem}}
</style>
