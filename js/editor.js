const SheetEditor = (() => {
  function buildToolbar(sheetData, slug, editable) {
    const editControls = editable
      ? `
        <button class="button button-primary" type="button" data-action="add-row">+ Add Row</button>
        <button class="button button-success" type="button" data-action="save-sheet">Save Changes</button>
        <span class="save-status" data-save-status></span>
      `
      : `<span class="chip-link">Login to edit this sheet</span>`;

    return `
      <div class="page-toolbar">
        <div>
          <h1>${sheetData.title}</h1>
          <div class="meta-bar">
            <span>${sheetData.rowCount} rows</span>
            <span>${sheetData.colCount} columns</span>
            <span>Updated: ${sheetData.updatedAt}</span>
            <span>Source: ${sheetData.source === "supabase" ? "Live database" : "Excel export"}</span>
            <span data-filter-count>Showing: ${sheetData.rowCount} rows</span>
          </div>
        </div>
        <div class="toolbar-actions">
          <input class="search-input" type="search" placeholder="Search in this sheet..." />
          ${editControls}
          <a class="button" href="../index.html">Back to Home</a>
        </div>
      </div>
    `;
  }

  function renderTableBody(tbody, rows, colCount, editable, rowIdPrefix = "row") {
    tbody.innerHTML = "";
    rows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      tr.dataset.rowIndex = String(rowIndex);

      if (editable) {
        const actionTd = document.createElement("td");
        actionTd.className = "action-cell";
        actionTd.innerHTML = `<button class="button button-danger button-small" type="button" data-action="delete-row" data-row-index="${rowIndex}">Delete</button>`;
        tr.appendChild(actionTd);
      }

      for (let col = 0; col < colCount; col += 1) {
        const td = document.createElement("td");
        const value = row[col];
        if (editable) {
          td.contentEditable = "true";
          td.dataset.colIndex = String(col);
          td.className = "editable-cell";
          td.textContent = value === null || value === undefined ? "" : String(value);
        } else {
          const formatted = TradingJournal.formatCellValue(value);
          td.textContent = formatted.display;
          td.className = formatted.className;
        }
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    });
  }

  function readTableState(table, colCount, editable) {
    const rows = [];
    table.querySelectorAll("tbody tr").forEach((tr) => {
      const row = Array.from({ length: colCount }, () => null);
      tr.querySelectorAll("td").forEach((td) => {
        if (td.dataset.colIndex !== undefined) {
          const index = Number(td.dataset.colIndex);
          const text = td.textContent.trim();
          row[index] = text === "" ? null : text;
        }
      });
      rows.push(row);
    });
    return rows;
  }

  function applySearch(table, searchTerm) {
    const normalized = searchTerm.trim().toLowerCase();
    let visible = 0;
    table.querySelectorAll("tbody tr").forEach((tr) => {
      const text = tr.textContent.toLowerCase();
      const show = !normalized || text.includes(normalized);
      tr.style.display = show ? "" : "none";
      if (show) visible += 1;
    });
    return visible;
  }

  function mount(container, sheetData, slug, options = {}) {
    const editable = Boolean(options.editable);
    const onSave = options.onSave;
    let state = structuredClone(sheetData);
    let searchTerm = "";

    function draw() {
      const table = document.createElement("table");
      table.className = "data-table";
      if (editable) table.classList.add("editable-table");

      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      if (editable) {
        const actionTh = document.createElement("th");
        actionTh.textContent = "Actions";
        headerRow.appendChild(actionTh);
      }
      for (let col = 0; col < state.colCount; col += 1) {
        const th = document.createElement("th");
        th.textContent = TradingJournal.columnName(col);
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      renderTableBody(tbody, state.cells, state.colCount, editable);
      table.appendChild(tbody);

      container.innerHTML = `${buildToolbar(state, slug, editable)}<div class="panel"><div class="table-wrap"></div></div>`;
      container.querySelector(".table-wrap").appendChild(table);

      const filterCount = container.querySelector("[data-filter-count]");
      const visible = applySearch(table, searchTerm);
      if (filterCount) filterCount.textContent = `Showing: ${visible} rows`;

      const searchInput = container.querySelector(".search-input");
      searchInput.value = searchTerm;
      searchInput.addEventListener("input", (event) => {
        searchTerm = event.target.value;
        const count = applySearch(table, searchTerm);
        if (filterCount) filterCount.textContent = `Showing: ${count} rows`;
      });

      if (!editable) return;

      container.querySelector('[data-action="add-row"]')?.addEventListener("click", () => {
        const newRow = Array.from({ length: state.colCount }, () => null);
        state.cells.push(newRow);
        state.rowCount = state.cells.length;
        draw();
      });

      container.querySelector('[data-action="save-sheet"]')?.addEventListener("click", async () => {
        const status = container.querySelector("[data-save-status]");
        const currentTable = container.querySelector(".data-table");
        state.cells = readTableState(currentTable, state.colCount, true);
        state.rowCount = state.cells.length;
        state.colCount = SupabaseApp.computeColCount(state.cells);

        try {
          status.textContent = "Saving...";
          status.className = "save-status saving";
          const saved = await onSave(state);
          state = structuredClone(saved);
          status.textContent = "Saved successfully";
          status.className = "save-status success";
          draw();
        } catch (error) {
          status.textContent = error.message;
          status.className = "save-status error";
        }
      });

      container.querySelectorAll('[data-action="delete-row"]').forEach((button) => {
        button.addEventListener("click", () => {
          const index = Number(button.dataset.rowIndex);
          state.cells.splice(index, 1);
          state.rowCount = state.cells.length;
          draw();
        });
      });
    }

    draw();
    return {
      refresh(nextState) {
        state = structuredClone(nextState);
        draw();
      },
    };
  }

  return { mount };
})();

window.SheetEditor = SheetEditor;
