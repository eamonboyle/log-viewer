# Go to line

Go to line opens a small dialog that jumps to a line number, optionally with a column. The target line is centred, a column target is marked in that row, and follow pauses. A line past the end jumps to the last line and resumes follow.

## Sub-features

- `goto-open` opens the dialog. Its placeholder shows the valid range, `line or line:col (1–N)`.
- `goto-line` centres the target line and pauses follow.
- `goto-column` accepts `line:col` in the first box, or a column in the `col` box, and marks that column.
- `goto-clamp` treats a line past the end as the last line and turns follow back on (`Live`).
- `goto-cancel` closes without moving on Esc, `Cancel` or invalid input.

## How to get to it (user POV)

- Press `Ctrl+G`, or use `View > Go to Line…`.
- Submit with Enter or the `Go` button.

## Driving it with lv.mjs

Preconditions:

- `app.log` (100 lines) is open and Live, with `rows.visibleLast` at `100`.

- **Open.** Press Ctrl+G. Run `key Ctrl+G`. `snapshot.goToLine` is `{line: "", placeholder: "line or line:col (1–100)"}`.
- **Jump.** Type 60 and choose Go. Run `type "60"`, then `click --text Go`. `goToLine` is `null`, `rows.visibleFirst`–`visibleLast` is about `42`–`78` (line 60 in the middle at the default window size), and `status` ends in `Paused`.
- **Line and column.** Run `key Ctrl+G`, `type "30:12"`, then `key Enter`. Line 30 is centred (about 12–48), and row 30 contains a column-marker `span` with class `bg-primary/15`.
- **Cancel.** Run `key Ctrl+G` and then `key Escape`. `goToLine` is `null` and the visible range does not change.
- **Invalid.** Run `key Ctrl+G`, `type "abc"`, then `key Enter`. The dialog closes and the visible range does not change.
- **Clamp.** Run `key Ctrl+G`, `type "500"`, then `key Enter`. `rows.visibleLast` is `100` and `status` ends in `Live`.
- **Proof.** Take `snapshot --out` and `screenshot --out` before and after the jump. The proof is the `visibleFirst`/`visibleLast` pair plus the `Paused`/`Live` status.

## Gotchas

- The visible range depends on the window height (800 px by default). Assert that the target line is between `visibleFirst` and `visibleLast`, not exact bounds.
- The placeholder's upper bound tracks the live line count. Match it with `--placeholder "line or line:col*"`.
- Ctrl+G works while the find bar has focus. Both overlays can be open at once.
