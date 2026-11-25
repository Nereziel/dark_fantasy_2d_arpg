// GPL-3.0-only — D5.4: observational browser performance baseline.
import { test, expect, type Locator, type Page } from '@playwright/test';
import { campMovementTarget } from './iso-input';

const renderer = 'canvas[data-renderer="isometric-preview"]';
const screen = '.game-screen[data-world-seed]';
const profiles = [
  { name: 'desktop', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, hasTouch: false },
  { name: 'touch', viewport: { width: 390, height: 740 }, deviceScaleFactor: 2, hasTouch: true }
] as const;

async function ready(page: Page) {
  const canvas = page.locator(renderer);
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-ground-chunks', '24');
  await expect.poll(async () => Number(await canvas.getAttribute('data-ground-resident-chunks'))).toBeGreaterThan(0);
  await expect.poll(async () => Number(await canvas.getAttribute('data-static-visible-layers'))).toBeGreaterThan(0);
  return canvas;
}

async function point(page: Page) {
  return page.locator(screen).evaluate(el => ({ x: Number(el.getAttribute('data-player-x')), y: Number(el.getAttribute('data-player-y')) }));
}

async function sample(canvas: Locator, durationMs: number) {
  return canvas.evaluate((node, durationMs) => new Promise<{
    durationMs: number; frames: number; effectiveFps: number; medianFrameMs: number; p95FrameMs: number;
    heapStartBytes: number | null; heapEndBytes: number | null;
    counts: { residentMin: number; residentMax: number; groundTotalMin: number; groundTotalMax: number;
      visibleMin: number; visibleMax: number; staticTotalMin: number; staticTotalMax: number; valid: boolean };
    start: { x: number; y: number }; end: { x: number; y: number }; maximumDisplacement: number;
  }>((resolve, reject) => {
    const game = node.closest('.game-screen');
    if (!game) { reject(new Error('Missing game screen')); return; }
    const heap = () => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
    const position = () => ({ x: Number(game.getAttribute('data-player-x')), y: Number(game.getAttribute('data-player-y')) });
    const counts = { residentMin: Infinity, residentMax: 0, groundTotalMin: Infinity, groundTotalMax: 0,
      visibleMin: Infinity, visibleMax: 0, staticTotalMin: Infinity, staticTotalMax: 0, valid: true };
    const intervals: number[] = [];
    let startTime: number | undefined, previous: number | undefined;
    let start = position(), maximumDisplacement = 0, heapStartBytes = heap();
    const frame = (now: number) => {
      if (!node.isConnected || !game.isConnected) { reject(new Error('Scene detached during sample')); return; }
      if (startTime === undefined) { startTime = now; start = position(); heapStartBytes = heap(); }
      if (previous !== undefined) intervals.push(now - previous);
      previous = now;
      const p = position();
      maximumDisplacement = Math.max(maximumDisplacement, Math.hypot(p.x - start.x, p.y - start.y));
      const values = ['data-ground-resident-chunks', 'data-ground-chunks', 'data-static-visible-layers', 'data-static-layers']
        .map(name => Number(node.getAttribute(name)));
      const [resident, groundTotal, visible, staticTotal] = values;
      counts.valid &&= values.every(v => Number.isInteger(v) && v > 0) && resident! <= groundTotal! && visible! <= staticTotal!;
      counts.residentMin = Math.min(counts.residentMin, resident!); counts.residentMax = Math.max(counts.residentMax, resident!);
      counts.groundTotalMin = Math.min(counts.groundTotalMin, groundTotal!); counts.groundTotalMax = Math.max(counts.groundTotalMax, groundTotal!);
      counts.visibleMin = Math.min(counts.visibleMin, visible!); counts.visibleMax = Math.max(counts.visibleMax, visible!);
      counts.staticTotalMin = Math.min(counts.staticTotalMin, staticTotal!); counts.staticTotalMax = Math.max(counts.staticTotalMax, staticTotal!);
      const elapsed = now - startTime;
      if (elapsed < durationMs || intervals.length === 0) { requestAnimationFrame(frame); return; }
      const sorted = [...intervals].sort((a, b) => a - b);
      const percentile = (fraction: number) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!;
      resolve({ durationMs: elapsed, frames: intervals.length, effectiveFps: intervals.length * 1000 / elapsed,
        medianFrameMs: percentile(0.5), p95FrameMs: percentile(0.95), heapStartBytes, heapEndBytes: heap(),
        counts, start, end: p, maximumDisplacement });
    };
    requestAnimationFrame(frame);
  }), durationMs);
}

