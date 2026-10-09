#!/bin/sh
# Electron's own sandbox goes through flatpak-spawn (zypak), Chromium can't create user namespaces in a Flatpak
export TMPDIR="$XDG_RUNTIME_DIR/app/$FLATPAK_ID"
exec zypak-wrapper "/app/we-manager/we-manager" "$@"
