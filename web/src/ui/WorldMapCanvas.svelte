<script lang="ts">
  import { onMount } from 'svelte';
  import { _ as t } from 'svelte-i18n';
  import { navigationArrow } from '../game/ui/questTracking';
  import type { MapProjection, MapMarkerKind } from '../game/world/mapDiscovery';
  import type { TerrainId } from '../game/world/wildernessTerrain';

  let { projection, compact = false, onPan, onZoom }: {
    projection: MapProjection;
    compact?: boolean;
    /** Positive deltas move the camera toward increasing world coordinates. */
    onPan?: (dx: number, dy: number) => void;
    /** Relative zoom multiplier; the parent clamps and owns camera state. */
    onZoom?: (multiplier: number) => void;
  } = $props();

  let svgElement: SVGSVGElement;
  // Two projections can coexist: IDs must not share a clipPath or visual fog.
  let direction = $derived(navigationArrow(projection.viewport,projection.markers.find(m=>m.kind==='player')?.position??null,projection.navigationTarget?.position??null));
  let clipId = $derived(compact ? 'ar-discovered-mini' : 'ar-discovered-world');

  function terrainColor(id?: TerrainId): string {
    switch (id) {
      case 'town_clearing': return '#485a50';
      case 'dark_grass': return '#34463e';
      case 'dead_leaves': return '#484838';
      case 'corrupted_soil': return '#4a363d';
      case 'broken_stone': return '#555458';
      case 'dirt_road': return '#53473b';
      default: return '#35463e';
    }
  }

  function markerColor(kind: MapMarkerKind): string {
    switch (kind) {
      case 'player': return '#fff1b8';
      case 'town': return '#e1ca98';
      case 'dungeonEntrance': return '#d8a1b0';
      case 'quest': return '#f1ca75';
      case 'waypoint': return '#96d6e3';
      case 'optionalPoi': return '#b4d8a4';
      default: return '#c4b6cb';
    }
  }

  onMount(() => {
    if (compact) return;
    const element = svgElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let lastPinchDistance = 0;
    const distance = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !onPan) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) lastPinchDistance = distance();
      try { element.setPointerCapture(event.pointerId); } catch { /* detached canvas */ }
    };
    const pointerMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        const bounds = element.getBoundingClientRect();
        if (bounds.width > 0 && bounds.height > 0) {
          onPan?.(-dx * projection.viewport.width / bounds.width,
            -dy * projection.viewport.height / bounds.height);
        }
      } else if (pointers.size === 2) {
        const next = distance();
        if (lastPinchDistance > 0 && next > 0 && Math.abs(next / lastPinchDistance - 1) > 0.012) {
          onZoom?.(next / lastPinchDistance);
          lastPinchDistance = next;
        }
      }
    };
    const pointerUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      lastPinchDistance = pointers.size === 2 ? distance() : 0;
    };
    const wheel = (event: WheelEvent) => {
      if (!onZoom) return;
      event.preventDefault();
      onZoom(event.deltaY < 0 ? 1.2 : 1 / 1.2);
    };
    element.addEventListener('pointerdown', pointerDown);
    element.addEventListener('pointermove', pointerMove);
    element.addEventListener('pointerup', pointerUp);
    element.addEventListener('pointercancel', pointerUp);
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      element.removeEventListener('pointerdown', pointerDown);
      element.removeEventListener('pointermove', pointerMove);
      element.removeEventListener('pointerup', pointerUp);
      element.removeEventListener('pointercancel', pointerUp);
      element.removeEventListener('wheel', wheel);
      pointers.clear();
    };
  });
</script>

