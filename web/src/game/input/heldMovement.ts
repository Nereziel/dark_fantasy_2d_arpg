import type { Point } from '../core/types';

/** Throttles continuous mouse movement independently of the Phaser render rate. */
export class HeldPointerMovement {
  private held = false;
  private last: Point | null = null;
  private lastTime = 0;

  constructor(private readonly intervalMs = 110, private readonly threshold = 12) {}

  begin(point: Point, timeMs: number): void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(timeMs)) {
      this.release();
      return;
    }
    this.held = true;
    this.last = { ...point };
    this.lastTime = timeMs;
  }

  update(point: Point, timeMs: number): Point | null {
    if (!this.held || !this.last || !Number.isFinite(timeMs) || timeMs < this.lastTime
      || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    if (timeMs - this.lastTime < this.intervalMs
      || Math.hypot(point.x - this.last.x, point.y - this.last.y) < this.threshold) return null;
    this.last = { ...point };
    this.lastTime = timeMs;
    return { ...point };
  }

  release(): void {
    this.held = false;
    this.last = null;
  }

  get active(): boolean { return this.held; }
}
