// Despite the file name (kept for compatibility with existing page scripts),
// this module now syncs directly with a live Google Sheet via the Sheets API,
// instead of storing JSON snapshots in Google Drive.
const GoogleDriveSync = (() => {
  const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
  const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

  // Maps each website page (slug) to its tab name inside your Google Sheet.
  // If your tab names differ, override them via TRADING_JOURNAL_CONFIG.sheetTabOverrides.
  const SHEET_META = {
    "net-pnl-jp": { title: "Net P&L - Jp", icon: "chart", tabName: "Net_P&L_Jp" },
    "net-pnl-dhanu": { title: "Net P&L - Dhanu", icon: "chart", tabName: "Net_P&L_Dhanu" },
    "quarterly-result": { title: "Quarterly Result", icon: "calendar", tabName: "Quarterly_Result" },
    "trade-journal": { title: "Trade Journal", icon: "book", tabName: "Trade_Journal" },
    formula: { title: "Formula", icon: "formula", tabName: "Formula" },
    "covered-call": { title: "Covered Call Journal", icon: "layers", tabName: "Covered_Call_Trade_Journal" },
    "swing-trading": { title: "Swing Trading", icon: "trending", tabName: "Swing_Trading" },
    "govt-bonds": { title: "Govt. Bonds", icon: "shield", tabName: "Govt. Bonds" },
    weight: { title: "Weight Tracker", icon: "activity", tabName: "Weight" },
    itc: { title: "ITC Analysis", icon: "bar", tabName: "ITC" },
  };

  let accessToken = null;
  let tokenClient = null;
  let signInPromise = null;
  const sheetIdCache = new Map();
  const sheetMetaCache = new Map();
  const rangeOptionsCache = new Map();

  function getConfig() {
    return window.TRADING_JOURNAL_CONFIG || {};
  }

  function isLoginDisabled() {
    return Boolean(getConfig().disableLogin);
  }

  function getSpreadsheetId() {
    return getConfig().googleSheetId || "";
  }

  function getTabName(slug) {
    return getConfig().sheetTabOverrides?.[slug] || SHEET_META[slug]?.tabName || slug;
  }

  function isConfigured() {
    const clientId = getConfig().googleClientId || "";
    const hasClientId = clientId && !clientId.includes("PASTE_YOUR_GOOGLE_CLIENT_ID");
    const sheetId = getSpreadsheetId();
    const hasSheetId = sheetId && !sheetId.includes("PASTE_YOUR_GOOGLE_SHEET_ID");
    return Boolean(hasClientId && hasSheetId);
  }

  function columnLetter(index) {
    let name = "";
    let num = index;
    do {
      name = String.fromCharCode((num % 26) + 65) + name;
      num = Math.floor(num / 26) - 1;
    } while (num >= 0);
    return name;
  }

  function waitForGoogleIdentity() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }

      let attempts = 0;
      const timer = window.setInterval(() => {
        attempts += 1;
        if (window.google?.accounts?.oauth2) {
          window.clearInterval(timer);
          resolve();
        } else if (attempts > 50) {
          window.clearInterval(timer);
          reject(new Error("Google sign-in library did not load."));
        }
      }, 100);
    });
  }

  function ensureTokenClient() {
    if (tokenClient) return tokenClient;

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: getConfig().googleClientId,
      scope: SCOPE,
      callback: () => {},
    });

    return tokenClient;
  }

  async function requestAccessToken(forcePrompt = false) {
    await waitForGoogleIdentity();
    const client = ensureTokenClient();

    return new Promise((resolve, reject) => {
      client.callback = (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        accessToken = response.access_token;
        sessionStorage.setItem("tradingjournal-google-token", accessToken);
        resolve(accessToken);
      };

      const prompt = forcePrompt ? "consent select_account" : "";
      client.requestAccessToken({ prompt });
    });
  }

  async function initialize() {
    if (!isConfigured()) {
      return { configured: false, signedIn: false, loginDisabled: isLoginDisabled() };
    }

    accessToken = sessionStorage.getItem("tradingjournal-google-token");

    return {
      configured: true,
      signedIn: Boolean(accessToken),
      loginDisabled: isLoginDisabled(),
    };
  }

  function isSignedIn() {
    return Boolean(accessToken);
  }

  async function signIn() {
    if (signInPromise) return signInPromise;

    signInPromise = (async () => {
      await requestAccessToken(true);
      sheetIdCache.clear();
      sheetMetaCache.clear();
      return true;
    })();

    try {
      return await signInPromise;
    } finally {
      signInPromise = null;
    }
  }

  function signOut() {
    if (accessToken && window.google?.accounts?.oauth2?.revoke) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    sheetIdCache.clear();
    sheetMetaCache.clear();
    sessionStorage.removeItem("tradingjournal-google-token");
  }

  async function authFetch(url, options = {}) {
    if (!accessToken) {
      await requestAccessToken(false);
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers || {}),
      },
    });

    if (response.status === 401) {
      await requestAccessToken(true);
      return fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(options.headers || {}),
        },
      });
    }

    return response;
  }

  async function loadSheetMetaCache() {
    const response = await authFetch(
      `${SHEETS_API_BASE}/${getSpreadsheetId()}?fields=sheets(properties,rowGroups,charts)`
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Could not read your Google Sheet structure: ${errorText}`);
    }

    const data = await response.json();
    (data.sheets || []).forEach((sheet) => {
      sheetIdCache.set(sheet.properties.title, sheet.properties.sheetId);
      sheetMetaCache.set(sheet.properties.title, {
        sheetId: sheet.properties.sheetId,
        controlAfter: Boolean(sheet.properties.gridProperties?.rowGroupControlAfter),
        rowGroups: sheet.rowGroups || [],
        charts: sheet.charts || [],
      });
    });
  }

  async function getTabSheetId(tabName) {
    if (!sheetIdCache.has(tabName)) {
      await loadSheetMetaCache();
    }

    if (!sheetIdCache.has(tabName)) {
      throw new Error(`Could not find a tab named "${tabName}" in your Google Sheet.`);
    }

    return sheetIdCache.get(tabName);
  }

  async function getRowGroups(tabName) {
    if (!sheetMetaCache.has(tabName)) {
      try {
        await loadSheetMetaCache();
      } catch (error) {
        console.warn(`[TradingJournal] Could not read row groups for "${tabName}":`, error);
        return [];
      }
    }

    const meta = sheetMetaCache.get(tabName);
    if (!meta || !meta.rowGroups.length) return [];

    return meta.rowGroups
      .filter((group) => group.range.dimension !== "COLUMNS")
      .map((group, index) => {
        const startIndex = group.range.startIndex || 0;
        const endIndex = group.range.endIndex;
        // Google Sheets shows the expand/collapse toggle in the row just
        // before the group by default, or just after it if the sheet's
        // "summary rows after group" setting is enabled.
        let anchorRow = meta.controlAfter ? endIndex : startIndex - 1;
        if (anchorRow < 0) anchorRow = startIndex;

        return {
          key: `${startIndex}:${endIndex}:${group.depth || 1}:${index}`,
          startIndex,
          endIndex,
          depth: group.depth || 1,
          collapsed: Boolean(group.collapsed),
          anchorRow,
        };
      });
  }

  async function readSheetValues(tabName) {
    const range = encodeURIComponent(`'${tabName}'`);
    const url = `${SHEETS_API_BASE}/${getSpreadsheetId()}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
    const response = await authFetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Could not read "${tabName}" from your Google Sheet: ${errorText}`);
    }

    const data = await response.json();
    return data.values || [];
  }

  async function resolveRangeOptions(fullRangeRef) {
    if (rangeOptionsCache.has(fullRangeRef)) return rangeOptionsCache.get(fullRangeRef);

    const promise = (async () => {
      try {
        const url = `${SHEETS_API_BASE}/${getSpreadsheetId()}/values/${encodeURIComponent(
          fullRangeRef
        )}?valueRenderOption=UNFORMATTED_VALUE`;
        const response = await authFetch(url);
        if (!response.ok) return [];

        const data = await response.json();
        return (data.values || [])
          .flat()
          .map((value) => (value === null || value === undefined ? "" : String(value).trim()))
          .filter((value) => value !== "");
      } catch (error) {
        console.warn(`[TradingJournal] Could not resolve dropdown range "${fullRangeRef}":`, error);
        return [];
      }
    })();

    rangeOptionsCache.set(fullRangeRef, promise);
    return promise;
  }

  function isNearWhite(color) {
    const r = color.red ?? 1;
    const g = color.green ?? 1;
    const b = color.blue ?? 1;
    return r >= 0.95 && g >= 0.95 && b >= 0.95;
  }

  function isNearBlack(color) {
    const r = color.red ?? 0;
    const g = color.green ?? 0;
    const b = color.blue ?? 0;
    return r <= 0.05 && g <= 0.05 && b <= 0.05;
  }

  function toRgba(color, fallbackAlpha = 1) {
    const r = Math.round((color.red ?? 0) * 255);
    const g = Math.round((color.green ?? 0) * 255);
    const b = Math.round((color.blue ?? 0) * 255);
    const a = color.alpha === undefined ? fallbackAlpha : color.alpha;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  async function readSheetFormatting(tabName) {
    try {
      const params = new URLSearchParams({
        ranges: `'${tabName}'`,
        includeGridData: "true",
        fields:
          "sheets.data.rowData.values(userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.numberFormat.type,dataValidation)",
      });
      const response = await authFetch(`${SHEETS_API_BASE}/${getSpreadsheetId()}?${params.toString()}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[TradingJournal] Could not read formatting for "${tabName}":`, errorText);
        return { bold: {}, dropdowns: {}, bg: {}, fg: {}, percent: {}, dates: {} };
      }

      const data = await response.json();
      const rowData = data.sheets?.[0]?.data?.[0]?.rowData || [];
      const bold = {};
      const dropdowns = {};
      const bg = {};
      const fg = {};
      const percent = {};
      const dates = {};
      const rangeDropdownCells = [];

      rowData.forEach((row, rowIndex) => {
        (row.values || []).forEach((cell, colIndex) => {
          const key = `${rowIndex}:${colIndex}`;
          const format = cell.userEnteredFormat;

          if (format?.textFormat?.bold) {
            bold[key] = true;
          }

          if (format?.numberFormat?.type === "PERCENT") {
            percent[key] = true;
          }

          if (format?.numberFormat?.type === "DATE" || format?.numberFormat?.type === "DATE_TIME") {
            dates[key] = true;
          }

          const bgColor = format?.backgroundColor;
          if (bgColor && !isNearWhite(bgColor)) {
            bg[key] = toRgba(bgColor);
            const fgColor = format?.textFormat?.foregroundColor;
            fg[key] = fgColor && !isNearBlack(fgColor) ? toRgba(fgColor, 1) : "#111827";
          }

          const condition = cell.dataValidation?.condition;
          if (!condition) return;

          // Date validation rules ("DATE_IS_VALID", "DATE_BETWEEN", etc.)
          // show a calendar picker in Google Sheets.
          if (typeof condition.type === "string" && condition.type.startsWith("DATE_")) {
            dates[key] = true;
            return;
          }

          if (condition.type === "ONE_OF_LIST" && condition.values?.length) {
            const options = condition.values
              .map((entry) => entry.userEnteredValue)
              .filter((value) => value !== undefined && value !== null && value !== "");
            if (options.length) dropdowns[key] = options;
          } else if (condition.type === "ONE_OF_RANGE" && condition.values?.[0]?.userEnteredValue) {
            const rawRangeRef = condition.values[0].userEnteredValue;
            const fullRangeRef = rawRangeRef.includes("!") ? rawRangeRef : `'${tabName}'!${rawRangeRef}`;
            rangeDropdownCells.push({ key, fullRangeRef });
          }
        });
      });

      if (rangeDropdownCells.length) {
        const uniqueRanges = [...new Set(rangeDropdownCells.map((item) => item.fullRangeRef))];
        const resolved = await Promise.all(uniqueRanges.map((rangeRef) => resolveRangeOptions(rangeRef)));
        const rangeOptionsMap = new Map(uniqueRanges.map((rangeRef, index) => [rangeRef, resolved[index]]));
        rangeDropdownCells.forEach(({ key, fullRangeRef }) => {
          const options = rangeOptionsMap.get(fullRangeRef);
          if (options && options.length) dropdowns[key] = options;
        });
      }

      console.info(
        `[TradingJournal] "${tabName}": detected ${Object.keys(bold).length} bold cell(s), ${
          Object.keys(dropdowns).length
        } dropdown cell(s), ${Object.keys(bg).length} colored cell(s), ${
          Object.keys(percent).length
        } percent cell(s), ${Object.keys(dates).length} date cell(s).`
      );

      return { bold, dropdowns, bg, fg, percent, dates };
    } catch (error) {
      console.warn(`[TradingJournal] Could not read formatting for "${tabName}":`, error);
      return { bold: {}, dropdowns: {}, bg: {}, fg: {}, percent: {}, dates: {} };
    }
  }

  function sliceGridRange(values, range) {
    const startRow = range.startRowIndex || 0;
    const endRow = range.endRowIndex ?? values.length;
    const startCol = range.startColumnIndex || 0;
    const endCol = range.endColumnIndex;
    const out = [];
    for (let r = startRow; r < Math.min(endRow, values.length); r += 1) {
      const row = values[r] || [];
      out.push(endCol === undefined ? row.slice(startCol) : row.slice(startCol, endCol));
    }
    return out;
  }

  function a1FromGridRange(tabTitle, range) {
    const startCol = columnLetter(range.startColumnIndex || 0);
    const endColIndex = (range.endColumnIndex ?? (range.startColumnIndex || 0) + 1) - 1;
    const startRow = (range.startRowIndex || 0) + 1;
    const endRow = range.endRowIndex ?? startRow;
    return `'${tabTitle}'!${startCol}${startRow}:${columnLetter(endColIndex)}${endRow}`;
  }

  // Reads the values behind one chart data range. Ranges on the current tab
  // reuse the already-loaded values; ranges on other tabs are fetched.
  async function readGridRangeValues(gridRange, currentSheetId, currentValues) {
    if (gridRange.sheetId === undefined || gridRange.sheetId === currentSheetId) {
      return sliceGridRange(currentValues, gridRange);
    }

    let otherTitle = null;
    sheetIdCache.forEach((id, title) => {
      if (id === gridRange.sheetId) otherTitle = title;
    });
    if (!otherTitle) return [];

    try {
      const a1 = a1FromGridRange(otherTitle, gridRange);
      const url = `${SHEETS_API_BASE}/${getSpreadsheetId()}/values/${encodeURIComponent(
        a1
      )}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
      const response = await authFetch(url);
      if (!response.ok) return [];
      const data = await response.json();
      return data.values || [];
    } catch (error) {
      console.warn("[TradingJournal] Could not read a chart data range:", error);
      return [];
    }
  }

  function toChartNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isNaN(numeric) ? null : numeric;
  }

  // Converts the tab's embedded Google Sheets charts into simple
  // { title, chartType, labels, series } objects the website can draw.
  async function getChartConfigs(tabName, values) {
    if (!sheetMetaCache.has(tabName)) {
      try {
        await loadSheetMetaCache();
      } catch (error) {
        console.warn(`[TradingJournal] Could not read charts for "${tabName}":`, error);
        return [];
      }
    }

    const meta = sheetMetaCache.get(tabName);
    if (!meta?.charts?.length) return [];

    const configs = [];
    for (const chart of meta.charts) {
      const spec = chart.spec || {};
      try {
        if (spec.basicChart) {
          const basic = spec.basicChart;
          const headerCount = basic.headerCount ?? 0;

          let labels = [];
          const domainSource = basic.domains?.[0]?.domain?.sourceRange?.sources?.[0];
          if (domainSource) {
            labels = (await readGridRangeValues(domainSource, meta.sheetId, values)).flat();
          }

          const series = [];
          for (const entry of basic.series || []) {
            const source = entry.series?.sourceRange?.sources?.[0];
            if (!source) continue;
            const flat = (await readGridRangeValues(source, meta.sheetId, values)).flat();
            const headerValue = headerCount > 0 && flat.length ? String(flat[0] ?? "").trim() : "";
            series.push({
              label: headerValue || `Series ${series.length + 1}`,
              data: (headerCount > 0 ? flat.slice(headerCount) : flat).map(toChartNumber),
              type: entry.type || basic.chartType || "LINE",
            });
          }

          if (!series.length) continue;
          configs.push({
            title: spec.title || "",
            chartType: basic.chartType || "LINE",
            labels: headerCount > 0 ? labels.slice(headerCount) : labels,
            series,
          });
        } else if (spec.pieChart) {
          const pie = spec.pieChart;
          const domainSource = pie.domain?.sourceRange?.sources?.[0];
          const seriesSource = pie.series?.sourceRange?.sources?.[0];
          let labels = domainSource
            ? (await readGridRangeValues(domainSource, meta.sheetId, values)).flat()
            : [];
          let data = seriesSource
            ? (await readGridRangeValues(seriesSource, meta.sheetId, values)).flat()
            : [];

          // Drop a header row if the first data cell is not numeric.
          if (data.length && toChartNumber(data[0]) === null) {
            labels = labels.slice(1);
            data = data.slice(1);
          }

          if (!data.length) continue;
          configs.push({
            title: spec.title || "",
            chartType: pie.pieHole ? "DOUGHNUT" : "PIE",
            labels: labels.map((label) => String(label ?? "")),
            series: [{ label: spec.title || "Value", data: data.map(toChartNumber), type: "PIE" }],
          });
        }
      } catch (error) {
        console.warn(`[TradingJournal] Skipping a chart on "${tabName}" that could not be read:`, error);
      }
    }

    console.info(`[TradingJournal] "${tabName}": prepared ${configs.length} chart(s) for the website.`);
    return configs;
  }

  async function loadSheet(slug) {
    const tabName = getTabName(slug);
    const meta = SHEET_META[slug] || {};
    const [values, formatting, rowGroups] = await Promise.all([
      readSheetValues(tabName),
      readSheetFormatting(tabName),
      getRowGroups(tabName),
    ]);
    const charts = await getChartConfigs(tabName, values);
    const rowCount = values.length;
    const colCount = values.reduce((max, row) => Math.max(max, row.length), 0);

    return {
      sheetName: tabName,
      slug,
      title: meta.title || slug,
      icon: meta.icon || "book",
      updatedAt: new Date().toLocaleString("en-IN"),
      rowCount,
      colCount,
      cells: values,
      boldCells: formatting.bold,
      dropdownCells: formatting.dropdowns,
      bgColors: formatting.bg,
      fgColors: formatting.fg,
      percentCells: formatting.percent,
      dateCells: formatting.dates,
      rowGroups,
      charts,
    };
  }

  async function saveDirtyCells(slug, dirtyCells) {
    if (!dirtyCells || dirtyCells.size === 0) return true;

    const tabName = getTabName(slug);
    const data = [];
    dirtyCells.forEach((value, key) => {
      const [rowIndex, colIndex] = key.split(":").map(Number);
      const range = `'${tabName}'!${columnLetter(colIndex)}${rowIndex + 1}`;
      data.push({ range, values: [[value]] });
    });

    const response = await authFetch(`${SHEETS_API_BASE}/${getSpreadsheetId()}/values:batchUpdate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Could not save changes to your Google Sheet: ${errorText}`);
    }

    return true;
  }

  async function insertRowAt(slug, rowIndex) {
    const tabName = getTabName(slug);
    const sheetId = await getTabSheetId(tabName);

    const response = await authFetch(`${SHEETS_API_BASE}/${getSpreadsheetId()}:batchUpdate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            insertDimension: {
              range: { sheetId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 },
              inheritFromBefore: rowIndex > 0,
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Could not add a row in your Google Sheet: ${errorText}`);
    }

    return true;
  }

  async function deleteRowAt(slug, rowIndex) {
    const tabName = getTabName(slug);
    const sheetId = await getTabSheetId(tabName);

    const response = await authFetch(`${SHEETS_API_BASE}/${getSpreadsheetId()}:batchUpdate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: { sheetId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 },
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Could not delete that row in your Google Sheet: ${errorText}`);
    }

    return true;
  }

  function getHomeHref() {
    return window.location.pathname.includes("/pages/") ? "../index.html" : "index.html";
  }

  function renderAuthUI(container) {
    if (!container) return;
    const compact = container.dataset.authCompact === "true";
    const isHome = container.dataset.authMode === "home";

    if (isLoginDisabled()) {
      if (isHome) {
        container.innerHTML = `
          <div class="auth-panel connected">
            <span class="auth-user">Preview mode enabled</span>
            <span class="auth-cloud">Login is not required while the design is being finalized</span>
          </div>
        `;
      } else {
        // Keep Sync Now available in preview mode. If there is no active
        // Google session yet, clicking it will ask for one on demand.
        container.innerHTML = `
          <div class="auth-compact">
            <button class="button" type="button" data-auth-action="sync">Sync Now</button>
            ${isSignedIn() ? `<button class="button" type="button" data-auth-action="signout">Sign Out</button>` : ""}
          </div>
        `;
      }
      attachAuthHandlers(container);
      return;
    }

    if (!isConfigured()) {
      container.innerHTML = compact
        ? `<div class="auth-compact"><span class="auth-user">Google Sheet not configured</span></div>`
        : `
            <div class="auth-panel warning">
              <span>Add your Google Client ID and Sheet ID in js/config.js to enable sync</span>
            </div>
          `;
      return;
    }

    if (isSignedIn()) {
      if (isHome) {
        container.innerHTML = `
          <div class="auth-panel connected">
            <span class="auth-user">Signed in to Google</span>
            <span class="auth-cloud">Synced with Google Sheet</span>
          </div>
        `;
      } else {
        container.innerHTML = compact
          ? `
              <div class="auth-compact">
                <button class="button" type="button" data-auth-action="sync">Sync Now</button>
                <button class="button" type="button" data-auth-action="signout">Sign Out</button>
              </div>
            `
          : `
              <div class="auth-panel connected">
                <span class="auth-user">Signed in to Google</span>
                <span class="auth-cloud">Synced with Google Sheet</span>
                <button class="button" type="button" data-auth-action="sync">Sync Now</button>
                <button class="button" type="button" data-auth-action="signout">Sign Out</button>
              </div>
            `;
      }
    } else {
      container.innerHTML = compact
        ? `
            <div class="auth-compact">
              <button class="button button-primary" type="button" data-auth-action="signin">Sign in with Google</button>
            </div>
          `
        : `
            <div class="auth-panel">
              <span>Sign in to sync edits directly with your Google Sheet</span>
              <button class="button button-primary" type="button" data-auth-action="signin">Sign in with Google</button>
            </div>
          `;
    }

    attachAuthHandlers(container);
  }

  function attachAuthHandlers(container) {
    container.querySelector('[data-auth-action="signin"]')?.addEventListener("click", async () => {
      try {
        await signIn();
        window.location.reload();
      } catch (error) {
        alert(error.message || "Google sign in was cancelled.");
      }
    });

    container.querySelector('[data-auth-action="signout"]')?.addEventListener("click", () => {
      signOut();
      window.location.reload();
    });

    container.querySelector('[data-auth-action="sync"]')?.addEventListener("click", async () => {
      if (isConfigured() && !isSignedIn()) {
        try {
          await signIn();
          window.location.reload();
        } catch (error) {
          alert(error.message || "Google sign in was cancelled.");
        }
        return;
      }
      window.dispatchEvent(new CustomEvent("tradingjournal:sync"));
    });
  }

  function renderSignOutCorner(container) {
    if (!container) return;

    if (!isConfigured() || !isSignedIn()) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = `<button class="button" type="button" data-auth-action="signout">Sign Out</button>`;
    container.querySelector('[data-auth-action="signout"]')?.addEventListener("click", () => {
      signOut();
      window.location.reload();
    });
  }

  return {
    initialize,
    isConfigured,
    isSignedIn,
    isLoginDisabled,
    signIn,
    signOut,
    loadSheet,
    saveDirtyCells,
    insertRowAt,
    deleteRowAt,
    renderAuthUI,
    renderSignOutCorner,
    getTabName,
  };
})();

window.GoogleDriveSync = GoogleDriveSync;
