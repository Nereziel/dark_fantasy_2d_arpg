<script lang="ts">
  import { onMount } from 'svelte';
  import type { GameBridge } from '../game/bridge/GameBridge';
  import type { PixelFilterPreference } from '../game/ui/visualPreferences';

  let { bridge, renderMode = 'sharp' }: {
    bridge: GameBridge;
    renderMode?: PixelFilterPreference;
  } = $props();
  let canvasHost: HTMLDivElement;

  onMount(() => {
    let alive = true;
    let game: { destroy: (removeCanvas: boolean) => void } | null = null;

    void import('../game/phaser/createGame').then(({ createGame }) => {
      if (alive) game = createGame(canvasHost, bridge, renderMode);
    });

    return () => {
      alive = false;
      game?.destroy(true);
    };
  });
</script>

<div class="phaser-container" bind:this={canvasHost} data-render-mode={renderMode}
  aria-label="Game world"></div>

<style>
  .phaser-container { position: absolute; inset: 0; overflow: hidden; background: #121b24; }
  .phaser-container :global(canvas) { display: block; touch-action:none; }
</style>
