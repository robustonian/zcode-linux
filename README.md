# zcode-linux

Run **ZCode** (Z.ai / Zhipu AI's agentic dev environment desktop app) on Linux by converting the upstream macOS build into a runnable Linux Electron app — automated.

ZCode ships official installers for macOS and Windows only. This project covers Linux by converting the upstream macOS `ZCode-*.dmg` into a runnable Linux Electron app and packaging it as a `.deb` / `AppImage`.

> **Status:** early work in progress. The core conversion pipeline and `.deb`/`AppImage` packaging are the initial scope; auto-updater and other extras are deferred. See the commit history for progress.

## ⚠️ Disclaimer

This is an **unofficial community project**. ZCode is a product of **Z.ai / Zhipu AI**. This tool:

- **Does not redistribute any Z.ai software.** No upstream binaries are stored in this repository.
- Automates the conversion process that users perform on their own copy of the upstream DMG, which is fetched from Z.ai's CDN at build time.
- Is not affiliated with, endorsed by, or sponsored by Z.ai / Zhipu AI.

Use of the converted app is subject to Z.ai's own terms of service. Ensure you have the right to run ZCode on your platform before using this tool.

## How it works

ZCode Desktop is an Electron app. Electron apps bundle their UI/logic in a platform-independent `app.asar`; only the Electron runtime and a few native modules are platform-specific. So the conversion is:

1. **Fetch** the upstream macOS DMG (cached by HTTP fingerprint).
2. **Extract** the `.app` bundle with `7zz` (modern 7-Zip; old `p7zip` cannot open current APFS DMGs).
3. **Inspect** `app.asar` to discover native modules, Electron version, integrity checks, and the bundle layout.
4. **Repack** `app.asar` deterministically, removing macOS-only pieces.
5. **Rebuild** detected native modules (`node-pty`, etc.) for Linux against the target Electron version with `@electron/rebuild`.
6. **Download** the matching Linux Electron runtime.
7. **Assemble** `zcode-app/` (Electron + repacked asar + launcher) and generate `start.sh`.
8. **Package** as `.deb` / `AppImage`.

## Prerequisites

- Linux x86_64 (Ubuntu/Debian tested first; other distros later)
- `curl`, `python3`, `unzip`, `make`
- Modern **7-Zip** (`7zz` ≥ 23.x). The ancient `p7zip` 16.02 cannot extract current DMGs — `make install-deps` bootstraps a modern `7zz` if needed.
- `dpkg-deb` (for `.deb`), `appimagetool` (for AppImage)
- A C++ toolchain (`build-essential`) for native module rebuilds
- Node.js / npm — fetched and bundled automatically by the build (you do not need a distro `nodejs`)

## Quick start

> Filled in once the pipeline is functional. Target (C12):
>
> ```bash
> git clone https://github.com/<owner>/zcode-linux.git
> cd zcode-linux
> make bootstrap        # install deps → build codex-app → package → install
> ```
>
> Or step by step:
>
> ```bash
> make install-deps     # bootstrap 7zz + build deps
> make inspect          # analyze the upstream DMG, write inspect-report.json
> make build-app        # build ./zcode-app/
> ./zcode-app/start.sh  # run it
> make deb              # build a .deb into dist/
> make appimage         # build an AppImage into dist/
> ```

## Configuration (environment variables)

| Variable | Default | Purpose |
| --- | --- | --- |
| `ZCODE_UPSTREAM_DMG_URL` | latest on `cdn.zcode-ai.com` | Override the upstream DMG URL |
| `ZCODE_VERSION` | auto-detected from changelog | Pin an upstream version (e.g. `3.0.1`) |
| `DMG` (Makefile) / positional arg | — | Use a local DMG you already downloaded |
| `ZCODE_INSTALL_DIR` | `./codex-app` | Where the runnable app is generated |
| `ELECTRON_MIRROR` | GitHub releases | Mirror for the Linux Electron download |

## Project structure

```
install.sh               # conversion entry point (drives the pipeline)
Makefile                 # bootstrap / build-app / package / deb / appimage / inspect / run-app
scripts/
  install-deps.sh        # bootstrap 7zz + system build deps
  build-deb.sh           # .deb packaging
  build-appimage.sh      # AppImage packaging
  lib/                   # pipeline stages (dmg / asar / native-modules / electron / inspect / package-common)
  patches/               # asar patch engine + ZCode-specific patch descriptors
launcher/
  start.sh.template      # Linux launcher (Wayland/X11, GPU workarounds)
packaging/
  linux/                 # .deb control + desktop entry
  appimage/              # AppRun + runtime
```

## Acknowledgments

The architecture is directly inspired by — and borrows design patterns from — [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux), which does the same for OpenAI Codex Desktop.

## License

MIT. See [LICENSE](LICENSE).
