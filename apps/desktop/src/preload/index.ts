import { contextBridge, ipcRenderer } from "electron";
import type { AppInfo, CodeBundleApi, ScanProjectOptions, ScanProjectResult } from "../renderer/lib/types";

const api: CodeBundleApi = {
  chooseProjectFolder: () => ipcRenderer.invoke("codebundle:choose-project-folder") as Promise<string | null>,
  chooseOutputFile: () => ipcRenderer.invoke("codebundle:choose-output-file") as Promise<string | null>,
  scanProject: (options: ScanProjectOptions) =>
    ipcRenderer.invoke("codebundle:scan-project", options) as Promise<ScanProjectResult>,
  getDefaultExcludes: () => ipcRenderer.invoke("codebundle:get-default-excludes") as Promise<string[]>,
  getAppInfo: () => ipcRenderer.invoke("codebundle:get-app-info") as Promise<AppInfo>
};

contextBridge.exposeInMainWorld("codeBundle", api);
