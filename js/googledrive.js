const GoogleDriveSync = (() => {
  const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
  const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
  const SCOPE = "https://www.googleapis.com/auth/drive.file";

  let accessToken = null;
  let tokenClient = null;
  let rootFolderId = null;
  let dataFolderId = null;
  let signInPromise = null;

  function getConfig() {
    return window.TRADING_JOURNAL_CONFIG || {};
  }

  function getFolderName() {
    return getConfig().driveFolder || "TradingJournal-KJP";
  }

  function isConfigured() {
    const clientId = getConfig().googleClientId || "";
    return clientId && !clientId.includes("PASTE_YOUR_GOOGLE_CLIENT_ID");
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
      rootFolderId = null;
      dataFolderId = null;
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
    rootFolderId = null;
    dataFolderId = null;
    sessionStorage.removeItem("tradingjournal-google-token");
  }

  async function driveFetch(url, options = {}) {
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

  async function findFolderByName(name, parentId = null) {
    const parentQuery = parentId ? `'${parentId}' in parents and ` : "'root' in parents and ";
    const query = `${parentQuery}name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const response = await driveFetch(
      `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Could not search Google Drive: ${errorText}`);
    }

    const data = await response.json();
    return data.files?.[0] || null;
  }

  async function createFolder(name, parentId = null) {
    const metadata = {
      name,
      mimeType: "application/vnd.google-apps.folder",
    };

    if (parentId) {
      metadata.parents = [parentId];
    }

    const response = await driveFetch(DRIVE_FILES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Could not create folder ${name}: ${errorText}`);
    }

    return response.json();
  }

  async function ensureDataFolder() {
    if (dataFolderId) return dataFolderId;

    const rootFolder = await findFolderByName(getFolderName());
    rootFolderId = rootFolder?.id || (await createFolder(getFolderName())).id;

    const dataFolder = await findFolderByName("data", rootFolderId);
    dataFolderId = dataFolder?.id || (await createFolder("data", rootFolderId)).id;

    return dataFolderId;
  }

  async function findFileByName(name, parentId) {
    const query = `name='${name}' and '${parentId}' in parents and trashed=false`;
    const response = await driveFetch(
      `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Could not search file ${name}: ${errorText}`);
    }

    const data = await response.json();
    return data.files?.[0] || null;
  }

  async function readJsonFile(fileName) {
    const parentId = await ensureDataFolder();
    const file = await findFileByName(fileName, parentId);
    if (!file) return null;

    const response = await driveFetch(`${DRIVE_FILES_URL}/${file.id}?alt=media`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Could not read ${fileName}: ${errorText}`);
    }

    return response.json();
  }

  async function writeJsonFile(fileName, data) {
    const parentId = await ensureDataFolder();
    const existing = await findFileByName(fileName, parentId);
    const body = JSON.stringify(data);

    if (existing) {
      const response = await driveFetch(`${DRIVE_UPLOAD_URL}/${existing.id}?uploadType=media`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Could not update ${fileName}: ${errorText}`);
      }

      return true;
    }

    const metadata = {
      name: fileName,
      parents: [parentId],
      mimeType: "application/json",
    };

    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([body], { type: "application/json" }));

    const response = await driveFetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Could not create ${fileName}: ${errorText}`);
    }

    return true;
  }

  async function loadManifest() {
    return readJsonFile("manifest.json");
  }

  async function saveManifest(manifest) {
    return writeJsonFile("manifest.json", manifest);
  }

  async function loadSheet(slug) {
    return readJsonFile(`${slug}.json`);
  }

  async function saveSheet(slug, sheetData) {
    const payload = {
      ...sheetData,
      updatedAt: new Date().toLocaleString("en-IN"),
      savedInCloud: true,
      cloudProvider: "Google Drive",
    };
    await writeJsonFile(`${slug}.json`, payload);
    return payload;
  }

  async function seedFromBundledData(fetchJson) {
    await ensureDataFolder();

    const existingManifest = await loadManifest();
    if (existingManifest) {
      return { seeded: false, manifest: existingManifest };
    }

    const manifest = await fetchJson("data/manifest.json");
    const sheets = [];

    for (const sheet of manifest.sheets) {
      const bundled = await fetchJson(`data/${sheet.slug}.json`);
      await writeJsonFile(`${sheet.slug}.json`, {
        ...bundled,
        savedInCloud: true,
        cloudProvider: "Google Drive",
      });
      sheets.push(sheet);
    }

    const cloudManifest = {
      ...manifest,
      updatedAt: new Date().toLocaleString("en-IN"),
      storage: "Google Drive",
      folder: getFolderName(),
      sheets,
    };

    await saveManifest(cloudManifest);
    return { seeded: true, manifest: cloudManifest };
  }

  async function syncSheetFromCloud(slug, fetchBundledJson) {
    const cloudSheet = await loadSheet(slug);
    if (cloudSheet) return cloudSheet;
    return fetchBundledJson(`../data/${slug}.json`);
  }

  function getHomeHref() {
    return window.location.pathname.includes("/pages/") ? "../index.html" : "index.html";
  }

  function renderAuthUI(container) {
    if (!container) return;

    if (!isConfigured()) {
      container.innerHTML = `
        <div class="auth-panel warning">
          <span>Google Drive not configured yet</span>
          <a class="button" href="${getHomeHref()}#setup">Setup guide</a>
        </div>
      `;
      return;
    }

    if (isSignedIn()) {
      container.innerHTML = `
        <div class="auth-panel connected">
          <span class="auth-user">Signed in to Google Drive</span>
          <span class="auth-cloud">Cloud: Google Drive</span>
          <button class="button" type="button" data-auth-action="sync">Sync Now</button>
          <button class="button" type="button" data-auth-action="signout">Sign Out</button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="auth-panel">
          <span>Sign in to save edits everywhere via Google Drive</span>
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
    loadManifest,
    saveManifest,
    loadSheet,
    saveSheet,
    seedFromBundledData,
    syncSheetFromCloud,
    renderAuthUI,
    getFolderName,
  };
})();

window.GoogleDriveSync = GoogleDriveSync;
