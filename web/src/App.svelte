<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { _ as t, locale } from 'svelte-i18n';
  import { languageOptions, setLanguage, type Language } from './i18n';
  import { GameBridge } from './game/bridge/GameBridge';
  import { baseOf, tierOf, type GemId } from './game/gems/gemCatalog';
  import type { CharacterProgress, GameSnapshot, Point } from './game/core/types';
  import {isOptionalDungeonBoss} from './game/enemies/optionalDungeonEncounters';
  import { resolveKeyboardAction, applyBindingOverrides, type InputBinding, type InputAction } from './game/input/bindings';
  import { GAME_BINDINGS } from './game/input/gameBindings';
  import { HeldPositionSources } from './game/input/heldPositionSources';
  import { resolvePointerAction } from './game/input/bindings';
  import { planPointerUiAction, type PointerUiState, type PointerUiSurface,
    type PointerUiOperation } from './game/input/pointerUiActions';
  import { dispatchCombatAction } from './game/input/combatActionDispatcher';
  import { prioritizeCombatRoster } from './game/ui/combatRoster';
  import { loadGame, saveGame, listCharacters, deleteCharacter, MAX_SAVED_CHARACTERS, type SavedCharacterInfo } from './persistence/SaveRepository';
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
  import VisualSettingsPanel from './ui/VisualSettingsPanel.svelte';
  import { getVisualPreferences, setVisualPreferences,
    DEFAULT_VISUAL_PREFERENCES, type VisualPreferences } from './game/ui/visualPreferences';
  import { isFullscreenAvailable, toggleBrowserFullscreen } from './game/ui/displayModes';
  import { getAudioPreferences, setAudioPreferences,
    DEFAULT_AUDIO_PREFERENCES, type AudioPreferences } from './game/audio/audioPreferences';
  import { WebAudioDirector } from './game/audio/WebAudioDirector';
  import SkillBar from './ui/SkillBar.svelte';
  import { shortcutHint } from './game/ui/shortcutHints';
  import OnboardingGuide from './ui/OnboardingGuide.svelte';
  import {
    freshOnboarding, onboardingStorageKey, parseOnboarding,
    getOnboardingStep, nextOnboardingTip, skipOnboarding, resumeOnboarding,
    observeOnboardingEvent, observeOnboardingSnapshot, onboardingContextFromSnapshot,
    type OnboardingProgress
  } from './game/ui/onboardingGuide';
  import QuestJournal from './ui/QuestJournal.svelte';
  import NearbyLootPanel from './ui/NearbyLootPanel.svelte';
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
  import { buildWilderness } from './game/world/wildernessRuntime';
  import { villageTownEntries, resolveRegionalTownEntry } from './game/world/villageDialogue';
  import { VILLAGE_QUESTS } from './game/quests/villageQuests';
  import { CLASSES, type ClassId } from './game/data/classes';
  import { createCharacterId } from './game/creation/characterCreation';
  import { normalizeCharacterName, MAX_CHARACTER_NAME_LENGTH } from './game/creation/characterName';
  import { POTION_IDS, POTIONS } from './game/consumables/potionRules';
  import { xpRequiredForLevel } from './game/progression/progressionRules';

  const bridge = new GameBridge();
  // No browser AudioContext is created until an explicit trusted user gesture.
  const audio = new WebAudioDirector();
  let playing = $state(false);
  let view: GameSnapshot = $state(bridge.snapshot());
  let liveOnboardingContext = $derived(onboardingContextFromSnapshot(view));
  let onboardingProgress: OnboardingProgress = $state(freshOnboarding());
  let onboardingCharacterId: string | null = null;
  let onboardingOrigin: Point | null = null;
  let onboardingStarterEquipmentIds: string[] = [];

  function storeOnboarding(next: OnboardingProgress): void {
    if (next === onboardingProgress) return;
    onboardingProgress = next;
    const key = onboardingStorageKey(onboardingCharacterId ?? '');
    if (!key) return;
    try { window.localStorage.setItem(key, JSON.stringify(next)); }
    catch { /* Private browsing may disallow local storage. */ }
  }

  function activateOnboardingForHero(): void {
    const id = bridge.character().characterId ?? 'hero';
    if (onboardingCharacterId === id) return;
    onboardingCharacterId = id;
    const snapshot = bridge.snapshot();
    onboardingOrigin = { x: snapshot.player.x, y: snapshot.player.y };
    onboardingStarterEquipmentIds = Object.values(snapshot.equipment)
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .map(item => item.id);
    const key = onboardingStorageKey(id);
    let progress = freshOnboarding();
    if (key) {
      try { progress = parseOnboarding(window.localStorage.getItem(key)); }
      catch { /* No local storage is not a game error. */ }
    }
    onboardingProgress = progress;
    storeOnboarding(observeOnboardingSnapshot(
      progress, snapshot, onboardingOrigin, onboardingStarterEquipmentIds
    ));
  }

  function advanceOnboarding(): void {
    storeOnboarding(nextOnboardingTip(onboardingProgress, liveOnboardingContext));
  }
  function skipGuide(): void { storeOnboarding(skipOnboarding(onboardingProgress)); }
  function showGuide(): void { storeOnboarding(resumeOnboarding(onboardingProgress)); }
  function resetGuide(): void {
    onboardingOrigin = { x: view.player.x, y: view.player.y };
    onboardingStarterEquipmentIds = Object.values(view.equipment)
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .map(item => item.id);
    storeOnboarding(freshOnboarding());
  }
  // Read-only display projection; never reorder GameSimulation's enemy array.
  let rosterUnits = $derived(prioritizeCombatRoster(
    view.enemies, view.miniBossStates, view.selectedTargetId
  ));
  let messageKey = $state('');
  let droppedGem = $state<GemId | null>(null);
  let busy = $state(false);
  let selectedClass: ClassId = $state('WARRIOR');
  let savedCharacters: SavedCharacterInfo[] = $state([]);
  let selectedCharacterId: string | null = $state(null);
  let pendingDeleteId: string | null = $state(null);
  let activeSessionId = $state<string | null>(null);
  let activeCharacterName = $state<string | undefined>(undefined);
  let menuReady = $state(false);
  let creatingCharacter = $state(false);
  let newCharacterName = $state('');
  let selectedCharacter = $derived(savedCharacters.find(entry => entry.characterId === selectedCharacterId));
  let validCharacterName = $derived(normalizeCharacterName(newCharacterName));
  let restoring = false;

  function characterForSave(): CharacterProgress {
    return { ...bridge.character(), ...(activeCharacterName ? { characterName: activeCharacterName } : {}) };
  }
  async function openCreation(): Promise<void> {
    if (busy || !menuReady || savedCharacters.length >= MAX_SAVED_CHARACTERS) return;
    selectedClass = 'WARRIOR';
    newCharacterName = '';
    pendingDeleteId = null;
    messageKey = '';
    creatingCharacter = true;
    await tick();
    document.getElementById('character-name')?.focus();
  }
  async function cancelCreation(): Promise<void> {
    if (busy) return;
    creatingCharacter = false;
    newCharacterName = '';
    await tick();
    document.querySelector<HTMLElement>('[data-testid="new-character"]')?.focus();
  }

  async function refreshCharacters(): Promise<void> {
    const entries = await listCharacters();
    savedCharacters = entries;
    if (!selectedCharacterId || !entries.some(entry => entry.characterId === selectedCharacterId)) {
      selectedCharacterId = entries[0]?.characterId ?? null;
    }
  }

  async function removeSavedCharacter(id: string): Promise<void> {
    if (busy || pendingDeleteId !== id) return;
    busy = true;
    try {
      await Promise.all([autosaver.flush(), worldAutosaver.flush()]);
      await deleteCharacter(id);
      if (activeSessionId === id) { activeSessionId = null; activeCharacterName = undefined; }
      pendingDeleteId = null;
      await refreshCharacters();
      messageKey = 'saveSlots.deleted';
    } catch {
      messageKey = 'status.saveError';
    } finally {
      busy = false;
    }
  }
  let inventoryOpen = $state(false);
  let characterOpen = $state(false);
  let talentsOpen = $state(false);
  let controlsOpen = $state(false);
  let settingsOpen = $state(false);
  let visualPreferences: VisualPreferences = $state({ ...DEFAULT_VISUAL_PREFERENCES });
  let appRoot: HTMLDivElement;
  let fullscreenSupported = $state(false);
  let fullscreenActive = $state(false);
  let fullscreenError = $state(false);
  let audioPreferences: AudioPreferences = $state({ ...DEFAULT_AUDIO_PREFERENCES });
  let mapOpen = $state(false);
  let mapZoom = $state(1);
  let mapCenter: Point | null = $state(null);
  let miniProjection = $derived(view.zone === 'wilderness' ? bridge.mapProjection('minimap') : null);
  let fullProjection = $derived(mapOpen && view.zone === 'wilderness'
    ? bridge.mapProjection('world', {
      zoom: mapZoom, ...(mapCenter ? { center: mapCenter } : {})
    }) : null);
  let controlBindings: InputBinding[] = $state(GAME_BINDINGS.map(binding => ({ ...binding })));
  const controlsStorage = 'aether-ruin-controls-v1';

  function updateBindings(next: InputBinding[]): void {
    heldPosition.clear();
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

  function applyVisualRoot(prefs: VisualPreferences): void {
    if (typeof document === 'undefined') return;
    // Scale readable rem-based UI without resizing the Phaser playfield.
    document.documentElement.style.fontSize = (16 * prefs.uiScale).toFixed(1) + 'px';
    document.documentElement.dataset.arHighContrast = prefs.highContrast ? 'true' : 'false';
  }

  function updateVisualPreferences(next: VisualPreferences): void {
    visualPreferences = setVisualPreferences(next);
    applyVisualRoot(visualPreferences);
  }

  function updateAudioPreferences(next: AudioPreferences): void {
    audioPreferences = setAudioPreferences(next);
    audio.setPreferences(audioPreferences);
    audio.play('ui.select');
  }

  $effect(() => {
    // Paused combat / ambient buses must never leak through a Svelte dialog;
    // menu UI volume previews remain available after audio is unlocked.
    audio.setPaused(!playing || view.paused);
  });

  function syncFullscreenState(): void {
    fullscreenActive = typeof document !== 'undefined'
      && document.fullscreenElement === appRoot;
  }

  async function toggleFullscreen(): Promise<void> {
    fullscreenError = false;
    const success = await toggleBrowserFullscreen(document, appRoot);
    if (!success) fullscreenError = true;
    syncFullscreenState();
  }

  function openVisualSettings(origin?: HTMLElement): void {
    if (!playing || !view.paused || settingsOpen || controlsOpen
      || inventoryOpen || characterOpen || talentsOpen || mapOpen
      || dialogueOpen || tradeNpc !== null || townModal !== null) return;
    rememberModalOrigin(origin);
    fullscreenError = false;
    settingsOpen = true;
  }

  function openControls(origin?: HTMLElement): void {
    if (!playing || dialogueOpen || tradeNpc !== null || townModal !== null
      || inventoryOpen || characterOpen || talentsOpen || settingsOpen) return;
    rememberModalOrigin(origin);
    bridge.command({ type: 'pause', value: true });
    controlsOpen = true;
  }
  let dialogueOpen = $state(false);
  let tradeNpc: TradeNpcId | null = $state(null);
  let townModal: TownEntry | null = $state(null);
  const heldPosition = new HeldPositionSources(held => {
    bridge.command({ type: 'holdPosition', value: held });
  });
  const autosaver = new CharacterAutosaver(saveGame, 1400, () => {
    messageKey = 'status.saveError';
  });
  type BoundWorldProgress = { characterId:string; progress:WorldSessionProgress };
  const worldAutosaver = new CharacterAutosaver<BoundWorldProgress>(
    record => saveWorldProgress(record.progress,record.characterId),
    1700, () => { messageKey = 'status.saveError'; }
  );
  function boundWorldProgress():BoundWorldProgress|null {
    const progress=bridge.worldProgress();
    return progress ? {characterId:bridge.character().characterId??'hero',progress}:null;
  }

  /** A single active dialog owns keyboard focus. Underlying gameplay is inert. */
  let focusOrigin: HTMLElement | null = null;
  function rememberModalOrigin(element?: HTMLElement): void {
    focusOrigin = element ?? (document.activeElement instanceof HTMLElement
      ? document.activeElement : null);
  }
  let modalKind = $derived(!playing ? '' :
    mapOpen ? 'map' : townModal !== null ? 'town' : tradeNpc !== null ? 'trade'
    : settingsOpen ? 'settings' : controlsOpen ? 'controls' : dialogueOpen ? 'dialogue' : inventoryOpen ? 'inventory'
    : characterOpen ? 'character' : talentsOpen ? 'talents'
    : !view.player.alive ? 'death' : view.paused ? 'pause' : '');

  $effect(() => {
    const kind = modalKind;
    if (!kind) return;
    const dialog = document.querySelector<HTMLElement>('.game-screen [role="dialog"][aria-modal="true"]');
    if (!dialog) return;
    const origin = focusOrigin ?? (document.activeElement instanceof HTMLElement
      ? document.activeElement : null);
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), ' +
      'textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )).filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'));
    const preferred = dialog.querySelector<HTMLElement>(
      '[data-testid="map-close"], .close-button, .trade-close, ' +
      'button[aria-label="Close"], button[aria-label="Zavřít"], .controls-footer .primary'
    );
    queueMicrotask(() => {
      if (!dialog.isConnected) return;
      if (preferred && preferred.getClientRects().length) preferred.focus();
      else focusable()[0]?.focus();
    });
    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); dialog.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first
        || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last
        || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    dialog.addEventListener('keydown', trapTab);
    return () => {
      dialog.removeEventListener('keydown', trapTab);
      queueMicrotask(() => {
        if (!document.querySelector('.game-screen [aria-modal="true"]') && origin?.isConnected) {
          origin.focus();
          focusOrigin = null;
        }
      });
    };
  });

  function openMap(origin?: HTMLElement): void {
    if (!playing || mapOpen || view.zone !== 'wilderness' || !view.player.alive
      || view.paused || inventoryOpen || characterOpen || talentsOpen || controlsOpen || dialogueOpen
      || tradeNpc !== null || townModal !== null) return;
    rememberModalOrigin(origin);
    mapZoom = 1;
    mapCenter = null;
    bridge.command({ type: 'pause', value: true });
    mapOpen = true;
  }
  function closeMap(): void {
    mapOpen = false;
    bridge.command({ type: 'pause', value: false });
  }

  /** Camera presentation only: dragging cannot move the hero or discover fog. */
  function zoomMap(multiplier: number): void {
    if (!mapOpen || !Number.isFinite(multiplier) || multiplier <= 0) return;
    mapZoom = Number(Math.max(1, Math.min(4, mapZoom * multiplier)).toFixed(2));
  }
  function panMap(dx: number, dy: number): void {
    if (!mapOpen || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const viewport = fullProjection?.viewport;
    if (!viewport) return;
    const center = mapCenter ?? {
      x: viewport.x + viewport.width / 2,
      y: viewport.y + viewport.height / 2
    };
    mapCenter = {
      x: Math.max(viewport.width / 2, Math.min(2200 - viewport.width / 2, center.x + dx)),
      y: Math.max(viewport.height / 2, Math.min(1400 - viewport.height / 2, center.y + dy))
    };
  }
  function centerMapOnPlayer(): void {
    if (!mapOpen) return;
    mapZoom = Math.max(2, mapZoom);
    mapCenter = { x: view.player.x, y: view.player.y };
  }
  function resetMapView(): void {
    mapZoom = 1;
    mapCenter = null;
  }

  onMount(() => {
    fullscreenSupported = isFullscreenAvailable(document, appRoot)
      && document.fullscreenEnabled !== false;
    document.addEventListener('fullscreenchange', syncFullscreenState);
    syncFullscreenState();
    visualPreferences = getVisualPreferences();
    applyVisualRoot(visualPreferences);
    audioPreferences = getAudioPreferences();
    audio.setPreferences(audioPreferences);
    audio.setHidden(document.visibilityState === 'hidden');
    // Browsers require gesture-unlocked WebAudio. Never unlock on startup,
    // automatic game ticks, timers or a synthetic DOM event.
    const unlockAudio = (event: KeyboardEvent | PointerEvent) => {
      if (event.isTrusted) audio.unlock();
    };
    window.addEventListener('pointerdown', unlockAudio, true);
    window.addEventListener('keydown', unlockAudio, true);
    void refreshCharacters().then(() => { menuReady = true; }).catch(() => { messageKey = 'status.saveError'; });
    try {
      const raw = JSON.parse(window.localStorage.getItem(controlsStorage) ?? '[]');
      if (Array.isArray(raw) && raw.length <= 25) {
        // Restore the whole v1 override set atomically: a legal LMB/RMB swap
        // cannot be replayed one action at a time without a false collision.
        const result = applyBindingOverrides(GAME_BINDINGS, raw as InputBinding[]);
        if (!result.ok) throw new Error('Invalid control mapping');
        controlBindings = result.bindings;
        bridge.setBindings(controlBindings);
      }
    } catch { /* Invalid settings fall back to defaults. */ }
    const unsubscribeEvents = bridge.onEvent((event) => {
      audio.playGameEvent(event);
      if (playing && onboardingCharacterId === (bridge.character().characterId ?? 'hero')) {
        storeOnboarding(observeOnboardingEvent(onboardingProgress, event, view.player.id));
      }
      if (event.type === 'gemLoot' && playing) {
        droppedGem = event.gemId;
        messageKey = 'gems.combatLoot';
      }
      if (event.type === 'dungeonCleared' && playing) messageKey = bridge.snapshot().dungeonId ? 'dungeon.optionalClearedToast' : 'dungeon.clearedToast';
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
        rememberModalOrigin();
        townModal = townEntry(event.entryId) ?? resolveRegionalTownEntry(event.entryId,
          villageTownEntries(buildWilderness(bridge.snapshot().worldSeed).villages));
        if (!townModal) return;
        tradeNpc = null;
        dialogueOpen = false;
        inventoryOpen = false;
        bridge.command({ type: 'pause', value: true });
      }
      if (event.type === 'townServiceUsed' && playing) messageKey = 'town.serviceSuccess';
      if (event.type === 'tradeRejected' && playing) messageKey = 'trade.error.' + event.reason;
      if (event.type === 'npcDialogue' && playing) {
        rememberModalOrigin();
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
      if (playing && onboardingOrigin && onboardingCharacterId ===
        (bridge.character().characterId ?? 'hero')) {
        storeOnboarding(observeOnboardingSnapshot(
          onboardingProgress, latest, onboardingOrigin, onboardingStarterEquipmentIds
        ));
      }
      // Input release can synchronously emit a newer snapshot. Never overwrite
      // that release with the stale pre-release snapshot in this callback.
      if (latest.paused || !latest.player.alive) heldPosition.clear();
      audio.setZone(latest.zone);
      audio.setPaused(!playing || latest.paused);
      if (playing && !restoring) {
        autosaver.schedule(characterForSave());
        const world = boundWorldProgress();
        if (world) worldAutosaver.schedule(world);
      }
    });
    // Browser lifecycle hooks are best-effort; the regular autosave debounce
    // is what protects character progression during normal play.
    const flushOnExit = () => {
      heldPosition.clear();
      void autosaver.flush().catch(() => {});
      void worldAutosaver.flush().catch(() => {});
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') heldPosition.clear();
      audio.setHidden(document.visibilityState === 'hidden');
      if (document.visibilityState === 'hidden') flushOnExit();
    };
    window.addEventListener('pagehide', flushOnExit);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      heldPosition.clear();
      unsubscribe();
      unsubscribeEvents();
      window.removeEventListener('pointerdown', unlockAudio, true);
      window.removeEventListener('keydown', unlockAudio, true);
      audio.dispose();
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      window.removeEventListener('pagehide', flushOnExit);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void autosaver.dispose().catch(() => {});
      void worldAutosaver.dispose().catch(() => {});
    };
  });

  function respawn(): void {
    if (!playing || view.player.alive) return;
    heldPosition.clear();
    inventoryOpen = false;
    characterOpen = false;
    talentsOpen = false;
    controlsOpen = false; settingsOpen = false;
    mapOpen = false;
    dialogueOpen = false;
    tradeNpc = null;
    townModal = null;
    bridge.command({ type: 'respawn' });
  }

  async function newGame(): Promise<void> {
    const name = normalizeCharacterName(newCharacterName);
    if (busy || !menuReady || !creatingCharacter || !name
      || savedCharacters.length >= MAX_SAVED_CHARACTERS) return;
    heldPosition.clear();
    busy = true;
    try {
      await Promise.all([autosaver.flush(), worldAutosaver.flush()]);
      const id = createCharacterId(window.crypto.randomUUID());
      bridge.command({ type:'createCharacter', classId:selectedClass, characterId:id });
      activeSessionId = null;
      activeCharacterName = name;
      const world = boundWorldProgress();
      await Promise.all([
        autosaver.saveNow(characterForSave()),
        ...(world ? [worldAutosaver.saveNow(world)] : [])
      ]);
      selectedCharacterId = id;
      activeSessionId = id;
      messageKey = '';
      inventoryOpen = false; characterOpen = false; talentsOpen = false;
      controlsOpen = false; settingsOpen = false; mapOpen = false;
      dialogueOpen = false; tradeNpc = null; townModal = null;
      creatingCharacter = false;
      newCharacterName = '';
      playing = true;
      activateOnboardingForHero();
      await refreshCharacters();
    } catch {
      messageKey = 'status.saveError';
      // Character write may have succeeded even if world write failed.
      await refreshCharacters().catch(() => {});
    } finally {
      busy = false;
    }
  }
  async function continueSelected(): Promise<void> {
    if (busy || !menuReady || !selectedCharacterId) return;
    if (!selectedCharacter || selectedCharacter.characterId !== selectedCharacterId) return;
    heldPosition.clear();
    if (activeSessionId !== selectedCharacterId) {
      await load(selectedCharacterId);
      return;
    }
    // Only the matching live hero resumes its exact position and combat state.
    messageKey = '';
    bridge.command({ type:'pause', value:false });
    playing = true;
    activateOnboardingForHero();
  }
  async function menu(): Promise<void> {
    if (busy) return;
    busy = true;
    talentsOpen = false; controlsOpen = false; settingsOpen = false;
    mapOpen = false;
    heldPosition.clear();
    tradeNpc = null; townModal = null; dialogueOpen = false;
    inventoryOpen = false; characterOpen = false;
    bridge.command({ type:'pause', value:true });
    playing = false;
    creatingCharacter = false;
    pendingDeleteId = null;
    selectedCharacterId = activeSessionId;
    try {
      await Promise.all([autosaver.flush(), worldAutosaver.flush()]);
      await refreshCharacters();
    } catch { messageKey = 'status.saveError'; }
    finally { busy = false; }
  }
  function togglePause(origin?: HTMLElement): void {
    if (controlsOpen || mapOpen || talentsOpen) return;
    if (!inventoryOpen && !characterOpen && !dialogueOpen && townModal === null && tradeNpc === null) {
      if (!view.paused) rememberModalOrigin(origin);
      bridge.command({ type: 'pause', value: !view.paused });
    }
  }

  function openInventory(origin?: HTMLElement): void {
    if (dialogueOpen || tradeNpc !== null || townModal !== null || inventoryOpen || characterOpen || talentsOpen || view.paused || !view.player.alive) return;
    rememberModalOrigin(origin);
    inventoryOpen = true;
    bridge.command({ type: 'pause', value: true });
  }
  function closeInventory(): void {
    inventoryOpen = false;
    bridge.command({ type: 'pause', value: false });
  }
  function openCharacterSheet(origin?: HTMLElement): void {
    if (dialogueOpen || tradeNpc !== null || townModal !== null || inventoryOpen || characterOpen || talentsOpen ||
      view.paused || !view.player.alive) return;
    rememberModalOrigin(origin);
    characterOpen = true;
    bridge.command({ type: 'pause', value: true });
  }
  function closeCharacterSheet(): void {
    characterOpen = false;
    bridge.command({ type: 'pause', value: false });
  }

  function openTalents(origin?: HTMLElement): void {
    if (!playing || !view.player.alive || view.paused || inventoryOpen || characterOpen
      || controlsOpen || mapOpen || dialogueOpen || tradeNpc !== null || townModal !== null) return;
    rememberModalOrigin(origin);
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
  /** Only the Phaser canvas opens a mouse-mapped panel; only an empty
   * modal backdrop can close one. HUD buttons and dialog content stay native.
   * Touch and pen input must retain their original tapping/dragging behavior.
   */
  function pointerUiSurface(target: EventTarget | null): PointerUiSurface {
    if (target instanceof HTMLCanvasElement
      && target.closest('.phaser-container')) return 'canvas';
    if (target instanceof HTMLElement && target.matches(
      '.modal-shield, .inventory-overlay, .character-sheet-backdrop, ' +
      '.talent-backdrop, .npc-dialog-shield, .trade-overlay'
    )) return 'backdrop';
    return 'other';
  }

  function pointerUiState(): PointerUiState {
    if (!playing || settingsOpen || controlsOpen || !view.player.alive) return 'blocked';
    if (mapOpen) return 'map';
    if (talentsOpen) return 'talents';
    if (inventoryOpen) return 'inventory';
    if (characterOpen) return 'character';
    if (dialogueOpen || tradeNpc !== null || townModal !== null) return 'dialogue';
    return view.paused ? 'pause' : 'gameplay';
  }

  function pointerUiOperation(button: number, target: EventTarget | null): PointerUiOperation | null {
    const action = resolvePointerAction({ button, uiCaptured: false }, bridge.bindings());
    return planPointerUiAction(action, pointerUiState(), pointerUiSurface(target));
  }

  function handlePointerUiDown(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    handleHoldPointerDown(event);
    const operation = pointerUiOperation(event.button, event.target);
    if (!operation) return;
    event.preventDefault();
    switch (operation) {
      case 'openMap': openMap(); break;
      case 'closeMap': closeMap(); break;
      case 'openTalents': openTalents(); break;
      case 'closeTalents': closeTalents(); break;
      case 'openInventory': openInventory(); break;
      case 'closeInventory': closeInventory(); break;
      case 'openCharacter': openCharacterSheet(); break;
      case 'closeCharacter': closeCharacterSheet(); break;
      case 'togglePause': togglePause(); break;
      case 'closeDialogue': closeDialogue(); break;
    }
  }

  /** HOLD_POSITION is a real pressed state, not a click/toggle.
   * Window-level releases cover mouseup outside the game canvas.
   */
  function handleHoldPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || pointerUiState() !== 'gameplay'
      || pointerUiSurface(event.target) !== 'canvas') return;
    const action = resolvePointerAction({
      button: event.button, uiCaptured: false
    }, bridge.bindings());
    if (action !== 'HOLD_POSITION') return;
    event.preventDefault();
    heldPosition.pointerDown(event.pointerId, event.button);
  }
  function handleHoldPointerUp(event: PointerEvent): void {
    if (event.pointerType === 'mouse')
      heldPosition.pointerUp(event.pointerId, event.button);
  }
  function handleHoldPointerCancel(event: PointerEvent): void {
    if (event.pointerType === 'mouse') heldPosition.pointerCancel(event.pointerId);
  }
  function handleHoldPointerOut(event: PointerEvent): void {
    if (event.pointerType === 'mouse'
      && pointerUiSurface(event.target) === 'canvas')
      heldPosition.pointerCancel(event.pointerId);
  }

  function handlePointerUiContextMenu(event: MouseEvent): void {
    // Right-button UI bindings must not leave a browser context menu hanging
    // over the game after a modal opens or closes.
    const action = resolvePointerAction({ button: event.button, uiCaptured: false }, bridge.bindings());
    if (pointerUiSurface(event.target) !== 'other'
      && (action === 'MAP' || action === 'TALENTS' || action === 'INVENTORY'
        || action === 'CHARACTER' || action === 'MENU'
        || action === 'HOLD_POSITION')) event.preventDefault();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!playing) return;
    if (settingsOpen) {
      if (event.code === 'Escape') {
        event.preventDefault();
        settingsOpen = false;
      }
      return;
    }
    if (controlsOpen) {
      // Escape cancels an in-progress rebind inside ControlsPanel; otherwise
      // it returns to the paused game without leaking input into Phaser.
      if (event.code === 'Escape' && !document.querySelector('.controls-card .capture-hint')) {
        event.preventDefault();
        controlsOpen = false; settingsOpen = false;
      }
      return;
    }
    const target = event.target;
    const isTyping = target instanceof HTMLElement
      && !!target.closest('input, textarea, select, [contenteditable="true"]');
    // A single binding resolver owns every configured shortcut, including
    // modal open/close. Do not hardcode KeyM or KeyT after the user rebinds.
    const action = resolveKeyboardAction({
      code: event.code, repeat: event.repeat, isTyping, uiCaptured: false,
      ctrlKey: event.ctrlKey, altKey: event.altKey,
      shiftKey: event.shiftKey, metaKey: event.metaKey,
      altGraphKey: event.getModifierState('AltGraph') || event.key === 'AltGraph'
    }, bridge.bindings());
    if (talentsOpen) {
      if (event.code === 'Escape' || action === 'MENU' || action === 'TALENTS') {
        event.preventDefault();
        closeTalents();
      }
      return;
    }
    if (mapOpen) {
      if (event.code === 'Escape' || action === 'MENU' || action === 'MAP') {
        event.preventDefault();
        closeMap();
      } else if (!isTyping) {
        const arrows: Readonly<Record<string, readonly [number, number]>> = {
          ArrowLeft: [-130, 0], ArrowRight: [130, 0],
          ArrowUp: [0, -100], ArrowDown: [0, 100]
        };
        const shift = arrows[event.code];
        if (shift) { event.preventDefault(); panMap(shift[0], shift[1]); }
        else if (event.code === 'Equal' || event.code === 'NumpadAdd') {
          event.preventDefault(); zoomMap(1.25);
        } else if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
          event.preventDefault(); zoomMap(0.8);
        } else if (event.code === 'KeyC') {
          event.preventDefault(); centerMapOnPlayer();
        } else if (event.code === 'KeyR') {
          event.preventDefault(); resetMapView();
        }
      }
      return;
    }
    if (action === 'MAP') {
      event.preventDefault();
      openMap();
      return;
    }
    if (!action) return;
    if (action === 'TALENTS') {
      event.preventDefault();
      openTalents();
      return;
    }

    if (action === 'MENU') {
      event.preventDefault();
      if (talentsOpen) closeTalents();
      else if (dialogueOpen || tradeNpc !== null || townModal !== null) closeDialogue();
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

    if (action === 'HOLD_POSITION') {
      event.preventDefault();
      const heldChord = bridge.bindings().find(binding =>
        binding.action === 'HOLD_POSITION' && binding.device === 'keyboard'
        && binding.code === event.code && binding.modifiers
        && !!binding.modifiers.ctrl === event.ctrlKey
        && !!binding.modifiers.alt === event.altKey
        && !!binding.modifiers.shift === event.shiftKey
      );
      heldPosition.keyDown(event.code,
        heldChord?.device === 'keyboard' ? heldChord.modifiers : undefined);
    } else if (dispatchCombatAction(bridge, action)) {
      event.preventDefault();
    } else if (action === 'FORCE_MOVE' || action === 'PRIMARY') {
      const position = bridge.pointerPosition();
      if (!position) return;
      event.preventDefault();
      bridge.command({ type: 'move', destination: position });
    }
    // Remaining classes retain reserved slots until their original kits are complete.
  }
  function handleKeyup(event: KeyboardEvent): void {
    heldPosition.keyUp(event.code);
    heldPosition.releaseMissingModifiers({
      ctrlKey: event.ctrlKey, altKey: event.altKey, shiftKey: event.shiftKey
    });
  }
  function handleBlur(): void {
    heldPosition.clear();
  }
  async function save(): Promise<void> {
    if (busy) return;
    busy = true;
    messageKey = 'status.saving'; // Visible pending state cannot be confused with old success.
    try {
      await tick(); // Commit the saving label before awaiting IndexedDB transactions.
      const world = boundWorldProgress();
      await Promise.all([
        autosaver.saveNow(characterForSave()),
        ...(world ? [worldAutosaver.saveNow(world)] : [])
      ]);
      messageKey = 'status.saved';
      await refreshCharacters();
    } catch {
      messageKey = 'status.saveError';
    } finally {
      busy = false;
    }
  }
  async function load(requestedId?: string): Promise<void> {
    if (busy) return;
    heldPosition.clear();
    busy = true;
    restoring = true;
    try {
      await Promise.all([autosaver.flush(), worldAutosaver.flush()]);
      const id = requestedId ?? (playing ? (bridge.character().characterId ?? 'hero')
        : (selectedCharacterId ?? undefined));
      const character = await loadGame(id);
      const world = character ? await loadWorldProgress(character.characterId ?? 'hero') : null;
      if (character && bridge.restoreCharacter(character, world?.seed)) {
        const worldRestored = world ? bridge.restoreWorldProgress(world) : false;
        activeCharacterName = character.characterName;
        activeSessionId = character.characterId ?? 'hero';
        messageKey = world && !worldRestored ? 'status.worldRestoreError' : 'status.loaded';
        inventoryOpen = false;
        characterOpen = false;
        talentsOpen = false;
        controlsOpen = false; settingsOpen = false;
        mapOpen = false;
        dialogueOpen = false;
        tradeNpc = null;
        townModal = null;
        selectedClass = bridge.snapshot().classId;
        autosaver.prime(characterForSave());
        const currentWorld=boundWorldProgress();
        if (currentWorld) worldAutosaver.prime(currentWorld);
        playing = true;
        activateOnboardingForHero();
        selectedCharacterId = bridge.character().characterId ?? 'hero';
        creatingCharacter = false;
        await refreshCharacters();
      } else {
        messageKey = 'status.emptySave';
      }
    } catch {
      messageKey = 'status.saveError';
    } finally {
      restoring = false;
      busy = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} onkeyup={handleKeyup}
  onpointerdown={handlePointerUiDown} onpointerup={handleHoldPointerUp}
  onpointercancel={handleHoldPointerCancel} onpointerout={handleHoldPointerOut}
  oncontextmenu={handlePointerUiContextMenu} onblur={handleBlur} />

<svelte:head>
  <title>Aether &amp; Ruin</title>
  <meta name="description" content="Aether & Ruin – Svelte / Phaser ARPG prototype" />
</svelte:head>

<div class="app-frame" bind:this={appRoot}>
  {#if !playing}
    <main class="main-menu">
      <div class="menu-orbit"></div>
      <div class="menu-content">
        <div class="kicker">DARK FANTASY · ARPG</div>
        <h1>Aether <span>&amp;</span> Ruin</h1>
        <div class="ornament">◆ ─── ◆ ─── ◆</div>
        <p class="subtitle">{ $t('menu.subtitle') }</p>
        {#if creatingCharacter}
          <section class="creation-flow" aria-label={$t('menu.new')}>
            <h2>{$t('menu.new')}</h2>
            <label for="character-name">{$t('creation.name')}</label>
            <input id="character-name" data-testid="character-name" type="text"
              bind:value={newCharacterName} maxlength={MAX_CHARACTER_NAME_LENGTH}
              placeholder={$t('creation.namePlaceholder')} disabled={busy}
              aria-describedby="character-name-hint" />
            <p id="character-name-hint" class="name-hint">{$t('creation.nameHint')}</p>
            <CharacterSelect selected={selectedClass} choose={(id) => { if (!busy) selectedClass = id; }} />
            <div class="menu-actions">
              <button class="primary" disabled={busy || !validCharacterName} onclick={newGame}>{$t('menu.start')}</button>
              <button class="secondary" data-testid="cancel-character" disabled={busy}
                onclick={cancelCreation}>{$t('saveSlots.cancel')}</button>
            </div>
          </section>
        {:else}
          <section class="saved-characters" aria-label={$t('saveSlots.title')}>
            <div class="saved-characters-title">
              <strong>{$t('saveSlots.title')}</strong>
              <span>{savedCharacters.length}/{MAX_SAVED_CHARACTERS}</span>
            </div>
            {#if !menuReady}
              <p class="saved-empty">{$t('saveSlots.loading')}</p>
            {:else if savedCharacters.length === 0}
              <p class="saved-empty">{$t('saveSlots.empty')}</p>
            {:else}
              <div class="saved-character-list">
                {#each savedCharacters as entry (entry.characterId)}
                  {@const displayName = entry.characterName ?? $t('saveSlots.unnamed') + ' · ' + entry.characterId.slice(-6)}
                  <div class="saved-character-row" data-saved-character={entry.characterId}>
                    <button type="button" class="saved-select" class:chosen={selectedCharacterId === entry.characterId}
                      aria-pressed={selectedCharacterId === entry.characterId} disabled={busy}
                      onclick={() => { selectedCharacterId = entry.characterId; pendingDeleteId = null; }}>
                      <strong>{displayName}</strong>
                      <span>{$t('classes.' + entry.classId + '.name')} · {$t('saveSlots.level')} {entry.level}</span>
                    </button>
                    {#if pendingDeleteId === entry.characterId}
                      <button type="button" class="saved-remove-confirm" disabled={busy}
                        onclick={() => removeSavedCharacter(entry.characterId)}>{$t('saveSlots.confirmDelete')}</button>
                      <button type="button" disabled={busy}
                        onclick={() => { pendingDeleteId = null; }}>{$t('saveSlots.cancel')}</button>
                    {:else}
                      <button type="button" disabled={busy}
                        aria-label={$t('saveSlots.delete') + ': ' + displayName}
                        onclick={() => { pendingDeleteId = entry.characterId; }}>{$t('saveSlots.delete')}</button>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
            {#if selectedCharacter}
              <div class="selected-character-details" data-testid="selected-character" aria-live="polite">
                <strong>{selectedCharacter.characterName ?? $t('saveSlots.unnamed') + ' · ' + selectedCharacter.characterId.slice(-6)}</strong>
                <span>{$t('classes.' + selectedCharacter.classId + '.name')} · {$t('saveSlots.level')} {selectedCharacter.level}</span>
              </div>
            {/if}
            {#if savedCharacters.length >= MAX_SAVED_CHARACTERS}
              <p class="saved-empty">{$t('saveSlots.full')}</p>
            {/if}
            <div class="menu-actions">
              <button class="primary" data-testid="continue-character" disabled={busy || !menuReady || !selectedCharacter}
                onclick={continueSelected}>{$t('menu.continue')}</button>
              <button class="secondary" data-testid="new-character" disabled={busy || !menuReady || savedCharacters.length >= MAX_SAVED_CHARACTERS}
                onclick={openCreation}>{$t('menu.new')}</button>
            </div>
          </section>
        {/if}
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
    <main class="game-screen" data-world-seed={view.worldSeed} data-zone={view.zone} data-dungeon-id={view.dungeonId}
      data-player-x={view.player.x} data-player-y={view.player.y}
      data-hold-position={view.holdPosition}>
      <div class="game-play-area">
      {#key visualPreferences.pixelFilter}
        <GameViewport {bridge} renderMode={visualPreferences.pixelFilter} />
      {/key}
      <div class="game-vignette" aria-hidden="true"></div>

      <header class="game-header" inert={modalKind !== ''}>
        <div class="brand-mark">AETHER <span>&amp;</span> RUIN</div>
        <div class="zone-name">{view.zone === 'crypt' ? $t(view.dungeonId==='mine'?'dungeon.mineName':view.dungeonId==='cave'?'dungeon.caveName':'dungeon.name')
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
            onclick={(event) => openMap(event.currentTarget)}>{$t('map.open')}</button>
          <button class="small-button" disabled={!view.player.alive} onclick={(event) => togglePause(event.currentTarget)}>{view.paused ? $t('menu.resume') : $t('menu.paused')}</button>
          <button class="small-button" disabled={busy} onclick={menu}>{$t('menu.back')}</button>
        </div>
      </header>

      <div class="hud-left-column" aria-label="Game information" inert={modalKind !== ''}>
        <div class="world-guide" aria-live="polite">
        <div>{$t('controls.move')}</div>
        <div>{$t('controls.attack')}</div>
        <div>{$t('controls.pickup')}</div>
        <div>{$t('controls.skills', { values: {
          skills: (['SECONDARY', 'SLOT_1', 'SLOT_2', 'SLOT_3', 'SLOT_4', 'SLOT_5', 'SLOT_6'] as const)
            .map(action => shortcutHint(controlBindings, action)).join(' / '),
          potion: shortcutHint(controlBindings, 'POTION')
        } })}</div>
        <div>{$t('controls.avoid')}</div>
        <div>{$t('controls.navigate')}</div>
        <div class="world-guide-sub">{$t('controls.hint', { values: {
          evade: shortcutHint(controlBindings, 'EVADE'),
          hold: shortcutHint(controlBindings, 'HOLD_POSITION'),
          menu: shortcutHint(controlBindings, 'MENU')
        } })}</div>
      </div>

      {#if modalKind === '' && view.player.alive && !view.paused}
        <NearbyLootPanel {view} {bridge} />
      {/if}
      {#if modalKind === '' && view.player.alive && !view.paused}
        <OnboardingGuide progress={onboardingProgress}
          context={liveOnboardingContext}
          bindings={controlBindings} next={advanceOnboarding}
          skip={skipGuide} show={showGuide} restart={resetGuide}
          onMap={openMap} onTalents={openTalents} onWarden={talkToWarden} />
      {/if}
      <QuestJournal {view} talk={talkToWarden}
        inspectEvidence={() => bridge.command({ type: 'inspectStoryEvidence' })} />
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
      <div class="hud-right-column" aria-label="Map and combat status" inert={modalKind !== ''}>
      {#if view.enemies.some(unit => unit.intent !== null) && !inventoryOpen}
        <div class="danger-alert" role="status">
          <strong>{$t('combat.warning')}</strong>
          <span>{$t('combat.dodge')}</span>
        </div>
      {/if}
      {#if miniProjection}
        <div class="minimap-overlay" data-minimap="active">
          <WorldMapCanvas projection={miniProjection} compact />
          <button onclick={(event) => openMap(event.currentTarget)} disabled={view.paused} aria-label={$t('map.open')}>
            {$t('map.open')} · {shortcutHint(controlBindings, 'MAP')}
          </button>
        </div>
      {/if}
        <WorldEventPanel {view} />
        <DungeonPanel {view} {bridge} />
      <aside class="enemy-roster" aria-label={$t('hud.enemies')}>
        <div class="enemy-roster-title">{$t('hud.enemies')} · {view.enemies.filter(unit => unit.actor.alive).length}/{view.enemies.length} · {$t('hud.wave')} {view.wave + 1}</div>
        {#each rosterUnits as unit (unit.actor.id)}
          <button
            class:targeted={unit.actor.id === view.selectedTargetId}
            class:bossTarget={unit.actor.id === 'crypt_lord-4' || isOptionalDungeonBoss(view.dungeonId,view.dungeonStage,unit.actor.id) || !!view.miniBossStates?.[unit.actor.id]}
            class:eliteTarget={!!unit.elite}
            data-threat={unit.actor.id === 'crypt_lord-4' || isOptionalDungeonBoss(view.dungeonId,view.dungeonStage,unit.actor.id) || view.miniBossStates?.[unit.actor.id]
              ? 'boss' : unit.elite ? 'elite' : 'normal'}
            disabled={!unit.actor.alive || !view.player.alive || view.paused}
            aria-pressed={unit.actor.id === view.selectedTargetId}
            onclick={() => bridge.command({ type: 'attack', targetId: unit.actor.id })}
          >
            <span class="roster-label">{unit.elite ? $t('hud.elite') + ' · ' : ''}{$t(unit.actor.id === 'crypt_lord-4' && view.zone === 'crypt'
              ? 'boss.hollowKing.name' : isOptionalDungeonBoss(view.dungeonId,view.dungeonStage,unit.actor.id)
              ? (view.dungeonId==='mine'?'dungeon.mineBoss':'dungeon.caveBoss') : view.miniBossStates?.[unit.actor.id]
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
            {#if unit.actor.alive && (unit.actor.id === 'crypt_lord-4' || isOptionalDungeonBoss(view.dungeonId,view.dungeonStage,unit.actor.id) || view.miniBossStates?.[unit.actor.id])}
              <span class="boss-health-track" aria-hidden="true">
                <span class="boss-health-fill" style:width={`${Math.max(0, Math.min(100,
                  100 * unit.actor.health / Math.max(1, unit.actor.maxHealth)))}%`}></span>
              </span>
            {/if}
          </button>
        {/each}
      </aside>
      </div>
      </div>
      <div class="game-hud" data-testid="combat-dock" inert={modalKind !== ''}>
        <div class="vital-panel">
          <div class="vital-top"><span>{$t('hud.health')}</span><strong>{view.player.health} / {view.player.maxHealth}</strong></div>
          <div class="health-track"><div class="health-fill" style:width={`${100 * view.player.health / view.player.maxHealth}%`}></div></div>
          {#if view.shield > 0}
            <div class="vital-top resource-label"><span>{$t('hud.shield')}</span><strong>{view.shield}</strong></div>
          {/if}
          <div class="vital-top resource-label"><span>{$t('resource.' + CLASSES[view.classId].resourceId)}</span><strong>{Math.round(view.resource)} / {view.stats.maxResource}</strong></div>
          <div class="health-track resource-track"><div class="resource-fill" style:width={`${100 * view.resource / view.stats.maxResource}%`}></div></div>
          <div class="hud-details">{#if activeCharacterName}<span class="hero-name">{activeCharacterName}</span>{/if}<span>{$t('classes.' + view.classId + '.name')} · {$t('hud.level')} {view.level}</span><span>{$t('hud.kills')}: {view.kills} · {$t('hud.gold')}: {view.gold}</span></div>
          <div class="experience-track"><div style:width={`${xpRequiredForLevel(view.level) > 0 ? 100 * view.xp / xpRequiredForLevel(view.level) : 100}%`}></div></div>
        </div>
        <SkillBar {bridge} {view} bindings={controlBindings} />
        <div class="hud-actions">
          <button onclick={(event) => openInventory(event.currentTarget)} aria-label={$t('inventory.open')} title={$t('inventory.open')}
            data-quick-action="inventory"><span aria-hidden="true">▦</span><span class="quick-key">{shortcutHint(controlBindings, 'INVENTORY')}</span></button>
          <button onclick={(event) => openCharacterSheet(event.currentTarget)} aria-label={$t('character.open')} title={$t('character.open')}
            data-quick-action="character"><span aria-hidden="true">♙</span><span class="quick-key">{shortcutHint(controlBindings, 'CHARACTER')}</span></button>
          <button onclick={(event) => openTalents(event.currentTarget)} disabled={!view.player.alive || view.paused}
            aria-label={$t('talents.open') + (view.talentPoints ? ' (' + view.talentPoints + ')' : '')}
            title={$t('talents.open')}
            data-quick-action="talents"><span aria-hidden="true">✧</span><span class="quick-key">{shortcutHint(controlBindings, 'TALENTS')}</span>
            {#if (view.talentPoints ?? 0) > 0}<span class="quick-notice">{view.talentPoints}</span>{/if}</button>
          <button disabled={busy} onclick={save} aria-label={$t('menu.save')} title={$t('menu.save')}
            data-quick-action="save"><span aria-hidden="true">▣</span></button>
          <button disabled={busy} onclick={() => load()} aria-label={$t('menu.load')} title={$t('menu.load')}
            data-quick-action="load"><span aria-hidden="true">↺</span></button>
        </div>
      </div>

      {#if messageKey}
        <div class="toast" role="status">
          {#if messageKey === 'gems.combatLoot' && droppedGem}
            {$t(messageKey, { values: {
              gem: $t('gems.names.' + baseOf(droppedGem).id),
              tier: tierOf(droppedGem)
            } })}
          {:else}
            {$t(messageKey)}
          {/if}
        </div>
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
            <div class="world-map-guide">
              <p class="world-map-legend">{$t('map.legend')}</p>
              <div class="world-map-key" aria-label={$t('map.markerLegend')}>
                <span>◉ {$t('map.player')}</span>
                <span>● {$t('map.town')}</span>
                <span>◆ {$t('map.quest')}</span>
                <span>▲ {$t('map.dungeonEntrance')}</span>
                <span>◎ {$t('map.waypoint')}</span>
              </div>
            </div>
            <div class="world-map-content">
              <WorldMapCanvas projection={fullProjection} onPan={panMap} onZoom={zoomMap} />
              <div class="world-map-toolbar" role="group" aria-label={$t('map.controls')}>
                <button type="button" data-testid="map-zoom-in" title={$t('map.zoomIn')}
                  aria-label={$t('map.zoomIn')} onclick={() => zoomMap(1.25)}>+</button>
                <button type="button" data-testid="map-zoom-out" title={$t('map.zoomOut')}
                  aria-label={$t('map.zoomOut')} disabled={mapZoom <= 1}
                  onclick={() => zoomMap(0.8)}>−</button>
                <button type="button" data-testid="map-center" title={$t('map.center')}
                  aria-label={$t('map.center')} onclick={centerMapOnPlayer}>⊙</button>
                <button type="button" data-testid="map-reset" title={$t('map.reset')}
                  aria-label={$t('map.reset')} onclick={resetMapView}>⤢</button>
              </div>
            </div>
            <div class="world-map-footer">
              <WaypointPanel {view} {bridge} />
            </div>
          </section>
        </div>
      {:else if townModal?.role === 'blacksmith'}
        <TradePanel {view} {bridge} npc={BLACKSMITH_ID} close={closeDialogue}
          regionalNameKey={townModal.nameKey} regionalDescriptionKey={townModal.descriptionKey} />
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
            {:else if townModal.capability === 'planned' && !VILLAGE_QUESTS.some(q => q.giverId === townModal?.id)}
              <p>{$t('town.futureService')}</p>
            {/if}
            {#each VILLAGE_QUESTS.filter(q => q.giverId === townModal?.id) as localQuest (localQuest.id)}
              {@const state = view.questLedger?.quests.find(q => q.questId === localQuest.id)}
              {@const prefix = 'quest.village.' + localQuest.id}
              <h3>{$t(prefix + '.title')}</h3>
              <p>{$t(prefix + '.briefing')}</p>
              <p>{$t(prefix + '.objective')}</p>
              <p>{localQuest.gold} {$t('hud.gold')} · {localQuest.xp} XP</p>
              {#if state?.status === 'available'}
                <button class="primary" data-testid={'village-accept-' + localQuest.id}
                  onclick={() => acceptQuest(localQuest.id)}>{$t(prefix + '.accept')}</button>
              {:else if state?.status === 'ready'}
                <button class="primary" data-testid={'village-turnin-' + localQuest.id}
                  onclick={() => turnInQuest(localQuest.id)}>{$t(prefix + '.turnIn')}</button>
              {:else if state?.status === 'completed'}
                <p>{$t('quest.ashes.completed')}</p>
              {/if}
            {/each}
            <button class="secondary" onclick={closeDialogue}>{$t('npc.leave')}</button>
          </section>
        </div>
      {:else if tradeNpc}
        <TradePanel {view} {bridge} npc={tradeNpc} close={closeDialogue} />
      {:else if settingsOpen}
        <div class="modal-shield">
          <VisualSettingsPanel preferences={visualPreferences}
            save={updateVisualPreferences} {audioPreferences} saveAudio={updateAudioPreferences}
            {fullscreenSupported} {fullscreenActive} {fullscreenError} {toggleFullscreen}
            close={() => { settingsOpen = false; }} />
        </div>
      {:else if controlsOpen}
        <div class="modal-shield">
          <ControlsPanel bindings={controlBindings} save={updateBindings}
            close={() => { controlsOpen = false; settingsOpen = false; }} />
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
          <div class="pause-card" role="dialog" aria-modal="true" aria-label={$t('menu.paused')}>
            <h2>{$t('menu.paused')}</h2>
            <button class="primary" onclick={() => togglePause()}>{$t('menu.resume')}</button>
            <button class="secondary" onclick={(event) => openControls(event.currentTarget)}>{$t('bindings.open')}</button>
            <button class="secondary" data-testid="open-visual-settings"
              onclick={(event) => openVisualSettings(event.currentTarget)}>{$t('visualSettings.open')}</button>
            <button class="secondary" disabled={busy} onclick={menu}>{$t('menu.back')}</button>
          </div>
        </div>
      {/if}
    </main>
  {/if}
</div>

<style>

  .game-screen {
    display:grid;
    grid-template-rows:minmax(0,1fr) auto;
    background:#0b1016;
  }
  .game-play-area {
    position:relative;
    min-height:0;
    overflow:hidden;
    border-bottom:1px solid #55482f;
  }
  .game-screen > :global(.game-hud) {
    position:relative;
    inset:auto;
    transform:none;
    justify-self:center;
    margin:5px 0 max(5px,env(safe-area-inset-bottom));
  }

  /* Side panels scroll within the actual canvas row. */
  .hud-left-column,.hud-right-column {
    position:absolute;z-index:3;top:85px;bottom:8px;
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
    .hud-left-column,.hud-right-column{top:72px;gap:6px}
    .hud-left-column{left:7px;width:clamp(132px,22vw,180px)}
    .hud-right-column{right:7px;width:clamp(132px,22vw,180px)}
    .hud-left-column :global(.world-guide){display:none}
    .hud-left-column :global(.camp-services){gap:3px}
    .hud-left-column :global(.camp-services button){font-size:.64rem;padding:5px 4px}
  }
  @media(max-width:560px){
    .hud-left-column,.hud-right-column{top:64px;gap:5px}
    .hud-left-column{width:clamp(120px,30vw,148px);left:4px}
    .hud-right-column{width:clamp(120px,30vw,148px);right:4px}
    .hud-right-column :global(.enemy-roster){max-height:110px}
    .hud-left-column :global(.quest-journal){padding:6px}
  }
  .creation-flow { width:min(100%,710px);margin:12px auto;text-align:left; }
  .creation-flow h2 { font-family:Georgia,serif;color:#e9c993;font-size:1.15rem;margin:0 0 12px; }
  .creation-flow label { display:block;color:#e4d4bb;margin-bottom:6px; }
  .creation-flow input { width:100%;box-sizing:border-box;min-height:44px;padding:9px 12px;color:#f2e8d7;background:#111920;border:1px solid #837052;border-radius:3px;font:inherit; }
  .name-hint { color:#bdab92;font-size:.72rem;margin:5px 0 12px; }
  .selected-character-details { display:flex;flex-direction:column;gap:4px;text-align:left;background:#20252b;border:1px solid #665740;padding:12px;margin:12px 0;overflow-wrap:anywhere; }
  .selected-character-details strong { color:#f1d6a3;font-size:1.05rem; }
  .selected-character-details span { color:#c9bba7;font-size:.82rem; }
  .saved-characters .menu-actions { margin-top:12px; }
  .hero-name { color:#e6c998;overflow-wrap:anywhere; }
  .saved-characters { margin: 10px auto 14px; width: min(100%, 710px);
    padding: 10px; border: 1px solid #665740; background: #101721e8; text-align: left; }
  .saved-characters-title { display:flex; align-items:center; justify-content:space-between;
    gap:10px; color:#e9c993; font-size:.85rem; margin-bottom:7px; }
  .saved-character-list { display:grid; gap:5px; max-height:175px; overflow-y:auto; }
  .saved-character-row { display:flex; align-items:stretch; gap:6px; min-width:0; }
  .saved-character-row button { min-height:38px; padding:6px 9px; font-size:.72rem; }
  .saved-character-row .saved-select { flex:1; display:flex; flex-direction:column; gap:4px; align-items:flex-start;
    justify-content:center; min-width:0; text-align:left; color:#e1d7c7; overflow-wrap:anywhere; }
  .saved-select.chosen { border-color:#ddbc82; background:#302a22; }
  .saved-select span { color:#bdaf9b; flex-shrink:0; }
  .saved-remove-confirm { color:#ffc2aa; border-color:#b36659; }
  .saved-empty { margin:4px 0; color:#b9b4ad; font-size:.75rem; }
  @media(max-width:560px){ .saved-characters { padding:7px; }
    .saved-character-row button { padding:6px; }
    .saved-character-list { max-height:155px; } }
  /* Preserve a scrollable gap above the taller three-row phone dock. */
  @media(max-width:650px) {
    .hud-left-column,.hud-right-column {
      top: max(59px,calc(env(safe-area-inset-top) + 56px));
      gap:5px;
    }
    .hud-left-column {left:4px;width:clamp(115px,30vw,165px)}
    .hud-right-column{right:4px;width:clamp(115px,30vw,165px)}
    /* Boss/elite targets must remain above the minimap, never hidden beneath
       a tall map or scroll-only event panels on narrow phones. */
    .hud-right-column :global(.danger-alert){order:0}
    .hud-right-column :global(.enemy-roster){order:1;max-height:min(31dvh,160px)}
    .hud-right-column .minimap-overlay{order:2;padding:3px}
    .hud-right-column :global(.event-panel){order:3}
    .hud-right-column :global(.dungeon-panel){order:4}
    .hud-left-column :global(.camp-services button){min-height:44px}
  }
  @media(max-height:480px) and (min-width:651px){
    .hud-left-column,.hud-right-column{top:53px}
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
  .world-map-guide { display: flex; flex-wrap: wrap; align-items: center;
    justify-content: space-between; gap: 4px 14px; min-width: 0; }
  .world-map-legend { margin: 0; color: #c5b698; font-size: .72rem;
    line-height: 1.35; max-width: 52ch; }
  .world-map-key { display: flex; flex-wrap: wrap; gap: 4px 11px;
    color: #e1d8c6; font-size: .7rem; }
  .world-map-key span { white-space: nowrap; }
  .world-map-content { position: relative; min-width: 0; min-height: 0;
    display: grid; overflow: hidden; }
  .world-map-toolbar {
    position: absolute; top: 8px; right: 8px; z-index: 3;
    display: flex; align-items: center; gap: 5px; padding: 4px;
    background: #0b131be8; border: 1px solid #82725b; border-radius: 5px;
  }
  .world-map-toolbar button {
    display: grid; place-items: center; min-width: 44px; min-height: 44px;
    padding: 4px; color: #f2deb8; background: #26303b;
    border: 1px solid #766b57; font-size: 1.25rem;
    touch-action: manipulation;
  }
  .world-map-toolbar button:disabled { opacity: .4; cursor: default; }
  .world-map-content :global(.map-canvas) { width: 100%; height: 100%; min-height: 0; }
  .world-map-footer { max-height: min(180px, 23vh); min-height: 0; overflow-y: auto; }
  .world-map-footer :global(.travel-panel) { margin: 0; max-height: none; }
  @media (max-width: 700px) {
    .minimap-overlay { width: 145px; min-width: 0; right: 8px; top: 110px; }
    .world-map-card { width: 100%; height: 100%; }
    .world-map-legend { font-size: .65rem; }
    .world-map-guide { max-height: 66px; overflow-y: auto; }
    .world-map-key { font-size: .65rem; gap: 3px 8px; }
    .world-map-toolbar { top: 5px; right: 5px; gap: 3px; padding: 3px; }
    .world-map-footer { max-height: min(138px, 22vh); }
    .world-map-header .map-close-button { padding: 5px 9px; }
  }
  .potion-shop{margin:12px 0;border-top:1px solid #6b5541;padding:10px 0}
  .potion-shop h3{font-size:.9rem;margin:5px 0 10px}
  .potion-shop-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;padding:5px 0;border-bottom:1px solid #413b35}
  .potion-shop-row button{padding:6px 10px}
</style>
