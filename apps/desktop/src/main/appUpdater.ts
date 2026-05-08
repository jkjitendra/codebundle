import { app, dialog, type BrowserWindow } from "electron";
import electronLog from "electron-log";
import electronUpdater, { type AppUpdater } from "electron-updater";

const { autoUpdater } = electronUpdater;

type MainWindowGetter = () => BrowserWindow | null;

function showDownloadedDialog(getMainWindow: MainWindowGetter, updater: AppUpdater): void {
  const mainWindow = getMainWindow();
  const options = {
    type: "info" as const,
    buttons: ["Restart now", "Later"],
    defaultId: 0,
    cancelId: 1,
    title: "Update ready",
    message: "A CodeBundle update has been downloaded.",
    detail: "Restart CodeBundle now to install the update, or install it automatically when you quit the app."
  };

  const prompt = mainWindow
    ? dialog.showMessageBox(mainWindow, options)
    : dialog.showMessageBox(options);

  void prompt
    .then(({ response }) => {
      if (response === 0) {
        updater.quitAndInstall();
      }
    })
    .catch((error: unknown) => {
      electronLog.error("Failed to show update downloaded dialog", error);
    });
}

export function setupAutoUpdater(getMainWindow: MainWindowGetter): void {
  if (!app.isPackaged) {
    electronLog.info("Auto-update skipped in development mode.");
    return;
  }

  autoUpdater.logger = electronLog;
  electronLog.transports.file.level = "info";
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    electronLog.info("Checking for CodeBundle updates.");
  });

  autoUpdater.on("update-available", (info) => {
    electronLog.info("CodeBundle update available.", info);
  });

  autoUpdater.on("update-not-available", (info) => {
    electronLog.info("No CodeBundle update available.", info);
  });

  autoUpdater.on("download-progress", (progress) => {
    electronLog.info(
      `CodeBundle update download ${progress.percent.toFixed(1)}% ` +
      `(${progress.transferred}/${progress.total} bytes at ${progress.bytesPerSecond} B/s).`
    );
  });

  autoUpdater.on("update-downloaded", (info) => {
    electronLog.info("CodeBundle update downloaded.", info);
    showDownloadedDialog(getMainWindow, autoUpdater);
  });

  autoUpdater.on("error", (error) => {
    electronLog.error("CodeBundle auto-update error.", error);
  });

  void autoUpdater.checkForUpdates().catch((error: unknown) => {
    electronLog.error("CodeBundle update check failed.", error);
  });
}
