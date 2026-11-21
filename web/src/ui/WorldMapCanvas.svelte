<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { MapProjection, MapMarkerKind } from '../game/world/mapDiscovery';

  let { projection, compact = false }: {
    projection: MapProjection;
    compact?: boolean;
  } = $props();

  // The two projections may coexist while the fullscreen map is open.
  let maskId = $derived(compact ? 'ar-fog-mini' : 'ar-fog-world');
  let blurId = $derived(compact ? 'ar-fog-blur-mini' : 'ar-fog-blur-world');

  function markerColor(kind: MapMarkerKind): string {
    switch (kind) {
      case 'player': return '#f5e1ac';
      case 'town': return '#c8af7b';
      case 'dungeonEntrance': return '#c18c9a';
      case 'quest': return '#e6bd6d';
      case 'waypoint': return '#8dc5dc';
      case 'optionalPoi': return '#91b896';
      default: return '#b8afc6';
    }
  }
</script>

<div class="map-canvas" class:compact data-map-mode={projection.mode}>
  <svg viewBox={`${projection.viewport.x} ${projection.viewport.y} ${projection.viewport.width} ${projection.viewport.height}`}
    preserveAspectRatio="xMidYMid meet" role="img" aria-label={$t('map.title')}>
    <defs>
      <filter id={blurId} x="-8%" y="-8%" width="116%" height="116%">
        <feGaussianBlur stdDeviation={compact ? 10 : 15} />
      </filter>
      <mask id={maskId} maskUnits="userSpaceOnUse"
        x={projection.viewport.x} y={projection.viewport.y}
        width={projection.viewport.width} height={projection.viewport.height}>
        <rect x={projection.viewport.x} y={projection.viewport.y}
          width={projection.viewport.width} height={projection.viewport.height} fill="black" />
        <g filter={'url(#' + blurId + ')'}>
          {#each projection.cells as cell (cell.id)}
            {#if cell.visibility === 'discovered'}
              <rect x={cell.x - 2} y={cell.y - 2} width={cell.width + 4}
                height={cell.height + 4} fill="white" />
            {/if}
          {/each}
        </g>
      </mask>
    </defs>
    <!-- Unknown cells contain no visual terrain metadata; reveal has soft edges. -->
    <rect x={projection.viewport.x} y={projection.viewport.y}
      width={projection.viewport.width} height={projection.viewport.height} fill="#0b1117" />
    <rect x={projection.viewport.x} y={projection.viewport.y}
      width={projection.viewport.width} height={projection.viewport.height}
      fill="#2d3c35" mask={'url(#' + maskId + ')'} />
    {#each projection.cells as cell (cell.id)}
      <rect x={cell.x} y={cell.y} width={cell.width} height={cell.height}
        fill="none" stroke="none"
        data-fog-cell={cell.id} data-fog={cell.visibility} />
    {/each}
    {#each projection.markers as marker (marker.id)}
      <g data-map-marker={marker.id} data-marker-kind={marker.kind}>
        <circle cx={marker.position.x} cy={marker.position.y}
          r={marker.kind === 'player' ? 14 : marker.kind === 'quest' ? 12 : 9}
          fill={markerColor(marker.kind)} stroke="#070c13" stroke-width="4" />
        {#if marker.kind === 'player'}
          <circle cx={marker.position.x} cy={marker.position.y} r="25"
            fill="none" stroke="#f3dfad" stroke-width="2" />
        {:else if marker.kind === 'waypoint'}
          <circle cx={marker.position.x} cy={marker.position.y} r={marker.activated ? 18 : 14}
            fill="none" stroke={marker.activated ? '#9fe9ec' : '#6d8290'}
            stroke-width={marker.activated ? 3 : 2}
            data-waypoint-active={marker.activated ? 'true' : 'false'} />
        {/if}
        {#if !compact}
          <text x={marker.position.x + 19} y={marker.position.y - 15}
            fill="#f1e1cc" stroke="#0b1018" stroke-width="3" paint-order="stroke"
            font-family="Georgia,serif" font-size="23">{$t(marker.presentationKey)}</text>
        {/if}
        <title>{$t(marker.presentationKey)}</title>
      </g>
    {/each}
  </svg>
  {#if !compact && projection.hints.length}
    <div class="map-hints">
      {#each projection.hints as hint (hint.id)}
        <span>{$t(hint.presentationKey ?? 'map.unknownQuest')}</span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .map-canvas {
    display: grid;
    grid-template-rows: 1fr auto;
    width: 100%;
    min-height: 0;
    background: #0b1117;
    border: 1px solid #766950;
    overflow: hidden;
  }
  .map-canvas svg { display: block; width: 100%; height: 100%; min-height: 0; }
  .map-canvas.compact { aspect-ratio: 3 / 2; border-color: #88795d; }
  .map-hints { display: flex; flex-wrap: wrap; gap: 10px; padding: 10px;
    color: #dfc795; font-size: .8rem; background: #0c1119; }
  .map-hints span:before { content: '◆ '; color: #bda476; }
</style>
