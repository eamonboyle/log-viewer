---
name: verify
description: Launch and drive the Log Viewer Electron desktop app like a user (drag-drop a log file, append lines to it, click, type, press shortcuts, use the app menu) and capture screenshots and UI snapshots as proof. Use to verify any change to the renderer (src/), main process (electron/), preload, IPC or tail engine in the real built app instead of trusting unit tests alone.
---

# Verify Log Viewer

The app is an Electron desktop window. `scripts/lv.mjs` starts an isolated copy of the **built** app and drives its renderer over the Chrome DevTools Protocol (CDP). It also reaches the main process through the Node inspector, which it uses only for application-menu clicks. Every run gets its own directory `.verify/<run-id>/` (gitignored) containing the Chromium profile, fixtures, `app.log`, `state.json` and `evidence/`.

Read [features/README.md](features/README.md) before driving a feature, then follow that feature's file.

All commands run from the repo root with Node 22 or later. Examples use bash. In PowerShell, set the variable with `$env:LV_RUN = "<id>"` or pass `--run <id>` to every command.

```bash
LV=".claude/skills/verify/scripts/lv.mjs"
node $LV help
```

## Launch

```bash
node $LV launch                  # npm run build, then start; prints {"ready":true,"run":"<id>",...}
node $LV launch --no-build       # reuse out/ as-is (only when doctor says the build is current)
node $LV launch --run my-check   # choose the run id instead of the generated timestamp id
```

`launch` returns only after the window shows the empty state (`No file open`) and the preload bridge `window.logViewer` exists. It takes about 7 seconds with a build. Pass the printed run id to every later command as `--run <id>`, or put `LV_RUN=<id>` in front of each command.

What `launch` does:
- It runs `node_modules/electron` against the repo, which loads `out/main/index.js` and the renderer from `out/renderer/index.html`, not the Vite dev server. It removes `ELECTRON_RENDERER_URL` and `ELECTRON_RUN_AS_NODE` from the environment.
- It passes `--user-data-dir=.verify/<id>/profile`. Settings and recent files (electron-store `config.json`) start at defaults and never touch the user's real profile in `%APPDATA%\log-viewer`.
- It passes `--remote-debugging-port=0` and `--inspect=0`. The OS picks free ports, and they are recorded in `state.json`.
- It disables Chromium window occlusion and backgrounding. Without this, a window behind other apps stops rendering between commands, and snapshots read half-applied state.

The window appears on the desktop. Do not type into it while a run is in progress.

Isolation: runs never share a profile or ports, so two runs can coexist. They do share `out/`. A `launch` with a build rewrites the files that another live run loaded. Use `--no-build` when another run is live and the sources have not changed. The developer may have their own instance open, for example `electron --remote-debugging-port=9333 .` on the real profile. Never attach to a port that your run's `state.json` does not name.

## Doctor

```bash
node $LV doctor --run <id>
```

This check is read-only. Exit code 0 means every line is `PASS`. It checks:
- the process is alive
- the CDP port in `state.json` matches the profile's `DevToolsActivePort`
- the browser process behind that port has this run's PID
- the renderer is the built `out/renderer/index.html` and the preload bridge is present
- `out/` is newer than every file in `src/`, `electron/`, `shared/` and `workers/`
- `out/` was not rebuilt after launch
- git HEAD has not moved since launch

It also lists the open tabs in each window. Run it first whenever something looks off. If a build check fails, `stop` and `launch` again.

## Drive

Open files by drag and drop. The native Open dialog cannot be driven.

```bash
F=$(node $LV fixture app.log --lines 100 --run <id>)    # deterministic lines; prints the absolute path
node $LV drop "$F" --run <id>                            # the real drop path: webUtils.getPathForFile → file:open
node $LV wait --status "100 lines" --run <id>
node $LV append app.log --lines 5 --run <id>             # an external writer; the tail engine should pick it up
node $LV append app.log --text "custom marker line" --run <id>
```

Fixture line `n` is `<timestamp> <LEVEL> <source> fixture line <n>`, where the timestamp is 2026-01-01T00:00:00Z plus n seconds (line 100 is `2026-01-01T00:01:40.000Z`). Its level is `ERROR` if n%10==0, else `WARN` if n%5==0, else `DEBUG` if n%3==0, else `INFO`. Its source is `Microsoft.Hosting.Lifetime` if n%4==0, else `app.worker`. With `--tabs`, fields are tab-separated, which lets column detection find columns. `fixture` on an existing name rewrites the file from scratch, which is how to shrink it.

Input goes through CDP as real mouse and keyboard events:

