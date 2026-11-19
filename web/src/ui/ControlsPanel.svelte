<script lang="ts">
  import { _ as t } from 'svelte-i18n';
  import { rebindAction, type InputAction, type InputBinding } from '../game/input/bindings';

  let { bindings, save, close }: {
    bindings: readonly InputBinding[];
    save: (next: InputBinding[]) => void;
    close: () => void;
  } = $props();
  let capturing: InputAction | null = $state(null);
  let error = $state('');
  const actions: readonly InputAction[] = [
    'PRIMARY', 'SECONDARY', 'FORCE_MOVE', 'HOLD_POSITION',
    'SLOT_1', 'SLOT_2', 'SLOT_3', 'SLOT_4',
    'POTION', 'EVADE', 'INVENTORY', 'CHARACTER',
    'SKILLS', 'TALENTS', 'MAP', 'JOURNAL', 'MENU'
  ];
  function currentLabel(action: InputAction): string {
    return bindings.filter(binding => binding.action === action)
      .map(binding => binding.device === 'keyboard' ? binding.code : 'Mouse ' + binding.button)
      .join(' / ') || '—';
  }
  function assign(binding: InputBinding): void {
    const result = rebindAction(bindings, binding);
    if (result.ok) {
      save(result.bindings);
      error = '';
      capturing = null;
    } else error = result.reason;
  }
  function captureKey(event: KeyboardEvent): void {
    if (!capturing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.code === 'Escape') { capturing = null; error = ''; return; }
    assign({ action: capturing, device: 'keyboard', code: event.code });
  }
  function captureMouse(event: MouseEvent): void {
    if (!capturing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    assign({ action: capturing, device: 'mouse', button: event.button });
  }
</script>

<svelte:window onkeydown={captureKey} onmousedown={captureMouse} />

<div class="controls-card" role="dialog" aria-modal="true" aria-label={$t('bindings.title')}>
  <h2>{$t('bindings.title')}</h2>
  <p>{$t('bindings.help')}</p>
  {#if capturing}
    <p class="capture-hint" role="status">{$t('bindings.press')} · {$t('bindings.actions.' + capturing)}</p>
  {/if}
  {#if error}<p class="binding-error" role="alert">{$t('bindings.' + error)}</p>{/if}
  <div class="binding-rows">
    {#each actions as action}
      <div class="binding-row">
        <span class="binding-action">{$t('bindings.actions.' + action)}</span>
        <code>{currentLabel(action)}</code>
        <button disabled={capturing !== null && capturing !== action}
          onclick={() => { capturing = action; error = ''; }}>
          {$t(capturing === action ? 'bindings.pressShort' : 'bindings.change')}
        </button>
      </div>
    {/each}
  </div>
  <div class="controls-footer">
    <button onclick={() => { capturing = null; error = ''; save([]); }}>{$t('bindings.reset')}</button>
    <button class="primary" onclick={close}>{$t('bindings.close')}</button>
  </div>
  <small>{$t('bindings.reserved')}</small>
</div>

<style>
  .controls-card{width:min(96vw,650px);max-height:85vh;overflow:auto;padding:18px 22px;background:#141b24;border:1px solid #b39366;box-shadow:0 25px 60px #000;text-align:left}
  h2{margin:0 0 10px;font-family:Cinzel,Georgia,serif;color:#e2d3b2}
  p,small{color:#bcb6aa;font-size:.78rem}
  .capture-hint{color:#e9d28c}
  .binding-error{color:#efaaa2}
  .binding-rows{display:grid;gap:4px;margin:14px 0}
  .binding-row{display:grid;grid-template-columns:minmax(110px,1fr) minmax(95px,1.2fr) 110px;align-items:center;gap:10px;padding:5px 6px;border-bottom:1px solid #3a424c}
  .binding-action{color:#d9cbaf;font-size:.75rem}
  code{font-size:.7rem;overflow-wrap:anywhere;color:#9fcae2}
  button{font-size:.72rem;padding:7px 10px}
  .controls-footer{display:flex;justify-content:flex-end;gap:10px}
  @media(max-width:560px){.binding-row{grid-template-columns:1fr 1fr 75px;gap:4px}.binding-row button{padding:5px}.controls-card{padding:11px}}
</style>
