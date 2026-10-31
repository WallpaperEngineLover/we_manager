import * as path from 'path'
import { encodeBigInts, decodeBigInts, type SteamHostRequest, type SteamHostResponse } from './steam-host-protocol'

type Koffi = typeof import('koffi')
type SteamClient = ReturnType<typeof import('steamworks.js')['init']>

let client: SteamClient | null = null

function init(appId: number): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const steamworks: typeof import('steamworks.js') = require('steamworks.js')
  client = steamworks.init(appId)
}

// not bound in steamworks.js, so called through the flat C API of the already loaded libsteam_api.so
let steamLib: ReturnType<Koffi['load']> | null = null
let ugc: {
  ptr: unknown
  setUserItemVote: (ugc: unknown, itemId: bigint, voteUp: boolean) => bigint
  addItemToFavorites: (ugc: unknown, appId: number, itemId: bigint) => bigint
  removeItemFromFavorites: (ugc: unknown, appId: number, itemId: bigint) => bigint
} | null = null
let isLoggedOn: (() => boolean) | null = null

function getSteamLib(): ReturnType<Koffi['load']> {
  if (!steamLib) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi: Koffi = require('koffi')
    const libPath = path.join(
      path.dirname(require.resolve('steamworks.js')),
      'dist', 'linux64', 'libsteam_api.so'
    ).replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked')
    steamLib = koffi.load(libPath)
  }
  return steamLib
}

function getUgc(): NonNullable<typeof ugc> {
  if (!ugc) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi: Koffi = require('koffi')
    const lib = getSteamLib()
    const ugcPtrType = koffi.pointer(koffi.opaque('ISteamUGC'))
    ugc = {
      ptr: lib.func('SteamAPI_SteamUGC_v020', ugcPtrType, [])(),
      setUserItemVote: lib.func('SteamAPI_ISteamUGC_SetUserItemVote', 'uint64', [ugcPtrType, 'uint64', 'bool']),
      addItemToFavorites: lib.func('SteamAPI_ISteamUGC_AddItemToFavorites', 'uint64', [ugcPtrType, 'uint32', 'uint64']),
      removeItemFromFavorites: lib.func('SteamAPI_ISteamUGC_RemoveItemFromFavorites', 'uint64', [ugcPtrType, 'uint32', 'uint64'])
    }
  }
  return ugc
}

// 0 = k_uAPICallInvalid
function voteRaw(itemId: bigint, voteUp: boolean): bigint {
  const api = getUgc()
  const handle = api.setUserItemVote(api.ptr, itemId, voteUp)
  if (handle === 0n) throw new Error('SetUserItemVote failed')
  return handle
}

function favoriteRaw(appId: number, itemId: bigint, add: boolean): bigint {
  const api = getUgc()
  const handle = add ? api.addItemToFavorites(api.ptr, appId, itemId) : api.removeItemFromFavorites(api.ptr, appId, itemId)
  if (handle === 0n) throw new Error(add ? 'AddItemToFavorites failed' : 'RemoveItemFromFavorites failed')
  return handle
}

function isOnline(): boolean {
  if (!isLoggedOn) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi: Koffi = require('koffi')
    const lib = getSteamLib()
    const userPtrType = koffi.pointer(koffi.opaque('ISteamUser'))
    const userPtr = lib.func('SteamAPI_SteamUser_v023', userPtrType, [])()
    const bLoggedOn = lib.func('SteamAPI_ISteamUser_BLoggedOn', 'bool', [userPtrType])
    isLoggedOn = () => bLoggedOn(userPtr)
  }
  return isLoggedOn()
}

async function call(method: string, args: unknown[]): Promise<unknown> {
  if (method === 'init') {
    init(args[0] as number)
    return null
  }
  if (!client) throw new Error('Steam not initialized')
  if (method === 'voteRaw') return voteRaw(args[0] as bigint, args[1] as boolean)
  if (method === 'favoriteRaw') return favoriteRaw(args[0] as number, args[1] as bigint, args[2] as boolean)
  if (method === 'isOnline') return isOnline()
  if (method === 'hasMethod') {
    const [ns, fn] = (args[0] as string).split('.')
    return typeof (client as unknown as Record<string, Record<string, unknown>>)[ns]?.[fn] === 'function'
  }

  const [ns, fn] = method.split('.')
  const target = (client as unknown as Record<string, Record<string, unknown>>)[ns]
  const func = target?.[fn]
  if (typeof func !== 'function') throw new Error(`Unknown Steam method ${method}`)
  return await func.apply(target, args)
}

process.parentPort.on('message', (e) => {
  const req = decodeBigInts(e.data) as SteamHostRequest
  call(req.method, req.args).then(
    (result) => { process.parentPort.postMessage(encodeBigInts({ id: req.id, result } satisfies SteamHostResponse)) },
    (err: unknown) => { process.parentPort.postMessage({ id: req.id, error: err instanceof Error ? err.message : String(err) } satisfies SteamHostResponse) }
  )
})
