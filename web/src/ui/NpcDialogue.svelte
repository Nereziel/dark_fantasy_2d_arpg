<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { QuestProgress } from '../game/quests/firstQuest';
  import { QUEST_REWARD_GOLD, QUEST_REWARD_XP, QUEST_REQUIRED_KILLS } from '../game/quests/firstQuest';

  let {
    quest, accept, turnIn, close
  }: {
    quest: QuestProgress;
    accept: () => void;
    turnIn: () => void;
    close: () => void;
  } = $props();
</script>

<div class="npc-dialog-shield">
  <div class="npc-dialog" role="dialog" aria-modal="true" aria-label={$t('npc.warden.name')}>
    <div class="npc-kicker">{$t('npc.warden.title')}</div>
    <h2>{$t('npc.warden.name')}</h2>
    <h3>{$t('quest.ashes.title')}</h3>
    {#if quest.status === 'available'}
      <p>{$t('quest.ashes.intro')}</p>
    {:else if quest.status === 'active'}
      <p>{$t('quest.ashes.inProgress')}</p>
    {:else if quest.status === 'ready'}
      <p>{$t('quest.ashes.readyDialogue')}</p>
    {:else}
      <p>{$t('quest.ashes.finishDialogue')}</p>
    {/if}
    <div class="npc-objective">
      {$t('quest.ashes.objective')} · {quest.defeated}/{QUEST_REQUIRED_KILLS}
      <span>{$t('quest.ashes.reward')}: {QUEST_REWARD_GOLD} {$t('hud.gold')}, {QUEST_REWARD_XP} XP</span>
    </div>
    <div class="npc-actions">
      {#if quest.status === 'available'}
        <button class="primary" onclick={accept}>{$t('quest.ashes.accept')}</button>
      {:else if quest.status === 'ready'}
        <button class="primary" onclick={turnIn}>{$t('quest.ashes.turnIn')}</button>
      {/if}
      <button class="secondary" onclick={close}>{$t('npc.leave')}</button>
    </div>
  </div>
</div>

<style>
  .npc-dialog-shield{position:absolute;inset:0;z-index:12;display:grid;place-items:center;
    background:#07090fd7;padding:18px}
  .npc-dialog{width:min(92vw,490px);background:linear-gradient(160deg,#27303a,#101722);
    border:1px solid #a88a5a;box-shadow:0 22px 80px #000;padding:30px}
  .npc-kicker{color:#b59b75;letter-spacing:.22em;text-transform:uppercase;font-size:.66rem}
  h2{font-family:Georgia,serif;color:#f0dcb9;font-size:1.8rem;margin:7px 0 20px}
  h3{font-family:Georgia,serif;color:#d8b88a;font-size:1.1rem;margin:0 0 10px}
  p{font-family:Georgia,serif;line-height:1.75;color:#dbd9d1;font-size:.96rem;min-height:90px}
  .npc-objective{border-top:1px solid #5b5b58;border-bottom:1px solid #5b5b58;
    padding:12px 0;display:flex;flex-direction:column;gap:7px;font-size:.76rem;color:#c8bb9c}
  .npc-objective span{font-size:.7rem;color:#a4bdac}
  .npc-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
  .npc-actions button{flex:1;min-width:140px;font-size:.84rem;padding:11px}
  @media(max-width:560px){.npc-dialog{padding:17px}.npc-dialog h2{font-size:1.4rem}
    .npc-dialog p{font-size:.83rem;min-height:0}.npc-actions button{padding:9px}}
</style>
