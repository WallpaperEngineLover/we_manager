import { en } from './locales/en'
import { de } from './locales/de'
import { es } from './locales/es'
import { fr } from './locales/fr'
import { it } from './locales/it'
import { pt } from './locales/pt'
import { pl } from './locales/pl'
import { ru } from './locales/ru'
import { tr } from './locales/tr'
import { ja } from './locales/ja'
import { ko } from './locales/ko'
import { zhCN } from './locales/zh-CN'
import { zhTW } from './locales/zh-TW'

export type Messages = Record<string, string>

type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'
type StripPlural<K> = K extends `${infer Base}_${PluralSuffix}` ? Base : K
export type MessageKey = StripPlural<keyof typeof en>

export type Params = Record<string, string | number>

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português (Brasil)' },
  { code: 'pl', name: 'Polski' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ru', name: 'Русский' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁體中文' }
] as const

export type Language = (typeof LANGUAGES)[number]['code']
export type LanguagePreference = Language | 'system'

const CATALOGS: Record<Language, Messages> = {
  en,
  de,
  es,
  fr,
  it,
  pt,
  pl,
  ru,
  tr,
  ja,
  ko,
  'zh-CN': zhCN,
  'zh-TW': zhTW
}

export function catalog(language: Language): Messages {
  return CATALOGS[language]
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && value in CATALOGS
}

export function normalizeLanguagePreference(value: unknown): LanguagePreference {
  return isLanguage(value) ? value : 'system'
}

function matchLocale(locale: string): Language | null {
  const tag = locale.replace('_', '-').toLowerCase()
  if (tag.startsWith('zh')) {
    return /-(tw|hk|mo|hant)/.test(tag) ? 'zh-TW' : 'zh-CN'
  }
  const base = tag.split('-')[0]
  return isLanguage(base) ? base : null
}

export function resolveLanguage(preference: LanguagePreference, systemLocales: readonly string[]): Language {
  if (preference !== 'system') return preference
  for (const locale of systemLocales) {
    const match = matchLocale(locale)
    if (match) return match
  }
  return 'en'
}

const pluralRules = new Map<Language, Intl.PluralRules>()

function pluralCategory(language: Language, count: number): string {
  let rules = pluralRules.get(language)
  if (!rules) {
    rules = new Intl.PluralRules(language)
    pluralRules.set(language, rules)
  }
  return rules.select(count)
}

function lookup(messages: Messages, key: string, language: Language, count: unknown): string | undefined {
  if (typeof count === 'number') {
    return messages[`${key}_${pluralCategory(language, count)}`] ?? messages[`${key}_other`] ?? messages[key]
  }
  return messages[key]
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

/** Plurals from `count`; missing keys fall back to English, then the key */

export function translate(language: Language, key: MessageKey, params?: Params): string {
  const count = params?.count
  const template =
    lookup(CATALOGS[language], key, language, count) ?? lookup(en, key, 'en', count) ?? key
  return interpolate(template, params)
}

/** For text that only sometimes has a translation, like Workshop tag names */
export function translateIfKnown(language: Language, key: string): string | undefined {
  return CATALOGS[language][key] ?? en[key as keyof typeof en]
}

