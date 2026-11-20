// GPL-3.0-only — isolated Wave D / Agent 22 acceptance tests.
import { describe, expect, it } from 'vitest';
import { CAMP, CAMP_RADIUS, generateWorld } from '../../src/game/world/generator';
import { ACTOR_RADIUS, canOccupy, findPath, WORLD_HEIGHT } from '../../src/game/world/navigation';
import { WARDEN_ID } from '../../src/game/quests/firstQuest';
import {
  BLACKSMITH_ID, MERCHANT_ID, NPC_INTERACT_RANGE, NPC_POSITIONS
} from '../../src/game/world/npcs';
import {
  canInteractTownEntry, getTownManifest, isTownSafePoint, townEntry,
  townServiceFor, validateTownLayout,
  type TownEntry, type TownLayout, type TownServiceRole
} from '../../src/game/world/townManifest';

const allRoles: readonly TownServiceRole[] = [
  'quest', 'weaponMerchant', 'blacksmith', 'potionVendor',
  'healer', 'stash', 'waypoint', 'civilian'
];

const layoutFor = (seed = 0): TownLayout => ({
  center: { ...CAMP },
  radius: CAMP_RADIUS,
  spawn: { ...CAMP },
  obstacles: generateWorld(seed).obstacles,
  entries: getTownManifest()
});

function errorCodes(layout: unknown): string[] {
  return validateTownLayout(layout).map(issue => issue.code);
}

function changedEntry(layout: TownLayout, id: string, patch: Partial<TownEntry>): TownLayout {
  return {
    ...layout,
    entries: layout.entries.map(entry => entry.id === id ? { ...entry, ...patch } : entry)
  };
}

