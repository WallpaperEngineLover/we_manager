# WE Manager

A Wallpaper Engine manager for Linux. It browses the Steam Workshop, keeps a local library of your wallpapers
with folders, tags and playlists, and plays them on the desktop with
[linux-wallpaperengine-kde](https://github.com/WallpaperEngineLover/linux-wallpaperengine-kde), the engine this
app is built around (it also works with the upstream
[linux-wallpaperengine](https://github.com/Almamu/linux-wallpaperengine), without the newer features).

Steam has to be running with Wallpaper Engine (app id 431960) in the library for Workshop browsing, subscribing and
voting. Without Steam the app still works as a local library manager.

## Features

**Workshop**
- Search with filters (tags, type, age rating, resolution, size, not downloaded, not liked), `a+b` (all words) and
  `-word` (exclude) terms, ignore creators, subscribe and unsubscribe, also several at once.
- Like, dislike and favorite with the result confirmed against Steam. The lists are cached on disk, so they are there
  when the app starts, with or without Steam running. Votes that failed are shown on the card and retried.
- "Verify files" checks an item against what Steam knows (state, folder, `project.json`, main file, size) and repairs it.
- Presets that depend on another Workshop item ask to install it before they are applied.

**Library**
- Everything you subscribed to, with folders, tags, favorites, sorting, filters and drag and drop. Card badges (HDR,
  HRTF, backed up, compatibility, removed from the Workshop) and card borders for liked, disliked and failed votes can
  be turned on or off. A wallpaper can have a custom thumbnail, picked from an image or captured from the wallpaper
  running with your settings.
- **Libraries on several disks**: add extra library folders (each with a name) on any disk, wallpapers there show up
  as "Local". Copy or move wallpapers between libraries from the context menu. Every copy is staged, written to disk,
  hash-checked and only then swapped in, a move deletes the original only after the final folder has been checked again,
  and an interrupted copy is recovered at the next start. A disk that is not mounted keeps its entries.
- **Backups**: pick a backup folder and back up the selected wallpapers, or everything that was removed from the
  Workshop, before it is lost. Backed up wallpapers stay in the library when you unsubscribe (there is an option to
  unsubscribe after a backup), outdated backups are marked when the Workshop has a newer version, a scan loads backups
  that already sit in the folder, and corrupted folders are skipped and reported.
- Import the folders and playlists of a Wallpaper Engine `config.json`.
- Unreadable settings files are moved aside and the app starts with defaults instead of failing.

**Playback**
- One wallpaper on every screen, one per screen, one spanning several screens, or several side by side on one screen
  (split screens). Screens are detected through the compositor (Plasma, GNOME, Hyprland, sway, niri, X11).
- Per wallpaper: scaling, zoom, offset, corner color, FPS, the wallpaper's own user properties applied live, Wallpaper
  Engine's image filters and color options, layer and effect toggles, extra engine arguments, shortcuts for the
  wallpaper's buttons, and trimming a video to one part or several parts.
- Changes are hot-swapped into the running engine where that is possible. A wallpaper that crashes is recorded
  (on launch, on switch, while running) with a note and a "test fresh launch" button, and marked on its card.
- **Playlists** per screen: a time per wallpaper or play videos to the end, shuffle or sort, favorites only, volume per
  item.
- **Schedules** switch wallpapers by time of day or by the system's dark and light theme.
- Tray menu with next wallpaper, and performance presets (battery saver, full quality).

**Settings**
- Performance: FPS limits (also on battery), pause when another window is fullscreen, maximized or focused, pause on
  battery or when idle, background layer, SSAA and MSAA, post processing, shadows, HDR output, hardware decoding.
- Audio: automute, silent mode, volume, audio processing and HRTF.
- Startup and tray, update notices for the app and the engine, library folders, backups, the desktop icons overlay.
- Appearance: theme, accent color, window transparency and KDE blur, card sizes and borders, animated previews always
  or on hover.
- 13 languages: English, German, Spanish, French, Italian, Japanese, Korean, Polish, Portuguese, Russian, Turkish and
  Chinese (simplified and traditional). The default follows the system language.

**Engine management**
- Downloads and updates the prebuilt engine, or builds it from source, and installs the system libraries it is missing
  (see Notes). Without the engine it can still set a wallpaper through hyprpaper, swww/awww or swaybg.

## Installing

- **AppImage / .deb** from the [releases](https://github.com/WallpaperEngineLover/we_manager/releases). The .deb
  updates itself through apt after asking for your password, the AppImage replaces its own file.
- **Flatpak**: the `.flatpak` bundle on the releases page comes with linux-wallpaperengine inside, for
  Bazzite, Silverblue/Kinoite, SteamOS and any other distribution:
  `flatpak install --user we-manager.flatpak` (needs Flathub for the runtime). To build it yourself:
  `packaging/flatpak/fetch-sources.sh`, then
  `flatpak-builder --user --install --force-clean build-dir packaging/flatpak/io.github.WallpaperEngineLover.we_manager.yml`.
- **AUR** (coming soon, AUR registration is paused right now): `we-manager-bin`, with `linux-wallpaperengine-kde-bin` or `-git` for the engine. Until then use the AppImage.

Which distributions and desktops the engine is tested on is listed in the
[engine's README](https://github.com/WallpaperEngineLover/linux-wallpaperengine-kde#readme).

## Running from source

```
npm install
npm run dev        # dev mode with hot reload
npm run build      # compile to out/
npm run dist       # package with electron-builder (AppImage and .deb)
npm test           # unit tests
npm run typecheck
npm run lint
```

## Notes

- Settings downloads a prebuilt linux-wallpaperengine from the
  [linux-wallpaperengine-kde releases](https://github.com/WallpaperEngineLover/linux-wallpaperengine-kde/releases)
  into `~/.local/share/linux-wallpaperengine-kde`: the Ubuntu 24.04 or Fedora 44
  build there, the portable build on every other distribution with glibc 2.35 or
  newer. The download is checked against the release's size and SHA-256 digest.
- Missing system libraries are installed through the distribution's package manager, which asks for your password
  (`pkexec`, else `sudo`): `apt` on Debian, Ubuntu and their derivatives (Mint, Zorin, MX), `dnf` on Fedora, `zypper`
  on openSUSE, `pacman` on Arch and its derivatives. Only packages that are absent are installed, on Arch a full
  system update is needed first if the package databases are out of date. Image-based systems (Silverblue, Bazzite,
  SteamOS) are not touched, use the Flatpak or the portable build there.
- It can also build and install the engine from source (needs the package manager and `make install`), from a
  configurable repository (git URL or local path) and branch. Inside the Flatpak the engine comes with the app. An
  engine installed by a package manager (AUR, a distribution package, Nix, the Flatpak) is left to that package manager,
  Settings says who owns it.
- The optional desktop icons overlay
  (`src/main/services/desktop-icons-overlay.py`) draws KDE Folder View icons
  on a transparent layer-shell surface above the wallpaper. It needs python3,
  GTK4, gtk4-layer-shell and pycairo, and only works on Wayland.
- On GNOME Wayland the engine needs its Shell extension, WE Manager offers to install it.
- KDE blur needs X11: with blur on in a Plasma Wayland session the app restarts itself through XWayland.
- The Steam connection only exists while the window is shown. Steam counts a process that initializes its API as a
  running game, which would show you as in-game and make Steam's game recording capture the wrong thing, so the
  connection is dropped when the window goes to the tray.
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
