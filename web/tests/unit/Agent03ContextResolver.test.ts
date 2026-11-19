import { describe, expect, it } from 'vitest';
import {
  resolvePointerContext, cursorForContext, contextToCommand,
  type ContextTarget
} from '../../src/game/input/contextResolver';
import { MERCHANT_ID, BLACKSMITH_ID } from '../../src/game/world/npcs';
import { WARDEN_ID } from '../../src/game/quests/firstQuest';

const pointer = { x: 100, y: 200 };

function input(
  targets: readonly ContextTarget[] = [],
  options: { pointer?: { x: number; y: number }; uiCaptured?: boolean; walkable?: boolean } = {}
) {
  return {
    pointer: options.pointer ?? pointer,
    uiCaptured: options.uiCaptured ?? false,
    walkable: options.walkable ?? true,
    targets
  };
}

function target(
  kind: ContextTarget['kind'],
  id: string,
  overrides: Partial<ContextTarget> = {}
): ContextTarget {
  return {
    kind, id, position: { ...pointer }, hitRadius: 30, ...overrides
  };
}

describe('agent 03: pure pointer context resolver', () => {
  it('consumes UI clicks before enemy targeting, movement and even invalid pointer checks', () => {
    const enemy = target('ENEMY', 'wolf', { alive: true });
    expect(resolvePointerContext(input([enemy], { uiCaptured: true }))).toEqual({ kind: 'UI' });
    expect(resolvePointerContext(input([enemy], {
      uiCaptured: true, pointer: { x: Number.NaN, y: Infinity }, walkable: false
    }))).toEqual({ kind: 'UI' });
  });

  it('rejects non-finite pointer positions and blocked empty ground without emitting moves', () => {
    for (const invalid of [
      { x: Number.NaN, y: 200 },
      { x: Infinity, y: 200 },
      { x: -Infinity, y: 200 },
      { x: 100, y: Number.NaN },
      { x: 100, y: Infinity }
    ]) {
      const context = resolvePointerContext(input([], { pointer: invalid }));
      expect(context).toEqual({ kind: 'INVALID' });
      expect(contextToCommand(context)).toBeNull();
    }
    expect(resolvePointerContext(input([], { walkable: false }))).toEqual({ kind: 'INVALID' });
    expect(resolvePointerContext(input())).toEqual({ kind: 'GROUND', position: pointer });
  });

  it('prioritizes NPC > LOOT > ENEMY > INTERACTABLE for overlapping hitboxes', () => {
    const npc = target('NPC', WARDEN_ID);
    const loot = target('LOOT', 'loot-01');
    const enemy = target('ENEMY', 'wolf-01', { alive: true });
    const portal = target('INTERACTABLE', 'crypt-portal');
    const cases: { targets: ContextTarget[]; expected: { kind: ContextTarget['kind']; id: string } }[] = [
      { targets: [enemy, portal], expected: { kind: 'ENEMY', id: 'wolf-01' } },
      { targets: [enemy, portal, loot], expected: { kind: 'LOOT', id: 'loot-01' } },
      { targets: [npc, enemy, loot, portal], expected: { kind: 'NPC', id: WARDEN_ID } }
    ];
    for (const { targets, expected } of cases) {
      expect(resolvePointerContext(input(targets))).toEqual(expected);
      expect(resolvePointerContext(input([...targets].reverse()))).toEqual(expected);
    }
    expect(resolvePointerContext(input([portal]))).toEqual({ kind: 'INTERACTABLE', id: 'crypt-portal' });
  });

  it('chooses the nearest same-category center, then the lexicographically smaller ID', () => {
    const far = target('ENEMY', 'a-far', { position: { x: 117, y: 200 } });
    const near = target('ENEMY', 'z-near', { position: { x: 104, y: 200 } });
    const alpha = target('ENEMY', 'alpha', { position: { x: 95, y: 200 } });
    const zeta = target('ENEMY', 'zeta', { position: { x: 105, y: 200 } });
    for (const targets of [[far, near], [near, far]]) {
      expect(resolvePointerContext(input(targets))).toEqual({ kind: 'ENEMY', id: 'z-near' });
    }
    for (const targets of [[zeta, alpha], [alpha, zeta]]) {
      expect(resolvePointerContext(input(targets))).toEqual({ kind: 'ENEMY', id: 'alpha' });
    }
  });

  it('ignores dead enemies, malformed targets, outside-radius hits and invalid IDs', () => {
    const bad: ContextTarget[] = [
      target('ENEMY', 'dead', { alive: false }),
      target('ENEMY', 'no-radius', { hitRadius: 0 }),
      target('ENEMY', 'negative-radius', { hitRadius: -1 }),
      target('NPC', WARDEN_ID, { hitRadius: Infinity }),
      target('NPC', WARDEN_ID, { hitRadius: Number.NaN }),
      target('LOOT', 'invalid-x', { position: { x: Number.NaN, y: 200 } }),
      target('LOOT', 'invalid-y', { position: { x: 100, y: -Infinity } }),
      target('INTERACTABLE', '', { hitRadius: 40 }),
      target('ENEMY', 'too-far', { position: { x: 131, y: 200 }, hitRadius: 30 })
    ];
    expect(resolvePointerContext(input(bad))).toEqual({ kind: 'GROUND', position: pointer });
    expect(resolvePointerContext(input(bad, { walkable: false }))).toEqual({ kind: 'INVALID' });
    expect(resolvePointerContext(input([target('LOOT', 'boundary', {
      position: { x: 130, y: 200 }, hitRadius: 30
    })], { walkable: false }))).toEqual({ kind: 'LOOT', id: 'boundary' });
  });

  it('does not modify caller targets or expose the original ground position by reference', () => {
    const location = Object.freeze({ x: 100, y: 200 });
    const targets = Object.freeze([
      Object.freeze(target('ENEMY', 'wolf-1', { position: location, alive: true }))
    ]);
    expect(resolvePointerContext(input(targets))).toEqual({ kind: 'ENEMY', id: 'wolf-1' });
    const result = resolvePointerContext(input([], { pointer: location }));
    expect(result).toEqual({ kind: 'GROUND', position: pointer });
    if (result.kind === 'GROUND') {
      expect(result.position).not.toBe(location);
      result.position.x = 999;
      expect(location.x).toBe(100);
    }
  });

  it('returns data-only cursor hints for every context kind', () => {
    expect(cursorForContext({ kind: 'GROUND', position: pointer })).toBe('move');
    expect(cursorForContext({ kind: 'ENEMY', id: 'wolf' })).toBe('hostile');
    expect(cursorForContext({ kind: 'NPC', id: WARDEN_ID })).toBe('talk');
    expect(cursorForContext({ kind: 'LOOT', id: 'loot' })).toBe('loot');
    expect(cursorForContext({ kind: 'INTERACTABLE', id: 'crypt-portal' })).toBe('interact');
    expect(cursorForContext({ kind: 'INVALID' })).toBe('blocked');
    expect(cursorForContext({ kind: 'UI' })).toBe('ui');
  });

  it('translates known contexts into existing GameCommand variants only', () => {
    expect(contextToCommand({ kind: 'GROUND', position: pointer }))
      .toEqual({ type: 'move', destination: pointer });
    expect(contextToCommand({ kind: 'ENEMY', id: 'wolf' }))
      .toEqual({ type: 'attack', targetId: 'wolf' });
    expect(contextToCommand({ kind: 'LOOT', id: 'loot-2' }))
      .toEqual({ type: 'pickup', id: 'loot-2' });
    for (const id of [WARDEN_ID, MERCHANT_ID, BLACKSMITH_ID]) {
      expect(contextToCommand({ kind: 'NPC', id }))
        .toEqual({ type: 'interactNpc', npcId: id });
    }
    expect(contextToCommand({ kind: 'INTERACTABLE', id: 'crypt-portal' }))
      .toEqual({ type: 'usePortal' });
    expect(contextToCommand({ kind: 'INVALID' })).toBeNull();
    expect(contextToCommand({ kind: 'UI' })).toBeNull();
  });

  it('never invents commands for spoofed NPCs, other interactables or invalid positions', () => {
    for (const id of ['warden-unknown', 'constructor', '__proto__', '']) {
      expect(contextToCommand({ kind: 'NPC', id })).toBeNull();
    }
    for (const id of ['chest-01', 'shrine-01', 'crypt-exit', 'door-01', '']) {
      expect(contextToCommand({ kind: 'INTERACTABLE', id })).toBeNull();
    }
    expect(contextToCommand({ kind: 'GROUND', position: { x: Infinity, y: 1 } })).toBeNull();
    expect(contextToCommand({ kind: 'GROUND', position: { x: 1, y: Number.NaN } })).toBeNull();
    expect(contextToCommand({ kind: 'ENEMY', id: '' })).toBeNull();
    expect(contextToCommand({ kind: 'LOOT', id: '' })).toBeNull();
  });
});
