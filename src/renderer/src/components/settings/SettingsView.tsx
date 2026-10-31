import { useState, useEffect } from 'react'
import Toggle from '../common/Toggle'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Save, Upload, Download, CheckCircle, XCircle, Loader2, Package, Trash2, Monitor, RotateCcw, Archive, LayoutGrid, Power, Skull, Film, Globe, Shield } from 'lucide-react'
import type { LweStatus, LwePrebuiltTarget, LinuxDistro, SteamIdentity, DesktopIconsStatus } from '../../../../shared/types'
import AutomuteIgnoreSettings from './AutomuteIgnoreSettings'
import PerformanceSettings from './PerformanceSettings'
import DisplaySettings from './DisplaySettings'
import SplitScreenSettings from './SplitScreenSettings'
import CardBorderSettings from './CardBorderSettings'
import CardBadgeSettings from './CardBadgeSettings'
import AppearanceSettings from './AppearanceSettings'
import LibraryFoldersSettings from './LibraryFoldersSettings'
import FontSettings from './FontSettings'
import LedSettings from './LedSettings'
import LoaderSettings from './LoaderSettings'
import ScheduleSettings from './ScheduleSettings'
import UpdateSettings from './UpdateSettings'
import DiagnosticsSettings from './DiagnosticsSettings'
import SettingsCard from './SettingsCard'
import SettingsTabs, { loadSettingsTab, saveSettingsTab, type SettingsTab } from './SettingsTabs'
import CopyField from '../common/CopyField'
import { useToast } from '../common/Toast'
import { useLweInstallProgress } from '../../hooks/queries'
import { t, translatedOr } from '../../i18n'

const DISTRO_LABELS: Record<LinuxDistro, string> = {
  fedora: 'Fedora / Nobara / RHEL',
  arch: 'Arch / Manjaro / EndeavourOS',
  debian: 'Debian / Ubuntu / Mint / Pop!_OS',
  suse: 'openSUSE / SUSE',
  unknown: 'Unknown'
}

export default function SettingsView() {
  const queryClient = useQueryClient()
  const [generation, setGeneration] = useState(0)

  function reloadSettings() {
    for (const key of ['config', 'display-targets', 'screen-assignments', 'playlist-playback-state']) {
      void queryClient.invalidateQueries({ queryKey: [key] })
    }
    setGeneration((n) => n + 1)
  }

  return <SettingsPanels key={generation} onReset={reloadSettings} />
}

