import { spawn } from "node:child_process";

export interface PythonCommand { command: string; argsPrefix: string[]; }

export function getPythonCandidates(customPath: string, platform: NodeJS.Platform): PythonCommand[] {
  const candidates: PythonCommand[] = customPath.trim() ? [{ command: customPath.trim(), argsPrefix: [] }] : [];
  return platform === "win32"
    ? [...candidates, { command: "py", argsPrefix: ["-3"] }, { command: "python", argsPrefix: [] }, { command: "python3", argsPrefix: [] }]
    : [...candidates, { command: "python3", argsPrefix: [] }, { command: "python", argsPrefix: [] }];
}

export async function resolvePythonCommand(customPath: string, platform: NodeJS.Platform = process.platform): Promise<PythonCommand | null> {
  for (const candidate of getPythonCandidates(customPath, platform)) {
    if (await canRun(candidate)) return candidate;
  }
  return null;
}

function canRun(candidate: PythonCommand): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(candidate.command, [...candidate.argsPrefix, "--version"], { shell: false, windowsHide: true, stdio: "ignore" });
    const timer = setTimeout(() => { child.kill(); resolve(false); }, 5_000);
    child.once("error", () => { clearTimeout(timer); resolve(false); });
    child.once("close", (code) => { clearTimeout(timer); resolve(code === 0); });
  });
}
