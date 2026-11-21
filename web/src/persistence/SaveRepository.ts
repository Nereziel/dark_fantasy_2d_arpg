import { GameSimulation } from '../game/core/GameSimulation';
import type { CharacterProgress } from '../game/core/types';
import { MAX_LEVEL } from '../game/progression/progressionRules';
import { createEquipment } from '../game/data/items';
import { isCharacterId } from '../game/creation/characterCreation';

const DATABASE = 'aether-ruin-web';
const STORE = 'saves';
const SLOT = 'first-character'; // Backward-compatible alias for the last active hero.
const CHARACTER_PREFIX = 'character:';
export const MAX_SAVED_CHARACTERS = 12;

/** Canonical character slot; always validated before use as an IndexedDB key. */
export function characterSaveKey(characterId: unknown): string | null {
  return isCharacterId(characterId) ? CHARACTER_PREFIX + characterId : null;
}

export interface SavedCharacterInfo {
  characterId: string;
  classId: CharacterProgress['classId'];
  level: number;
  savedAt: number;
}

/** Pure catalog projection; invalid/forged records never appear in the UI. */
export function summarizeSaveRecords(
  entries: Iterable<readonly [unknown, unknown]>
): SavedCharacterInfo[] {
  const catalog = new Map<string, SavedCharacterInfo>();
  for (const [key, raw] of entries) {
    if (typeof key !== 'string') continue;
    if (key !== SLOT && !key.startsWith(CHARACTER_PREFIX)) continue;
    const character = readSaveRecord(raw);
    const record = raw as Partial<SavedGame> | null;
    if (!character || !record || !Number.isFinite(record.savedAt)
      || (record.savedAt ?? -1) < 0) continue;
    const id = character.characterId ?? 'hero';
    if (key !== SLOT && key !== characterSaveKey(id)) continue;
    const info = { characterId: id, classId: character.classId,
      level: character.level, savedAt: record.savedAt! };
    const current = catalog.get(id);
    if (!current || current.savedAt < info.savedAt
      || (key === SLOT && current.savedAt === info.savedAt)) catalog.set(id, info);
  }
  return [...catalog.values()].sort((a, b) =>
    b.savedAt - a.savedAt || a.characterId.localeCompare(b.characterId));
}

/**
 * Persistent character only. A new session always starts with fresh monsters,
 * fresh ground loot, full health, zero cooldowns, and no temporary effects.
 *
 * Legacy character-only formats 8, 9 and 10 migrate explicitly to v11; world snapshots remain unsupported.
 */
export interface SavedGame {
  format: 11;
  characterId: string;
  savedAt: number;
  character: CharacterProgress;
}

export function validateCharacter(raw: unknown): CharacterProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const simulation = new GameSimulation();
  return simulation.restoreCharacter(raw as CharacterProgress)
    ? simulation.character() : null;
}

/** Export only explicitly whitelisted character fields, never a GameSnapshot. */
export function createSaveRecord(raw: unknown, savedAt = Date.now()): SavedGame | null {
  const character = validateCharacter(raw);
  if (!character || !Number.isFinite(savedAt) || savedAt < 0) return null;
  return { format: 11, characterId: character.characterId ?? 'hero', savedAt, character };
}

/**
 * v8 stored only character data with linear XP thresholds and without point
 * balances. Reconstruct all unspent points from the legacy level; equipped
 * and bagged item instances are copied unchanged by restoreCharacter.
 */
export function migrateV8Character(raw: unknown): CharacterProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const old = raw as Partial<CharacterProgress>;
  if (!Number.isSafeInteger(old.level) || (old.level ?? 0) < 1
      || (old.level ?? 0) > 1000 || !Number.isSafeInteger(old.xp)
      || (old.xp ?? -1) < 0 || (old.xp ?? 0) >= old.level! * 80) return null;
  const level = Math.min(old.level!, MAX_LEVEL);
  return validateCharacter({
    ...old, level, xp: level === MAX_LEVEL ? 0 : old.xp!,
    equipment: { ...createEquipment(), ...(old.equipment ?? {}) },
    skillPoints: level - 1,
    talentPoints: Math.floor(level / 5)
  });
}

/** V9 characters had no stash; migration cannot fabricate or lose old items. */
export function migrateV9Character(raw: unknown): CharacterProgress | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.hasOwn(raw, 'stash')) return null;
  return validateCharacter({ ...(raw as CharacterProgress), stash: Array(24).fill(null) });
}

