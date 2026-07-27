# we_manager

A Wallpaper Engine manager for Linux. Browses the Steam Workshop through
steamworks.js, keeps a local library of subscribed wallpapers with folders and
tags, and plays animated wallpapers on the desktop via
[linux-wallpaperengine](https://github.com/Almamu/linux-wallpaperengine).

Steam must be running and Wallpaper Engine (app id 431960) must be in the
library for workshop browsing and subscriptions to work. Without Steam the app
still works as a local library manager.

## Running

```
npm install
npm run dev      # dev mode with hot reload
npm run build    # compile to out/
npm run dist     # package with electron-builder
```

## Notes

- Settings can build and install linux-wallpaperengine from source (needs
  sudo for the package manager and `make install`). A custom repository (git
  URL or local path) and branch can be set there to build from a fork instead
  of the official repo.
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