function SettingsPanels({ onReset }: { onReset: () => void }) {
  const { showToast } = useToast()
  const [workshopPath, setWorkshopPath] = useState('')
  const [saved, setSaved] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [defaultFps, setDefaultFps] = useState<string>('')
  const [fpsSaved, setFpsSaved] = useState(false)
  const [recommendedFpsEnabled, setRecommendedFpsEnabled] = useState(false)
  const [recommendedWebFpsEnabled, setRecommendedWebFpsEnabled] = useState(true)
  const [resetFpsConfirm, setResetFpsConfirm] = useState(false)
  const [resetFpsMsg, setResetFpsMsg] = useState<string | null>(null)

  const [lweStatus, setLweStatus] = useState<LweStatus | null>(null)
  const [lweRepoUrl, setLweRepoUrl] = useState('')
  const [lweRepoBranch, setLweRepoBranch] = useState('')
  const [lweCmakeArgs, setLweCmakeArgs] = useState('')
  const [defaultLweRepo, setDefaultLweRepo] = useState('')
  const [repoSaved, setRepoSaved] = useState(false)
  const { progress: lweProgress, run: runLweInstall } = useLweInstallProgress()
  const lweInstalling = lweProgress !== null && !['done', 'error', 'installing-deps'].includes(lweProgress.stage)
  const depsInstalling = lweProgress?.stage === 'installing-deps'
  const [distro, setDistro] = useState<LinuxDistro | null>(null)
  const { data: libnodeNeeded = false } = useQuery<boolean>({
    queryKey: ['lwe-libnode-needed', lweProgress?.stage],
    queryFn: () => window.electronAPI.lwe.libnodeNeeded()
  })
  const [prebuiltTarget, setPrebuiltTarget] = useState<LwePrebuiltTarget | null>(null)
  const [showSourceBuild, setShowSourceBuild] = useState(false)
  const engineManaged = prebuiltTarget?.managed === true
  const sourceBuildVisible = !engineManaged && (showSourceBuild || prebuiltTarget?.supported === false)
  const [uninstalling, setUninstalling] = useState(false)
  const [uninstallMsg, setUninstallMsg] = useState<string | null>(null)
  const [killingLwe, setKillingLwe] = useState(false)
  const [killMsg, setKillMsg] = useState<string | null>(null)

  const [desktopIconsEnabled, setDesktopIconsEnabled] = useState(false)
  const [desktopIconsStatus, setDesktopIconsStatus] = useState<DesktopIconsStatus | null>(null)
  const [desktopIconsInstall, setDesktopIconsInstall] = useState<{ busy: boolean; error?: string }>({ busy: false })

  const [backupPath, setBackupPath] = useState('')
  const [backupSaved, setBackupSaved] = useState(false)
  const [autoUnsubscribeAfterBackup, setAutoUnsubscribeAfterBackup] = useState(false)

  const [trayEnabled, setTrayEnabled] = useState(false)
  const [killLweOnQuit, setKillLweOnQuit] = useState(false)
  const [skipPlaylistResume, setSkipPlaylistResume] = useState(false)
  const [steamIdentity, setSteamIdentityState] = useState<SteamIdentity>('wallpaper-engine')
  const [steamIdentitySaved, setSteamIdentitySaved] = useState(false)
  const [autostartSupported, setAutostartSupported] = useState(false)
  const [autostartCompositorLine, setAutostartCompositorLine] = useState<string | null>(null)
  const [autostartEnabled, setAutostartEnabledState] = useState(false)
  const [autostartMinimized, setAutostartMinimized] = useState(false)
  const [autostartPlaylistId, setAutostartPlaylistId] = useState<string | null>(null)
  const [playlists, setPlaylists] = useState<{ id: string; title: string }[]>([])

  const [screens, setScreens] = useState<string[]>([])
  const [screensRefreshing, setScreensRefreshing] = useState(false)
  const [audioScreen, setAudioScreen] = useState<string | null>(null)
  const [ambientVolume, setAmbientVolume] = useState<string>('')
  const [ambientVolumeSaved, setAmbientVolumeSaved] = useState(false)
  const [defaultAudioSensitivity, setDefaultAudioSensitivity] = useState<string>('100')
  const [defaultAudioSensitivitySaved, setDefaultAudioSensitivitySaved] = useState(false)
  const [disablePuppetAnimation, setDisablePuppetAnimation] = useState(false)
  const [scriptLimits, setScriptLimits] = useState(false)

  useEffect(() => {
    window.electronAPI.config.get().then((cfg) => {
      setWorkshopPath(cfg.workshopPath ?? cfg.defaultWorkshopPath)
      setDefaultFps(cfg.defaultFps != null ? String(cfg.defaultFps) : '')
      setRecommendedFpsEnabled(cfg.recommendedFpsEnabled)
      setRecommendedWebFpsEnabled(cfg.recommendedWebFpsEnabled)
      setLweRepoUrl(cfg.lweRepoUrl ?? '')
      setLweRepoBranch(cfg.lweRepoBranch ?? '')
      setLweCmakeArgs(cfg.lweCmakeArgs ?? '')
      setDefaultLweRepo(cfg.defaultLweRepoUrl)
      setBackupPath(cfg.backupPath ?? '')
      setAutoUnsubscribeAfterBackup(cfg.autoUnsubscribeAfterBackup)
      setTrayEnabled(cfg.trayEnabled)
      setKillLweOnQuit(cfg.killLweOnQuit)
      setSkipPlaylistResume(cfg.skipPlaylistResume)
      setSteamIdentityState(cfg.steamIdentity)
      setAutostartSupported(cfg.autostartSupported)
      setAutostartCompositorLine(cfg.autostartCompositorLine)
      setAutostartEnabledState(cfg.autostartEnabled)
      setAutostartMinimized(cfg.autostartMinimized)
      setAutostartPlaylistId(cfg.autostartPlaylistId)
      setAudioScreen(cfg.audioScreen)
      setAmbientVolume(cfg.ambientVolume != null ? String(cfg.ambientVolume) : '')
      setDefaultAudioSensitivity(String(Math.round(cfg.defaultAudioSensitivity * 100)))
      setDisablePuppetAnimation(cfg.disablePuppetAnimation)
      setScriptLimits(cfg.scriptLimits)
    }).catch(console.error)
    window.electronAPI.lwe.status().then(setLweStatus).catch(console.error)
    window.electronAPI.lwe.detectDistro().then(setDistro).catch(console.error)
    window.electronAPI.lwe.prebuiltTarget().then(setPrebuiltTarget).catch(console.error)
    window.electronAPI.desktopIcons.getEnabled().then(setDesktopIconsEnabled).catch(console.error)
    window.electronAPI.desktopIcons.getStatus().then(setDesktopIconsStatus).catch(console.error)
    window.electronAPI.playlist.getAll().then((all) => { setPlaylists(all.map((p) => ({ id: p.id, title: p.title }))); }).catch(console.error)
    window.electronAPI.lwe.listScreens().then(setScreens).catch(console.error)
  }, [])

  useEffect(() => {
    if (lweProgress?.stage === 'done' || lweProgress?.stage === 'error') {
      window.electronAPI.lwe.status().then(setLweStatus).catch(console.error)
    }
  }, [lweProgress])

  async function handleBrowse() {
    const picked = await window.electronAPI.config.pickFolder()
    if (picked) {
      setWorkshopPath(picked)
      setSaved(false)
    }
  }

  async function handleSave() {
    await window.electronAPI.config.setWorkshopPath(workshopPath)
    setSaved(true)
    setTimeout(() => { setSaved(false) }, 2000)
  }

  async function handleResetEngineSettings() {
    if (!confirm(t('settings.resetConfirm'))) return
    try {
      await window.electronAPI.config.resetEngineSettings()
    } catch {
      showToast(t('settings.resetFailed'), { warning: true })
      return
    }
    onReset()
    showToast(t('settings.resetDone'))
  }

  async function handleImportConfig() {
    setImportStatus(null)
    try {
      const filePath = await window.electronAPI.config.pickFile()
      if (!filePath) return
      const result = await window.electronAPI.config.importWE(filePath)
      setImportStatus(
        t('settings.importedConfig', { folders: result.folders, playlists: result.playlists })
      )
    } catch (err) {
      setImportStatus(t('setup.importFailed', { error: (err as Error).message }))
    }
  }

  function handleInstallDeps() {
    return runLweInstall(
      { stage: 'installing-deps', message: t('lwe.startingDeps'), percentage: 0 },
      () => window.electronAPI.lwe.installDeps(),
      'lwe.depsFailed'
    )
  }

  function handleInstallLibnode() {
    return runLweInstall(
      { stage: 'installing-deps', message: t('lwe.lookingUpLibnode'), percentage: 0 },
      () => window.electronAPI.lwe.installLibnode(),
      'lwe.libnodeFailed'
    )
  }

  async function handleSaveRepo() {
    await window.electronAPI.config.setLweRepo(lweRepoUrl.trim() || null, lweRepoBranch.trim() || null)
    await window.electronAPI.config.setLweCmakeArgs(lweCmakeArgs.trim() || null)
    setRepoSaved(true)
    setTimeout(() => { setRepoSaved(false) }, 2000)
  }

  function handleInstallLwe() {
    return runLweInstall(
      { stage: 'cloning', message: t('lwe.startingInstall'), percentage: 0 },
      async () => {
        await window.electronAPI.config.setLweRepo(lweRepoUrl.trim() || null, lweRepoBranch.trim() || null)
        await window.electronAPI.config.setLweCmakeArgs(lweCmakeArgs.trim() || null)
        await window.electronAPI.lwe.install()
      },
      'lwe.installFailed'
    )
  }

  function handleInstallPrebuilt() {
    return runLweInstall(
      { stage: 'downloading', message: t('lwe.startingDownload'), percentage: 0 },
      () => window.electronAPI.lwe.installPrebuilt(),
      'lwe.installFailed'
    )
  }

  async function handleUninstallLwe() {
    if (!confirm(t('lwe.uninstallConfirm'))) return
    setUninstalling(true)
    setUninstallMsg(null)
    try {
      const result = await window.electronAPI.lwe.uninstall()
      setUninstallMsg(result.message)
      window.electronAPI.lwe.status().then(setLweStatus).catch(console.error)
    } catch (err) {
      setUninstallMsg(t('lwe.uninstallFailed', { error: (err as Error).message }))
    } finally {
      setUninstalling(false)
    }
  }

  async function handleKillAllLwe() {
    setKillingLwe(true)
    setKillMsg(null)
    try {
      const result = await window.electronAPI.lwe.killAll()
      setKillMsg(result.message)
    } catch (err) {
      setKillMsg(t('setup.failed', { error: (err as Error).message }))
    } finally {
      setKillingLwe(false)
    }
  }

  async function handleSaveDefaultFps() {
    const parsed = defaultFps.trim() === '' ? null : parseInt(defaultFps, 10)
    if (parsed !== null && (isNaN(parsed) || parsed < 1)) return
    await window.electronAPI.config.setDefaultFps(parsed)
    setFpsSaved(true)
    setTimeout(() => { setFpsSaved(false) }, 2000)
  }

  async function handleRecommendedFpsToggle() {
    const newVal = !recommendedFpsEnabled
    setRecommendedFpsEnabled(newVal)
    await window.electronAPI.config.setRecommendedFpsEnabled(newVal)
  }

  async function handleRecommendedWebFpsToggle() {
    const newVal = !recommendedWebFpsEnabled
    setRecommendedWebFpsEnabled(newVal)
    await window.electronAPI.config.setRecommendedWebFpsEnabled(newVal)
  }

  async function handleResetFpsOverrides() {
    if (!resetFpsConfirm) { setResetFpsConfirm(true); return }
    setResetFpsConfirm(false)
    const result = await window.electronAPI.library.resetFpsOverrides()
    setResetFpsMsg(t('settings.resetFpsDone', { count: result.count }))
    setTimeout(() => { setResetFpsMsg(null) }, 3000)
  }

  async function handleDesktopIconsToggle() {
    const newVal = !desktopIconsEnabled
    setDesktopIconsEnabled(newVal)
    await window.electronAPI.desktopIcons.setEnabled(newVal)
    setDesktopIconsStatus(await window.electronAPI.desktopIcons.getStatus())
    // a missing module only shows once the overlay process has run
    setTimeout(() => void window.electronAPI.desktopIcons.getStatus().then(setDesktopIconsStatus).catch(console.error), 3000)
  }

  async function handleDesktopIconsInstall() {
    setDesktopIconsInstall({ busy: true })
    const result = await window.electronAPI.desktopIcons.installDeps()
    setDesktopIconsInstall({ busy: false, error: result.ok ? undefined : result.error })
    setDesktopIconsStatus(await window.electronAPI.desktopIcons.getStatus())
    setTimeout(() => void window.electronAPI.desktopIcons.getStatus().then(setDesktopIconsStatus).catch(console.error), 3000)
  }

  async function handleBrowseBackup() {
    const picked = await window.electronAPI.config.pickFolder()
    if (picked) {
      setBackupPath(picked)
      setBackupSaved(false)
    }
  }

  async function handleSaveBackup() {
    await window.electronAPI.config.setBackupPath(backupPath)
    setBackupSaved(true)
    setTimeout(() => { setBackupSaved(false) }, 2000)
  }

  async function handleAutoUnsubscribeToggle() {
    const newVal = !autoUnsubscribeAfterBackup
    setAutoUnsubscribeAfterBackup(newVal)
    await window.electronAPI.config.setAutoUnsubscribeAfterBackup(newVal)
  }

  async function handleTrayToggle() {
    const newVal = !trayEnabled
    setTrayEnabled(newVal)
    await window.electronAPI.config.setTrayEnabled(newVal)
  }

  async function handleKillLweOnQuitToggle() {
    const newVal = !killLweOnQuit
    setKillLweOnQuit(newVal)
    await window.electronAPI.config.setKillLweOnQuit(newVal)
  }

  async function handleSkipPlaylistResumeToggle() {
    const newVal = !skipPlaylistResume
    setSkipPlaylistResume(newVal)
    await window.electronAPI.config.setSkipPlaylistResume(newVal)
  }

  async function handleScriptLimitsToggle() {
    const newVal = !scriptLimits
    setScriptLimits(newVal)
    await window.electronAPI.config.setScriptLimits(newVal)
  }

  async function handleDisablePuppetAnimationToggle() {
    const newVal = !disablePuppetAnimation
    setDisablePuppetAnimation(newVal)
    await window.electronAPI.config.setDisablePuppetAnimation(newVal)
  }

  async function handleSteamIdentityChange(identity: SteamIdentity) {
    setSteamIdentityState(identity)
    await window.electronAPI.config.setSteamIdentity(identity)
    setSteamIdentitySaved(true)
    setTimeout(() => { setSteamIdentitySaved(false) }, 3000)
  }

  async function handleAudioScreenChange(screen: string | null) {
    setAudioScreen(screen)
    await window.electronAPI.config.setAudioScreen(screen)
    await window.electronAPI.lwe.hotswapSettings({ audioScreen: screen ?? '' })
  }

  async function handleRefreshScreens() {
    setScreensRefreshing(true)
    try {
      setScreens(await window.electronAPI.lwe.listScreens())
    } finally {
      setScreensRefreshing(false)
    }
  }

  async function handleSaveAmbientVolume() {
    const parsed = ambientVolume.trim() === '' ? null : parseInt(ambientVolume, 10)
    if (parsed !== null && (isNaN(parsed) || parsed < 0 || parsed > 128)) return
    await window.electronAPI.config.setAmbientVolume(parsed)
    if (parsed !== null) {
      await window.electronAPI.lwe.hotswapSettings({ ambientVolume: parsed })
    }
    setAmbientVolumeSaved(true)
    setTimeout(() => { setAmbientVolumeSaved(false) }, 2000)
  }

  async function handleSaveDefaultAudioSensitivity() {
    const percent = parseInt(defaultAudioSensitivity, 10)
    if (isNaN(percent) || percent < 0 || percent > 200) return
    const multiplier = percent / 100
    await window.electronAPI.config.setDefaultAudioSensitivity(multiplier)
    // per-wallpaper overrides win over "*"

    await window.electronAPI.lwe.hotswapSettings({ audioSensitivity: { '*': multiplier } })
    setDefaultAudioSensitivitySaved(true)
    setTimeout(() => { setDefaultAudioSensitivitySaved(false) }, 2000)
  }

  async function saveAutostart(patch: {
    enabled?: boolean
    minimized?: boolean
    playlistId?: string | null
  }) {
    const enabled = patch.enabled ?? autostartEnabled
    const minimized = patch.minimized ?? autostartMinimized
    const playlistId = 'playlistId' in patch ? patch.playlistId! : autostartPlaylistId
    setAutostartEnabledState(enabled)
    setAutostartMinimized(minimized)
    setAutostartPlaylistId(playlistId)
    await window.electronAPI.config.setAutostart(enabled, minimized, playlistId)
  }

  const [tab, setTab] = useState<SettingsTab>(loadSettingsTab)

  function changeTab(next: SettingsTab) {
    setTab(next)
    saveSettingsTab(next)
  }

  const isBusy = lweInstalling || depsInstalling || uninstalling

  return (
    <div className="flex h-full flex-col md:flex-row">
      <SettingsTabs active={tab} onChange={changeTab} />

      <div className="flex-1 overflow-y-auto p-6">
        <h2 className="mb-6 text-lg font-semibold text-gray-100 md:hidden">{t('nav.settings')}</h2>

        {tab === 'appearance' && (
          <div className="settings-sections max-w-lg">
            <AppearanceSettings />

            <CardBorderSettings />

            <CardBadgeSettings />
          </div>
        )}

        {tab === 'library' && (
          <div className="settings-sections max-w-lg">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                {t('setup.workshopFolder')}
              </label>
              <p className="mt-1 text-xs text-gray-600">
                {t('settings.workshopPathHint')}
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={workshopPath}
                  onChange={(e) => {
                    setWorkshopPath(e.target.value)
                    setSaved(false)
                  }}
                  className="flex-1 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-accent-500"
                />
                <button
                  onClick={() => void handleBrowse()}
                  className="flex items-center gap-2 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-300 hover:bg-fg/10"
                >
                  <FolderOpen size={16} />
                  {t('common.browse')}
                </button>
              </div>
              <button
                onClick={() => void handleSave()}
                disabled={!workshopPath}
                className="mt-3 flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
              >
                <Save size={14} />
                {saved ? t('common.saved') : t('common.save')}
              </button>
            </div>

            <LibraryFoldersSettings />

            <FontSettings />

            <LedSettings />

            <LoaderSettings />

            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                {t('settings.backupFolder')}
              </label>
              <p className="mt-1 text-xs text-gray-600">
                {t('settings.backupFolderHint')}
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={backupPath}
                  onChange={(e) => {
                    setBackupPath(e.target.value)
                    setBackupSaved(false)
                  }}
                  placeholder={t('settings.notConfigured')}
                  className="flex-1 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-accent-500"
                />
                <button
                  onClick={() => void handleBrowseBackup()}
                  className="flex items-center gap-2 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-300 hover:bg-fg/10"
                >
                  <FolderOpen size={16} />
                  {t('common.browse')}
                </button>
              </div>
              <button
                onClick={() => void handleSaveBackup()}
                disabled={!backupPath}
                className="mt-3 flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
              >
                <Save size={14} />
                {backupSaved ? t('common.saved') : t('common.save')}
              </button>

              <label className="mt-4 flex items-center gap-3 cursor-pointer">
                <Toggle on={autoUnsubscribeAfterBackup} onClick={() => void handleAutoUnsubscribeToggle()} />
                <span className="flex items-center gap-2 text-sm text-gray-300">
                  <Archive size={16} />
                  {t('settings.autoUnsubscribe')}
                </span>
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                {t('settings.steam')}
              </label>
              <p className="mt-1 text-xs text-gray-600">
                {t('settings.steamHint')}
              </p>

              <div className="mt-3 flex rounded-lg overflow-hidden text-sm w-fit">
                <button
                  onClick={() => void handleSteamIdentityChange('wallpaper-engine')}
                  className={`flex items-center gap-2 px-3 py-2 transition-colors ${
                    steamIdentity === 'wallpaper-engine'
                      ? 'bg-accent-600 text-white'
                      : 'bg-fg/5 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Shield size={14} />
                  {t('settings.steamWe')}
                </button>
                <button
                  onClick={() => void handleSteamIdentityChange('standalone')}
                  className={`flex items-center gap-2 px-3 py-2 transition-colors ${
                    steamIdentity === 'standalone'
                      ? 'bg-accent-600 text-white'
                      : 'bg-fg/5 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Shield size={14} />
                  {t('settings.steamOwn')}
                </button>
              </div>
              {steamIdentitySaved && (
                <p className="mt-2 text-xs text-green-400">{t('settings.steamSaved')}</p>
              )}
              <p className="mt-2 text-xs text-gray-600">
                {steamIdentity === 'wallpaper-engine' ? (
                  <>
                    {t('settings.steamWeHint')}
                  </>
                ) : (
                  <>
                    {t('settings.steamOwnHint')}
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {tab === 'engine' && (
          <div className="settings-sections max-w-lg">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                linux-wallpaperengine
              </label>
              <p className="mt-1 text-xs text-gray-600">
                {t('settings.lweHint')}
              </p>

              {lweStatus === null ? (
                <p className="mt-3 text-xs text-gray-500">{t('settings.checking')}</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {lweStatus.installed ? (
                    <>
                      <div className="flex items-center gap-2 text-sm text-green-400">
                        <CheckCircle size={16} />
                        {t('settings.installed')}{lweStatus.version ? ` (${lweStatus.version})` : ''}
                      </div>
                      {lweStatus.path && (
                        <p className="text-xs text-gray-500">{t('settings.path')} {lweStatus.path}</p>
                      )}
                      {lweStatus.managedBy && !engineManaged && (
                        <p className="text-xs text-gray-500">{t('settings.installedBy')} {lweStatus.managedBy}</p>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-yellow-400">
                      <XCircle size={16} />
                      {t('settings.notInstalled')}
                    </div>
                  )}

                  {prebuiltTarget?.supported ? (
                    <p className="text-xs text-gray-500">{t('settings.prebuiltBuild')} {prebuiltTarget.label}</p>
                  ) : prebuiltTarget && (
                    <p className={`text-xs ${engineManaged ? 'text-gray-500' : 'text-yellow-500/80'}`}>{prebuiltTarget.reason}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {prebuiltTarget?.supported && (
                      <button
                        onClick={() => void handleInstallPrebuilt()}
                        disabled={isBusy}
                        className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
                      >
                        {lweInstalling ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Download size={14} />
                        )}
                        {lweInstalling
                          ? t('gnome.installing')
                          : !lweStatus.installed
                            ? t('lwe.downloadInstall')
                            : lweStatus.version
                              ? t('lwe.update')
                              : t('lwe.switchPrebuilt')}
                      </button>
                    )}
                    {lweStatus.installed && !engineManaged && !lweStatus.managedBy && (
                      <button
                        onClick={() => void handleUninstallLwe()}
                        disabled={isBusy}
                        className="flex items-center gap-2 rounded-lg bg-red-600/20 px-4 py-2 text-sm text-red-400 hover:bg-red-600/30 disabled:opacity-50"
                      >
                        {uninstalling ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                        {uninstalling ? t('lwe.uninstalling') : t('lwe.uninstall')}
                      </button>
                    )}
                  </div>
                  {prebuiltTarget?.supported && !lweStatus.installed && (
                    <p className="text-xs text-gray-600">
                      {t('settings.prebuiltHint')}
                    </p>
                  )}
                  {uninstallMsg && (
                    <p className="text-xs text-gray-400">{uninstallMsg}</p>
                  )}
                </div>
              )}

              {!engineManaged && (
                <button
                  onClick={() => { setShowSourceBuild(!sourceBuildVisible) }}
                  className="mt-4 text-xs text-gray-400 hover:text-gray-200"
                >
                  {sourceBuildVisible ? '▾' : '▸'} {t('lwe.buildFromSource')}
                </button>
              )}

              {sourceBuildVisible && (
                <div className="mt-2 space-y-2 rounded-lg bg-fg/[0.02] p-3">
                  <label className="block text-xs text-gray-400">{t('settings.sourceRepo')}</label>
                  <p className="text-xs text-gray-600">
                    {t('settings.sourceRepoHint')}
                  </p>
                  <input
                    type="text"
                    value={lweRepoUrl}
                    onChange={(e) => { setLweRepoUrl(e.target.value); setRepoSaved(false) }}
                    placeholder={defaultLweRepo}
                    className="w-full rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-accent-500"
                  />
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={lweRepoBranch}
                      onChange={(e) => { setLweRepoBranch(e.target.value); setRepoSaved(false) }}
                      placeholder={t('settings.branchPlaceholder')}
                      className="w-44 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-accent-500"
                    />
                    <button
                      onClick={() => void handleSaveRepo()}
                      className="flex items-center gap-2 rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10"
                    >
                      <Save size={14} />
                      {repoSaved ? t('common.saved') : t('common.save')}
                    </button>
                  </div>
                  <label className="block text-xs text-gray-400">{t('settings.cmakeArgs')}</label>
                  <p className="text-xs text-gray-600">
                    {t('settings.cmakeArgsHint')}
                  </p>
                  <input
                    type="text"
                    value={lweCmakeArgs}
                    onChange={(e) => { setLweCmakeArgs(e.target.value); setRepoSaved(false) }}
                    placeholder="-DDISABLE_KDE_FEATURES=ON"
                    className="w-full rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-accent-500 font-mono"
                  />

                  {distro && distro !== 'unknown' && (
                    <p className="text-xs text-gray-500">
                      {t('settings.detected')} {DISTRO_LABELS[distro]}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => void handleInstallDeps()}
                      disabled={isBusy || !distro || distro === 'unknown'}
                      title={
                        !distro || distro === 'unknown'
                          ? t('lwe.noDistro')
                          : undefined
                      }
                      className="flex items-center gap-2 rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10 disabled:opacity-50"
                    >
                      {depsInstalling ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Package size={14} />
                      )}
                      {depsInstalling ? t('lwe.installingDeps') : t('lwe.installDeps')}
                    </button>

                    {libnodeNeeded && (
                      <button
                        onClick={() => void handleInstallLibnode()}
                        disabled={isBusy}
                        title={t('lwe.installLibnodeHint')}
                        className="flex items-center gap-2 rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10 disabled:opacity-50"
                      >
                        <Download size={14} />
                        {t('lwe.installLibnode')}
                      </button>
                    )}

                    <button
                      onClick={() => void handleInstallLwe()}
                      disabled={isBusy}
                      className="flex items-center gap-2 rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10 disabled:opacity-50"
                    >
                      {lweInstalling ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      {lweInstalling ? t('lwe.building') : lweStatus?.installed ? t('lwe.rebuild') : t('lwe.build')}
                    </button>
                  </div>

                  <p className="text-xs text-gray-600">
                    {t('settings.buildHint')}
                  </p>

                  {distro === 'unknown' && (
                    <p className="text-xs text-yellow-500/80">
                      {t('settings.unknownDistro')}
                    </p>
                  )}
                </div>
              )}

              {lweProgress && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    {lweProgress.stage === 'error' ? (
                      <XCircle size={14} className="text-red-400 shrink-0" />
                    ) : lweProgress.stage === 'done' ? (
                      <CheckCircle size={14} className="text-green-400 shrink-0" />
                    ) : (
                      <Loader2 size={14} className="animate-spin text-accent-400 shrink-0" />
                    )}
                    <p className="text-xs text-gray-300 whitespace-pre-wrap break-all">{lweProgress.message}</p>
                  </div>
                  {lweProgress.stage !== 'error' && lweProgress.stage !== 'done' && (
                    <div className="h-1.5 w-full rounded-full bg-fg/5">
                      <div
                        className="h-full rounded-full bg-accent-500 transition-all duration-300"
                        style={{ width: `${lweProgress.percentage}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4">
                <button
                  onClick={() => void handleKillAllLwe()}
                  disabled={killingLwe}
                  className="flex items-center gap-2 rounded-lg bg-red-600/20 px-4 py-2 text-sm text-red-400 hover:bg-red-600/30 disabled:opacity-50"
                >
                  {killingLwe ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Skull size={14} />
                  )}
                  {killingLwe ? t('lwe.killing') : t('lwe.killAll')}
                </button>
                <p className="mt-1 text-xs text-gray-600">
                  {t('settings.killAllHint')}
                </p>
                {killMsg && (
                  <p className="mt-2 text-xs text-gray-400">{killMsg}</p>
                )}

                <label className="mt-3 flex items-center gap-3 cursor-pointer">
                  <Toggle on={killLweOnQuit} onClick={() => void handleKillLweOnQuitToggle()} />
                  <span className="flex items-center gap-2 text-sm text-gray-300">
                    <Skull size={16} />
                    {t('settings.killOnQuit')}
                  </span>
                </label>

                <label className="mt-3 flex items-center gap-3 cursor-pointer">
                  <Toggle on={skipPlaylistResume} onClick={() => void handleSkipPlaylistResumeToggle()} />
                  <span className="text-sm text-gray-300">{t('settings.skipPlaylistResume')}</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                {t('settings.weOptions')}
              </label>
              <p className="mt-1 text-xs text-gray-600">
                {t('settings.weOptionsHint')}
              </p>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">{t('settings.defaultFps')}</label>
                  <p className="text-xs text-gray-600 mb-2">
                    {t('settings.defaultFpsHint')}
                  </p>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      min={1}
                      max={360}
                      placeholder={t('settings.unlimited')}
                      value={defaultFps}
                      onChange={(e) => { setDefaultFps(e.target.value); setFpsSaved(false) }}
                      onKeyDown={(e) => void (e.key === 'Enter' && handleSaveDefaultFps())}
                      className="w-28 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-accent-500"
                    />
                    <button
                      onClick={() => void handleSaveDefaultFps()}
                      className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500"
                    >
                      <Save size={14} />
                      {fpsSaved ? t('common.saved') : t('common.save')}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mt-1 flex items-center gap-3 cursor-pointer">
                    <Toggle on={recommendedFpsEnabled} onClick={() => void handleRecommendedFpsToggle()} />
                    <span className="flex items-center gap-2 text-sm text-gray-300">
                      <Film size={16} />
                      {t('settings.recommendedVideo')}
                    </span>
                  </label>
                  <p className="mt-2 text-xs text-gray-600">
                    {t('settings.recommendedVideoHint')}
                  </p>
                </div>
                <div>
                  <label className="mt-1 flex items-center gap-3 cursor-pointer">
                    <Toggle on={recommendedWebFpsEnabled} onClick={() => void handleRecommendedWebFpsToggle()} />
                    <span className="flex items-center gap-2 text-sm text-gray-300">
                      <Globe size={16} />
                      {t('settings.recommendedWeb')}
                    </span>
                  </label>
                  <p className="mt-2 text-xs text-gray-600">
                    {t('settings.recommendedWebHint')}
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">{t('settings.resetFps')}</label>
                  <p className="text-xs text-gray-600 mb-2">
                    {t('settings.resetFpsHint')}
                  </p>
                  {resetFpsConfirm ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{t('settings.areYouSure')}</span>
                      <button
                        onClick={() => void handleResetFpsOverrides()}
                        className="rounded-lg bg-red-600/80 px-3 py-1.5 text-xs text-white hover:bg-red-600"
                      >
                        {t('settings.resetAllConfirm')}
                      </button>
                      <button
                        onClick={() => { setResetFpsConfirm(false) }}
                        className="rounded-lg bg-fg/5 px-3 py-1.5 text-xs text-gray-400 hover:bg-fg/10"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => void handleResetFpsOverrides()}
                      className="flex items-center gap-2 rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10"
                    >
                      <RotateCcw size={14} />
                      {t('settings.resetAllFps')}
                    </button>
                  )}
                  {resetFpsMsg && (
                    <p className="mt-2 text-xs text-gray-400">{resetFpsMsg}</p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                {t('settings.weConfig')}
              </label>
              <p className="mt-1 text-xs text-gray-600">
                {t('settings.weConfigHint')}
              </p>
              <button
                onClick={() => void handleImportConfig()}
                className="mt-3 flex items-center gap-2 rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10"
              >
                <Upload size={14} />
                {t('settings.importConfig')}
              </button>
              {importStatus && (
                <p className="mt-2 text-xs text-gray-400">{importStatus}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                {t('settings.desktopIcons')}
              </label>
              <p className="mt-1 text-xs text-gray-600">
                {t('settings.desktopIconsHint')}
              </p>
              <label className="mt-3 flex items-center gap-3 cursor-pointer">
                <Toggle on={desktopIconsEnabled} onClick={() => void handleDesktopIconsToggle()} />
                <span className="flex items-center gap-2 text-sm text-gray-300">
                  <Monitor size={16} />
                  {desktopIconsEnabled ? t('settings.desktopIconsOn') : t('settings.desktopIconsOff')}
                </span>
              </label>
              {desktopIconsStatus?.problem && (
                <p className="mt-2 text-xs text-amber-400">
                  {t(`settings.desktopIcons_${desktopIconsStatus.problem}`)}
                  {desktopIconsStatus.detail && <span className="block whitespace-pre-wrap text-gray-500">{desktopIconsStatus.detail}</span>}
                  {desktopIconsStatus.command && (
                    <code className="mt-1 block select-text text-gray-400">{desktopIconsStatus.command}</code>
                  )}
                </p>
              )}
              {desktopIconsStatus?.command && (
                <button
                  onClick={() => void handleDesktopIconsInstall()}
                  disabled={desktopIconsInstall.busy}
                  className="mt-2 flex items-center gap-2 rounded-lg bg-fg/5 px-4 py-2 text-sm text-gray-300 hover:bg-fg/10 disabled:opacity-50"
                >
                  {desktopIconsInstall.busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  {desktopIconsInstall.busy ? t('settings.desktopIconsInstalling') : t('settings.desktopIconsInstall')}
                </button>
              )}
              {desktopIconsInstall.error && (
                <p className="mt-2 whitespace-pre-wrap text-xs text-red-400">
                  {translatedOr(`settings.desktopIconsInstall_${desktopIconsInstall.error}`,
                    t('settings.desktopIconsInstallFailed', { error: desktopIconsInstall.error }))}
                </p>
              )}
            </div>
          </div>
        )}

        {tab === 'display' && (
          <div className="settings-sections max-w-lg">
            <DisplaySettings screens={screens} />

            <SplitScreenSettings />

            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                {t('settings.audio')}
              </label>
              <p className="mt-1 text-xs text-gray-600">
                {t('settings.audioHint')}
              </p>
              <div className="mt-3 space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">{t('settings.audioScreen')}</label>
                  <p className="text-xs text-gray-600 mb-2">
                    {t('settings.audioScreenHint')}
                  </p>
                  <div className="flex items-center gap-2">
                    <select
                      value={audioScreen ?? ''}
                      onChange={(e) => void handleAudioScreenChange(e.target.value || null)}
                      className="w-56 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-accent-500"
                    >
                      <option value="">{t('settings.allScreensDefault')}</option>
                      {screens.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleRefreshScreens()}
                      disabled={screensRefreshing}
                      className="rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-300 outline-none hover:bg-fg/10 disabled:opacity-50"
                      title={t('settings.redetectHint')}
                    >
                      {screensRefreshing ? '...' : t('settings.redetect')}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">{t('settings.ambientVolume')}</label>
                  <p className="text-xs text-gray-600 mb-2">
                    {t('settings.ambientVolumeHint')}
                  </p>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      min={0}
                      max={128}
                      placeholder={t('settings.ambientPlaceholder')}
                      value={ambientVolume}
                      onChange={(e) => { setAmbientVolume(e.target.value); setAmbientVolumeSaved(false) }}
                      onKeyDown={(e) => void (e.key === 'Enter' && handleSaveAmbientVolume())}
                      className="w-44 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-accent-500"
                    />
                    <button
                      onClick={() => void handleSaveAmbientVolume()}
                      className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500"
                    >
                      <Save size={14} />
                      {ambientVolumeSaved ? t('common.saved') : t('common.save')}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">{t('settings.audioSensitivity')}</label>
                  <p className="text-xs text-gray-600 mb-2">
                    {t('settings.audioSensitivityHint')}
                  </p>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      min={0}
                      max={200}
                      value={defaultAudioSensitivity}
                      onChange={(e) => { setDefaultAudioSensitivity(e.target.value); setDefaultAudioSensitivitySaved(false) }}
                      onKeyDown={(e) => void (e.key === 'Enter' && handleSaveDefaultAudioSensitivity())}
                      className="w-44 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-accent-500"
                    />
                    <span className="text-sm text-gray-500">%</span>
                    <button
                      onClick={() => void handleSaveDefaultAudioSensitivity()}
                      className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500"
                    >
                      <Save size={14} />
                      {defaultAudioSensitivitySaved ? t('common.saved') : t('common.save')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'performance' && (
          <div className="settings-sections max-w-lg">
            <PerformanceSettings
              defaultFps={defaultFps ? Number(defaultFps) : null}
              onDefaultFpsChanged={(fps) => { setDefaultFps(fps != null ? String(fps) : '') }}
            />

            <AutomuteIgnoreSettings />

            <ScheduleSettings />
          </div>
        )}

        {tab === 'system' && (
          <div className="settings-sections max-w-lg">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                {t('settings.trayStartup')}
              </label>
              <p className="mt-1 text-xs text-gray-600">
                {t('settings.trayStartupHint')}
              </p>

              <label className="mt-3 flex items-center gap-3 cursor-pointer">
                <Toggle on={trayEnabled} onClick={() => void handleTrayToggle()} />
                <span className="flex items-center gap-2 text-sm text-gray-300">
                  <LayoutGrid size={16} />
                  {t('settings.trayEnable')}
                </span>
              </label>

              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <Toggle on={autostartEnabled} onClick={() => void (autostartSupported && saveAutostart({ enabled: !autostartEnabled }))} disabled={!autostartSupported} />
                  <span className="flex items-center gap-2 text-sm text-gray-300">
                    <Power size={16} />
                    {t('settings.autostart')}
                  </span>
                </label>
                {!autostartSupported && (
                  <p className="text-xs text-yellow-500/80">
                    {t('settings.autostartDev')}
                  </p>
                )}
                {autostartCompositorLine && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-500">
                      {t('settings.autostartCompositor')}
                    </p>
                    <CopyField text={autostartCompositorLine} />
                  </div>
                )}

                <label className="flex items-center gap-3 cursor-pointer pl-12">
                  <Toggle
                    on={autostartMinimized}
                    onClick={() => void saveAutostart({ minimized: !autostartMinimized })}
                    disabled={!trayEnabled || !autostartEnabled}
                  />
                  <span className="text-sm text-gray-300">
                    {t('settings.startMinimized')}
                    {!trayEnabled && <span className="text-gray-600"> {t('settings.enableTrayFirst')}</span>}
                  </span>
                </label>

                <div className="pl-12">
                  <label className="block text-xs text-gray-400 mb-1">{t('settings.autoplay')}</label>
                  <select
                    value={autostartPlaylistId ?? ''}
                    onChange={(e) => void saveAutostart({ playlistId: e.target.value || null })}
                    className="w-56 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-accent-500"
                  >
                    <option value="">{t('settings.none')}</option>
                    {playlists.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <UpdateSettings />


          </div>
        )}

        {tab === 'troubleshooting' && (
          <div className="settings-sections max-w-lg">
            <SettingsCard title={t('settings.troubleshooting')} hint={t('settings.puppetHint')}>
              <label className="flex items-center gap-3 cursor-pointer">
                <Toggle on={disablePuppetAnimation} onClick={() => void handleDisablePuppetAnimationToggle()} />
                <span className="text-sm text-gray-300">{t('settings.puppet')}</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <Toggle on={scriptLimits} onClick={() => void handleScriptLimitsToggle()} />
                <span className="text-sm text-gray-300">{t('settings.scriptLimits')}</span>
              </label>
              <p className="text-xs text-gray-600">{t('settings.scriptLimitsHint')}</p>
            </SettingsCard>

            <DiagnosticsSettings />

            <SettingsCard title={t('settings.resetTitle')} hint={t('settings.resetHint')}>
              <button
                onClick={() => void handleResetEngineSettings()}
                className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20"
              >
                {t('settings.resetButton')}
              </button>
            </SettingsCard>
          </div>
        )}

      </div>
    </div>
  )
}
