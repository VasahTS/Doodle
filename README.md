# Doodle

A light sketching app: open it and start drawing. Layers, folders, pen pressure, lasso, free transform and `.ora` files.
Built with [Tauri](https://tauri.app) (Rust underneath, HTML interface). Available in **English** and **Português (Brasil)**.

**[Download for Windows and Linux](../../releases/latest)**

[Changelog](CHANGELOG.md) · [Future additions](future-additions/README.md) · [Codex session record](docs/sessions/2026-10-22-codex.md)

## Features

- **Pen pressure** on size and/or opacity, adjustable pressure curve and stabilizer
- **Brush and eraser with their own settings** (size, opacity, pressure)
- **Fractional brush and eraser sizes** from 0.1 to 500 px, including pen pressure below 1 px; `[` / `]` adjust sizes below 1 px in 0.1 px steps
- **Liquify brush** (`J`): push, expand, pinch or twirl directly on the canvas, with its own size and strength, optional pen pressure, selection and alpha lock support. Hold `Alt` to reverse expand, pinch or twirl. Each stroke is one undo step.
- **Layers and folders**, multi-select with Ctrl+click / Shift+click, drag to reorder or into folders
- **Resizable layers panel**: drag its left edge; the width is remembered. Layer opacity is at the top, and double-clicking the edge resets the width.
- **Lock transparent pixels** (`/`) and **clip to layer below** (`Ctrl+Alt+G`)
- **Lasso** selection with add/subtract, a floating action bar, cut/copy to new layers across all selected layers
- **Lasso modes in the toolbar**: new, add and subtract; hold `Shift` to add, `Ctrl` to subtract (`Alt` also subtracts). `F` fills the selection with the main color (`Alt+Backspace` also works).
- **Backspace clears contents** inside the selection, or the entire selected layer when no selection is active, preserving the layer. `Delete` also works; undo restores the pixels.
- **Free transform** (`Ctrl+T`): move, scale, rotate, skew, distort, flip, with a right-click menu
- **Canvas rotation** (hold `R` and drag, `'` resets), **drag zoom** (hold `Z`), **mirrored view** (`F1`)
- **Every shortcut can be changed** (Settings → Shortcuts or `Ctrl+K`)
- **Settings menu** in the top-right gear: keyboard shortcuts, language, automatic recovery and update checks
- **Save and exit** when closing with unsaved changes; cancelled or failed saves keep the app open
- **Updates itself** from GitHub releases, no need to visit the repository
- Saves **OpenRaster (.ora)**, which Krita, GIMP and MyPaint also open; exports PNG and layered **Photoshop (.psd)** files

## Automatic recovery

Doodle creates separate recovery copies every 30 seconds when the drawing changes, waiting for the current stroke to end. It retains three versions per drawing with a default total storage limit of 512 MB. Unchanged layer images are reused to reduce background work.

After an interruption, choose **View copies** in the recovery notice, or open **Settings → Automatic recovery**. You can select a version, restore it, export an independent ORA copy or discard its recovery history. Restoring creates an unsaved drawing without reconnecting it to the original file.

Desktop copies live in the app's local data directory; browser copies use IndexedDB and may be erased when browser data is cleared. Keep saving normal ORA files: recovery covers the last completed copy and does not guarantee protection against power or disk failure.

## Export to Photoshop

Choose **File → Export PSD**. The file keeps editable raster layers, nested folders, Unicode names, transparency, visibility, clipping and transparent-pixel locks. PSD export does not change the drawing's `.ora` save destination.

Doodle applies folder opacity to each layer separately. To preserve overlapping colors in PSD, folder opacity is distributed into the base layers' opacity; exported folders start at 100%. Layer pixels remain unchanged. PSD uses 8-bit opacity values, so slight rounding differences are possible.

Keep saving an `.ora` copy to continue working in Doodle. PSD import is not included.

## Build from source

You need [Rust](https://rustup.rs) and, on Windows, the Microsoft C++ Build Tools.

```
cargo install tauri-cli --version "^2" --locked
cargo tauri dev      # run the app
cargo tauri build    # make the installer
```

The whole interface lives in `src/index.html`. The Rust side (`src-tauri/`) opens the native file dialogs and reads and writes files.

## Releases

Updating the `release` branch (or pushing a version tag such as `v0.2.0`) runs `.github/workflows/release.yml`, which builds the Windows installer and the Linux AppImage and .deb on GitHub and attaches them to a release named after `version` in `src-tauri/tauri.conf.json`. Bump that number first.

## Updates

The installed app checks this repository's latest release about once a day (and from **Settings → Check for updates**). Updates are downloaded and installed from inside the app, then it reopens. The Settings gear also contains the language options and shortcut editor (`Ctrl+K`).

Update files are signed. The workflow reads the private key from the repository secret `TAURI_SIGNING_PRIVATE_KEY`; the matching public key is in `src-tauri/tauri.conf.json`. Without that secret the release build fails on purpose.

## License

[MIT](LICENSE). Use it, change it, share it.

---

# Doodle (Português)

Um app leve para rabiscar: abriu, já está desenhando. Tem camadas, pastas, pressão da caneta, laço, transformação livre e arquivos `.ora`.
Instruções completas em português no [LEIA-ME.md](LEIA-ME.md).

**[Baixar para Windows e Linux](../../releases/latest)**
