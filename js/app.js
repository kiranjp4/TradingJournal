const SITE_TITLE = "Trading Journal - KJP";
const STORAGE_PREFIX = "tradingjournal-kjp:";

const ICONS = {
  chart: "PL",
  calendar: "QR",
  book: "TJ",
  formula: "FX",
  layers: "CC",
  trending: "SW",
  shield: "BD",
  activity: "WT",
  bar: "IT",
};

const SHEET_HINTS = {
  "trade-journal": "Track each executed trade, setup, risk, and notes.",
  "net-pnl-jp": "Monitor overall performance with running net P&L.",
  "quarterly-result": "Review quarter-level outcomes and capital efficiency.",
  "net-pnl-dhanu": "Compare P&L flow for the Dhanu account.",
  itc: "Capture ITC position decisions and follow-up actions.",
  weight: "Manage sizing and allocation weight across setups.",
  "covered-call": "Track covered-call entries, exits, and premium outcomes.",
  "swing-trading": "Log swing setups with entry/exit conviction.",
  "govt-bonds": "Record bond yields, holdings, and interest movement.",
  formula: "Store calculation helpers and reusable formulas.",
};

const pageState = {
  slug: null,
  sheetData: null,
  editMode: false,
  searchTerm: "",
  dirty: false,
  storageMode: "bundled",
  dirtyCells: new Map(),
};

const SHEET_COLUMN_RULES = {
  "net-pnl-jp": {
    0: "plain",
    1: "date",
    2: "plain",
    3: "percent",
    7: "plain",
  },
};

function getColumnRule(slug, colIndex) {
  return SHEET_COLUMN_RULES[slug]?.[colIndex] || "auto";
}

function formatCellValue(value, columnRule = "auto") {
  if (value === null || value === undefined || value === "") {
    return { display: "", className: "empty", raw: "" };
  }

  const text = String(value).trim();
  if (text === "") {
    return { display: "", className: "empty", raw: "" };
  }

  const numeric = Number(text);
  const isNumeric = !Number.isNaN(numeric) && text !== "";

  if (columnRule === "date" && isNumeric) {
    const excelDate = excelSerialToDate(numeric);
    if (excelDate) {
      return { display: excelDate, className: "date", raw: text };
    }
  }

  if (columnRule === "percent" && isNumeric) {
    const formatted = formatNumber(numeric * 100);
    return { display: `${formatted}%`, className: "number", raw: text };
  }

  if (columnRule === "plain" && isNumeric) {
    const formatted = formatNumber(numeric);
    return { display: formatted, className: "number", raw: text };
  }

  if (isNumeric) {
    if (numeric > 40000 && numeric < 60000 && Number.isInteger(numeric)) {
      const excelDate = excelSerialToDate(numeric);
      if (excelDate) {
        return { display: excelDate, className: "date", raw: text };
      }
    }

    const formatted = formatNumber(numeric);
    if (numeric > 0) return { display: formatted, className: "number-positive", raw: text };
    if (numeric < 0) return { display: formatted, className: "number-negative", raw: text };
    return { display: formatted, className: "number", raw: text };
  }

  return { display: text, className: "text", raw: text };
}

