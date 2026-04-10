const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

// Set this to your deployed Vercel URL after deployment
const PROD_URL = "https://security-system-prmve40rm-ahmed28.vercel.app";

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "SecureWatch",
    // icon: path.join(__dirname, "public/icon.ico"),
    backgroundColor: "#111827",
  });

  win.setMenuBarVisibility(false);

  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    win.loadURL("http://localhost:3000");
    win.webContents.openDevTools();
  } else {
    // In production the Electron app loads the Vercel-hosted frontend.
    // This means no local build needed — always up to date.
    win.loadURL(PROD_URL);
  }

  // Open external links in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
