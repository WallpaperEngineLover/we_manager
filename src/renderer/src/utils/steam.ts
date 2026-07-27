export function openWorkshopPage(id: string): void {
  window.electronAPI.shell.openExternal(`steam://url/CommunityFilePage/${id}`)
}
