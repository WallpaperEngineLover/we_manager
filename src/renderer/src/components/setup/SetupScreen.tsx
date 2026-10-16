import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Check, Upload, FilePlus, Loader2, ArrowRight } from 'lucide-react'
import { t, tn } from '../../i18n'
import LanguageSelect from '../settings/LanguageSelect'
import UpdateCheckChoices from '../updates/UpdateCheckChoices'
import { UPDATE_STATUS_KEY, useUpdateStatus } from '../../hooks/queries'

interface SetupScreenProps {
  defaultPath: string
  onComplete: (path: string) => void
}

export default function SetupScreen({ defaultPath, onComplete }: SetupScreenProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedPath, setSelectedPath] = useState(defaultPath)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [updateChecks, setUpdateChecks] = useState({ app: true, engine: true })
  const updateStatus = useUpdateStatus()
  const showEngineCheck = updateStatus?.engineInstall !== 'bundled'
  const queryClient = useQueryClient()

  async function handleBrowse() {
    const picked = await window.electronAPI.config.pickFolder()
    if (picked) setSelectedPath(picked)
  }

  async function handleConfirmPath() {
    setSaving(true)
    await window.electronAPI.config.setWorkshopPath(selectedPath)
    setSaving(false)
    setStep(2)
  }

  async function handleImportConfig() {
    setImporting(true)
    setImportResult(null)
    try {
      const filePath = await window.electronAPI.config.pickFile()
      if (!filePath) {
        setImporting(false)
        return
      }
      const result = await window.electronAPI.config.importWE(filePath)
      setImportResult(t('setup.imported', { folders: result.folders, playlists: result.playlists }))
    } catch (err) {
      setImportResult(t('setup.importFailed', { error: (err as Error).message }))
    } finally {
      setImporting(false)
    }
  }

  async function handleCreateFresh() {
    setImporting(true)
    try {
      await window.electronAPI.config.createFresh()
      setImportResult(t('setup.created'))
    } catch (err) {
      setImportResult(t('setup.failed', { error: (err as Error).message }))
    } finally {
      setImporting(false)
    }
  }

  async function handleFinish() {
    const status = await window.electronAPI.updates.setChecks({
      app: updateChecks.app,
      engine: showEngineCheck && updateChecks.engine
    })
    queryClient.setQueryData(UPDATE_STATUS_KEY, status)
    onComplete(selectedPath)
  }

  const platformHint =
    navigator.userAgent.includes('Win')
      ? 'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\431960'
      : '~/.steam/steam/steamapps/workshop/content/431960'

  return (
    <div className="flex h-full items-center justify-center bg-app">
      <div className="w-full max-w-lg rounded-xl border border-fg/10 bg-card p-8">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold text-gray-100">{t('setup.welcome')}</h1>
          <LanguageSelect />
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-gray-600">
          <span className={step === 1 ? 'text-accent-400' : 'text-gray-500'}>
            {t('setup.step1')}
          </span>
          <ArrowRight size={10} />
          <span className={step === 2 ? 'text-accent-400' : 'text-gray-500'}>
            {t('setup.step2')}
          </span>
        </div>

        {step === 1 && (
          <>
            <p className="mt-4 text-sm text-gray-400">
              {t('setup.selectFolder')}
            </p>

            <div className="mt-6">
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                {t('setup.workshopFolder')}
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={selectedPath}
                  onChange={(e) => setSelectedPath(e.target.value)}
                  className="flex-1 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-accent-500"
                />
                <button
                  onClick={handleBrowse}
                  className="flex items-center gap-2 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-300 hover:bg-fg/10"
                >
                  <FolderOpen size={16} />
                  {t('common.browse')}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-600">
                {tn('setup.typically', { path: <span className="font-mono">{platformHint}</span> })}
              </p>
            </div>

            <button
              onClick={handleConfirmPath}
              disabled={!selectedPath || saving}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ArrowRight size={16} />
              )}
              {t('common.next')}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <p className="mt-4 text-sm text-gray-400">
              {tn('setup.importQuestion', { file: <span className="font-mono text-gray-300">config.json</span> })}
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={handleImportConfig}
                disabled={importing}
                className="flex items-center gap-3 rounded-lg border border-fg/10 px-4 py-3 text-left transition-colors hover:bg-fg/5 disabled:opacity-50"
              >
                <Upload size={20} className="text-accent-400" />
                <div>
                  <p className="text-sm font-medium text-gray-200">
                    {t('setup.importExisting')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t('setup.importExistingHint')}
                  </p>
                </div>
              </button>

              <button
                onClick={handleCreateFresh}
                disabled={importing}
                className="flex items-center gap-3 rounded-lg border border-fg/10 px-4 py-3 text-left transition-colors hover:bg-fg/5 disabled:opacity-50"
              >
                <FilePlus size={20} className="text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-200">{t('setup.fresh')}</p>
                  <p className="text-xs text-gray-500">
                    {t('setup.freshHint')}
                  </p>
                </div>
              </button>
            </div>

            {importResult && (
              <div className="mt-4 rounded-lg bg-fg/5 px-4 py-3 text-xs text-gray-300">
                {importResult}
              </div>
            )}

            <div className="mt-6 rounded-lg border border-fg/10 px-4 py-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">{t('update.title')}</p>
              <UpdateCheckChoices value={updateChecks} onChange={setUpdateChecks} showEngine={showEngineCheck} />
            </div>

            <button
              onClick={handleFinish}
              disabled={importing}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
            >
              <Check size={16} />
              {importResult ? t('common.done') : t('setup.skip')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
