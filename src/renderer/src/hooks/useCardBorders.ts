import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DEFAULT_CARD_BORDERS, type CardBorderKind, type CardBorders } from '@shared/cardBorders'
import { useConfig } from './queries'
import { useDislikedIds, useVotedIds } from './useVotes'
import { useFavoriteIds, useFavoriteStatus } from './useFavorites'

export function useCardBorders(): CardBorders {
  return useConfig()?.cardBorders ?? DEFAULT_CARD_BORDERS
}

export function useFailedVotes(): Record<string, string> {
  const { data } = useQuery({
    queryKey: ['steam-failed-votes'],
    queryFn: () => window.electronAPI.steam.getFailedVotes()
  })
  return data ?? {}
}

export interface CardSteamState {
  isLiked: boolean
  isDisliked: boolean
  isFavorite: boolean
  voteError?: string
  favoriteError?: string
}

export function useCardSteamState(): (id: string) => CardSteamState {
  const liked = useVotedIds()
  const disliked = useDislikedIds()
  const favorites = useFavoriteIds()
  const failedVotes = useFailedVotes()
  const favoriteStatus = useFavoriteStatus()
  return useCallback(
    (id: string) => ({
      isLiked: liked.has(id),
      isDisliked: disliked.has(id),
      isFavorite: favorites.has(id),
      voteError: failedVotes[id],
      favoriteError: favoriteStatus.failed[id]?.message
    }),
    [liked, disliked, favorites, failedVotes, favoriteStatus]
  )
}

export interface CardFrame {
  kind: CardBorderKind
  color: string
}

// vote frame + favorite frame, a failed change replaces its state
export function cardFrames(borders: CardBorders, state: CardSteamState): { frames: CardFrame[]; title?: string } {
  const frames: CardFrame[] = []
  const errors: string[] = []
  const add = (kind: CardBorderKind): void => {
    if (borders[kind].enabled) frames.push({ kind, color: borders[kind].color })
  }

  if (state.voteError && borders.failed.enabled) {
    add('failed')
    errors.push(state.voteError)
  } else if (state.isLiked) add('liked')
  else if (state.isDisliked) add('disliked')

  if (state.favoriteError && borders.failed.enabled) {
    if (!frames.some((f) => f.kind === 'failed')) add('failed')
    errors.push(state.favoriteError)
  } else if (state.isFavorite) add('favorite')

  return { frames, title: errors.length > 0 ? errors.join('\n') : undefined }
}
