import { useState, useEffect, Component, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { FavoriteStatus } from '@shared/types'
import Sidebar from './components/layout/Sidebar'
import WorkshopBrowser from './components/workshop/WorkshopBrowser'
import LibraryView from './components/library/LibraryView'
import PlaylistsView from './components/playlist/PlaylistsView'
import SettingsView from './components/settings/SettingsView'
import SetupScreen from './components/setup/SetupScreen'
import StatusBar from './components/layout/StatusBar'
import { useToast } from './components/common/Toast'
import { screenLabel } from './utils/screens'
import { useConfig } from './hooks/queries'
import { FAVORITE_STATUS_KEY } from './hooks/useFavorites'
import { DISLIKED_IDS_KEY } from './hooks/useVotes'
import { applyAppearance, onSystemThemeChange } from './utils/appearance'

type View = 'workshop' | 'library' | 'playlists' | 'settings'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center p-8 text-center">
          <div>
            <p className="text-red-400 font-medium">Something went wrong</p>
            <p className="mt-2 text-xs text-gray-500">{(this.state.error as Error).message}</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const [activeView, setActiveView] = useState<View>('workshop')
  const [setupDone, setSetupDone] = useState<boolean | null>(null)
  const [defaultPath, setDefaultPath] = useState('')
  const [creatorFilter, setCreatorFilter] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  function browseCreator(steamId: string) {
    setCreatorFilter(steamId)
    setActiveView('workshop')
  }

  const config = useConfig()
  useEffect(() => {
    if (!config) return
    const apply = (): void => applyAppearance(config.appearance, config.windowTranslucent)
    apply()
    return onSystemThemeChange(apply)
  }, [config])

  useEffect(() => {
    window.electronAPI.config.get().then((cfg) => {
      setDefaultPath(cfg.defaultWorkshopPath)
      setSetupDone(cfg.isConfigured)
    })
  }, [])

  // Subscribed here (rather than in SettingsView) so an in-progress LWE build/install survives
  // navigating to another tab and back - SettingsView unmounts on navigation, App never does.
  useEffect(() => {
    return window.electronAPI.on.lweInstallProgress((progress) => {
      queryClient.setQueryData(['lwe-install-progress'], progress)
    })
  }, [queryClient])

  // Background sync (main/index.ts) periodically re-checks votes and library availability
  // against Steam and pushes updates here, so likes cast elsewhere and items pulled from the
  // Workshop show up without a restart or a manual refresh.
  useEffect(() => {
    return window.electronAPI.on.votedIdsChanged((ids) => {
      queryClient.setQueryData(['steam-voted-ids'], ids)
    })
  }, [queryClient])

  useEffect(() => {
    return window.electronAPI.on.dislikedIdsChanged((ids) => {
      queryClient.setQueryData(DISLIKED_IDS_KEY, ids)
    })
  }, [queryClient])

  useEffect(() => {
    return window.electronAPI.on.favoriteIdsChanged((ids) => {
      queryClient.setQueryData(['steam-favorite-ids'], ids)
    })
  }, [queryClient])

  useEffect(() => {
    return window.electronAPI.on.favoriteStatusChanged((status) => {
      const before = queryClient.getQueryData<FavoriteStatus>(FAVORITE_STATUS_KEY)?.failed ?? {}
      const newReadBackFailures = Object.entries(status.failed).filter(
        ([id, failure]) => failure.readBack && !before[id]
      ).length
      queryClient.setQueryData(FAVORITE_STATUS_KEY, status)
      if (newReadBackFailures > 0) {
        showToast(
          newReadBackFailures === 1
            ? "A favorite change didn't show up in your Steam favorites - its card has a dashed border"
            : `${newReadBackFailures} favorite changes didn't show up in your Steam favorites - their cards have a dashed border`,
          { warning: true, durationMs: 8000 }
        )
      }
    })
  }, [queryClient, showToast])

  useEffect(() => {
    return window.electronAPI.on.failedVotesChanged((failed) => {
      queryClient.setQueryData(['steam-failed-votes'], failed)
    })
  }, [queryClient])

  useEffect(() => {
    return window.electronAPI.on.libraryChanged(() => {
      queryClient.invalidateQueries({ queryKey: ['library'] })
    })
  }, [queryClient])

  useEffect(() => {
    return window.electronAPI.on.wallpaperCrashed((event) => {
      const where = event.screen === '*' ? '' : ` on ${screenLabel(event.screen)}`
      showToast(`${event.title}${where}: ${event.outcome}`, { warning: true, durationMs: 8000 })
    })
  }, [showToast])

  useEffect(() => {
    return window.electronAPI.on.scheduleFired((name) => showToast(`Schedule: ${name}`))
  }, [showToast])

  if (setupDone === null) return null // loading

  if (!setupDone) {
    return (
      <ErrorBoundary>
        <SetupScreen defaultPath={defaultPath} onComplete={() => setSetupDone(true)} />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <div className="flex h-full flex-col bg-app text-gray-100">
        <div className="flex flex-1 overflow-hidden">
          <Sidebar activeView={activeView} onNavigate={setActiveView} />
          <main className="flex-1 overflow-hidden">
            {activeView === 'workshop' && (
              <WorkshopBrowser
                creatorFilter={creatorFilter}
                onClearCreatorFilter={() => setCreatorFilter(null)}
                onBrowseCreator={browseCreator}
              />
            )}
            {activeView === 'library' && <LibraryView onBrowseCreator={browseCreator} />}
            {activeView === 'playlists' && <PlaylistsView onBrowseCreator={browseCreator} />}
            {activeView === 'settings' && <SettingsView />}
          </main>
        </div>
        <StatusBar />
      </div>
    </ErrorBoundary>
  )
}
