import { GameSimulation } from '../game/core/GameSimulation';
import type { ActorSnapshot, GameSnapshot } from '../game/core/types';

const DATABASE = 'aether-ruin-web';
const STORE = 'saves';
const SLOT = 'first-character';

export interface SavedGame {
  format: 2;
  characterId: string;
  savedAt: number;
  snapshot: GameSnapshot;
}
interface OldSnapshot {
  version: 1;
  player: ActorSnapshot;
  enemy: ActorSnapshot;
  kills: number;
}

/** Upgrade the previous Svelte sandbox save. This does not import the original HTML engine's save. */
export function migrateSnapshot(raw: unknown): GameSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as { version?: unknown };
  const simulation = new GameSimulation();
  if (value.version === 2) {
    return simulation.restore(value as GameSnapshot) ? simulation.snapshot() : null;
  }
  if (value.version !== 1) return null;
  const old = value as unknown as OldSnapshot;
  const validActor = (actor: ActorSnapshot | undefined, id: string): boolean =>
    !!actor && actor.id === id
    && [actor.x, actor.y, actor.health, actor.maxHealth].every(Number.isFinite)
    && actor.maxHealth > 0 && actor.health >= 0 && actor.health <= actor.maxHealth
    && actor.alive === (actor.health > 0);
  if (!validActor(old.player, 'hero') || !validActor(old.enemy, 'wraith-1')
    || !Number.isSafeInteger(old.kills) || old.kills < 0) return null;
  const fresh = simulation.snapshot();
  // Map legacy demo health percentage to the new class's calculated max health.
  fresh.player.x = old.player.x;
  fresh.player.y = old.player.y;
  fresh.player.health = Math.round(old.player.health / old.player.maxHealth * fresh.player.maxHealth);
  fresh.player.alive = fresh.player.health > 0;
  fresh.enemy = { ...old.enemy };
  fresh.kills = old.kills;
  fresh.level = Math.min(1000, 1 + Math.floor(old.kills / 4));
  return simulation.restore(fresh) ? simulation.snapshot() : null;
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

export function saveGame(snapshot: GameSnapshot): Promise<void> {
  const payload: SavedGame = {
    format: 2, characterId: snapshot.player.id, savedAt: Date.now(), snapshot
  };
  return perform<void>('readwrite', store => {
    store.put(payload, SLOT);
  });
}
export function loadGame(): Promise<GameSnapshot | null> {
  return perform<GameSnapshot | null>('readonly', (store, setResult) => {
    const request = store.get(SLOT);
    request.onsuccess = () => {
      const data = request.result as { format?: number; snapshot?: unknown } | undefined;
      setResult(data?.format === 2 || data?.format === 1
        ? migrateSnapshot(data.snapshot) : null);
    };
  });
}
