#!/usr/bin/env bash
# Idempotent build script for the steamworks.js vote-support patch. Safe to re-run: every step
# checks whether it already happened before doing anything.
#
# Usage: ./build.sh [path-to-projects-dir]
# Defaults to ~/projects/private if no argument is given (matches this project's usual layout).
set -euo pipefail

PROJECTS_DIR="${1:-$HOME/projects/private}"
PATCHES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STEAMWORKS_RS="$PROJECTS_DIR/steamworks-rs"
STEAMWORKSJS="$PROJECTS_DIR/steamworksjs"
PINNED_REV="fbb79635b06b4feea8261e5ca3e8ea3ef42facf9"

echo "==> Rust toolchain"
if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
# shellcheck disable=SC1091
source "$HOME/.cargo/env"
cargo --version

echo "==> Cloning steamworks-rs (skipped if already present)"
if [ ! -d "$STEAMWORKS_RS" ]; then
  git clone https://github.com/Noxime/steamworks-rs "$STEAMWORKS_RS"
fi
git -C "$STEAMWORKS_RS" checkout --quiet "$PINNED_REV"

echo "==> Cloning steamworks.js (skipped if already present)"
if [ ! -d "$STEAMWORKSJS" ]; then
  git clone https://github.com/ceifa/steamworks.js "$STEAMWORKSJS"
fi

echo "==> Applying steamworks-rs patch (skipped if already applied)"
if grep -q "vote_up_item" "$STEAMWORKS_RS/src/ugc.rs"; then
  echo "    already applied"
else
  git -C "$STEAMWORKS_RS" apply "$PATCHES_DIR/steamworks-rs-ugc.patch"
fi

echo "==> Applying steamworks.js patch (skipped if already applied)"
if grep -q "vote_item" "$STEAMWORKSJS/src/api/workshop.rs"; then
  echo "    already applied"
else
  git -C "$STEAMWORKSJS" apply "$PATCHES_DIR/steamworks-js-workshop.patch"
fi

echo "==> Pointing steamworks.js's Cargo.toml at the local patched steamworks-rs (skipped if already done)"
if grep -qF 'Noxime/steamworks-rs' "$STEAMWORKSJS/Cargo.toml" && grep -q '\[patch\.' "$STEAMWORKSJS/Cargo.toml"; then
  echo "    already present"
else
  {
    printf '\n[patch."https://github.com/Noxime/steamworks-rs/"]\n'
    printf 'steamworks = { path = "../steamworks-rs" }\n'
  } >> "$STEAMWORKSJS/Cargo.toml"
fi

echo "==> Building steamworks.js (this runs cargo + napi, may take a minute)"
cd "$STEAMWORKSJS"
npm install
npm run build:debug

echo ""
echo "==> Done. Built artifact:"
ls -la "$STEAMWORKSJS/dist/linux64/steamworksjs.linux-x64-gnu.node"
echo ""
echo "Next: wire it into we_manager with:"
echo "  cd /path/to/we_manager"
echo "  npm pkg set dependencies.steamworks.js=\"file:$STEAMWORKSJS\""
echo "  npm install && npm run build"
