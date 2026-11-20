<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import type { GameBridge } from '../game/bridge/GameBridge';
  import {
    activatedWaypoints, waypointDefinition, type WaypointId
  } from '../game/world/waypointTravel';

  let { view, bridge }: { view: GameSnapshot; bridge: GameBridge } = $props();
  let active = $derived(activatedWaypoints(
    view.mapDiscovery?.activatedWaypointIds ?? [], view.activatedCheckpointIds ?? []));

  /** Presentation hint only; every action is revalidated inside GameSimulation. */
  function canDepart(destination: WaypointId): boolean {
    if (!view.player.alive || view.zone !== 'wilderness') return false;
    return active.some(id => {
      if (id === destination) return false;
      const source = waypointDefinition(id);
      return !!source && Math.hypot(
        source.position.x - view.player.x,
        source.position.y - view.player.y
      ) <= source.interactionRange;
    });
  }
</script>

<section class="travel-panel" aria-label={$t('waypoints.title')}>
  <h3>{$t('waypoints.title')}</h3>
  <p>{$t('waypoints.requireActivation')}</p>
  {#if active.length === 0}
    <p class="travel-warning">{$t('waypoints.noActive')}</p>
  {:else}
    <div class="destinations">
      {#each active as id (id)}
        {@const waypoint = waypointDefinition(id)}
        {#if waypoint}
          <button class="destination" data-waypoint-destination={id}
            disabled={!canDepart(id)}
            onclick={() => bridge.command({ type: 'travelWaypoint', destinationId: id })}>
            <span class="travel-mark">✧</span>
            <span>{$t(waypoint.nameKey)}</span>
            <small>{canDepart(id) ? $t('waypoints.travel') : $t('waypoints.unavailable')}</small>
          </button>
        {/if}
      {/each}
    </div>
    {#if !active.some(id => canDepart(id))}
      <p class="travel-warning">{$t('waypoints.nearSource')}</p>
    {/if}
  {/if}
</section>

<style>
  .travel-panel{padding:10px;margin:10px 0;border:1px solid #786950;background:#141c24ec;max-height:220px;overflow:auto}
  .travel-panel h3{font-size:.94rem;color:#e5c78f;margin:0 0 7px}
  .travel-panel p{font-size:.75rem;color:#c6bcae;margin:5px 0 8px}
  .travel-panel .travel-warning{color:#b5a4a0}
  .destinations{display:flex;gap:7px;flex-wrap:wrap}
  .destination{min-width:175px;display:flex;gap:7px;align-items:center;justify-content:center;flex-wrap:wrap;padding:9px;color:#e3d7bc;border:1px solid #c0a36c;background:#26313a;cursor:pointer}
  .destination small{font-size:.64rem;color:#9ec4c9}
  .destination:disabled{opacity:.55;cursor:default}
  .travel-mark{font-size:1.2rem;color:#96cedd}
</style>
