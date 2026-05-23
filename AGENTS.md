# AGENTS.md

Guidance for Cursor agents working on **log-viewer**.

## Project overview

Cross-platform **Electron + React + TypeScript** desktop app for viewing large log files. Core product principle: **watch-first tail** — opening a file starts live watch; new bytes on disk stream to the UI via IPC without refresh prompts.

| Area | Location |
|------|----------|
| Main process | `electron/main/`, `electron/services/` |
| Preload / IPC bridge | `electron/preload/`, `shared/ipc.ts`, `shared/types.ts` |
| Renderer UI | `src/` (React, Zustand `tabStore`, virtual list) |
| Highlighting | `workers/highlight.worker.ts` |
| Tests | `vitest` — unit tests in `electron/services/`, integration in `tests/` |

### Architecture notes

- **File I/O stays in the main process** (`FileSession`, `RangeReader`, `SparseLineIndex`, `TailEngine` + chokidar).
- **Watch-first:** tail reads `[readOffset, EOF)` on change, extends the sparse index, batches `tail:appended` (~16ms).
- **No refresh prompts** — disk is source of truth; renderer reacts to push events.
- **IPC:** invoke from renderer (`file:open`, `viewport:readLines`, …); main pushes `tail:appended`, `index:progress`, `file:rotated`, `file:error`.

## Commands

```bash
npm install
npm run dev          # electron-vite dev
npm run typecheck    # TS for node + web projects
npm run build        # electron-vite build → out/
npm test             # vitest run
npm run test:watch
npm run gen-log -- --lines 1000000 --output ./test.log
npm run dist         # build + electron-builder
```

Do not commit `node_modules/`, `out/`, `release/`, `*.log`, or secrets (`.env`, credentials).

## Git commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/) with optional scope:

```
<type>(<scope>): <short imperative summary>

[optional body]
```

### Types

| Type | When |
|------|------|
| `feat` | New user-facing behavior |
| `fix` | Bug fix |
| `refactor` | Behavior-preserving code change |
| `perf` | Performance improvement |
| `test` | Tests only |
| `docs` | README, AGENTS.md, comments |
| `chore` | Tooling, deps, config, gitignore |
| `build` | Build/packaging (electron-builder, vite) |

### Scopes (examples)

`tail`, `index`, `ipc`, `ui`, `viewport`, `highlight`, `electron`, `deps`

### Examples for this repo

```
feat(tail): batch tail:appended events at 16ms
fix(viewport): restore follow when jumping to EOF
feat(ui): add multi-tab strip with Zustand sessions
refactor(index): extract sparse line offset lookup
perf(viewport): reduce virtualizer overscan for huge files
test(tail): add integration test for rotation handling
docs: document IPC channels in README
chore(deps): bump electron-vite
fix(ipc): handle file:close when session already gone
```

### Phase-style milestones

For bundled milestones (e.g. phase one MVP), prefer one cohesive `feat(app):` commit with a body listing major areas, or a small set of logical commits (`feat` + `fix`) — avoid mixing unrelated refactors.

### Agent rules

- Commit only when the user asks; never skip hooks; never force-push `main`.
- Never commit secrets or local build output under `out/`.
- Match existing patterns in `electron/services/` and `src/components/` before adding abstractions.
