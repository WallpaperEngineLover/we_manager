import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { LWE_RELEASE_REPO } from '@shared/constants'
import type { LweInstallProgress } from '@shared/types'
import { isCommandAvailable } from '../utils/platform'
import { isFlatpak } from '../utils/flatpak'
import { downloadVerified, fetchReleaseByTag, type GithubAsset } from '../utils/github'
import { detectDistro } from './lwe.service'
import { t } from '../i18n'

const execFileAsync = promisify(execFile)

const LIBNODE_RELEASE_TAG = 'libnode-arch'
const LIBNODE_ASSET = /^libnode-.+-x86_64\.pkg\.tar\.zst$/

export function pickLibnodeAsset(assets: GithubAsset[]): GithubAsset | undefined {
  return assets.find(a => LIBNODE_ASSET.test(a.name))
}

export function libnodeNeeded(): boolean {
  return !isFlatpak() && detectDistro() === 'arch' && !fs.existsSync('/usr/lib/libnode.so')
}

export async function installLibnode(win: BrowserWindow): Promise<boolean> {
  const send = (progress: LweInstallProgress) => {
    win.webContents.send(IpcChannels.EVENT_LWE_INSTALL_PROGRESS, progress)
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'we-libnode-'))

  try {
    send({ stage: 'installing-deps', message: t('lwe.lookingUpLibnode'), percentage: 5 })
    const release = await fetchReleaseByTag(LWE_RELEASE_REPO, LIBNODE_RELEASE_TAG)
    const asset = release ? pickLibnodeAsset(release.assets) : undefined
    if (!asset) throw new Error(`The ${LIBNODE_RELEASE_TAG} release of ${LWE_RELEASE_REPO} has no libnode package.`)

    const file = path.join(dir, asset.name)
    await downloadVerified(asset, file, fraction => {
      send({
        stage: 'installing-deps',
        message: t('lwe.downloadingLibnode', { name: asset.name }),
        percentage: 10 + Math.round(fraction * 60)
      })
    })

    send({ stage: 'installing-deps', message: t('lwe.installingLibnode'), percentage: 75 })
    const elevate = isCommandAvailable('pkexec') ? 'pkexec' : 'sudo'
    await execFileAsync(elevate, ['pacman', '-U', '--noconfirm', '--needed', file], { timeout: 600_000 })

    send({ stage: 'done', message: t('lwe.libnodeInstalled'), percentage: 100 })
    return true
  } catch (err) {
    send({ stage: 'error', message: t('lwe.libnodeFailed', { error: (err as Error).message }), percentage: 0 })
    return false
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
