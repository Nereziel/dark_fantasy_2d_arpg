<script lang="ts">
  import { onMount } from 'svelte';
  import { _ as t, locale } from 'svelte-i18n';
  import { languageOptions, setLanguage, type Language } from './i18n';
  import { GameBridge } from './game/bridge/GameBridge';
  import type { GameSnapshot } from './game/core/types';
  import { loadGame, saveGame } from './persistence/SaveRepository';
  import GameViewport from './ui/GameViewport.svelte';

  const bridge = new GameBridge();
  let playing = $state(false);
  let state: GameSnapshot = $state(bridge.snapshot());
  let messageKey = $state('');
  let busy = $state(false);

  onMount(() => bridge.subscribe((latest) => { state = latest; }));

  function newGame(): void {
    bridge.command({ type: 'reset' });
    messageKey = '';
    playing = true;
  }
  function resume(): void {
    bridge.command({ type: 'pause', value: false });
    playing = true;
  }
  function menu(): void {
    bridge.command({ type: 'pause', value: true });
    playing = false;
  }
  function togglePause(): void {
    bridge.command({ type: 'pause', value: !state.paused });
  }
  async function save(): Promise<void> {
    busy = true;
    try {
      await saveGame(bridge.snapshot());
      messageKey = 'status.saved';
    } catch {
      messageKey = 'status.saveError';
    } finally {
      busy = false;
    }
  }
  async function load(): Promise<void> {
    busy = true;
    try {
      const snapshot = await loadGame();
      if (snapshot && bridge.restore(snapshot)) {
        messageKey = 'status.loaded';
        playing = true;
      } else {
        messageKey = 'status.emptySave';
      }
    } catch {
      messageKey = 'status.saveError';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Aether &amp; Ruin</title>
  <meta name="description" content="Aether & Ruin – Svelte / Phaser ARPG prototype" />
</svelte:head>

<div class="app-frame">
  {#if !playing}
    <main class="main-menu">
      <div class="menu-orbit"></div>
      <div class="menu-content">
        <div class="kicker">DARK FANTASY · ARPG</div>
        <h1>Aether <span>&amp;</span> Ruin</h1>
        <div class="ornament">◆ ─── ◆ ─── ◆</div>
        <p class="subtitle">{ $t('menu.subtitle') }</p>
        <div class="menu-actions">
          <button class="primary" onclick={newGame}>{$t('menu.start')}</button>
          <button class="secondary" onclick={resume}>{$t('menu.continue')}</button>
          <button class="secondary" disabled={busy} onclick={load}>{$t('menu.load')}</button>
        </div>
        <p class="hint">{ $t('menu.help') }</p>
        <div class="language-choice">
          <label for="menu-language">{ $t('menu.language') }</label>
          <select id="menu-language" value={$locale ?? 'en'} onchange={(event) => setLanguage((event.currentTarget as HTMLSelectElement).value as Language)}>
            {#each languageOptions as option}
              <option value={option.code}>{option.label}</option>
            {/each}
          </select>
        </div>
        {#if messageKey}<p class="notification" role="status">{$t(messageKey)}</p>{/if}
        <p class="prototype">{ $t('menu.current') }</p>
      </div>
    </main>
  {:else}
    <main class="game-screen">
      <GameViewport {bridge} />
      <div class="game-vignette" aria-hidden="true"></div>

      <header class="game-header">
        <div class="brand-mark">AETHER <span>&amp;</span> RUIN</div>
        <div class="zone-name">{ $t('hud.location') }</div>
        <div class="top-actions">
          <label for="game-language" class="visually-hidden">{ $t('menu.language') }</label>
          <select id="game-language" class="compact-select" value={$locale ?? 'en'} onchange={(event) => setLanguage((event.currentTarget as HTMLSelectElement).value as Language)}>
            {#each languageOptions as option}
              <option value={option.code}>{option.label}</option>
            {/each}
          </select>
          <button class="small-button" onclick={togglePause}>{state.paused ? $t('menu.resume') : $t('menu.paused')}</button>
          <button class="small-button" onclick={menu}>{$t('menu.back')}</button>
        </div>
      </header>

      <div class="world-guide" aria-live="polite">
        <div>{$t('controls.move')}</div>
        <div>{$t('controls.attack')}</div>
        <div class="world-guide-sub">{$t('controls.hint')}</div>
      </div>

      <div class="game-hud">
        <div class="portrait"><span>✦</span></div>
        <div class="vital-panel">
          <div class="vital-top"><span>{$t('hud.health')}</span><strong>{state.player.health} / {state.player.maxHealth}</strong></div>
          <div class="health-track"><div class="health-fill" style:width={`${100 * state.player.health / state.player.maxHealth}%`}></div></div>
          <div class="hud-details"><span>{$t('hud.level')} {state.level}</span><span>{$t('hud.kills')}: {state.kills}</span></div>
        </div>
        <div class="status-panel">
          <div class="status-label">{$t('hud.status')}</div>
          <div class="status-value">{$t(`status.${state.status}`)}</div>
        </div>
        <div class="hud-actions">
          <button disabled={busy} onclick={save}>{$t('menu.save')}</button>
          <button disabled={busy} onclick={load}>{$t('menu.load')}</button>
        </div>
      </div>

      {#if messageKey}
        <div class="toast" role="status">{$t(messageKey)}</div>
      {/if}
      {#if state.paused}
        <div class="modal-shield">
          <section class="pause-card" aria-label={$t('menu.paused')}>
            <h2>{$t('menu.paused')}</h2>
            <button class="primary" onclick={togglePause}>{$t('menu.resume')}</button>
            <button class="secondary" onclick={menu}>{$t('menu.back')}</button>
          </section>
        </div>
      {:else if !state.player.alive}
        <div class="modal-shield">
          <section class="pause-card">
            <h2>{$t('hud.gameOver')}</h2>
            <button class="primary" onclick={newGame}>{$t('battle.respawn')}</button>
          </section>
        </div>
      {/if}
    </main>
  {/if}
</div>
