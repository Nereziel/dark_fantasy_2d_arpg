/**
 * Prompt 19 economy planning layer — isolated, deterministic, renderer-free.
 * Original Aether & Ruin work: GPL-3.0-only.
 *
 * Quotes and plans are NOT executors. The coordinator must derive quotes again
 * from the current authoritative inventory/merchant, validate ownership,
 * proximity and remaining stock, then commit gold + item changes atomically.
 * This module never changes GameSimulation, inventory, persistence or UI.
 */
import {
  SHOP_OFFERS, canTemper, getOffer, sellPrice, temperCost,
  type ShopOffer
} from './commerce';
import { isItem, type Item } from '../data/items';
import { ITEM_BASES } from '../items/itemCatalog';

export type EconomyKind = 'purchase' | 'sale' | 'temper';
export type VendorId = 'merchant_bram' | 'smith_odan' | 'traveling_vendor';
export type VendorCategory = 'all' | 'weapon' | 'offhand' | 'armor' | 'accessory';
export type EconomyFailure =
  | 'UNKNOWN_OFFER' | 'INVALID_OFFER' | 'INVALID_PRICE' | 'INVALID_ITEM'
  | 'MAX_UPGRADES' | 'SERVICE_UNAVAILABLE' | 'INVALID_QUOTE'
  | 'INVALID_BUDGET' | 'INVALID_CAPACITY' | 'INVALID_LEVEL'
  | 'LEVEL_REQUIRED' | 'INVENTORY_FULL' | 'INSUFFICIENT_GOLD'
  | 'OUT_OF_STOCK' | 'LOCKED_ITEM' | 'FAVORITE_ITEM' | 'MISSING_ITEM'
  | 'INVALID_FLAGS' | 'GOLD_CAP' | 'UNKNOWN_VENDOR' | 'INVALID_CONTEXT'
  | 'DUPLICATE_STOCK' | 'INVALID_STOCK' | 'INVALID_EPOCH';

export interface EconomyQuoteSuccess {
  readonly ok: true;
  readonly kind: EconomyKind;
  readonly currency: 'gold';
  readonly price: number;
  /** Stable merchant / blacksmith ID, not a display string. */
  readonly vendorId: VendorId;
  /** ShopOfferId for buys; owned item instance ID for sale/temper. */
  readonly sourceId: string;
  readonly requiredLevel: number;
  /** Frozen snapshot used for defensive price verification; never a live item. */
  readonly item?: Readonly<Item>;
}
export type EconomyQuote = Readonly<EconomyQuoteSuccess> |
  Readonly<{ ok: false; reason: EconomyFailure }>;

export interface TransactionSuccess {
  readonly ok: true;
  readonly kind: EconomyKind;
  readonly currency: 'gold';
  readonly sourceId: string;
  readonly price: number;
  readonly goldBefore: number;
  readonly goldAfter: number;
  /** Positive for sales, negative for purchases and tempering. */
  readonly goldDelta: number;
}
export type TransactionPlan = Readonly<TransactionSuccess> |
  Readonly<{ ok: false; reason: EconomyFailure }>;

export interface PurchaseOptions {
  readonly playerLevel?: number;
  /** Checked against the authoritative current stock by the integrator. */
  readonly available?: boolean;
}
export interface SaleFlags {
  readonly locked?: boolean;
  readonly favorite?: boolean;
  /** Must reflect authoritative ownership, not a user-provided client claim. */
  readonly owned?: boolean;
}
export interface ServiceOptions {
  readonly playerLevel?: number;
}

export interface EconomyContext {
  readonly vendorId: string;
  /** Class-neutral character level, 1–100. */
  readonly playerLevel: number;
  /** Character gold; used only for validation, never modified here. */
  readonly gold: number;
  /** Explicit unsigned 32-bit seed. No wall-clock state or random calls. */
  readonly seed: number;
  /** Monotonic session refresh counter, not persisted by this module. */
  readonly epoch: number;
  readonly category?: VendorCategory;
}

export type StockResult = Readonly<{
  ok: true;
  vendorId: VendorId;
  seed: number;
  epoch: number;
  offers: readonly Readonly<ShopOffer>[];
}> | Readonly<{ ok: false; reason: EconomyFailure }>;

const MAX_GOLD = Number.MAX_SAFE_INTEGER;
const MAX_BAG_SLOTS = 24;
const MAX_CHARACTER_LEVEL = 100;
const MAX_SEED = 0xffffffff;

