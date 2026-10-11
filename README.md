# we_manager

A Wallpaper Engine manager for Linux. Browses the Steam Workshop through
steamworks.js, keeps a local library of subscribed wallpapers with folders and
tags, and plays animated wallpapers on the desktop via
[linux-wallpaperengine](https://github.com/Almamu/linux-wallpaperengine).

Steam must be running and Wallpaper Engine (app id 431960) must be in the
library for workshop browsing and subscriptions to work. Without Steam the app
still works as a local library manager.

## Installing

- **AppImage / .deb** from the [releases](https://github.com/WallpaperEngineLover/we_manager/releases).
- **Flatpak**: the `.flatpak` bundle on the releases page comes with linux-wallpaperengine inside, for
  Bazzite, Silverblue/Kinoite, SteamOS and any other distribution:
  `flatpak install --user we-manager.flatpak` (needs Flathub for the runtime). To build it yourself:
  `packaging/flatpak/fetch-sources.sh`, then
  `flatpak-builder --user --install --force-clean build-dir packaging/flatpak/io.github.WallpaperEngineLover.we_manager.yml`.
- **AUR**: `we-manager-bin`, with `linux-wallpaperengine-kde-bin` or `-git` for the engine.

## Running

```
npm install
npm run dev      # dev mode with hot reload
npm run build    # compile to out/
npm run dist     # package with electron-builder
```

## Notes

- Settings downloads a prebuilt linux-wallpaperengine from the
  [linux-wallpaperengine-kde releases](https://github.com/WallpaperEngineLover/linux-wallpaperengine-kde/releases)
  into `~/.local/share/linux-wallpaperengine-kde`: the Ubuntu 24.04 or Fedora 44
  build there, the portable build on every other distribution with glibc 2.35 or
  newer (Arch, SteamOS, image-based systems, Debian, openSUSE, older and newer
  Ubuntu and Fedora). sudo is only needed for missing system libraries. It can
  also build and install from source (needs sudo for the package manager and
  `make install`), from a configurable repository (git URL or local path) and
  branch. Inside the Flatpak the engine comes with the app.
- The optional desktop icons overlay
  (`src/main/services/desktop-icons-overlay.py`) draws KDE Folder View icons
  on a transparent layer-shell surface above the wallpaper. It needs python3,
  GTK4, gtk4-layer-shell and pycairo, and only works on Wayland.
- `steam_appid.txt` is required by the Steamworks SDK and must stay next to
  the app.
- Known issue: disabling "Enable system tray" in Settings can leave the tray
  icon in the panel until the app is fully closed. Electron's Linux tray
  backend doesn't reliably release the icon's DBus/StatusNotifierItem
  registration while the process is still running, even though `destroy()`
  is called correctly on our end. Confirmed upstream: relaunching the process
  is the only thing that clears it, but doing that from the toggle itself
  caused GPU/window failures on Wayland, so it isn't worth the tradeoff.

## Hyprland, Sway, niri and other wlroots compositors

- Screens come from the compositor itself when its session variable is set: `hyprctl monitors -j`
  (`HYPRLAND_INSTANCE_SIGNATURE`), `swaymsg -t get_outputs -r` (`SWAYSOCK`) or `niri msg --json outputs`
  (`NIRI_SOCKET`). Disabled outputs are skipped. `wlr-randr`, `kscreen-doctor`, GNOME's D-Bus API and `xrandr`
  stay as the fallbacks, in that order.
- Settings > Performance has "Use the background layer" (`--layer background`) on these compositors and on KDE.
  niri needs it, the engine's default is the bottom layer. The stored setting is still called
  `kdeBackgroundLayer`, so existing configs keep working.
- These compositors do not run `~/.config/autostart` entries, so Settings shows the line for the compositor
  config next to the startup toggle (`exec-once = ... --minimized` for Hyprland, `exec ... --minimized` for sway,
  `spawn-at-startup` for niri, the plain command otherwise). It only shows in a packaged build, the path is the
  AppImage or the installed executable.
- Closing the window to the tray (and `--minimized`) needs a StatusNotifier host on the session bus, e.g. the
  tray module of waybar or a Quickshell tray. Without one, closing quits the app and `--minimized` shows the
  window after waiting 10 seconds for the host to appear. If neither `busctl` nor `gdbus` can tell, a host is
  assumed.
- Click forwarding: a layer-shell background surface gets no mouse buttons while a bar or shell covers it. With an
  engine that has `--input-file`, WE Manager starts each engine with `$XDG_RUNTIME_DIR/lwe-input-<screen>`
  (`lwe-input-all` when one engine draws every screen), and Settings > Performance lists the paths. A shell or
  compositor binding writes `{"leftDown":true}` into that file while the left button is held, e.g.
  `echo '{"leftDown":true}' > "$XDG_RUNTIME_DIR/lwe-input-DP-1"`, and keeps refreshing it: the engine ignores
  the file once it is older than 2 seconds. WE Manager never writes the file itself.
- Not done, these are engine side and tracked in the linux-wallpaperengine-kde repository: the fullscreen pause is
  global per engine and ignores maximized windows on wlroots compositors, fractional scaling is rounded to an
  integer scale, and the Flatpak sandbox cannot reach the Hyprland socket.
