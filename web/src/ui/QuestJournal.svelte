<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import { QUEST_REQUIRED_KILLS, FIRST_QUEST_ID } from '../game/quests/firstQuest';
  import { ACT_I_QUEST_CATALOG } from '../game/quests/actIQuestChain';
  import { storyNeedsWardenTurnIn } from '../game/ui/onboardingGuide';
  import { activeStoryRegionHint } from '../game/ui/storyRegionHints';

  let { view, talk, inspectEvidence }: { view: GameSnapshot; talk: () => void; inspectEvidence: () => void } = $props();
  const storyState = $derived(view.questLedger?.quests.find(quest =>
    quest.questId !== FIRST_QUEST_ID && (quest.status === 'active' || quest.status === 'ready')) ?? null);
  const storyDefinition = $derived(ACT_I_QUEST_CATALOG.quests.find(quest =>
    quest.id === storyState?.questId) ?? null);
  const regionHintKey = $derived(activeStoryRegionHint(
    storyState?.questId, storyState?.status
  ));
  const currentObjective = $derived(storyDefinition?.objectives[0] ?? null);
  const objectiveCount = $derived(currentObjective && storyState
    ? storyState.counters[currentObjective.id] ?? 0 : 0);
</script>

<aside class="quest-journal" aria-label={$t('quest.journal')}>
  <div class="quest-heading">{$t('quest.journal')}</div>
  {#if storyDefinition && storyState}
    <strong>{$t(storyDefinition.titleKey)}</strong>
    <div class="quest-progress">
      {$t(storyDefinition.objectiveKey)}
      {#if currentObjective}
        · {objectiveCount}/{currentObjective.targetCount}
      {/if}
    </div>
    <div class="quest-progress">{$t(storyDefinition.descriptionKey)}</div>
    {#if regionHintKey}
      <div class="quest-region" data-testid="story-region-hint">{$t(regionHintKey)}</div>
    {/if}
    {#if storyState.status === 'ready' && storyNeedsWardenTurnIn(storyState.questId)}
      <div class="quest-ready">{$t('quest.actI.returnToVesna')}</div>
    {/if}
  {:else}
    <strong>{$t('quest.ashes.title')}</strong>
    <div class="quest-progress">
      {#if view.quest.status === 'available'}
        {$t('quest.ashes.unstarted')}
      {:else if view.quest.status === 'completed'}
        {view.actIIUnlocked ? $t('quest.actI.nextUnlocked') : $t('quest.ashes.completed')}
      {:else}
        {$t('quest.ashes.objective')} · {view.quest.defeated}/{QUEST_REQUIRED_KILLS}
      {/if}
    </div>
    {#if view.quest.status === 'ready'}
      <div class="quest-ready">{$t('quest.ashes.readyHint')}</div>
    {/if}
  {/if}
  {#if view.canInspectStoryEvidence}
    <button type="button" class="quest-inspect" data-testid="story-inspect-evidence"
      onclick={inspectEvidence}>{$t('quest.actI.inspectEvidence')}</button>
  {/if}
  <button class="quest-talk" disabled={!view.player.alive || view.paused || view.zone !== 'wilderness'} onclick={talk}>
    {$t('npc.talk')}
  </button>
</aside>

<style>
  .quest-journal{position:absolute;z-index:3;top:334px;left:23px;width:255px;max-width:40vw;
    background:#0d141edb;border:1px solid #776549;border-left:3px solid #b89a6a;
    padding:12px 13px;box-shadow:0 12px 26px #0008}
  .quest-heading{font-size:.64rem;text-transform:uppercase;letter-spacing:.18em;color:#aa9e89;margin-bottom:7px}
  strong{display:block;font-family:Georgia,serif;color:#e6d3ad;font-size:.95rem;margin-bottom:8px}
  .quest-progress{font-size:.71rem;line-height:1.5;color:#c9c8bb}
  .quest-ready{font-size:.7rem;color:#e4b879;margin-top:6px}
  .quest-region{font-size:.69rem;line-height:1.45;color:#c7b594;margin-top:8px;border-top:1px solid #514735;padding-top:7px}
  .quest-talk{padding:7px 10px;width:100%;margin-top:10px;border:1px solid #8a7556;background:#29303a;font-size:.7rem}
  .quest-inspect{display:block;width:100%;min-height:44px;margin-top:10px;padding:9px 12px;border:1px solid #c2a36b;background:#3c352c;color:#f4dfb0;font-size:.79rem;cursor:pointer}
  .quest-inspect:focus-visible{outline:2px solid #f4dfb0;outline-offset:2px}
  @media(max-width:720px){.quest-journal{top:315px;left:10px;width:185px;max-width:47vw;padding:7px}
    .quest-journal strong{font-size:.75rem}.quest-progress,.quest-talk{font-size:.61rem}}
</style>