<div class="map-canvas" class:compact data-map-mode={projection.mode}
  data-map-zoom={projection.zoom.toFixed(2)}>
  <svg bind:this={svgElement}
    viewBox={`${projection.viewport.x} ${projection.viewport.y} ${projection.viewport.width} ${projection.viewport.height}`}
    preserveAspectRatio="xMidYMid meet" role="img" aria-label={$t('map.title')}
    data-map-viewport={`${Math.round(projection.viewport.x)},${Math.round(projection.viewport.y)},${Math.round(projection.viewport.width)},${Math.round(projection.viewport.height)}`}>
    <defs>
      <!-- Exact known-cell clipping: unlike blur masks, unknown terrain and road
           geometry are NEVER emitted in SVG, and strokes cannot bleed over fog. -->
      <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
        {#each projection.cells.filter(cell => cell.visibility === 'discovered') as cell (cell.id)}
          <rect x={cell.x} y={cell.y} width={cell.width} height={cell.height} />
        {/each}
      </clipPath>
      <pattern id={compact ? 'ar-ground-mini' : 'ar-ground-world'}
        width="36" height="36" patternUnits="userSpaceOnUse">
        <path d="M4 10l3 -2M21 29l5 -1M29 6l2 2" stroke="#d0c7a8"
          stroke-width="1.2" opacity=".11" />
      </pattern>
    </defs>
    <!-- Undiscovered world remains a solid opaque dark field. -->
    <rect x={projection.viewport.x} y={projection.viewport.y}
      width={projection.viewport.width} height={projection.viewport.height} fill="#090e14" />
    {#each projection.cells as cell (cell.id)}
      {#if cell.visibility === 'discovered'}
        <rect x={cell.x} y={cell.y} width={cell.width} height={cell.height}
          fill={terrainColor(cell.terrainId)} data-terrain-cell={cell.id}
          data-terrain-kind={cell.terrainId ?? 'known'} />
      {/if}
      <!-- Test-only visibility signal carries no unknown terrain ID. -->
      <rect x={cell.x} y={cell.y} width={cell.width} height={cell.height}
        fill="none" stroke="none" data-fog-cell={cell.id} data-fog={cell.visibility} />
    {/each}
    <rect x={projection.viewport.x} y={projection.viewport.y}
      width={projection.viewport.width} height={projection.viewport.height}
      fill={`url(#${compact ? 'ar-ground-mini' : 'ar-ground-world'})`}
      clip-path={`url(#${clipId})`} />
    <g class="road-network" clip-path={`url(#${clipId})`}>
      {#each projection.roads ?? [] as road (road.id)}
        <line x1={road.from.x} y1={road.from.y} x2={road.to.x} y2={road.to.y}
          stroke="#252a25" stroke-width={road.width * 0.82}
          stroke-linecap="round" opacity=".66" />
        <line x1={road.from.x} y1={road.from.y} x2={road.to.x} y2={road.to.y}
          stroke="#806b53" stroke-width={road.width * 0.53}
          stroke-linecap="round" opacity=".59" data-known-road={road.id} />
      {/each}
    </g>
    {#each projection.markers as marker (marker.id)}
      <g data-map-marker={marker.id} data-marker-kind={marker.kind}
        data-tracked-quest={marker.id===projection.navigationTarget?.id?marker.id.slice(6):undefined}>
        {#if marker.id===projection.navigationTarget?.id}<circle cx={marker.position.x} cy={marker.position.y} r={compact?23:32} fill="none" stroke="#fff0a6" stroke-width="4" stroke-dasharray="7 3"/>{/if}
        {#if marker.kind === 'dungeonEntrance'}
          <path d={`M${marker.position.x} ${marker.position.y-15} l15 27 h-30 z`}
            fill={markerColor(marker.kind)} stroke="#0a1017" stroke-width="4"/>
        {:else if marker.kind === 'quest'}
          <path d={`M${marker.position.x} ${marker.position.y-15} l13 15 -13 15 -13 -15 z`}
            fill={markerColor(marker.kind)} stroke="#0a1017" stroke-width="4"/>
        {:else}
          <circle cx={marker.position.x} cy={marker.position.y}
            r={marker.kind === 'player' ? 14 : marker.kind === 'town' ? 12 : 9}
            fill={markerColor(marker.kind)} stroke="#0a1017" stroke-width="4" />
        {/if}
        {#if marker.kind === 'player'}
          <circle cx={marker.position.x} cy={marker.position.y} r="27"
            fill="none" stroke="#f7e4a9" stroke-width="3" />
          <circle cx={marker.position.x} cy={marker.position.y} r="4"
            fill="#182431" />
        {:else if marker.kind === 'waypoint'}
          <circle cx={marker.position.x} cy={marker.position.y} r={marker.activated ? 19 : 14}
            fill="none" stroke={marker.activated ? '#a2edf2' : '#71838f'}
            stroke-width={marker.activated ? 4 : 2}
            data-waypoint-active={marker.activated ? 'true' : 'false'} />
        {:else if marker.kind === 'town'}
          <circle cx={marker.position.x} cy={marker.position.y} r="21"
            fill="none" stroke="#e1ca98" stroke-width="2" opacity=".8" />
        {/if}
        {#if !compact}
          <text x={marker.position.x + 22} y={marker.position.y - 18}
            fill="#f3e9d9" stroke="#0a1018" stroke-width="4" paint-order="stroke"
            font-family="Georgia,serif" font-size="22">{$t(marker.presentationKey)}</text>
        {/if}
        <title>{$t(marker.presentationKey)}</title>
      </g>
    {/each}
    {#if compact && direction}<g data-quest-direction transform={`translate(${direction.x} ${direction.y}) rotate(${direction.angle})`}>
      <path d="M-12 -10 L13 0 -12 10 -5 0 Z" fill="#ffe19a" stroke="#12151b" stroke-width="3"/>
    </g>{/if}
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
    display:grid;grid-template-rows:minmax(0,1fr) auto;
    width:100%;min-height:0;background:#090e14;
    border:1px solid #766950;overflow:hidden;
  }
  .map-canvas svg { display:block;width:100%;height:100%;min-height:0; }
  .map-canvas:not(.compact) svg { cursor:grab; touch-action:none; }
  .map-canvas:not(.compact) svg:active { cursor:grabbing; }
  .map-canvas.compact { aspect-ratio:3 / 2;border-color:#88795d; }
  .map-hints { display:flex;flex-wrap:wrap;gap:10px;padding:8px;
    color:#dfc795;font-size:.76rem;background:#0c1119; }
  .map-hints span:before { content:'◆ ';color:#bda476; }
</style>
