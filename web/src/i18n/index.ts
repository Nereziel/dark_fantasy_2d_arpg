import { addMessages, init, locale } from 'svelte-i18n';
import cs from './locales/cs.json';
import en from './locales/en.json';
import { VILLAGE_QUEST_TEXT } from '../game/quests/villageQuests';

export type Language = 'cs' | 'en';
export const languageOptions: ReadonlyArray<{ code: Language; label: string }> = [
  { code: 'cs', label: 'Čeština' },
  { code: 'en', label: 'English' }
];
const KEY = 'aether-ruin-language';
let initialized = false;

function initialLanguage(): Language {
  try {
    const value = localStorage.getItem(KEY);
    if (value === 'cs' || value === 'en') return value;
  } catch { /* Storage can be blocked by the browser. */ }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('cs')
    ? 'cs' : 'en';
}

export function initLocalization(): void {
  if (initialized) return;
  initialized = true;
  addMessages('cs', cs);
  addMessages('en', en);
  // Convert dotted catalog keys to the nested shape used by svelte-i18n.
  for(const language of ['cs','en'] as const){
    const village:Record<string,Record<string,string>>={};
    for(const [key,value] of Object.entries(VILLAGE_QUEST_TEXT[language])){
      const [, , id, field]=key.split('.');
      (village[id!]??={})[field!]=value;
    }
    addMessages(language,{quest:{village}});
  }
  const chosen = initialLanguage();
  init({ fallbackLocale: 'en', initialLocale: chosen });
  if (typeof document !== 'undefined') document.documentElement.lang = chosen;
}

export function setLanguage(next: Language): void {
  if (next !== 'cs' && next !== 'en') return;
  locale.set(next);
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  try { localStorage.setItem(KEY, next); } catch { /* Preferences are best-effort. */ }
}
