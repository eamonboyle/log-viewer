# Tabs and windows

Each open file gets a tab in the tab strip, which shows the file name, a live-status dot, and a `(n)` suffix when the same path is open twice. Tabs close with Ctrl+W, a middle-click or their hover `×`. Files can also open in a separate window. Each window receives tail events only for the sessions it owns.

## Sub-features

- `tabs-switch` activates a tab when clicked, and the status bar follows the active tab.
- `tabs-close` closes the active tab with Ctrl+W or `File > Close Tab`, or any tab with a middle-click.
- `tabs-empty` returns to the `No file open` state with recent files after the last tab closes.
- `window-new` opens an empty window from `File > Open in New Window`.
- `window-open-recent` opens a recent file in a new window from `File > Open Recent > <path> > Open in New Window`. **Currently fails**; see Gotchas.

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
- **Shared session.** Open `other.log` in both windows, then run `append other.log --lines 2`. Both windows' `other.log` tabs reach `22 lines`.
- **Proof.** Capture `targets` output plus `snapshot --target <id> --out` for each window.

## Gotchas

- Bug at 265bbf9: `menu "File>Open Recent><path>>Open in New Window"` opens a window that stays on `No file open`. In `electron/main/ipc-handlers.ts`, `createWindow()` is followed immediately by `sendToWindow(win, 'menu:open-path', …)`, which fires before the renderer has loaded and subscribed.
- Bug at 265bbf9: opening an already-open, fully indexed file in a second window shows `Indexing 0%` in that window's status bar. It stays until the next append delivers a progress event.
- With two windows, `menu` actions that target "the focused window" fall back to the first-created window when the app is not focused, and it usually is not during a driven run.
- The tab `×` is only visible on hover. Prefer a middle-click or Ctrl+W.
- Closing a window with the OS close button is not drivable. `stop` tears down every window of the run.
