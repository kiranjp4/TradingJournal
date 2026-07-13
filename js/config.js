// One-time setup for live Google Sheets sync:
// 1. Go to https://console.cloud.google.com/
// 2. Create (or reuse) a project, e.g. "Trading Journal KJP".
// 3. Enable the "Google Sheets API" for that project.
// 4. Go to APIs & Services -> Credentials -> Create Credentials -> OAuth client ID.
// 5. Application type: Web application.
// 6. Authorized JavaScript origins:
//    - https://kiranjp4.github.io
//    - http://localhost:5500   (optional, for local testing)
// 7. Copy the Client ID and paste it below as googleClientId.
// 8. Open your Google Sheet (Daily_Update) in the browser. Copy the ID from
//    the URL: https://docs.google.com/spreadsheets/d/THIS_PART_IS_THE_ID/edit
// 9. Paste that ID below as googleSheetId.
//
// Notes:
// - Each website page is mapped to a tab name inside your Sheet (see
//   SHEET_META in js/googledrive.js). If any of your tab names are
//   different, add an override below in sheetTabOverrides.
// - Editing a cell on the website and pressing "Save" (or "Sync Now")
//   writes ONLY that changed cell back to your Google Sheet, so formulas
//   in other cells are never overwritten.

window.TRADING_JOURNAL_CONFIG = {
  // Temporary preview mode: set to false to re-enable Google sign-in.
  disableLogin: true,
  googleClientId: "708905534457-c606sq3fk1ucfp4qs1mes26gcfnupv5c.apps.googleusercontent.com",
  googleSheetId: "1Xnra2-5yR_3Lv7geblDnku2tsemV6MyUeoLYHx_u7kE",
  sheetTabOverrides: {
    // "net-pnl-jp": "Your_Actual_Tab_Name",
  },
};
