import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { t } from '../i18n'

export function useFontAdd(addedMessage: (count: number) => string) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<string | null>(null)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['user-fonts'] })
    await queryClient.invalidateQueries({ queryKey: ['lwe-fonts'] })
  }

  async function add() {
    const result = await window.electronAPI.fonts.add()
    setStatus(
      result.rejected.length > 0
        ? t('fonts.rejected', { files: result.rejected.join(', ') })
        : result.added.length > 0
          ? addedMessage(result.added.length)
          : null
    )
    await refresh()
  }

  return { status, setStatus, add, refresh }
}