function excelSerialToDate(serial) {
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const date = new Date(utcValue * 1000);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatNumber(value) {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }
  if (!Number.isInteger(value)) {
    return value.toLocaleString("en-IN", { maximumFractionDigits: 4 });
  }
  return value.toLocaleString("en-IN");
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Could not load ${path}`);
  }
  return response.json();
}

function getStorageKey(slug) {
  return `${STORAGE_PREFIX}${slug}`;
}

function hasLocalEdits(slug) {
  return Boolean(localStorage.getItem(getStorageKey(slug)));
}

function loadFromStorage(slug) {
  const raw = localStorage.getItem(getStorageKey(slug));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function saveToStorage(slug, sheetData) {
  const payload = {
    ...sheetData,
    updatedAt: new Date().toLocaleString("en-IN"),
    savedInBrowser: true,
  };
  localStorage.setItem(getStorageKey(slug), JSON.stringify(payload));
  pageState.dirty = false;
  return payload;
}

function clearStorage(slug) {
  localStorage.removeItem(getStorageKey(slug));
}

function normalizeSheetData(sheetData) {
  const cells = sheetData.cells.map((row) => row.map((cell) => (cell === null ? "" : String(cell))));
  return {
    ...sheetData,
    rowCount: cells.length,
    colCount: cells.reduce((max, row) => Math.max(max, row.length), 0),
    cells,
    boldCells: sheetData.boldCells || {},
    dropdownCells: sheetData.dropdownCells || {},
  };
}

async function loadSheetData(slug) {
  if (window.GoogleDriveSync?.isSignedIn()) {
    try {
      pageState.storageMode = "googlesheets";
      return normalizeSheetData(await GoogleDriveSync.loadSheet(slug));
    } catch (error) {
      pageState.storageMode = "bundled";
      throw error;
    }
  }

  const localData = loadFromStorage(slug);
  if (localData) {
    pageState.storageMode = "browser";
    return normalizeSheetData(localData);
  }

  pageState.storageMode = "bundled";
  return normalizeSheetData(await fetchJson(`../data/${slug}.json`));
}

function getStorageLabel() {
  if (pageState.storageMode === "googlesheets") return "Synced with Google Sheet";
  if (pageState.storageMode === "browser") return "Saved in browser only";
  return "Loaded from Excel import";
}

function getSheetHint(slug) {
  return SHEET_HINTS[slug] || "Analyze your sheet with quick filtering and edit controls.";
}

function ensureFooter() {
  if (document.querySelector(".footer")) return;
  const footer = document.createElement("footer");
  footer.className = "footer container";
  footer.innerHTML = "<p>Trading Journal - KJP | Google Sheets Sync + GitHub Pages</p>";
  document.body.appendChild(footer);
}

function updateSaveStatusIndicator() {
  const statusEl = document.querySelector(".save-status");
  if (!statusEl) return;
  statusEl.classList.toggle("unsaved", pageState.dirty);
  statusEl.textContent = pageState.dirty ? "Unsaved changes" : "All changes saved";
}

function setActiveNav(slug) {
  document.querySelectorAll("[data-nav-slug]").forEach((link) => {
    link.classList.toggle("active", link.dataset.navSlug === slug);
  });
}

function columnName(index) {
  let name = "";
  let num = index;
  do {
    name = String.fromCharCode((num % 26) + 65) + name;
    num = Math.floor(num / 26) - 1;
  } while (num >= 0);
  return name;
}

function getFilteredRows(cells, searchTerm) {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  if (!normalizedSearch) return cells;
  return cells.filter((row) =>
    row.some((cell) => String(cell ?? "").toLowerCase().includes(normalizedSearch))
  );
}

function updateCell(rowIndex, colIndex, value) {
  const { sheetData } = pageState;
  if (!sheetData.cells[rowIndex]) {
    sheetData.cells[rowIndex] = [];
  }
  sheetData.cells[rowIndex][colIndex] = value;
  pageState.dirty = true;
  pageState.dirtyCells.set(`${rowIndex}:${colIndex}`, value);
  // Avoid a full re-render here: editing a cell fires this via the input's
  // "change" event (on blur), which happens right as a click on another
  // button (e.g. Save) is in progress. Re-rendering the whole toolbar at
  // that exact moment can destroy/replace the button before the click is
  // delivered, requiring a second click. Only the small status indicator
  // needs to update after a cell edit.
  updateSaveStatusIndicator();
}

async function addRow() {
  const { sheetData } = pageState;
  const root = document.getElementById("sheet-root");
  const addButton = root?.querySelector('[data-action="add-row"]');

  if (window.GoogleDriveSync?.isSignedIn()) {
    if (addButton) {
      addButton.disabled = true;
      addButton.textContent = "Adding...";
    }
    try {
      await GoogleDriveSync.insertRowAt(pageState.slug, sheetData.rowCount);
      pageState.sheetData = await GoogleDriveSync.loadSheet(pageState.slug);
      pageState.dirtyCells.clear();
      pageState.dirty = false;
      pageState.storageMode = "googlesheets";
      renderSheetPage(root);
    } catch (error) {
      alert(error.message || "Could not add a row in your Google Sheet.");
      if (addButton) {
        addButton.disabled = false;
        addButton.textContent = "Add Row";
      }
    }
    return;
  }

  const newRow = Array.from({ length: sheetData.colCount }, () => "");
  sheetData.cells.push(newRow);
  sheetData.rowCount = sheetData.cells.length;
  pageState.dirty = true;
  renderSheetPage(root);
}

async function deleteRow(rowIndex) {
  const { sheetData } = pageState;
  const root = document.getElementById("sheet-root");

  if (window.GoogleDriveSync?.isSignedIn()) {
    const confirmed = window.confirm("Delete this row from your Google Sheet? This cannot be undone.");
    if (!confirmed) return;

    try {
      await GoogleDriveSync.deleteRowAt(pageState.slug, rowIndex);
      pageState.sheetData = await GoogleDriveSync.loadSheet(pageState.slug);
      pageState.dirtyCells.clear();
      pageState.dirty = false;
      pageState.storageMode = "googlesheets";
      renderSheetPage(root);
    } catch (error) {
      alert(error.message || "Could not delete that row in your Google Sheet.");
    }
    return;
  }

  sheetData.cells.splice(rowIndex, 1);
  sheetData.rowCount = sheetData.cells.length;
  pageState.dirty = true;
  renderSheetPage(root);
}

async function saveCurrentSheet() {
  const root = document.getElementById("sheet-root");
  const saveButton = root?.querySelector('[data-action="save"]');
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
  }

  try {
    if (window.GoogleDriveSync?.isSignedIn()) {
      await GoogleDriveSync.saveDirtyCells(pageState.slug, pageState.dirtyCells);
      pageState.dirtyCells.clear();
      pageState.sheetData = await GoogleDriveSync.loadSheet(pageState.slug);
      pageState.storageMode = "googlesheets";
      pageState.dirty = false;
      clearStorage(pageState.slug);
    } else {
      pageState.sheetData = saveToStorage(pageState.slug, pageState.sheetData);
      pageState.storageMode = "browser";
    }
    renderSheetPage(root);
  } catch (error) {
    alert(error.message || "Could not save data.");
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "Save";
    }
  }
}

async function syncCurrentSheet() {
  if (!pageState.slug) {
    await initHomePage();
    return;
  }

  const root = document.getElementById("sheet-root");

  try {
    if (window.GoogleDriveSync?.isSignedIn() && pageState.dirtyCells.size > 0) {
      await GoogleDriveSync.saveDirtyCells(pageState.slug, pageState.dirtyCells);
      pageState.dirtyCells.clear();
    }

    pageState.sheetData = await loadSheetData(pageState.slug);
    pageState.dirty = false;
    renderSheetPage(root);
  } catch (error) {
    if (root) {
      root.innerHTML = `
        <div class="error-state panel">
          <h2>Could not sync with Google Sheet</h2>
          <p>${error.message}</p>
        </div>
      `;
    }
  }
}

function toggleEditMode() {
  pageState.editMode = !pageState.editMode;
  renderSheetPage(document.getElementById("sheet-root"));
}

function renderSheetPage(container) {
  const { sheetData, editMode, searchTerm, dirty } = pageState;
  const filteredRows = getFilteredRows(sheetData.cells, searchTerm);

  const table = document.createElement("table");
  table.className = `data-table${editMode ? " edit-mode" : ""}`;

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (let col = 0; col < sheetData.colCount; col += 1) {
    const th = document.createElement("th");
    th.textContent = columnName(col);
    headerRow.appendChild(th);
  }
  if (editMode) {
    const actionTh = document.createElement("th");
    actionTh.textContent = "Actions";
    headerRow.appendChild(actionTh);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  filteredRows.forEach((row) => {
    const rowIndex = sheetData.cells.indexOf(row);
    const tr = document.createElement("tr");

    for (let col = 0; col < sheetData.colCount; col += 1) {
      const td = document.createElement("td");
      const rawValue = row[col] ?? "";

      const cellKey = `${rowIndex}:${col}`;

      if (editMode) {
        const dropdownOptions = sheetData.dropdownCells?.[cellKey];

        if (dropdownOptions && dropdownOptions.length) {
          const select = document.createElement("select");
          select.className = "cell-input cell-select";

          const blankOption = document.createElement("option");
          blankOption.value = "";
          blankOption.textContent = "";
          select.appendChild(blankOption);

          if (rawValue && !dropdownOptions.includes(rawValue)) {
            const currentOption = document.createElement("option");
            currentOption.value = rawValue;
            currentOption.textContent = rawValue;
            select.appendChild(currentOption);
          }

          dropdownOptions.forEach((optionValue) => {
            const option = document.createElement("option");
            option.value = optionValue;
            option.textContent = optionValue;
            select.appendChild(option);
          });

          select.value = rawValue;
          select.addEventListener("change", (event) => {
            updateCell(rowIndex, col, event.target.value);
          });
          td.appendChild(select);
        } else {
          const input = document.createElement("input");
          input.className = "cell-input";
          input.value = rawValue;
          input.addEventListener("change", (event) => {
            updateCell(rowIndex, col, event.target.value);
          });
          td.appendChild(input);
        }
      } else {
        const columnRule = getColumnRule(pageState.slug, col);
        const formatted = formatCellValue(rawValue, columnRule);
        td.textContent = formatted.display;
        td.className = formatted.className;
        if (sheetData.boldCells?.[cellKey]) {
          td.classList.add("cell-bold");
        }
      }

      tr.appendChild(td);
    }

    if (editMode) {
      const actionTd = document.createElement("td");
      const deleteButton = document.createElement("button");
      deleteButton.className = "button button-danger";
      deleteButton.type = "button";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => deleteRow(rowIndex));
      actionTd.appendChild(deleteButton);
      tr.appendChild(actionTd);
    }

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.innerHTML = `
    <div class="page-toolbar">
      <div class="page-title-wrap">
        <h1>${sheetData.title}</h1>
        <p class="page-subtitle">${getSheetHint(pageState.slug)}</p>
        <div class="meta-bar">
          <span>${sheetData.rowCount} rows</span>
          <span>${sheetData.colCount} columns</span>
          <span>Updated: ${sheetData.updatedAt}</span>
          <span>Showing: ${filteredRows.length} rows</span>
          <span>${getStorageLabel()}</span>
        </div>
      </div>
      <div class="toolbar-actions">
        <input class="search-input" type="search" placeholder="Search in this sheet..." value="${searchTerm}" />
        <button class="button" type="button" data-action="toggle-edit">${editMode ? "View Mode" : "Edit Mode"}</button>
        <button class="button button-primary" type="button" data-action="save">Save</button>
        <button class="button" type="button" data-action="add-row">Add Row</button>
      </div>
    </div>
    <div class="edit-banner">
      <p>
        ${
          editMode
            ? GoogleDriveSync?.isSignedIn()
              ? "Edit mode is on. Click Save or Sync Now to write your changes directly into your Google Sheet."
              : "Edit mode is on. Sign in with Google to sync edits directly with your Google Sheet."
            : "Turn on Edit Mode to update data directly on this page."
        }
      </p>
      <span class="save-status ${dirty ? "unsaved" : ""}">
        ${dirty ? "Unsaved changes" : "All changes saved"}
      </span>
    </div>
    <div class="panel">
      <div class="table-wrap"></div>
    </div>
  `;

  container.querySelector(".table-wrap").appendChild(table);

  container.querySelector(".search-input").addEventListener("input", (event) => {
    pageState.searchTerm = event.target.value;
    renderSheetPage(container);
  });

  container.querySelector('[data-action="toggle-edit"]').addEventListener("click", toggleEditMode);
  container.querySelector('[data-action="save"]').addEventListener("click", saveCurrentSheet);
  container.querySelector('[data-action="add-row"]').addEventListener("click", addRow);
}

async function initSheetPage(slug) {
  const root = document.getElementById("sheet-root");
  if (!root) return;

  pageState.slug = slug;
  pageState.editMode = false;
  pageState.searchTerm = "";
  pageState.dirty = false;
  pageState.dirtyCells.clear();

  setActiveNav(slug);
  root.innerHTML = `<div class="loading-state panel">Loading ${slug}...</div>`;

  try {
    const sheetData = await loadSheetData(slug);
    pageState.sheetData = sheetData;
    renderSheetPage(root);
    document.title = `${sheetData.title} | ${SITE_TITLE}`;
  } catch (error) {
    root.innerHTML = `
      <div class="error-state panel">
        <h2>Could not load sheet</h2>
        <p>${error.message}</p>
      </div>
    `;
  }
}

async function initHomePage() {
  const cardsRoot = document.getElementById("cards-root");
  const statsRoot = document.getElementById("stats-root");
  const pagesPanel = document.getElementById("pages-panel");
  if (!cardsRoot || !statsRoot) return;

  if (!window.GoogleDriveSync?.isSignedIn()) {
    statsRoot.innerHTML = "";
    cardsRoot.innerHTML = "";
    pagesPanel?.classList.add("hidden");
    return;
  }

  pagesPanel?.classList.remove("hidden");
  statsRoot.innerHTML = `
      <div class="stat-card">
        <div class="label">Status</div>
        <div class="value value-small">Loading your pages...</div>
      </div>
    `;
  cardsRoot.innerHTML = `<div class="loading-state panel">Loading pages...</div>`;
  const lastUpdated = document.getElementById("last-updated");
  if (lastUpdated) {
    lastUpdated.textContent = "Loading...";
  }

  try {
    const manifest = await fetchJson("data/manifest.json");
    const storageLabel = "Google Sheet";
    if (lastUpdated) {
      lastUpdated.textContent = manifest.updatedAt;
    }

    statsRoot.innerHTML = `
      <div class="stat-card">
        <div class="label">Total Sheets</div>
        <div class="value">${manifest.sheets.length}</div>
      </div>
      <div class="stat-card">
        <div class="label">Storage</div>
        <div class="value value-small">${storageLabel}</div>
      </div>
      <div class="stat-card">
        <div class="label">Last Updated</div>
        <div class="value value-small">${manifest.updatedAt}</div>
      </div>
    `;

    cardsRoot.innerHTML = manifest.sheets
      .map((sheet) => {
        const icon = ICONS[sheet.icon] || "TJ";
        return `
          <a class="sheet-card" href="pages/${sheet.slug}.html">
            <div class="sheet-card-head">
              <div class="icon">${icon}</div>
              <span class="sheet-open-pill">Open</span>
            </div>
            <h3>${sheet.title}</h3>
            <p>Open this journal page to view and edit its full data.</p>
          </a>
        `;
      })
      .join("");
  } catch (error) {
    pagesPanel?.classList.remove("hidden");
    cardsRoot.innerHTML = `
      <div class="error-state panel">
        <h2>Website data not found</h2>
        <p>${error.message}</p>
      </div>
    `;
  }
}

async function bootstrapApp(startFn) {
  const authRoot = document.getElementById("auth-root");
  ensureFooter();
  if (window.GoogleDriveSync) {
    await GoogleDriveSync.initialize();
    GoogleDriveSync.renderAuthUI(authRoot);
  }

  window.addEventListener("tradingjournal:sync", syncCurrentSheet);

  await startFn();
}

window.TradingJournal = {
  initSheetPage: (slug) => bootstrapApp(() => initSheetPage(slug)),
  initHomePage: () => bootstrapApp(initHomePage),
  ICONS,
};