const VENDOR_RULES: Readonly<Record<VendorId, Readonly<{
  limit: number;
  rotating: boolean;
}>>> = Object.freeze({
  merchant_bram: Object.freeze({ limit: 5, rotating: false }),
  smith_odan: Object.freeze({ limit: 0, rotating: false }),
  // Future preview-only vendor: not connected to NPCs or persistence.
  traveling_vendor: Object.freeze({ limit: 3, rotating: true })
});

function isInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
    && value >= min && value <= max;
}
function validGold(value: unknown): value is number {
  return isInteger(value, 0, MAX_GOLD);
}
function validLevel(value: unknown): value is number {
  return isInteger(value, 1, MAX_CHARACTER_LEVEL);
}
function failQuote(reason: EconomyFailure): EconomyQuote {
  return Object.freeze({ ok: false as const, reason });
}
function failPlan(reason: EconomyFailure): TransactionPlan {
  return Object.freeze({ ok: false as const, reason });
}
function failStock(reason: EconomyFailure): StockResult {
  return Object.freeze({ ok: false as const, reason });
}
function requiredLevelOf(item: Readonly<Item>): number {
  const base = ITEM_BASES[item.templateId as keyof typeof ITEM_BASES];
  return item.requiredLevel ?? base?.requiredLevel ?? 1;
}
function validItem(item: unknown): item is Item {
  return isItem(item) && item.level <= MAX_CHARACTER_LEVEL
    && validLevel(requiredLevelOf(item))
    && requiredLevelOf(item) <= item.level;
}

/** Avoid aliasing live arrays, affixes, sockets or legendary metadata. */
function itemCopy(item: Readonly<Item>): Readonly<Item> {
  const copy: Item = {
    ...item,
    affixes: item.affixes.map(affix => ({ ...affix })),
    ...(item.sockets !== undefined ? { sockets: [...item.sockets] } : {}),
    ...(item.legendaryPower ? { legendaryPower: { ...item.legendaryPower } } : {})
  };
  copy.affixes.forEach(affix => Object.freeze(affix));
  Object.freeze(copy.affixes);
  if (copy.sockets) Object.freeze(copy.sockets);
  if (copy.legendaryPower) Object.freeze(copy.legendaryPower);
  return Object.freeze(copy);
}
function successQuote(
  kind: EconomyKind, vendorId: VendorId, sourceId: string,
  price: number, requiredLevel: number, item?: Readonly<Item>
): EconomyQuote {
  return Object.freeze({
    ok: true as const, kind, vendorId, sourceId, price,
    currency: 'gold' as const, requiredLevel,
    ...(item !== undefined ? { item: itemCopy(item) } : {})
  });
}

/** Canonical current offer price only: no alternate discount or multiplier. */
export function quotePurchase(offer: string | Readonly<ShopOffer> | null | undefined): EconomyQuote {
  if (offer === null || offer === undefined) return failQuote('UNKNOWN_OFFER');
  const id = typeof offer === 'string' ? offer
    : typeof offer === 'object' ? offer.id : '';
  const canonical = typeof id === 'string' ? getOffer(id) : undefined;
  if (!canonical) return failQuote('UNKNOWN_OFFER');
  if (typeof offer !== 'string') {
    if (!isInteger(offer.price, 1, MAX_GOLD)) return failQuote('INVALID_PRICE');
    if (offer.price !== canonical.price || offer.templateId !== canonical.templateId)
      return failQuote('INVALID_OFFER');
  }
  if (!isInteger(canonical.price, 1, MAX_GOLD)) return failQuote('INVALID_PRICE');
  const template = ITEM_BASES[canonical.templateId];
  if (!template || !validLevel(template.requiredLevel)) return failQuote('INVALID_OFFER');
  return successQuote(
    'purchase', 'merchant_bram', canonical.id, canonical.price, template.requiredLevel
  );
}

/** Prices are delegated to the existing authoritative sellPrice formula. */
export function quoteSale(item: Readonly<Item> | null | undefined): EconomyQuote {
  if (!validItem(item)) return failQuote('INVALID_ITEM');
  const price = sellPrice(item);
  if (!isInteger(price, 1, MAX_GOLD)) return failQuote('INVALID_PRICE');
  return successQuote('sale', 'merchant_bram', item.id, price, requiredLevelOf(item), item);
}

