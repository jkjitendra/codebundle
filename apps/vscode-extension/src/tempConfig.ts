import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { VsCodeExportConfig } from "./configBuilder";

export async function writeTempConfig(config: VsCodeExportConfig): Promise<string> {
  const path = join(tmpdir(), `codebundler-vscode-${randomUUID()}.codebundle.tmp.json`);
  await writeFile(path, JSON.stringify(config), { encoding: "utf8", mode: 0o600 });
  return path;
}

export async function deleteTempConfig(path: string): Promise<void> {
  await rm(path, { force: true });
}
