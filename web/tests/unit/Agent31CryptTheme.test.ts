import { describe, expect, it } from 'vitest';
import { validEnemyType } from '../../src/game/enemies/enemies';
import { getStatusDefinition } from '../../src/game/status/statusDefinitions';
import { CRYPT_RUNTIME_BOSS_POSITIONS, buildCryptWorld } from '../../src/game/world/dungeonRuntime';
import { ACTOR_RADIUS, canOccupy, findPath, WORLD_HEIGHT, WORLD_WIDTH } from '../../src/game/world/navigation';
import {
  DUNGEON_TILE_SIZE, generateProceduralDungeon, validateProceduralDungeon,
  type DungeonRoomType, type ProceduralDungeonResult
} from '../../src/game/world/proceduralDungeon';
import {
  buildCryptTheme, CRYPT_THEME_ID, MAX_CRYPT_PROPS_PER_ROOM, MAX_CRYPT_TRAPS_PER_ROOM,
  type CryptThemePlan
} from '../../src/game/world/cryptTheme';

const SEEDS = [0, 1, 2, 42, 8712, 0xffffffff];
const REQUIRED_TYPES: readonly DungeonRoomType[] = [
  'entrance', 'corridor', 'combat', 'elite', 'event', 'treasure', 'trap', 'boss'
];
const sqDistance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

function deepFreeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const entry of Object.values(value)) deepFreeze(entry);
  Object.freeze(value);
}
function assertDeepFrozen(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const entry of Object.values(value)) assertDeepFrozen(entry);
}
function themeFor(seed: number, maxAttempts?: number): {
  dungeon: ProceduralDungeonResult; theme: CryptThemePlan
} {
  const dungeon = generateProceduralDungeon(seed, maxAttempts === undefined ? {} : { maxAttempts });
  return { dungeon, theme: buildCryptTheme(dungeon) };
}

