# Live tail and follow

Opening a file starts a live watch. Bytes that another process appends to the file show up as new rows without a refresh. While Follow is on, the view stays pinned to the last line and the status bar says `Live`. When the user pauses, new lines instead light the `New lines` indicator until the user jumps back to the end.

## Sub-features

- `tail-append` shows lines appended on disk, and the status bar line count grows to match the file.
- `tail-follow` keeps the last line in view while Follow is on.
- `tail-pause` stops auto-scroll from F5, the Follow switch, `View>Toggle Follow`, or scrolling up.
- `tail-unread` shows `New lines` in the status bar and on the tab dot when lines arrive while paused.
- `tail-resume` re-pins to the last line from End, `View>Jump to End`, or the Follow switch.
- `tail-truncate` shows the new, shorter content when the file shrinks on disk or is replaced by rename and recreate. The line count, rows, sidebar counts and filter count all follow the new file.

## How to get to it (user POV)

- Open any file. Follow is on by default, and the watch starts right away.
- Toggle follow with F5, the toolbar `Follow` switch, or `View > Toggle Follow`.
- Jump to the tail with End or `View > Jump to End`.
- Scroll up in the log view with the mouse wheel. Follow unpins.

## Driving it with lv.mjs

Preconditions:

- A fresh run passes `doctor`.
- `F=$(node $LV fixture app.log --lines 100 --run <id>)` has created the fixture, and `drop "$F"` has opened it. `wait --status "100 lines"` passes.

- **Opened and live.** Take a snapshot. Run `snapshot --out 01-opened.json`. `status` ends in `100 lines · 6 KB Live`, `tabs[0].indicator` is `Live`, `toolbar.switches[0]` (Follow) is `checked: true`, and `rows.visibleLast` is `100`.
- **Append while following.** Append five lines on disk. Run `append app.log --lines 5`, then `wait --status "105 lines"`. `append` prints `linesAfter: 105`. `rows.visibleLast` becomes `105`, and the last row reads `… WARN app.worker fixture line 105`.
- **Pause.** Press F5. Run `key F5`, then `wait --status Paused`. Follow becomes `checked: false`, and `tabs[0].indicator` becomes `null` (no dot).
- **Unread while paused.** Append three lines. Run `append app.log --lines 3`, then `wait --status "New lines"`. `status` reads `108 lines · 6 KB New lines`, `tabs[0].indicator` is `New lines`, and `rows.visibleLast` stays at `105`.
- **Resume.** Press End. Run `key End`, then `wait --status Live`. `rows.visibleLast` is `108` and the tab indicator is `Live` again.
- **Menu entry.** Run `menu "View>Toggle Follow"` and then `menu "View>Jump to End"`. The status goes to `Paused` and then back to `Live`, as with F5 and End.
- **Scroll to pause.** From Live, scroll the wheel up. Run `scroll --dy -800`. `status` ends in `Paused`, Follow is `checked: false`, and `rows.visibleLast` falls below the line count (for example `64` of `108`).
- **Truncate.** Grow the fixture to 120 lines with `append app.log --lines 20`. Then run `fixture app.log --lines 10` and `wait --status "10 lines"`. `rows.visibleLast` is `10`, the last row reads `… ERROR app.worker fixture line 10`, and the sidebar shows `INFO 5 WARN 1 ERROR 1 DEBUG 3`. Run `append app.log --lines 5` and `wait --status "15 lines"`. The tail continues from the new end.
- **Truncate with a filter.** At 120 lines, run `click --text "Errors only"` and `wait --status "12 of 120 lines"`. Run `fixture app.log --lines 10`, then `wait --status "1 of 10 lines"`. Only row `10` is rendered.
- **Rotate.** Rename the file and write a new one under the old name. Run `mv "$F" "$F.1"`, then `fixture app.log --lines 3`, then `wait --status "3 lines"`. This step drives the unlink path (`handleRotation`) instead of the shrink path (`handleTruncate`).
- **Truncate to empty.** Run `: > "$F"`, then `wait --status "0 lines"`. The view shows one blank placeholder row. Run `append app.log --lines 3` and `wait --status "3 lines"`.
- **Proof.** Pair each file-side count printed by `append` or `fixture` with the `status` line count, and take `screenshot --out` at the opened, paused-with-new-lines, resumed and truncated states.

## Gotchas

- Tail updates are coalesced per animation frame. Use `wait --status`, not `sleep`, before you assert.
- `rows.lines` includes overscan rows below the viewport. Use `visibleFirst`/`visibleLast` to judge what the user sees.
- Opening Find (`Ctrl+F`) or Go to line also pauses follow. Close them before you prove `tail-follow`.
- A truncate re-indexes the file without sending line text. Afterwards the sidebar level counts cover only the rows fetched for the view, for example `~112 indexed in view` after a truncate from 1,000 to 500 lines. The counts match the whole file only when it fits on one screen, as in the 10-line truncate.
- A paused tab goes back to `Live` when a truncate shrinks the file so that the view ends at its last line. Scrolling to the bottom does the same re-pin.
- The size in the status bar (`6 KB`) is the size at open. It does not change on append or truncate. Assert on the line count, not the size.
- `fixture <name> --lines 0` writes one newline, which is a 1-line file. Use `: > "$F"` to make a zero-byte file.
- Clearing a filter while Live leaves the view at line 1 with status `Live`. The view snaps to the tail only when the next append arrives. See [line-filters.md](./line-filters.md).
- Only drive instances started by `lv.mjs launch`. It disables Chromium window occlusion. An Electron started any other way stops rendering while it is behind other windows, so follow scrolls appear stuck at line 1 until the next command forces a frame.
