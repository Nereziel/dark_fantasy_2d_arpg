<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import type { GameSnapshot } from '../game/core/types';
  import { CLASSES } from '../game/data/classes';
  import { xpRequiredForLevel } from '../game/progression/progressionRules';
  import {
    PERCENT_STATS, STAT_GROUPS, type DerivedStatKey
  } from '../game/stats/deriveStats';

  let { view, close }: { view: GameSnapshot; close: () => void } = $props();

  function formatStat(key: DerivedStatKey, value: number, language: string): string {
    const formatted = new Intl.NumberFormat(language, {
      maximumFractionDigits: 2
    }).format(value);
    return PERCENT_STATS.has(key) ? formatted + ' %' : formatted;
  }
</script>

<div class="character-sheet-backdrop">
  <div class="character-sheet" role="dialog" aria-modal="true"
    aria-label={$_('character.title')}>
    <header>
      <div>
        <div class="character-kicker">AETHER &amp; RUIN</div>
        <h2>{$_('character.title')}</h2>
        <div class="character-subtitle">
          {$_('classes.' + view.classId + '.name')} · {$_('hud.level')} {view.level}
        </div>
      </div>
      <button aria-label={$_('inventory.close')} onclick={close}>✕</button>
    </header>
    <div class="character-summary">
      <div>{$_('hud.health')}: <strong>{view.player.health} / {view.stats.maxHealth}</strong></div>
      <div>{$_('resource.' + CLASSES[view.classId].resourceId)}:
        <strong>{Math.round(view.resource)} / {view.stats.maxResource}</strong></div>
    </div>
    <div class="character-summary">
      <div>{$_('progression.experience')}: <strong>{view.xp} / {xpRequiredForLevel(view.level) || 'MAX'}</strong></div>
      <div>{$_('progression.skillPoints')}: <strong>{view.skillPoints ?? 0}</strong></div>
      <div>{$_('progression.talentPoints')}: <strong>{view.talentPoints ?? 0}</strong></div>
    </div>
    <div class="character-groups">
      {#each STAT_GROUPS as group (group.id)}
        <section>
          <h3>{$_('character.groups.' + group.id)}</h3>
          <dl>
            {#each group.stats as key (key)}
              <div>
                <dt>{$_('stat.' + key)}</dt>
                <dd>{formatStat(key, view.stats[key], $locale ?? 'en')}</dd>
              </div>
            {/each}
          </dl>
        </section>
      {/each}
    </div>
    <footer>{$_('character.derivedHint')}</footer>
  </div>
</div>

<style>
  .character-sheet-backdrop{position:absolute;inset:0;z-index:10;background:#060a12df;
    display:grid;place-items:center;padding:16px}
  .character-sheet{width:min(830px,96vw);max-height:92vh;overflow:auto;
    background:linear-gradient(150deg,#202b34,#0d141e);border:1px solid #af9266;
    padding:23px 26px;box-shadow:0 20px 75px #000d}
  header{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;
    padding-bottom:13px;border-bottom:1px solid #635640}
  header button{padding:8px 13px}
  .character-kicker{font-size:.62rem;letter-spacing:.22em;color:#bba17d}
  h2{font:1.6rem Georgia,serif;color:#f0ddbb;margin:6px 0 3px}
  .character-subtitle{font-size:.81rem;color:#c7c5bb}
  .character-summary{display:flex;gap:20px;flex-wrap:wrap;padding:14px 0;
    color:#bbc5c6;font-size:.77rem}
  .character-summary strong{color:#ecd9b3;margin-left:5px}
  .character-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
  section{background:#111a24;border:1px solid #3f4b52;padding:14px}
  h3{font:1.06rem Georgia,serif;color:#e1be90;margin:0 0 11px}
  dl{margin:0}
  dl>div{display:flex;justify-content:space-between;gap:12px;padding:6px 0;
    border-bottom:1px solid #303d46;font-size:.74rem}
  dt{color:#aebdc0}
  dd{margin:0;color:#e7dfcd;font-variant-numeric:tabular-nums;text-align:right}
  footer{font-size:.67rem;line-height:1.5;color:#9aaeb2;margin-top:16px}
  @media(max-width:640px){.character-sheet{padding:12px}.character-groups{grid-template-columns:1fr}
    section{padding:10px}.character-summary{gap:6px}}
</style>
