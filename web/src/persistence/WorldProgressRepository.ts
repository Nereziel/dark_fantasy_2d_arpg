import type { WorldSessionProgress } from '../game/core/types';
import { isCharacterId } from '../game/creation/characterCreation';
import { validateMapDiscovery } from '../game/world/mapDiscovery';
import { MINI_BOSS_IDS } from '../game/enemies/miniBossRules';
import { validCheckpointIds } from '../game/core/deathRespawn';
import { validEnvironmentUsedIds } from '../game/world/environmentInteractions';

/**
 * Separate versioned world-instance record; never modifies character-only v11.
 * World geometry, enemy states, treasure instances and cooldowns are not saved.
 */
const DATABASE = 'aether-ruin-web';
const STORE = 'saves';
const SLOT = 'world:first-character'; // Legacy last-active alias.
const MAX_RECORD_BYTES = 120_000;

interface WorldRecord {
  format: 1;
  characterId: string;
  progress: WorldSessionProgress;
}

export function readWorldRecord(raw: unknown, expectedCharacterId = 'hero'): WorldSessionProgress | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Partial<WorldRecord>;
  if (record.format !== 1 || !isCharacterId(expectedCharacterId)
    || record.characterId !== expectedCharacterId
    || !record.progress || record.progress.version !== 1
    || !Number.isSafeInteger(record.progress.seed)
    || record.progress.seed < 0 || record.progress.seed > 0xffffffff
    || !validateMapDiscovery(record.progress.mapDiscovery)
    || record.progress.mapDiscovery.worldSeed !== record.progress.seed
    || !record.progress.worldFacts
    || record.progress.worldFacts.worldSeed !== record.progress.seed
    || !Array.isArray(record.progress.worldFacts.entries)
    || record.progress.worldFacts.entries.length > 10000
    || (record.progress.activatedCheckpointIds !== undefined
      && !validCheckpointIds(record.progress.activatedCheckpointIds))
    || (record.progress.environmentUsedIds !== undefined
      && !validEnvironmentUsedIds(record.progress.environmentUsedIds))
    || ![record.progress.cryptUsedPropIds, record.progress.cryptTriggeredTrapIds]
      .every(list => list === undefined || (Array.isArray(list) && list.length <= 128
        && list.every(id => typeof id === 'string' && id.length <= 160)
        && new Set(list).size === list.length))
    || (record.progress.miniBossDefeatedIds !== undefined
      && (!Array.isArray(record.progress.miniBossDefeatedIds)
        || record.progress.miniBossDefeatedIds.length > MINI_BOSS_IDS.length
        || record.progress.miniBossDefeatedIds.some(id => !MINI_BOSS_IDS.includes(id))
        || new Set(record.progress.miniBossDefeatedIds).size
          !== record.progress.miniBossDefeatedIds.length))) return null;
  try {
    if (JSON.stringify(raw).length > MAX_RECORD_BYTES) return null;
    return structuredClone(record.progress);
  } catch { return null; }
}

export function createWorldRecord(progress: WorldSessionProgress, characterId = 'hero'): WorldRecord | null {
  if (!isCharacterId(characterId)) return null;
  const candidate: WorldRecord = { format: 1, characterId, progress };
  return readWorldRecord(candidate, characterId) ? structuredClone(candidate) : null;
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

/** Canonical per-character world facts, separate from volatile world instances. */
export function worldSaveKey(characterId: unknown): string | null {
  return isCharacterId(characterId) ? 'world:character:' + characterId : null;
}

export async function saveWorldProgress(progress: WorldSessionProgress, characterId = 'hero'): Promise<void> {
  const record = createWorldRecord(progress, characterId);
  const key = worldSaveKey(characterId);
  if (!record || !key) throw new RangeError('Invalid world-instance progress');
  // Both aliases are committed together, so changing characters never deletes
  // their independently saved map discovery, waypoints or persistent facts.
  return withStore<void>('readwrite', store => {
    store.put(record, key);
    store.put(record, SLOT);
  });
}

export async function loadWorldProgress(characterId = 'hero'): Promise<WorldSessionProgress | null> {
  const key = worldSaveKey(characterId);
  if (!key) return null;
  return withStore<WorldSessionProgress | null>('readonly', (store, done) => {
    const request = store.get(key);
    request.onsuccess = () => {
      const canonical = readWorldRecord(request.result, characterId);
      if (canonical) {
        done(canonical);
        return;
      }
      // Legacy worlds only used one key. Never restore another hero's record.
      const legacy = store.get(SLOT);
      legacy.onsuccess = () => { done(readWorldRecord(legacy.result, characterId)); };
    };
  });
}
