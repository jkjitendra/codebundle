import * as vscode from "vscode";

export interface ExtensionSettings { pythonPath: string; exporterPythonPath: string; maxFileSizeKb: number; respectGitIgnore: boolean; followSymlinks: boolean; excludePatterns: string[]; }

export function readSettings(): ExtensionSettings {
  const configuration = vscode.workspace.getConfiguration("codebundler");
  return {
    pythonPath: configuration.get<string>("pythonPath", ""), exporterPythonPath: configuration.get<string>("exporterPythonPath", ""),
    maxFileSizeKb: configuration.get<number>("maxFileSizeKb", 500), respectGitIgnore: configuration.get<boolean>("respectGitIgnore", true),
    followSymlinks: configuration.get<boolean>("followSymlinks", false), excludePatterns: configuration.get<string[]>("excludePatterns", [])
  };
}
