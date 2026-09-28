# Line filters

The Filters sidebar hides lines by log level, or through a quick preset, without changing the file. The status bar switches to `N of M lines`, and the view shows only matching lines in their original order, with their original line numbers.

## Sub-features

- `filter-level` toggles INFO, WARN, ERROR and DEBUG. The last enabled level cannot be turned off.
- `filter-quick` applies one preset at a time: `Errors only`, `Warnings only` or `Hide Microsoft logs`. Clicking the active preset clears it.
- `filter-count` reports `N of M lines` in the status bar and `N matching lines` in the sidebar while a filter is active.
- `filter-level-counts` shows a count next to each level for the lines currently cached.
- `filter-empty` shows `No lines match the current filters.` when nothing matches.

## How to get to it (user POV)

- The `Filters` sidebar sits to the left of the log view whenever a file is open. It has `Levels`, `Time range` (a disabled placeholder) and `Quick filters` sections.

## Driving it with lv.mjs

Preconditions:

- `app.log` (100 lines) is open, with `wait --status "100 lines"` passed. The sidebar counts read `INFO 53`, `WARN 10`, `ERROR 10` and `DEBUG 27`.

- **Hide a level.** Click DEBUG. Run `click --text DEBUG`, then `wait --status "73 of 100 lines"`. No visible row contains ` DEBUG `.
- **Restore.** Click DEBUG again. Run `click --text DEBUG`, then `wait --status "100 lines"`. The status no longer contains ` of `.
- **Errors only.** Run `click --text "Errors only"`, then `wait --status "10 of 100 lines"`. The visible rows are lines 10, 20, …, 100.
- **Warnings only.** Run `click --text "Warnings only"`, then `wait --status "10 of 100 lines"`. The visible rows are lines 5, 15, …, 95.
- **Hide Microsoft.** Run `click --text "Hide Microsoft logs"`, then `wait --status "75 of 100 lines"`. No visible row contains `Microsoft.`.
- **Clear preset.** Click the active preset again. Run `click --text "Hide Microsoft logs"`, then `wait --status "100 lines"`.
- **Last level guard.** Click INFO, WARN, ERROR and then DEBUG. Status reads `27 of 100 lines` because the DEBUG click is ignored.
- **Filtered tail.** Turn on `Errors only`, then run `append app.log --lines 10`. Status reads `11 of 110 lines`, and line 110 is visible.
- **Proof.** Take `snapshot --out` and `screenshot --out` with the filter on, and pair `status` with the sidebar's `N matching lines`.

## Gotchas

- `filter-empty` cannot be reached with the standard fixture, because every line has a level and the last level cannot be disabled. Append a level-less line with `append app.log --text "no level here"` and it stays visible under every level filter.
- Bug at 265bbf9: clearing a filter while Live resets the view to line 1 but keeps `Live` and the Follow switch on. The view reaches the tail only when the next append arrives. To reproduce, run `key End`, click `Errors only` twice, wait 3 s, and check that `rows.visibleFirst` is `1` while `status` ends in `Live`.
- Toggling a level also resets the scroll position to the top, and does not keep a go-to-line position.
- Level counts cover cached lines only. On multi-MB files the sidebar shows `~N indexed in view`.
