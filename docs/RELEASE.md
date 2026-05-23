# Release checklist — Log Viewer v1.0.0

Manual QA and performance gates before tagging `v1.0.0`.

## Performance gate (manual)

Run on a machine representative of your users (not CI):

```bash
npm run gen-log -- --lines 150000 --output ./perf-150k.log
npm run gen-log -- --lines 10000000 --output ./perf-10m.log
npm run gen-log -- --lines 10000 --rate 1000 --wide --output ./live-wide.log
```

| Check | Pass criteria |
|-------|---------------|
| 150k+ lines | Compressed scrollbar usable; scroll to middle feels responsive |
| 10M lines | Open file + scroll to middle < 3s perceived |
| Live tail | Append at 1k lines/s for 5 min — no refresh prompt, no obvious memory leak |
| Wide lines | `--wide` log with wrap off — horizontal scroll works for go-to-column |

Automated smoke (CI): `tests/large-file.perf.test.ts` indexes 1M lines with heap bound check.

## Platform QA matrix

### All platforms

- [ ] Open file via dialog (Ctrl+O)
- [ ] Open in new tab (Ctrl+Shift+O)
- [ ] Open in new window (File menu)
- [ ] Live tail — append to file while watching
- [ ] Follow toggle (F5) and jump to end (End)
- [ ] Find in file (Ctrl+F) with debounced search-as-you-type
- [ ] Search results panel shows line previews (not `…`)
- [ ] Go to line + column — horizontal scroll to column
- [ ] Tab drag reorder
- [ ] Duplicate file badge when same path open twice
- [ ] Middle-click closes tab
- [ ] Clear recent files (File menu + Settings)
- [ ] Light/dark theme toggle persists
- [ ] Per-file highlight glob rules
- [ ] Tab-delimited column detect + hide/show columns
- [ ] Settings export/import
- [ ] Minimap jump
- [ ] Help → Check for Updates (packaged build)

### Windows

- [ ] Portable exe launches
- [ ] NSIS installer (if built)
- [ ] UNC path with polling auto-enabled
- [ ] Drag-drop file onto window

### macOS

- [ ] Open file from Finder (double-click / open-with) targets focused window
- [ ] dmg + zip artifacts open
- [ ] Cmd+O / Cmd+W shortcuts

### Linux

- [ ] AppImage runs
- [ ] deb package installs

## Packaging smoke

```bash
npm run typecheck
npm test
npm run build
npm run dist   # or npm run pack for faster local check
```

Packaged app checks:

- [ ] App icon visible
- [ ] Ripgrep search works (asarUnpack verified)
- [ ] Index worker loads (no inline fallback in production)
- [ ] Multi-window — tail events only in owning window

## Release steps

1. Complete checklist above on each target OS
2. Update CHANGELOG.md if needed
3. Commit with `chore(release): v1.0.0`
4. Tag: `git tag v1.0.0 && git push origin v1.0.0`
5. GitHub Release workflow attaches artifacts for electron-updater

## Known limitations (document, not blockers)

- Read-only viewer — no replace-in-file
- Minimap samples ~200 lines (overview, not pixel-perfect at 40M+ lines)
- Column detection MVP: tab-delimited only
- Code signing optional — SmartScreen / Gatekeeper warnings until signed
- Auto-update v1: check only, no silent install
