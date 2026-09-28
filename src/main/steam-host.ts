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

// ISteamUGC::SetUserItemVote and ISteamUser::BLoggedOn are not bound in steamworks.js, so they
// go through the flat C API. libsteam_api.so is already loaded by steamworks.js, dlopen just
// returns the existing handle.
let steamLib: ReturnType<Koffi['load']> | null = null
let setUserItemVote: ((ugc: unknown, itemId: bigint, voteUp: boolean) => bigint) | null = null
let ugcPtr: unknown = null
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

function voteRaw(itemId: bigint, voteUp: boolean): bigint {
  if (!setUserItemVote) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi: Koffi = require('koffi')
    const lib = getSteamLib()
    const ugcPtrType = koffi.pointer(koffi.opaque('ISteamUGC'))
    ugcPtr = lib.func('SteamAPI_SteamUGC_v020', ugcPtrType, [])()
    setUserItemVote = lib.func('SteamAPI_ISteamUGC_SetUserItemVote', 'uint64', [ugcPtrType, 'uint64', 'bool'])
  }
  const handle = setUserItemVote(ugcPtr, itemId, voteUp)
  // k_uAPICallInvalid = 0 means the call failed immediately
  if (handle === 0n) throw new Error('SetUserItemVote failed')
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
    (result) => process.parentPort.postMessage(encodeBigInts({ id: req.id, result } satisfies SteamHostResponse)),
    (err) => process.parentPort.postMessage({ id: req.id, error: (err as Error)?.message ?? String(err) } satisfies SteamHostResponse)
  )
})
