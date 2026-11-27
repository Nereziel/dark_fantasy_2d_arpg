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
  let pixelSize=$state({width:0,height:0});
  let unit=$derived(pixelSize.width>0&&pixelSize.height>0?1/Math.min(pixelSize.width/projection.viewport.width,pixelSize.height/projection.viewport.height):1);
  // Paint quests and the hero above scenery; constant screen-sized glyphs.
  let orderedMarkers=$derived([...projection.markers].sort((a,b)=>priority(a.kind,a.id)-priority(b.kind,b.id)));
  function priority(kind:MapMarkerKind,id:string):number{return id===projection.navigationTarget?.id?4:kind==='player'?3:kind==='quest'?2:1;}
  // Two projections can coexist: IDs must not share a clipPath or visual fog.
  let direction = $derived(navigationArrow(projection.viewport,projection.markers.find(m=>m.kind==='player')?.position??null,projection.navigationRoute?.find(p=>p.x<projection.viewport.x||p.y<projection.viewport.y||p.x>=projection.viewport.x+projection.viewport.width||p.y>=projection.viewport.y+projection.viewport.height)??null));
  let clipId = $derived(compact ? 'ar-discovered-mini' : 'ar-discovered-world');

  function terrainColor(id?: TerrainId): string {
    switch (id) {
      case 'town_clearing': return '#65766a';
      case 'dark_grass': return '#40574b';
      case 'dead_leaves': return '#5b5744';
      case 'corrupted_soil': return '#60424b';
      case 'broken_stone': return '#64666b';
      case 'dirt_road': return '#6c5946';
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
    const element = svgElement;
    const resize=()=>{const rect=element.getBoundingClientRect();pixelSize={width:rect.width,height:rect.height};};
    resize();
    const observer=new ResizeObserver(resize);observer.observe(element);
    if(compact)return()=>observer.disconnect();
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
      pointers.clear();observer.disconnect();
    };
  });
</script>

<div class="map-canvas" class:compact data-map-mode={projection.mode}
  data-map-zoom={projection.zoom.toFixed(2)} data-map-area={projection.area??'wilderness'}
  data-navigation-stage={projection.navigationStage}>
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
      width={projection.viewport.width} height={projection.viewport.height} fill="#0a1018" />
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
          stroke="#b09873" stroke-width={road.width * 0.53}
          stroke-linecap="round" opacity=".85" data-known-road={road.id} />
      {/each}
    </g>
    {#each projection.walls??[] as wall}
      <rect x={wall.x} y={wall.y} width={wall.width} height={wall.height} fill="#10151d" stroke="#8b8171" stroke-width="1.1" vector-effect="non-scaling-stroke" data-dungeon-wall="known"/>
    {/each}
    {#if (projection.navigationRoute?.length??0)>1}
      <polyline points={projection.navigationRoute?.map(p=>p.x+','+p.y).join(' ')} fill="none" stroke="#ffe19a"
        stroke-width={compact?2:2.5} stroke-dasharray="5 4" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"
        clip-path={`url(#${clipId})`} data-quest-route="known"/>
    {/if}
    {#each orderedMarkers as marker (marker.id)}
      {@const tracked=marker.id===projection.navigationTarget?.id}
      {@const quest=marker.kind==='quest'}
      {@const nearRight=marker.position.x+unit*120>projection.viewport.x+projection.viewport.width}
      <g data-map-marker={marker.id} data-marker-kind={marker.kind}
        data-map-x={marker.position.x} data-map-y={marker.position.y}
        data-tracked-quest={tracked?marker.id.slice(6):undefined}
        transform={`translate(${marker.position.x} ${marker.position.y}) scale(${unit})`}>
        {#if tracked}
          <circle r={compact?10:15} fill="#14191f" fill-opacity=".9" stroke="#ffe19a" stroke-width="1.5" stroke-dasharray="3 2"/>
        {/if}
        {#if quest}
          <path data-quest-symbol d={tracked?'M0 -10 L10 0 0 10 -10 0 Z':'M0 -6 L6 0 0 6 -6 0 Z'}
            fill={tracked?'#ffdd83':'#e2b567'} stroke="#20160d" stroke-width="1.6"/>
          {#if tracked}<path d="M0 -5 V1 M0 4 V5" stroke="#34220d" stroke-width="2" stroke-linecap="round"/>{/if}
        {:else if marker.kind==='dungeonEntrance'}
          <path d="M0 -7 L7 6 H-7 Z" fill={markerColor(marker.kind)} stroke="#0a1017" stroke-width="1.5"/>
        {:else if marker.kind==='player'}
          <circle r="8" fill="#101820" stroke="#f7e4a9" stroke-width="1.3"/>
          <circle r="3.8" fill="#fff1b8"/>
        {:else if marker.kind==='town'}
          <path d="M-6 -1 L0 -7 6 -1 V6 H-6 Z" fill={markerColor(marker.kind)} stroke="#0a1017" stroke-width="1.5"/>
        {:else if marker.kind==='waypoint'}
          <circle r="6" fill="#0d1822" stroke={marker.activated?'#a2edf2':'#71838f'} stroke-width="1.5" data-waypoint-active={marker.activated?'true':'false'}/>
          <circle r="2.5" fill={markerColor(marker.kind)}/>
        {:else}
          <circle r="4" fill={markerColor(marker.kind)} stroke="#0a1017" stroke-width="1.2"/>
        {/if}
        {#if !compact && (quest||marker.kind==='town'||marker.kind==='dungeonEntrance'||marker.kind==='waypoint')}
          <text x={nearRight?-13:13} y={tracked?-13:-9} text-anchor={nearRight?'end':'start'}
            fill={tracked?'#ffe4a2':'#e5d9c7'} stroke="#0a1018" stroke-width="3" paint-order="stroke"
            font-family="Arial,sans-serif" font-weight={tracked?'700':'500'} font-size={tracked?13:10.5}>{$t(marker.presentationKey)}</text>
        {/if}
        <title>{$t(marker.presentationKey)}</title>
      </g>
    {/each}
    {#if compact && direction}<g data-quest-direction transform={`translate(${direction.x} ${direction.y}) rotate(${direction.angle}) scale(${unit})`}>
      <path d="M-6 -5 L7 0 -6 5 -2 0 Z" fill="#ffe19a" stroke="#12151b" stroke-width="1.5"/>
    </g>{/if}
  </svg>

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
  .map-canvas.compact { aspect-ratio:3 / 2;border:1px solid #74664c;border-radius:3px;background:#0a1018; }
</style>
