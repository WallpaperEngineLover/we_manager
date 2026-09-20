# steamworks.js vote support patch

`steamworks.js` (the Node wrapper this app uses for all Steam integration) doesn't bind
`ISteamUGC::SetUserItemVote`/`GetUserItemVote` at all - confirmed by reading its actual source and
the `steamworks-rs` Rust crate underneath it, not just its published `.d.ts`. Without this patch,
`we_manager` casts votes via a raw FFI call to the flat `SetUserItemVote` C function directly
(see `voteOnItem()` in `src/main/services/steam.service.ts`), which works for casting the vote but
can't reliably read back whether Steam actually accepted it: `steamworks.js`'s native addon owns
Steam's manual-dispatch loop for this process and consumes every completed call's result as it
ticks (~30/sec), including ones made via raw FFI from outside it - so there's no way to get real
confirmation without going through `steamworks.js`'s own dispatch ownership.

These patches add `voteItem`/`getUserVote` to a `steamworks.js` build the same way its own
`subscribe`/`unsubscribe`/`getUserItems` are already implemented - registered through its existing
internal async-call tracking (`register_call_result`), so they resolve correctly with no race.
Once built and in place, `we_manager` detects and uses them automatically (see
`getPatchedVoteApi()` in `steam.service.ts`) - the app keeps working without this patch too, just
falling back to "trust the vote, sync later" instead of genuine confirmation.

## What's in this directory

- `steamworks-rs-ugc.patch` - adds `UGC::vote_up_item`/`UGC::user_item_vote` to the `steamworks`
  Rust crate (`Noxime/steamworks-rs`), mirroring its existing `subscribe_item`/`unsubscribe_item`
  exactly.
- `steamworks-js-workshop.patch` - adds the corresponding `voteItem`/`getUserVote` napi-exposed
  async functions to `steamworks.js`'s own `src/api/workshop.rs`, mirroring its existing
  `subscribe`/`unsubscribe`.
- `steamworks-js-client-d-ts.patch` - adds the matching TypeScript declarations to `client.d.ts`.
  Not strictly required to apply by hand: `npm run build` regenerates this file from the Rust
  `#[napi]` annotations automatically. Kept here for reference/as a fallback.

All three were generated against and verified (`git apply --check`) to apply cleanly to:
- `ceifa/steamworks.js` at its current `main` (the version this project's `package.json` pins,
  `0.4.0`, predates these files slightly - a couple of unrelated functions were added upstream
  since - but the patch targets are unaffected).
- `Noxime/steamworks-rs` at the exact commit `steamworks.js`'s own `Cargo.toml` pins
  (`fbb79635b06b4feea8261e5ca3e8ea3ef42facf9`).

**Not yet compiled or run** - this sandbox has no Rust toolchain, so the Rust code was written and
verified by hand against the real upstream source (exact struct layouts/callback ids
cross-checked against actual `bindgen`-generated output, not guessed) but never built. Do a real
build + a real vote/like click before trusting it fully.

## Building it (on your real machine, which has Steam installed and running - required by
## steamworks.js's own build)

```bash
# 1. Clone both repos somewhere, e.g. alongside your other private forks
cd ~/projects/private
git clone https://github.com/Noxime/steamworks-rs
git clone https://github.com/ceifa/steamworks.js steamworksjs
cd steamworks-rs && git checkout fbb79635b06b4feea8261e5ca3e8ea3ef42facf9 && cd ..

# 2. Apply the patches
cd steamworks-rs && git apply /path/to/we_manager/patches/steamworks-vote/steamworks-rs-ugc.patch && cd ..
cd steamworksjs && git apply /path/to/we_manager/patches/steamworks-vote/steamworks-js-workshop.patch && cd ..

# 3. Point steamworks.js's build at your patched local steamworks-rs checkout instead of the
#    pinned git rev - add this to the END of steamworksjs/Cargo.toml:
cat >> steamworksjs/Cargo.toml <<'EOF'

[patch."https://github.com/Noxime/steamworks-rs/"]
steamworks = { path = "../steamworks-rs" }
EOF

# 4. Make sure you have: latest Node.js, Rust (rustup.rs), and Clang (needed by bindgen).
#    On Fedora/Nobara: sudo dnf install clang clang-devel
sudo dnf install clang clang-devel   # if not already installed

cd steamworksjs
npm install
npm run build:debug   # or `npm run build` for a release build - both work, release is smaller/faster
```

If it builds cleanly, `steamworksjs/dist/linux64/steamworksjs.linux-x64-gnu.node` and
`steamworksjs/client.d.ts` are the freshly built, patched artifacts.

## Wiring it into we_manager

Easiest: point `we_manager`'s own `package.json` dependency at your local patched checkout instead
of the npm-published package, so it survives future `npm install`s:

```jsonc
// we_manager/package.json
"dependencies": {
  "steamworks.js": "file:../steamworksjs"
}
```

Then from `we_manager`:

```bash
npm install
npm run build
```

(A quicker, non-persistent way to try it first: just copy the freshly built
`steamworksjs/dist/linux64/steamworksjs.linux-x64-gnu.node` over
`we_manager/node_modules/steamworks.js/dist/linux64/steamworksjs.linux-x64-gnu.node` directly -
gets wiped out by the next `npm install` though, so switch to the `file:` dependency once you've
confirmed it works.)

## Verifying it actually took effect

`getPatchedVoteApi()` in `steam.service.ts` detects the new functions at runtime - no config flag
needed. To confirm: like something in the app, then check the main process console log. There's no
explicit "patched build detected" log line today, but you can add one temporarily, or just trust
the behavior - once this is wired up, `voteOnItemAndConfirm()`'s patched branch runs, meaning a
returned `confirmed: true` is now a real answer from Steam, not an optimistic guess, and
`checkUserVote(itemId)` becomes available for a genuine on-demand "is this item already liked"
check (not yet wired into any UI - a good next step, since once this works it can replace the
whole crawl-based `votedUpCache`/`getVotedUpItemIds()` mechanism entirely for populating "liked"
state, not just for confirming a fresh vote).
