import type { CharacterProgress } from '../game/core/types';

/**
 * Debounced, serialized character-only autosave. It never receives GameSnapshot.
 * Failed writes may be retried by a later change or explicit save.
 */
export class CharacterAutosaver {
  private queued: CharacterProgress | null = null;
  private queuedKey: string | null = null;
  private lastSavedKey: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly write: (character: CharacterProgress) => Promise<void>,
    private readonly delayMs = 1400,
    private readonly reportError: (error: unknown) => void = () => {}
  ) {}

  /** A character loaded from storage needs no immediate rewrite. */
  prime(character: CharacterProgress): void {
    this.cancelTimer();
    this.queued = null;
    this.queuedKey = null;
    this.lastSavedKey = JSON.stringify(character);
  }

  schedule(character: CharacterProgress): void {
    const key = JSON.stringify(character);
    if (key === this.lastSavedKey) {
      // A pending unsaved change was reverted; never write the stale value.
      this.cancelTimer();
      this.queued = null;
      this.queuedKey = null;
      return;
    }
    if (key === this.queuedKey) return;
    // Keep a copy; the game may mutate its own state before the debounce runs.
    this.queued = structuredClone(character);
    this.queuedKey = key;
    this.cancelTimer();
    this.timer = setTimeout(() => {
      void this.flush().catch(error => this.reportError(error));
    }, this.delayMs);
  }

  /** Save now, including any pending changes. Calls are serialized. */
  saveNow(character: CharacterProgress): Promise<void> {
    this.schedule(character);
    return this.flush();
  }

  flush(): Promise<void> {
    this.cancelTimer();
    const character = this.queued;
    const key = this.queuedKey;
    this.queued = null;
    this.queuedKey = null;
    if (!character || !key) return this.chain;
    // Recover from a failed prior write without abandoning subsequent saves.
    this.chain = this.chain.catch(() => {}).then(async () => {
      await this.write(character);
      this.lastSavedKey = key;
    });
    return this.chain;
  }

  dispose(): Promise<void> { return this.flush(); }

  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
