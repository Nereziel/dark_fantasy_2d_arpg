import { GameSimulation } from '../game/core/GameSimulation';
import type { GameSnapshot } from '../game/core/types';

const DATABASE = 'aether-ruin-web';
const STORE = 'saves';
const SLOT = 'first-character';

/** Saves only the current game format; older demo/HTML saves are intentionally unsupported. */
export interface SavedGame {
  format: 3;
  characterId: string;
  savedAt: number;
  snapshot: GameSnapshot;
}

export function validateSnapshot(raw: unknown): GameSnapshot | null {
  if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== 3) return null;
  const simulation = new GameSimulation();
  return simulation.restore(raw as GameSnapshot) ? simulation.snapshot() : null;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
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
    } catch (error) { db.close(); reject(error); }
  });
}

export function saveGame(snapshot: GameSnapshot): Promise<void> {
  const payload: SavedGame = {
    format: 3,
    characterId: snapshot.player.id,
    savedAt: Date.now(),
    snapshot
  };
  return perform<void>('readwrite', store => { store.put(payload, SLOT); });
}

export function loadGame(): Promise<GameSnapshot | null> {
  return perform<GameSnapshot | null>('readonly', (store, setResult) => {
    const request = store.get(SLOT);
    request.onsuccess = () => {
      const data = request.result as Partial<SavedGame> | undefined;
      setResult(data?.format === 3 ? validateSnapshot(data.snapshot) : null);
    };
  });
}
