#!/bin/sh
# build-local.sh: builds the rpm from the .deb in dist/ the way the CI job does; run `npm run dist:linux` first.
# The rpm ends up in dist/.

set -e
root=$(cd "$(dirname "$0")/../.." && pwd)
version=$(node -p "require('$root/package.json').version")
deb="$root/dist/we-manager_${version}_amd64.deb"
[ -f "$deb" ] || { echo "$deb not found, run npm run dist:linux first" >&2; exit 1; }
command -v rpmbuild >/dev/null || { echo "rpmbuild is not installed" >&2; exit 1; }

top=$(mktemp -d)
trap 'rm -rf "$top"' EXIT
mkdir -p "$top/SOURCES"
cp "$deb" "$top/SOURCES/"
sed "s/^Version:.*/Version:        $(echo "$version" | tr - '~')/; s/^%global upstream_version .*/%global upstream_version $version/" \
  "$root/packaging/rpm/we-manager.spec" > "$top/we-manager.spec"

rpmbuild -bb --define "_topdir $top" --define "_build_id_links none" "$top/we-manager.spec"
cp "$top"/RPMS/x86_64/*.rpm "$root/dist/"
ls -l "$root"/dist/*.rpm
