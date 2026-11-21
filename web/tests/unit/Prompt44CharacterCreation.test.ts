// Prompt 44 — six-class creation and character/world identity. GPL-3.0-only.
import {describe,it,expect} from 'vitest';
import {CLASS_IDS,CLASSES} from '../../src/game/data/classes';
import {GameSimulation} from '../../src/game/core/GameSimulation';
import {createStarterEquipment,isCharacterId,createCharacterId} from '../../src/game/creation/characterCreation';
import {createSaveRecord,readSaveRecord} from '../../src/persistence/SaveRepository';
import {createWorldRecord,readWorldRecord} from '../../src/persistence/WorldProgressRepository';

const identity='char-0123456789abcdef0123456789abcdef';
describe('Prompt 44 — character creation',()=>{
  it.each(CLASS_IDS)('creates, serializes and reloads a %s with its unique starter equipment and resource',id=>{
    const sim=new GameSimulation(44);
    sim.command({type:'createCharacter',classId:id,characterId:identity,seed:44});
    const initial=sim.snapshot();
    expect(initial.characterId).toBe(identity);
    expect(initial.classId).toBe(id);
    expect(initial.level).toBe(1);
    expect(initial.xp).toBe(0);
    expect(initial.resource).toBe(CLASSES[id].resourceInitial);
    expect(initial.equipment).toEqual(createStarterEquipment(id));
    expect(Object.values(initial.equipment).filter(Boolean).length).toBeGreaterThan(0);
    expect(initial.player.health).toBe(initial.stats.maxHealth);
    expect(initial.player.maxHealth).toBe(initial.stats.maxHealth);
    const permanent=sim.character();
    expect(permanent.characterId).toBe(identity);
    const record=createSaveRecord(permanent,123);
    expect(record?.characterId).toBe(identity);
    expect(record?.format).toBe(11);
    const loaded=readSaveRecord(record);
    expect(loaded).toEqual(permanent);
    const restored=new GameSimulation(100);
    expect(restored.restoreCharacter(loaded!,99)).toBe(true);
    expect(restored.character()).toEqual(permanent);
    expect(restored.snapshot().worldSeed).toBe(99);
    expect(restored.snapshot().resource).toBe(CLASSES[id].resourceMax
      ?restored.snapshot().stats.maxResource:0);
    expect(restored.snapshot().equipment).toEqual(initial.equipment);
  });
  it('binds a seed-scoped world record to its character, not to unrelated heroes',()=>{
    const sim=new GameSimulation(42);
    sim.command({type:'createCharacter',classId:'WARLOCK',characterId:identity,seed:42});
    const progress=sim.worldProgress()!;
    const world=createWorldRecord(progress,identity);
    expect(world?.characterId).toBe(identity);
    expect(readWorldRecord(world,identity)?.seed).toBe(42);
    expect(readWorldRecord(world,'hero')).toBeNull();
    expect(readWorldRecord(world,'char-ffffffffffffffffffffffffffffffff')).toBeNull();
    expect(createSaveRecord(sim.character())?.character).not.toHaveProperty('worldSeed');
    expect(createSaveRecord(sim.character())?.character).not.toHaveProperty('worldFacts');
  });
  it('rejects malformed IDs and forged identity without mutating a live session',()=>{
    const sim=new GameSimulation(42);
    const before=sim.snapshot();
    for(const bad of ['../hero','wrong','char-zz','', 'char-'.padEnd(110,'f')]){
      expect(isCharacterId(bad)).toBe(false);
      sim.command({type:'createCharacter',classId:'ROGUE',characterId:bad});
      expect(sim.snapshot()).toEqual(before);
    }
    sim.command({type:'createCharacter',classId:'ROGUE',characterId:identity,seed:42});
    const s=sim.snapshot();
    expect(sim.restore({...s,characterId:'wrong'})).toBe(false);
    expect(sim.restoreCharacter({...sim.character(),characterId:'wrong'})).toBe(false);
    expect(readSaveRecord({...createSaveRecord(sim.character()),characterId:'hero'})).toBeNull();
    expect(sim.snapshot()).toEqual(s);
  });
  it('retains legacy hero records and does not start with equipment on legacy reset',()=>{
    const sim=new GameSimulation(42);
    const character=sim.character();
    expect(character).not.toHaveProperty('characterId');
    expect(Object.values(sim.snapshot().equipment).filter(Boolean)).toHaveLength(0);
    expect(createSaveRecord(character)?.characterId).toBe('hero');
    expect(readSaveRecord(createSaveRecord(character))).toEqual(character);
    expect(isCharacterId('hero')).toBe(true);
    expect(isCharacterId(identity)).toBe(true);
    expect(createCharacterId('01234567-89ab-cdef-0123-456789abcdef')).toBe(identity);
  });
});
