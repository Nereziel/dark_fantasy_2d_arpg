// GPL-3.0-only — only completed primary touch clicks count as taps.
// No timers, global state, or synthesized activation events.
export class CharacterDoubleTap {
  private previous: { id: string; time: number; x: number; y: number } | null = null;

  reset(): void { this.previous = null; }

  tap(id: string, time: number, x: number, y: number): boolean {
    if (!id || ![time, x, y].every(Number.isFinite)) {
      this.reset();
      return false;
    }
    const last = this.previous;
    if (last && last.id === id && time >= last.time && time - last.time <= 450
      && Math.hypot(x - last.x, y - last.y) <= 28) {
      this.reset();
      return true;
    }
    this.previous = { id, time, x, y };
    return false;
  }
}
