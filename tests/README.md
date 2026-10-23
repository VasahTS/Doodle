# Liquify regression checks

Install Playwright in a separate tools folder or expose an existing installation through `NODE_PATH`. No build dependencies are added to Doodle.

Run all thirteen suites with `node tests/run.cjs`. Set `DOODLE_BROWSER=msedge` to run the browser checks in Edge. The release metadata suite only needs Node.js. The PSD suite also needs the external test dependency described below.

For an externally managed Chromium installation, set `DOODLE_CHROMIUM_PATH` to its executable. `DOODLE_BROWSER_ARGS` optionally accepts a JSON array of additional test-only launch arguments. `tests/browser.cjs` centralizes the launcher; no browser dependency is shipped with the app.

# Performance settings and recovery scheduling

`node tests/performance.cjs` verifies that pen hover and selection animation paint zero document frames, economy changes only display resolution, sparse diagonal strokes retain tile history with exact undo/redo, history budgets evict older entries, settings persist, tabs and focus work, diagnostics exclude file names and preserve the save destination, and the native preference UI calls its bridge and reports a restart requirement. The graphics preference bridge is a stub: it does not claim to validate real WebView2 or WebKitGTK flags.

`node tests/performance-recovery.cjs` upgrades a genuine v1 IndexedDB, checks lossless data and metadata-only listing, verifies that full storage stops before PNG encoding and scheduler retries back off without repeated I/O, then tests five-version retention and interrupted publication while lowering retention. Existing `recovery.cjs` separately exercises real temporary native files and broader recovery behavior.

Performance counters describe the exercised code paths, not the native app's FPS. Physical tablet input, native graphics configuration and release builds still require target-machine checks.

# Automatic recovery checks

Run `node tests/recovery.cjs`. It uses real browser IndexedDB and a Tauri API bridge backed by real temporary files. It checks immutable PNG sharing, three retained versions, unchanged-layer encoding reuse, preservation of the original save target, interrupted manifest publication, restart, SHA-256 corruption detection, older-version fallback, folder state and Unicode, independent ORA export, storage limits, disabled autosave, settings persistence, acknowledgment and explicit discard. A real timer/pen test checks deferred saves; a canvas encoder hook changes the drawing during compression and verifies the older snapshot stays consistent while newer edits remain dirty.

The native bridge writes only to a newly created temporary directory, validates every resolved path, then removes that directory. New manifests are also checked for CRC32 metadata corruption. Windows sandbox restrictions may require authorized execution outside the sandbox for file renames. `DOODLE_BROWSER=msedge` selects Edge. Actual Tauri permission enforcement and process/power-loss testing still require a native build; these checks do not claim fsync-level durability.

# Save on close checks

Run `node tests/close-save.cjs`. A local Tauri window/dialog/filesystem stub checks the three close choices, Cancel/Escape/outside clicks, save cancellation and errors, complete ORA writes before exit, round-trip recovery of saved pixels, existing paths, protection against duplicate closes and interruption of ongoing saves, two-choice confirmations and English text. It does not close the real app or write user files. `DOODLE_SCREENSHOT` optionally saves the prompt. Native window-manager testing still needs the installed app.

Run `node tests/liquify.cjs` with Chrome installed. Set `DOODLE_BROWSER=msedge` to check Edge instead. Set `DOODLE_SCREENSHOT` to an absolute PNG path to save a preview.

The checks exercise all four modes through pointer events, simulated pen pressure, exact stroke undo/redo, alpha lock, selection boundaries, rotated/mirrored views, cancellation, real mouse input, stationary radial effects, `.ora` round trips, translations, tool controls and saved settings. PNG round trips allow a one-byte channel rounding difference in transparent pixels.

Physical pen feel and the Tauri desktop build still need manual testing on Windows.

# Fractional brush size checks