type Sample = Awaited<ReturnType<typeof sample>>;
function checkSample(value: Sample, groundTotal: number, staticTotal: number) {
  expect(value.frames).toBeGreaterThan(0);
  expect(Number.isFinite(value.effectiveFps)).toBe(true);
  expect(value.counts.valid).toBe(true);
  expect(value.counts.groundTotalMin).toBe(groundTotal);
  expect(value.counts.groundTotalMax).toBe(groundTotal);
  expect(value.counts.staticTotalMin).toBe(staticTotal);
  expect(value.counts.staticTotalMax).toBe(staticTotal);
  // Hardware-dependent FPS/heap figures are diagnostic, not CI thresholds.
}

for (const profile of profiles) {
  test.describe('D5.4 baseline ' + profile.name, () => {
    test.use({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, hasTouch: profile.hasTouch });
    test('observes frame cadence, chunk residency and scene restart', async ({ page, browser }, testInfo) => {
      test.setTimeout(60_000);
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('./');
      await page.locator('#menu-language').selectOption('en');
      await page.getByRole('button', { name: 'Enter the world' }).click();
      const canvas = await ready(page);
      const seed = await page.locator(screen).getAttribute('data-world-seed');
      expect(seed).toMatch(/^\d+$/);
      const groundTotal = Number(await canvas.getAttribute('data-ground-chunks'));
      const staticTotal = Number(await canvas.getAttribute('data-static-layers'));
      await sample(canvas, 500); // warm-up; excluded from measurements
      const idle = await sample(canvas, 1500);
      checkSample(idle, groundTotal, staticTotal);
      const target = await campMovementTarget(page, canvas);
      const before = await point(page);
      const movingPromise = sample(canvas, 2000);
      if (profile.hasTouch) await page.touchscreen.tap(target.x, target.y);
      else await page.mouse.click(target.x, target.y);
      const moving = await movingPromise;
      checkSample(moving, groundTotal, staticTotal);
      const after = await point(page);
      console.log('D5.4_MOVEMENT ' + JSON.stringify({ profile: profile.name, seed, target, before, after, moving }));
      expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(20);
      expect(moving.maximumDisplacement).toBeGreaterThan(0);

      await page.setViewportSize({ width: profile.viewport.height, height: profile.viewport.width });
      await sample(canvas, 500);
      const resized = await sample(canvas, 1500);
      checkSample(resized, groundTotal, staticTotal);
      await page.locator('.game-header').getByRole('button', { name: 'Main menu', exact: true }).click();
      await expect(page.locator('canvas')).toHaveCount(0);
      await page.getByRole('button', { name: 'Enter the world' }).click();
      const restarted = await ready(page);
      const restartedSeed = await page.locator(screen).getAttribute('data-world-seed');
      expect(restartedSeed).toMatch(/^\d+$/);
      const restartSample = await sample(restarted, 1000);
      checkSample(restartSample, Number(await restarted.getAttribute('data-ground-chunks')), Number(await restarted.getAttribute('data-static-layers')));
      expect(errors).toEqual([]);

      const report = { profile, seed, restartedSeed, browser: browser.version(), platform: process.platform,
        commit: process.env.GITHUB_SHA ?? null, runner: process.env.RUNNER_OS ?? null,
        caveat: 'Headless rAF cadence, not GPU draw FPS; JS heap is optional and not GPU memory. Touch emulation is not a physical phone.',
        idle, moving, resized, restartSample };
      await testInfo.attach('isometric-baseline-' + profile.name, { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
      console.log('D5.4_ISO_BASELINE ' + JSON.stringify(report));
    });
  });
}
