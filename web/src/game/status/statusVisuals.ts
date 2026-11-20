/**
 * Canonical visual hooks for all fifteen status effects.
 * Exactly one descriptor per ID; Phaser draws these passively with zero effects
 * on HP, timers, combat collision or the authoritative status reducer.
 * Original project work: GPL-3.0-only.
 */
import { STATUS_IDS, type StatusId } from './statusDefinitions';
import type { StatusInstance } from './statusRuntime';

export interface StatusVisual {
  readonly id: StatusId;
  readonly color: number;
  readonly glyph: 'ring' | 'rune' | 'cross' | 'shield' | 'spark' | 'root';
  readonly positive: boolean;
}
export const STATUS_VISUALS: Readonly<Record<StatusId, StatusVisual>> = Object.freeze({
  burning: {id:'burning',color:0xff7540,glyph:'spark',positive:false},
  chilled: {id:'chilled',color:0x84d5fa,glyph:'ring',positive:false},
  frozen: {id:'frozen',color:0xb3e6fb,glyph:'rune',positive:false},
  poisoned: {id:'poisoned',color:0x77d17a,glyph:'spark',positive:false},
  bleeding: {id:'bleeding',color:0xb8515c,glyph:'cross',positive:false},
  stunned: {id:'stunned',color:0xf4d078,glyph:'rune',positive:false},
  slowed: {id:'slowed',color:0x97b3c7,glyph:'root',positive:false},
  rooted: {id:'rooted',color:0x996d55,glyph:'root',positive:false},
  silenced: {id:'silenced',color:0xb38bb6,glyph:'cross',positive:false},
  cursed: {id:'cursed',color:0x9e69c4,glyph:'rune',positive:false},
  vulnerable: {id:'vulnerable',color:0xdd8298,glyph:'cross',positive:false},
  fortified: {id:'fortified',color:0x98c2e5,glyph:'shield',positive:true},
  shielded: {id:'shielded',color:0xb3d8f1,glyph:'shield',positive:true},
  regeneration: {id:'regeneration',color:0x8bd7ab,glyph:'spark',positive:true},
  haste: {id:'haste',color:0xe6c775,glyph:'ring',positive:true}
});

/** Renderer cannot invent a status or draw unknown untrusted IDs. */
export function statusVisuals(active: readonly StatusInstance[]): readonly StatusVisual[] {
  const used = new Set<string>();
  const visuals: StatusVisual[] = [];
  for (const status of active) {
    if (!STATUS_IDS.includes(status.id as StatusId) || used.has(status.id)) continue;
    used.add(status.id);
    visuals.push(STATUS_VISUALS[status.id as StatusId]);
  }
  return visuals;
}
