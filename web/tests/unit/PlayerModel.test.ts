import { describe, expect, it } from 'vitest';
import { spawnPlayer, updateHealthLimit, advanceResource } from '../../src/game/entities/player';
import { createEquipment, deriveStats } from '../../src/game/data/items';

describe('prompt 02: modular player state foundations', () => {
  it('spawns a class hero with derived health and independent coordinates', () => {
    const point = { x: 240, y: 510 };
    const player = spawnPlayer('MAGE', createEquipment(), point);
    expect(player).toEqual({
      id: 'hero', ...point,
      health: deriveStats('MAGE', createEquipment()).maxHealth,
      maxHealth: deriveStats('MAGE', createEquipment()).maxHealth,
      alive: true
    });
    player.x = 640;
    expect(point.x).toBe(240);
  });

  it('preserves wounds across equipment changes and never revives a dead actor', () => {
    const alive = spawnPlayer('WARRIOR', createEquipment(), { x: 390, y: 470 });
    alive.health -= 75;
    const originalMax = alive.maxHealth;
    updateHealthLimit(alive, originalMax + 45);
    expect(alive.health).toBe(originalMax + 45 - 75);
    updateHealthLimit(alive, originalMax);
    expect(alive.health).toBe(originalMax - 75);
    alive.alive = false;
    alive.health = 0;
    updateHealthLimit(alive, originalMax + 50);
    expect(alive.health).toBe(0);
    expect(alive.alive).toBe(false);
  });

  it('clamps resource gain and decay reproducibly at 60 fixed ticks', () => {
    let mana = 20;
    for (let i = 0; i < 60; i++) mana = advanceResource(mana, 8, 120, 1 / 60);
    expect(mana).toBeCloseTo(28, 8);
    expect(advanceResource(119, 8, 120, 1)).toBe(120);
    expect(advanceResource(1, -2, 100, 1)).toBe(0);
  });
});
