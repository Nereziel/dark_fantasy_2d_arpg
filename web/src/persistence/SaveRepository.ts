import { GameSimulation } from '../game/core/GameSimulation';
import type { CharacterProgress } from '../game/core/types';

const DATABASE = 'aether-ruin-web';
const STORE = 'saves';
const SLOT = 'first-character';

/**
 * Persistent character only. A new session always starts with fresh monsters,
 * fresh ground loot, full health, zero cooldowns, and no temporary effects.
 *
 * Earlier world-snapshot formats are deliberately unsupported.
 */
export interface SavedGame {
  format: 6;
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
  return { format: 6, characterId: 'hero', savedAt, character };
}

export function readSaveRecord(raw: unknown): CharacterProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Partial<SavedGame>;
  if (record.format !== 6 || record.characterId !== 'hero') return null;
  return validateCharacter(record.character);
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
