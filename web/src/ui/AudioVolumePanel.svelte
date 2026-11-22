<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import { AUDIO_VOLUME_KEYS, type AudioPreferences, type AudioVolumeKey } from '../game/audio/audioPreferences';

  let { preferences, save }: {
    preferences: AudioPreferences;
    save: (next: AudioPreferences) => void;
  } = $props();

  function setVolume(bus: AudioVolumeKey, value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 100) return;
    save({ ...preferences, [bus]: value / 100 });
  }
</script>

<section class="audio-settings" aria-label={$t('audioSettings.title')}>
  <h3>{$t('audioSettings.title')}</h3>
  <p>{$t('audioSettings.description')}</p>
  <label class="audio-mute" for="audio-muted">
    <span>{$t('audioSettings.mute')}</span>
    <input id="audio-muted" data-testid="audio-muted" type="checkbox"
      checked={preferences.muted}
      onchange={(event) => save({ ...preferences, muted: event.currentTarget.checked })} />
  </label>
  {#each AUDIO_VOLUME_KEYS as bus (bus)}
    <div class="audio-row">
      <label for={'audio-' + bus}>{$t('audioSettings.' + bus)}</label>
      <input id={'audio-' + bus} data-testid={'audio-' + bus}
        type="range" min="0" max="100" step="5"
        value={String(Math.round(preferences[bus] * 100))}
        oninput={(event) => setVolume(bus, event.currentTarget.valueAsNumber)} />
      <output for={'audio-' + bus}>{Math.round(preferences[bus] * 100)}%</output>
    </div>
  {/each}
</section>

<style>
  .audio-settings{border-top:1px solid #706453;margin-top:18px;padding-top:12px}
  h3{font-family:Cinzel,Georgia,serif;font-size:1.02rem;color:#ecd8b2;margin:3px 0 7px}
  p{font-size:.77rem;color:#bdb6aa;line-height:1.45;margin:5px 0 13px}
  .audio-mute{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:44px;margin-bottom:8px;color:#e6dbc5;font-size:.83rem}
  .audio-mute input{width:22px;height:22px;accent-color:#e3bc75}
  .audio-row{display:grid;grid-template-columns:minmax(96px,1fr) minmax(90px,1.4fr) 42px;align-items:center;gap:9px;min-height:44px;font-size:.79rem;color:#e6dbc5}
  .audio-row input[type='range']{width:100%;height:34px;accent-color:#e1b36f}
  .audio-row label{overflow-wrap:anywhere}
  output{font-variant-numeric:tabular-nums;text-align:right;color:#e5cc9d}
  @media(max-width:390px){.audio-row{gap:5px;grid-template-columns:minmax(80px,1fr) minmax(75px,1.25fr) 38px}}
</style>
