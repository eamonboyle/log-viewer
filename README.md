# Log Viewer

Modern cross-platform desktop log viewer built with Electron, React, and TypeScript. Optimized for multi-GB files with a **watch-first tail engine** — external file writes appear automatically with no "click to refresh" prompts.

## Features (MVP)

- **Live tail by default** — chokidar watch starts on file open; new lines push via IPC
- **Follow mode** — ON by default; auto-scroll when pinned; badge when paused
- **Virtual scroll** — `@tanstack/react-virtual` renders only visible rows
- **Multi-tab** — independent sessions per file (Zustand)
- **Highlight rules** — string/regex patterns via Web Worker
- **Sparse line index** — byte-offset index in main process; O(viewport) memory

## Architecture

```
Main Process                    Renderer
├── FileSession                 ├── TabStore (Zustand)
├── TailEngine (chokidar)       ├── LogViewport (virtual list)
├── SparseLineIndex             ├── Follow state machine
└── RangeReader                 └── highlight.worker.ts
         │
         └── IPC push: tail:appended, index:progress, file:rotated, file:error
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
```

## Tests

```bash
npm test
```

## Benchmark

Generate synthetic logs:

```bash
npm run gen-log -- --lines 1000000 --output ./test.log
npm run gen-log -- --lines 10000 --rate 1000 --output ./live.log
```

Open `live.log` in the app and run the rate generator to verify live tail without manual refresh.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+O | Open file |
| Ctrl+W | Close tab |
| End | Jump to tail (enable follow) |
| F5 | Toggle follow |

## IPC Channels

**Renderer → Main:** `file:open`, `file:close`, `tail:setFollow`, `viewport:readLines`, `index:getStatus`

**Main → Renderer:** `tail:appended`, `index:progress`, `file:rotated`, `file:error`

## License

MIT
