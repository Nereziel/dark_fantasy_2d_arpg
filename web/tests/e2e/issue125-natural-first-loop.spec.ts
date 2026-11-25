import { openCharacterCreation, loadCharacterControl } from './character-menu';
import { errors, expect, test, type Locator, type Page } from '@playwright/test';
import { projectIsometric, unprojectIsometric } from '../../src/game/phaser/isometricProjection';
import { campMovementTarget } from './iso-input';

/** Use read-only renderer diagnostics and actual exposed canvas pixels.
 * All quest targets remain ordinary Cartesian map coordinates. The only
 * action that changes gameplay is a real mouse click in the browser.
 */
async function exposedIsometricClick(canvas: Locator, goal: { x: number; y: number }, timeout = 1500) {
  await expect(canvas).toHaveAttribute('data-renderer', 'isometric-preview', { timeout });
  await expect(canvas).toHaveAttribute('data-camera-origin', /^-?[0-9.]+,-?[0-9.]+$/, { timeout });
  const originText = await canvas.getAttribute('data-projection-origin');
  const [ox, oy] = (originText ?? '').split(',').map(Number);
  if (!originText || !Number.isFinite(ox) || !Number.isFinite(oy)) throw new Error('Missing isometric projection origin');
  const origin = { x: ox!, y: oy! };
  const desired = projectIsometric(goal, 0, origin);
  const click = await canvas.evaluate((node, { desired, origin }) => {
    const element = node as HTMLCanvasElement;
    const rect = element.getBoundingClientRect();
    const [sx, sy] = (element.dataset.cameraOrigin ?? '').split(',').map(Number);
    if (!Number.isFinite(sx) || !Number.isFinite(sy) || !element.width || !element.height
      || rect.width <= 0 || rect.height <= 0) return null;
    const desiredX = rect.left + (desired.x - sx!) * rect.width / element.width;
    const desiredY = rect.top + (desired.y - sy!) * rect.height / element.height;
    let best: { x: number; y: number; projectedX: number; projectedY: number; score: number } | null = null;
    const consider = (x: number, y: number) => {
      if (x < rect.left + 12 || x > rect.right - 12 || y < rect.top + 12 || y > rect.bottom - 12
        || document.elementFromPoint(x, y) !== element) return;
      const projectedX = sx! + (x - rect.left) * element.width / rect.width;
      const projectedY = sy! + (y - rect.top) * element.height / rect.height;
      // Exclude the empty corners outside the projected wilderness diamond.
      const px = projectedX - origin.x, py = projectedY - origin.y;
      const wx = py + px / 2, wy = py - px / 2;
      if (wx < 0 || wx >= 2200 || wy < 0 || wy >= 1400) return;
      const score = Math.hypot(x - desiredX, y - desiredY);
      if (!best || score < best.score) best = { x, y, projectedX, projectedY, score };
    };
    consider(desiredX, desiredY);
    for (let y = rect.top + 16; y <= rect.bottom - 12; y += 24)
      for (let x = rect.left + 16; x <= rect.right - 12; x += 24) consider(x, y);
    return best as { x: number; y: number; projectedX: number; projectedY: number; score: number } | null;
  }, { desired, origin });
  if (!click) throw new Error('No exposed isometric world canvas for ' + goal.x + ',' + goal.y);
  const world = unprojectIsometric({ x: click.projectedX, y: click.projectedY }, 0, origin);
  return { x: click.x, y: click.y, worldX: world.x, worldY: world.y };
}

/** Uses only ordinary user-visible controls on the production Vite build.
 * No GameBridge, debug hooks, direct commands, seeded snapshot injection,
 * canvas-state mutation or synthetic GameEvents.
 */
async function activeQuestCount(page: Page): Promise<number> {
  const questText = await page.locator('.quest-journal').innerText();
  const match = questText.match(/(?:^|\D)([0-3])\/3(?:\D|$)/);
  return match ? Number(match[1]) : -1;
}

async function keepFighting(
  page: Page, until: number, timeoutMs: number, nextQuestTitle?: string
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const roster = page.locator('.enemy-roster');
  let previousCount = -1;
  let lastTargetRefreshAt = 0;
  while (Date.now() < deadline) {
    const journal = await page.locator('.quest-journal').innerText();
    // The starter hunt is NPC-gated and stays at 3/3. Act I boar kills,
    // by contrast, immediately auto-complete and activate Forgotten Graves:
    // 3/3 is never guaranteed to remain visible for a polling interval.
    if (nextQuestTitle ? journal.includes(nextQuestTitle)
      : (await activeQuestCount(page)) >= until) return;
    const achieved = await activeQuestCount(page);
    if (await page.getByTestId('death-overlay').count()) {
      throw new Error('Natural quest playthrough: the hero died before ' + until + '/3 kills');
    }

    // A dialogue pauses the simulation; fail at the actual UI blocker rather
    // than misreporting a navigation/combat timeout forty-five seconds later.
    const openDialog = page.getByRole('dialog');
    if (await openDialog.count()) throw new Error('Unexpected modal during natural combat: ' + await openDialog.first().innerText());
    const current = await page.locator('.vital-top').first().innerText();
    const hp = current.match(/(\d+)\s*\/\s*(\d+)/);
    if (hp && Number(hp[1]) / Number(hp[2]) < 0.67) {
      const healingLight = page.locator('[data-paladin-ability="healingLight"]');
      if (await healingLight.isEnabled()) {
        await healingLight.click();
      } else {
        const potion = page.getByTestId('use-potion');
        if (await potion.isEnabled()) await potion.click();
      }
    }

    const activeTarget = roster.locator('button.targeted:not([disabled])');
    const huntBoars = nextQuestTitle !== undefined;
    const liveTargets = roster.locator('button:not([disabled])');
    // The roster displays optional minibosses first, even during the first
    // mandatory three-kill quest. A new hero must focus normal quest foes
    // instead of taking on a Brood Mother that is unrelated to onboarding.
    const boars = liveTargets.filter({ hasText: 'Corrupted Boar' });
    const otherEncounterTargets = roster.locator('button:not([disabled]):not(.bossTarget)');
    const boarVisible = huntBoars && await boars.count() > 0;
    const hasNormal = await otherEncounterTargets.count() > 0;
    const candidates = boarVisible ? boars : hasNormal ? otherEncounterTargets : liveTargets;
    const targetingOptional = hasNormal && await roster
      .locator('button.targeted.bossTarget:not([disabled])').count() > 0;
    const refreshTarget = targetingOptional || (huntBoars
      && (Date.now() - lastTargetRefreshAt > 10_000
      || (boarVisible && await activeTarget.filter({ hasText: 'Corrupted Boar' }).count() === 0)));
    if (await activeTarget.count() === 0 || achieved !== previousCount || refreshTarget) {
      if (await candidates.count()) {
        try {
          // A real click may race with an enemy death, as in PR #187. Bound
          // only the transient control wait, never the quest/death conditions.
          await candidates.first().click({ timeout: 1_500 });
          lastTargetRefreshAt = Date.now();
        } catch (error) {
          if (!(error instanceof errors.TimeoutError)) throw error;
        }
      }
    }
    previousCount = achieved;
    await page.waitForTimeout(400);
  }
  const rosterText = await roster.innerText();
  const game = page.locator('.game-screen');
  throw new Error('Natural quest playthrough timed out at ' +
    await activeQuestCount(page) + '/3 kills; target ' + until
    + '; active quest: ' + (await page.locator('.quest-journal').innerText())
    + '; enemies: ' + rosterText.replaceAll('\n', ' ')
    + '; player position: ' + await game.getAttribute('data-player-x')
    + ',' + await game.getAttribute('data-player-y')
    + '; seed: ' + await game.getAttribute('data-world-seed')
    + '; hold: ' + await game.getAttribute('data-hold-position')
    + '; selected: ' + (await roster.locator('button.targeted').allTextContents()).join(' '));
}

