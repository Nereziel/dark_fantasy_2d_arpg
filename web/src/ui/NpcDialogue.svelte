<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { QuestProgress } from '../game/quests/firstQuest';
  import {
    QUEST_REWARD_GOLD, QUEST_REWARD_XP, QUEST_REQUIRED_KILLS, WARDEN_ID
  } from '../game/quests/firstQuest';
  import { evaluateDialogue, chooseDialogueOption } from '../game/quests/questDialogue';
  import { ACT_I_QUEST_CATALOG } from '../game/quests/actIQuestChain';
  import { CAMPAIGN_QUEST_CATALOG, createCampaignQuestLedger } from '../game/quests/campaignQuestLedger';
  import type { QuestLedger } from '../game/quests/questDialogue';
  import { FIRST_QUEST_ID } from '../game/quests/firstQuest';

  let {
    quest, questLedger, accept, turnIn, close
  }: {
    quest: QuestProgress;
    questLedger?: QuestLedger;
    accept: (questId?: string) => void;
    turnIn: (questId?: string) => void;
    close: () => void;
  } = $props();

  let nodeId = $state('vesna.root');
  const context = { npcId: WARDEN_ID };
  const ledger = $derived(createCampaignQuestLedger(questLedger ?? quest));
  const dialogue = $derived(ledger
    ? evaluateDialogue(CAMPAIGN_QUEST_CATALOG, ledger, nodeId, context) : null);
  const activeStory = $derived(ledger?.quests.find(entry => entry.questId !== FIRST_QUEST_ID
    && ACT_I_QUEST_CATALOG.quests.some(q => q.id === entry.questId)
    && (entry.status === 'active' || entry.status === 'ready')) ?? null);
  const storyDefinition = $derived(ACT_I_QUEST_CATALOG.quests.find(entry =>
    entry.id === activeStory?.questId));

  function choose(optionId: string): void {
    if (!ledger) return;
    // Always recheck option visibility/availability against the current
    // ledger. UI never changes quest state or awards gold/XP itself.
    const option = chooseDialogueOption(CAMPAIGN_QUEST_CATALOG,
      ledger, nodeId, optionId, context);
    if (!option) return;
    if (option.action?.type === 'acceptQuest') accept(option.action.questId);
    if (option.action?.type === 'turnInQuest') turnIn(option.action.questId);
    if (option.action?.type === 'close') close();
    if (option.nextNodeId) nodeId = option.nextNodeId;
  }
</script>

<div class="npc-dialog-shield">
  <div class="npc-dialog" role="dialog" aria-modal="true" aria-label={$t('npc.warden.name')}>
    <div class="npc-kicker">{$t('npc.warden.title')}</div>
    <h2>{$t('npc.warden.name')}</h2>
    <h3>{storyDefinition ? $t(storyDefinition.titleKey) : $t('quest.ashes.title')}</h3>
    <p>{$t(dialogue?.textKey ?? 'dialogue.vesna.root')}</p>
    {#if storyDefinition}
      <p>{$t(storyDefinition.descriptionKey)}</p>
    {/if}
    <p class="quest-current-story">
      {#if quest.status === 'available'}
        {$t('quest.ashes.intro')}
      {:else if quest.status === 'active'}
        {$t('quest.ashes.inProgress')}
      {:else if quest.status === 'ready'}
        {$t('quest.ashes.readyDialogue')}
      {:else}
        {$t('quest.ashes.finishDialogue')}
      {/if}
    </p>
    <div class="npc-objective">
      {$t('quest.ashes.objective')} · {quest.defeated}/{QUEST_REQUIRED_KILLS}
      <span>{$t('quest.ashes.reward')}: {QUEST_REWARD_GOLD} {$t('hud.gold')}, {QUEST_REWARD_XP} XP</span>
    </div>
    <div class="npc-actions">
      {#if dialogue}
        {#each dialogue.options as option (option.id)}
          <button class:primary={option.action?.type === 'acceptQuest' || option.action?.type === 'turnInQuest'}
            class:secondary={option.action === null}
            disabled={!option.enabled}
            onclick={() => choose(option.id)}>{$t(option.textKey)}</button>
        {/each}
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
