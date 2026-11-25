import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../src/game/core/GameSimulation';
import { createSaveRecord, readSaveRecord, summarizeSaveRecords, characterSaveKey } from '../../src/persistence/SaveRepository';
import { normalizeCharacterName } from '../../src/game/creation/characterName';

describe('Issue #267: persistent character names', () => {
  it('accepts Czech and ordinary fantasy names and rejects blank, unsafe or overlong input', () => {
    expect(normalizeCharacterName('  Šárka z lesa  ')).toBe('Šárka z lesa');
    expect(normalizeCharacterName('Ael-Thorn')).toBe('Ael-Thorn');
    for (const value of ['', '   ', '<hero>', 'A\nB', 'x'.repeat(33), null, 4]) {
      expect(normalizeCharacterName(value)).toBeNull();
    }
  });
  it('preserves names independently of class and world identity in v11 records', () => {
    const sim = new GameSimulation(31);
    const a = 'char-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const b = 'char-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    sim.command({type:'createCharacter',classId:'WARRIOR',characterId:a,seed:31});
    const first = createSaveRecord({...sim.character(), characterName:'Šárka'},100);
    sim.command({type:'createCharacter',classId:'WARRIOR',characterId:b,seed:31});
    const second = createSaveRecord({...sim.character(), characterName:'Morrow'},200);
    expect(readSaveRecord(first)?.characterName).toBe('Šárka');
    expect(readSaveRecord(second)?.characterName).toBe('Morrow');
    expect(summarizeSaveRecords([[characterSaveKey(a),first],[characterSaveKey(b),second]])).toMatchObject([
      {characterId:b,characterName:'Morrow'}, {characterId:a,characterName:'Šárka'}
    ]);
    expect(createSaveRecord({...sim.character(),characterName:'<bad>'})).toBeNull();
    const legacy = createSaveRecord(sim.character());
    expect(readSaveRecord(legacy)).toEqual(sim.character());
  },15000);
});