/** Follow the ordinary world canvas from the finished first quest to Act I's next
 * exploration objective. No debug bridge, state mutation or feature teleport. */
async function walkToCorruptionSite(page: Page, timeoutMs: number): Promise<void> {
  const game = page.locator('.game-screen');
  const canvas = page.locator('.phaser-container canvas');
  const journal = page.locator('.quest-journal');
  const deadline = Date.now() + timeoutMs;
  let stalled = 0;
  let waypointIndex = 0;
  let waypointTicks = 0;
  // Search the authored region, not a hidden procedural feature coordinate.
  // The mandatory site can shift to the nearest reachable grid candidate.
  const waypoints = [
    // Start along the old road south of the northern forest obstacles.
    // Clicking directly northeast can leave a procedural seed pinned at
    // the north edge (observed x≈883,y=140 in PR #189 CI).
    { x: 860, y: 470 }, { x: 1110, y: 470 }, { x: 1320, y: 440 },
    { x: 1550, y: 280 }, { x: 1490, y: 200 }, { x: 1620, y: 200 },
    { x: 1640, y: 320 }, { x: 1550, y: 390 }, { x: 1440, y: 330 },
    { x: 1420, y: 190 }, { x: 1720, y: 280 }, { x: 1700, y: 410 },
    { x: 1420, y: 420 }
  ];
  while (Date.now() < deadline) {
    if ((await journal.innerText()).includes('The Blighted Pack')) return;
    if (await page.getByTestId('death-overlay').count()) {
      throw new Error('Natural Act I exploration: hero died en route to the corruption site');
    }
    const x = Number(await game.getAttribute('data-player-x'));
    const y = Number(await game.getAttribute('data-player-y'));
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);

    // Ordinary player healing, without overriding health or pausing combat.
    const hp = (await page.locator('.vital-top').first().innerText())
      .match(/(\d+)\s*\/\s*(\d+)/);
    if (hp && Number(hp[1]) / Number(hp[2]) < 0.68) {
      const healing = page.locator('[data-paladin-ability="healingLight"]');
      if (await healing.isEnabled()) await healing.click();
      else {
        const potion = page.getByTestId('use-potion');
        if (await potion.isEnabled()) await potion.click();
      }
    }
    // This is an ordinary Paladin HUD spell, not a health/quest injection.
    // Protect low-level exploration against optional wandering minibosses.
    if (hp && Number(hp[1]) / Number(hp[2]) < 0.80) {
      const shield = page.locator('[data-paladin-ability="divineShield"]');
      if (await shield.isEnabled()) {
        try { await shield.click({ timeout: 1_500 }); }
        catch (error) { if (!(error instanceof errors.TimeoutError)) throw error; }
      }
    }

    // If the path is pinned against an obstacle, make a real short sideways
    // world click, then retry the authored region search. No simulation
    // teleport, hidden map marker or obstacle lookup is involved.
    const target = stalled >= 2
      ? { x: Math.max(100, Math.min(2080, x + (waypointIndex % 2 ? -90 : 115))),
        y: y < 570 ? Math.min(1200, y + 270) : Math.max(120, y - 230) }
      : waypoints[waypointIndex]!;
    const waypoint = target;
    const click = await exposedIsometricClick(canvas, waypoint);
    await page.mouse.click(click.x, click.y, { button: 'middle' });
    await page.waitForTimeout(1200);
    const nextX = Number(await game.getAttribute('data-player-x'));
    const nextY = Number(await game.getAttribute('data-player-y'));
    stalled = Math.hypot(nextX - x, nextY - y) < 6 ? stalled + 1 : 0;
    waypointTicks += 1;
    if (Math.hypot(nextX - waypoint.x, nextY - waypoint.y) < 45
      || waypointTicks >= 12 || stalled >= 4) {
      waypointIndex = (waypointIndex + 1) % waypoints.length;
      waypointTicks = 0;
      stalled = 0;
    }
  }
  throw new Error('Natural Act I exploration timed out at (' +
    await game.getAttribute('data-player-x') + ',' +
    await game.getAttribute('data-player-y') + '), objective: ' +
    await journal.innerText());
}

/** Find the actual procedurally placed graveyard by walking the wilderness,
 * using only visible canvas input. Authored map anchors are search regions,
 * not an authoritative feature-coordinate lookup or a teleport.
 */
async function walkToAbandonedGraveyard(page: Page, timeoutMs: number): Promise<void> {
  const game = page.locator('.game-screen');
  const canvas = page.locator('.phaser-container canvas');
  const journal = page.locator('.quest-journal');
  const deadline = Date.now() + timeoutMs;
  let index = 0;
  let ticks = 0;
  let stalled = 0;
  const lastSteps: string[] = [];
  const waypoints = [
    // Survey the authored graveyard area from the northern approach and
    // sweep south. Keep intermediate waypoints reachable with normal input;
    // the actual feature marker may shift with the procedural layout.
    { x: 1610, y: 390 }, { x: 1690, y: 280 }, { x: 1820, y: 280 },
    { x: 1980, y: 360 }, { x: 2000, y: 520 }, { x: 1950, y: 670 },
    { x: 1880, y: 690 }, { x: 2000, y: 780 }, { x: 1870, y: 830 },
    { x: 1780, y: 960 }, { x: 1940, y: 980 }, { x: 2040, y: 670 },
    { x: 1860, y: 570 }, { x: 1780, y: 450 }
  ];
  while (Date.now() < deadline) {
    // A genuine graveyard discovery auto-completes Forgotten Graves and
    // immediately activates Morrow; the 1/1 intermediate state is transient.
    if ((await journal.innerText()).includes('Morrow, Gravebound')) return;
    if (await page.getByTestId('death-overlay').count()) {
      throw new Error('Natural Act I exploration: hero died before finding the graveyard');
    }

    const x = Number(await game.getAttribute('data-player-x'));
    const y = Number(await game.getAttribute('data-player-y'));
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);

    const hp = (await page.locator('.vital-top').first().innerText())
      .match(/(\d+)\s*\/\s*(\d+)/);
    if (hp && Number(hp[1]) / Number(hp[2]) < 0.68) {
      const healing = page.locator('[data-paladin-ability="healingLight"]');
      if (await healing.isEnabled()) await healing.click();
      else {
        const potion = page.getByTestId('use-potion');
        if (await potion.isEnabled()) await potion.click();
      }
    }

    // Recover if a procedural obstacle blocks a specific eastward click.
    // This uses real viewport movement; it does not inspect map obstacles.
    const destination = waypoints[index]!;
    const waypoint = stalled >= 2
      ? { x: x - (stalled % 2 ? 95 : 175),
        y: Math.max(130, Math.min(1260, y + (stalled % 2 ? -165 : 245))) }
      : destination;
    const click = await exposedIsometricClick(canvas, waypoint);
    await page.mouse.click(click.x, click.y, { button: 'middle' });
    await page.waitForTimeout(1200);

    const nextX = Number(await game.getAttribute('data-player-x'));
    const nextY = Number(await game.getAttribute('data-player-y'));
    lastSteps.push(`${index}: ${Math.round(x)},${Math.round(y)} → ${Math.round(nextX)},${Math.round(nextY)}`);
    if (lastSteps.length > 8) lastSteps.shift();
    stalled = Math.hypot(nextX - x, nextY - y) < 6 ? stalled + 1 : 0;
    ticks += 1;
    if (Math.hypot(nextX - destination.x, nextY - destination.y) < 48
      || ticks >= 9 || stalled >= 4) {
      index = (index + 1) % waypoints.length;
      ticks = 0;
      stalled = 0;
    }
  }
  throw new Error('Natural graveyard exploration timed out at ('
    + await game.getAttribute('data-player-x') + ','
    + await game.getAttribute('data-player-y') + '), waypoint: '
    + index + ' (' + waypoints[index]!.x + ',' + waypoints[index]!.y
    + '), seed: ' + await game.getAttribute('data-world-seed')
    + ', last steps: ' + lastSteps.join(' | ')
    + ', journal: ' + await journal.innerText());
}

