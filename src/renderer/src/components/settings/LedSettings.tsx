import { Lightbulb } from 'lucide-react'
import Toggle from '../common/Toggle'
import { useConfigSection } from '../../hooks/queries'
import { t } from '../../i18n'

export default function LedSettings() {
  const [leds, change] = useConfigSection(
    (cfg) => cfg.leds,
    (next) => window.electronAPI.config.setLeds(next)
  )

  if (!leds) return null

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">{t('settings.leds')}</label>
      <p className="mt-1 text-xs text-gray-600">{t('settings.ledsHint')}</p>
      <label className="mt-3 flex items-center gap-3 cursor-pointer">
        <Toggle on={leds.enabled} onClick={() => { change({ enabled: !leds.enabled }); }} />
        <span className="flex items-center gap-2 text-sm text-gray-300">
          <Lightbulb size={16} />
          {t('settings.ledsEnable')}
        </span>
      </label>
      {leds.enabled && (
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('settings.ledsServer')}</label>
            <input
              type="text"
              value={leds.server}
              onChange={(e) => { change({ server: e.target.value }); }}
              className="w-56 rounded-lg bg-fg/5 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-accent-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('settings.ledsBrightness', { value: leds.brightness })}</label>
            <input
              type="range"
              min={0}
              max={100}
              value={leds.brightness}
              onChange={(e) => { change({ brightness: parseInt(e.target.value, 10) }); }}
              className="w-56"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <Toggle on={leds.boost} onClick={() => { change({ boost: !leds.boost }); }} />
            <span className="text-sm text-gray-300">{t('settings.ledsBoost')}</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <Toggle on={leds.reduceFps} onClick={() => { change({ reduceFps: !leds.reduceFps }); }} />
            <span className="text-sm text-gray-300">{t('settings.ledsReduceFps')}</span>
          </label>
          <p className="text-xs text-gray-600">{t('settings.ledsApply')}</p>
        </div>
      )}
    </div>
  )
}
