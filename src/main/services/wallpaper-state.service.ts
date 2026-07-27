import Store from 'electron-store'

interface StoreSchema {
  activeWallpaperId?: string
}

const store = new Store<StoreSchema>()

export function getActiveWallpaperId(): string | undefined {
  return store.get('activeWallpaperId')
}

export function setActiveWallpaperId(id: string): void {
  store.set('activeWallpaperId', id)
}
