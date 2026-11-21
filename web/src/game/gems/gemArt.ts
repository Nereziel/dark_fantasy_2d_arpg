/** Presentation identity for the six gem/rune families (three tiers each).
 * No gear/socket data or RNG is owned by this module. GPL-3.0-only.
 */
import { isGemId, baseOf, tierOf, type GemId, type GemBaseId, type GemTier } from './gemCatalog';

export type GemArtVariant = Readonly<{
  baseId: GemBaseId;
  kind: 'gem' | 'rune';
  tier: GemTier;
}>;

export function gemArtVariant(id: unknown): GemArtVariant | null {
  if (!isGemId(id)) return null;
  const gemId = id as GemId;
  const base = baseOf(gemId);
  return Object.freeze({ baseId: base.id, kind: base.kind, tier: tierOf(gemId) });
}
