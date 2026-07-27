import type { CodeBundleExportConfig, RunExportFailure, RunExportResult, RunExportSuccess } from "../shared/types";
import { scanNodeExportFiles } from "./nodeExportScanner";
import { writeNodeExport } from "./nodeExportWriter";

export interface RunNodeExporterOptions {
  fallbackReason: string;
}

export async function runNodeExporter(config: CodeBundleExportConfig, options: RunNodeExporterOptions): Promise<RunExportResult> {
  try {
    const scan = await scanNodeExportFiles(config);
    const written = await writeNodeExport(config, scan.entries);
    const summary = { ...scan.summary, exportedFiles: written, skippedInvalid: scan.summary.skippedInvalid + (scan.entries.length - written) };
    const success: RunExportSuccess = {
      success: true,
      outputFile: config.outputFile,
      summary,
      exporter: "node-fallback",
      fallbackReason: options.fallbackReason
    };
    return success;
  } catch {
    const failure: RunExportFailure = {
      success: false,
      error: {
        code: "NODE_EXPORT_FAILED",
        message: "The Node fallback exporter could not complete the export.",
        details: "Check the selected files and output location."
      }
    };
    return failure;
  }
}
