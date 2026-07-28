import { app, BrowserWindow, screen } from "electron";
import { join } from "node:path";
import { cleanupOldTempConfigs } from "./configWriter";
import { registerIpcHandlers } from "./ipcHandlers";
import { initializeUpdateManager } from "./updateManager";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.min(workArea.width, Math.max(1180, Math.floor(workArea.width * 0.94)));
  const height = Math.min(workArea.height, Math.max(820, Math.floor(workArea.height * 0.92)));
  const x = workArea.x + Math.floor((workArea.width - width) / 2);
  const y = workArea.y + Math.floor((workArea.height - height) / 2);

  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: 860,
    minHeight: 620,
    title: "CodeBundle",
    backgroundColor: "#f7f8fb",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();
  void cleanupOldTempConfigs();
  createWindow();
  const updates = initializeUpdateManager({
    isPackaged: app.isPackaged,
    getWindows: () => BrowserWindow.getAllWindows()
  });
  updates.scheduleStartupCheck();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