/** Continue from Morrow using ordinary world clicks, not a prepared save.
 * The evidence marker is seed-dependent; the real Inspect button must be
 * clicked in range and advance the live quest journal before returning.
 */
async function walkToStoryEvidence(page: Page, timeoutMs: number): Promise<void> {
  const game = page.locator('.game-screen');
  const canvas = page.locator('.phaser-container canvas');
  const inspect = page.getByTestId('story-inspect-evidence');
  const deadline = Date.now() + timeoutMs;
  const waypoints = [
    // Travel west on the southern road to avoid the old tower, then survey
    // both sides of the authored evidence region without reading its marker.
    { x: 1700, y: 965 }, { x: 1500, y: 1020 },
    { x: 1310, y: 1050 }, { x: 1110, y: 1050 },
    { x: 930, y: 1050 }, { x: 850, y: 1050 },
    { x: 790, y: 960 }, { x: 910, y: 940 },
    { x: 970, y: 1120 }, { x: 820, y: 1140 },
    { x: 740, y: 1030 }, { x: 870, y: 1050 }
  ];
  let index = 0;
  let ticks = 0;
  let stalled = 0;
  let detours = 0;
  let bestDistance = Infinity;
  let knownEvidence: { x: number; y: number } | null = null;
  let nextMapCheck = 0;
  const lastSteps: string[] = [];
  const journal = page.locator('.quest-journal');
  let inspectAttempts = 0;
  // A survey route can cross the interaction radius without ending there.
  // Stop by the normal Shift hold-position binding before using the real
  // button. The simulation still checks proximity and quest prerequisites.
  const inspectIfInReach = async (): Promise<boolean> => {
    if (Date.now() >= deadline || !await inspect.isVisible()) return false;
    if (await page.getByTestId('death-overlay').count()) {
      throw new Error('Natural Act I evidence search: hero died before inspection; seed='
        + await game.getAttribute('data-world-seed'));
    }
    inspectAttempts++;
    await page.keyboard.down('Shift');
    try {
      const remaining = Math.min(1_500, deadline - Date.now());
      if (remaining <= 0) return false;
      await expect(game).toHaveAttribute('data-hold-position', 'true', { timeout: remaining });
      if (!await inspect.isVisible()) {
        // The actor may already have left range before the key arrived.
        nextMapCheck = 0;
        return false;
      }
      await expect(journal).toContainText('The Seal of Rot');
      try {
        await inspect.click({ timeout: Math.max(1, Math.min(1_500, deadline - Date.now())) });
      } catch (error) {
        if (!(error instanceof errors.TimeoutError)) throw error;
        // A transient detached control does not count as completion.
        nextMapCheck = 0;
        return false;
      }
      // Only authoritative journal transition counts as success.
      await expect(journal).toContainText('Descent into the Crypt', {
        timeout: Math.max(1, Math.min(3_000, deadline - Date.now()))
      });
      return true;
    } finally {
      await page.keyboard.up('Shift');
    }
  };
  while (Date.now() < deadline) {
    if (await inspectIfInReach()) return;
    if (await page.getByTestId('death-overlay').count()) {
      throw new Error('Natural Act I evidence search: hero died; seed=' + await game.getAttribute('data-world-seed')
        + '; last steps=' + lastSteps.join(' | '));
    }
    const x = Number(await game.getAttribute('data-player-x'));
    const y = Number(await game.getAttribute('data-player-y'));
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    const hp = (await page.locator('.vital-top').first().innerText())
      .match(/(\d+)\s*\/\s*(\d+)/);
    if (hp && Number(hp[1]) / Number(hp[2]) < 0.78) {
      const heal = page.locator('[data-paladin-ability="healingLight"]');
      if (await heal.isEnabled()) await heal.click();
      else {
        const potion = page.getByTestId('use-potion');
        if (await potion.isEnabled()) await potion.click();
      }
    }
    // Same ordinary defensive HUD action used in the earlier forest search.
    // The route crosses hostile territory after Morrow; do not wait for
    // critical health before protecting the travelling Paladin.
    if (hp && Number(hp[1]) / Number(hp[2]) < 0.85) {
      const shield = page.locator('[data-paladin-ability="divineShield"]');
      if (await shield.isEnabled()) {
        try { await shield.click({ timeout: 1_500 }); }
        catch (error) { if (!(error instanceof errors.TimeoutError)) throw error; }
      }
    }
    if (await page.getByTestId('death-overlay').count()) {
      throw new Error('Natural Act I evidence search: hero died before map check; seed='
        + await game.getAttribute('data-world-seed') + '; last steps=' + lastSteps.join(' | '));
    }
    // A player can consult the discovered-only map. Do not inspect the
    // generator, reveal fog, or read undiscovered target coordinates.
    if (!knownEvidence && Date.now() >= nextMapCheck) {
      // The onboarding guide can disappear after its last milestone. The
      // ordinary HUD map remains available throughout the wilderness.
      await page.locator('.game-header').getByRole('button', { name: 'Map', exact: true })
        .click({ timeout: 8_000 });
      const map = page.getByTestId('world-map-dialog');
      await expect(map).toBeVisible({ timeout: 8_000 });
      const marker = map.locator('[data-map-marker="act1.evidence_lead"] circle').first();
      if (await marker.count()) {
        const mx = Number(await marker.getAttribute('cx'));
        const my = Number(await marker.getAttribute('cy'));
        if (Number.isFinite(mx) && Number.isFinite(my)) {
          knownEvidence = { x: mx, y: my };
          // New visible objective, not the previous survey waypoint.
          bestDistance = Infinity;
          stalled = 0;
          detours = 0;
          ticks = 0;
        }
      }
      await map.getByTestId('map-close').click();
      nextMapCheck = Date.now() + 10_000;
    }
    // Re-read the player after map/defense actions and use the actual
    // rendered camera origin, not a hero-centered estimate during follow lag.
    const currentX = Number(await game.getAttribute('data-player-x'));
    const currentY = Number(await game.getAttribute('data-player-y'));
    expect(Number.isFinite(currentX) && Number.isFinite(currentY)).toBe(true);
    const destination = knownEvidence ?? waypoints[index]!;
    const distanceBefore = Math.hypot(currentX - destination.x, currentY - destination.y);
    bestDistance = Math.min(bestDistance, distanceBefore);
    let waypoint = destination;
    if (stalled >= 2 && distanceBefore > 32) {
      // After a blocked direct attempt, sample distinct points around the
      // objective, alternating with a new direct attempt. Do not oscillate
      // between two relative offsets as in seed 546989644.
      const attempt = detours++;
      if (attempt % 2 === 0) {
        const turn = Math.floor(attempt / 2);
        const angle = turn * Math.PI * (3 - Math.sqrt(5));
        const radius = Math.min(360, 110 + 45 * Math.floor(turn / 4));
        waypoint = {
          x: Math.max(120, Math.min(2080, destination.x + Math.cos(angle) * radius)),
          y: Math.max(140, Math.min(1250, destination.y + Math.sin(angle) * radius))
        };
      }
    }
    const click = await exposedIsometricClick(canvas, waypoint,
      Math.max(1, Math.min(1500, deadline - Date.now())));
    await page.mouse.click(click.x, click.y, { button: 'middle' });
    // Do not cancel a collision-aware route after a fixed 1.2 s: a route
    // can temporarily move away from the goal to go around a wall.
    // Observe movement until it settles, reaches the survey waypoint or
    // the bounded observation window expires; never extend the search deadline.
    const observationDeadline = Math.min(deadline, Date.now() + 3600);
    let nextX = currentX, nextY = currentY, still = 0;
    while (Date.now() < observationDeadline) {
      await page.waitForTimeout(300);
      if (await inspectIfInReach()) return;
      if (await page.getByTestId('death-overlay').count()) {
        throw new Error('Natural Act I evidence search: hero died during movement; seed='
          + await game.getAttribute('data-world-seed'));
      }
      const observedX = Number(await game.getAttribute('data-player-x'));
      const observedY = Number(await game.getAttribute('data-player-y'));
      expect(Number.isFinite(observedX) && Number.isFinite(observedY)).toBe(true);
      still = Math.hypot(observedX - nextX, observedY - nextY) < 2 ? still + 1 : 0;
      nextX = observedX;
      nextY = observedY;
      if (still >= 3 || Math.hypot(nextX - click.worldX, nextY - click.worldY) < 20) break;
    }
    const distanceAfter = Math.hypot(nextX - destination.x, nextY - destination.y);
    lastSteps.push(index + ': ' + Math.round(currentX) + ',' + Math.round(currentY)
      + ' -> ' + Math.round(nextX) + ',' + Math.round(nextY)
      + ' goal=' + Math.round(destination.x) + ',' + Math.round(destination.y)
      + ' clicked=' + Math.round(click.worldX) + ',' + Math.round(click.worldY)
      + ' remaining=' + Math.round(distanceAfter) + ' detours=' + detours);
    if (lastSteps.length > 8) lastSteps.shift();
    if (distanceAfter < bestDistance - 12) {
      bestDistance = distanceAfter;
      stalled = 0;
    } else {
      stalled++;
    }
    ticks++;
    if (!knownEvidence && (distanceAfter < 32 || ticks >= 9 || detours >= 4)) {
      index = (index + 1) % waypoints.length;
      ticks = 0;
      stalled = 0;
      detours = 0;
      bestDistance = Infinity;
    }
  }
  throw new Error('Natural Act I evidence search timed out at ('
    + await game.getAttribute('data-player-x') + ','
    + await game.getAttribute('data-player-y') + '), waypoint=' + index
    + ', seed=' + await game.getAttribute('data-world-seed')
    + ', inspect attempts=' + inspectAttempts
    + ', discovered evidence=' + JSON.stringify(knownEvidence)
    + ', last steps=' + lastSteps.join(' | ')
    + ', journal=' + await page.locator('.quest-journal').innerText());
}

