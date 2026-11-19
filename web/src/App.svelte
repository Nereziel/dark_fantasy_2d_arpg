<script lang="ts">
  import { onMount } from 'svelte';
  import { _ as t, locale } from 'svelte-i18n';
  import { languageOptions, setLanguage, type Language } from './i18n';
  import { GameBridge } from './game/bridge/GameBridge';
  import type { GameSnapshot } from './game/core/types';
  import { loadGame, saveGame } from './persistence/SaveRepository';
  import GameViewport from './ui/GameViewport.svelte';
  import CharacterSelect from './ui/CharacterSelect.svelte';
  import InventoryPanel from './ui/InventoryPanel.svelte';
  import SkillBar from './ui/SkillBar.svelte';
  import { CLASSES, type ClassId } from './game/data/classes';

  const bridge = new GameBridge();
  let playing = $state(false);
  let view: GameSnapshot = $state(bridge.snapshot());
  let messageKey = $state('');
  let busy = $state(false);
  let selectedClass: ClassId = $state('WARRIOR');
  let inventoryOpen = $state(false);

  onMount(() => bridge.subscribe((latest) => { view = latest; }));

  function newGame(): void {
    bridge.command({ type: 'reset', classId: selectedClass });
    messageKey = '';
    inventoryOpen = false;
    playing = true;
  }
  function resume(): void {
    bridge.command({ type: 'pause', value: false });
    playing = true;
  }
  function menu(): void {
    inventoryOpen = false;
    bridge.command({ type: 'pause', value: true });
    playing = false;
  }
  function togglePause(): void {
    if (!inventoryOpen) bridge.command({ type: 'pause', value: !view.paused });
  }

  function openInventory(): void {
    if (inventoryOpen || view.paused || !view.player.alive) return;
    inventoryOpen = true;
    bridge.command({ type: 'pause', value: true });
  }
  function closeInventory(): void {
    inventoryOpen = false;
    bridge.command({ type: 'pause', value: false });
  }
  function handleKeydown(event: KeyboardEvent): void {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (!playing || event.repeat) return;
    if (event.code === 'KeyI') {
      event.preventDefault();
      if (inventoryOpen) closeInventory();
      else openInventory();
    } else if (event.code === 'Escape' && inventoryOpen) {
      event.preventDefault();
      closeInventory();
    } else if (!inventoryOpen && !view.paused && view.player.alive &&
      (event.code === 'KeyQ' || event.code === 'Digit1' || event.code === 'Numpad1')) {
      event.preventDefault();
      bridge.command({ type: 'cast', slot: event.code === 'KeyQ' ? 'rmb' : 'slot1' });
    }
  }
  async function save(): Promise<void> {
    busy = true;
    try {
      await saveGame(bridge.character());
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
      const character = await loadGame();
      if (character && bridge.restoreCharacter(character)) {
        messageKey = 'status.loaded';
        inventoryOpen = false;
        selectedClass = bridge.snapshot().classId;
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

<svelte:window onkeydown={handleKeydown} />

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
        <CharacterSelect selected={selectedClass} choose={(id) => { selectedClass = id; }} />
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
          <button class="small-button" onclick={togglePause}>{view.paused ? $t('menu.resume') : $t('menu.paused')}</button>
          <button class="small-button" onclick={menu}>{$t('menu.back')}</button>
        </div>
      </header>

      <div class="world-guide" aria-live="polite">
        <div>{$t('controls.move')}</div>
        <div>{$t('controls.attack')}</div>
        <div>{$t('controls.pickup')}</div>
        <div>{$t('controls.skills')}</div>
        <div>{$t('controls.avoid')}</div>
        <div>{$t('controls.navigate')}</div>
        <div class="world-guide-sub">{$t('controls.hint')}</div>
      </div>

      <aside class="enemy-roster" aria-label={$t('hud.enemies')}>
        <div class="enemy-roster-title">{$t('hud.enemies')} · {view.enemies.filter(unit => unit.actor.alive).length}/{view.enemies.length} · {$t('hud.wave')} {view.wave + 1}</div>
        {#each view.enemies as unit (unit.actor.id)}
          <button
            class:targeted={unit.actor.id === view.selectedTargetId}
            disabled={!unit.actor.alive || !view.player.alive || view.paused}
            aria-pressed={unit.actor.id === view.selectedTargetId}
            onclick={() => bridge.command({ type: 'attack', targetId: unit.actor.id })}
          >
            <span>{$t('enemies.' + unit.actor.type + '.name')}</span>
            <span class="roster-health">{unit.actor.alive
              ? Math.ceil(100 * unit.actor.health / unit.actor.maxHealth) + '%'
              : '—'}</span>
          </button>
        {/each}
      </aside>
      <SkillBar {bridge} {view} />
      <div class="game-hud">
        <div class="portrait"><span>✦</span></div>
        <div class="vital-panel">
          <div class="vital-top"><span>{$t('hud.health')}</span><strong>{view.player.health} / {view.player.maxHealth}</strong></div>
          <div class="health-track"><div class="health-fill" style:width={`${100 * view.player.health / view.player.maxHealth}%`}></div></div>
          <div class="vital-top resource-label"><span>{$t('resource.' + CLASSES[view.classId].resourceId)}</span><strong>{Math.round(view.resource)} / {CLASSES[view.classId].resourceMax}</strong></div>
          <div class="health-track resource-track"><div class="resource-fill" style:width={`${100 * view.resource / CLASSES[view.classId].resourceMax}%`}></div></div>
          <div class="hud-details"><span>{$t('classes.' + view.classId + '.name')} · {$t('hud.level')} {view.level}</span><span>{$t('hud.kills')}: {view.kills} · {$t('hud.gold')}: {view.gold}</span></div>
          <div class="experience-track"><div style:width={`${100 * view.xp / (view.level * 80)}%`}></div></div>
        </div>
        <div class="status-panel">
          <div class="status-label">{$t('hud.enemy')}</div>
          <div class="status-value enemy-name">{$t('enemies.' + view.enemy.type + '.name')}</div>
          <div class="enemy-health">{view.enemy.alive
            ? Math.round(100 * view.enemy.health / view.enemy.maxHealth) + '%'
            : '—'}</div>
          <div class="status-label">{$t('hud.status')}: {$t(`status.${view.status}`)}</div>
        </div>
        <div class="hud-actions">
          <button onclick={openInventory}>{$t('inventory.open')}</button>
          <button disabled={busy} onclick={save}>{$t('menu.save')}</button>
          <button disabled={busy} onclick={load}>{$t('menu.load')}</button>
        </div>
      </div>

      {#if view.enemies.some(unit => unit.intent !== null) && !inventoryOpen}
        <div class="danger-alert" role="status">
          <strong>{$t('combat.warning')}</strong>
          <span>{$t('combat.dodge')}</span>
        </div>
      {/if}
      {#if messageKey}
        <div class="toast" role="status">{$t(messageKey)}</div>
      {/if}
      {#if inventoryOpen}
        <InventoryPanel {view} {bridge} close={closeInventory} />
      {:else if view.paused}
        <div class="modal-shield">
          <section class="pause-card" aria-label={$t('menu.paused')}>
            <h2>{$t('menu.paused')}</h2>
            <button class="primary" onclick={togglePause}>{$t('menu.resume')}</button>
            <button class="secondary" onclick={menu}>{$t('menu.back')}</button>
          </section>
        </div>
      {:else if !view.player.alive}
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