/** Tempering only. No repair/craft/enchant/respec executor is introduced. */
export function quoteTempering(item: Readonly<Item> | null | undefined): EconomyQuote {
  if (!validItem(item)) return failQuote('INVALID_ITEM');
  if (item.upgrades >= 3) return failQuote('MAX_UPGRADES');
  if (!canTemper(item)) return failQuote('SERVICE_UNAVAILABLE');
  const price = temperCost(item);
  if (!isInteger(price, 1, MAX_GOLD)) return failQuote('INVALID_PRICE');
  return successQuote('temper', 'smith_odan', item.id, price, requiredLevelOf(item), item);
}

/**
 * Quote validation is intentionally repeated in every plan: arbitrary quote
 * objects from UI/network callers cannot substitute a negative/cheaper price.
 * Still re-quote from current authoritative objects before *executing* a plan.
 */
function isValidQuote(quote: EconomyQuote | null | undefined, kind: EconomyKind):
  quote is EconomyQuoteSuccess {
  if (!quote || quote.ok !== true || quote.kind !== kind
      || quote.currency !== 'gold'
      || !isInteger(quote.price, 1, MAX_GOLD)
      || !validLevel(quote.requiredLevel)
      || typeof quote.sourceId !== 'string' || !quote.sourceId) return false;
  if (kind === 'purchase') {
    const canonical = getOffer(quote.sourceId);
    const required = canonical ? ITEM_BASES[canonical.templateId]?.requiredLevel : null;
    return quote.vendorId === 'merchant_bram' && quote.item === undefined
      && !!canonical && quote.price === canonical.price
      && quote.requiredLevel === required;
  }
  if (quote.vendorId !== (kind === 'sale' ? 'merchant_bram' : 'smith_odan')
      || !validItem(quote.item) || quote.sourceId !== quote.item.id
      || quote.requiredLevel !== requiredLevelOf(quote.item)) return false;
  return kind === 'sale'
    ? quote.price === sellPrice(quote.item)
    : canTemper(quote.item) && quote.price === temperCost(quote.item);
}
function successPlan(
  quote: EconomyQuoteSuccess, goldBefore: number, goldAfter: number
): TransactionPlan {
  return Object.freeze({
    ok: true as const, kind: quote.kind, currency: 'gold' as const,
    sourceId: quote.sourceId, price: quote.price,
    goldBefore, goldAfter, goldDelta: goldAfter - goldBefore
  });
}
function playerLevelIn(options: ServiceOptions | PurchaseOptions): number {
  return options.playerLevel ?? 1;
}

export function planPurchase(
  quote: EconomyQuote | null, gold: number, freeSlots: number,
  options: Readonly<PurchaseOptions> = {}
): TransactionPlan {
  if (!isValidQuote(quote, 'purchase')) return failPlan('INVALID_QUOTE');
  if (!validGold(gold)) return failPlan('INVALID_BUDGET');
  if (!isInteger(freeSlots, 0, MAX_BAG_SLOTS)) return failPlan('INVALID_CAPACITY');
  if (!options || typeof options !== 'object'
      || (options.available !== undefined && typeof options.available !== 'boolean'))
    return failPlan('INVALID_CONTEXT');
  const level = playerLevelIn(options);
  if (!validLevel(level)) return failPlan('INVALID_LEVEL');
  if (options.available === false) return failPlan('OUT_OF_STOCK');
  if (level < quote.requiredLevel) return failPlan('LEVEL_REQUIRED');
  if (freeSlots === 0) return failPlan('INVENTORY_FULL');
  if (gold < quote.price) return failPlan('INSUFFICIENT_GOLD');
  return successPlan(quote, gold, gold - quote.price);
}

export function planSale(
  quote: EconomyQuote | null, gold: number, flags: Readonly<SaleFlags> = {}
): TransactionPlan {
  if (!isValidQuote(quote, 'sale')) return failPlan('INVALID_QUOTE');
  if (!validGold(gold)) return failPlan('INVALID_BUDGET');
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)
      || Object.keys(flags).some(key => !['locked', 'favorite', 'owned'].includes(key))
      || [flags.locked, flags.favorite, flags.owned].some(value =>
        value !== undefined && typeof value !== 'boolean')) return failPlan('INVALID_FLAGS');
  if (flags.owned === false) return failPlan('MISSING_ITEM');
  if (flags.locked === true) return failPlan('LOCKED_ITEM');
  if (flags.favorite === true) return failPlan('FAVORITE_ITEM');
  if (gold > MAX_GOLD - quote.price) return failPlan('GOLD_CAP');
  return successPlan(quote, gold, gold + quote.price);
}

