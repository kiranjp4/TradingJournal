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
  const rangeOptionsCache = new Map();

  function getConfig() {
    return window.TRADING_JOURNAL_CONFIG || {};
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
      return { configured: false, signedIn: false };
    }

    accessToken = sessionStorage.getItem("tradingjournal-google-token");

    return {
      configured: true,
      signedIn: Boolean(accessToken),
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

  async function getTabSheetId(tabName) {
    if (sheetIdCache.has(tabName)) return sheetIdCache.get(tabName);

    const response = await authFetch(`${SHEETS_API_BASE}/${getSpreadsheetId()}?fields=sheets.properties`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Could not read your Google Sheet structure: ${errorText}`);
    }

    const data = await response.json();
    (data.sheets || []).forEach((sheet) => {
      sheetIdCache.set(sheet.properties.title, sheet.properties.sheetId);
    });

    if (!sheetIdCache.has(tabName)) {
      throw new Error(`Could not find a tab named "${tabName}" in your Google Sheet.`);
    }

    return sheetIdCache.get(tabName);
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

  async function readSheetFormatting(tabName) {
    try {
      const params = new URLSearchParams({
        ranges: `'${tabName}'`,
        includeGridData: "true",
        fields: "sheets.data.rowData.values(userEnteredFormat.textFormat.bold,dataValidation)",
      });
      const response = await authFetch(`${SHEETS_API_BASE}/${getSpreadsheetId()}?${params.toString()}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[TradingJournal] Could not read formatting for "${tabName}":`, errorText);
        return { bold: {}, dropdowns: {} };
      }

      const data = await response.json();
      const rowData = data.sheets?.[0]?.data?.[0]?.rowData || [];
      const bold = {};
      const dropdowns = {};
      const rangeDropdownCells = [];

      rowData.forEach((row, rowIndex) => {
        (row.values || []).forEach((cell, colIndex) => {
          const key = `${rowIndex}:${colIndex}`;

          if (cell.userEnteredFormat?.textFormat?.bold) {
            bold[key] = true;
          }

          const condition = cell.dataValidation?.condition;
          if (!condition) return;

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
        } dropdown cell(s).`
      );

      return { bold, dropdowns };
    } catch (error) {
      console.warn(`[TradingJournal] Could not read formatting for "${tabName}":`, error);
      return { bold: {}, dropdowns: {} };
    }
  }

  async function loadSheet(slug) {
    const tabName = getTabName(slug);
    const meta = SHEET_META[slug] || {};
    const [values, formatting] = await Promise.all([readSheetValues(tabName), readSheetFormatting(tabName)]);
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

    container.querySelector('[data-auth-action="sync"]')?.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("tradingjournal:sync"));
    });
  }

  return {
    initialize,
    isConfigured,
    isSignedIn,
    signIn,
    signOut,
    loadSheet,
    saveDirtyCells,
    insertRowAt,
    deleteRowAt,
    renderAuthUI,
    getTabName,
  };
})();

window.GoogleDriveSync = GoogleDriveSync;
