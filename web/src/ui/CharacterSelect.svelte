<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import { CLASS_IDS, CLASSES, type ClassId } from '../game/data/classes';
  import { STARTER_LOADOUTS } from '../game/creation/characterCreation';
  let { selected, choose }: {
    selected: ClassId;
    choose: (id: ClassId) => void;
  } = $props();
</script>

<section class="class-picker" aria-label={$t('menu.selectClass')}>
  <div class="picker-heading" id="class-picker-label">{$t('menu.selectClass')}</div>
  <div class="class-grid" role="group" aria-labelledby="class-picker-label">
    {#each CLASS_IDS as id (id)}
      <button type="button" class:chosen={selected === id} class="class-card"
        data-class-id={id}
        aria-pressed={selected === id} onclick={() => choose(id)}>
        <span class="class-symbol" aria-hidden="true">{CLASSES[id].icon}</span>
        <span class="class-name">{$t('classes.' + id + '.name')}</span>
        <span class="class-description">{$t('classes.' + id + '.desc')}</span>
      </button>
    {/each}
  </div>
  <section class="class-preview" data-testid="class-preview"
    aria-label={$t('creation.details')}>
    <div class="preview-emblem" aria-hidden="true">{CLASSES[selected].icon}</div>
    <div class="preview-info">
      <div class="preview-name">{$t('classes.' + selected + '.name')}</div>
      <p>{$t('classes.' + selected + '.desc')}</p>
      <dl>
        <div>
          <dt>{$t('creation.strengths')}</dt>
          <dd>{$t('classes.' + selected + '.strengths')}</dd>
        </div>
        <div>
          <dt>{$t('creation.resource')}</dt>
          <dd>{$t('resource.' + CLASSES[selected].resourceId)} · {CLASSES[selected].resourceInitial}/{CLASSES[selected].resourceMax}</dd>
        </div>
        <div>
          <dt>{$t('creation.equipment')}</dt>
          <dd>{$t('classes.' + selected + '.starter')} <span class="starter-count">({STARTER_LOADOUTS[selected].length})</span></dd>
        </div>
      </dl>
    </div>
  </section>
  <p class="save-warning">{$t('creation.overwriteWarning')}</p>
</section>

<style>
  .class-picker { width:100%; margin:15px auto 18px }
  .picker-heading { color:#d3bb90;letter-spacing:.13em;text-transform:uppercase;font-size:.76rem;margin-bottom:11px }
  .class-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px }
  .class-card {display:flex;flex-direction:column;align-items:center;gap:5px;
    padding:12px 8px 11px;background:#131a23db;border:1px solid #54545b;
    min-height:112px;transition:background .16s,border-color .16s;cursor:pointer}
  .class-card:hover,.class-card:focus-visible {background:#202a34;border-color:#b59a70}
  .class-card:focus-visible {outline:2px solid #e8c99c;outline-offset:2px}
  .class-card.chosen {background:#2e2a26;border-color:#d6ae76;box-shadow:inset 0 0 0 1px #a58a5d}
  .class-symbol {font-family:Georgia,serif;color:#d8b985;font-size:1.65rem}
  .class-name {font-family:Georgia,serif;font-size:.93rem;color:#ece3d3}
  .class-description {color:#a7b2b9;font-size:.68rem;line-height:1.35}
  .class-preview {display:flex;align-items:flex-start;gap:14px;padding:13px 15px;margin-top:11px;
    text-align:left;background:rgba(15,22,31,.9);border:1px solid #494846;border-radius:4px}
  .preview-emblem {width:52px;min-width:52px;aspect-ratio:1;display:grid;place-items:center;
    border:1px solid #75654e;border-radius:5px;color:#e2c18d;background:#30291e;
    font-size:1.8rem;font-family:Georgia,serif}
  .preview-info {min-width:0;flex:1}
  .preview-name {color:#f0dfc2;font-family:Georgia,serif;font-size:1.07rem}
  .preview-info p {margin:4px 0 8px;color:#b3bcc1;font-size:.76rem;line-height:1.4}
  dl {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0}
  dl>div {min-width:0}
  dt {color:#c4a982;font-size:.65rem;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px}
  dd {color:#e6e3dc;font-size:.73rem;line-height:1.35;margin:0;overflow-wrap:anywhere}
  .starter-count {color:#9ea9b0}
  .save-warning {font-size:.68rem;line-height:1.35;color:#bdab92;margin:9px 0 0;text-align:center}
  @media(max-width:560px){
    .class-grid {grid-template-columns:repeat(2,minmax(0,1fr))}
    .class-card {min-height:86px;padding:9px 6px}
    .class-description {display:block;font-size:.63rem}
    .class-preview {padding:10px;gap:9px}
    .preview-emblem {width:38px;min-width:38px;font-size:1.3rem}
    dl {grid-template-columns:1fr;gap:6px}
    .preview-info p {font-size:.7rem}
  }
</style>
