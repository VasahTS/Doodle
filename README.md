# Doodle

A light sketching app: open it and start drawing. Layers, folders, pen pressure, lasso, free transform and `.ora` files.
Built with [Tauri](https://tauri.app) (Rust underneath, HTML interface). Available in **English** and **Português (Brasil)**.

**[Download for Windows](../../releases/latest)**

## Features

- **Pen pressure** on size and/or opacity, adjustable pressure curve and stabilizer
- **Brush and eraser with their own settings** (size, opacity, pressure)
- **Layers and folders**, multi-select with Ctrl+click / Shift+click, drag to reorder or into folders
- **Lock transparent pixels** (`/`) and **clip to layer below** (`Ctrl+Alt+G`)
- **Lasso** selection with add/subtract, a floating action bar, cut/copy to new layers across all selected layers
- **Free transform** (`Ctrl+T`): move, scale, rotate, skew, distort, flip, with a right-click menu
- **Canvas rotation** (hold `R` and drag, `'` resets), **drag zoom** (hold `Z`), **mirrored view** (`F1`)
- **Every shortcut can be changed** (Shortcuts button or `Ctrl+K`)
- Saves **OpenRaster (.ora)**, which Krita, GIMP and MyPaint also open; exports PNG

## Build from source

You need [Rust](https://rustup.rs) and, on Windows, the Microsoft C++ Build Tools.

```
cargo install tauri-cli --version "^2" --locked
cargo tauri dev      # run the app
cargo tauri build    # make the installer
```

The whole interface lives in `src/index.html`. The Rust side (`src-tauri/`) opens the native file dialogs and reads and writes files.

## Releases

Pushing a version tag (for example `v0.2.0`) runs `.github/workflows/release.yml`, which builds the Windows installer on GitHub and attaches it to a release. Bump `version` in `src-tauri/tauri.conf.json` first.

## License

[MIT](LICENSE). Use it, change it, share it.

---

# Doodle (Português)

Um app leve para rabiscar: abriu, já está desenhando. Tem camadas, pastas, pressão da caneta, laço, transformação livre e arquivos `.ora`.
Instruções completas em português no [LEIA-ME.md](LEIA-ME.md).

**[Baixar para Windows](../../releases/latest)**
