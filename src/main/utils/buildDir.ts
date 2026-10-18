import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

/**
 * Where the engine is built from source: in the user's own cache folder. It used to be /tmp/lwe-build, one name for
 * everyone on a shared, world writable /tmp, so another user could have made it first, and the install runs the build's
 * make as root.
 */
export function lweBuildDir(env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): string {
  const cache = env.XDG_CACHE_HOME && path.isAbsolute(env.XDG_CACHE_HOME) ? env.XDG_CACHE_HOME : path.join(home, '.cache')
  return path.join(cache, 'we-manager', 'lwe-build')
}

/** A real directory (not a link to one) that belongs to this user, what root may be asked to delete */
export function isOwnDirectory(dir: string, uid: number | undefined = process.getuid?.()): boolean {
  try {
    const stat = fs.lstatSync(dir)
    return stat.isDirectory() && !stat.isSymbolicLink() && uid !== undefined && stat.uid === uid
  } catch {
    return false
  }
}
