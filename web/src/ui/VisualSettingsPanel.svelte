<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import type { VisualPreferences, MotionPreference, CameraShakePreference, UiScalePreference } from '../game/ui/visualPreferences';

  let { preferences, save, close }: {
    preferences: VisualPreferences;
    save: (next: VisualPreferences) => void;
    close: () => void;
  } = $props();

  function change(next: Partial<VisualPreferences>): void {
    save({ ...preferences, ...next });
  }
</script>

<div class="visual-settings-card" role="dialog" aria-modal="true"
  aria-label={$t('visualSettings.title')} data-testid="visual-settings-dialog">
  <header>
    <h2>{$t('visualSettings.title')}</h2>
    <button type="button" class="settings-close" data-testid="visual-settings-close"
      aria-label={$t('visualSettings.close')} onclick={close}>×</button>
  </header>
  <p>{$t('visualSettings.description')}</p>
  <div class="setting-rows">
    <div class="setting-row">
      <label for="visual-motion">{$t('visualSettings.motion')}</label>
      <select id="visual-motion" data-testid="visual-motion" value={preferences.motion}
        onchange={(event) => change({ motion: event.currentTarget.value as MotionPreference })}>
        <option value="system">{$t('visualSettings.motionSystem')}</option>
        <option value="reduced">{$t('visualSettings.motionReduced')}</option>
        <option value="full">{$t('visualSettings.motionFull')}</option>
      </select>
    </div>
    <div class="setting-row">
      <label for="visual-shake">{$t('visualSettings.shake')}</label>
      <select id="visual-shake" data-testid="visual-shake" value={preferences.shake}
        onchange={(event) => change({ shake: Number(event.currentTarget.value) as CameraShakePreference })}>
        <option value="0">{$t('visualSettings.off')}</option>
        <option value="0.5">{$t('visualSettings.half')}</option>
        <option value="1">{$t('visualSettings.full')}</option>
      </select>
    </div>
    <div class="setting-row">
      <label for="visual-scale">{$t('visualSettings.uiScale')}</label>
      <select id="visual-scale" data-testid="visual-scale" value={preferences.uiScale}
        onchange={(event) => change({ uiScale: Number(event.currentTarget.value) as UiScalePreference })}>
        <option value="0.9">90%</option>
        <option value="1">100%</option>
        <option value="1.1">110%</option>
      </select>
    </div>
    <label class="setting-toggle" for="visual-floating-text">
      <span>{$t('visualSettings.floatingText')}</span>
      <input id="visual-floating-text" data-testid="visual-floating-text"
        type="checkbox" checked={preferences.floatingCombatText}
        onchange={(event) => change({ floatingCombatText: event.currentTarget.checked })} />
    </label>
    <label class="setting-toggle" for="visual-high-contrast">
      <span>{$t('visualSettings.highContrast')}</span>
      <input id="visual-high-contrast" data-testid="visual-high-contrast"
        type="checkbox" checked={preferences.highContrast}
        onchange={(event) => change({ highContrast: event.currentTarget.checked })} />
    </label>
  </div>
  <footer>
    <button type="button" class="primary" onclick={close}>{$t('visualSettings.close')}</button>
  </footer>
</div>

<style>
  .visual-settings-card {
    width:min(94vw,560px);max-height:85dvh;overflow:auto;
    padding:18px 20px;background:#141b24;border:1px solid #b39366;
    box-shadow:0 25px 60px #000;text-align:left;
  }
  header{display:flex;align-items:center;justify-content:space-between;gap:10px}
  h2{margin:0;color:#ebd9b6;font-family:Cinzel,Georgia,serif;font-size:1.22rem}
  p{color:#cfc4b3;font-size:.8rem;line-height:1.5}
  .settings-close{min-width:44px;min-height:44px;font-size:1.5rem;padding:5px}
  .setting-rows{display:grid;gap:12px;margin:14px 0}
  .setting-row,.setting-toggle{
    display:flex;align-items:center;justify-content:space-between;gap:16px;
    min-height:48px;border-bottom:1px solid #44505b;
    color:#e6dbc5;font-size:.85rem
  }
  .setting-row label,.setting-toggle span{flex:1;min-width:0;overflow-wrap:anywhere}
  select{min-width:130px;max-width:52%;min-height:44px}
  input[type='checkbox']{width:22px;height:22px;accent-color:#e3bc75;flex-shrink:0}
  footer{display:flex;justify-content:flex-end;margin-top:12px}
  footer button{min-height:44px}
  @media(max-width:430px){
    .visual-settings-card{padding:12px;max-height:90dvh}
    .setting-row,.setting-toggle{gap:8px}
    select{min-width:114px}
  }
</style>
