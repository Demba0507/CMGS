import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import fr, { type TranslationKey } from '@/lib/i18n/fr';
import en from '@/lib/i18n/en';

export type Language = 'fr' | 'en';
const DICTIONARIES: Record<Language, Record<TranslationKey, string>> = { fr, en };
const STORAGE_KEY = 'cmgs.language';

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'fr';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'en' ? 'en' : 'fr';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, []);

  const t = useCallback((key: TranslationKey) => DICTIONARIES[language][key] ?? DICTIONARIES.fr[key] ?? key, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation doit être utilisé à l\'intérieur de <I18nProvider>.');
  return ctx;
}
