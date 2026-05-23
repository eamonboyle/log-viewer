# Changelog

All notable changes to Log Viewer are documented in this file.

## [1.0.0] - 2026-05-23

First stable release — cross-platform desktop log viewer with watch-first tail, multi-window support, and production polish.

### Features

- **Live tail by default** — chokidar watch on open; `tail:appended` IPC push (no refresh prompts)
- **Multi-tab** — independent sessions per file with drag reorder and duplicate-file indicators
- **Multi-window** — separate tab strips per window; session IPC routed to owning window only
- **Find in file** — ripgrep-powered search with 300ms debounced search-as-you-type
- **Search results panel** — fetches uncached line previews via `viewport:readLines`
- **Go to line/column** — vertical scroll + horizontal scroll to column marker
- **Virtual scroll** — `@tanstack/react-virtual` for multi-million-line files
- **Sparse line index** — background worker thread indexing with dev/prod parity
- **Compressed scrollbar** — usable navigation for 150k+ line files
- **Minimap** — quick overview with error/warn coloring
- **Highlight rules** — string/regex patterns via Web Worker; optional per-file glob (`filePattern`)
- **Column detection (MVP)** — tab-delimited detection with column hide/show toolbar
- **Light theme** — toggle in Settings; persists via electron-store
- **Recent files** — File menu with open-in-tab / open-in-new-window; clear recent
- **Settings export/import** — JSON prefs backup
- **Auto-update check** — Help → Check for Updates (GitHub Releases provider)
- **UNC path support** — auto polling for network shares on Windows

### Fixes & hardening

- Index builder worker emitted in dev mode (`out/main/workers/index-builder.worker.js`)
- Ripgrep native binary unpacked from asar for packaged search
- macOS `open-file` targets focused window (not always first window)
- Tail engine integration tests: rotation, truncate, symlink (symlink skipped on Windows CI)

### Performance

- `gen-log --wide` for long-line / wrap stress testing
- Automated Vitest smoke: 1M-line index within threshold + heap bound check

### Packaging

- App icon (512×512)
- Windows portable + NSIS; macOS dmg + zip; Linux AppImage + deb
- Platform-specific `artifactName` patterns for CI upload

### Known limitations

- Read-only viewer — replace-in-file deferred to v1.1
- Minimap samples ~200 lines (fast overview, not pixel-perfect at 40M+ lines)
- Column detection MVP: tab-delimited only
- Code signing optional — OS warnings until signed
- Auto-update: manual check on v1; no silent install

[1.0.0]: https://github.com/log-viewer/log-viewer/releases/tag/v1.0.0