```bash
node $LV click --tab app.log --button middle              # a file tab, by label or full path
node $LV click --title "Settings"                          # the title attribute; most icon buttons have one
node $LV click --text "Errors only"                        # exact visible text; the innermost element wins
node $LV click --placeholder "Find in file…"               # an input's placeholder; a trailing * matches a prefix
node $LV click --css "button[draggable]" --nth 1           # CSS selector, as a last resort
node $LV type "ERROR" [--clear]                            # into the focused input; refuses if focus is not editable
node $LV key Ctrl+F      # other combos: Ctrl+G, Enter, Shift+Enter, Escape, F3, Shift+F3, F5, End, Ctrl+W
node $LV scroll --dy -800                                  # mouse wheel over the log viewport; negative scrolls up
node $LV menu "View>Toggle Follow"                         # clicks the app-menu item in the main process
node $LV wait --status "Live" | --text "..." | --js "<expr>" [--timeout 10000]
```

- If a locator matches several elements, `click` refuses and lists them. Add `--nth` or use a narrower locator. For example, a tab's path also appears as the status bar's `title`, so use `--tab` for tabs.
- `menu` walks the labels of the real `Menu.getApplicationMenu()` and calls that item's `click`, which is exactly what a menu click runs. A wrong label lists the valid ones. Recent-file submenus are labeled with the full path: `"File>Open Recent>D:\…\app.log>Open in Tab"`.
- `wait` polls every 100 ms. Wait on state, never on `sleep`. For example, the search debounce is 300 ms, and tail updates are batched per animation frame.
- Several windows: a command fails with the list of window ids until you pass `--target <id-prefix>`. Run `targets` to see each window's tabs.

Never trigger the native Open dialog. That means `Ctrl+O`, `Ctrl+Shift+O`, the `Open` button, `Browse files…`, `File>Open…` and `File>Open in New Tab…`. It is a modal OS window that CDP cannot see or close, and it blocks the window until someone dismisses it by hand. If it happens anyway, `stop` the run. Report those entry points as not driven.

## Evidence

```bash
node $LV snapshot --out 02-after-append.json --run <id>   # structured state, also printed to stdout
node $LV screenshot --out 02-after-append.png --run <id>
node $LV eval "document.title" --run <id>                   # read-only inspection only
```

`snapshot` returns:
- `tabs[]`: label, path, active, and indicator (`Live` or `New lines`)
- `toolbar.switches`: Follow and Wrap
- `status`: the status bar text, e.g. `…\app.log · 100 lines · 6 KB Live`
- `search`: the query and match count (`2/10`, `no matches`)
- `goToLine`, `dialogs`, `sidebar` (filter text with level counts), `emptyState`, `filterEmpty`
- `rows`: `visibleFirst`/`visibleLast`, and every rendered line with its 1-based `line` and `text`. Rows rendered off screen by the virtualizer carry `overscan: true`.

Everything lands in `.verify/<run-id>/evidence/`. Every driver action (launch, fixture, append, drop, click, type, key, scroll, menu, snapshot, screenshot) is also appended to `evidence/actions.jsonl` with a timestamp, so the proof records what was done as well as what resulted.

Proof standards:
- Use the user path: drop, click, key, menu, and appends to the file on disk. `eval` is for reading state only. Never call store setters, `window.logViewer.invoke`, or `useTabStore` to make something happen. Doing so skips the code under test.
- Capture the action and the result. Take a snapshot or screenshot before and after the step that matters, not only the final screen. Name the files in order (`01-…`, `02-…`).
- Prove side effects as well as pixels. Tail proof means the fixture's line count (printed by `append`) matches the status bar's `N lines` and the last visible row's text. Settings proof means the change survives a relaunch with the same profile, or shows in a second window.
- If a mapped entry point cannot be reached (the native dialog, for example), report it as not driven with the reason. Do not count it as verified through a different entry point.

## Cleanup

```bash
node $LV stop --run <id>     # kills this run's process tree by PID, deletes profile/ and fixtures/
node $LV runs                # lists every run: LIVE, stopped, or dead (dead still needs stop)
```

`stop` kills only the PID recorded in `state.json` (with `taskkill /T` on Windows, or the process group elsewhere). Never kill Electron by process name, because the developer's own instance uses the same binary. `stop` keeps `evidence/`, `app.log`, `build.log` and `state.json`, and it fails if `evidence/` ends up empty. Run `stop` after every attempt, including failed launches, whose error message prints the exact `stop` command. Evidence stays in `.verify/<run-id>/evidence/` until someone deletes `.verify/`.

## Helpers

`scripts/lv.mjs` is the only helper. It has no dependencies, and `node .claude/skills/verify/scripts/lv.mjs help` prints every command and flag. `npm run gen-log -- --lines N --rate R --output <file>` is the repo's own generator for large or continuously growing files, for perf-style checks. Point `--output` inside `.verify/<run-id>/fixtures/` so `stop` removes the file.
