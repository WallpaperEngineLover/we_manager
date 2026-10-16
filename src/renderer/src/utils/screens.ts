import type { ScreenTarget } from '@shared/types'
import { t } from '../i18n'

export function screenLabel(screen: ScreenTarget): string {
  return screen === '*' ? t('common.allScreens') : screen
}