/** Clear the real crypt guardians and Hollow King encounter from visible HUD.
 * A boss cannot pass this gate by disappearing; the journal AND dungeon clear
 * must be confirmed by the ordinary simulation and renderer.
 */
async function clearCryptNaturally(page: Page, timeoutMs: number): Promise<void> {
  const journal = page.locator('.quest-journal');
  const roster = page.locator('.enemy-roster');
  const dungeon = page.locator('.dungeon-panel');
  const deadline = Date.now() + timeoutMs;
  let lastTargetAt = 0;
  let lastProgressAt = Date.now();
  let previousRoster = '';
  let resumeAfter = 0;
  let resumeAttack = false;
  let focusRegeneratingKing = false;
  let evadedWarning = '';
  let lastEvadeAt = 0;
  const game = page.locator('.game-screen');
  const recent: string[] = [];
  // Read a coherent visible HUD frame in a single browser round trip. The
  // former loop made many serial calls while the boss kept dealing damage,
  // then spent another 700 ms waiting for each skill button's click geometry.
  // Read-only DOM access is not a simulation/debug hook.
  const hud = () => game.evaluate(root => {
    const text = (selector: string) => (root.querySelector(selector) as HTMLElement | null)?.innerText ?? '';
    const ready = (selector: string) => {
      const button = root.querySelector<HTMLButtonElement>(selector);
      return !!button && !button.disabled;
    };
    const vitals = Array.from(root.querySelectorAll<HTMLElement>('.vital-panel .vital-top'));
    const ratio = (value: string) => {
      const match = value.match(/(\d+)\s*\/\s*(\d+)/);
      return match ? [Number(match[1]), Number(match[2])] : null;
    };
    const live = Array.from(root.querySelectorAll<HTMLButtonElement>('.enemy-roster button:not([disabled])'));
    return {
      quest: text('.quest-journal'), chamber: text('.dungeon-panel'),
      warning: text('.dungeon-panel .king-warning'), phase: text('.dungeon-panel .king-phase'),
      roster: text('.enemy-roster').replaceAll('\n', ' '),
      dead: !!root.querySelector('[data-testid="death-overlay"]'),
      hp: ratio(vitals[0]?.innerText ?? ''),
      faith: ratio(vitals[vitals.length - 1]?.innerText ?? ''),
      shieldActive: vitals.some(node => node.innerText.includes('Shield')),
      potion: ready('[data-testid="use-potion"]'),
      heal: ready('[data-paladin-ability="healingLight"]'),
      shield: ready('[data-paladin-ability="divineShield"]'),
      smite: ready('[data-paladin-ability="smite"]'),
      strike: ready('[data-paladin-ability="holyStrike"]'),
      targets: live.map(button => ({
        king: button.innerText.includes('The Hollow King'),
        regenerating: button.innerText.includes('Regenerating'),
        pressed: button.getAttribute('aria-pressed') === 'true'
      }))
    };
  });
  while (Date.now() < deadline) {
    const frame = await hud();
    if (frame.quest.includes('Report to Vesna') && frame.chamber.includes('Crypt cleared')) return;
    if (frame.dead || await page.getByTestId('death-overlay').count()) {
      throw new Error('Natural crypt battle: hero died before Act I boss victory; seed='
        + await game.getAttribute('data-world-seed') + '; player='
        + await game.getAttribute('data-player-x') + ','
        + await game.getAttribute('data-player-y') + '; quest=' + frame.quest
        + '; dungeon=' + frame.chamber + '; roster=' + frame.roster
        + '; recent=' + recent.join(' | '));
    }
    const healthRatio = frame.hp && frame.hp[1]! > 0 ? frame.hp[0]! / frame.hp[1]! : 0;
    const shieldActive = frame.shieldActive;
    const warning = frame.warning;
    const damageWarning = warning !== '' && !warning.includes('Raise the Dead');
    const warningName = warning.split('·')[0]!.trim();
    if (!damageWarning) evadedWarning = '';
    const available = frame.faith?.[0] ?? 0;
    let action = '';
    // Ordinary player keyboard shortcuts are faster than clicking moving HUD
    // buttons under headless render load. Cooldowns, costs and damage still
    // belong to the simulation. Q may be used independently of a class action.
    if (frame.potion && healthRatio < 0.72) {
      await page.keyboard.press('q');
      action = 'potion';
    }
    if (healthRatio < 0.82 && frame.heal) {
      await page.keyboard.press('4');
      action += ' heal';
    } else if (!shieldActive && (damageWarning || healthRatio < 0.85) && frame.shield) {
      await page.keyboard.press('3');
      action += ' shield';
    } else if (!shieldActive && damageWarning && evadedWarning !== warningName
      && Date.now() - lastEvadeAt >= 2500) {
      // Respect the visible telegraph; Space is the normal dodge control.
      // Evade clears auto-attack, so don't rush back into the same warning.
      await page.keyboard.press('Space');
      evadedWarning = warningName;
      lastEvadeAt = Date.now();
      action += ' evade';
    }
    const kings = frame.targets.filter(target => target.king);
    const regenerating = kings.some(target => target.regenerating);
    if (!regenerating || (healthRatio < 0.70 && !shieldActive)) focusRegeneratingKing = false;
    else if (healthRatio >= 0.85 || shieldActive) focusRegeneratingKing = true;
    const preferKing = focusRegeneratingKing && kings.length > 0
      || !frame.targets.some(target => !target.king);
    const candidateState = frame.targets.find(target => target.king === preferKing) ?? frame.targets[0];
    const live = roster.locator('button:not([disabled])');
    const candidate = preferKing ? live.filter({ hasText: 'The Hollow King' }).first()
      : live.filter({ hasNotText: 'The Hollow King' }).first();
    const pressed = candidateState?.pressed ?? null;
    // Keep enough Faith for Healing Light + Divine Shield (27 + 32).
    // Smite and Holy Strike use the actual default slots 6 and 2.
    if (!action && !resumeAttack && Date.now() >= resumeAfter
      && healthRatio >= 0.85 && !damageWarning && pressed === true) {
      if (available >= 83 && frame.smite) {
        await page.keyboard.press('6');
        action = 'smite';
      } else if (available >= 71 && frame.strike) {
        await page.keyboard.press('2');
        action = 'holyStrike';
      }
    }
    if (action && action !== 'potion') {
      resumeAfter = Date.now() + 850;
      resumeAttack = true;
    }
    recent.push('HP=' + (frame.hp?.join('/') ?? '?') + ', Faith=' + (frame.faith?.join('/') ?? '?')
      + ', shield=' + shieldActive + ', warning=' + warning + ', action=' + action
      + ', regenFocus=' + focusRegeneratingKing + ', resume=' + resumeAttack
      + ', phase=' + frame.phase);
    if (recent.length > 20) recent.shift();
    if (frame.roster !== previousRoster) {
      previousRoster = frame.roster;
      lastProgressAt = Date.now();
    } else if (Date.now() - lastProgressAt >= 60_000) {
      throw new Error('Natural crypt battle stalled for 60s; seed='
        + await game.getAttribute('data-world-seed') + '; player='
        + await game.getAttribute('data-player-x') + ','
        + await game.getAttribute('data-player-y') + '; roster='
        + frame.roster + '; dungeon=' + frame.chamber + '; recent=' + recent.join(' | '));
    }
    if (pressed !== null && Date.now() >= resumeAfter
      && !(damageWarning && !shieldActive && evadedWarning === warningName)
      && (resumeAttack || !pressed || Date.now() - lastTargetAt > 10_000)) {
      try {
        await candidate.click({ timeout: 1_500 });
        lastTargetAt = Date.now();
        resumeAttack = false;
      } catch (error) {
        if (!(error instanceof errors.TimeoutError)) throw error;
      }
    }
    await page.waitForTimeout(150);
  }
  throw new Error('Natural crypt battle timed out; seed=' + await game.getAttribute('data-world-seed')
    + '; quest=' + await journal.innerText()
    + '; dungeon=' + await dungeon.innerText() + '; roster='
    + (await roster.innerText()).replaceAll('\n', ' ')
    + '; player=' + await game.getAttribute('data-player-x')
    + ',' + await game.getAttribute('data-player-y')
    + '; recent=' + recent.join(' | '));
}

