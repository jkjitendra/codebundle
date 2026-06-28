import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ExportPreviewModal,
  getCopyPreviewContent,
  getPreviewStats,
  TRUNCATED_COPY_NOTICE
} from "../src/renderer/components/ExportPreviewModal";
import type { PreviewResult } from "../src/shared/types";

function makePreview(overrides: Partial<PreviewResult> = {}): PreviewResult {
  return {
    content: "visible preview content",
    totalSelectedFiles: 11,
    previewedFiles: 2,
    totalLines: 153,
    truncated: true,
    format: "markdown",
    ...overrides
  };
}

describe("ExportPreviewModal", () => {
  it("shows selected files and previewed files separately", () => {
    const preview = makePreview();
    const stats = getPreviewStats(preview);

    expect(stats).toEqual([
      { label: "Selected files:", value: "11" },
      { label: "Previewed files:", value: "2" },
      { label: "Lines:", value: "153" }
    ]);

    const markup = renderToStaticMarkup(
      createElement(ExportPreviewModal, {
        preview,
        onClose: () => undefined,
        onConfirmExport: () => undefined
      })
    );

    expect(markup).toContain("Selected files:");
    expect(markup).toContain("Previewed files:");
    expect(markup).toContain("Lines:");
    expect(markup).toContain(TRUNCATED_COPY_NOTICE);
  });

  it("copies only preview.content", () => {
    const preview = makePreview({
      content: "only this visible preview",
      totalSelectedFiles: 50,
      previewedFiles: 3,
      truncated: true
    });

    expect(getCopyPreviewContent(preview)).toBe("only this visible preview");
  });
});
