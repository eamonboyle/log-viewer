# Log Viewer verification map

This directory is the maintained source for verifying Log Viewer's user-facing behavior. Read this index before driving the app. Then use the matching feature file as the recipe. [../SKILL.md](../SKILL.md) covers launch, doctor, driver commands, evidence and cleanup.

## Baseline preconditions

- A run was started with `node .claude/skills/verify/scripts/lv.mjs launch`, and `doctor --run <id>` passes every check.
- The run's window shows the empty state (`No file open`) with default settings: dark theme, Follow on, Wrap off, font 13px, two default highlight rules (`ERROR`, `WARN`).
- The fixture is created with `fixture app.log --lines 100`. A 100-line fixture contains 53 INFO, 10 WARN, 10 ERROR and 27 DEBUG lines. 25 of the lines come from `Microsoft.Hosting.Lifetime`. ERROR lines are 10, 20, …, 100.
- Never drive an instance that this run did not start.

## Driving conventions

- Pass `--run <id>` to every command, or put `LV_RUN=<id>` in front of it.
- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer the handles the recipes name: `--tab`, `title` attributes, placeholders and exact visible text. Use `--css` only when nothing else is unique.
- Use the exact absolute path that `fixture` prints. Tab titles and recent-file labels use native separators (`D:\…` on Windows).
- Wait on state (`wait --status`, `wait --js`), never on sleeps.
- Never trigger the native Open dialog (`Ctrl+O`, `Open`, `Browse files…`). It is a modal OS window that the driver cannot close.

## Proof and skip reporting

- Capture the user action and the resulting state: a `snapshot --out` plus a `screenshot --out` before and after the step under test.
- Tail and filter proof pairs the file-side count (printed by `append`/`fixture`) with the UI's `status` and `rows`.
- `evidence/actions.jsonl` records every action. Cite the feature ID and entry point with each artifact.
- If an entry point cannot be driven, report the command you tried and the unmet precondition. Do not report it as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then has exactly four H2 sections, in this order.

1. `Sub-features` lists short IDs, with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with lv.mjs` starts with `Preconditions:` and uses labeled bullets. Each bullet pairs a user action with an exact command and the observable result.
4. `Gotchas` lists traps that can waste a verification run or make it invalid.

## Features

- [Open a file](./open-file.md) covers drag-and-drop, the recent-files list, recent files from the menu, and the native-dialog entry points that cannot be driven.
- [Live tail and follow](./live-tail.md) covers watch-first appends, pausing and resuming follow, the unread indicator, and truncation.
- [Find in file](./search.md) covers search-as-you-type, match navigation, search options, the results list and the empty state.
- [Go to line](./go-to-line.md) covers jumping to a line or a line:column pair from the dialog.
- [Line filters](./line-filters.md) covers the level toggles, the quick filters and the filtered line count.
- [Tabs and windows](./tabs-and-windows.md) covers several tabs, closing tabs, and opening a file in a second window.

Not mapped yet: highlight rules, settings (theme, export/import, clear recent), column detection, word wrap/font/encoding toolbar controls, the minimap and the compressed scrollbar.
