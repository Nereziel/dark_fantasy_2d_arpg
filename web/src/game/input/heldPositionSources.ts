/** Renderer-neutral aggregation for HOLD_POSITION keyboard and mouse triggers.
 * One physical trigger releasing must never release another. GPL-3.0-only.
 */
import type { KeyboardModifiers } from './bindings';

export class HeldPositionSources {
  private readonly keys = new Set<string>();
  private readonly keyChords = new Map<string, KeyboardModifiers>();
  private readonly pointers = new Map<number, Set<number>>();
  constructor(private readonly notify: (held: boolean) => void) {}
  get active(): boolean { return this.keys.size > 0 || this.pointers.size > 0; }
  private update(change: () => void): void {
    const before = this.active;
    change();
    if (before !== this.active) this.notify(this.active);
  }
  keyDown(code: string, required?: KeyboardModifiers): void {
    if (typeof code !== 'string' || !code) return;
    this.update(() => {
      if (this.keys.has(code)) return;
      this.keys.add(code);
      if (required) this.keyChords.set(code, { ...required });
    });
  }
  keyUp(code: string): void {
    this.update(() => {
      this.keys.delete(code);
      this.keyChords.delete(code);
    });
  }

  /** A chord expires when any required modifier is no longer physically down.
   * Releasing Ctrl must not leave Ctrl+M held until the M key is released.
   */
  releaseMissingModifiers(flags: {
    ctrlKey: boolean; altKey: boolean; shiftKey: boolean
  }): void {
    this.update(() => {
      for (const [code, required] of this.keyChords) {
        if ((required.ctrl && !flags.ctrlKey)
          || (required.alt && !flags.altKey)
          || (required.shift && !flags.shiftKey)) {
          this.keys.delete(code);
          this.keyChords.delete(code);
        }
      }
    });
  }
  pointerDown(id: number, button: number): void {
    if (!Number.isSafeInteger(id) || id < 0
      || !Number.isInteger(button) || button < 0 || button > 4) return;
    this.update(() => {
      const held = this.pointers.get(id) ?? new Set<number>();
      held.add(button);
      this.pointers.set(id, held);
    });
  }
  pointerUp(id: number, button: number): void {
    this.update(() => {
      const held = this.pointers.get(id);
      if (!held) return;
      held.delete(button);
      if (!held.size) this.pointers.delete(id);
    });
  }
  pointerCancel(id: number): void {
    this.update(() => { this.pointers.delete(id); });
  }
  clear(): void {
    this.update(() => {
      this.keys.clear();
      this.keyChords.clear();
      this.pointers.clear();
    });
  }
}
