<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import { FIRST_QUEST_ID, WARDEN_ID, type QuestProgress } from '../game/quests/firstQuest';
  import { evaluateDialogue, chooseDialogueOption, type QuestLedger } from '../game/quests/questDialogue';
  import { ACT_I_QUEST_CATALOG } from '../game/quests/actIQuestChain';
  import { CAMPAIGN_QUEST_CATALOG, createCampaignQuestLedger } from '../game/quests/campaignQuestLedger';
  import { presentedNpcQuest } from '../game/quests/npcQuestPresentation';
  import { rewardForActivity } from '../game/progression/progressionRules';

  let { quest, questLedger, level, accept, turnIn, close }: {
    quest: QuestProgress;
    questLedger?: QuestLedger;
    level: number;
    accept: (questId?: string) => void;
    turnIn: (questId?: string) => void;
    close: () => void;
  } = $props();

  const context = { npcId: WARDEN_ID };
  const ledger = $derived(createCampaignQuestLedger(questLedger ?? quest));
  const current = $derived(presentedNpcQuest(ACT_I_QUEST_CATALOG, ledger));
  const starter = $derived(current?.definition.id === FIRST_QUEST_ID);
  const nodeId = $derived(starter ? 'vesna.root' : 'vesna.act1.' + current?.definition.id);
  const dialogue = $derived(ledger && current
    ? evaluateDialogue(CAMPAIGN_QUEST_CATALOG, ledger, nodeId, context) : null);
  const action = $derived(dialogue?.options.find(option => option.enabled &&
    ((current?.state.status === 'available' && option.action?.type === 'acceptQuest') ||
     (current?.state.status === 'ready' && option.action?.type === 'turnInQuest'))) ?? null);

  function choose(): void {
    if (!ledger || !action) return;
    const option = chooseDialogueOption(CAMPAIGN_QUEST_CATALOG, ledger, nodeId, action.id, context);
    if (option?.action?.type === 'acceptQuest') accept(option.action.questId);
    if (option?.action?.type === 'turnInQuest') turnIn(option.action.questId);
  }
</script>

<div class="npc-dialog-shield">
  <div class="npc-dialog" role="dialog" aria-modal="true" aria-label={$t('npc.warden.name')}>
    <div class="npc-kicker">{$t('npc.warden.title')}</div>
    <h2>{$t('npc.warden.name')}</h2>
    {#if current}
      <h3>{$t(current.definition.titleKey)}</h3>
      {#if starter}
        {#if current.state.status === 'available'}
          <p>{$t('quest.ashes.intro')}</p>
          <p>{$t('dialogue.vesna.details')}</p>
        {:else if current.state.status === 'ready'}
          <p>{$t('quest.ashes.readyDialogue')}</p>
        {:else}
          <p>{$t('quest.ashes.inProgress')}</p>
        {/if}
      {:else}
        <p>{$t('dialogue.vesna.actI.' + current.definition.id + '.' +
          (current.state.status === 'available' ? 'briefing' : current.state.status))}</p>
        <p>{$t(current.definition.descriptionKey)}</p>
      {/if}
      <div class="npc-objective">
        {#each current.definition.objectives as objective (objective.id)}
          <div>{$t(current.definition.objectiveKey)} · {current.state.counters[objective.id] ?? 0}/{objective.targetCount}</div>
        {/each}
        <span data-testid="npc-quest-reward">{$t('quest.ashes.reward')}: {current.definition.reward.gold} {$t('hud.gold')}, {starter ? Math.max(current.definition.reward.xp, rewardForActivity('quest', level, level)) : current.definition.reward.xp} XP</span>
      </div>
    {:else}
      <p>{$t('quest.ashes.finishDialogue')}</p>
    {/if}
    <div class="npc-actions">
      {#if action}
        <button class="primary" onclick={choose}>{$t(action.action?.type === 'acceptQuest' ? 'quest.ashes.accept' : action.textKey)}</button>
      {/if}
      <button class="secondary" onclick={close}>{$t('npc.leave')}</button>
    </div>
  </div>
</div>

<style>
  .npc-dialog-shield{position:absolute;inset:0;z-index:12;display:grid;place-items:center;
    background:#07090fd7;padding:18px}
  .npc-dialog{width:min(92vw,490px);background:linear-gradient(160deg,#27303a,#101722);
    border:1px solid #a88a5a;box-shadow:0 22px 80px #000;padding:30px;max-height:calc(100dvh - 36px);overflow:auto;box-sizing:border-box}
  .npc-kicker{color:#b59b75;letter-spacing:.22em;text-transform:uppercase;font-size:.66rem}
  h2{font-family:Georgia,serif;color:#f0dcb9;font-size:1.8rem;margin:7px 0 20px}
  h3{font-family:Georgia,serif;color:#d8b88a;font-size:1.1rem;margin:0 0 10px}
  p{font-family:Georgia,serif;line-height:1.6;color:#dbd9d1;font-size:.9rem;min-height:0}
  .quest-current-story{opacity:.82;font-size:.82rem}
  .npc-objective{border-top:1px solid #5b5b58;border-bottom:1px solid #5b5b58;
    padding:12px 0;display:flex;flex-direction:column;gap:7px;font-size:.76rem;color:#c8bb9c}
  .npc-objective span{font-size:.7rem;color:#a4bdac}
  .npc-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
  .npc-actions button{flex:1;min-width:140px;font-size:.84rem;padding:11px}
  @media(max-width:560px){.npc-dialog{padding:17px}.npc-dialog h2{font-size:1.4rem}
    .npc-dialog p{font-size:.83rem;min-height:0}.npc-actions button{padding:9px}}
</style>