export function readSaveRecord(raw: unknown): CharacterProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Partial<SavedGame>;
  if (!isCharacterId(record.characterId)) return null;
  const sameCharacter = (candidate: CharacterProgress | null) => candidate
    && (candidate.characterId ?? 'hero') === record.characterId ? candidate : null;
  const format: unknown = (raw as { format?: unknown }).format;
  // V11 explicitly stores both stash and the complete story ledger.
  // Missing ledger must fail closed, never reset paid quest rewards.
  if (format === 11) {
    if (!record.character || typeof record.character !== 'object'
      || !Object.hasOwn(record.character, 'stash')
      || !Array.isArray(record.character.stash)
      || !Object.hasOwn(record.character, 'questLedger')) return null;
    return sameCharacter(validateCharacter(record.character));
  }
  // V10 had a mandatory stash but only the historical first quest.
  // RestoreCharacter expands it to an Act I ledger without losing reward status.
  if (format === 10) {
    if (!record.character || typeof record.character !== 'object'
      || !Object.hasOwn(record.character, 'stash')
      || !Array.isArray(record.character.stash)) return null;
    return record.characterId === 'hero' ? sameCharacter(validateCharacter(record.character)) : null;
  }
  if (format === 9) return record.characterId === 'hero'
    ? sameCharacter(migrateV9Character(record.character)) : null;
  if (format === 8) return record.characterId === 'hero'
    ? sameCharacter(migrateV8Character(record.character)) : null;
  return null;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function perform<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, setResult: (value: T) => void) => void
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    let value: T;
    const transaction = db.transaction(STORE, mode);
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
    transaction.oncomplete = () => { db.close(); resolve(value); };
    try {
      action(transaction.objectStore(STORE), result => { value = result; });
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

/**
 * A successful transaction publishes both the canonical slot and the legacy
 * active alias atomically. Existing single-slot browsers still see the latest
 * hero, while older heroes stay independently addressable by characterId.
 */
export function saveGame(character: CharacterProgress): Promise<void> {
  const record = createSaveRecord(character);
  const key = record && characterSaveKey(record.characterId);
  if (!record || !key) return Promise.reject(new Error('Invalid character progression'));
  return perform<void>('readwrite', store => {
    const request = store.getAllKeys();
    request.onsuccess = () => {
      const keys = request.result.filter(k =>
        typeof k === 'string' && k.startsWith(CHARACTER_PREFIX));
      const hasCanonical = keys.includes(key);
      // One legacy character may exist without a canonical key yet.
      const activeRequest = store.get(SLOT);
      activeRequest.onsuccess = () => {
        const legacy = readSaveRecord(activeRequest.result);
        const legacyId = legacy?.characterId ?? (legacy ? 'hero' : null);
        const legacyExtra = legacyId && !keys.includes(CHARACTER_PREFIX + legacyId) ? 1 : 0;
        if (!hasCanonical && keys.length + legacyExtra >= MAX_SAVED_CHARACTERS) {
          store.transaction.abort();
          return;
        }
        // The first new hero must not orphan an old v8–v11 single-slot save.
        if (legacyId && !keys.includes(CHARACTER_PREFIX + legacyId)) {
          store.put(activeRequest.result, CHARACTER_PREFIX + legacyId);
        }
        store.put(record, key);
        store.put(record, SLOT);
      };
    };
  });
}

/** Without an ID, load the last active alias (legacy API). */
export function loadGame(characterId?: string): Promise<CharacterProgress | null> {
  if (characterId !== undefined && !characterSaveKey(characterId)) {
    return Promise.resolve(null);
  }
  return perform<CharacterProgress | null>('readonly', (store, setResult) => {
    if (characterId === undefined) {
      const request = store.get(SLOT);
      request.onsuccess = () => { setResult(readSaveRecord(request.result)); };
      return;
    }
    // The active alias is authoritative for the currently selected hero.
    // In addition to old single-slot saves, existing browser integrations may
    // update this stable v11 key without touching the canonical catalog key.
    const active = store.get(SLOT);
    active.onsuccess = () => {
      const candidate = readSaveRecord(active.result);
      if (candidate && (candidate.characterId ?? 'hero') === characterId) {
        setResult(candidate);
        return;
      }
      const canonical = store.get(characterSaveKey(characterId)!);
      canonical.onsuccess = () => {
        const stored = readSaveRecord(canonical.result);
        setResult(stored && (stored.characterId ?? 'hero') === characterId
          ? stored : null);
      };
    };
  });
}

export function listCharacters(): Promise<SavedCharacterInfo[]> {
  return perform<SavedCharacterInfo[]>('readonly', (store, setResult) => {
    const entries: Array<readonly [IDBValidKey, unknown]> = [];
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        setResult(summarizeSaveRecords(entries));
        return;
      }
      entries.push([cursor.key, cursor.value]);
      cursor.continue();
    };
  });
}

/** Atomic removal of a character, its world facts and active aliases when owned. */
export function deleteCharacter(characterId: string): Promise<void> {
  const key = characterSaveKey(characterId);
  if (!key) return Promise.reject(new Error('Invalid character identity'));
  return perform<void>('readwrite', store => {
    store.delete(key);
    store.delete('world:' + key);
    const active = store.get(SLOT);
    active.onsuccess = () => {
      const record = readSaveRecord(active.result);
      if (record && (record.characterId ?? 'hero') === characterId) store.delete(SLOT);
    };
    const world = store.get('world:first-character');
    world.onsuccess = () => {
      if (world.result?.characterId === characterId) store.delete('world:first-character');
    };
  });
}
