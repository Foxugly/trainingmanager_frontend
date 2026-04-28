export interface AvailableLanguage {
  code: 'fr' | 'nl' | 'en' | 'it' | 'es';
  nativeName: string;
}

export const AVAILABLE_LANGUAGES: AvailableLanguage[] = [
  { code: 'fr', nativeName: 'Français' },
  { code: 'nl', nativeName: 'Nederlands' },
  { code: 'en', nativeName: 'English' },
  { code: 'it', nativeName: 'Italiano' },
  { code: 'es', nativeName: 'Español' },
];

export type LanguageCode = AvailableLanguage['code'];