/** Defeat the unique Act I miniboss through the visible HUD and ordinary
 * player auto-attack/healing. Only the actual boss kill advances the ledger;
 * merely targeting, reaching the marker or waiting cannot pass this check.
 */
async function defeatMorrowNaturally(page: Page, timeoutMs: number): Promise<void> {
  const journal = page.locator('.quest-journal');
  const morrow = page.locator('.enemy-roster button')
    .filter({ hasText: 'Morrow, Graveyard Warden' });
  const deadline = Date.now() + timeoutMs;
  let lastTargetAt = 0;
  let sawTargeting = false;
  while (Date.now() < deadline) {
    const story = await journal.innerText();
    if (story.includes('The Seal of Rot')) return;
    if (await page.getByTestId('death-overlay').count()) {
      throw new Error('Natural Act I Morrow fight: the hero died before the Seal of Rot quest');
    }
    const hpText = await page.locator('.vital-top').first().innerText();
    const hp = hpText.match(/(\d+)\s*\/\s*(\d+)/);
    if (hp && Number(hp[1]) / Number(hp[2]) < 0.73) {
      const heal = page.locator('[data-paladin-ability="healingLight"]');
      if (await heal.isEnabled()) await heal.click();
      else {
        const potion = page.getByTestId('use-potion');
        if (await potion.isEnabled()) await potion.click();
      }
    }

    const aliveBoss = page.locator('.enemy-roster button:not([disabled])')
      .filter({ hasText: 'Morrow, Graveyard Warden' });
    if (await aliveBoss.count() === 0) {
      // A dead Morrow must cause an authoritative quest transition, not be
      // counted as success merely because the target disappeared.
      await page.waitForTimeout(400);
      continue;
    }
    const targeted = await morrow.getAttribute('aria-pressed') === 'true';
    sawTargeting ||= targeted;
    if (!targeted || Date.now() - lastTargetAt > 10_000) {
      try {
        await morrow.click({ timeout: 1_500 });
        lastTargetAt = Date.now();
      } catch (error) {
        // Live targets can die or become temporarily disabled as the
        // simulation advances; never suppress unrelated click failures.
        if (!(error instanceof errors.TimeoutError)) throw error;
      }
    }
    await page.waitForTimeout(400);
  }
  throw new Error('Natural Act I Morrow fight timed out; target was selected: '
    + sawTargeting + '; journal: ' + await journal.innerText()
    + '; enemy roster: ' + (await page.locator('.enemy-roster').innerText()).replaceAll('\n', ' '));
}

/** Log actual stage latency without modifying game time, polling or assertions. */
async function timedNaturalStage(name: string, operation: () => Promise<void>): Promise<void> {
  const started = Date.now();
  let status = 'failed';
  try {
    await test.step(name, operation);
    status = 'passed';
  } finally {
    console.log('[act-i-stage] ' + JSON.stringify({
      name, status, durationMs: Date.now() - started
    }));
  }
}

