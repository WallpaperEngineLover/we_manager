import { useState, useEffect, Component, type ReactNode } from 'react'
import Sidebar from './components/layout/Sidebar'
import WorkshopBrowser from './components/workshop/WorkshopBrowser'
import LibraryView from './components/library/LibraryView'
import SettingsView from './components/settings/SettingsView'
import SetupScreen from './components/setup/SetupScreen'
import StatusBar from './components/layout/StatusBar'

type View = 'workshop' | 'library' | 'settings'

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

  useEffect(() => {
    window.electronAPI.config.get().then((cfg) => {
      setDefaultPath(cfg.defaultWorkshopPath)
      setSetupDone(cfg.isConfigured)
    })
  }, [])

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
            {activeView === 'workshop' && <WorkshopBrowser />}
            {activeView === 'library' && <LibraryView />}
            {activeView === 'settings' && <SettingsView />}
          </main>
        </div>
        <StatusBar />
      </div>
    </ErrorBoundary>
  )
}
