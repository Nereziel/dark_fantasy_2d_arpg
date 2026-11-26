import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createWorldRecord, readWorldRecord } from '../../src/persistence/WorldProgressRepository';
import { buildWilderness } from '../../src/game/world/wildernessRuntime';

describe('Wave F integrated exploration and seed-scoped persistence', () => {
  it.each([0, 1, 42, 0xffffffff])('initially conceals procedurally generated locations (%s)', seed => {
    const sim = new GameSimulation(seed);
    const map = sim.mapProjection('world');
    expect(map).not.toBeNull();
    expect(map?.markers.some(marker => marker.kind === 'town')).toBe(true);
    expect(map?.markers.some(marker => marker.kind === 'player')).toBe(true);
    expect(map?.markers.some(marker => marker.kind === 'optionalPoi')).toBe(false);
    expect(map?.cells.some(cell => cell.visibility === 'unexplored')).toBe(true);
    const features = buildWilderness(seed).features;
    expect(features.filter(feature => !feature.mandatory).length).toBeGreaterThan(0);
    for (const feature of features.filter(feature => !feature.mandatory)) {
      expect(map?.markers.some(marker => marker.id === feature.id)).toBe(false);
    }
    expect(sim.snapshot().mapDiscovery?.worldSeed).toBe(seed);
  });

  it('reveals a broader starting neighborhood without uncovering distant locations',()=>{
    const sim=new GameSimulation(42);
    const state=sim.snapshot().mapDiscovery!;
    const larger=sim.mapProjection('world')!;
    // The camp reveal must be substantially larger than the old 105-unit radius.
    expect(state.revealedCells.length).toBeGreaterThanOrEqual(14);
    expect(larger.cells.some(c=>c.visibility==='unexplored')).toBe(true);
    expect(larger.cells.filter(c=>c.visibility==='unexplored').every(c=>c.terrainId===undefined)).toBe(true);
  });
  it('reveals surroundings only after authoritative player movement', () => {
    const sim = new GameSimulation(42);
    const before = sim.snapshot();
    const exploredBefore = before.mapDiscovery!.revealedCells.length;
    sim.command({ type: 'move', destination: { x: 540, y: 470 } });
    for (let n = 0; n < 180; n++) sim.advance(16.667);
    const after = sim.snapshot();
    expect(after.player.x).toBeGreaterThan(before.player.x + 25);
    expect(after.mapDiscovery!.revealedCells.length).toBeGreaterThan(exploredBefore);
    const mini = sim.mapProjection('minimap');
    expect(mini?.mode).toBe('minimap');
    expect(mini?.markers.some(marker => marker.kind === 'player')).toBe(true);
  });

  it('retains exploration and immutable facts across character reload in same world', () => {
    const original = new GameSimulation(42);
    original.command({ type: 'move', destination: { x: 530, y: 500 } });
    for (let i = 0; i < 160; i++) original.advance(16.667);
    const progress = original.worldProgress();
    expect(progress).not.toBeNull();
    const record = createWorldRecord(progress!);
    expect(record?.format).toBe(1);
    const decoded = readWorldRecord(record);
    expect(decoded).not.toBeNull();
    const resumed = new GameSimulation(42);
    expect(resumed.restoreWorldProgress(decoded!)).toBe(true);
    expect(resumed.worldProgress()).toEqual(progress);
    expect(resumed.character()).toEqual(original.character());
    expect(JSON.stringify(original.character())).not.toContain('worldSeed');
    expect(JSON.stringify(original.character())).not.toContain('mapDiscovery');
    expect(new GameSimulation(43).restoreWorldProgress(decoded!)).toBe(false);
    expect(readWorldRecord({ ...record, format: 11 })).toBeNull();
  });
});
