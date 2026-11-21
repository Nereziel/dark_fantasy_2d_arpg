<script lang="ts">
  import { onMount } from 'svelte';
  import { _ as t, locale } from 'svelte-i18n';
  import { languageOptions, setLanguage, type Language } from './i18n';
  import { GameBridge } from './game/bridge/GameBridge';
  import type { GameSnapshot } from './game/core/types';
  import { resolveKeyboardAction, rebindAction, type InputBinding, type InputAction } from './game/input/bindings';
  import { GAME_BINDINGS } from './game/input/gameBindings';
  import { loadGame, saveGame } from './persistence/SaveRepository';
  import { loadWorldProgress, saveWorldProgress } from './persistence/WorldProgressRepository';
  import type { WorldSessionProgress } from './game/core/types';
  import { CharacterAutosaver } from './persistence/CharacterAutosaver';
  import { CAMP, CAMP_RADIUS } from './game/world/generator';
  import GameViewport from './ui/GameViewport.svelte';
  import CharacterSelect from './ui/CharacterSelect.svelte';
  import InventoryPanel from './ui/InventoryPanel.svelte';
  import CharacterSheet from './ui/CharacterSheet.svelte';
  import TalentTree from './ui/TalentTree.svelte';
  import ControlsPanel from './ui/ControlsPanel.svelte';
  import SkillBar from './ui/SkillBar.svelte';
  import QuestJournal from './ui/QuestJournal.svelte';
  import WorldMapCanvas from './ui/WorldMapCanvas.svelte';
  import WorldEventPanel from './ui/WorldEventPanel.svelte';
  import EnvironmentPanel from './ui/EnvironmentPanel.svelte';
  import WaypointPanel from './ui/WaypointPanel.svelte';
  import NpcDialogue from './ui/NpcDialogue.svelte';
  import TradePanel from './ui/TradePanel.svelte';
  import StashPanel from './ui/StashPanel.svelte';
  import DungeonPanel from './ui/DungeonPanel.svelte';
  import {
    MERCHANT_ID, BLACKSMITH_ID, type NpcId, type TradeNpcId
  } from './game/world/npcs';
  import { WARDEN_ID } from './game/quests/firstQuest';
  import { townEntry, type TownEntry } from './game/world/townManifest';
  import { CLASSES, type ClassId } from './game/data/classes';
  import { PALADIN_EXTRA_IDS } from './game/skills/paladinKit';
  import { MAGE_EXTRA_IDS } from './game/skills/mageKit';
  import { NECRO_EXTRA_IDS } from './game/skills/necromancerKit';
  import { ROGUE_EXTRA_IDS } from './game/skills/rogueKit';
  import { POTION_IDS, POTIONS } from './game/consumables/potionRules';
  import { xpRequiredForLevel } from './game/progression/progressionRules';

  const bridge = new GameBridge();
  let playing = $state(false);
  let view: GameSnapshot = $state(bridge.snapshot());
  let messageKey = $state('');
  let busy = $state(false);
  let selectedClass: ClassId = $state('WARRIOR');
  let inventoryOpen = $state(false);
  let characterOpen = $state(false);
  let talentsOpen = $state(false);
  let controlsOpen = $state(false);
  let mapOpen = $state(false);
  let miniProjection = $derived(view.zone === 'wilderness' ? bridge.mapProjection('minimap') : null);
  let fullProjection = $derived(mapOpen && view.zone === 'wilderness'
    ? bridge.mapProjection('world') : null);
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
    if (!playing || dialogueOpen || tradeNpc !== null || townModal !== null
      || inventoryOpen || characterOpen || talentsOpen) return;
    bridge.command({ type: 'pause', value: true });
    controlsOpen = true;
  }
  let dialogueOpen = $state(false);
  let tradeNpc: TradeNpcId | null = $state(null);
  let townModal: TownEntry | null = $state(null);
  const heldShiftKeys = new Set<string>();
  const autosaver = new CharacterAutosaver(saveGame, 1400, () => {
    messageKey = 'status.saveError';
  });
  const worldAutosaver = new CharacterAutosaver<WorldSessionProgress>(saveWorldProgress, 1700, () => {
    messageKey = 'status.saveError';
  });

  function openMap(): void {
    if (!playing || mapOpen || view.zone !== 'wilderness' || !view.player.alive
      || view.paused || inventoryOpen || characterOpen || talentsOpen || controlsOpen || dialogueOpen
      || tradeNpc !== null || townModal !== null) return;
    bridge.command({ type: 'pause', value: true });
    mapOpen = true;
  }
  function closeMap(): void {
    mapOpen = false;
    bridge.command({ type: 'pause', value: false });
  }

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
      if (event.type === 'worldEventStarted' && playing) messageKey = 'worldEvents.started';
      if (event.type === 'worldEventCompleted' && playing) messageKey = 'worldEvents.completed';
      if (event.type === 'checkpointActivated' && playing) messageKey = 'respawn.checkpointActivated';
      if (event.type === 'waypointActivated' && playing && event.id === 'town.waypoint')
        messageKey = 'waypoints.activated';
      if (event.type === 'waypointTravel' && playing) {
        messageKey = 'waypoints.arrived';
        if (mapOpen) closeMap();
        else if (townModal !== null) closeDialogue();
      }
      if (event.type === 'environmentInteracted' && playing) {
        messageKey = 'environment.feedback.' + event.kind;
      }
      if (event.type === 'worldInteract' && playing && event.id !== 'soul-shrine') {
        messageKey = event.kind === 'shrine' ? 'worldObjects.shrine' : 'worldObjects.chest';
      }
      if (event.type === 'zoneChanged' && playing) messageKey = '';
      if (event.type === 'townInteraction' && playing) {
        townModal = townEntry(event.entryId);
        tradeNpc = null;
        dialogueOpen = false;
        inventoryOpen = false;
        bridge.command({ type: 'pause', value: true });
      }
      if (event.type === 'townServiceUsed' && playing) messageKey = 'town.serviceSuccess';
      if (event.type === 'tradeRejected' && playing) messageKey = 'trade.error.' + event.reason;
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
      if (playing) {
        autosaver.schedule(bridge.character());
        const world = bridge.worldProgress();
        if (world) worldAutosaver.schedule(world);
      }
    });
    // Browser lifecycle hooks are best-effort; the regular autosave debounce
    // is what protects character progression during normal play.
    const flushOnExit = () => {
      void autosaver.flush().catch(() => {});
      void worldAutosaver.flush().catch(() => {});
    };
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
      void worldAutosaver.dispose().catch(() => {});
    };
  });

  function respawn(): void {
    if (!playing || view.player.alive) return;
    heldShiftKeys.clear();
    inventoryOpen = false;
    characterOpen = false;
    talentsOpen = false;
    controlsOpen = false;
    mapOpen = false;
    dialogueOpen = false;
    tradeNpc = null;
    townModal = null;
    bridge.command({ type: 'respawn' });
  }

  function newGame(): void {
    bridge.command({ type: 'reset', classId: selectedClass });
    messageKey = '';
    inventoryOpen = false;
    characterOpen = false;
    controlsOpen = false;
    mapOpen = false;
    dialogueOpen = false;
    tradeNpc = null;
    townModal = null;
    playing = true;
    void autosaver.saveNow(bridge.character()).catch(() => {
      messageKey = 'status.saveError';
    });
    const world = bridge.worldProgress();
    if (world) void worldAutosaver.saveNow(world).catch(() => {
      messageKey = 'status.saveError';
    });
  }
  function resume(): void {
    bridge.command({ type: 'pause', value: false });
    playing = true;
  }
  function menu(): void {
    talentsOpen = false;
    controlsOpen = false;
    mapOpen = false;
    heldShiftKeys.clear();
    bridge.command({ type: 'holdPosition', value: false });
    tradeNpc = null;
    townModal = null;
    dialogueOpen = false;
    inventoryOpen = false;
    characterOpen = false;
    bridge.command({ type: 'pause', value: true });
    void autosaver.flush().catch(() => { messageKey = 'status.saveError'; });
    void worldAutosaver.flush().catch(() => { messageKey = 'status.saveError'; });
    playing = false;
  }
  function togglePause(): void {
    if (controlsOpen || mapOpen || talentsOpen) return;
    if (!inventoryOpen && !characterOpen && !dialogueOpen && townModal === null && tradeNpc === null) bridge.command({ type: 'pause', value: !view.paused });
  }

  function openInventory(): void {
    if (dialogueOpen || tradeNpc !== null || townModal !== null || inventoryOpen || characterOpen || talentsOpen || view.paused || !view.player.alive) return;
    inventoryOpen = true;
    bridge.command({ type: 'pause', value: true });
  }
  function closeInventory(): void {
    inventoryOpen = false;
    bridge.command({ type: 'pause', value: false });
  }
  function openCharacterSheet(): void {
    if (dialogueOpen || tradeNpc !== null || townModal !== null || inventoryOpen || characterOpen || talentsOpen ||
      view.paused || !view.player.alive) return;
    characterOpen = true;
    bridge.command({ type: 'pause', value: true });
  }
  function closeCharacterSheet(): void {
    characterOpen = false;
    bridge.command({ type: 'pause', value: false });
  }

  function openTalents(): void {
    if (!playing || !view.player.alive || view.paused || inventoryOpen || characterOpen
      || controlsOpen || mapOpen || dialogueOpen || tradeNpc !== null || townModal !== null) return;
    talentsOpen = true;
    bridge.command({ type: 'pause', value: true });
  }
  function closeTalents(): void {
    talentsOpen = false;
    bridge.command({ type: 'pause', value: false });
  }

  function interact(npcId: NpcId): void {
    if (inventoryOpen || characterOpen || dialogueOpen || townModal !== null || tradeNpc !== null || view.paused) return;
    bridge.command({ type: 'interactNpc', npcId });
  }
  function talkToWarden(): void { interact(WARDEN_ID); }
  function acceptQuest(questId?: string): void {
    bridge.command({ type: 'questAccept', ...(questId ? { questId } : {}) });
  }
  function turnInQuest(questId?: string): void {
    bridge.command({ type: 'questTurnIn', ...(questId ? { questId } : {}) });
  }
  function closeDialogue(): void {
    dialogueOpen = false;
    tradeNpc = null;
    townModal = null;
    bridge.command({ type: 'pause', value: false });
  }
  function handleKeydown(event: KeyboardEvent): void {
    if (!playing || controlsOpen) return;
    if (talentsOpen) {
      if (event.code === 'Escape') {
        event.preventDefault();
        closeTalents();
      }
      return;
    }
    const target = event.target;
    const isTyping = target instanceof HTMLElement
      && !!target.closest('input, textarea, select, [contenteditable="true"]');
    if (mapOpen) {
      if (event.code === 'Escape' || (!isTyping && event.code === 'KeyM')) {
        event.preventDefault();
        closeMap();
      }
      return;
    }
    if (!isTyping && event.code === 'KeyM' && !event.repeat) {
      event.preventDefault();
      openMap();
      return;
    }
    const action = resolveKeyboardAction({
      code: event.code, repeat: event.repeat, isTyping, uiCaptured: false
    }, bridge.bindings());
    if (!action) return;

    if (action === 'MENU') {
      event.preventDefault();
      if (talentsOpen) closeTalents();
      else if (dialogueOpen || tradeNpc !== null) closeDialogue();
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
    if (dialogueOpen || tradeNpc !== null || inventoryOpen || characterOpen || talentsOpen
      || view.paused || !view.player.alive) return;

    if (action === 'POTION') {
      event.preventDefault();
      bridge.command({ type: 'usePotion' });
    } else if (action === 'HOLD_POSITION') {
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
    } else if (view.classId === 'PALADIN'
      && ['SLOT_2','SLOT_3','SLOT_4','SLOT_5','SLOT_6'].includes(action)) {
      event.preventDefault();
      const slotIndex=Number(action.slice(-1))-2;
      const id=PALADIN_EXTRA_IDS[slotIndex];
      if(id)bridge.command({type:'paladinAbility',id,targetId:view.selectedTargetId??view.enemy.id});
    } else if (view.classId === 'MAGE'
      && ['SLOT_2','SLOT_3','SLOT_4','SLOT_5','SLOT_6'].includes(action)) {
      event.preventDefault();
      const index = Number(action.slice(-1)) - 2;
      const id = MAGE_EXTRA_IDS[index];
      if (id) {
        const position = bridge.pointerPosition();
        bridge.command({ type: 'mageAbility', id,
          targetId: view.selectedTargetId ?? view.enemy.id,
          ...(position ? { position } : {}) });
      }
    } else if (view.classId === 'NECROMANCER'
      && ['SLOT_2','SLOT_3','SLOT_4','SLOT_5','SLOT_6'].includes(action)) {
      event.preventDefault();
      const id=NECRO_EXTRA_IDS[Number(action.slice(-1))-2];
      if(id){
        const position=bridge.pointerPosition();
        bridge.command({type:'necroAbility',id,
          targetId:view.selectedTargetId??view.enemy.id,
          ...(position?{position}:{})});
      }
    } else if(view.classId==='ROGUE'
      &&['SLOT_2','SLOT_3','SLOT_4','SLOT_5','SLOT_6'].includes(action)){
      event.preventDefault();
      const id=ROGUE_EXTRA_IDS[Number(action.slice(-1))-2];
      if(id){
        const position=bridge.pointerPosition();
        bridge.command({type:'rogueAbility',id,
          targetId:view.selectedTargetId??view.enemy.id,
          ...(position?{position}:{})});
      }
    } else if (action === 'FORCE_MOVE' || action === 'PRIMARY') {
      const position = bridge.pointerPosition();
      if (!position) return;
      event.preventDefault();
      bridge.command({ type: 'move', destination: position });
    }
    // Remaining classes retain reserved slots until their original kits are complete.
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
      const world = bridge.worldProgress();
      await Promise.all([
        autosaver.saveNow(bridge.character()),
        ...(world ? [worldAutosaver.saveNow(world)] : [])
      ]);
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
      await Promise.all([autosaver.flush(), worldAutosaver.flush()]);
      const [character, world] = await Promise.all([loadGame(), loadWorldProgress()]);
      if (character && bridge.restoreCharacter(character, world?.seed)) {
        if (world) bridge.restoreWorldProgress(world);
        messageKey = 'status.loaded';
        inventoryOpen = false;
        characterOpen = false;
        talentsOpen = false;
        controlsOpen = false;
        mapOpen = false;
        dialogueOpen = false;
        tradeNpc = null;
        townModal = null;
        selectedClass = bridge.snapshot().classId;
        autosaver.prime(bridge.character());
        const currentWorld = bridge.worldProgress();
        if (currentWorld) worldAutosaver.prime(currentWorld);
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
          <button class="small-button" disabled={view.zone !== 'wilderness' || view.paused}
            onclick={openMap}>{$t('map.open')}</button>
          <button class="small-button" disabled={!view.player.alive} onclick={togglePause}>{view.paused ? $t('menu.resume') : $t('menu.paused')}</button>
          <button class="small-button" onclick={menu}>{$t('menu.back')}</button>
        </div>
      </header>

      <div class="hud-left-column" aria-label="Game information">
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
          <button disabled={!view.player.alive || view.paused}
            onclick={() => bridge.command({ type: 'interactTown', entryId: 'potion_vendor_lena' })}>
            {$t('potions.visitVendor')}
          </button>
          <button disabled={!view.player.alive || view.paused}
            onclick={() => bridge.command({ type: 'interactTown', entryId: 'stash_camp' })}>
            {$t('town.stashAccess')}
          </button>
          <button disabled={!view.player.alive || view.paused}
            onclick={() => bridge.command({ type: 'interactTown', entryId: 'waypoint_camp' })}>
            {$t('waypoints.open')}
          </button>
        </div>
      {/if}
        <EnvironmentPanel {view} />
      </div>
      <div class="hud-right-column" aria-label="Map and combat status">
      {#if view.enemies.some(unit => unit.intent !== null) && !inventoryOpen}
        <div class="danger-alert" role="status">
          <strong>{$t('combat.warning')}</strong>
          <span>{$t('combat.dodge')}</span>
        </div>
      {/if}
      {#if miniProjection}
        <div class="minimap-overlay" data-minimap="active">
          <WorldMapCanvas projection={miniProjection} compact />
          <button onclick={openMap} disabled={view.paused} aria-label={$t('map.open')}>
            {$t('map.open')} · M
          </button>
        </div>
      {/if}
        <WorldEventPanel {view} />
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
            <span>{unit.elite ? $t('hud.elite') + ' · ' : ''}{$t(unit.actor.id === 'crypt_lord-4' && view.zone === 'crypt'
              ? 'boss.hollowKing.name' : view.miniBossStates?.[unit.actor.id]
              ? 'miniBossNames.' + unit.actor.id
              : unit.actor.id === 'morrow_gravebound'
                ? 'enemies.morrow_gravebound.name' : 'enemies.' + unit.actor.type + '.name')}
              {#if view.miniBossStates?.[unit.actor.id]}
                <small class="elite-modifiers">{$t('miniBoss.phase')} {view.miniBossStates?.[unit.actor.id]?.phase ?? 1}</small>
              {/if}
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
      </div>
      <div class="game-hud" data-testid="combat-dock">
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
        <SkillBar {bridge} {view} />
        <div class="hud-actions">
          <button onclick={openInventory} aria-label={$t('inventory.open')} title={$t('inventory.open')}
            data-quick-action="inventory"><span aria-hidden="true">▦</span><span class="quick-key">I</span></button>
          <button onclick={openCharacterSheet} aria-label={$t('character.open')} title={$t('character.open')}
            data-quick-action="character"><span aria-hidden="true">♙</span><span class="quick-key">C</span></button>
          <button onclick={openTalents} disabled={!view.player.alive || view.paused}
            aria-label={$t('talents.open') + (view.talentPoints ? ' (' + view.talentPoints + ')' : '')}
            title={$t('talents.open')}
            data-quick-action="talents"><span aria-hidden="true">✧</span><span class="quick-key">T</span>
            {#if (view.talentPoints ?? 0) > 0}<span class="quick-notice">{view.talentPoints}</span>{/if}</button>
          <button disabled={busy} onclick={save} aria-label={$t('menu.save')} title={$t('menu.save')}
            data-quick-action="save"><span aria-hidden="true">▣</span><span class="quick-key">S</span></button>
          <button disabled={busy} onclick={load} aria-label={$t('menu.load')} title={$t('menu.load')}
            data-quick-action="load"><span aria-hidden="true">↺</span><span class="quick-key">L</span></button>
        </div>
      </div>

      {#if messageKey}
        <div class="toast" role="status">{$t(messageKey)}</div>
      {/if}
      {#if mapOpen && fullProjection}
        <div class="modal-shield map-shield" role="dialog" aria-modal="true" aria-label={$t('map.title')}
          data-testid="world-map-dialog">
          <section class="pause-card world-map-card">
            <header class="world-map-header">
              <h2>{$t('map.title')}</h2>
              <button class="map-close-button" data-testid="map-close"
                aria-label={$t('map.close')} title={$t('map.close')}
                onclick={closeMap}><span aria-hidden="true">✕</span><span>{$t('map.close')}</span></button>
            </header>
            <p class="world-map-legend">{$t('map.legend')}</p>
            <div class="world-map-content">
              <WorldMapCanvas projection={fullProjection} />
            </div>
            <div class="world-map-footer">
              <WaypointPanel {view} {bridge} />
            </div>
          </section>
        </div>
      {:else if townModal}
        <div class="modal-shield town-service-shield" role="dialog" aria-modal="true" aria-label={$t(townModal.nameKey)}>
          <section class="pause-card town-service-card">
            <h2>{$t(townModal.nameKey)}</h2>
            <p>{$t(townModal.descriptionKey)}</p>
            {#if townModal.role === 'stash'}
              <StashPanel {view} {bridge} />
            {:else if townModal.role === 'waypoint'}
              <WaypointPanel {view} {bridge} />
            {:else if townModal.role === 'healer'}
              <button class="primary" disabled={view.gold < 15 || view.player.health >= view.player.maxHealth}
                onclick={() => bridge.command({ type: 'useTownService', entryId: townModal!.id })}>
                {$t('town.restoreHealth')} · 15 {$t('hud.gold')}
              </button>
            {:else if townModal.role === 'potionVendor'}
              <button class="primary" disabled={view.gold < 12 || view.resource >= view.stats.maxResource}
                onclick={() => bridge.command({ type: 'useTownService', entryId: townModal!.id })}>
                {$t('town.restoreResource')} · 12 {$t('hud.gold')}
              </button>
              <div class="potion-shop" aria-label={$t('potions.refillTitle')}>
                <h3>{$t('potions.refillTitle')}</h3>
                {#each POTION_IDS as potionId}
                  <div class="potion-shop-row" data-potion-refill={potionId}>
                    <span>{$t('potions.' + potionId + '.name')}: {view.potions?.charges[potionId] ?? 0}/{POTIONS[potionId].maxCharges}</span>
                    <button disabled={!view.player.alive || view.gold < POTIONS[potionId].refillGold
                      || (view.potions?.charges[potionId] ?? 0) >= POTIONS[potionId].maxCharges}
                      onclick={() => bridge.command({ type: 'refillPotion', entryId: townModal!.id, potionId })}>
                      {$t('potions.refill')} · {POTIONS[potionId].refillGold} {$t('hud.gold')}
                    </button>
                  </div>
                {/each}
              </div>
            {:else if townModal.capability === 'planned'}
              <p>{$t('town.futureService')}</p>
            {/if}
            <button class="secondary" onclick={closeDialogue}>{$t('npc.leave')}</button>
          </section>
        </div>
      {:else if tradeNpc}
        <TradePanel {view} {bridge} npc={tradeNpc} close={closeDialogue} />
      {:else if controlsOpen}
        <div class="modal-shield">
          <ControlsPanel bindings={controlBindings} save={updateBindings}
            close={() => { controlsOpen = false; }} />
        </div>
      {:else if dialogueOpen}
        <NpcDialogue quest={view.quest} questLedger={view.questLedger} accept={acceptQuest} turnIn={turnInQuest} close={closeDialogue} />
      {:else if inventoryOpen}
        <InventoryPanel {view} {bridge} close={closeInventory} />
      {:else if characterOpen}
        <CharacterSheet {view} close={closeCharacterSheet} />
      {:else if talentsOpen}
        <TalentTree {view} {bridge} close={closeTalents} />
      {:else if !view.player.alive}
        <div class="modal-shield" data-testid="death-overlay">
          <div class="pause-card" role="dialog" aria-modal="true" aria-label={$t('respawn.title')}>
            <h2>{$t('respawn.title')}</h2>
            <p>{$t('respawn.description')}</p>
            <p class="respawn-destination">
              {$t('respawn.destination')}:
              {$t(view.respawnAt?.id === 'shrine.soul-shrine'
                ? 'respawn.soulShrine' : 'respawn.townWaypoint')}
            </p>
            <button class="primary" data-testid="respawn-button"
              onclick={respawn}>{$t('respawn.action')}</button>
          </div>
        </div>
      {:else if view.paused}
        <div class="modal-shield">
          <section class="pause-card" aria-label={$t('menu.paused')}>
            <h2>{$t('menu.paused')}</h2>
            <button class="primary" onclick={togglePause}>{$t('menu.resume')}</button>
            <button class="secondary" onclick={openControls}>{$t('bindings.open')}</button>
            <button class="secondary" onclick={menu}>{$t('menu.back')}</button>
          </section>
        </div>
      {/if}
    </main>
  {/if}
</div>

<style>

  /* Independent, scroll-safe HUD columns: no magic top:335px/508px offsets. */
  .hud-left-column,.hud-right-column {
    position:absolute;z-index:3;top:85px;bottom:clamp(145px,19vh,190px);
    display:flex;flex-direction:column;align-items:stretch;gap:10px;
    overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;
    scrollbar-color:#6c5f49 #111920;
    pointer-events:none;
  }
  .hud-left-column{left:16px;width:clamp(190px,18vw,260px)}
  .hud-right-column{right:16px;width:clamp(180px,18vw,235px)}
  .hud-left-column > :global(*),.hud-right-column > :global(*){pointer-events:auto}
  .hud-left-column :global(.world-guide),
  .hud-left-column :global(.quest-journal),
  .hud-left-column :global(.camp-services),
  .hud-left-column :global(.environment-panel),
  .hud-right-column :global(.enemy-roster),
  .hud-right-column :global(.event-panel),
  .hud-right-column :global(.dungeon-panel){
    position:relative;top:auto;right:auto;left:auto;bottom:auto;
    width:100%;max-width:none;max-height:none;flex-shrink:0;margin:0;
  }
  .hud-left-column :global(.world-guide){padding:9px 12px;line-height:1.5}
  .hud-left-column :global(.quest-journal){padding:10px}
  .hud-left-column :global(.camp-services){padding:9px}
  .hud-right-column .minimap-overlay{
    position:relative;top:auto;right:auto;left:auto;width:100%;
    min-width:0;flex-shrink:0;margin:0;
  }
  .hud-right-column :global(.danger-alert) {
    position:relative;top:auto;right:auto;left:auto;width:100%;
    flex-shrink:0;box-shadow:0 4px 12px #0006;padding:8px;
    transform:none;pointer-events:none;
  }
  .game-screen :global(.toast) {
    left:50%;right:auto;transform:translateX(-50%);max-width:min(390px,54vw);
    text-align:center;
  }
  .hud-right-column :global(.enemy-roster){box-shadow:none;max-height:210px;overflow:auto}
  .hud-right-column :global(.event-panel){max-height:150px;overflow:auto}
  .hud-right-column :global(.dungeon-panel){max-height:180px;overflow:auto}
  /* Side HUD is always above the single compact combat dock. */
  @media(max-width:850px){
    .hud-left-column,.hud-right-column{top:72px;bottom:clamp(130px,22vh,185px);gap:6px}
    .hud-left-column{left:7px;width:clamp(132px,22vw,180px)}
    .hud-right-column{right:7px;width:clamp(132px,22vw,180px)}
    .hud-left-column :global(.world-guide){display:none}
    .hud-left-column :global(.camp-services){gap:3px}
    .hud-left-column :global(.camp-services button){font-size:.64rem;padding:5px 4px}
  }
  @media(max-width:560px){
    .hud-left-column,.hud-right-column{top:64px;bottom:clamp(125px,23vh,180px);gap:5px}
    .hud-left-column{width:clamp(120px,30vw,148px);left:4px}
    .hud-right-column{width:clamp(120px,30vw,148px);right:4px}
    .hud-right-column :global(.enemy-roster){max-height:110px}
    .hud-left-column :global(.quest-journal){padding:6px}
  }
  .respawn-destination { color: #d9bc86; margin: 12px 0; }
  .minimap-overlay {
    position: absolute;
    z-index: 2;
    right: 20px;
    top: 88px;
    width: min(18vw, 230px);
    min-width: 155px;
    padding: 6px;
    background: #0a1019e8;
    border: 1px solid #7d7056;
    box-shadow: 0 10px 28px #0008;
  }
  .minimap-overlay button {
    display: block;
    width: 100%;
    font-size: .75rem;
    padding: 6px 8px;
    margin-top: 5px;
  }
  .map-shield { z-index: 90; inset: 0; display: grid; place-items: center;
    background: #03070cf2; padding: clamp(6px, 2vw, 22px); overflow: hidden; }
  .world-map-card {
    width: min(100%, 1060px);
    height: min(100%, 800px);
    max-width: none;
    max-height: 100%;
    min-width: 0;
    min-height: 0;
    padding: clamp(9px, 1.6vw, 18px);
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    gap: clamp(6px, 1vh, 11px);
    overflow: hidden;
    text-align: left;
  }
  .world-map-header { display: flex; justify-content: space-between; align-items: center;
    gap: 15px; min-width: 0; }
  .world-map-header h2 { margin: 0; font-size: clamp(1rem, 2.2vw, 1.45rem); }
  .world-map-header .map-close-button { display: flex; align-items: center; gap: 8px;
    border: 1px solid #b39563; background: #292b30; padding: 7px 11px;
    min-height: 40px; flex: 0 0 auto; font-size: .8rem; position: relative; z-index: 2; }
  .world-map-legend { margin: 0; color: #c5b698; font-size: .75rem;
    line-height: 1.4; max-height: 3.2em; overflow: hidden; }
  .world-map-content { min-width: 0; min-height: 0; display: grid; overflow: hidden; }
  .world-map-content :global(.map-canvas) { width: 100%; height: 100%; min-height: 0; }
  .world-map-footer { max-height: min(180px, 23vh); min-height: 0; overflow-y: auto; }
  .world-map-footer :global(.travel-panel) { margin: 0; max-height: none; }
  @media (max-width: 700px) {
    .minimap-overlay { width: 145px; min-width: 0; right: 8px; top: 110px; }
    .world-map-card { width: 100%; height: 100%; }
    .world-map-legend { font-size: .66rem; }
    .world-map-footer { max-height: min(138px, 22vh); }
    .world-map-header .map-close-button { padding: 5px 9px; }
  }
  .potion-shop{margin:12px 0;border-top:1px solid #6b5541;padding:10px 0}
  .potion-shop h3{font-size:.9rem;margin:5px 0 10px}
  .potion-shop-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;padding:5px 0;border-bottom:1px solid #413b35}
  .potion-shop-row button{padding:6px 10px}
</style>
