import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { CharacterAutosaver } from '../../src/persistence/CharacterAutosaver';
import type { CharacterProgress } from '../../src/game/core/types';

afterEach(() => vi.useRealTimers());

describe('character-only autosave', () => {
  const hero = () => new GameSimulation().character();

  it('debounces progress changes instead of saving transient combat ticks', async () => {
    vi.useFakeTimers();
    const writes: CharacterProgress[] = [];
    const saver = new CharacterAutosaver(async c => { writes.push(c); }, 800);
    const initial = hero();
    saver.prime(initial);
    saver.schedule({ ...initial });
    await vi.advanceTimersByTimeAsync(900);
    expect(writes).toHaveLength(0);
    saver.schedule({ ...initial, gold: 100 });
    saver.schedule({ ...initial, gold: 120 });
    await vi.advanceTimersByTimeAsync(799);
    expect(writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.gold).toBe(120);
    saver.schedule({ ...initial, gold: 120 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toHaveLength(1);
    await saver.dispose();
  });

  it('cancels a queued change that is reverted before writing', async () => {
    vi.useFakeTimers();
    const writes: CharacterProgress[] = [];
    const saver = new CharacterAutosaver(async c => { writes.push(c); }, 600);
    const initial = hero();
    saver.prime(initial);
    saver.schedule({ ...initial, gold: 999 });
    saver.schedule({ ...initial });
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toHaveLength(0);
    await saver.dispose();
  });

  it('flushes immediately for manual save and retries after a failed write', async () => {
    vi.useFakeTimers();
    const error = new Error('IndexedDB quota');
    const write = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined);
    const report = vi.fn();
    const saver = new CharacterAutosaver(write, 800, report);
    const initial = hero();
    await expect(saver.saveNow(initial)).rejects.toThrow('IndexedDB quota');
    await expect(saver.saveNow({ ...initial, xp: 15 })).resolves.toBeUndefined();
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]![0].xp).toBe(15);
    await saver.dispose();
  });
});
