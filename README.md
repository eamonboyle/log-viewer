# Log Viewer

Modern cross-platform desktop log viewer built with Electron, React, and TypeScript. Optimized for multi-GB files with a **watch-first tail engine** — external file writes appear automatically with no "click to refresh" prompts.

## Install

Download the latest release for your platform from [GitHub Releases](https://github.com/eamonboyle/log-viewer/releases):

| Platform | Artifact |
|----------|----------|
| Windows | `Log Viewer-1.0.0-win-x64.exe` (portable) or NSIS installer |
| macOS | `Log Viewer-1.0.0-mac.dmg` or `.zip` |
| Linux | `Log Viewer-1.0.0-linux.AppImage` or `.deb` |

Unsigned builds may show SmartScreen (Windows) or Gatekeeper (macOS) warnings until code-signed.

## Features (v1.0.0)

- **Live tail by default** — chokidar watch starts on file open; new lines push via IPC
- **Follow mode** — ON by default; auto-scroll when pinned; unread badge when paused
- **Multi-tab & multi-window** — drag-reorder tabs; open files in new window; duplicate-file badge
- **Virtual scroll** — `@tanstack/react-virtual` renders only visible rows
- **Find in file** — ripgrep search with debounced search-as-you-type, match navigation, results panel
- **Go to line/column** — jump anywhere; horizontal scroll to column
- **Highlight rules** — string/regex via Web Worker; optional per-file glob patterns
- **Column detection** — tab-delimited logs: detect columns, hide/show in toolbar
- **Minimap & compressed scrollbar** — navigate huge files quickly
- **Light/dark theme** — toggle in Settings
- **Recent files** — File menu; clear recent; open in tab or new window
- **Settings export/import** — JSON backup of preferences
- **UNC path support** — auto polling for `\\server\share` paths on Windows
- **Auto-update check** — Help → Check for Updates (packaged builds)
- **Line filters** — sidebar level toggles and quick presets; batched scan with filtered virtual scroll

## Architecture

```
Main Process                    Renderer (per window)
├── WindowManager               ├── TabStore (Zustand)
├── SessionManager              ├── LogViewport (virtual list)
├── TailEngine (chokidar)       ├── SearchBar / ResultsPanel
├── SparseLineIndex + worker    └── highlight.worker.ts
└── RangeReader + ripgrep
         │
         └── IPC push routed to owning window: tail:appended, index:progress, …
```

**Watch-first principle:** The file on disk is always the source of truth. The TailEngine reads only `[readOffset, EOF)` on change, extends the sparse index, and batches `tail:appended` events every 16ms.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run typecheck
npm run build
npm run dist    # electron-builder (win/mac/linux)
npm run pack    # unpacked dir — faster local smoke test
```

## Tests

```bash
npm test
npm run test:watch
```

## Benchmark

Generate synthetic logs:

```bash
npm run gen-log -- --lines 1000000 --output ./test.log
npm run gen-log -- --lines 10000 --rate 1000 --output ./live.log
npm run gen-log -- --lines 50000 --wide --wide-width 800 --output ./wide.log
```

Open `live.log` in the app and run the rate generator to verify live tail without manual refresh.

See [docs/RELEASE.md](docs/RELEASE.md) for manual perf gates and QA checklist.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+O | Open file (focus existing tab if already open) |
| Ctrl+Shift+O | Open file in new tab |
| Ctrl+W | Close tab |
| Middle-click tab | Close tab |
| Ctrl+F | Find in file |
| Ctrl+G | Go to line |
| Enter | Next search match (in search bar) |
| Shift+Enter | Previous search match (in search bar) |
| F3 | Next search match |
| Shift+F3 | Previous search match |
| Esc | Close search / go-to-line dialog |
| End | Jump to tail (enable follow) |
| F5 | Toggle follow |

## File menu

- **Open…** / **Open in New Tab…** / **Open in New Window**
- **Open Recent** — submenu with open-in-tab or open-in-new-window
- **Clear Recent Files**

## IPC Channels

**Renderer → Main:** `file:open`, `file:close`, `tail:setFollow`, `viewport:readLines`, `index:getStatus`, `search:*`, `settings:*`, `column:detect`, `minimap:samples`

**Main → Renderer:** `tail:appended`, `index:progress`, `file:rotated`, `file:error`, `search:stale`

## License

MIT
