import { useState, useEffect, Component, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Sidebar from './components/layout/Sidebar'
import WorkshopBrowser from './components/workshop/WorkshopBrowser'
import LibraryView from './components/library/LibraryView'
import PlaylistsView from './components/playlist/PlaylistsView'
import SettingsView from './components/settings/SettingsView'
import SetupScreen from './components/setup/SetupScreen'
import StatusBar from './components/layout/StatusBar'

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

  function browseCreator(steamId: string) {
    setCreatorFilter(steamId)
    setActiveView('workshop')
  }

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
    return window.electronAPI.on.libraryChanged(() => {
      queryClient.invalidateQueries({ queryKey: ['library'] })
    })
  }, [queryClient])

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
      <div className="flex h-full flex-col bg-[#0f0f0f] text-gray-100">
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
