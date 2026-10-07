# Tabs and windows

Each open file gets a tab in the tab strip, which shows the file name, a live-status dot, and a `(n)` suffix when the same path is open twice. Tabs close with Ctrl+W, a middle-click or their hover `×`. Files can also open in a separate window. Each window receives tail events only for the sessions it owns.

## Sub-features

- `tabs-switch` activates a tab when clicked, and the status bar follows the active tab.
- `tabs-close` closes the active tab with Ctrl+W or `File > Close Tab`, or any tab with a middle-click.
- `tabs-empty` returns to the `No file open` state with recent files after the last tab closes.
- `window-new` opens an empty window from `File > Open in New Window`.
- `window-open-recent` opens a recent file in a new window from `File > Open Recent > <path> > Open in New Window`, with that file's tab active.
- `window-shared-session` attaches a second tab or window to a file that is already open. The new tab shows the finished index state at once, and every tab on the file receives its appends.

## How to get to it (user POV)

- Click a tab to switch to it. Middle-click it, or use its hover `×`, to close it.
- Press `Ctrl+W`, or use `File > Close Tab`.
- Use `File > Open in New Window` or `File > Open Recent > <path> > Open in New Window`.

## Driving it with lv.mjs

Preconditions:

- `app.log` (100 lines) and `other.log` (20 lines) are open in this order through `drop`, and `other.log` is active.

- **Switch.** Run `click --tab app.log`. `tabs` shows `app.log` with `active: true`, and `status` shows the `app.log` path with `100 lines`.
- **Close active.** Run `key Ctrl+W`. Only `other.log` is left, and it is active.
- **Middle-click.** Run `click --tab other.log --button middle`. `tabs` is empty, `emptyState` is `true`, and the main area lists both files under `Recent files`.
- **New window.** Run `menu "File>Open in New Window"`, then `targets`. Two window ids are listed. From now on every command needs `--target <id-prefix>`, and the new window shows `No file open`.
- **Per-window tail.** Drop `app.log` into window A with `drop "$F" --target <A>` and `other.log` into window B with `drop "$G" --target <B>`. Then run `append app.log --lines 5`. Only window A's status reaches `105 lines`, and window B still reads `20 lines`.
- **Shared session.** Run `drop "$G" --target <A>`, so `other.log` is open in both windows, then `wait --status "20 lines" --target <A>`. Window A's `status` ends with `20 lines · 1.2 KB Live` and contains no `Indexing`. Then run `append other.log --lines 2`. Both windows' `other.log` tabs reach `22 lines`.
- **Open recent in new window.** Run `menu "File>Open Recent><app.log label>>Open in New Window"`, then `targets`. A third window id is listed. In that window, `wait --status "105 lines" --target <C>` passes, `tabs` holds `app.log` as active, and `status` contains no `Indexing`. Run `append app.log --lines 3`. Window C reaches `108 lines`.
- **Duplicate tab.** Run `menu "File>Open Recent><other.log label>>Open in Tab"` twice, then `targets` to find the window that received both. Its tabs read `other.log (1)` and `other.log (2)`, and `status` contains no `Indexing`.
- **Proof.** Capture `targets` output plus `snapshot --target <id> --out` for each window.

## Gotchas

- Recent-file labels are the full path only up to 72 characters. A longer path is labeled `<name> — …<last 56 characters>`, and every run under `.claude/worktrees/` is longer. Run `menu "File>Open Recent>?"`, and the error lists the exact labels.
- A push from main to a window that was just created is dropped. The renderer subscribes to menu events 9 to 11 ms after the page's load event (measured), so `did-finish-load` is not a safe trigger either. A new window pulls its starting file through `window:takeInitialPath` instead. At 265bbf9 the push version left the window on `No file open`.
- A tab that attaches to an already indexed session gets no `index:progress` event, because indexing has finished. Its index state comes only from the `file:open` result (`indexPercent`, `indexComplete`). Check for `Indexing` right after the drop and before any append, because an append sends a progress event that hides a regression. At 265bbf9 this tab showed `Indexing 0%`.
- Open bug, not fixed: on a file's first open, `TailEngine.start()` runs the background indexer and the first tail read from offset 0 at the same time. The index can then hold every line twice. The status shows `40 lines` for a 20-line fixture, the sidebar level counts double, and later appended rows show the text of early lines (row 101 reads `fixture line 1`). Before counting appends, check that `N lines` matches the fixture. If it does not, close every tab of that file in every window and drop it again.
- With several windows, menu actions that target "the focused window" (`Open in Tab`, `Close Tab`, `Find…`) go to the OS-focused window. After a menu-created window, that is the newest one. They fall back to the first-created window only when no window has focus. Run `targets` afterwards to see where a tab landed.
- The status bar follows the active tab. `wait --status "<n> lines" --target <id>` times out when that window's active tab is another file. Click the tab first.
- The tab `×` is only visible on hover. Prefer a middle-click or Ctrl+W.
- Closing a window with the OS close button is not drivable. `stop` tears down every window of the run.
