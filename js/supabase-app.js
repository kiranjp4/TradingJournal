const SupabaseApp = (() => {
  let client = null;
  let currentUser = null;
  const listeners = new Set();

  function isConfigured() {
    const config = window.SUPABASE_CONFIG || {};
    return Boolean(config.url && config.anonKey && !config.url.includes("YOUR_PROJECT"));
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (!client) {
      client = window.supabase.createClient(
        window.SUPABASE_CONFIG.url,
        window.SUPABASE_CONFIG.anonKey
      );
    }
    return client;
  }

  function notify() {
    listeners.forEach((listener) => listener(currentUser));
  }

  async function init() {
    const supabase = getClient();
    if (!supabase) return null;

    const { data } = await supabase.auth.getSession();
    currentUser = data.session?.user ?? null;
    notify();

    supabase.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user ?? null;
      notify();
    });

    return currentUser;
  }

  function onAuthChange(listener) {
    listeners.add(listener);
    listener(currentUser);
    return () => listeners.delete(listener);
  }

  function getUser() {
    return currentUser;
  }

  async function signUp(email, password) {
    const supabase = getClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }

  async function signIn(email, password) {
    const supabase = getClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    notify();
    return data;
  }

  async function signOut() {
    const supabase = getClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    currentUser = null;
    notify();
  }

  function normalizeCells(cells, colCount) {
    return Array.from({ length: colCount }, (_, index) => {
      const value = cells[index];
      if (value === null || value === undefined) return null;
      const text = String(value).trim();
      return text === "" ? null : value;
    });
  }

  function computeColCount(rows) {
    let maxCol = 0;
    rows.forEach((row) => {
      for (let i = row.length - 1; i >= 0; i -= 1) {
        const value = row[i];
        if (value !== null && value !== undefined && String(value).trim() !== "") {
          maxCol = Math.max(maxCol, i + 1);
          break;
        }
      }
    });
    return Math.max(maxCol, 1);
  }

  async function fetchManifest() {
    const supabase = getClient();
    const { data: sheets, error } = await supabase
      .from("journal_sheets")
      .select("slug, title, sheet_name, icon, col_count, updated_at")
      .order("slug");

    if (error) throw error;

    const manifestSheets = await Promise.all(
      (sheets || []).map(async (sheet) => {
        const { count, error: countError } = await supabase
          .from("journal_rows")
          .select("*", { count: "exact", head: true })
          .eq("sheet_slug", sheet.slug);
        if (countError) throw countError;

        return {
          slug: sheet.slug,
          title: sheet.title,
          sheetName: sheet.sheet_name,
          icon: sheet.icon,
          rowCount: count || 0,
          colCount: sheet.col_count,
          updatedAt: sheet.updated_at,
          dataFile: `data/${sheet.slug}.json`,
        };
      })
    );

    const latest = manifestSheets
      .map((sheet) => sheet.updatedAt)
      .filter(Boolean)
      .sort()
      .reverse()[0];

    return {
      sourceFile: "Supabase Database",
      updatedAt: latest ? new Date(latest).toLocaleString("en-IN") : "Not updated yet",
      sheets: manifestSheets,
    };
  }

  async function fetchSheet(slug) {
    const supabase = getClient();

    const { data: sheet, error: sheetError } = await supabase
      .from("journal_sheets")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (sheetError) throw sheetError;
    if (!sheet) return null;

    const { data: rows, error: rowsError } = await supabase
      .from("journal_rows")
      .select("row_index, cells")
      .eq("sheet_slug", slug)
      .order("row_index");

    if (rowsError) throw rowsError;

    const cells = (rows || []).map((row) => row.cells || []);
    const colCount = sheet.col_count || computeColCount(cells);

    return {
      sheetName: sheet.sheet_name,
      slug: sheet.slug,
      title: sheet.title,
      icon: sheet.icon,
      updatedAt: new Date(sheet.updated_at).toLocaleString("en-IN"),
      rowCount: cells.length,
      colCount,
      cells,
      source: "supabase",
    };
  }

  async function saveSheet(slug, sheetData) {
    const supabase = getClient();
    const colCount = sheetData.colCount || computeColCount(sheetData.cells);
    const now = new Date().toISOString();

    const { error: sheetError } = await supabase.from("journal_sheets").upsert({
      slug,
      title: sheetData.title,
      sheet_name: sheetData.sheetName,
      icon: sheetData.icon || "book",
      col_count: colCount,
      updated_at: now,
    });
    if (sheetError) throw sheetError;

    const { error: deleteError } = await supabase.from("journal_rows").delete().eq("sheet_slug", slug);
    if (deleteError) throw deleteError;

    const payload = sheetData.cells.map((row, index) => ({
      sheet_slug: slug,
      row_index: index,
      cells: normalizeCells(row, colCount),
      updated_at: now,
    }));

    if (payload.length > 0) {
      const { error: insertError } = await supabase.from("journal_rows").insert(payload);
      if (insertError) throw insertError;
    }

    return fetchSheet(slug);
  }

  async function importFromLocalJson(fetchJson) {
    const manifest = await fetchJson("data/manifest.json");
    const results = [];

    for (const sheet of manifest.sheets) {
      const sheetData = await fetchJson(`data/${sheet.slug}.json`);
      const saved = await saveSheet(sheet.slug, sheetData);
      results.push(saved.title);
    }

    return results;
  }

  return {
    isConfigured,
    init,
    onAuthChange,
    getUser,
    signUp,
    signIn,
    signOut,
    fetchManifest,
    fetchSheet,
    saveSheet,
    importFromLocalJson,
    computeColCount,
  };
})();

window.SupabaseApp = SupabaseApp;
