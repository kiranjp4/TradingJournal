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
};

function formatCellValue(value) {
  if (value === null || value === undefined || value === "") {
    return { display: "", className: "empty", raw: "" };
  }

  const text = String(value).trim();
  if (text === "") {
    return { display: "", className: "empty", raw: "" };
  }

  const numeric = Number(text);
  if (!Number.isNaN(numeric) && text !== "") {
    if (numeric > 40000 && numeric < 60000 && !text.includes(".")) {
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
  };
}

async function loadSheetData(slug) {
  if (window.GoogleDriveSync?.isSignedIn()) {
    pageState.storageMode = "googledrive";
    return normalizeSheetData(await GoogleDriveSync.syncSheetFromCloud(slug, fetchJson));
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
  if (pageState.storageMode === "googledrive") return "Saved in Google Drive";
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
  footer.innerHTML = "<p>Trading Journal - KJP | Google Drive Cloud + GitHub Pages</p>";
  document.body.appendChild(footer);
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
  renderSheetPage(document.getElementById("sheet-root"));
}

function addRow() {
  const { sheetData } = pageState;
  const newRow = Array.from({ length: sheetData.colCount }, () => "");
  sheetData.cells.push(newRow);
  sheetData.rowCount = sheetData.cells.length;
  pageState.dirty = true;
  renderSheetPage(document.getElementById("sheet-root"));
}

function deleteRow(rowIndex) {
  const { sheetData } = pageState;
  sheetData.cells.splice(rowIndex, 1);
  sheetData.rowCount = sheetData.cells.length;
  pageState.dirty = true;
  renderSheetPage(document.getElementById("sheet-root"));
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
      pageState.sheetData = await GoogleDriveSync.saveSheet(pageState.slug, pageState.sheetData);
      pageState.storageMode = "googledrive";
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

function exportCurrentSheet() {
  const blob = new Blob([JSON.stringify(pageState.sheetData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${pageState.slug}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importSheetFromFile(file) {
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const imported = normalizeSheetData(JSON.parse(event.target.result));
      pageState.sheetData = imported;
      await saveCurrentSheet();
    } catch (error) {
      alert("Could not import file. Please choose a valid JSON backup.");
    }
  };
  reader.readAsText(file);
}

async function resetToExcel() {
  const confirmed = window.confirm(
    "This will remove your saved edits for this sheet and reload the original Excel import. Continue?"
  );
  if (!confirmed) return;

  clearStorage(pageState.slug);
  pageState.dirty = false;

  if (window.GoogleDriveSync?.isSignedIn()) {
    const fresh = normalizeSheetData(await fetchJson(`../data/${pageState.slug}.json`));
    pageState.sheetData = await GoogleDriveSync.saveSheet(pageState.slug, fresh);
    pageState.storageMode = "googledrive";
  } else {
    pageState.sheetData = normalizeSheetData(await fetchJson(`../data/${pageState.slug}.json`));
    pageState.storageMode = "bundled";
  }

  renderSheetPage(document.getElementById("sheet-root"));
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

      if (editMode) {
        const input = document.createElement("input");
        input.className = "cell-input";
        input.value = rawValue;
        input.addEventListener("change", (event) => {
          updateCell(rowIndex, col, event.target.value);
        });
        td.appendChild(input);
      } else {
        const formatted = formatCellValue(rawValue);
        td.textContent = formatted.display;
        td.className = formatted.className;
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
        <button class="button" type="button" data-action="export">Export JSON</button>
        <button class="button" type="button" data-action="import">Import JSON</button>
        <button class="button" type="button" data-action="reset">Reset to Excel</button>
        <a class="button" href="../index.html">Back to Home</a>
        <input class="import-input" type="file" accept="application/json,.json" data-action="import-file" />
      </div>
    </div>
    <div class="edit-banner">
      <p>
        ${
          editMode
            ? GoogleDriveSync?.isSignedIn()
              ? "Edit mode is on. Click Save to store changes in your Google Drive cloud folder."
              : "Edit mode is on. Sign in with Google to save edits everywhere via Google Drive."
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
  container.querySelector('[data-action="export"]').addEventListener("click", exportCurrentSheet);
  container.querySelector('[data-action="reset"]').addEventListener("click", resetToExcel);

  const importInput = container.querySelector('[data-action="import-file"]');
  container.querySelector('[data-action="import"]').addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) importSheetFromFile(file);
    event.target.value = "";
  });
}

async function initSheetPage(slug) {
  const root = document.getElementById("sheet-root");
  if (!root) return;

  pageState.slug = slug;
  pageState.editMode = false;
  pageState.searchTerm = "";
  pageState.dirty = false;

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
  if (!cardsRoot || !statsRoot) return;

  try {
    let manifest;
    let storageLabel = "Excel import";

    if (window.GoogleDriveSync?.isSignedIn()) {
      manifest = await GoogleDriveSync.loadManifest();
      if (!manifest) {
        const seeded = await GoogleDriveSync.seedFromBundledData((path) => fetchJson(path));
        manifest = seeded.manifest;
      }
      storageLabel = "Google Drive";
    } else {
      manifest = await fetchJson("data/manifest.json");
    }

    document.getElementById("last-updated").textContent = manifest.updatedAt;

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

  window.addEventListener("tradingjournal:sync", async () => {
    if (pageState.slug) {
      pageState.sheetData = await loadSheetData(pageState.slug);
      pageState.dirty = false;
      renderSheetPage(document.getElementById("sheet-root"));
    } else {
      await initHomePage();
    }
  });

  await startFn();
}

window.TradingJournal = {
  initSheetPage: (slug) => bootstrapApp(() => initSheetPage(slug)),
  initHomePage: () => bootstrapApp(initHomePage),
  ICONS,
};
