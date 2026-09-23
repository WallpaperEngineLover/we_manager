import type { ScreenTarget } from '@shared/types'

export function screenLabel(screen: ScreenTarget): string {
  return screen === '*' ? 'All screens' : screen
}
