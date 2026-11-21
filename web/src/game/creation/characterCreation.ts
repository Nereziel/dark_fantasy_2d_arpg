/**
 * Prompt 44 — one typed creation plan for all six classes.
 * Pure start loadouts and canonical IDs; the browser supplies a random UUID.
 * Does not change shared loot RNG, world seed, or persisted save formats.
 * GPL-3.0-only.
 */
import {CLASS_IDS,type ClassId} from '../data/classes';
import {createEquipment,rollItemForBase,SeededRng,
  type Equipment,type EquipmentSlot} from '../data/items';

export type CharacterId = string;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHARACTER_ID=/^char-[0-9a-f]{32}$/;
export function isCharacterId(value:unknown):value is CharacterId{
  return value==='hero'||(typeof value==='string'&&CHARACTER_ID.test(value));
}
/** Pure conversion so tests can supply an explicit UUID without random numbers. */
export function createCharacterId(uuid:string):CharacterId{
  if(!UUID.test(uuid))throw new RangeError('Invalid character UUID');
  return 'char-'+uuid.replaceAll('-','');
}
type StarterEntry=Readonly<{slot:EquipmentSlot;templateId:string}>;
export const STARTER_LOADOUTS:Readonly<Record<ClassId,readonly StarterEntry[]>>=Object.freeze({
  WARRIOR:Object.freeze([
    Object.freeze({slot:'MAIN_HAND',templateId:'broadsword'}),
    Object.freeze({slot:'HELMET',templateId:'helm'})
  ]),
  PALADIN:Object.freeze([
    Object.freeze({slot:'MAIN_HAND',templateId:'mace'}),
    Object.freeze({slot:'OFF_HAND',templateId:'shield'})
  ]),
  MAGE:Object.freeze([
    Object.freeze({slot:'MAIN_HAND',templateId:'wand'}),
    Object.freeze({slot:'CHARM',templateId:'charm'})
  ]),
  NECROMANCER:Object.freeze([
    Object.freeze({slot:'MAIN_HAND',templateId:'wand'}),
    Object.freeze({slot:'AMULET',templateId:'bloodstone'})
  ]),
  ROGUE:Object.freeze([
    Object.freeze({slot:'MAIN_HAND',templateId:'dagger'}),
    Object.freeze({slot:'BOOTS',templateId:'greaves'})
  ]),
  WARLOCK:Object.freeze([
    Object.freeze({slot:'MAIN_HAND',templateId:'wand'}),
    Object.freeze({slot:'RING_1',templateId:'signet'})
  ])
});
/** Uses catalog-compatible level-one common gear; no duplicate instance IDs. */
export function createStarterEquipment(classId:ClassId):Equipment{
  const equipment=createEquipment();
  if(!CLASS_IDS.includes(classId))return equipment;
  const rng=new SeededRng(0x44f00d);
  for(const {slot,templateId} of STARTER_LOADOUTS[classId]){
    const item=rollItemForBase(templateId,
      'starter-'+classId.toLowerCase()+'-'+slot.toLowerCase(),
      1,'COMMON',rng,classId);
    if(!item||item.slot!==slot)throw new Error('Invalid class starter equipment');
    equipment[slot]=item;
  }
  return equipment;
}
