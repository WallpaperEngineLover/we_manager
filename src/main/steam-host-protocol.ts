export interface SteamHostRequest {
  id: number
  method: string
  args: unknown[]
}

export interface SteamHostResponse {
  id: number
  result?: unknown
  error?: string
}

const BIGINT_TAG = '__bigint'

// steamworks.js hands out bigints (item ids, steam ids), tagged so they survive the process hop
export function encodeBigInts(value: unknown): unknown {
  if (typeof value === 'bigint') return { [BIGINT_TAG]: value.toString() }
  if (Array.isArray(value)) return value.map(encodeBigInts)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = encodeBigInts(v)
    return out
  }
  return value
}

export function decodeBigInts(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeBigInts)
  if (value && typeof value === 'object') {
    const tagged = (value as Record<string, unknown>)[BIGINT_TAG]
    if (typeof tagged === 'string' && Object.keys(value).length === 1) return BigInt(tagged)
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = decodeBigInts(v)
    return out
  }
  return value
}