describe('Agent 31 — Corrupted Crypt: deterministic theme projection', () => {
  it.each(SEEDS)('replays uint32 seed %s with all room visuals and independent IDs', seed => {
    const { dungeon, theme } = themeFor(seed);
    const replay = buildCryptTheme(dungeon);
    expect(theme).toEqual(replay);
    expect(JSON.stringify(theme)).toBe(JSON.stringify(replay));
    expect(theme.themeId).toBe(CRYPT_THEME_ID);
    expect(theme.seed).toBe(seed);
    expect(theme.validation).toEqual({
      valid: true, checkedPaths: dungeon.validation.checkedPaths,
      secretRoomCount: dungeon.rooms.filter(room => room.type === 'secret').length
    });
    expect(theme.roomVisuals).toHaveLength(dungeon.rooms.length);
    expect(theme.roomVisuals.map(room => room.roomId))
      .toEqual(dungeon.rooms.map(room => room.id));
    expect(theme.roomVisuals.map(room => room.roomType).sort())
      .toEqual(dungeon.rooms.map(room => room.type).sort());
    expect(theme.props.length).toBeGreaterThanOrEqual(dungeon.rooms.length);
    expect(theme.props.length).toBeLessThanOrEqual(dungeon.rooms.length * MAX_CRYPT_PROPS_PER_ROOM);
    expect(theme.traps.length).toBeLessThanOrEqual(dungeon.rooms.length * MAX_CRYPT_TRAPS_PER_ROOM);
    expect(JSON.parse(JSON.stringify(theme))).toEqual(theme);
  });

  it('changes instance identity across distinct seeds without consuming global randomness', () => {
    const plans = SEEDS.map(seed => themeFor(seed).theme);
    expect(new Set(plans.map(plan => plan.props[0]?.id)).size).toBe(SEEDS.length);
    expect(new Set(plans.map(plan => JSON.stringify(plan))).size).toBe(SEEDS.length);
    const first = JSON.stringify(plans[0]);
    themeFor(8712);
    expect(JSON.stringify(themeFor(0).theme)).toBe(first);
  });

  it('works with the real validated zero-attempt fallback, without inventing secrets', () => {
    const { dungeon, theme } = themeFor(42, 0);
    expect(dungeon.source).toBe('fallback');
    expect(dungeon.validation.valid).toBe(true);
    expect(theme).toEqual(buildCryptTheme(generateProceduralDungeon(42, { maxAttempts: 0 })));
    expect(theme.secretHints).toEqual([]);
    expect(theme.roomVisuals).not.toContainEqual(expect.objectContaining({ roomType: 'secret' }));
  });

  it('renders all mandatory room archetypes with distinct palettes and fallback hints', () => {
    const { dungeon, theme } = themeFor(42);
    const visualTypes = new Map(theme.roomVisuals.map(visual => [visual.roomType, visual]));
    for (const type of REQUIRED_TYPES) {
      const visual = visualTypes.get(type);
      expect(visual, type).toBeDefined();
      expect(visual!.layers.length).toBeGreaterThanOrEqual(4);
      expect(visual!.layers.map(layer => layer.layer)).toEqual(
        expect.arrayContaining(['floor', 'wall', 'detail', 'lighting'])
      );
      expect(new Set(visual!.layers.map(layer => layer.depth)).size).toBe(visual!.layers.length);
      expect(visual!.layers.every(layer =>
        layer.assetKey.startsWith('crypt.') && layer.paletteKey.startsWith('crypt.')
        && layer.materialKey.startsWith('crypt.')
        && ['rectangle', 'ellipse', 'glyph', 'radial'].includes(layer.fallback.primitive)
        && Number.isInteger(layer.fallback.color)
        && layer.fallback.alpha >= 0 && layer.fallback.alpha <= 1)).toBe(true);
      expect(visual!.lighting.intensity).toBeGreaterThan(0);
      expect(visual!.lighting.intensity).toBeLessThanOrEqual(1);
    }
    expect(new Set(REQUIRED_TYPES.map(type => visualTypes.get(type)!.layers[2]!.assetKey)).size)
      .toBe(REQUIRED_TYPES.length);
    expect(new Set(REQUIRED_TYPES.map(type => visualTypes.get(type)!.layers[0]!.paletteKey)).size)
      .toBe(REQUIRED_TYPES.length);
    expect(new Set(REQUIRED_TYPES.map(type => visualTypes.get(type)!.layers[0]!.materialKey)).size)
      .toBe(REQUIRED_TYPES.length);
    for (const visual of theme.roomVisuals) {
      expect(visual.bounds).toEqual(dungeon.rooms.find(room => room.id === visual.roomId)!.bounds);
      expect(visual.initiallyVisible).toBe(visual.roomType !== 'secret');
    }
  });
});

