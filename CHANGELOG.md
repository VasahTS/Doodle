# Changelog

## [0.3.0] - 2026-10-22

Implemented and documented by **Codex (OpenAI)** at Daniel's request.

### Added

- Automatic crash recovery, enabled by default every 30 seconds, with three retained versions per drawing and shared immutable PNGs for unchanged layers.
- Desktop recovery files in AppLocalData, with temporary writes and rename-on-completion manifests; browser recovery uses IndexedDB transactions. Neither overwrites the original drawing.
- Recovery settings, previews, version selection, restore, independent ORA-copy export, explicit discard, adjustable intervals and a storage limit (512 MB by default).
- SHA-256 pixel-file validation, CRC32 manifest checks and fallback to an earlier complete version after incomplete or corrupted writes. Autosave waits for stroke completion, yields between layer encodes and captures up to two changed layers together while drawing continues.
- Regression checks for real temporary-file storage, browser persistence, interrupted publication, corrupt PNGs, storage exhaustion, timer/pen interaction, concurrent editing and unchanged-layer encoding reuse.
- Save and exit in the desktop close prompt, alongside Cancel and Exit without saving. Cancelled or failed saves keep the app open; closing waits for successful ORA writes and cannot interrupt an in-progress save.

### Changed

- Layer opacity controls now sit above the layer list.
- The layers panel can be resized by dragging its left edge, with persistent width, window-size limits, keyboard adjustment, Escape to cancel and double-click to reset.

### Fixed

- Manual saves retain the unsaved indicator when newer edits occur during file writing, and reject a changed document during ORA serialization rather than marking a mixed snapshot as saved.
- File drops cannot replace the drawing while a modal operation or manual save is in progress.

### Recovery notes

- Recovery protects work up to the last completed copy; it does not replace normal ORA saves or guarantee recovery after power or disk failure.
- Saving manually or explicitly exiting without saving acknowledges the session so it is not offered again on startup. Retained copies remain accessible in Settings until explicitly discarded.
- Browser recovery data can be removed when browser storage is cleared. Desktop recovery files use the app's local data directory.

## [0.2.1] - 2026-10-22

Implemented and documented by **Codex (OpenAI)** at Daniel's request.

### Added

- File → Export PSD, with editable raster layers, nested folders, Unicode names, visibility, transparency, clipping and transparent-pixel locks.
- A built-in PSD writer with lossless PackBits compression, an sRGB profile and a composite preview, without adding runtime dependencies or a build step.
- Browser and native-dialog regression checks, plus independent PSD parsing and layer-compositing validation.

### Compatibility

- OpenRaster remains the native save format; PSD export preserves the current ORA save destination and unsaved state. PSD import is not included.
- Folder opacity is distributed to base layers to preserve Doodle's appearance across overlapping layers. Exported folders start at 100%; raster pixels remain unchanged.
- PSD opacity uses 8-bit values, with possible minor rounding differences. Validation used ag-psd and psd-tools; opening in Photoshop and Clip Studio Paint still needs manual verification.

## [0.2.0] - 2026-10-22

Implemented and documented by **Codex (OpenAI)** at Daniel's request.

### Added

- Inline Liquify brush (`J`) with Push, Expand, Pinch and Twirl modes, independent size and strength, optional pen-pressure strength, and Alt to reverse radial effects.
- Local Liquify processing with a soft falloff, transparency-aware interpolation, selection and alpha-lock support, and one undo step per stroke.
- Fractional brush and eraser sizes from 0.1 to 500 px, with decimal input, slider support and 0.1 px keyboard increments below 1 px.
- New/Add/Subtract lasso controls in the toolbar, persistent selection mode, temporary modifier overrides and plus/minus cursor indicators.
- `F` to fill a selection with the primary color; `Alt+Backspace` remains available as an alternate.
- `Backspace` to clear selected pixels, or the selected layer's contents when no pixel selection is active, without deleting layer nodes. `Delete` remains an alternate.
- A Settings gear in the top-right corner for keyboard shortcuts, language and update checks, with keyboard navigation, focus restoration and narrow-window positioning.
- Browser regression checks for Liquify, fractional brush sizes, selection operations and outlines, Settings, content clearing, translations, saved settings and shortcut migration.
- A `future-additions/` backlog for different brushes, anti-aliasing/aliased modes, improved pressure controls, canvas resizing and PhotoCraft feature references.
- A session record crediting Codex and documenting final shortcuts, behavior, validation and remaining work.

### Changed

- Lasso modifiers now use Shift to add and Ctrl to subtract. Alt also subtracts for compatibility.
- Language choices and manual update checks now live in Settings; the file menu is focused on document actions.
- Existing default fill/clear shortcuts migrate to F/Backspace while preserving customized shortcuts.
- English and Brazilian Portuguese documentation and UI strings cover the new tools and controls.
- Release notes are populated from this English changelog.

### Fixed

- Removed the 0.8 px minimum diameter that prevented pen pressure from producing finer marks.
- Stabilized tiny brush-stamp rasterization using subpixel coverage while retaining the previous full-pressure rendering at 1 px and above.
- Selection outlines now follow the final mask after addition and subtraction, instead of drawing overlapping historical lasso paths. Holes, disjoint areas, inversion, transforms and undo/redo are supported, with a cached outline for animation.
- Clarified that clearing selection/layer contents is separate from deleting a layer.
- Synchronized the Tauri, Cargo manifest and application lockfile versions for this release.

### Validation

- Automated checks cover simulated pen pressure, exact undo/redo, `.ora` round trips, display scales of 100%/150%/200%, keyboard input and both UI languages.
- The updater UI is tested with a local stub; release installers are built by the existing GitHub Actions workflow.
- Physical tablet calibration remains a manual check. Broader brush types, anti-aliasing controls and canvas resizing are tracked as future work.

## [0.1.1] - 2026-10-22

Existing release, preceding the Codex session.

- Show a real-size dot for small brush and eraser cursors.
- Use the lasso icon as the lasso cursor.

[0.2.0]: https://github.com/VasahTS/Doodle/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/VasahTS/Doodle/releases/tag/v0.1.1
