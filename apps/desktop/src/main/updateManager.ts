import electronLog from "electron-log";
import electronUpdater, { type AppUpdater } from "electron-updater";
import type { UpdateState } from "../shared/types";

type UpdateEvent = "checking-for-update" | "update-available" | "update-not-available" | "download-progress" | "update-downloaded" | "error";

export interface UpdaterInfo {
  version?: string;
  releaseName?: string;
  releaseDate?: string | Date;
}

export interface DownloadProgress {
  percent?: number;
}

export interface AutoUpdaterLike {
  autoDownload?: boolean;
  autoInstallOnAppQuit?: boolean;
  logger?: unknown;
  on: (event: UpdateEvent, listener: (value?: UpdaterInfo | DownloadProgress | Error) => void) => unknown;
  checkForUpdates: () => Promise<unknown>;
  quitAndInstall: () => void;
}

export interface UpdateWindow {
  webContents: { send: (channel: string, state: UpdateState) => void };
}

export interface UpdateLogger {
  info: (message: string) => void;
  error: (message: string) => void;
}

export interface UpdateManagerOptions {
  isPackaged: boolean;
  getWindows: () => UpdateWindow[];
  updater?: AutoUpdaterLike;
  logger?: UpdateLogger;
  now?: () => number;
}

const UNSUPPORTED_STATE: UpdateState = {
  status: "unsupported",
  message: "Updates are available only in packaged builds."
};

const IDLE_STATE: UpdateState = { status: "idle", message: "Check for updates when ready." };

export class UpdateManager {
  private state: UpdateState;
  private initialized = false;
  private checkInFlight = false;
  private readonly updater: AutoUpdaterLike;
  private readonly logger: UpdateLogger;
  private readonly now: () => number;

  constructor(private readonly options: UpdateManagerOptions) {
    this.state = options.isPackaged ? IDLE_STATE : UNSUPPORTED_STATE;
    this.updater = options.updater ?? (electronUpdater.autoUpdater as unknown as AutoUpdaterLike);
    this.logger = options.logger ?? {
      info: (message) => electronLog.info(message),
      error: (message) => electronLog.error(message)
    };
    this.now = options.now ?? Date.now;
  }

  initialize(): void {
    if (this.initialized || !this.options.isPackaged) return;
    this.initialized = true;
    this.updater.logger = electronLog;
    this.updater.autoDownload = true;
    // A downloaded update is installed only after the user chooses Restart.
    this.updater.autoInstallOnAppQuit = false;
    this.updater.on("checking-for-update", () => this.setState({ status: "checking", message: "Checking for updates…" }));
    this.updater.on("update-available", (value) => {
      const info = value as UpdaterInfo | undefined;
      this.logger.info(`CodeBundle update available: ${safeVersion(info?.version)}.`);
      this.setState({
        status: "available",
        message: info?.version ? `Update available: v${safeVersion(info.version)}` : "Update available.",
        version: safeOptionalText(info?.version),
        releaseName: safeOptionalText(info?.releaseName),
        releaseDate: safeDate(info?.releaseDate)
      });
    });
    this.updater.on("update-not-available", () => {
      this.logger.info("CodeBundle is up to date.");
      this.setState({ status: "not-available", message: "CodeBundle is up to date.", lastCheckedAt: this.now() });
    });
    this.updater.on("download-progress", (value) => {
      const progress = value as DownloadProgress | undefined;
      const percent = clampPercent(progress?.percent);
      this.setState({ status: "downloading", message: `Downloading update… ${percent}%`, percent });
    });
    this.updater.on("update-downloaded", (value) => {
      const info = value as UpdaterInfo | undefined;
      this.logger.info(`CodeBundle update downloaded: ${safeVersion(info?.version)}.`);
      this.setState({
        status: "downloaded",
        message: "Update downloaded. Restart to install.",
        version: safeOptionalText(info?.version),
        releaseName: safeOptionalText(info?.releaseName),
        releaseDate: safeDate(info?.releaseDate),
        lastCheckedAt: this.now()
      });
    });
    this.updater.on("error", () => {
      this.logger.error("CodeBundle update check failed.");
      this.checkInFlight = false;
      this.setState({ status: "error", message: "Update check failed. Try again later.", errorCode: "UPDATE_CHECK_FAILED" });
    });
  }

  getState(): UpdateState {
    return { ...this.state };
  }

  async checkForUpdates(): Promise<UpdateState> {
    if (!this.options.isPackaged) return this.setState(UNSUPPORTED_STATE);
    this.initialize();
    if (this.checkInFlight || this.state.status === "checking" || this.state.status === "downloading") return this.getState();
    this.checkInFlight = true;
    this.setState({ status: "checking", message: "Checking for updates…" });
    try {
      await this.updater.checkForUpdates();
    } catch {
      this.logger.error("CodeBundle update check failed.");
      this.setState({ status: "error", message: "Update check failed. Try again later.", errorCode: "UPDATE_CHECK_FAILED" });
    } finally {
      this.checkInFlight = false;
    }
    return this.getState();
  }

  installDownloadedUpdate(): { success: boolean; error?: string } {
    if (this.state.status !== "downloaded") return { success: false, error: "No downloaded update is ready to install." };
    try {
      this.updater.quitAndInstall();
      return { success: true };
    } catch {
      this.logger.error("CodeBundle update installation could not start.");
      return { success: false, error: "Could not restart to install the update." };
    }
  }

  scheduleStartupCheck(delayMs = 5_000): void {
    if (!this.options.isPackaged) return;
    setTimeout(() => void this.checkForUpdates(), delayMs);
  }

  private setState(next: UpdateState): UpdateState {
    this.state = { ...next };
    for (const window of this.options.getWindows()) {
      try {
        window.webContents.send("codebundle:update-state-changed", this.getState());
      } catch {
        // A window can be closing while an updater event is delivered.
      }
    }
    return this.getState();
  }
}

let updateManager: UpdateManager | null = null;

export function initializeUpdateManager(options: UpdateManagerOptions): UpdateManager {
  updateManager ??= new UpdateManager(options);
  updateManager.initialize();
  return updateManager;
}

export function getUpdateState(): UpdateState {
  return updateManager?.getState() ?? { ...UNSUPPORTED_STATE };
}

export async function checkForUpdatesManually(): Promise<UpdateState> {
  return updateManager ? updateManager.checkForUpdates() : { ...UNSUPPORTED_STATE };
}

export function installDownloadedUpdate(): { success: boolean; error?: string } {
  return updateManager?.installDownloadedUpdate() ?? { success: false, error: "Updates are available only in packaged builds." };
}

function clampPercent(value: number | undefined): number {
  return Math.round(Math.max(0, Math.min(100, Number.isFinite(value) ? value ?? 0 : 0)));
}

function safeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value.slice(0, 160) : undefined;
}

function safeVersion(value: unknown): string {
  return safeOptionalText(value) ?? "unknown";
}

function safeDate(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? undefined : value.toISOString();
  return safeOptionalText(value);
}
