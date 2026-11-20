/** Stored desktop-icons choice. `migrated` stays false until a KDE Wayland session has been seen. */
export interface DesktopIconsChoice {
  migrated: boolean
  enabled: boolean
  auto: boolean
}

/**
 * Folder View sits under the wallpaper on KDE Wayland. The factory pair is icons off and auto on,
 * which never draws them, so turn the option on once. Switching it off afterwards stays off.
 * Other desktops are left untouched and unmarked, so a later Plasma Wayland login still adopts.
 */
export function adoptDesktopIcons(state: DesktopIconsChoice, kdeWayland: boolean): DesktopIconsChoice {
  if (state.migrated || !kdeWayland) return state
  return { migrated: true, enabled: state.enabled || state.auto, auto: state.auto }
}
