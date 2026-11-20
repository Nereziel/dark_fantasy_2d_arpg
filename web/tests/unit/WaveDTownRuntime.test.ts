import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { getTownManifest, townEntry } from '../../src/game/world/townManifest';
import { createSaveRecord, readSaveRecord } from '../../src/persistence/SaveRepository';

describe('Wave D town runtime adapter', () => {
  it('makes new camp services reachable through the simulation interaction command', () => {
    const sim = new GameSimulation(0);
    const manifest = getTownManifest();
    expect(manifest).toHaveLength(10);
    sim.command({ type: 'interactTown', entryId: 'healer_iva' });
    for (let tick = 0; tick < 220; tick++) sim.advance(16.667);
    expect(sim.drainEvents().filter(event => event.type === 'townInteraction'))
      .toEqual([{ type: 'townInteraction', entryId: 'healer_iva', role: 'healer' }]);
    expect(sim.snapshot().player.alive).toBe(true);
    expect(sim.snapshot().status).not.toBe('moving');
  });

  it('executes healing and resource restoration exactly once per paid activation', () => {
    const sim = new GameSimulation(0);
    const healer = townEntry('healer_iva')!;
    const before = sim.snapshot();
    expect(sim.restore({
      ...before,
      gold: 100,
      player: { ...before.player, ...healer.position, health: before.player.maxHealth - 30 }
    })).toBe(true);
    sim.command({ type: 'pause', value: true });
    sim.command({ type: 'useTownService', entryId: healer.id });
    const healed = sim.snapshot();
    expect(healed.gold).toBe(85);
    expect(healed.player.health).toBe(healed.player.maxHealth);
    sim.command({ type: 'useTownService', entryId: healer.id });
    expect(sim.snapshot().gold).toBe(85);
    expect(sim.drainEvents().filter(e => e.type === 'townServiceUsed')).toHaveLength(1);

    const vendor = townEntry('potion_vendor_lena')!;
    const full = sim.snapshot();
    expect(sim.restore({
      ...full, player: { ...full.player, ...vendor.position }, resource: 0
    })).toBe(true);
    sim.command({ type: 'useTownService', entryId: vendor.id });
    expect(sim.snapshot().resource).toBe(sim.snapshot().stats.maxResource);
    expect(sim.snapshot().gold).toBe(73);
    sim.command({ type: 'useTownService', entryId: vendor.id });
    expect(sim.snapshot().gold).toBe(73);
  });

  it('refuses remote, unaffordable, placeholder and spoofed service requests', () => {
    const sim = new GameSimulation(1);
    const baseline = sim.snapshot();
    for (const id of ['__proto__', 'unknown', 'stash_camp', 'waypoint_camp', 'civilian_mira']) {
      sim.command({ type: 'useTownService', entryId: id });
    }
    expect(sim.snapshot()).toEqual(baseline);
    sim.command({ type: 'useTownService', entryId: 'healer_iva' });
    expect(sim.snapshot()).toEqual(baseline); // out of range
    const entry = townEntry('healer_iva')!;
    expect(sim.restore({ ...baseline, gold: 0,
      player: { ...baseline.player, ...entry.position, health: 1 }
    })).toBe(true);
    sim.command({ type: 'useTownService', entryId: entry.id });
    expect(sim.snapshot().gold).toBe(0);
    expect(sim.snapshot().player.health).toBe(1);
    const far = sim.snapshot();
    expect(sim.restore({ ...far, player: { ...far.player, x: 900, y: 520 } })).toBe(true);
    sim.command({ type: 'interactTown', entryId: 'not_a_service' });
    sim.command({ type: 'useTownService', entryId: entry.id });
    expect(sim.snapshot().player.health).toBe(1);
  });

  it('keeps character-only gold persistence and transient health after services', () => {
    const sim = new GameSimulation();
    const entry = townEntry('healer_iva')!;
    const initial = sim.snapshot();
    expect(sim.restore({ ...initial, player: { ...initial.player, ...entry.position, health: 1 } })).toBe(true);
    sim.command({ type: 'useTownService', entryId: entry.id });
    const record = createSaveRecord(sim.character());
    expect(record?.format).toBe(9);
    const loaded = readSaveRecord(record)!;
    expect(loaded.gold).toBe(60);
    const fresh = new GameSimulation();
    expect(fresh.restoreCharacter(loaded, 999)).toBe(true);
    expect(fresh.snapshot().gold).toBe(60);
    expect(fresh.snapshot().player.health).toBe(fresh.snapshot().player.maxHealth);
    expect(JSON.stringify(record)).not.toContain('worldSeed');
  });
});