test('Issue #125 — natural first Act I loop: Warden, movement, combat, loot, equip, turn-in', async ({ page }) => {
  // Continuous natural run: real first quest, corruption, boar hunt, graveyard,
  // then a fresh real Save/Load proving the unique Morrow encounter persists.
  test.setTimeout(900_000);
  // A missing HUD control must fail at the specific action, not consume
  // the entire fifteen-minute playthrough allowance.
  page.setDefaultTimeout(8_000);
  await page.goto('./');
  await page.locator('#menu-language').selectOption('en');
  await openCharacterCreation(page);
  await page.getByRole('button', { name: /Paladin/ }).click();
  await page.getByRole('button', { name: 'Enter the world' }).click();

  const game = page.locator('.game-screen');
  const guide = page.getByTestId('onboarding-guide');
  await expect(guide).toHaveAttribute('data-guide-step', 'warden');
  await page.getByRole('button', { name: 'Speak to the warden' }).click();
  const warden = page.getByRole('dialog', { name: 'Warden Vesna' });
  await expect(warden).toBeVisible();
  await warden.getByRole('button', { name: 'Accept quest' }).click();
  await warden.getByRole('button', { name: 'Leave' }).click();
  expect(await activeQuestCount(page)).toBe(0);

  // Real left-click walk (not a simulation command) followed by real roster combat.
  const canvas = page.locator('.phaser-container canvas');
  const startX = Number(await game.getAttribute('data-player-x'));
  const firstClick = await campMovementTarget(page, canvas);
  await expect(canvas).toHaveCSS('cursor', 'crosshair');
  await page.mouse.click(firstClick.x, firstClick.y);
  await expect.poll(async () => Math.abs(
    Number(await game.getAttribute('data-player-x')) - startX
  ), { timeout: 8_000 }).toBeGreaterThan(14);

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.enemy-roster button:not([disabled])').first()).toBeEnabled();
  await timedNaturalStage('starter first kill', () => keepFighting(page, 1, 45_000));
  await expect(guide).toHaveAttribute('data-guide-step', 'loot');
  const loot = page.getByTestId('nearby-loot');
  await expect(loot).toBeVisible({ timeout: 10_000 });
  const target = loot.locator('[data-loot-id]').first();
  const lootId = await target.getAttribute('data-loot-id');
  expect(lootId).not.toBeNull();
  // The nearby list is distance-sorted and can gain a closer drop during
  // combat. Resolve the click by the SAME ID used in the assertion.
  const chosenDrop = loot.locator('[data-loot-id="' + lootId + '"]');
  await chosenDrop.click();
  await expect(chosenDrop).toHaveCount(0, { timeout: 12_000 });

  await page.locator('[data-quick-action="inventory"]').click();
  const inventory = page.getByRole('dialog', { name: 'Inventory & Equipment' });
  await expect(inventory).toBeVisible();
  const bag = inventory.locator('.bag-slot.occupied');
  await expect(bag.first()).toBeVisible();
  // This item was genuinely looted from a defeated enemy, not purchased or
  // placed into the test via GameBridge. Preserve its canonical identity.
  const lootedItemId = await bag.first().getAttribute('data-item-id');
  expect(lootedItemId).toBeTruthy();
  await bag.first().click();
  const equip = inventory.getByRole('button', { name: 'Equip', exact: true });
  await expect(equip).toBeEnabled();
  await equip.click();

  // Regression: a real acquired item must be able to leave and re-enter its
  // equipment socket. Confirm a true unequip + native HTML5 drag, preserving
  // identity rather than accepting just a visual highlight of a valid slot.
  // Select by stable ID instead of presentation label or arbitrary item icon.
  const slotWithLoot = inventory.locator('.equipment-slot[data-item-id="' + lootedItemId + '"]');
  await expect(slotWithLoot).toHaveCount(1);
  const slotName = await slotWithLoot.getAttribute('data-equipment-slot');
  expect(slotName).toBeTruthy();
  await slotWithLoot.click();
  await inventory.getByTestId('item-inspector')
    .getByRole('button', { name: 'Unequip', exact: true }).click();
  const returnedLoot = inventory.locator('.bag-slot[data-item-id="' + lootedItemId + '"]');
  await expect(returnedLoot).toHaveCount(1);
  const gearDestination = inventory.locator('[data-equipment-slot="' + slotName + '"]');
  await expect(gearDestination).not.toHaveClass(/has-item/);
  await returnedLoot.dragTo(gearDestination);
  await expect(gearDestination).toHaveAttribute('data-item-id', lootedItemId!);
  await expect(returnedLoot).toHaveCount(0);
  await inventory.locator('.close-button').click();
  await expect(guide).toHaveAttribute('data-guide-step', 'objective');

  await timedNaturalStage('starter hunt', () => keepFighting(page, 3, 50_000));
  await expect(guide).toHaveAttribute('data-guide-step', 'return');
  await expect(page.locator('.quest-journal')).toContainText('Return to Warden Vesna');

  // UI NPC button sends the same natural auto-approach as a world click.
  await page.getByRole('button', { name: 'Speak to the warden' }).click();
  await expect(warden).toBeVisible({ timeout: 18_000 });
  await warden.getByRole('button', { name: 'Complete quest' }).click();
  await warden.getByRole('button', { name: 'Leave' }).click();
  // Turn-in immediately starts the next genuine Act I objective;
  // the journal correctly replaces the completed starter quest.
  await expect(page.locator('.quest-journal')).toContainText('Trail of Black Ash');
  await expect(guide).toHaveAttribute('data-guide-step', 'story');
  await expect(guide).toContainText('Investigate the corruption site');
  await expect(guide.getByTestId('onboarding-xp')).toContainText(/Level \d+ · XP \d+\/\d+/);

  // The optional guide opens the same discovered-only map as the HUD;
  // it does not reveal any future quest coordinate or mutate progression.
  await guide.getByRole('button', { name: 'View discovered map' }).click();
  const map = page.getByTestId('world-map-dialog');
  await expect(map).toBeVisible();
  // Optional discoveries are permitted when the hero actually passed near
  // them. Record the *discovered set*, not an invalid zero-marker assumption.
  const optionalBeforeSave = await map.locator('[data-marker-kind="optionalPoi"]')
    .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-map-marker')).sort());
  await map.getByTestId('map-close').click();
  await expect(guide).toHaveAttribute('data-guide-step', 'story');

  // The *current* objective is localized live, not a stale Warden message.
  await page.locator('#game-language').selectOption('cs');
  await expect(guide).toContainText('Prozkoumej ohnisko korupce');
  await expect(guide.getByRole('button', { name: 'Zobrazit objevenou mapu' })).toBeVisible();
  await page.locator('#game-language').selectOption('en');

  // Regression guard: a genuine first-quest turn-in must survive a character
  // save without changing XP, gold or the active story objective. No test-only
  // bridge commands or fabricated character/quest state are involved.
  // The actual item equipped from ground loot must retain its identity and
  // slot after reload, not merely survive as a duplicated bag item.
  await page.locator('[data-quick-action="inventory"]').click();
  const gearBeforeSave = await inventory.locator('.equipment-slot.has-item')
    .evaluateAll(nodes => nodes.map(node => ({
      slot: node.getAttribute('data-equipment-slot'),
      label: node.getAttribute('aria-label')
    })));
  expect(gearBeforeSave.length).toBeGreaterThan(0);
  await inventory.locator('.close-button').click();

  const progressBeforeSave = await guide.getByTestId('onboarding-xp').innerText();
  const hudBeforeSave = await page.locator('.hud-details span').allTextContents();
  const journalProgress = page.locator('.quest-journal strong, .quest-journal .quest-progress');
  const objectiveBeforeSave = await journalProgress.allTextContents();
  expect(await game.getAttribute('data-zone')).toBe('wilderness');
  // Optional POIs legitimately discovered during combat are visible in the
  // minimap; map IDs before/after reload are compared below.

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText('Hero saved');
  await page.reload();
  await loadCharacterControl(page).click();
  await expect(guide.getByTestId('onboarding-xp')).toHaveText(progressBeforeSave);
  await expect(page.locator('.hud-details span')).toHaveText(hudBeforeSave);
  await expect(journalProgress).toHaveText(objectiveBeforeSave);
  await page.locator('[data-quick-action="inventory"]').click();
  const gearAfterSave = await inventory.locator('.equipment-slot.has-item')
    .evaluateAll(nodes => nodes.map(node => ({
      slot: node.getAttribute('data-equipment-slot'),
      label: node.getAttribute('aria-label')
    })));
  expect(gearAfterSave).toEqual(gearBeforeSave);
  await inventory.locator('.close-button').click();
  await expect(game).toHaveAttribute('data-zone', 'wilderness');

  // Reloaded map must still reveal only discovered locations. The active
  // story hint cannot accidentally turn future quest markers into spoilers.
  await guide.getByRole('button', { name: 'View discovered map' }).click();
  await expect(map).toBeVisible();
  await expect(map.locator('[data-fog="unexplored"]').first()).toBeVisible();
  const optionalAfterLoad = await map.locator('[data-marker-kind="optionalPoi"]')
    .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-map-marker')).sort());
  expect(optionalAfterLoad).toEqual(optionalBeforeSave);
  await map.getByTestId('map-close').click();
  // Turn-in immediately starts the next genuine Act I objective;
  // the journal correctly replaces the completed starter quest.
  await expect(page.locator('.quest-journal')).toContainText('Trail of Black Ash');
  await expect(guide).toHaveAttribute('data-guide-step', 'story');
  await expect(guide).toContainText('Investigate the corruption site');
  await expect(guide.getByTestId('onboarding-xp')).toContainText(/Level \d+ · XP \d+\/\d+/);
  // Continue using actual player movement after loading the genuine quest save.
  // The corruption-site discovery must grant its reward exactly once and
  // automatically activate the next story quest, not a second Vesna turn-in.
  await timedNaturalStage('corruption exploration', () => walkToCorruptionSite(page, 110_000));
  await expect(page.locator('.quest-journal')).toContainText('The Blighted Pack');
  await expect(page.locator('.quest-journal')).toContainText('Defeat three corrupted boars');
  await expect(game).toHaveAttribute('data-zone', 'wilderness');
  // The journey may legitimately discover optional POIs on the travelled
  // path; only the unexplored region's secrets must remain hidden.

  // A real enemy kill, not crossing a marker, advances this hunt. Finish the
  // existing pack through the same visible combat roster. Once the last
  // enemy falls the simulation spawns its actual three-corrupted-boar wave.
  // The objective cannot advance from ordinary skeleton/wolf/wraith kills.
  await expect(page.locator('.quest-journal')).toContainText('0/3');
  await timedNaturalStage('boar hunt', () => keepFighting(page, 3, 105_000, 'The Forgotten Graves'));
  await expect(page.locator('.quest-journal')).toContainText('Forgotten Graves');
  await expect(page.locator('.quest-journal')).toContainText('graveyard');
  await expect(page.locator('.quest-journal')).not.toContainText('The Blighted Pack');
  await expect(game).toHaveAttribute('data-zone', 'wilderness');

  // A completed story-hunt reward must be committed with the new quest.
  // Reload via the ordinary Save/Load controls, not a restored fixture,
  // and ensure the unlocked objective, stats and looted gear ID persist.
  const afterHuntHud = await page.locator('.hud-details span').allTextContents();
  const afterHuntProgress = await guide.getByTestId('onboarding-xp').innerText();
  const afterHuntObjective = await journalProgress.allTextContents();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText('Hero saved');
  await page.reload();
  await loadCharacterControl(page).click();
  await expect(page.locator('.quest-journal')).toContainText('Forgotten Graves');
  await expect(page.locator('.quest-journal')).not.toContainText('The Blighted Pack');
  await expect(journalProgress).toHaveText(afterHuntObjective);
  await expect(page.locator('.hud-details span')).toHaveText(afterHuntHud);
  await expect(guide.getByTestId('onboarding-xp')).toHaveText(afterHuntProgress);
  await page.locator('[data-quick-action="inventory"]').click();
  await expect(inventory.locator('.equipment-slot[data-item-id="' + lootedItemId + '"]'))
    .toHaveCount(1);
  await inventory.locator('.close-button').click();
  await expect(game).toHaveAttribute('data-zone', 'wilderness');

  // The next story objective is a location discovery, not an enemy kill:
  // Morrow must not already exist before the real graveyard is found.
  const morrow = page.locator('.enemy-roster button')
    .filter({ hasText: 'Morrow, Graveyard Warden' });
  await expect(morrow).toHaveCount(0);
  await expect(page.locator('.quest-journal')).toContainText('Discover the abandoned graveyard');
  await timedNaturalStage('graveyard exploration', () => walkToAbandonedGraveyard(page, 130_000));
  await expect(page.locator('.quest-journal')).toContainText('Morrow, Gravebound');
  await expect(page.locator('.quest-journal')).toContainText('Defeat Morrow at the graveyard');
  await expect(page.locator('.quest-journal')).not.toContainText('The Forgotten Graves');
  await expect(morrow).toHaveCount(1, { timeout: 15_000 });
  await expect(morrow).toHaveAttribute('data-threat', 'boss');
  await expect(morrow).toBeEnabled();

  // Recreate the transient world from the character-only save. The real
  // previously discovered story location must remain completed, the next
  // boss quest active, and the unique actor must respawn exactly once.
  const afterGravesHud = await page.locator('.hud-details span').allTextContents();
  const afterGravesProgress = await guide.getByTestId('onboarding-xp').innerText();
  const afterGravesObjective = await journalProgress.allTextContents();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText('Hero saved');
  await page.reload();
  await loadCharacterControl(page).click();
  await expect(game).toHaveAttribute('data-zone', 'wilderness');
  await expect(page.locator('.quest-journal')).toContainText('Morrow, Gravebound');
  await expect(page.locator('.quest-journal')).not.toContainText('The Forgotten Graves');
  await expect(journalProgress).toHaveText(afterGravesObjective);
  await expect(page.locator('.hud-details span')).toHaveText(afterGravesHud);
  await expect(guide.getByTestId('onboarding-xp')).toHaveText(afterGravesProgress);
  await expect(morrow).toHaveCount(1, { timeout: 15_000 });
  await expect(morrow).toHaveAttribute('data-threat', 'boss');
  await page.locator('[data-quick-action="inventory"]').click();
  await expect(inventory.locator('.equipment-slot[data-item-id="' + lootedItemId + '"]'))
    .toHaveCount(1);
  await inventory.locator('.close-button').click();

  // A genuine boss kill, not the earlier discovery or a mere target click,
  // must unlock the next authoritative story beat. Morrow has a real
  // two-phase miniboss plan and cannot be marked slain from UI test state.
  await expect(page.locator('.quest-journal'))
    .toContainText('Defeat Morrow at the graveyard');
  await expect(morrow).toBeEnabled();
  await timedNaturalStage('Morrow battle', () => defeatMorrowNaturally(page, 150_000));
  await expect(page.locator('.quest-journal')).toContainText('The Seal of Rot');
  await expect(page.locator('.quest-journal'))
    .toContainText('Recover evidence leading to the crypt');
  await expect(page.locator('.quest-journal')).not.toContainText('Morrow, Gravebound');
  await expect(morrow).not.toBeEnabled();

  // Reload the genuine character after the unique miniboss reward. A
  // completed boss may never respawn or award its one-time reward again.
  const afterMorrowHud = await page.locator('.hud-details span').allTextContents();
  const afterMorrowXp = await guide.getByTestId('onboarding-xp').innerText();
  const afterMorrowJournal = await journalProgress.allTextContents();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText('Hero saved');
  await page.reload();
  await loadCharacterControl(page).click();
  await expect(game).toHaveAttribute('data-zone', 'wilderness');
  await expect(page.locator('.quest-journal')).toContainText('The Seal of Rot');
  await expect(page.locator('.quest-journal')).not.toContainText('Morrow, Gravebound');
  await expect(journalProgress).toHaveText(afterMorrowJournal);
  await expect(page.locator('.hud-details span')).toHaveText(afterMorrowHud);
  await expect(guide.getByTestId('onboarding-xp')).toHaveText(afterMorrowXp);
  await expect(morrow).toHaveCount(0);
  await page.locator('[data-quick-action="inventory"]').click();
  await expect(inventory.locator('.equipment-slot[data-item-id="' + lootedItemId + '"]'))
    .toHaveCount(1);
  await inventory.locator('.close-button').click();

  // Evidence is an explicit player interaction: walking through the site is
  // insufficient to complete Seal of Rot. No hidden feature coordinate is
  // looked up; the quest panel exposes its action only within reach.
  await expect(page.locator('.quest-journal'))
    .toContainText('Recover evidence leading to the crypt');
  // Complete the actual inspection inside the search deadline, while
  // standing in range, rather than returning on transient button visibility.
  await timedNaturalStage('story evidence', () => walkToStoryEvidence(page, 135_000));
  const evidence = page.getByTestId('story-inspect-evidence');
  await expect(page.locator('.quest-journal')).toContainText('Descent into the Crypt');
  await expect(page.locator('.quest-journal')).toContainText('Enter the crypt');
  await expect(page.locator('.quest-journal')).not.toContainText('The Seal of Rot');

  // A fifth real Save/Load proves the evidence action is one-shot, the new
  // quest is authoritative, and the earlier looted equipment keeps its ID.
  const afterEvidenceHud = await page.locator('.hud-details span').allTextContents();
  const afterEvidenceXp = await guide.getByTestId('onboarding-xp').innerText();
  const afterEvidenceJournal = await journalProgress.allTextContents();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText('Hero saved');
  await page.reload();
  await loadCharacterControl(page).click();
  await expect(game).toHaveAttribute('data-zone', 'wilderness');
  await expect(page.locator('.quest-journal')).toContainText('Descent into the Crypt');
  await expect(page.locator('.quest-journal')).not.toContainText('The Seal of Rot');
  await expect(journalProgress).toHaveText(afterEvidenceJournal);
  await expect(page.locator('.hud-details span')).toHaveText(afterEvidenceHud);
  await expect(guide.getByTestId('onboarding-xp')).toHaveText(afterEvidenceXp);
  await expect(evidence).toHaveCount(0);
  await page.locator('[data-quick-action="inventory"]').click();
  await expect(inventory.locator('.equipment-slot[data-item-id="' + lootedItemId + '"]'))
    .toHaveCount(1);
  await inventory.locator('.close-button').click();

  // Enter through the visible in-game dungeon button; the simulation owns
  // the approach/path and zone transition. Never teleport or mutate quests.
  await page.getByRole('button', { name: 'Enter the crypt' }).click();
  await expect(game).toHaveAttribute('data-zone', 'crypt', { timeout: 55_000 });
  await expect(page.locator('.quest-journal')).toContainText('The Crypt Lord Falls');
  await expect(page.locator('.quest-journal')).toContainText('Defeat the Crypt Lord');
  await expect(page.locator('.quest-journal')).not.toContainText('Descent into the Crypt');

  // The genuine crypt guardian wave and the three-phase Hollow King battle
  // must finish before the authoritative quest allows the final report.
  await timedNaturalStage('crypt boss battle', () => clearCryptNaturally(page, 240_000));
  await expect(page.locator('.quest-journal')).toContainText('Report to Vesna');
  await expect(page.locator('.quest-journal')).toContainText('Speak to Vesna in town');
  await expect(page.locator('.dungeon-panel')).toContainText('Crypt cleared');

  // Normal UI portal auto-approach; no debug teleport or forced zone edit.
  await page.getByRole('button', { name: 'Return to camp' }).click();
  try {
    await expect(game).toHaveAttribute('data-zone', 'wilderness', { timeout: 80_000 });
  } catch {
    throw new Error('Real crypt portal auto-approach failed at ('
      + await game.getAttribute('data-player-x') + ','
      + await game.getAttribute('data-player-y') + '), zone='
      + await game.getAttribute('data-zone') + ', dungeon='
      + (await page.locator('.dungeon-panel').innerText()).replaceAll('\n', ' '));
  }
  await expect(page.locator('.quest-journal')).toContainText('Report to Vesna');
  await page.getByRole('button', { name: 'Speak to the warden' }).click();
  const finalWarden = page.getByRole('dialog', { name: 'Warden Vesna' });
  await expect(finalWarden).toBeVisible({ timeout: 25_000 });
  // The Act I finale is reached via Vesna's visible dialogue tree, not the
  // starter quest's root-level Complete quest button.
  await finalWarden.getByRole('button', { name: 'Threat Beyond the Gate' }).click();
  await finalWarden.getByRole('button', { name: 'Vesna awaits your final report.' }).click();
  const report = finalWarden.getByRole('button', { name: 'Deliver the report' });
  await expect(report).toBeEnabled();
  await report.click();
  await finalWarden.getByRole('button', { name: 'Leave' }).click();
  await expect(page.locator('.quest-journal')).toContainText('Act I complete');
  await expect(page.locator('.quest-journal')).not.toContainText('Report to Vesna');

  // Save & reload through actual UI: completion cannot duplicate rewards,
  // lose item identity, or restart the finished story.
  const completedHud = await page.locator('.hud-details span').allTextContents();
  const completedXp = await guide.getByTestId('onboarding-xp').innerText();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText('Hero saved');
  await page.reload();
  await loadCharacterControl(page).click();
  await expect(game).toHaveAttribute('data-zone', 'wilderness');
  await expect(page.locator('.quest-journal')).toContainText('Act I complete');
  await expect(page.locator('.quest-journal')).not.toContainText('Report to Vesna');
  await expect(page.locator('.hud-details span')).toHaveText(completedHud);
  await expect(guide.getByTestId('onboarding-xp')).toHaveText(completedXp);
  await page.locator('[data-quick-action="inventory"]').click();
  await expect(inventory.locator('.equipment-slot[data-item-id="' + lootedItemId + '"]'))
    .toHaveCount(1);
  await inventory.locator('.close-button').click();

});

