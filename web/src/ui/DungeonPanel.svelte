<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import type { GameBridge } from '../game/bridge/GameBridge';

  let { view, bridge }: { view: GameSnapshot; bridge: GameBridge } = $props();
  const nameKey = $derived(view.dungeonId==='mine'?'dungeon.mineName':view.dungeonId==='cave'?'dungeon.caveName':'dungeon.name');
</script>

<aside class="dungeon-panel" aria-label={$t(nameKey)}>
  <div class="dungeon-label">{$t(nameKey)}</div>
  {#if view.zone === 'wilderness'}
    <p>{$t('dungeon.gateHint')}</p>
    <button class="travel-action" disabled={!view.player.alive || view.paused}
      onclick={() => bridge.command({ type: 'usePortal' })}>
      {$t('dungeon.enter')}
    </button>
  {:else}
    {#if view.dungeonCleared}
      <strong class="clear-status">{$t(view.dungeonId?'dungeon.optionalCleared':'dungeon.cleared')}</strong>
      <p>{$t(view.dungeonId?'dungeon.optionalClearedHint':'dungeon.clearedHint')}</p>
    {:else if view.dungeonStage === 0}
      <strong>{$t(view.dungeonId?'dungeon.optionalGuards':'dungeon.guards')}</strong>
      <p>{$t('dungeon.guardsHint')} ·
        {view.enemies.filter(u => !u.actor.alive).length}/{view.enemies.length}</p>
    {:else}
      <strong>{$t(view.dungeonId==='mine'?'dungeon.mineBoss':view.dungeonId==='cave'?'dungeon.caveBoss':'boss.hollowKing.name')}</strong>
      {#if view.hollowKing}
        <div class="king-phase">{$t('boss.hollowKing.phase' + view.hollowKing.phase)}
          · {Math.ceil(100 * view.hollowKing.health / view.hollowKing.maxHealth)}%</div>
        <div class="king-health"><div style:width={Math.max(0, 100 * view.hollowKing.health / view.hollowKing.maxHealth) + '%'}></div></div>
        {#if view.hollowKing.warning}
          <p class="king-warning">{$t(view.hollowKing.warning.localizationKey)}
            · {view.hollowKing.warning.remainingSeconds.toFixed(1)} s</p>
        {/if}
      {/if}
      <p>{$t(view.dungeonId?'dungeon.optionalBossHint':'dungeon.bossHint')}</p>
    {/if}
    <button class="travel-action" disabled={!view.player.alive || view.paused}
      onclick={() => bridge.command({ type: 'usePortal' })}>
      {$t(view.dungeonId?'dungeon.optionalReturn':'dungeon.return')}
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
  .king-phase{font-size:.78rem;color:#e4b2a5;margin:6px 0}
  .king-health{height:12px;border:1px solid #a8727d;background:#160e19;border-radius:3px;overflow:hidden}
  .king-health div{height:100%;background:linear-gradient(90deg,#7c364b,#d66c68)}
  .king-warning{font-weight:bold;color:#f5c28b}
  .travel-action{width:100%;font-size:.72rem;padding:8px 5px;border:1px solid #9e775d;
    background:#312730;color:#e7ceaa}
  .travel-action:disabled{opacity:.45}
  @media(max-width:720px){.dungeon-panel{right:7px;top:345px;width:min(178px,45vw);padding:7px}
    .dungeon-label{font-size:.57rem}p{font-size:.61rem}.travel-action{font-size:.61rem}}
</style>