describe('Agent 31 — world props, one-shot hooks and safe geometry', () => {
  it('includes tombs, breakables, containers, ossuaries, lamps and event runes', () => {
    const { theme } = themeFor(0);
    const kinds = new Set(theme.props.map(p => p.kind));
    for (const kind of [
      'urn', 'gravestone', 'sarcophagus', 'coffin', 'lantern',
      'candelabrum', 'ossuary', 'eventRune', 'treasureChest'
    ]) expect(kinds.has(kind as never), kind).toBe(true);
    expect(theme.props.some(prop => prop.capability === 'decorative')).toBe(true);
    expect(theme.props.some(prop => prop.capability === 'breakable')).toBe(true);
    expect(theme.props.some(prop => prop.capability === 'lootContainer')).toBe(true);
    expect(theme.props.some(prop => prop.capability === 'trap')).toBe(true);
    expect(theme.props.some(prop => prop.assetKey.startsWith('crypt.prop.'))).toBe(true);
  });

  it('links every actionable prop to an idempotent visited-room interaction proposal', () => {
    const { theme } = themeFor(1);
    const all = [...theme.props.map(x => x.id), ...theme.interactables.map(x => x.id),
      ...theme.traps.map(x => x.id), ...theme.encounterHints.map(x => x.id),
      ...theme.audioCues.map(x => x.id), ...theme.secretHints.map(x => x.id)];
    expect(new Set(all).size).toBe(all.length);
    const byProp = new Map(theme.interactables.map(x => [x.propId, x]));
    for (const prop of theme.props) {
      expect(prop.id).toContain(prop.roomId);
      if (prop.capability === 'decorative') {
        expect(byProp.has(prop.id)).toBe(false);
        expect(prop.onInteractHookId).toBeUndefined();
        continue;
      }
      const interactable = byProp.get(prop.id);
      expect(interactable).toBeDefined();
      expect(interactable!.capability).toBe(prop.capability);
      expect(interactable!.roomId).toBe(prop.roomId);
      expect(interactable!.position).toEqual(prop.position);
      expect(interactable!.hookId).toBe(prop.onInteractHookId);
      expect(interactable!.requiresVisited).toBe(true);
      expect(interactable!.oneShot).toBe(true);
      expect(interactable!.reach).toBeGreaterThan(interactable!.hitRadius);
      expect(interactable!.eventKey.startsWith('crypt.')).toBe(true);
      expect(interactable!.initiallyVisible).toBe(
        !theme.roomVisuals.some(room => room.roomId === prop.roomId && room.roomType === 'secret')
      );
    }
    expect(theme.interactables.length).toBe(theme.props.filter(p => p.capability !== 'decorative').length);
    expect(theme.interactables.filter(i => i.capability === 'lootContainer').length).toBeGreaterThan(0);
  });

  it.each([0, 42, 8712])('keeps seed %s props safely inside floors, away from portals and protected actors', seed => {
    const { dungeon, theme } = themeFor(seed);
    const protectedSpawns = [
      dungeon.playerSpawn, dungeon.exitPosition, dungeon.bossSpawn,
      ...dungeon.bossGuardSpawns,
      ...CRYPT_RUNTIME_BOSS_POSITIONS,
      ...dungeon.encounterSpawns.map(spawn => spawn.position),
      ...dungeon.rooms.filter(room => room.required).map(room => room.center)
    ];
    const portals = dungeon.doors.flatMap(door => [door.portalA, door.portalB]);
    for (const prop of theme.props) {
      const room = dungeon.rooms.find(room => room.id === prop.roomId)!;
      expect(room).toBeDefined();
      expect(prop.position.x).toBeGreaterThan(room.bounds.x + ACTOR_RADIUS + prop.footprintRadius);
      expect(prop.position.x).toBeLessThan(room.bounds.x + room.bounds.width - ACTOR_RADIUS - prop.footprintRadius);
      expect(prop.position.y).toBeGreaterThan(room.bounds.y + ACTOR_RADIUS + prop.footprintRadius);
      expect(prop.position.y).toBeLessThan(room.bounds.y + room.bounds.height - ACTOR_RADIUS - prop.footprintRadius);
      expect(canOccupy(prop.position, ACTOR_RADIUS + prop.footprintRadius, dungeon.obstacles)).toBe(true);
      for (const spawn of protectedSpawns) {
        expect(sqDistance(prop.position, spawn), prop.id).toBeGreaterThanOrEqual(75);
      }
      for (const portal of portals) {
        expect(sqDistance(prop.position, portal), prop.id).toBeGreaterThanOrEqual(72);
      }
      const tile = dungeon.tiles.find(tile => tile.kind === 'floor'
        && prop.position.x >= tile.x && prop.position.x < tile.x + DUNGEON_TILE_SIZE
        && prop.position.y >= tile.y && prop.position.y < tile.y + DUNGEON_TILE_SIZE);
      expect(tile, prop.id).toBeDefined();
    }
    const route = [
      dungeon.exitPosition, ...dungeon.encounterSpawns.map(s => s.position),
      dungeon.bossSpawn, ...CRYPT_RUNTIME_BOSS_POSITIONS
    ];
    for (const point of route) {
      expect(canOccupy(point, ACTOR_RADIUS, dungeon.obstacles)).toBe(true);
      expect(findPath(dungeon.playerSpawn, point, ACTOR_RADIUS, dungeon.obstacles).length).toBeGreaterThan(0);
    }
  });

  it('generates bounded spike, poison and runic trap proposals without applying damage', () => {
    const { theme } = themeFor(42);
    expect(new Set(theme.traps.map(trap => trap.kind))).toEqual(new Set(['spike', 'poison', 'runic']));
    for (const trap of theme.traps) {
      const prop = theme.props.find(p => p.id === trap.sourcePropId)!;
      expect(prop).toBeDefined();
      expect(prop.capability).toBe('trap');
      expect(trap.roomId).toBe(prop.roomId);
      expect(trap.trigger.shape).toBe('circle');
      expect(trap.trigger.center).toEqual(prop.position);
      expect(trap.trigger.radius).toBeGreaterThanOrEqual(12);
      expect(trap.trigger.radius).toBeLessThanOrEqual(28);
      expect(trap.armingSeconds).toBeGreaterThanOrEqual(0);
      expect(trap.telegraphSeconds).toBeGreaterThanOrEqual(0.3);
      expect(trap.recoverySeconds).toBeGreaterThanOrEqual(0.5);
      expect(trap.damage.maxBaseDamage).toBeGreaterThan(0);
      expect(trap.damage.maxBaseDamage).toBeLessThanOrEqual(45);
      expect(['physical', 'poison', 'shadow']).toContain(trap.damage.type);
      if (trap.damage.statusId) expect(getStatusDefinition(trap.damage.statusId)).toBeDefined();
      expect(trap.requiresVisited).toBe(true);
      expect(trap.oneShot).toBe(true);
      expect(trap.hookId).not.toBe(prop.onInteractHookId);
    }
    expect(JSON.stringify(theme)).not.toMatch(/"gold"|"xp"|"lootRoll"|"health":/);
  });
});

