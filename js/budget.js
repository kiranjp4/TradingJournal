const BudgetPlanner = (() => {
  const STORAGE_KEY = "tradingjournal-kjp:budget-fy2026-27";
  const FY_MONTHS = [
    "Apr-26",
    "May-26",
    "Jun-26",
    "Jul-26",
    "Aug-26",
    "Sep-26",
    "Oct-26",
    "Nov-26",
    "Dec-26",
    "Jan-27",
    "Feb-27",
    "Mar-27",
  ];

  let plan = null;
  let spent = {};

  function formatINR(value) {
    return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }

  function loadSpent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  function saveSpent() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(spent));
  }

  function getCategorySpent(categoryId) {
    const months = spent[categoryId] || {};
    return FY_MONTHS.reduce((sum, month) => sum + (Number(months[month]) || 0), 0);
  }

  function getTotalSpent() {
    return plan.categories.reduce((sum, cat) => sum + getCategorySpent(cat.id), 0);
  }

  function getMonthTotal(month) {
    return plan.categories.reduce((sum, cat) => {
      const months = spent[cat.id] || {};
      return sum + (Number(months[month]) || 0);
    }, 0);
  }

  function progressClass(used, limit) {
    if (!limit) return "";
    const ratio = used / limit;
    if (ratio >= 1) return "budget-danger";
    if (ratio >= 0.8) return "budget-warning";
    return "budget-ok";
  }

  function renderSummary(container) {
    const totalSpent = getTotalSpent();
    const remaining = plan.totalAnnualLimit - totalSpent;
    const monthIndex = new Date().getMonth();
    const fyMonth = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2].indexOf(monthIndex);
    const currentMonth = fyMonth >= 0 ? FY_MONTHS[fyMonth] : FY_MONTHS[0];
    const monthSpent = getMonthTotal(currentMonth);

    container.innerHTML = `
      <section class="stats-grid budget-stats">
        <div class="stat-card">
          <div class="label">FY Annual Limit</div>
          <div class="value value-small">${formatINR(plan.totalAnnualLimit)}</div>
        </div>
        <div class="stat-card">
          <div class="label">Spent YTD</div>
          <div class="value value-small ${progressClass(totalSpent, plan.totalAnnualLimit)}">${formatINR(totalSpent)}</div>
        </div>
        <div class="stat-card">
          <div class="label">Remaining</div>
          <div class="value value-small">${formatINR(remaining)}</div>
        </div>
        <div class="stat-card">
          <div class="label">Monthly Limit</div>
          <div class="value value-small">${formatINR(plan.totalMonthlyLimit)}</div>
        </div>
        <div class="stat-card">
          <div class="label">This Month (${currentMonth})</div>
          <div class="value value-small ${progressClass(monthSpent, plan.totalMonthlyLimit)}">${formatINR(monthSpent)}</div>
        </div>
        <div class="stat-card">
          <div class="label">6-Year Avg / Year</div>
          <div class="value value-small">${formatINR(plan.sixYearAvgAnnual)}</div>
        </div>
      </section>
    `;
  }

  function renderRules(container) {
    container.innerHTML = `
      <div class="panel budget-rules">
        <h2>Spending Rules for FY 2026-27</h2>
        <ul>${plan.rules.map((rule) => `<li>${rule}</li>`).join("")}</ul>
        <p class="budget-note">${plan.optimizationTarget}</p>
      </div>
    `;
  }

  function renderCategoryTable(container) {
    const rows = plan.categories
      .map((cat) => {
        const used = getCategorySpent(cat.id);
        const pct = cat.annualLimit ? Math.min((used / cat.annualLimit) * 100, 999) : 0;
        return `
          <tr>
            <td>
              <strong>${cat.name}</strong>
              <div class="budget-priority">${cat.priority}</div>
            </td>
            <td>${formatINR(cat.annualLimit)}</td>
            <td>${formatINR(cat.monthlyLimit)}</td>
            <td>${formatINR(cat.sixYearAvg)}</td>
            <td class="${progressClass(used, cat.annualLimit)}">${formatINR(used)}</td>
            <td>${formatINR(cat.annualLimit - used)}</td>
            <td>
              <div class="budget-bar-wrap">
                <div class="budget-bar ${progressClass(used, cat.annualLimit)}" style="width:${Math.min(pct, 100)}%"></div>
              </div>
              <span class="budget-pct">${pct.toFixed(0)}%</span>
            </td>
            <td class="budget-note-cell">${cat.note}</td>
          </tr>
        `;
      })
      .join("");

    container.innerHTML = `
      <div class="panel">
        <h2>Category Limits — FY 2026-27</h2>
        <div class="table-wrap">
          <table class="data-table budget-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Annual Limit</th>
                <th>Monthly Limit</th>
                <th>6-Yr Avg</th>
                <th>Spent YTD</th>
                <th>Remaining</th>
                <th>Progress</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderMonthlyTracker(container) {
    const headerMonths = FY_MONTHS.map((m) => `<th>${m}</th>`).join("");
    const rows = plan.categories
      .map((cat) => {
        const monthCells = FY_MONTHS.map((month) => {
          const value = (spent[cat.id] && spent[cat.id][month]) || "";
          return `
            <td>
              <input
                class="budget-input"
                type="number"
                min="0"
                step="100"
                data-category="${cat.id}"
                data-month="${month}"
                value="${value}"
                placeholder="0"
              />
            </td>
          `;
        }).join("");
        const rowTotal = getCategorySpent(cat.id);
        return `
          <tr>
            <td><strong>${cat.name}</strong></td>
            ${monthCells}
            <td class="${progressClass(rowTotal, cat.annualLimit)}">${formatINR(rowTotal)}</td>
          </tr>
        `;
      })
      .join("");

    const monthTotals = FY_MONTHS.map((month) => {
      const total = getMonthTotal(month);
      return `<td class="${progressClass(total, plan.totalMonthlyLimit)}">${formatINR(total)}</td>`;
    }).join("");

    container.innerHTML = `
      <div class="panel">
        <div class="budget-toolbar">
          <h2>Monthly Tracker</h2>
          <div class="toolbar-actions">
            <button class="button button-primary" type="button" data-action="save-budget">Save</button>
            <button class="button" type="button" data-action="export-budget">Export CSV</button>
            <button class="button button-danger" type="button" data-action="reset-budget">Reset All</button>
          </div>
        </div>
        <p class="budget-note">Enter what you actually spent on your credit card each month. Data saves in your browser.</p>
        <div class="table-wrap">
          <table class="data-table budget-tracker">
            <thead>
              <tr>
                <th>Category</th>
                ${headerMonths}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <th>Month Total</th>
                ${monthTotals}
                <th class="${progressClass(getTotalSpent(), plan.totalAnnualLimit)}">${formatINR(getTotalSpent())}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;

    container.querySelector('[data-action="save-budget"]')?.addEventListener("click", () => {
      readInputs(container);
      saveSpent();
      draw();
      alert("Budget tracker saved.");
    });

    container.querySelector('[data-action="reset-budget"]')?.addEventListener("click", () => {
      if (!window.confirm("Clear all tracked spending for FY 2026-27?")) return;
      spent = {};
      saveSpent();
      draw();
    });

    container.querySelector('[data-action="export-budget"]')?.addEventListener("click", exportCsv);
  }

  function readInputs(container) {
    container.querySelectorAll(".budget-input").forEach((input) => {
      const categoryId = input.dataset.category;
      const month = input.dataset.month;
      const value = Number(input.value) || 0;
      if (!spent[categoryId]) spent[categoryId] = {};
      if (value > 0) {
        spent[categoryId][month] = value;
      } else {
        delete spent[categoryId][month];
      }
    });
  }

  function exportCsv() {
    const lines = ["Category," + FY_MONTHS.join(",") + ",Total"];
    plan.categories.forEach((cat) => {
      const months = FY_MONTHS.map((month) => (spent[cat.id] && spent[cat.id][month]) || 0);
      const total = months.reduce((sum, n) => sum + Number(n), 0);
      lines.push([cat.name, ...months, total].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "budget-tracker-fy2026-27.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function draw() {
    const summary = document.getElementById("budget-summary");
    const rules = document.getElementById("budget-rules");
    const categories = document.getElementById("budget-categories");
    const tracker = document.getElementById("budget-tracker");
    if (!summary || !plan) return;

    renderSummary(summary);
    renderRules(rules);
    renderCategoryTable(categories);
    renderMonthlyTracker(tracker);
  }

  async function init() {
    const root = document.getElementById("budget-root");
    if (!root) return;

    root.innerHTML = `<div class="loading-state panel">Loading budget plan...</div>`;

    try {
      plan = await fetch("../data/budget-plan-fy2026-27.json").then((res) => {
        if (!res.ok) throw new Error("Could not load budget plan");
        return res.json();
      });
      spent = loadSpent();
      root.innerHTML = `
        <div class="page-toolbar">
          <div class="page-title-wrap">
            <h1>Credit Card Budget Planner</h1>
            <p class="page-subtitle">${plan.fy} (${plan.period}) — based on your 6-year statement analysis</p>
          </div>
        </div>
        <div id="budget-summary"></div>
        <div id="budget-rules"></div>
        <div id="budget-categories"></div>
        <div id="budget-tracker"></div>
      `;
      draw();
      document.title = `Budget Planner ${plan.fy} | Trading Journal - KJP`;
    } catch (error) {
      root.innerHTML = `
        <div class="error-state panel">
          <h2>Could not load budget planner</h2>
          <p>${error.message}</p>
        </div>
      `;
    }
  }

  return { init };
})();

window.BudgetPlanner = BudgetPlanner;
