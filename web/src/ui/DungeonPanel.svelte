<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import type { GameBridge } from '../game/bridge/GameBridge';

  let { view, bridge }: { view: GameSnapshot; bridge: GameBridge } = $props();
</script>

<aside class="dungeon-panel" aria-label={$t('dungeon.name')}>
  <div class="dungeon-label">{$t('dungeon.name')}</div>
  {#if view.zone === 'wilderness'}
    <p>{$t('dungeon.gateHint')}</p>
    <button class="travel-action" disabled={!view.player.alive || view.paused}
      onclick={() => bridge.command({ type: 'usePortal' })}>
      {$t('dungeon.enter')}
    </button>
  {:else}
    {#if view.dungeonCleared}
      <strong class="clear-status">{$t('dungeon.cleared')}</strong>
      <p>{$t('dungeon.clearedHint')}</p>
    {:else if view.dungeonStage === 0}
      <strong>{$t('dungeon.guards')}</strong>
      <p>{$t('dungeon.guardsHint')} ·
        {view.enemies.filter(u => !u.actor.alive).length}/{view.enemies.length}</p>
    {:else}
      <strong>{$t('dungeon.boss')}</strong>
      <p>{$t('dungeon.bossHint')}</p>
    {/if}
    <button class="travel-action" disabled={!view.player.alive || view.paused}
      onclick={() => bridge.command({ type: 'usePortal' })}>
      {$t('dungeon.return')}
    </button>
  {/if}
</aside>

<style>
  .dungeon-panel{position:absolute;z-index:3;top:365px;right:18px;width:205px;padding:11px;
    background:#10131edf;border:1px solid #79616a;border-left:3px solid #a66e6c;
    box-shadow:0 12px 30px #000a}
  .dungeon-label{font-size:.69rem;letter-spacing:.12em;text-transform:uppercase;color:#dfc09d;margin-bottom:7px}
  strong{display:block;font:1rem Georgia,serif;color:#e4b2a5}
  strong.clear-status{color:#b6ddbd}
  p{font-size:.7rem;line-height:1.48;margin:6px 0 10px;color:#c2c6c9}
  .travel-action{width:100%;font-size:.72rem;padding:8px 5px;border:1px solid #9e775d;
    background:#312730;color:#e7ceaa}
  .travel-action:disabled{opacity:.45}
  @media(max-width:720px){.dungeon-panel{right:7px;top:345px;width:min(178px,45vw);padding:7px}
    .dungeon-label{font-size:.57rem}p{font-size:.61rem}.travel-action{font-size:.61rem}}
</style>