Run `node tests/brush-size.cjs` using the same Playwright setup. It checks 0.1, 0.3, 0.5, 1 and 2 px strokes, pen pressure below the old minimum, undo/redo, decimal controls and keyboard increments, tool independence, persistence and identical document pixels at display scale factors 1, 1.5 and 2. `DOODLE_BROWSER=msedge` selects Edge.

# Lasso and fill checks

Run `node tests/lasso.cjs`. It checks new/add/subtract through pointer events and toolbar buttons, Ctrl/Shift/Alt modifiers, temporary mode restoration, selection undo/redo, F and Alt+Backspace fill with holes preserved, empty selection behavior, translations, saved modes and migration of old default shortcuts while preserving custom bindings. `DOODLE_BROWSER=msedge` selects Edge.

Run `node tests/selection-outline.cjs` to verify the actual rendered contour cache against the selection mask. It checks overlapping additions, border cuts, holes, areas outside the selection, inversion, diagonal contacts, curved contours, transformations and undo/redo. Every visible segment must lie on a selected/unselected pixel boundary, with no duplicate or internal edges. `DOODLE_SCREENSHOT` optionally saves a PNG preview.

# Settings menu checks

Run `node tests/settings-menu.cjs`. It checks the gear menu, language persistence and translation, shortcut editor and Ctrl+K, keyboard navigation, focus restoration, mutually exclusive menus, outside clicks and narrow windows. A local Tauri updater stub verifies the version label and current/available/error states without network access or installation. Optional `DOODLE_SCREENSHOT` and `DOODLE_NATIVE_SCREENSHOT` paths save light/browser and dark/installed-app previews. `DOODLE_BROWSER=msedge` selects Edge.

# Clear contents checks

Run `node tests/clear-contents.cjs`. It checks Backspace with and without a pixel selection, holes, exact undo/redo, preservation of layer nodes and unselected background, multiple selected layers, Delete as an alternate, Alt+Backspace fill, text-input handling, Settings focus and saved shortcut migration.

# Release metadata checks

Run `node tests/release-metadata.cjs` to check matching Tauri/Cargo versions and execute the workflow's release-note script against a local GitHub API stub. It verifies the English changelog entry, release creation/update and error handling without contacting GitHub.

# PSD export checks

Install `ag-psd` in a separate tools folder using `npm install --ignore-scripts ag-psd`, then set `PSD_READER_PATH` to that installation's absolute `node_modules/ag-psd` directory. This is a test dependency; the app has no new dependencies. Validation used ag-psd 31.0.3.

Run `node tests/psd-export.cjs`. It verifies lossless pixel channels, empty layers, nested/open/closed/hidden folders, Unicode names, transparent pixels, clipping, locks, effective opacity, the composite preview, the File menu, English text, cancellation, fallback download Blob and native Tauri dialog/filesystem calls using a stub. It also verifies that PSD export leaves the ORA filename, save destination and unsaved state intact.

Set `DOODLE_PSD_OUTPUT` to a fixture directory to save `layers.psd` and `expected.png`. With `psd-tools`, Pillow and numpy available, run `python tests/psd-composite.py FIXTURE_DIRECTORY`. It recomposes the editable layers with `ignore_preview=True` and compares premultiplied colors and alpha against the Doodle image, allowing at most 3/255 and 2/255 respectively. Validation used psd-tools 1.26.0. Native Photoshop/Clip Studio Paint opening still needs manual verification.

# Asynchronous and extreme Liquify

Run node tests/liquify-async.cjs and node tests/liquify-stress.cjs. The stress test includes 4K, the 8000 x 8000 application limit, 500 px/maximum strength, minimal brush jumps, selection/alpha lock, 12 layers, CPU Worker and cooperative fallback. Timings are environment-specific and include post-release completion; UI timers are not FPS. See docs/performance-liquify.md. Set DOODLE_LIQUIFY_BACKEND=cpu or cooperative when running tests/liquify.cjs to check its complete correctness suite on each fallback.