test.describe('touch input', () => {
  test.use({ hasTouch: true });
  test('Issue #125 — touch loot affordance is reachable without canvas pinpoint', async ({ page }) => {
  test.setTimeout(85_000);
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto('./');
  await page.locator('#menu-language').selectOption('cs');
  await openCharacterCreation(page);
  await page.getByRole('button', { name: /Paladin/ }).click();
  await page.getByRole('button', { name: 'Vstoupit do světa' }).click();
  await expect(page.locator('canvas[data-renderer="isometric-preview"]')).toBeVisible();
  await page.getByRole('button', { name: 'Promluvit se strážkyní' }).click();
  const dialog = page.getByRole('dialog', { name: 'Strážkyně Vesna' });
  await dialog.getByRole('button', { name: 'Přijmout úkol' }).click();
  await dialog.getByRole('button', { name: 'Odejít' }).click();
  const target = page.locator('.enemy-roster button:not([disabled])').first();
  await target.tap();
  await expect.poll(() => activeQuestCount(page), { timeout: 55_000 })
    .toBeGreaterThan(0);
  const loot = page.getByTestId('nearby-loot');
  const lootId = await loot.locator('[data-loot-id]').first().getAttribute('data-loot-id');
  expect(lootId).not.toBeNull();
  // Pin identity before any asynchronous viewport or geometry checks.
  const button = loot.locator('[data-loot-id="' + lootId + '"]');
  await expect(button).toBeInViewport({ ratio: 0.85 });
  const bounds = await button.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.height).toBeGreaterThanOrEqual(43);
  await button.tap();
  await expect(button).toHaveCount(0, { timeout: 12_000 });
  await page.locator('[data-quick-action="inventory"]').tap();
  await expect(page.getByRole('dialog', { name: 'Inventář a výbava' })).toBeVisible();
});

});
