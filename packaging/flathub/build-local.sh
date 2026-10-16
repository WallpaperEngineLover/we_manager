#!/bin/sh
# build-local.sh <engine checkout> [flatpak-builder args]: builds the Flathub manifest from the working trees, e.g.
#   packaging/flathub/build-local.sh ../linux-wallpaperengine-kde --user --install --force-clean build-dir

set -e
here=$(cd "$(dirname "$0")" && pwd)
engine=$(cd "$1" && pwd)
shift
manifest="$here/local.yml"
python3 - "$here/io.github.WallpaperEngineLover.we_manager.yml" "$manifest" "$engine" "$(cd "$here/../.." && pwd)" <<'PY'
import sys
source, target, engine, app = sys.argv[1:]
text = open(source).read()
for url, path in (('https://github.com/WallpaperEngineLover/linux-wallpaperengine-kde.git', engine),
                  ('https://github.com/WallpaperEngineLover/we_manager.git', app)):
    start = text.index('url: ' + url)
    head = text.rindex('- type: git', 0, start)
    end = text.index('\n', text.index('commit:', start))
    indent = text[text.rindex('\n', 0, head) + 1:head]
    extra = '\n' + indent + '  skip: [node_modules, dist, out, build, .git]' if path == app else \
        '\n' + indent + '  skip: [build, .git]'
    text = text[:head] + '- type: dir\n' + indent + '  path: ' + path + extra + text[end:]
open(target, 'w').write(text)
PY
exec flatpak-builder "$@" "$manifest"
