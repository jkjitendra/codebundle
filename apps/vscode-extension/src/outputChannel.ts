import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  channel ??= vscode.window.createOutputChannel("CodeBundler");
  return channel;
}

export function logExport(message: string): void {
  getOutputChannel().appendLine(`[${new Date().toISOString()}] ${message}`);
}
