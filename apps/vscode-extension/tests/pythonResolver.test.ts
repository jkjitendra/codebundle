import { describe, expect, it } from "vitest";
import { getPythonCandidates } from "../src/pythonResolver";

describe("getPythonCandidates", () => {
  it("puts a configured Python path first", () => expect(getPythonCandidates("/custom/python", "darwin")[0]).toEqual({ command: "/custom/python", argsPrefix: [] }));
  it("uses python3 then python on macOS and Linux", () => expect(getPythonCandidates("", "linux")).toEqual([{ command: "python3", argsPrefix: [] }, { command: "python", argsPrefix: [] }]));
  it("represents the Windows launcher with separate args", () => expect(getPythonCandidates("", "win32")[0]).toEqual({ command: "py", argsPrefix: ["-3"] }));
});
