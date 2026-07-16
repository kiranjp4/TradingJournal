# TradingJournal

Personal, client-side "Trading Journal" website (static HTML/CSS/vanilla JS) deployed to GitHub Pages.

## Cursor Cloud specific instructions

- This is a purely static site: there is **no `package.json`, build step, bundler, linter, or test suite**, and nothing to install. "Running" it just means serving the folder over HTTP.
- **Serve over HTTP, not `file://`.** Pages load data with `fetch()` (home reads `data/manifest.json`; each sheet page reads `../data/<slug>.json`), which fails from `file://`. Run a static server from the repo root, e.g. `python3 -m http.server 5500`, then open `http://localhost:5500/`. Port `5500` matches the OAuth origin documented in `js/config.js`.
- `data/*.json` files are UTF-8 **with a BOM**; the browser `fetch().json()` handles this, but Python must read them with `encoding="utf-8-sig"`.
- **Charts are not in the bundled data.** `data/*.json` have no `charts` key, so in preview mode (`disableLogin: true` in `js/config.js`) sheet pages render tables but **no charts**. Charts (Chart.js, loaded from CDN in `renderSheetCharts`) only appear when populated from the live Google Sheet (`js/googledrive.js`, requires Google OAuth) or from a cached live copy in `localStorage` (`tj:live:<slug>`). To test chart rendering locally without Google auth, temporarily add a `charts` array (`{title, chartType, labels, series:[{label,data,type}]}`) to a `data/<slug>.json` and revert afterward.
- Google Sheets live sync and the Supabase code path (`js/supabase-app.js`, `js/auth.js`, `supabase/schema.sql`) are optional and not wired into the current HTML pages.
