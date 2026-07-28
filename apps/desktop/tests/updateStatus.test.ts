import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UpdateStatus } from "../src/renderer/components/UpdateStatus";

describe("UpdateStatus", () => {
  it("shows a manual check action and downloaded restart action", () => {
    const checking = renderToStaticMarkup(createElement(UpdateStatus, { state: { status: "unsupported", message: "Updates are available only in packaged builds." }, onCheck: () => undefined, onInstall: () => undefined }));
    expect(checking).toContain("Check for Updates");
    expect(checking).toContain("Updates are available only in packaged builds.");
    const downloaded = renderToStaticMarkup(createElement(UpdateStatus, { state: { status: "downloaded", message: "Update downloaded. Restart to install." }, onCheck: () => undefined, onInstall: () => undefined }));
    expect(downloaded).toContain("Restart to Install");
    expect(downloaded).toContain("Later");
    expect(downloaded).not.toContain("Install it when you restart.");
  });
});
