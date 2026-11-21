/** Stable item-template illustration keys, independent of the legacy Unicode icon.
 * Never change item instance IDs, RNG or any character-save fields. GPL-3.0-only.
 */
import { ITEM_BASES } from './itemCatalog';

const ART = {
  broadsword:'sword', greatsword:'greatsword', axe:'axe', greataxe:'greataxe',
  mace:'mace', hammer:'hammer', dagger:'dagger', spear:'spear',
  bow:'bow', crossbow:'crossbow', staff:'staff', wand:'wand',
  spellbook:'spellbook', shield:'shield', helm:'helmet',
  hauberk:'armor', gauntlets:'gloves', greaves:'boots', belt:'belt',
  bloodstone:'amulet', signet:'ring', relic:'relic', charm:'charm'
} as const satisfies Record<keyof typeof ITEM_BASES, string>;

export type ItemArtKind = (typeof ART)[keyof typeof ART] | 'missing';

export function itemArtKind(templateId: unknown): ItemArtKind {
  if (typeof templateId !== 'string' || !Object.hasOwn(ART, templateId)) return 'missing';
  return ART[templateId as keyof typeof ART];
}