describe('Agent 22 — deterministic permanent camp town manifest', () => {
  it('has every required service role and at least three decorative civilians', () => {
    const entries = getTownManifest();
    expect(entries).toHaveLength(10);
    expect(new Set(entries.map(entry => entry.id)).size).toBe(entries.length);
    expect(entries.every(entry => /^[a-z][a-z0-9_]*$/.test(entry.id))).toBe(true);
    for (const role of allRoles) {
      expect(entries.some(entry => entry.role === role), role).toBe(true);
    }
    for (const role of allRoles.filter(role => role !== 'civilian')) {
      expect(entries.filter(entry => entry.role === role)).toHaveLength(1);
    }
    expect(entries.filter(entry => entry.role === 'civilian')).toHaveLength(3);
    expect(entries.every(entry => entry.nameKey.startsWith('town.entry.')
      && entry.descriptionKey.startsWith('town.entry.'))).toBe(true);
    expect(entries.every(entry => entry.nameKey.endsWith('.name')
      && entry.descriptionKey.endsWith('.description'))).toBe(true);
    expect(entries.every(entry => entry.interactionRange > 0 && entry.collisionRadius > 0)).toBe(true);
  });

  it('preserves existing NPC IDs, exact coordinates and existing interaction reach', () => {
    const historic = [
      [WARDEN_ID, 'quest'],
      [MERCHANT_ID, 'weaponMerchant'],
      [BLACKSMITH_ID, 'blacksmith']
    ] as const;
    for (const [id, role] of historic) {
      const entry = townEntry(id);
      expect(entry).not.toBeNull();
      expect(entry!.role).toBe(role);
      expect(entry!.position).toEqual(NPC_POSITIONS[id]);
      expect(entry!.interactionRange).toBe(NPC_INTERACT_RANGE);
      expect(entry!.capability).toBe('existing');
      expect(townServiceFor(id)).toBe(role);
    }
    for (const role of ['potionVendor', 'healer', 'stash', 'waypoint']) {
      const entry = getTownManifest().find(item => item.role === role);
      expect(entry?.capability).toBe('planned');
    }
    expect(getTownManifest().filter(entry => entry.role === 'civilian')
      .every(entry => entry.capability === 'decorative')).toBe(true);
  });

  it.each([0, 1, 42, 0x12345678, 0xffffffff])(
    'stays constant and navigable with world seed %s', seed => {
      const layout = layoutFor(seed);
      expect(layout.center).toEqual(CAMP);
      expect(layout.radius).toBe(CAMP_RADIUS);
      expect(getTownManifest()).toEqual(layoutFor(0).entries);
      expect(errorCodes(layout)).toEqual([]);
      for (const entry of layout.entries) {
        expect(isTownSafePoint(entry.position), entry.id).toBe(true);
        expect(Math.hypot(entry.position.x - CAMP.x, entry.position.y - CAMP.y)
          + entry.collisionRadius).toBeLessThanOrEqual(CAMP_RADIUS);
        expect(canOccupy(entry.position, ACTOR_RADIUS + entry.collisionRadius, layout.obstacles), entry.id)
          .toBe(true);
        expect(findPath(layout.spawn, entry.position, ACTOR_RADIUS, layout.obstacles).length, entry.id)
          .toBeGreaterThan(0);
      }
    }
  );

  it('recognizes the original circular safe zone, including its boundary, and rejects invalid points', () => {
    expect(isTownSafePoint(CAMP)).toBe(true);
    expect(isTownSafePoint({ x: CAMP.x + CAMP_RADIUS, y: CAMP.y })).toBe(true);
    expect(isTownSafePoint({ x: CAMP.x + CAMP_RADIUS + 0.01, y: CAMP.y })).toBe(false);
    for (const bad of [null, undefined, {}, { x: NaN, y: CAMP.y },
      { x: Infinity, y: CAMP.y }, { x: CAMP.x, y: -Infinity }, { x: '390', y: 470 }]) {
      expect(isTownSafePoint(bad)).toBe(false);
    }
    // Combat/no-damage policy belongs to the integrator and GameSimulation.
  });

  it('requires interaction range for existing and planned entries, never auto-interacting at a distance', () => {
    for (const entry of getTownManifest()) {
      const { x, y } = entry.position;
      expect(canInteractTownEntry({ x, y }, entry.id), entry.id).toBe(true);
      expect(canInteractTownEntry({ x: x + entry.interactionRange, y }, entry.id), entry.id).toBe(true);
      expect(canInteractTownEntry({ x: x + entry.interactionRange + 0.1, y }, entry.id), entry.id).toBe(false);
      expect(canInteractTownEntry({ x: 1400, y: 1100 }, entry.id), entry.id).toBe(false);
    }
    expect(canInteractTownEntry({ x: WARDEN_ID.length, y: 0 }, WARDEN_ID)).toBe(false);
    expect(canInteractTownEntry(CAMP, '__proto__')).toBe(false);
    expect(canInteractTownEntry(CAMP, null)).toBe(false);
    expect(canInteractTownEntry(null, WARDEN_ID)).toBe(false);
    expect(canInteractTownEntry({ x: NaN, y: CAMP.y }, WARDEN_ID)).toBe(false);
    expect(canInteractTownEntry({ x: Infinity, y: CAMP.y }, WARDEN_ID)).toBe(false);
  });

  it('never exposes the authoritative manifest for external mutation', () => {
    const original = getTownManifest();
    const mutable = getTownManifest() as unknown as Array<{ id: string; position: { x: number; y: number } }>;
    mutable[0]!.id = 'hijacked';
    mutable[0]!.position.x = -500;
    mutable.splice(1, 2);
    expect(getTownManifest()).toEqual(original);

    const entry = townEntry(WARDEN_ID)! as unknown as { position: { x: number; y: number } };
    entry.position.x = 10000;
    expect(townEntry(WARDEN_ID)!.position).toEqual(NPC_POSITIONS[WARDEN_ID]);
    expect(townEntry('__proto__')).toBeNull();
    expect(townEntry(null)).toBeNull();
    expect(townEntry({ id: WARDEN_ID })).toBeNull();
    expect(townServiceFor('unknown')).toBeNull();
    expect(townServiceFor(NaN)).toBeNull();
  });

  it('reports duplicate IDs, missing services, overlaps and spawn interference', () => {
    const layout = layoutFor();
    expect(errorCodes({ ...layout, entries: [...layout.entries, layout.entries[0]!] }))
      .toContain('duplicateId');
    expect(errorCodes({ ...layout, entries: layout.entries.filter(entry => entry.role !== 'healer') }))
      .toContain('missingRole');
    expect(errorCodes(changedEntry(layout, 'stash_camp', {
      position: { ...NPC_POSITIONS[MERCHANT_ID] }
    }))).toContain('entryOverlap');
    expect(errorCodes(changedEntry(layout, 'stash_camp', {
      position: { ...CAMP }
    }))).toContain('spawnOverlap');
    expect(errorCodes(changedEntry(layout, WARDEN_ID, {
      position: { x: 445, y: 415 }
    }))).toContain('legacyPosition');
    expect(errorCodes(changedEntry(layout, WARDEN_ID, {
      role: 'civilian'
    }))).toContain('legacyRole');
  });

  it('rejects blocked and unreachable service positions without mutating obstacles', () => {
    const layout = layoutFor(1);
    const healer = townEntry('healer_iva')!;
    const blocked = {
      ...layout,
      obstacles: [...layout.obstacles,
        { id: 'blocked-test', x: healer.position.x - 8, y: healer.position.y - 8, width: 16, height: 16 }]
    };
    const untouched = structuredClone(blocked);
    expect(errorCodes(blocked)).toContain('blockedPoint');
    expect(blocked).toEqual(untouched);

    const isolated = {
      ...layout,
      obstacles: [...layout.obstacles,
        { id: 'wall-separator', x: 299, y: 0, width: 29, height: WORLD_HEIGHT }]
    };
    expect(canOccupy(townEntry('waypoint_camp')!.position, ACTOR_RADIUS, isolated.obstacles)).toBe(true);
    expect(errorCodes(isolated)).toContain('unreachable');
  });

  it('validates world bounds, canonical safe zone, identifiers, keys and finite numeric values', () => {
    const layout = layoutFor();
    expect(errorCodes(changedEntry(layout, 'civilian_lio', {
      position: { x: 1000, y: 1000 }
    }))).toContain('outsideSafeZone');
    expect(errorCodes(changedEntry(layout, 'civilian_lio', {
      position: { x: -10, y: 30 }
    }))).toContain('outsideWorld');
    expect(errorCodes(changedEntry(layout, 'civilian_lio', {
      position: { x: NaN, y: Infinity }
    }))).toContain('invalidPosition');
    expect(errorCodes(changedEntry(layout, 'civilian_lio', {
      interactionRange: -1
    }))).toContain('invalidRange');
    expect(errorCodes(changedEntry(layout, 'civilian_lio', {
      collisionRadius: Infinity
    }))).toContain('invalidRadius');
    expect(errorCodes(changedEntry(layout, 'civilian_lio', {
      id: '../evil'
    }))).toContain('invalidId');
    expect(errorCodes(changedEntry(layout, 'civilian_lio', {
      nameKey: ''
    }))).toContain('invalidKey');
    expect(errorCodes(changedEntry(layout, 'civilian_lio', {
      capability: 'existing'
    }))).toContain('invalidCapability');
    expect(errorCodes({ ...layout, center: { x: CAMP.x + 1, y: CAMP.y } })).toContain('invalidCamp');
    expect(errorCodes({ ...layout, radius: CAMP_RADIUS + 1 })).toContain('invalidCamp');
    expect(errorCodes({ ...layout, spawn: { x: Infinity, y: 4 } })).toContain('invalidSpawn');
    expect(errorCodes({ ...layout, obstacles: [{ id: 'bad', x: 3, y: 4, width: -5, height: 20 }] }))
      .toContain('invalidObstacle');
    expect(errorCodes(null)).toContain('invalidLayout');
    expect(errorCodes({})).toContain('invalidLayout');
  });

  it('does not change deeply frozen inputs and returns machine-readable validation errors', () => {
    const baseline = layoutFor();
    const frozen = Object.freeze({
      center: Object.freeze({ ...baseline.center }),
      radius: baseline.radius,
      spawn: Object.freeze({ ...baseline.spawn }),
      obstacles: Object.freeze(baseline.obstacles.map(item => Object.freeze({ ...item }))),
      entries: Object.freeze(baseline.entries.map(item => Object.freeze({
        ...item, position: Object.freeze({ ...item.position })
      })))
    });
    expect(validateTownLayout(frozen)).toEqual([]);
    expect(frozen.entries).toEqual(baseline.entries);
    const errors = validateTownLayout({ ...frozen, center: { x: NaN, y: 470 } });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toHaveProperty('code');
    expect(errors.every(e => typeof e.code === 'string')).toBe(true);
  });
});
