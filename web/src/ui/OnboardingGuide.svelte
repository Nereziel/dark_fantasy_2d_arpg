<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { InputBinding } from '../game/input/bindings';
  import {
    getOnboardingStep, type OnboardingProgress, type OnboardingContext
  } from '../game/ui/onboardingGuide';
  import { shortcutHint } from '../game/ui/shortcutHints';
  import { ACT_I_QUEST_CATALOG } from '../game/quests/actIQuestChain';

  let { progress, context, bindings, next, skip, show, restart,
    onMap, onTalents, onWarden, assistance=false }: {
    progress: OnboardingProgress;
    context: OnboardingContext;
    bindings: readonly InputBinding[];
    next: () => void;
    skip: () => void;
    show: () => void;
    restart: () => void;
    onMap: (origin?: HTMLElement) => void;
    onTalents: (origin?: HTMLElement) => void;
    onWarden: () => void;
    assistance?:boolean;
  } = $props();
  const step = $derived(getOnboardingStep(progress, context));
  const storyDefinition = $derived(context.storyQuestId
    ? ACT_I_QUEST_CATALOG.quests.find(q => q.id === context.storyQuestId)
    : null);
</script>

<aside class="first-play-guide" data-testid="onboarding-guide"
  data-guide-step={step} data-guide-collapsed={progress.dismissed}
  aria-label={$t('onboarding.title')}>
  {#if progress.dismissed}
    <button class="guide-show" type="button" onclick={show}>
      {$t('onboarding.show')}
    </button>
  {:else}
    <div class="guide-heading">{$t('onboarding.title')}</div>
    <p class="guide-text" aria-live="polite">
      {$t('onboarding.steps.' + step, { values: {
        primary: shortcutHint(bindings, 'PRIMARY'),
        secondary: shortcutHint(bindings, 'SECONDARY'),
        inventory: shortcutHint(bindings, 'INVENTORY'),
        potion: shortcutHint(bindings, 'POTION'),
        talents: shortcutHint(bindings, 'TALENTS'),
        points: context.talentPoints ?? 0,
        objective: storyDefinition ? $t(storyDefinition.objectiveKey) : ''
      } })}
    </p>
    {#if (step === 'story' || step === 'storyReturn' || step === 'talent'
      || step === 'followup') && (context.xpRequired ?? 0) > 0}
      <p class="guide-progress" data-testid="onboarding-xp">
        {$t('onboarding.progress', { values: {
          level: context.level ?? 1, xp: context.xp ?? 0, xpRequired: context.xpRequired ?? 0
        } })}
      </p>
    {/if}
    <div class="guide-buttons">
      {#if step === 'story'}
        <button type="button" onclick={(event) => onMap(event.currentTarget)}>
          {$t('onboarding.openMap')}
        </button>
      {:else if step === 'storyReturn' && assistance}
        <button type="button" onclick={onWarden}>{$t('npc.talk')}</button>
      {:else if step === 'storyReturn'}
        <button type="button" onclick={(event) => onMap(event.currentTarget)}>{$t('onboarding.openMap')}</button>
      {:else if step === 'talent'}
        <button type="button" onclick={(event) => onTalents(event.currentTarget)}>
          {$t('onboarding.openTalents')}
        </button>
      {/if}
      {#if context.questStatus === 'active' && context.zone === 'wilderness'
        && step !== 'objective'}
        <button type="button" onclick={next}>{$t('onboarding.next')}</button>
      {/if}
      <button type="button" onclick={skip}>{$t('onboarding.skip')}</button>
      <button type="button" onclick={restart}>{$t('onboarding.restart')}</button>
    </div>
  {/if}
</aside>

<style>
  .first-play-guide{
    flex-shrink:0; min-width:0; max-width:100%;
    background:#121c27ed; color:#dbd4c8;
    border:1px solid #9c825d; border-left:3px solid #ddbc81;
    border-radius:3px; padding:8px;
    box-shadow:0 7px 18px #0008;
    overflow-wrap:anywhere;
  }
  .guide-heading {
    color:#f1d6a4; font-size:.72rem; font-weight:700;
    letter-spacing:.025em;
  }
  .guide-text { font-size:.7rem; line-height:1.38; margin:6px 0 8px; }
  .guide-progress { font-size:.65rem; color:#b9d0c2; margin:0 0 7px; }
  .guide-buttons { display:flex;flex-wrap:wrap;gap:4px; }
  .guide-buttons button,.guide-show {
    flex:1 1 auto; min-width:0;
    font-size:.65rem; padding:7px 5px; min-height:34px;
    background:#263342; border:1px solid #90795b;
  }
  .guide-show { width:100%; }
  @media(max-width:650px){
    .first-play-guide { padding:6px; }
    .guide-heading { font-size:.64rem; }
    .guide-text { font-size:.62rem; line-height:1.35; }
    .guide-buttons button,.guide-show {
      flex:1 1 100%; min-height:44px; font-size:.6rem;
    }
  }
</style>
