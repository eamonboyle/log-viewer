# Find in file

Find searches the whole file with ripgrep as the user types, shows `current/total` matches, and scrolls to each match as the user steps through them. Case-sensitive, regex and whole-word options re-run the search. A results list shows every match, and a query with no hits shows `no matches`.

## Sub-features

- `search-open` opens the find bar with focus in its input, and pauses follow.
- `search-type` runs a search 300 ms after the last keystroke and shows `1/N`.
- `search-nav` steps with Enter/F3 (next), Shift+Enter/Shift+F3 (previous), or the `Next (Enter)`/`Previous (Shift+Enter)` buttons, and scrolls to each match.
- `search-options` re-runs the search when `Case sensitive`, `Regular expression` or `Whole word` is toggled.
- `search-results` shows `N matches` in the results panel from the `Results list` button.
- `search-empty` shows `no matches` for a query without hits.
- `search-close` closes the bar with Esc or `Close (Esc)`.

## How to get to it (user POV)

- Press `Ctrl+F`, or use `View > Find…`.
- The sidebar footer hint reads `Ctrl+F to search`.

## Driving it with lv.mjs

Preconditions:

- `app.log` (100 lines) is open, with `wait --status "100 lines"` passed.

- **Open.** Press Ctrl+F. Run `key Ctrl+F`. `snapshot.search` is `{query: "", count: ""}`, the input with placeholder `Find in file…` has focus, and `status` ends in `Paused`.
- **Type.** Type a query. Run `type "ERROR"`, then `wait --js "document.querySelector('input[placeholder=\"Find in file…\"]').parentElement.nextElementSibling.innerText.includes('/')"`. `search.count` is `1/10`, and the view shows line 10.
- **Navigate.** Step forward and back. Run `key Enter` (`2/10`, line 20 visible), `key Shift+Enter` (`1/10`), `key F3` (`2/10`).
- **Case option.** Type `error`, then toggle case. Run `type "error" --clear` to get `1/10`, then `click --title "Case sensitive"` to get `no matches`, then click it again to get `1/10`.
- **Regex option.** Run `click --placeholder "Find in file…"`, `type "line [0-9]0$" --clear`, then `click --title "Regular expression"`. `search.count` is `1/9`, for lines 10 through 90 (line 100 does not match).
- **Results list.** Run `click --title "Results list"`. The panel shows `10 matches` for `ERROR`. The button is disabled while the total is 0.
- **Empty.** Run `click --placeholder "Find in file…"` and then `type "zzz-no-such" --clear`. `search.count` is `no matches`.
- **Close.** Run `key Escape`. `snapshot.search` is `null`.
- **Proof.** Take `snapshot --out` and `screenshot --out` with the bar open at `2/10` and at `no matches`.

## Gotchas

- Clicking a search button moves focus off the input, so `type` then refuses. Run `click --placeholder "Find in file…"` before typing again.
- `type --clear` selects the input's text first. Without it, text is appended to the existing query.
- `search.count` reads `…` while a search runs. Wait for it to contain `/` or `no matches`.
- Search pauses follow and does not resume it on close. Press End to resume.
- Results refresh as the file grows. With `ERROR` showing `1/11` on a 118-line file, `append app.log --lines 10` changes it to `1/12` within a second. When the count is stale, it renders as `i/N ·` in amber (`search:stale`, `file:rotated`). No recipe here reproduces that state yet.
