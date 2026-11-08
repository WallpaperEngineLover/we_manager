import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Mic, RefreshCw } from 'lucide-react'
import type { EngineFlags } from '@shared/types'
import { useConfig } from '../../hooks/queries'
import { inputClass } from '../common/inputClass'
import CommitRange from '../common/sidebar/CommitRange'
import { t } from '../../i18n'

export default function AudioInputSettings() {
  const queryClient = useQueryClient()
  const config = useConfig()
  const flags: EngineFlags = config?.engineFlags ?? {}
  const latestFlags = useRef(flags)
  useEffect(() => {
    latestFlags.current = flags
  })
  const { data: devices = [], refetch } = useQuery({
    queryKey: ['audio-inputs'],
    queryFn: () => window.electronAPI.lwe.listAudioInputs()
  })

  const [sliding, setSliding] = useState<EngineFlags>({})

  // an engine without the option lists nothing, there is nothing to choose then
  if (!config || devices.length === 0) return null

  async function save(patch: EngineFlags) {
    const next = { ...latestFlags.current, ...patch }
    latestFlags.current = next
    queryClient.setQueryData(['config'], { ...config!, engineFlags: next })
    await window.electronAPI.config.setEngineFlags(next)
    void queryClient.invalidateQueries({ queryKey: ['config'] })
  }

  function commit() {
    const pending = sliding
    if (Object.keys(pending).length === 0) return
    void save(pending).then(() => { setSliding((cur) => (cur === pending ? {} : cur)) }).catch(console.error)
  }

  const device = flags.audioInput ?? 'default'
  const known = device === 'default' || devices.some((d) => d.name === device)
  const volume = sliding.audioInputVolume ?? flags.audioInputVolume ?? 50
  const threshold = sliding.audioInputThreshold ?? flags.audioInputThreshold ?? 0

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">{t('audioInput.title')}</label>
      <p className="mt-1 text-xs text-gray-600">{t('audioInput.hint')}</p>

      <div className="mt-3 flex items-center gap-2">
        <Mic size={14} className="text-gray-400" />
        <select
          value={device}
          onChange={(e) => void save({ audioInput: e.target.value === 'default' ? undefined : e.target.value })}
          className={`${inputClass} min-w-0 flex-1`}
        >
          <option value="default">{t('audioInput.default')}</option>
          {!known && <option value={device}>{device}</option>}
          <optgroup label={t('audioInput.inputs')}>
            {devices.filter((d) => !d.monitor).map((d) => (
              <option key={d.name} value={d.name}>{d.description || d.name}</option>
            ))}
          </optgroup>
          <optgroup label={t('audioInput.outputs')}>
            {devices.filter((d) => d.monitor).map((d) => (
              <option key={d.name} value={d.name}>{d.description || d.name}</option>
            ))}
          </optgroup>
        </select>
        <button onClick={() => void refetch()} title={t('audioInput.refresh')} className="rounded p-1.5 text-gray-500 hover:text-gray-200">
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="mt-3">
        <label className="block text-xs text-gray-400 mb-1">{t('audioInput.volume', { value: volume })}</label>
        <div className="w-56">
          <CommitRange
            min={0}
            max={100}
            value={volume}
            disabled={false}
            onSlide={(v) => { setSliding((cur) => ({ ...cur, audioInputVolume: v })) }}
            onCommit={commit}
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-xs text-gray-400 mb-1">{t('audioInput.threshold', { value: threshold })}</label>
        <div className="w-56">
          <CommitRange
            min={0}
            max={500}
            value={threshold}
            disabled={false}
            onSlide={(v) => { setSliding((cur) => ({ ...cur, audioInputThreshold: v })) }}
            onCommit={commit}
          />
        </div>
        <p className="mt-1 text-xs text-gray-600">{t('audioInput.thresholdHint')}</p>
      </div>
    </div>
  )
}
