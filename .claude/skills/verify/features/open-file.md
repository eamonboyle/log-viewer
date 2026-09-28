# Open a file

A user opens a log file by dropping it on the window, choosing it from the recent-files list on the empty screen, or picking it from `File > Open Recent`. The file opens in a tab named after the file, and the status bar shows its full path, line count and size. Opening a file that is already open focuses the existing tab instead of adding a duplicate.

## Sub-features

- `open-drop` opens a file dropped anywhere on the window.
- `open-recent-list` reopens a file from the `Recent files` list on the empty state, which shows at most 5 entries.
- `open-recent-menu` reopens a file from `File > Open Recent > <path> > Open in Tab`.
- `open-refocus` focuses the existing tab when an already-open file is dropped again.
- `open-dialog` covers `Ctrl+O`, the `Open` button, `Browse files…` and `File > Open…`. **Not drivable**: these open a native OS dialog.

## How to get to it (user POV)

- Drag a file from the file manager onto the window.
- Click a path under `Recent files` on the `No file open` screen.
- Use `File > Open Recent > <path> > Open in Tab`.
- Press `Ctrl+O` or `Ctrl+Shift+O`, click `Open` in the tab strip, click `Browse files…`, or use `File > Open…`. All of these open the native dialog.

## Driving it with lv.mjs

Preconditions:

- A fresh run passes `doctor` and shows the empty state (`snapshot` has `emptyState: true`).
- `F=$(node $LV fixture app.log --lines 100 --run <id>)` and `G=$(node $LV fixture other.log --lines 20 --run <id>)` have created the fixtures.

- **Drop.** Drop the file on the window. Run `drop "$F"`, then `wait --status "100 lines"`. `tabs` has one entry, `{label: "app.log", path: "<F>", active: true, indicator: "Live"}`, and `status` starts with the full path.
- **Refocus.** Drop the same file again. Run `drop "$F"`. `tabs` still has one `app.log` tab.
- **Second file.** Drop another file. Run `drop "$G"`, then `wait --status "20 lines"`. `tabs` is `app.log`, `other.log`, and `other.log` is active.
- **Recent list.** Close both tabs to reach the empty state. Run `key Ctrl+W` twice. `snapshot` shows `emptyState: true`, and `eval "[...document.querySelectorAll('main button')].map(b => b.innerText.trim())"` lists both paths, most recent first, then `Browse files…`. Click one. Run `click --text "<F>"`, then `wait --status "100 lines"`. The `app.log` tab reopens.
- **Recent menu.** Run `menu "File>Open Recent><G>>Open in Tab"`, then `wait --status "20 lines"`. `other.log` opens in a tab in the focused window, or in the first window if none is focused.
- **Proof.** Take `snapshot --out` and `screenshot --out` after each open. The profile's recent list is `settings.recentFiles` in `.verify/<id>/profile/config.json`, which is a read-only side-effect check.

## Gotchas

- `click --text "<path>"` needs the native path string that `fixture` prints. A path with forward slashes matches nothing.
- While a tab is open, the status bar's path `span` has the same text and `title` as the tab. Use `--tab` for tabs, and use `--text <path>` only on the empty state.
- Never drive `open-dialog`. The native dialog is modal, CDP cannot see it, and it blocks the window until someone closes it by hand. Report it as not driven. If one opens by accident, `stop` the run.
- `File > Open Recent > <path> > Open in New Window` opens an empty window at 265bbf9. See [tabs-and-windows.md](./tabs-and-windows.md).
