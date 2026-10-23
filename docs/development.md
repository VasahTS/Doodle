# Development

Doodle uses Tauri 2, Rust and plain HTML/CSS/JavaScript. No frontend framework or JavaScript build step is required by the app.

## Run locally

Install [Rust](https://rustup.rs) and the native dependencies required by Tauri. On Windows, this includes the Microsoft C++ Build Tools. Windows is the primary development platform.

From the repository root:

```sh
cargo install tauri-cli --version "^2" --locked
cargo tauri dev
```

Build an installer with:

```sh
cargo tauri build
```

You can also open `src/index.html` in a browser to inspect the interface. The desktop bridge, native file dialogs and updater need the Tauri app.

## Source map

| Path | Purpose |
|---|---|
| `src/index.html` | Interface, tools, canvas presentation, file formats, recovery and translations. |
| `src/liquify-engine.js` | Sparse Liquify worker, WebGL2 path and CPU fallbacks. |
| `src/build-info.js` | Build identity used by local diagnostics; release workflows stamp the commit. |
| `src-tauri/src/main.rs` | Native file/plugin bridge and startup graphics preference. |
| `src-tauri/tauri.conf.json` | Version, app identity, window, installer and updater configuration. |
| `tests/` | Browser regression checks and the native performance smoke harness. |

## Tests

The tests use tooling installed outside the application. See [tests/README.md](../tests/README.md) for Playwright, the PSD reader and environment options.

Run the full regression suite with `node tests/run.cjs`. Liquify stress checks are in `tests/liquify-stress.cjs`; the test method and limits are documented in [performance-liquify.md](performance-liquify.md).

## Publish a release

1. Update the version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and the `doodle` package in `src-tauri/Cargo.lock`.
2. Add the matching English entry to [CHANGELOG.md](../CHANGELOG.md) and run the appropriate checks, including `node tests/release-metadata.cjs`.
3. Push main, then update the release branch: `git push origin main:release`.
4. Follow `.github/workflows/release.yml` and verify the installer assets, signatures and `latest.json` after both builds finish.

The existing workflow builds Windows NSIS and Linux AppImage/DEB packages. Update signing uses the repository secret `TAURI_SIGNING_PRIVATE_KEY`; the public key is in the Tauri configuration. Keep private keys out of the repository.

The separately identified performance installer uses `src-tauri/tauri.performance.conf.json`. Its publication workflow is restricted to `test/performance-canvas`. See [the testing guide](../PERFORMANCE-TESTING.md).

## File formats and recovery

ORA is the native editable format. PSD export keeps raster layers and folders; folder opacity is distributed into base-layer opacity to preserve the app's compositing rules. PNG/PSD export does not replace the ORA save target. PSD import is not implemented.

Recovery stores separate versions and reuses unchanged layer images. Desktop copies live in local application data; browser copies use IndexedDB. Recovery covers the last completed copy and does not guarantee protection against power or disk failure. See the [performance design notes](performance.md) and [regression tests](../tests/README.md).

## Screenshot assets

The README images are screenshots of the actual frontend rendered in isolated headless browser profiles, in English and Brazilian Portuguese. The canvas stays empty. The control images are direct captures of the tool-settings panels. No illustration or generated artwork is included.
