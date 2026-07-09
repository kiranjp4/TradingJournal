# TradingJournal

## Cursor Cloud specific instructions

### What this is
A fully static website (plain HTML/CSS/JS, no build step, no `package.json`). It renders trading-journal spreadsheets from bundled JSON in `data/`. Optional cloud sync via Google Drive (`js/googledrive.js`) or Supabase (`js/supabase-app.js`) requires external credentials and is not needed to run/develop the core app.

### Running (dev)
- Must be served over HTTP, not `file://`: the app loads `data/*.json` with `fetch`, which fails on `file://`.
- Serve the repo root, e.g. `python3 -m http.server 5500`, then open `http://localhost:5500/index.html`.
- No compile/watch step; just edit files and refresh the browser.

### Data flow / storage gotchas
- With no cloud sign-in, data is read-only from bundled `data/*.json` (storage mode `bundled`).
- Clicking **Save** in Edit Mode (without Google/Supabase configured) persists edits to browser `localStorage` under the `tradingjournal-kjp:` prefix, not to disk. "Reset to Excel" clears that localStorage entry and reloads the bundled JSON.
- Google Drive/Supabase paths only activate when configured in `js/config.js` (Google client ID) / a Supabase config; otherwise those integrations are inert.

### Lint / test / build
- There is no linter, test suite, or build tooling in this repo.
- `scripts/convert-excel.ps1` is a PowerShell helper to regenerate `data/*.json` from Excel and is unrelated to running the site.
