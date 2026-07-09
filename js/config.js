// One-time setup:
// 1. Go to https://console.cloud.google.com/
// 2. Create a project named "Trading Journal KJP"
// 3. Enable "Google Drive API"
// 4. Go to APIs & Services -> Credentials -> Create Credentials -> OAuth client ID
// 5. Application type: Web application
// 6. Authorized JavaScript origins:
//    - https://kiranjp4.github.io
//    - http://localhost:5500   (optional, for local testing)
// 7. Copy the Client ID and paste it below.

window.TRADING_JOURNAL_CONFIG = {
  googleClientId: "708905534457-c606sq3fk1ucfp4qs1mes26gcfnupv5c.apps.googleusercontent.com",
  driveFolder: "TradingJournal-KJP",
};
