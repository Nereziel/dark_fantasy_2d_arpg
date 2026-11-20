import type { WorldSessionProgress } from '../game/core/types';
import { validateMapDiscovery } from '../game/world/mapDiscovery';

/**
 * Separate versioned world-instance record; never modifies character-only v11.
 * World geometry, enemy states, treasure instances and cooldowns are not saved.
 */
const DATABASE = 'aether-ruin-web';
const STORE = 'saves';
const SLOT = 'world:first-character';
const MAX_RECORD_BYTES = 120_000;

interface WorldRecord {
  format: 1;
  characterId: 'hero';
  progress: WorldSessionProgress;
}

export function readWorldRecord(raw: unknown): WorldSessionProgress | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Partial<WorldRecord>;
  if (record.format !== 1 || record.characterId !== 'hero'
    || !record.progress || record.progress.version !== 1
    || !Number.isSafeInteger(record.progress.seed)
    || record.progress.seed < 0 || record.progress.seed > 0xffffffff
    || !validateMapDiscovery(record.progress.mapDiscovery)
    || record.progress.mapDiscovery.worldSeed !== record.progress.seed
    || !record.progress.worldFacts
    || record.progress.worldFacts.worldSeed !== record.progress.seed
    || !Array.isArray(record.progress.worldFacts.entries)
    || record.progress.worldFacts.entries.length > 10000) return null;
  try {
    if (JSON.stringify(raw).length > MAX_RECORD_BYTES) return null;
    return structuredClone(record.progress);
  } catch { return null; }
}

export function createWorldRecord(progress: WorldSessionProgress): WorldRecord | null {
  const candidate: WorldRecord = { format: 1, characterId: 'hero', progress };
  return readWorldRecord(candidate) ? structuredClone(candidate) : null;
}

function withStore<T>(mode: IDBTransactionMode,
  handle: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      let result: T;
      let tx: IDBTransaction;
      try {
        tx = db.transaction(STORE, mode);
        tx.oncomplete = () => { db.close(); resolve(result); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error); };
        handle(tx.objectStore(STORE), value => { result = value; });
      } catch (error) { db.close(); reject(error); }
    };
  });
}

export async function saveWorldProgress(progress: WorldSessionProgress): Promise<void> {
  const record = createWorldRecord(progress);
  if (!record) throw new RangeError('Invalid world-instance progress');
  return withStore<void>('readwrite', store => { store.put(record, SLOT); });
}

export async function loadWorldProgress(): Promise<WorldSessionProgress | null> {
  return withStore<WorldSessionProgress | null>('readonly', (store, done) => {
    const request = store.get(SLOT);
    request.onsuccess = () => { done(readWorldRecord(request.result)); };
  });
}
