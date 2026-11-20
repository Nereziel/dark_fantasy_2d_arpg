<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { MapProjection, MapMarkerKind } from '../game/world/mapDiscovery';

  let { projection, compact = false }: {
    projection: MapProjection;
    compact?: boolean;
  } = $props();

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
    <rect x={projection.viewport.x} y={projection.viewport.y}
      width={projection.viewport.width} height={projection.viewport.height}
      fill="#0c111b" />
    {#each projection.cells as cell (cell.id)}
      <rect x={cell.x} y={cell.y} width={cell.width} height={cell.height}
        fill={cell.visibility === 'discovered' ? '#263a36' : '#10131b'}
        stroke={cell.visibility === 'discovered' ? '#617160' : '#252d36'}
        stroke-width="1.5" data-fog-cell={cell.id} data-fog={cell.visibility} />
    {/each}
    {#each projection.markers as marker (marker.id)}
      <g data-map-marker={marker.id} data-marker-kind={marker.kind}>
        <circle cx={marker.position.x} cy={marker.position.y}
          r={marker.kind === 'player' ? 14 : marker.kind === 'quest' ? 12 : 9}
          fill={markerColor(marker.kind)} stroke="#070c13" stroke-width="4" />
        {#if marker.kind === 'player'}
          <circle cx={marker.position.x} cy={marker.position.y} r="25"
            fill="none" stroke="#f3dfad" stroke-width="2" />
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
    background: #10171d;
    border: 1px solid #766950;
    overflow: hidden;
  }
  .map-canvas svg { display: block; width: 100%; height: 100%; min-height: 0; }
  .map-canvas.compact { aspect-ratio: 3 / 2; border-color: #88795d; }
  .map-hints { display: flex; flex-wrap: wrap; gap: 10px; padding: 10px;
    color: #dfc795; font-size: .8rem; background: #0c1119; }
  .map-hints span:before { content: '◆ '; color: #bda476; }
</style>
