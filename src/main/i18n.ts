import { app } from 'electron'
import { resolveLanguage, translate, type Language, type MessageKey, type Params } from '@shared/i18n'
import { getLanguagePreference } from './services/config.service'

export function uiLanguage(): Language {
  return resolveLanguage(getLanguagePreference(), [...app.getPreferredSystemLanguages(), app.getLocale()])
}

export function t(key: MessageKey, params?: Params): string {
  return translate(uiLanguage(), key, params)
}