export function planService(
  quote: EconomyQuote | null, gold: number,
  options: Readonly<ServiceOptions> = {}
): TransactionPlan {
  if (!isValidQuote(quote, 'temper')) return failPlan('INVALID_QUOTE');
  if (!validGold(gold)) return failPlan('INVALID_BUDGET');
  if (!options || typeof options !== 'object') return failPlan('INVALID_CONTEXT');
  const level = playerLevelIn(options);
  if (!validLevel(level)) return failPlan('INVALID_LEVEL');
  if (level < quote.requiredLevel) return failPlan('LEVEL_REQUIRED');
  if (gold < quote.price) return failPlan('INSUFFICIENT_GOLD');
  return successPlan(quote, gold, gold - quote.price);
}

function validContext(value: EconomyContext): boolean {
  return !!value && typeof value === 'object'
    && validLevel(value.playerLevel) && validGold(value.gold)
    && isInteger(value.seed, 0, MAX_SEED) && isInteger(value.epoch, 0, MAX_GOLD)
    && (value.category === undefined || ['all', 'weapon', 'armor', 'offhand', 'accessory']
      .includes(value.category));
}

/**
 * Merchant's current five permanent offers never vary or reprice.
 * A future preview-only traveling vendor deterministically rotates up to
 * three canonical offers. Neither operation grants items or restocks inventory.
 */
export function selectVendorStock(
  context: Readonly<EconomyContext>,
  catalog: readonly Readonly<ShopOffer>[] = SHOP_OFFERS
): StockResult {
  if (!context || typeof context.vendorId !== 'string'
      || !Object.hasOwn(VENDOR_RULES, context.vendorId)) return failStock('UNKNOWN_VENDOR');
  if (!validContext(context)) return failStock('INVALID_CONTEXT');
  if (!Array.isArray(catalog)) return failStock('INVALID_STOCK');

  const ids = new Set<string>();
  for (const offer of catalog) {
    if (!offer || typeof offer !== 'object' || typeof offer.id !== 'string')
      return failStock('INVALID_STOCK');
    if (ids.has(offer.id)) return failStock('DUPLICATE_STOCK');
    ids.add(offer.id);
    const canonical = getOffer(offer.id);
    if (!canonical || !isInteger(offer.price, 1, MAX_GOLD)
        || canonical.price !== offer.price
        || canonical.templateId !== offer.templateId) return failStock('INVALID_STOCK');
  }
  const vendor = context.vendorId as VendorId;
  const rule = VENDOR_RULES[vendor];
  const candidates = SHOP_OFFERS.filter(offer => ids.has(offer.id) && (
    context.category === undefined || context.category === 'all'
    || ITEM_BASES[offer.templateId].category === context.category
  ));
  let offers: readonly Readonly<ShopOffer>[] = candidates;
  if (rule.limit === 0) offers = [];
  else if (rule.rotating && candidates.length > rule.limit) {
    const mixed = (Math.imul((context.seed ^ (context.epoch >>> 0)) >>> 0,
      2654435761) >>> 0);
    const offset = mixed % candidates.length;
    offers = Array.from({ length: rule.limit }, (_, index) =>
      candidates[(offset + index) % candidates.length]);
  } else offers = candidates.slice(0, rule.limit);

  return Object.freeze({
    ok: true as const, vendorId: vendor, seed: context.seed, epoch: context.epoch,
    offers: Object.freeze(offers.map(offer => Object.freeze({ ...offer })))
  });
}

/** Only the next explicitly authorized epoch is accepted; no time-based reset. */
export function refreshOffers(
  context: Readonly<EconomyContext>, nextEpoch: number,
  catalog: readonly Readonly<ShopOffer>[] = SHOP_OFFERS
): StockResult {
  if (!context || !isInteger(context.epoch, 0, MAX_GOLD - 1)
      || !isInteger(nextEpoch, 1, MAX_GOLD)
      || nextEpoch !== context.epoch + 1) return failStock('INVALID_EPOCH');
  return selectVendorStock({ ...context, epoch: nextEpoch }, catalog);
}
