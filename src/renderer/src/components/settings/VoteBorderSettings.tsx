import { useQueryClient } from '@tanstack/react-query'
import { ThumbsUp } from 'lucide-react'
import { useVoteBorders } from '../../hooks/useVoteBorders'

export default function VoteBorderSettings() {
  const queryClient = useQueryClient()
  const { enabled } = useVoteBorders()

  async function toggle() {
    await window.electronAPI.config.setVoteBorders(!enabled)
    queryClient.invalidateQueries({ queryKey: ['config'] })
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Likes</label>
      <label className="mt-3 flex items-center gap-3 cursor-pointer">
        <button
          onClick={toggle}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            enabled ? 'bg-indigo-600' : 'bg-white/10'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
        <span className="flex items-center gap-2 text-sm text-gray-300">
          <ThumbsUp size={16} />
          Show like borders on wallpapers
        </span>
      </label>
      <p className="mt-1 text-xs text-gray-600">
        Green for wallpapers you liked on Steam, red for ones where the like failed after retrying (hover for the
        reason). Failed likes are remembered until the app restarts.
      </p>
    </div>
  )
}
