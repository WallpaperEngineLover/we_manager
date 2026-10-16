import type { UpdateChecks } from '@shared/types'
import { t } from '../../i18n'

interface UpdateCheckChoicesProps {
  value: UpdateChecks
  onChange: (value: UpdateChecks) => void
  /** false when the engine comes with the app (Flatpak) */
  showEngine: boolean
}

export default function UpdateCheckChoices({ value, onChange, showEngine }: UpdateCheckChoicesProps) {
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={value.app}
          onChange={() => onChange({ ...value, app: !value.app })}
          className="cursor-pointer"
        />
        {t('update.checkApp')}
      </label>
      {showEngine && (
        <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={value.engine}
            onChange={() => onChange({ ...value, engine: !value.engine })}
            className="cursor-pointer"
          />
          {t('update.checkEngine')}
        </label>
      )}
      <p className="text-xs text-gray-500">{t('update.checksHint')}</p>
    </div>
  )
}
