/** Starter archetypes and primary attributes transcribed from the legacy HTML engine. */
export type ClassId = 'WARRIOR' | 'PALADIN' | 'MAGE' | 'ROGUE' | 'NECROMANCER' | 'WARLOCK';
export interface PrimaryStats {
  strength: number;
  dexterity: number;
  intelligence: number;
  vitality: number;
  willpower: number;
}
export interface ClassDefinition {
  icon: string;
  color: number;
  resourceId: 'rage' | 'faith' | 'mana' | 'energy' | 'essence' | 'soul';
  resourceMax: number;
  resourceInitial: number;
  regenRate: number;
  attackRange: number;
  primary: PrimaryStats;
}
export const CLASSES: Record<ClassId, ClassDefinition> = {
  WARRIOR: {
    icon: '⚔', color: 0xb7a77a, resourceId: 'rage',
    resourceMax: 100, resourceInitial: 40, regenRate: -2, attackRange: 76,
    primary: { strength: 22, dexterity: 14, intelligence: 8, vitality: 20, willpower: 10 }
  },
  PALADIN: {
    icon: '✝', color: 0xf2cf82, resourceId: 'faith',
    resourceMax: 100, resourceInitial: 100, regenRate: 3.5, attackRange: 78,
    primary: { strength: 18, dexterity: 10, intelligence: 14, vitality: 22, willpower: 16 }
  },
  MAGE: {
    icon: '✦', color: 0x78b7ff, resourceId: 'mana',
    resourceMax: 120, resourceInitial: 120, regenRate: 8, attackRange: 225,
    primary: { strength: 8, dexterity: 12, intelligence: 24, vitality: 14, willpower: 18 }
  },
  ROGUE: {
    icon: '⌁', color: 0xd8b976, resourceId: 'energy',
    resourceMax: 100, resourceInitial: 100, regenRate: 15, attackRange: 82,
    primary: { strength: 12, dexterity: 24, intelligence: 10, vitality: 16, willpower: 12 }
  },
  NECROMANCER: {
    icon: '☠', color: 0x79c1a9, resourceId: 'essence',
    resourceMax: 100, resourceInitial: 60, regenRate: 2.5, attackRange: 210,
    primary: { strength: 10, dexterity: 12, intelligence: 22, vitality: 16, willpower: 18 }
  },
  WARLOCK: {
    icon: '◈', color: 0xba89ce, resourceId: 'soul',
    resourceMax: 100, resourceInitial: 50, regenRate: 3, attackRange: 205,
    primary: { strength: 10, dexterity: 10, intelligence: 22, vitality: 18, willpower: 20 }
  }
};
export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];
export function isClassId(id: unknown): id is ClassId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(CLASSES, id);
}
