# Liquify regression checks

Install Playwright in a separate tools folder or expose an existing installation through `NODE_PATH`. No build dependencies are added to Doodle.

Run all seven suites with `node tests/run.cjs`. Set `DOODLE_BROWSER=msedge` to run the browser checks in Edge. The release metadata suite only needs Node.js.

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
