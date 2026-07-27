import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CodeBundleExportConfig, GitDiffExportInfo, GitProjectInfo } from "../shared/types";
import type { NodeExportFileEntry } from "./nodeExportScanner";

export async function writeNodeExport(config: CodeBundleExportConfig, entries: NodeExportFileEntry[]): Promise<number> {
  await mkdir(dirname(config.outputFile), { recursive: true });
  const file = await open(config.outputFile, "w");
  let written = 0;
  try {
    await file.writeFile(renderHeader(config, entries.length), "utf8");
    for (const entry of entries) {
      try {
        const content = (await readFile(entry.absolutePath)).toString("utf8");
        await file.writeFile(renderFile(config.format, written + 1, entry.relativePath, content), "utf8");
        written += 1;
      } catch {
        // A file can disappear after scanning. Keep the export local and avoid
        // exposing file contents or paths in an error message.
      }
    }
  } finally {
    await file.close();
  }
  return written;
}

function renderHeader(config: CodeBundleExportConfig, totalFiles: number): string {
  const lines = config.format === "markdown"
    ? ["# CodeBundle Export", "", `Project Root: \`${config.projectRoot}\``, "", `Total Files: ${totalFiles}`, ""]
    : ["CodeBundle Export", "", `Project Root: ${config.projectRoot}`, "", `Total Files: ${totalFiles}`, ""];
  lines.push(...renderGit(config.format, config.git), ...renderGitDiff(config.format, config.gitDiff), "---", "");
  return lines.join("\n");
}

function renderFile(format: CodeBundleExportConfig["format"], index: number, relativePath: string, content: string): string {
  const cleanContent = content.replace(/\n+$/, "");
  if (format === "text") return `File ${index} Path\n${relativePath}\n\n${cleanContent}\n\n---\n\n`;
  const fence = markdownFence(content);
  return `## File ${index}: \`${relativePath}\`\n\n${fence}text\n${cleanContent}\n${fence}\n\n---\n\n`;
}

export function markdownFence(content: string): string {
  let longest = 0;
  let current = 0;
  for (const character of content) {
    current = character === "`" ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return "`".repeat(Math.max(3, longest + 1));
}

function renderGit(format: CodeBundleExportConfig["format"], git: GitProjectInfo | undefined): string[] {
  if (!git?.isGitRepository) return [];
  const branch = git.isDetachedHead ? "detached HEAD" : git.branch;
  const workingTree = typeof git.hasTrackedChanges === "boolean" ? (git.hasTrackedChanges ? "modified" : "clean") : undefined;
  const lines = format === "markdown" ? ["## Git", ""] : ["Git", ""];
  if (branch) lines.push(format === "markdown" ? `- Branch: ${branch}` : `Branch: ${branch}`);
  if (git.shortCommit) lines.push(format === "markdown" ? `- Commit: ${git.shortCommit}` : `Commit: ${git.shortCommit}`);
  if (workingTree) lines.push(format === "markdown" ? `- Working tree: ${workingTree}` : `Working tree: ${workingTree}`);
  lines.push("");
  return lines;
}

function renderGitDiff(format: CodeBundleExportConfig["format"], gitDiff: GitDiffExportInfo | undefined): string[] {
  if (!gitDiff) return [];
  const mode = gitDiff.mode === "branch" ? `Branch vs ${gitDiff.baseRef ?? "base"}` : "Working tree vs HEAD";
  const prefix = format === "markdown" ? "- " : "";
  return [
    format === "markdown" ? "## Git Diff" : "Git Diff", "",
    `${prefix}Mode: ${mode}`,
    `${prefix}Changed files selected: ${gitDiff.selectedFilesCount}`,
    `${prefix}Unavailable/skipped: ${gitDiff.unavailableFilesCount}`,
    `${prefix}Include untracked: ${gitDiff.includeUntracked ? "yes" : "no"}`,
    ""
  ];
}
