import Store from 'electron-store'
import { app } from 'electron'

// a Steam Workshop list (liked, favorited) cached on disk, refreshed by a background crawl

interface ListCacheStore {
  accountId: number | null
  // "up" = on the list, named after the liked list's layout
  up: string[]
  missing: string[]
  lastFullSync: number
  pending: Record<string, { up: boolean; at: number }>
}

export interface ListSource {
  canSync: () => boolean
  getAccountId: () => Promise<number>
  crawl: (accountId: number, onPage: (ids: string[]) => void) => Promise<Set<string>>
}

// Steam's lists lag, local changes win until the crawl agrees or this runs out
const PENDING_TTL_MS = 15 * 60 * 1000
const SETTLE_MS = 10_000
const PERSIST_DELAY_MS = 3000
const FULL_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000
const PROGRESS_NOTIFY_INTERVAL_MS = 15 * 1000
// read-back crawls after a local change, the last one past PENDING_TTL_MS gives up
const VERIFY_STEPS_MS = [15_000, 60_000, 4 * 60_000, 10 * 60_000, PENDING_TTL_MS + 30_000]
const VERIFY_RETRY_MS = 60_000

export type VerifyListener = (id: string, on: boolean, confirmed: boolean) => void

function sameIds(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

export class SteamListCache {
  private store: Store<ListCacheStore>
  private ids: Set<string>
  // dropped only after two full crawls miss it, pagination drifts
  private missingLastCycle: Set<string>
  private pending: Map<string, { up: boolean; at: number }>
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private persistDirty = false
  private syncInFlight = false
  private lastSyncFailure = 0
  private listener: ((ids: string[]) => void) | null = null
  private verifyListener: VerifyListener | null = null
  private verifyTimer: ReturnType<typeof setTimeout> | null = null
  private lastCrawlStart = 0

  constructor(
    private label: string,
    storeName: string,
    private source: ListSource
  ) {
    this.store = new Store<ListCacheStore>({
      name: storeName,
      defaults: { accountId: null, up: [], missing: [], lastFullSync: 0, pending: {} }
    })
    this.ids = new Set(this.store.get('up'))
    this.missingLastCycle = new Set(this.store.get('missing'))
    this.pending = new Map(
      Object.entries(this.store.get('pending')).filter(([, v]) => Date.now() - v.at <= PENDING_TTL_MS)
    )
    app.on('will-quit', () => this.flush())
  }

  has(id: string): boolean {
    return this.ids.has(id)
  }

  list(): string[] {
    return [...this.ids]
  }

  onChange(cb: (ids: string[]) => void): void {
    this.listener = cb
  }

  /** Reports each local change once, after the read-back crawls confirm it or give up */
  onVerified(cb: VerifyListener): void {
    this.verifyListener = cb
    this.scheduleVerify()
  }

  unverified(): string[] {
    return [...this.pending.keys()]
  }

  private notify(): void {
    this.listener?.([...this.ids])
  }

  /** A change made here and accepted by Steam */
  record(id: string, on: boolean): void {
    this.pending.set(id, { up: on, at: Date.now() })
    if (on) this.ids.add(id)
    else this.ids.delete(id)
    this.missingLastCycle.delete(id)
    this.persist()
    this.scheduleVerify()
  }

  /** A local change younger than SETTLE_MS still wins */
  applyCheck(id: string, on: boolean): boolean {
    const pending = this.pending.get(id)
    if (pending && Date.now() - pending.at < SETTLE_MS) return pending.up
    this.pending.delete(id)
    this.missingLastCycle.delete(id)
    if (this.ids.has(id) !== on) {
      if (on) this.ids.add(id)
      else this.ids.delete(id)
      this.persist()
      this.notify()
    }
    return on
  }

  private applyPending(fresh: Set<string>): Set<string> {
    const now = Date.now()
    const merged = new Set(fresh)
    for (const [id, change] of this.pending) {
      const agrees = fresh.has(id) === change.up
      if (agrees || now - change.at > PENDING_TTL_MS) {
        this.pending.delete(id)
        this.verifyListener?.(id, change.up, agrees)
        continue
      }
      if (change.up) merged.add(id)
      else merged.delete(id)
    }
    return merged
  }

  // batched, a 100k-id list is a few MB
  private persist(): void {
    this.persistDirty = true
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => this.flush(), PERSIST_DELAY_MS)
  }

  private flush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    if (!this.persistDirty) return
    this.persistDirty = false
    this.store.set('up', [...this.ids])
    this.store.set('missing', [...this.missingLastCycle])
    this.store.set('pending', Object.fromEntries(this.pending))
  }

  private async runFullSync(): Promise<void> {
    const accountId = await this.source.getAccountId()
    const known = this.store.get('accountId')
    if (known !== null && known !== accountId) {
      this.ids = new Set()
      this.missingLastCycle = new Set()
      this.pending.clear()
      this.notify()
    }
    this.store.set('accountId', accountId)

    // additive, a partial crawl can't tell missing from not reached yet
    let lastNotify = Date.now()
    const seen = await this.source.crawl(accountId, (pageIds) => {
      let added = false
      for (const id of pageIds) {
        if (!this.ids.has(id) && this.pending.get(id)?.up !== false) {
          this.ids.add(id)
          added = true
        }
      }
      if (!added) return
      this.persist()
      if (Date.now() - lastNotify >= PROGRESS_NOTIFY_INTERVAL_MS) {
        lastNotify = Date.now()
        this.notify()
      }
    })

    const fresh = this.applyPending(seen)
    const merged = new Set(fresh)
    const missingThisCycle = new Set<string>()
    for (const id of this.ids) {
      if (fresh.has(id) || this.missingLastCycle.has(id)) continue
      merged.add(id)
      missingThisCycle.add(id)
    }
    const changed = !sameIds(this.ids, merged)
    this.missingLastCycle = missingThisCycle
    this.ids = merged
    this.store.set('lastFullSync', Date.now())
    this.persist()
    if (changed) this.notify()
    console.log(`[Steam] ${this.label} synced: ${this.ids.size} items`)
  }

  maybeSync(): void {
    if (this.syncInFlight || !this.source.canSync()) return
    const now = Date.now()
    if (now - this.store.get('lastFullSync') < FULL_SYNC_INTERVAL_MS) return
    if (now - this.lastSyncFailure < RETRY_AFTER_FAILURE_MS) return
    this.startSync()
  }

  private startSync(): void {
    this.syncInFlight = true
    this.lastCrawlStart = Date.now()
    this.runFullSync()
      .catch((err) => {
        this.lastSyncFailure = Date.now()
        console.warn(`[Steam] ${this.label} sync failed, will retry later:`, err?.message ?? err)
      })
      .finally(() => {
        this.syncInFlight = false
        this.scheduleVerify()
      })
  }

  private scheduleVerify(): void {
    if (!this.verifyListener) return
    if (this.verifyTimer) clearTimeout(this.verifyTimer)
    this.verifyTimer = null
    if (this.syncInFlight || this.pending.size === 0) return
    let due = Infinity
    for (const { at } of this.pending.values()) {
      // a crawl started before this step can't have seen the change
      const step = VERIFY_STEPS_MS.find((s) => at + s > this.lastCrawlStart)
      due = Math.min(due, step === undefined ? this.lastCrawlStart + VERIFY_RETRY_MS : at + step)
    }
    this.verifyTimer = setTimeout(() => this.verifyNow(), Math.max(0, due - Date.now()))
  }

  private verifyNow(): void {
    this.verifyTimer = null
    if (this.syncInFlight) return
    if (!this.source.canSync()) {
      this.verifyTimer = setTimeout(() => this.verifyNow(), VERIFY_RETRY_MS)
      return
    }
    this.startSync()
  }
}
