export function openWorkshopPage(id: string): void {
  window.electronAPI.shell.openExternal(`steam://url/CommunityFilePage/${id}`)
}

export function openProfilePage(steamId: string): void {
  window.electronAPI.shell.openExternal(`steam://url/SteamIDPage/${steamId}`)
}

// Backup-sourced wallpapers use their folder name as id, which isn't always
// a real Steam published file id (e.g. a manually renamed backup folder).
export function isWorkshopId(id: string): boolean {
  return /^\d+$/.test(id)
}
