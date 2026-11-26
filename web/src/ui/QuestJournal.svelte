<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import { QUEST_REQUIRED_KILLS, FIRST_QUEST_ID } from '../game/quests/firstQuest';
  import { ACT_I_QUEST_CATALOG } from '../game/quests/actIQuestChain';
  import { VILLAGE_QUESTS } from '../game/quests/villageQuests';
  import { storyNeedsWardenTurnIn } from '../game/ui/onboardingGuide';
  import { activeStoryRegionHint } from '../game/ui/storyRegionHints';

  let { view, talk, inspectEvidence }: { view: GameSnapshot; talk: () => void; inspectEvidence: () => void } = $props();
  let collapsed = $state(false);
  const storyState = $derived(view.questLedger?.quests.find(quest =>
    quest.questId !== FIRST_QUEST_ID && ACT_I_QUEST_CATALOG.quests.some(q => q.id === quest.questId) && (quest.status === 'active' || quest.status === 'ready')) ?? null);
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
  <div class="quest-heading">
    <span>{$t('quest.journal')}</span>
    <button class="quest-collapse" type="button" data-testid="quest-collapse" aria-expanded={!collapsed}
      aria-controls="quest-journal-body" aria-label={$t(collapsed?'worldLabels.expandQuests':'worldLabels.collapseQuests')}
      onclick={()=>{collapsed=!collapsed;}}>{collapsed?'＋':'−'}</button>
  </div>
  {#if !collapsed}<div id="quest-journal-body">
  {#if storyDefinition && storyState}
    <strong>{$t(storyDefinition.titleKey)}</strong>
    <div class="quest-progress">
      {$t(storyDefinition.objectiveKey)}
      {#if currentObjective}
        <span class="objective-count">{objectiveCount}/{currentObjective.targetCount}</span>
      {/if}
    </div>
    {#if currentObjective && currentObjective.targetCount > 1}
      <progress aria-label={$t(storyDefinition.objectiveKey)}
        value={objectiveCount} max={currentObjective.targetCount}></progress>
    {/if}
    <details class="quest-description"><summary>{$t('worldLabels.questDetails')}</summary><div class="quest-progress">{$t(storyDefinition.descriptionKey)}</div></details>
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
    {#if view.quest.status === 'active' || view.quest.status === 'ready'}
      <progress aria-label={$t('quest.ashes.title')}
        value={view.quest.defeated} max={QUEST_REQUIRED_KILLS}></progress>
    {/if}
    {#if view.quest.status === 'ready'}
      <div class="quest-ready">{$t('quest.ashes.readyHint')}</div>
    {/if}
  {/if}
  {#each VILLAGE_QUESTS as localQuest (localQuest.id)}
    {@const state = view.questLedger?.quests.find(q => q.questId === localQuest.id)}
    {#if state?.status === 'active' || state?.status === 'ready'}
      <div class="quest-region" data-testid={'village-journal-' + localQuest.id}>
        <strong>{$t('quest.village.' + localQuest.id + '.title')}</strong>
        <div class="quest-progress">{$t('quest.village.' + localQuest.id + '.objective')} · {state.counters.visit}/1</div>
      </div>
    {/if}
  {/each}
  {#if view.canInspectStoryEvidence}
    <button type="button" class="quest-inspect" data-testid="story-inspect-evidence"
      onclick={inspectEvidence}>{$t('quest.actI.inspectEvidence')}</button>
  {/if}
  <button class="quest-talk" disabled={!view.player.alive || view.paused || view.zone !== 'wilderness'} onclick={talk}>
    {$t('npc.talk')}
  </button>
  </div>{/if}
</aside>

<style>
  .quest-journal{position:absolute;z-index:3;top:334px;left:23px;width:255px;max-width:40vw;
    background:#0d141edb;border:1px solid #776549;border-left:3px solid #b89a6a;
    padding:12px 13px;box-shadow:0 12px 26px #0008}
  .quest-heading{display:flex;align-items:center;justify-content:space-between;gap:5px;font-size:.64rem;color:#d9c5a3;margin-bottom:3px}
  .quest-collapse{flex-shrink:0;min-width:28px;min-height:28px;padding:1px 5px;font-size:1rem}
  .quest-description{font-size:.66rem;color:#bcb39e;margin:3px 0}
  .quest-description summary{cursor:pointer}
  @media(pointer:coarse){.quest-collapse{min-width:44px;min-height:44px}}
  strong{display:block;font-family:Georgia,serif;color:#e6d3ad;font-size:.82rem;margin-bottom:3px}
  .objective-count{color:#f1d398;font-variant-numeric:tabular-nums;white-space:nowrap}
  progress{display:block;width:100%;height:6px;margin:5px 0 6px;accent-color:#c9a25e}
  .quest-progress{font-size:.71rem;line-height:1.5;color:#c9c8bb}
  .quest-ready{font-size:.7rem;color:#e4b879;margin-top:6px}
  .quest-region{font-size:.69rem;line-height:1.45;color:#c7b594;margin-top:4px;border-top:1px solid #514735;padding-top:4px}
  .quest-talk{padding:7px 10px;width:100%;margin-top:4px;border:1px solid #8a7556;background:#29303a;font-size:.7rem}
  .quest-inspect{display:block;width:100%;min-height:44px;margin-top:10px;padding:9px 12px;border:1px solid #c2a36b;background:#3c352c;color:#f4dfb0;font-size:.79rem;cursor:pointer}
  .quest-inspect:focus-visible{outline:2px solid #f4dfb0;outline-offset:2px}
  @media(max-width:720px){.quest-journal{top:315px;left:10px;width:185px;max-width:47vw;padding:7px}
    .quest-journal strong{font-size:.75rem}.quest-progress,.quest-talk{font-size:.61rem}}
</style>
