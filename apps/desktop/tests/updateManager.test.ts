import { describe, expect, it, vi } from "vitest";
import { UpdateManager, type AutoUpdaterLike } from "../src/main/updateManager";

class FakeUpdater implements AutoUpdaterLike {
  autoDownload?: boolean;
  autoInstallOnAppQuit?: boolean;
  logger?: unknown;
  checkForUpdates = vi.fn(async () => undefined);
  quitAndInstall = vi.fn();
  private listeners = new Map<string, Array<(value?: unknown) => void>>();

  on(event: "checking-for-update" | "update-available" | "update-not-available" | "download-progress" | "update-downloaded" | "error", listener: (value?: never) => void): void {
    const eventListeners = this.listeners.get(event) ?? [];
    eventListeners.push(listener as unknown as (value?: unknown) => void);
    this.listeners.set(event, eventListeners);
  }

  emit(event: string, value?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(value);
  }
}

function makeManager(isPackaged = true) {
  const updater = new FakeUpdater();
  const send = vi.fn();
  const logger = { info: vi.fn(), error: vi.fn() };
  const manager = new UpdateManager({ isPackaged, updater, getWindows: () => [{ webContents: { send } }], logger, now: () => 1234 });
  return { manager, updater, send, logger };
}

describe("UpdateManager", () => {
  it("returns unsupported in development without calling the updater", async () => {
    const { manager, updater } = makeManager(false);
    manager.initialize();
    await expect(manager.checkForUpdates()).resolves.toMatchObject({ status: "unsupported" });
    vi.useFakeTimers();
    manager.scheduleStartupCheck(0);
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("checks once in packaged mode and prevents concurrent duplicate calls", async () => {
    const { manager, updater } = makeManager();
    let resolveCheck: (() => void) | undefined;
    updater.checkForUpdates.mockImplementationOnce(() => new Promise<undefined>((resolve) => { resolveCheck = () => resolve(undefined); }));
    const first = manager.checkForUpdates();
    const second = manager.checkForUpdates();
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
    expect((await second).status).toBe("checking");
    resolveCheck?.();
    await first;
  });

  it("runs one delayed startup check in packaged mode", async () => {
    const { manager, updater } = makeManager();
    vi.useFakeTimers();
    manager.scheduleStartupCheck(5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    vi.useRealTimers();
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it("maps updater events to safe renderer states and broadcasts them", () => {
    const { manager, updater, send } = makeManager();
    manager.initialize();
    updater.emit("checking-for-update");
    expect(manager.getState()).toMatchObject({ status: "checking" });
    updater.emit("update-available", { version: "0.1.16", releaseName: "Release" });
    expect(manager.getState()).toMatchObject({ status: "available", version: "0.1.16" });
    updater.emit("download-progress", { percent: 123.4 });
    expect(manager.getState()).toMatchObject({ status: "downloading", percent: 100 });
    updater.emit("update-downloaded", { version: "0.1.16" });
    expect(manager.getState()).toMatchObject({ status: "downloaded", lastCheckedAt: 1234 });
    updater.emit("error", new Error("token=secret"));
    expect(manager.getState()).toEqual({ status: "error", message: "Update check failed. Try again later.", errorCode: "UPDATE_CHECK_FAILED" });
    expect(send).toHaveBeenCalledWith("codebundle:update-state-changed", expect.not.objectContaining({ stack: expect.anything() }));
  });

  it("maps no-update events and only installs a downloaded update after user action", () => {
    const { manager, updater } = makeManager();
    manager.initialize();
    expect(manager.installDownloadedUpdate()).toEqual({ success: false, error: "No downloaded update is ready to install." });
    updater.emit("update-not-available");
    expect(manager.getState()).toMatchObject({ status: "not-available", lastCheckedAt: 1234 });
    updater.emit("update-downloaded", { version: "0.1.16" });
    expect(manager.installDownloadedUpdate()).toEqual({ success: true });
    expect(updater.quitAndInstall).toHaveBeenCalledOnce();
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(false);
  });
});
