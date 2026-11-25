// GPL-3.0-only — display metadata, never a storage or entity key.
export const MAX_CHARACTER_NAME_LENGTH = 32;
export function normalizeCharacterName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!/^[\p{L}\p{M}\p{N} '\u2019-]+$/u.test(value)) return null;
  const name = value.normalize('NFC').trim().replace(/ +/g, ' ');
  return name.length > 0 && name.length <= MAX_CHARACTER_NAME_LENGTH && /[\p{L}\p{N}]/u.test(name)
    ? name : null;
}
