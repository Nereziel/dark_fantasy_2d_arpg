import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT_SLOTS, ITEM_BASES, ITEM_RARITIES, WEAPON_TYPES,
  MAX_AFFIXES, MAX_ITEM_LEVEL, MAX_SOCKETS,
  equipmentCompatibility, instantiateItemBase, validateCatalogItem,
  type CatalogEquipment, type CatalogItem, type CatalogSlot
} from '../../src/game/items/itemCatalog';

const make = (templateId: string, instanceId = 'item-001', level = 30): CatalogItem => {
  const item = instantiateItemBase(templateId, instanceId, level);
  expect(item).not.toBeNull();
  if (!item) throw new Error('Cannot instantiate ' + templateId);
  return item;
};
const edit = (item: CatalogItem, overrides: Record<string, unknown>): unknown => ({ ...item, ...overrides });
const emptyEquipment = (): CatalogEquipment => ({});

describe('Agent 17 — typed item catalog and weapon families', () => {
  it('defines 14 stable weapon types and all 6 rarities', () => {
    expect(Object.keys(WEAPON_TYPES)).toEqual([
      'SWORD', 'GREATSWORD', 'AXE', 'GREATAXE', 'MACE', 'HAMMER', 'DAGGER',
      'SPEAR', 'BOW', 'CROSSBOW', 'STAFF', 'WAND', 'SPELLBOOK', 'SHIELD'
    ]);
    expect(Object.keys(ITEM_RARITIES)).toEqual([
      'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'
    ]);
    for (const type of ['GREATSWORD', 'GREATAXE', 'HAMMER', 'BOW', 'CROSSBOW', 'STAFF'] as const) {
      expect(WEAPON_TYPES[type].twoHanded).toBe(true);
    }
    expect(WEAPON_TYPES.SHIELD.canMainHand).toBe(false);
    expect(WEAPON_TYPES.SPELLBOOK.canOffHand).toBe(true);
  });

  it('defines the ten core slots and optional relic/charm', () => {
    expect(EQUIPMENT_SLOTS).toEqual([
      'helmet', 'chest', 'gloves', 'boots', 'belt', 'amulet',
      'ring1', 'ring2', 'mainHand', 'offHand', 'relic', 'charm'
    ]);
  });

  it('catalog entries have stable IDs and separate CS/EN name and grammar keys', () => {
    expect(Object.keys(ITEM_BASES).length).toBeGreaterThanOrEqual(23);
    const weaponBases = Object.values(ITEM_BASES).filter(base => base.weaponType !== null);
    expect(new Set(weaponBases.map(base => base.weaponType)).size).toBe(14);
    for (const [id, base] of Object.entries(ITEM_BASES)) {
      expect(base.id).toBe(id);
      expect(base.nameKey).toBe('item.base.' + id + '.name');
      expect(base.grammarKey).toBe('item.base.' + id + '.grammar');
      expect(base.allowedSlots.length).toBeGreaterThan(0);
      expect(Object.isFrozen(base)).toBe(true);
      expect(Object.isFrozen(base.allowedSlots)).toBe(true);
    }
  });

  it('instantiates deterministically without RNG or mutating the base', () => {
    const first = make('broadsword', 'hero-loot-1', 12);
    expect(first).toEqual(make('broadsword', 'hero-loot-1', 12));
    expect(first).toMatchObject({
      instanceId: 'hero-loot-1', templateId: 'broadsword', itemLevel: 12,
      rarity: 'COMMON', sockets: [], affixes: [], legendaryPower: null
    });
    expect(first.sellValue).toBeGreaterThan(0);
    expect(first.requiredLevel).toBeLessThanOrEqual(first.itemLevel);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.sockets)).toBe(true);
    expect(Object.isFrozen(first.affixes)).toBe(true);
  });

  it('all base instances are JSON serializable and remain valid after a round trip', () => {
    for (const [id, base] of Object.entries(ITEM_BASES)) {
      const item = make(id, 'test-' + id, Math.max(30, base.requiredLevel));
      expect(validateCatalogItem(item)).toBe(true);
      expect(validateCatalogItem(JSON.parse(JSON.stringify(item)))).toBe(true);
    }
  });

  it('rejects unknown templates, unstable IDs, non-finite and out-of-range levels', () => {
    expect(instantiateItemBase('missing', 'item-1', 20)).toBeNull();
    for (const id of ['', 'Item With Space', '__proto__', 'český', 'a/'.repeat(70)]) {
      expect(instantiateItemBase('broadsword', id, 20)).toBeNull();
    }
    for (const level of [0, -1, 1.1, NaN, Infinity, -Infinity, MAX_ITEM_LEVEL + 1]) {
      expect(instantiateItemBase('broadsword', 'valid-item', level)).toBeNull();
    }
    expect(instantiateItemBase('greatsword', 'valid-item', 1)).toBeNull();
  });

  it('rejects corrupt instance IDs, templates, required levels and unknown fields', () => {
    const item = make('broadsword');
    expect(validateCatalogItem(edit(item, { templateId: 'missing' }))).toBe(false);
    expect(validateCatalogItem(edit(item, { instanceId: 'bad id' }))).toBe(false);
    expect(validateCatalogItem(edit(item, { itemLevel: NaN }))).toBe(false);
    expect(validateCatalogItem(edit(item, { requiredLevel: -1 }))).toBe(false);
    expect(validateCatalogItem(edit(item, { requiredLevel: item.itemLevel + 1 }))).toBe(false);
    expect(validateCatalogItem(edit(item, { requiredLevel: 1.5 }))).toBe(false);
    expect(validateCatalogItem({ ...item, extra: 'unknown' })).toBe(false);
    expect(validateCatalogItem(null)).toBe(false);
    expect(validateCatalogItem([])).toBe(false);
  });

  it('supports all rarities, but legendary powers require LEGENDARY or MYTHIC', () => {
    const item = make('broadsword');
    const power = { id: 'blood-rune', magnitude: 0.35 };
    for (const rarity of Object.keys(ITEM_RARITIES)) {
      expect(validateCatalogItem(edit(item, { rarity }))).toBe(true);
    }
    expect(validateCatalogItem(edit(item, { rarity: 'DIVINE' }))).toBe(false);
    expect(validateCatalogItem(edit(item, { legendaryPower: power }))).toBe(false);
    expect(validateCatalogItem(edit(item, { rarity: 'LEGENDARY', legendaryPower: power }))).toBe(true);
    expect(validateCatalogItem(edit(item, { rarity: 'MYTHIC', legendaryPower: power }))).toBe(true);
    expect(validateCatalogItem(edit(item, { rarity: 'MYTHIC', legendaryPower: { ...power, magnitude: Infinity } }))).toBe(false);
    expect(validateCatalogItem(edit(item, { rarity: 'MYTHIC', legendaryPower: { ...power, id: '' } }))).toBe(false);
  });

  it('validates affix IDs, stat types, finite values, tiers and maximum count', () => {
    const item = { ...make('broadsword'), rarity: 'RARE' as const };
    const affix = { id: 'savage', stat: 'minDamage', value: 9.5, tier: 2 };
    expect(validateCatalogItem(edit(item, { affixes: [affix] }))).toBe(true);
    expect(validateCatalogItem(edit(item, { affixes: [affix, { ...affix }] }))).toBe(false);
    expect(validateCatalogItem(edit(item, { affixes: [{ ...affix, stat: 'godMode' }] }))).toBe(false);
    for (const value of [NaN, Infinity, -1]) {
      expect(validateCatalogItem(edit(item, { affixes: [{ ...affix, value }] }))).toBe(false);
    }
    for (const tier of [0, 11, 1.5]) {
      expect(validateCatalogItem(edit(item, { affixes: [{ ...affix, tier }] }))).toBe(false);
    }
    expect(validateCatalogItem(edit(item, {
      affixes: Array.from({ length: MAX_AFFIXES + 1 }, (_, i) => ({ ...affix, id: 'roll-' + i }))
    }))).toBe(false);
  });

  it('bounds socket capacity and validates unique gem instance IDs', () => {
    const item = make('greatsword');
    const max = ITEM_BASES.greatsword.maxSockets;
    expect(max).toBeGreaterThan(0);
    expect(validateCatalogItem(edit(item, {
      sockets: Array.from({ length: max }, (_, i) => 'gem-' + i)
    }))).toBe(true);
    expect(validateCatalogItem(edit(item, { sockets: [null, 'gem-1'] }))).toBe(true);
    expect(validateCatalogItem(edit(item, {
      sockets: Array.from({ length: max + 1 }, (_, i) => 'gem-' + i)
    }))).toBe(false);
    expect(validateCatalogItem(edit(item, { sockets: ['gem-1', 'gem-1'] }))).toBe(false);
    expect(validateCatalogItem(edit(item, { sockets: ['Invalid Gem'] }))).toBe(false);
    expect(validateCatalogItem(edit(item, { sockets: [NaN] }))).toBe(false);
    expect(MAX_SOCKETS).toBeLessThanOrEqual(6);
  });

  it('enforces bounded integer sale value and rejects cyclic extra data', () => {
    const item = make('broadsword');
    for (const sellValue of [-1, NaN, Infinity, 1.5, 1e12]) {
      expect(validateCatalogItem(edit(item, { sellValue }))).toBe(false);
    }
    expect(validateCatalogItem(edit(item, { sellValue: 0 }))).toBe(true);
    const cyclic: Record<string, unknown> = { ...item };
    cyclic.self = cyclic;
    expect(validateCatalogItem(cyclic)).toBe(false);
  });

  it('permits either ring slot, but never unrelated slots', () => {
    const ring = make('signet');
    expect(equipmentCompatibility(ring, 'ring1', emptyEquipment())).toEqual({ ok: true });
    expect(equipmentCompatibility(ring, 'ring2', emptyEquipment())).toEqual({ ok: true });
    expect(equipmentCompatibility(ring, 'amulet', emptyEquipment())).toEqual({ ok: false, reason: 'SLOT_MISMATCH' });
    expect(equipmentCompatibility(make('bloodstone'), 'amulet', emptyEquipment())).toEqual({ ok: true });
  });

  it('supports sword/shield but rejects two-hand/offhand collisions in both directions', () => {
    const sword = make('broadsword', 'sword-1');
    const shield = make('shield', 'shield-1');
    const greatsword = make('greatsword', 'greatsword-1');
    expect(equipmentCompatibility(shield, 'offHand', { mainHand: sword })).toEqual({ ok: true });
    expect(equipmentCompatibility(greatsword, 'mainHand', { offHand: shield }))
      .toEqual({ ok: false, reason: 'TWO_HANDED_CONFLICT' });
    expect(equipmentCompatibility(shield, 'offHand', { mainHand: greatsword }))
      .toEqual({ ok: false, reason: 'TWO_HANDED_CONFLICT' });
    expect(equipmentCompatibility(greatsword, 'mainHand', {})).toEqual({ ok: true });
  });

  it('enforces offhand-only shield/spellbook and allows dagger dual wield', () => {
    const shield = make('shield', 'shield-1');
    const book = make('spellbook', 'book-1');
    const dagger = make('dagger', 'dagger-1');
    const wand = make('wand', 'wand-1');
    expect(equipmentCompatibility(shield, 'mainHand', {})).toEqual({ ok: false, reason: 'SLOT_MISMATCH' });
    expect(equipmentCompatibility(book, 'mainHand', {})).toEqual({ ok: false, reason: 'SLOT_MISMATCH' });
    expect(equipmentCompatibility(book, 'offHand', { mainHand: wand })).toEqual({ ok: true });
    expect(equipmentCompatibility(dagger, 'offHand', { mainHand: wand })).toEqual({ ok: true });
    expect(equipmentCompatibility(wand, 'offHand', {})).toEqual({ ok: false, reason: 'SLOT_MISMATCH' });
  });

  it('rejects occupied slots, duplicate IDs, corrupt equipment and malformed callers', () => {
    const a = make('signet', 'ring-a');
    const b = make('signet', 'ring-b');
    expect(equipmentCompatibility(b, 'ring1', { ring1: a })).toEqual({ ok: false, reason: 'SLOT_OCCUPIED' });
    expect(equipmentCompatibility(a, 'ring2', { ring1: a })).toEqual({ ok: false, reason: 'DUPLICATE_INSTANCE' });
    expect(equipmentCompatibility(b, 'ring2', { ring1: a })).toEqual({ ok: true });
    expect(equipmentCompatibility(b, 'ring2', { ring1: make('shield') })).toEqual({ ok: false, reason: 'INVALID_EQUIPMENT' });
    expect(equipmentCompatibility(b, 'ring2', { ring1: a, ring2: a })).toEqual({ ok: false, reason: 'INVALID_EQUIPMENT' });
    expect(equipmentCompatibility(b, 'invalid' as CatalogSlot, {})).toEqual({ ok: false, reason: 'INVALID_SLOT' });
    expect(equipmentCompatibility(null as unknown as CatalogItem, 'ring1', {})).toEqual({ ok: false, reason: 'INVALID_ITEM' });
    expect(equipmentCompatibility(b, 'ring1', null as unknown as CatalogEquipment)).toEqual({ ok: false, reason: 'INVALID_EQUIPMENT' });
  });

  it('does not mutate frozen items or equipment', () => {
    const sword = make('broadsword', 'held-sword');
    const shield = make('shield', 'new-shield');
    const equipment = Object.freeze({ mainHand: sword });
    const before = JSON.stringify(equipment);
    expect(equipmentCompatibility(shield, 'offHand', equipment)).toEqual({ ok: true });
    expect(JSON.stringify(equipment)).toBe(before);
    expect(Object.isFrozen(WEAPON_TYPES)).toBe(true);
    expect(Object.isFrozen(ITEM_RARITIES)).toBe(true);
  });
});
