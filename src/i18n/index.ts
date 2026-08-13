import 'intl-pluralrules';

import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zhHans from './locales/zh-Hans.json';

export type ResolvedLanguage = 'en' | 'zh-Hans';

/** User-facing preference: an explicit language, or follow the device. */
export type AppLanguage = 'system' | ResolvedLanguage;

const LANGUAGE_STORAGE_KEY = 'app-language';

export function systemLanguage(): ResolvedLanguage {
  const code = getLocales()[0]?.languageCode;
  return code === 'zh' ? 'zh-Hans' : 'en';
}

export function resolveLanguage(preference: AppLanguage): ResolvedLanguage {
  return preference === 'system' ? systemLanguage() : preference;
}

export async function getStoredLanguage(): Promise<AppLanguage> {
  try {
    const stored = await SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY);
    return stored === 'en' || stored === 'zh-Hans' || stored === 'system'
      ? stored
      : 'system';
  } catch {
    // An unreadable preference falls back to the device language.
    return 'system';
  }
}

export async function setAppLanguage(preference: AppLanguage): Promise<void> {
  await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, preference);
  await i18n.changeLanguage(resolveLanguage(preference));
}

/**
 * Applies the persisted language override once at startup. Runs while the
 * auth gate still shows the (text-free) loading screen, so a stored override
 * does not flash English first.
 */
export async function applyStoredLanguage(): Promise<void> {
  const preference = await getStoredLanguage();
  const resolved = resolveLanguage(preference);
  if (resolved !== i18n.language) {
    await i18n.changeLanguage(resolved);
  }
}

// Resources are bundled, so init is effectively synchronous and `t` is
// usable as soon as this module is imported.
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-Hans': { translation: zhHans },
  },
  lng: systemLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  initAsync: false,
});

export default i18n;
