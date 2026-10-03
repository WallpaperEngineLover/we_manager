export interface SearchQuery {
  // what goes to Steam's own search
  steamText: string
  // every one of these must appear in the item, "luna+god"
  requiredTerms: string[]
  // none of these may appear, "-hololive"
  excludeTerms: string[]
}

// Steam's search has no AND or exclusion syntax (several words match any of them), so "+" and "-"
// terms are pulled out here and applied to each result client-side.
export function parseSearchQuery(raw: string): SearchQuery {
  const steamTokens: string[] = []
  const requiredTerms: string[] = []
  const excludeTerms: string[] = []

  for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
    if (token.length > 1 && token.startsWith('-')) {
      excludeTerms.push(token.slice(1).toLowerCase())
      continue
    }
    const parts = token.split('+').filter(Boolean)
    if (token.includes('+') && parts.length > 0) {
      requiredTerms.push(...parts.map((p) => p.toLowerCase()))
      steamTokens.push(...parts)
    } else {
      steamTokens.push(token)
    }
  }

  return { steamText: steamTokens.join(' '), requiredTerms, excludeTerms }
}

export function matchesSearchTerms(haystack: string, query: SearchQuery): boolean {
  const text = haystack.toLowerCase()
  return (
    query.requiredTerms.every((term) => text.includes(term)) &&
    !query.excludeTerms.some((term) => text.includes(term))
  )
}
