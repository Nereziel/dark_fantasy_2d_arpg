import { GameSimulation } from '../game/core/GameSimulation';
import type { CharacterProgress } from '../game/core/types';
import { MAX_LEVEL } from '../game/progression/progressionRules';
import { createEquipment } from '../game/data/items';
import { isCharacterId } from '../game/creation/characterCreation';

const DATABASE = 'aether-ruin-web';
const STORE = 'saves';
const SLOT = 'first-character';

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

export function saveGame(character: CharacterProgress): Promise<void> {
  const record = createSaveRecord(character);
  if (!record) return Promise.reject(new Error('Invalid character progression'));
  return perform<void>('readwrite', store => { store.put(record, SLOT); });
}

export function loadGame(): Promise<CharacterProgress | null> {
  return perform<CharacterProgress | null>('readonly', (store, setResult) => {
    const request = store.get(SLOT);
    request.onsuccess = () => { setResult(readSaveRecord(request.result)); };
  });
}
