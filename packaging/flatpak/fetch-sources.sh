#!/usr/bin/env bash
# Downloads what the manifest packages into this folder: the latest we_manager .deb (or the version given as the
# first argument, e.g. 0.8.1) and the latest linux-wallpaperengine-kde portable tarball (the KDE variant, its
# integration only switches on inside a Plasma session).
set -euo pipefail
cd "$(dirname "$0")"

asset_url() {
    curl -fsSL "https://api.github.com/repos/$1/releases/${2:-latest}" |
        jq -r --arg name "$3" '.assets[] | select(.name | test($name)) | .browser_download_url' | head -1
}

tag=latest
[ -n "${1:-}" ] && tag="tags/v$1"
deb=$(asset_url WallpaperEngineLover/we_manager "$tag" '^we-manager_.*_amd64\.deb$')
engine=$(asset_url WallpaperEngineLover/linux-wallpaperengine-kde latest '^linux-wallpaperengine-kde-portable-x86_64\.tar\.gz$')
[ -n "$deb" ] || { echo "no we_manager .deb in that release" >&2; exit 1; }
[ -n "$engine" ] || { echo "the latest linux-wallpaperengine-kde release has no portable tarball" >&2; exit 1; }

curl -fL "$deb" -o we-manager.deb
curl -fL "$engine" -o linux-wallpaperengine-kde-portable-x86_64.tar.gz
