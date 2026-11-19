<script lang="ts">
  import { onMount } from 'svelte';
  import type { GameBridge } from '../game/bridge/GameBridge';

  let { bridge }: { bridge: GameBridge } = $props();
  let canvasHost: HTMLDivElement;

  onMount(() => {
    let alive = true;
    let game: { destroy: (removeCanvas?: boolean) => void } | null = null;

    void import('../game/phaser/createGame').then(({ createGame }) => {
      if (alive) game = createGame(canvasHost, bridge);
    });

    return () => {
      alive = false;
      game?.destroy(true);
    };
  });
</script>

<div class="phaser-container" bind:this={canvasHost} aria-label="Game world"></div>

<style>
  .phaser-container { position: absolute; inset: 0; overflow: hidden; background: #121b24; }
  .phaser-container :global(canvas) { display: block; }
</style>
