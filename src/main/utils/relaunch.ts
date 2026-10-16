import { spawn } from 'child_process'
import * as os from 'os'
import { app } from 'electron'
import { runningAppImage } from './platform'

const APPIMAGE_VARIABLES = ['APPDIR', 'APPIMAGE', 'ARGV0', 'OWD']
const PATH_LISTS = ['PATH', 'LD_LIBRARY_PATH', 'XDG_DATA_DIRS', 'GSETTINGS_SCHEMA_DIR']

/** env without what the AppImage runtime and AppRun added, which points into the mount */
export function appImageFreeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const appDir = env.APPDIR
  const clean: NodeJS.ProcessEnv = { ...env }
  for (const name of APPIMAGE_VARIABLES) delete clean[name]
  if (!appDir) return clean
  for (const name of PATH_LISTS) {
    const value = clean[name]
    if (value === undefined) continue
    const kept = value.split(':').filter(entry => entry !== '' && entry !== appDir && !entry.startsWith(`${appDir}/`))
    if (kept.length > 0) clean[name] = kept.join(':')
    else delete clean[name]
  }
  return clean
}

// Chromium leaves fds open across exec, which kept the old mount busy and let two instances share cache files.
// AppRun needs bash too
const CLOSE_FDS_AND_EXEC = 'for fd in /proc/$$/fd/*; do fd=${fd##*/}; [ "$fd" -gt 2 ] && eval "exec $fd>&-"; done 2>/dev/null; exec "$0" "$@"'

/** Electron's relaunch sets no_new_privs, so an AppImage couldn't mount itself (setuid fusermount); started here */
export function relaunchApp(args: string[] = process.argv.slice(1), quit: 'quit' | 'exit' = 'quit'): void {
  const appImage = runningAppImage()
  if (appImage) {
    spawn('bash', ['-c', CLOSE_FDS_AND_EXEC, appImage, ...args], {
      detached: true,
      stdio: 'ignore',
      cwd: process.env.OWD || os.homedir(),
      env: appImageFreeEnv(process.env)
    }).unref()
  } else {
    app.relaunch({ args })
  }
  if (quit === 'exit') app.exit(0)
  else app.quit()
}
