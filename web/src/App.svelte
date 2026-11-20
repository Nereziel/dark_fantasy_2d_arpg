<script lang="ts">
  import { onMount } from 'svelte';
  import { _ as t, locale } from 'svelte-i18n';
  import { languageOptions, setLanguage, type Language } from './i18n';
  import { GameBridge } from './game/bridge/GameBridge';
  import type { GameSnapshot } from './game/core/types';
  import { resolveKeyboardAction, rebindAction, type InputBinding, type InputAction } from './game/input/bindings';
  import { GAME_BINDINGS } from './game/input/gameBindings';
  import { loadGame, saveGame } from './persistence/SaveRepository';
  import { CharacterAutosaver } from './persistence/CharacterAutosaver';
  import { CAMP, CAMP_RADIUS } from './game/world/generator';
  import GameViewport from './ui/GameViewport.svelte';
  import CharacterSelect from './ui/CharacterSelect.svelte';
  import InventoryPanel from './ui/InventoryPanel.svelte';
  import CharacterSheet from './ui/CharacterSheet.svelte';
  import ControlsPanel from './ui/ControlsPanel.svelte';
  import SkillBar from './ui/SkillBar.svelte';
  import QuestJournal from './ui/QuestJournal.svelte';
  import NpcDialogue from './ui/NpcDialogue.svelte';
  import TradePanel from './ui/TradePanel.svelte';
  import DungeonPanel from './ui/DungeonPanel.svelte';
  import {
    MERCHANT_ID, BLACKSMITH_ID, type NpcId, type TradeNpcId
  } from './game/world/npcs';
  import { WARDEN_ID } from './game/quests/firstQuest';
  import { CLASSES, type ClassId } from './game/data/classes';
  import { xpRequiredForLevel } from './game/progression/progressionRules';

  const bridge = new GameBridge();
  let playing = $state(false);
  let view: GameSnapshot = $state(bridge.snapshot());
  let messageKey = $state('');
  let busy = $state(false);
  let selectedClass: ClassId = $state('WARRIOR');
  let inventoryOpen = $state(false);
  let characterOpen = $state(false);
  let controlsOpen = $state(false);
  let controlBindings: InputBinding[] = $state(GAME_BINDINGS.map(binding => ({ ...binding })));
  const controlsStorage = 'aether-ruin-controls-v1';

  function updateBindings(next: InputBinding[]): void {
    const updated = next.length ? next : GAME_BINDINGS.map(binding => ({ ...binding }));
    controlBindings = updated;
    bridge.setBindings(updated);
    const actions = new Set<InputAction>(updated.map(binding => binding.action));
    const overrides: InputBinding[] = [];
    for (const action of actions) {
      const current = updated.filter(binding => binding.action === action);
      const defaults = GAME_BINDINGS.filter(binding => binding.action === action);
      if (JSON.stringify(current) !== JSON.stringify(defaults)) overrides.push(...current);
    }
    try {
      window.localStorage.setItem(controlsStorage, JSON.stringify(overrides));
    } catch { /* Settings may be unavailable in private browsing. */ }
  }

  function openControls(): void {
    if (!playing || dialogueOpen || tradeNpc !== null || inventoryOpen || characterOpen) return;
    bridge.command({ type: 'pause', value: true });
    controlsOpen = true;
  }
  let dialogueOpen = $state(false);
  let tradeNpc: TradeNpcId | null = $state(null);
  const heldShiftKeys = new Set<string>();
  const autosaver = new CharacterAutosaver(saveGame, 1400, () => {
    messageKey = 'status.saveError';
  });

  onMount(() => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(controlsStorage) ?? '[]');
      if (Array.isArray(raw) && raw.length <= 25) {
        let result: readonly InputBinding[] = GAME_BINDINGS;
        for (const value of raw) {
          const applied = rebindAction(result, value as InputBinding);
          if (!applied.ok) throw new Error('Invalid control mapping');
          result = applied.bindings;
        }
        controlBindings = result.map(binding => ({ ...binding }));
        bridge.setBindings(controlBindings);
      }
    } catch { /* Invalid settings fall back to defaults. */ }
    const unsubscribeEvents = bridge.onEvent((event) => {
      if (event.type === 'dungeonCleared' && playing) messageKey = 'dungeon.clearedToast';
      if (event.type === 'worldInteract' && playing) {
        messageKey = event.kind === 'shrine' ? 'worldObjects.shrine' : 'worldObjects.chest';
      }
      if (event.type === 'zoneChanged' && playing) messageKey = '';
      if (event.type === 'npcDialogue' && playing) {
        inventoryOpen = false;
        if (event.npcId === WARDEN_ID) {
          dialogueOpen = true;
          tradeNpc = null;
        } else {
          tradeNpc = event.npcId;
          dialogueOpen = false;
        }
        bridge.command({ type: 'pause', value: true });
      }
    });
    const unsubscribe = bridge.subscribe((latest) => {
      view = latest;
      if (playing) autosaver.schedule(bridge.character());
    });
    // Browser lifecycle hooks are best-effort; the regular autosave debounce
    // is what protects character progression during normal play.
    const flushOnExit = () => { void autosaver.flush().catch(() => {}); };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushOnExit();
    };
    window.addEventListener('pagehide', flushOnExit);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      unsubscribe();
      unsubscribeEvents();
      window.removeEventListener('pagehide', flushOnExit);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void autosaver.dispose().catch(() => {});
    };
  });

  function newGame(): void {
    bridge.command({ type: 'reset', classId: selectedClass });
    messageKey = '';
    inventoryOpen = false;
    characterOpen = false;
    controlsOpen = false;
    dialogueOpen = false;
    tradeNpc = null;
    playing = true;
    void autosaver.saveNow(bridge.character()).catch(() => {
      messageKey = 'status.saveError';
    });
  }
  function resume(): void {
    bridge.command({ type: 'pause', value: false });
    playing = true;
  }
  function menu(): void {
    controlsOpen = false;
    heldShiftKeys.clear();
    bridge.command({ type: 'holdPosition', value: false });
    tradeNpc = null;
    dialogueOpen = false;
    inventoryOpen = false;
    characterOpen = false;
    bridge.command({ type: 'pause', value: true });
    void autosaver.flush().catch(() => { messageKey = 'status.saveError'; });
    playing = false;
  }
  function togglePause(): void {
    if (controlsOpen) return;
    if (!inventoryOpen && !characterOpen && !dialogueOpen && tradeNpc === null) bridge.command({ type: 'pause', value: !view.paused });
  }

  function openInventory(): void {
    if (dialogueOpen || tradeNpc !== null || inventoryOpen || characterOpen || view.paused || !view.player.alive) return;
    inventoryOpen = true;
    bridge.command({ type: 'pause', value: true });
  }
  function closeInventory(): void {
    inventoryOpen = false;
    bridge.command({ type: 'pause', value: false });
  }
  function openCharacterSheet(): void {
    if (dialogueOpen || tradeNpc !== null || inventoryOpen || characterOpen ||
      view.paused || !view.player.alive) return;
    characterOpen = true;
    bridge.command({ type: 'pause', value: true });
  }
  function closeCharacterSheet(): void {
    characterOpen = false;
    bridge.command({ type: 'pause', value: false });
  }
  function interact(npcId: NpcId): void {
    if (inventoryOpen || characterOpen || dialogueOpen || tradeNpc !== null || view.paused) return;
    bridge.command({ type: 'interactNpc', npcId });
  }
  function talkToWarden(): void { interact(WARDEN_ID); }
  function acceptQuest(): void {
    bridge.command({ type: 'questAccept' });
  }
  function turnInQuest(): void {
    bridge.command({ type: 'questTurnIn' });
  }
  function closeDialogue(): void {
    dialogueOpen = false;
    tradeNpc = null;
    bridge.command({ type: 'pause', value: false });
  }
  function handleKeydown(event: KeyboardEvent): void {
    if (!playing || controlsOpen) return;
    const target = event.target;
    const isTyping = target instanceof HTMLElement
      && !!target.closest('input, textarea, select, [contenteditable="true"]');
    const action = resolveKeyboardAction({
      code: event.code, repeat: event.repeat, isTyping, uiCaptured: false
    }, bridge.bindings());
    if (!action) return;

    if (action === 'MENU') {
      event.preventDefault();
      if (dialogueOpen || tradeNpc !== null) closeDialogue();
      else if (inventoryOpen) closeInventory();
      else if (characterOpen) closeCharacterSheet();
      else togglePause();
      return;
    }
    if (action === 'INVENTORY') {
      if (dialogueOpen || tradeNpc !== null || characterOpen) return;
      event.preventDefault();
      if (inventoryOpen) closeInventory();
      else openInventory();
      return;
    }
    if (action === 'CHARACTER') {
      if (dialogueOpen || tradeNpc !== null || inventoryOpen) return;
      event.preventDefault();
      if (characterOpen) closeCharacterSheet();
      else openCharacterSheet();
      return;
    }
    if (dialogueOpen || tradeNpc !== null || inventoryOpen || characterOpen
      || view.paused || !view.player.alive) return;

    if (action === 'HOLD_POSITION') {
      event.preventDefault();
      heldShiftKeys.add(event.code);
      bridge.command({ type: 'holdPosition', value: true });
    } else if (action === 'EVADE') {
      event.preventDefault();
      bridge.command({ type: 'evade' });
    } else if (action === 'SECONDARY' || action === 'SLOT_1') {
      event.preventDefault();
      const slot = action === 'SECONDARY' ? 'rmb' : 'slot1';
      const aim = bridge.skillAim(slot);
      bridge.command({ type: 'cast', slot, ...(aim ? { aim } : {}) });
    } else if (view.classId === 'WARRIOR'
      && ['SLOT_2', 'SLOT_3', 'SLOT_4', 'SLOT_5', 'SLOT_6'].includes(action)) {
      const slots = {
        SLOT_2: 'groundSlam', SLOT_3: 'warCry', SLOT_4: 'whirlwind',
        SLOT_5: 'execute', SLOT_6: 'basicAttack'
      } as const;
      const id = slots[action as keyof typeof slots];
      event.preventDefault();
      bridge.command({ type: 'warriorAbility', id, targetId: view.selectedTargetId ?? view.enemy.id });
    } else if (action === 'FORCE_MOVE' || action === 'PRIMARY') {
      const position = bridge.pointerPosition();
      if (!position) return;
      event.preventDefault();
      bridge.command({ type: 'move', destination: position });
    }
    // Non-Warrior classes retain reserved slots until their class kits are complete.
  }
  function handleKeyup(event: KeyboardEvent): void {
    if (!heldShiftKeys.delete(event.code)) return;
    bridge.command({ type: 'holdPosition', value: heldShiftKeys.size > 0 });
  }
  function handleBlur(): void {
    if (heldShiftKeys.size === 0) return;
    heldShiftKeys.clear();
    bridge.command({ type: 'holdPosition', value: false });
  }
  async function save(): Promise<void> {
    busy = true;
    try {
      await autosaver.saveNow(bridge.character());
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
      await autosaver.flush();
      const character = await loadGame();
      if (character && bridge.restoreCharacter(character)) {
        messageKey = 'status.loaded';
        inventoryOpen = false;
        characterOpen = false;
        controlsOpen = false;
        dialogueOpen = false;
        tradeNpc = null;
        selectedClass = bridge.snapshot().classId;
        autosaver.prime(bridge.character());
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

<svelte:window onkeydown={handleKeydown} onkeyup={handleKeyup} onblur={handleBlur} />

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
    <main class="game-screen" data-world-seed={view.worldSeed} data-zone={view.zone}
      data-player-x={view.player.x} data-player-y={view.player.y}>
      <GameViewport {bridge} />
      <div class="game-vignette" aria-hidden="true"></div>

      <header class="game-header">
        <div class="brand-mark">AETHER <span>&amp;</span> RUIN</div>
        <div class="zone-name">{view.zone === 'crypt' ? $t('dungeon.name')
          : Math.hypot(view.player.x - CAMP.x, view.player.y - CAMP.y) <= CAMP_RADIUS
          ? $t('hud.camp') : $t('hud.location')}</div>
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

      <QuestJournal {view} talk={talkToWarden} />
      {#if view.zone === 'wilderness' &&
        Math.hypot(view.player.x - CAMP.x, view.player.y - CAMP.y) <= CAMP_RADIUS + 40}
        <div class="camp-services" aria-label={$t('trade.campServices')}>
          <div class="camp-services-label">{$t('trade.campServices')}</div>
          <button disabled={!view.player.alive || view.paused}
            onclick={() => interact(MERCHANT_ID)}>{$t('trade.browse')}</button>
          <button disabled={!view.player.alive || view.paused}
            onclick={() => interact(BLACKSMITH_ID)}>{$t('trade.visitSmith')}</button>
        </div>
      {/if}
      <DungeonPanel {view} {bridge} />
      <aside class="enemy-roster" aria-label={$t('hud.enemies')}>
        <div class="enemy-roster-title">{$t('hud.enemies')} · {view.enemies.filter(unit => unit.actor.alive).length}/{view.enemies.length} · {$t('hud.wave')} {view.wave + 1}</div>
        {#each view.enemies as unit (unit.actor.id)}
          <button
            class:targeted={unit.actor.id === view.selectedTargetId}
            disabled={!unit.actor.alive || !view.player.alive || view.paused}
            aria-pressed={unit.actor.id === view.selectedTargetId}
            onclick={() => bridge.command({ type: 'attack', targetId: unit.actor.id })}
          >
            <span>{unit.elite ? $t('hud.elite') + ' · ' : ''}{$t('enemies.' + unit.actor.type + '.name')}
              {#if unit.elite}
                <small class="elite-modifiers">{unit.elite.modifiers.map(id => $t('eliteModifier.' + id)).join(' · ')}</small>
              {/if}
            </span>
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
          {#if view.shield > 0}
            <div class="vital-top resource-label"><span>{$t('hud.shield')}</span><strong>{view.shield}</strong></div>
          {/if}
          <div class="vital-top resource-label"><span>{$t('resource.' + CLASSES[view.classId].resourceId)}</span><strong>{Math.round(view.resource)} / {view.stats.maxResource}</strong></div>
          <div class="health-track resource-track"><div class="resource-fill" style:width={`${100 * view.resource / view.stats.maxResource}%`}></div></div>
          <div class="hud-details"><span>{$t('classes.' + view.classId + '.name')} · {$t('hud.level')} {view.level}</span><span>{$t('hud.kills')}: {view.kills} · {$t('hud.gold')}: {view.gold}</span></div>
          <div class="experience-track"><div style:width={`${xpRequiredForLevel(view.level) > 0 ? 100 * view.xp / xpRequiredForLevel(view.level) : 100}%`}></div></div>
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
          <button onclick={openCharacterSheet}>{$t('character.open')}</button>
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
      {#if tradeNpc}
        <TradePanel {view} {bridge} npc={tradeNpc} close={closeDialogue} />
      {:else if controlsOpen}
        <div class="modal-shield">
          <ControlsPanel bindings={controlBindings} save={updateBindings}
            close={() => { controlsOpen = false; }} />
        </div>
      {:else if dialogueOpen}
        <NpcDialogue quest={view.quest} accept={acceptQuest} turnIn={turnInQuest} close={closeDialogue} />
      {:else if inventoryOpen}
        <InventoryPanel {view} {bridge} close={closeInventory} />
      {:else if characterOpen}
        <CharacterSheet {view} close={closeCharacterSheet} />
      {:else if view.paused}
        <div class="modal-shield">
          <section class="pause-card" aria-label={$t('menu.paused')}>
            <h2>{$t('menu.paused')}</h2>
            <button class="primary" onclick={togglePause}>{$t('menu.resume')}</button>
            <button class="secondary" onclick={openControls}>{$t('bindings.open')}</button>
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
