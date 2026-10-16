import { Fragment, type ReactNode } from 'react'
import {
  isLanguage,
  resolveLanguage,
  translate,
  translateIfKnown,
  catalog,
  type Language,
  type MessageKey,
  type Params
} from '@shared/i18n'

const CACHE_KEY = 'ui-language'

function initialLanguage(): Language {
  const cached = localStorage.getItem(CACHE_KEY)
  return isLanguage(cached) ? cached : resolveLanguage('system', navigator.languages)
}

let current: Language = initialLanguage()
document.documentElement.lang = current

export function currentLanguage(): Language {
  return current
}

/** App remounts the views on a change */
export function setLanguage(language: Language): void {
  if (language === current) return
  current = language
  localStorage.setItem(CACHE_KEY, language)
  document.documentElement.lang = language
}

export function t(key: MessageKey, params?: Params): string {
  return translate(current, key, params)
}

/** Like t(), but placeholders can be elements: tn('foo', { path: <code>{p}</code> }) */
export function tn(key: MessageKey, params: Record<string, ReactNode>): ReactNode {
  const parts = translate(current, key).split(/\{(\w+)\}/)
  return parts.map((part, i) => {
    if (i % 2 === 0) return part
    return <Fragment key={i}>{part in params ? params[part] : `{${part}}`}</Fragment>
  })
}

export function formatNumber(value: number): string {
  return value.toLocaleString(current)
}

/** For keys built from data */
export function translatedOr(key: string, fallback: string): string {
  return translateIfKnown(current, key) ?? fallback
}

// project.json spells some tags differently than the Workshop filter
const TAG_ALIASES: Record<string, string> = {
  unspecified: 'Unspecified Genre'
}

let tagKeys: Map<string, string> | null = null

/** Workshop tags stay Steam's English names */
export function tagLabel(tag: string): string {
  if (!tagKeys) {
    tagKeys = new Map(
      Object.keys(catalog('en'))
        .filter((key) => key.startsWith('tag.'))
        .map((key) => [key.slice(4).toLowerCase(), key])
    )
  }
  const lower = tag.toLowerCase()
  const key = tagKeys.get(TAG_ALIASES[lower]?.toLowerCase() ?? lower)
  return key ? translatedOr(key, tag) : tag
}

/** Lowercased mid-sentence, except German nouns */

export function inSentence(label: string): string {
  return current === 'de' ? label : label.toLocaleLowerCase(current)
}
