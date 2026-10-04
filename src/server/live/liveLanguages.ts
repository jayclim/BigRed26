// Live-only speech languages. Pure module (no imports) so the server, the browser and `npm run check` share it.
// The classic step modes stay en/es (contract Locale). Every code below is on the Gemini Live "supported languages" list
// (https://ai.google.dev/gemini-api/docs/live-api/capabilities, read 2026-10-03). Native audio models pick the language
// themselves and do not accept an explicit speech language code, so the system instruction sets the language.

export interface LiveLanguage { code: string; english: string; native: string; rtl?: true }

export const LIVE_LANGUAGES: readonly LiveLanguage[] = [
  { code: 'en', english: 'English', native: 'English' },
  { code: 'es', english: 'Spanish', native: 'Español' },
  { code: 'zh-Hans', english: 'Chinese (Mandarin, Simplified)', native: '中文（简体）' },
  { code: 'zh-Hant', english: 'Chinese (Mandarin, Traditional)', native: '中文（繁體）' },
  { code: 'hi', english: 'Hindi', native: 'हिन्दी' },
  { code: 'ar', english: 'Arabic', native: 'العربية', rtl: true },
  { code: 'fr', english: 'French', native: 'Français' },
  { code: 'pt-BR', english: 'Portuguese (Brazil)', native: 'Português (Brasil)' },
  { code: 'bn', english: 'Bengali', native: 'বাংলা' },
  { code: 'ru', english: 'Russian', native: 'Русский' },
  { code: 'ja', english: 'Japanese', native: '日本語' },
  { code: 'ko', english: 'Korean', native: '한국어' },
  { code: 'de', english: 'German', native: 'Deutsch' },
  { code: 'vi', english: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'fil', english: 'Filipino (Tagalog)', native: 'Filipino' },
  { code: 'it', english: 'Italian', native: 'Italiano' },
  { code: 'tr', english: 'Turkish', native: 'Türkçe' },
  { code: 'id', english: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'th', english: 'Thai', native: 'ไทย' },
  { code: 'pl', english: 'Polish', native: 'Polski' },
  { code: 'uk', english: 'Ukrainian', native: 'Українська' },
  { code: 'nl', english: 'Dutch', native: 'Nederlands' },
  { code: 'ur', english: 'Urdu', native: 'اردو', rtl: true },
  { code: 'ta', english: 'Tamil', native: 'தமிழ்' },
  { code: 'sw', english: 'Swahili', native: 'Kiswahili' },
];

export const DEFAULT_LIVE_LANGUAGE = 'en';
export const LIVE_LANGUAGE_STORAGE_KEY = 'breadcrumb.live.language';

const byCode = new Map(LIVE_LANGUAGES.map((l) => [l.code, l]));
export const liveLanguage = (code: unknown): LiveLanguage | undefined => (typeof code === 'string' ? byCode.get(code) : undefined);
export const isLiveLanguage = (code: unknown): code is string => liveLanguage(code) !== undefined;

/** Maps a browser or stored tag such as "zh-TW", "pt_PT", "tl" or "en-GB" to a supported code, or undefined. */
export function matchLiveLanguage(tag: unknown): string | undefined {
  if (typeof tag !== 'string') return undefined;
  const parts = tag.trim().replace(/_/g, '-').split('-').filter(Boolean);
  if (!parts.length) return undefined;
  const primary = parts[0].toLowerCase();
  const rest = parts.slice(1).map((p) => p.toLowerCase());
  if (primary === 'zh') return rest.includes('hant') || rest.some((p) => p === 'tw' || p === 'hk' || p === 'mo') ? 'zh-Hant' : 'zh-Hans';
  if (primary === 'pt') return 'pt-BR';
  if (primary === 'tl') return 'fil';
  return byCode.has(primary) ? primary : undefined;
}

/** A saved choice wins, then the first supported browser language, then English. */
export function pickDefaultLanguage(browserLanguages: readonly string[] | undefined, stored?: string | null): string {
  if (isLiveLanguage(stored)) return stored;
  for (const tag of browserLanguages ?? []) { const match = matchLiveLanguage(tag); if (match) return match; }
  return DEFAULT_LIVE_LANGUAGE;
}

/** The two classic-mode locales the live screen UI text supports. Other languages use English interface text. */
export const uiLocaleFor = (code: string): 'en' | 'es' => (code === 'es' ? 'es' : 'en');