describe('Agent 31 — undead, atmosphere and hidden secret disclosure', () => {
  it('emits only existing undead enemy IDs and bounded spawn proposals', () => {
    const { theme } = themeFor(2);
    expect(theme.encounterHints.length).toBeGreaterThan(2);
    for (const hint of theme.encounterHints) {
      expect(hint.maximumActors).toBeGreaterThanOrEqual(1);
      expect(hint.maximumActors).toBeLessThanOrEqual(3);
      expect(hint.spawnPolicy).toBe('coordinator_authority');
      expect(hint.enemyTypes.length).toBeGreaterThanOrEqual(1);
      expect(hint.enemyTypes.length).toBeLessThanOrEqual(hint.maximumActors);
      expect(hint.enemyTypes.every(enemy =>
        validEnemyType(enemy)
        && (enemy === 'crypt_lord' || enemy === 'wraith'
          || enemy.startsWith('skeleton') || ['zombie', 'ghoul'].includes(enemy)))).toBe(true);
    }
    const bossRoom = theme.roomVisuals.find(room => room.roomType === 'boss')!;
    expect(theme.encounterHints.find(hint => hint.roomId === bossRoom.roomId)?.enemyTypes)
      .toContain('crypt_lord');
  });

  it('provides ambient hooks for every room without pretending audio assets exist', () => {
    const { theme } = themeFor(8712);
    for (const visual of theme.roomVisuals) {
      const cues = theme.audioCues.filter(c => c.roomId === visual.roomId);
      expect(cues.length).toBeGreaterThanOrEqual(1);
      expect(cues.every(c => c.ambientCueKey.startsWith('crypt.audio.')
        && c.intensity > 0 && c.intensity <= 1 && c.loop)).toBe(true);
      expect(cues.every(c => c.requiresDiscovery === !visual.initiallyVisible)).toBe(true);
    }
  });

  it('only hints a physically present hidden door, on its non-secret side', () => {
    const seeds = [...SEEDS, 17, 23, 99, 12345];
    const withSecret = seeds.map(seed => themeFor(seed))
      .find(value => value.dungeon.rooms.some(room => room.type === 'secret'));
    expect(withSecret).toBeDefined();
    const { dungeon, theme } = withSecret!;
    const secretRooms = dungeon.rooms.filter(room => room.type === 'secret');
    expect(theme.secretHints).toHaveLength(secretRooms.length);
    for (const hint of theme.secretHints) {
      const door = dungeon.doors.find(d => d.id === hint.doorId)!;
      expect(door).toBeDefined();
      expect(door.kind).toBe('hidden');
      const source = dungeon.rooms.find(room => room.id === hint.fromRoomId)!;
      expect(source.type).not.toBe('secret');
      expect([door.roomAId, door.roomBId]).toContain(source.id);
      expect(hint.anchor).toEqual(door.roomAId === source.id ? door.portalA : door.portalB);
      expect(hint.requiresVisited).toBe(true);
      expect(hint.initiallyDiscovered).toBe(false);
      expect(hint.revealHookId).toMatch(/^crypt\.hook\.reveal\//);
      expect(theme.roomVisuals.find(v => v.roomType === 'secret')?.initiallyVisible).toBe(false);
    }
    const noSecret = themeFor(42, 0).theme;
    expect(noSecret.secretHints).toHaveLength(0);
    expect(noSecret.props.some(p => p.capability === 'secretReveal')).toBe(false);
  });
});

describe('Agent 31 — immutable outputs and forged dungeon rejection', () => {
  it('never mutates or freezes caller input, and deeply freezes the returned plan', () => {
    const dungeon = generateProceduralDungeon(42);
    const source = JSON.stringify(dungeon);
    const theme = buildCryptTheme(dungeon);
    expect(JSON.stringify(dungeon)).toBe(source);
    expect(Object.isFrozen(dungeon)).toBe(false);
    assertDeepFrozen(theme);
    expect(() => { (theme.props as unknown[]).push({}); }).toThrow();
    expect(() => { (theme.roomVisuals[0]!.bounds as { x: number }).x = -1; }).toThrow();
    expect(JSON.stringify(buildCryptTheme(dungeon))).toBe(JSON.stringify(theme));

    const frozenInput = generateProceduralDungeon(42);
    deepFreeze(frozenInput);
    expect(buildCryptTheme(frozenInput)).toEqual(theme);
  });

  it('fails closed on fake validated flags, wrong seeds/dimensions and malformed room identities', () => {
    const original = generateProceduralDungeon(42);
    const corruptions: Array<(draft: any) => void> = [
      d => { d.seed = -1; },
      d => { d.seed = 0xffffffff + 1; },
      d => { d.seed = NaN; },
      d => { d.seed = Infinity; },
      d => { d.seed = 43; },
      d => { d.width = WORLD_WIDTH + 40; },
      d => { d.height = WORLD_HEIGHT - 40; },
      d => { d.validation.errors = ['fake']; },
      d => { d.validation.checkedPaths = 0; },
      d => { d.rooms[0].id = d.rooms[1].id; },
      d => { d.rooms[0].center = { x: NaN, y: Infinity }; },
      d => { d.rooms[1].feature = { ...d.rooms[2].feature }; },
      d => { d.doors[0].id = d.doors[1].id; },
      d => { d.tiles[0].kind = 'floor'; },
      d => { d.obstacles[0].width = Infinity; },
      d => { d.bossGuardSpawns[0] = { x: 0, y: 0 }; },
      d => { d.rooms[0].props = [{ id: 'forged' }]; }
    ];
    const invalidFlag: any = structuredClone(original);
    invalidFlag.validation.valid = false;
    expect(() => buildCryptTheme(invalidFlag)).toThrow(RangeError);
    for (const corrupt of corruptions) {
      const draft: any = structuredClone(original);
      corrupt(draft);
      draft.validation.valid = true; // Attempt to override engine's actual verdict.
      expect(() => buildCryptTheme(draft), JSON.stringify(corrupt.toString())).toThrow(RangeError);
    }
  });

  it('rejects oversized or invalid inputs before constructing thousands of props', () => {
    const original = generateProceduralDungeon(1);
    for (const candidate of [
      null, undefined, {}, [], 'hello', 2, Object.create(null),
      { ...original, rooms: Array(100_000).fill({}) },
      { ...original, doors: Array(100_000).fill({}) },
      { ...original, tiles: Array(100_000).fill({}) },
      { ...original, encounterSpawns: Array(100_000).fill({}) },
      { ...original, validation: { valid: true, errors: [], checkedPaths: 1 } }
    ]) {
      expect(() => buildCryptTheme(candidate as ProceduralDungeonResult)).toThrow(RangeError);
    }
  });

  it('leaves the canonical runtime layout, actor IDs and spawns unchanged', () => {
    const reference = buildCryptWorld(0);
    const snapshot = JSON.stringify(reference);
    const theme = buildCryptTheme(reference.dungeon);
    expect(theme.props.length).toBeGreaterThan(0);
    expect(JSON.stringify(reference)).toBe(snapshot);
    expect(validateProceduralDungeon(reference.dungeon).valid).toBe(true);
    expect(buildCryptWorld(0)).toEqual(reference);
  });
});
