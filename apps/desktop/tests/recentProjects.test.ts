import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron-log", () => ({
  default: {
    info: vi.fn()
  }
}));

import {
  addRecentProject,
  getRecentProjectsPath,
  MAX_RECENT_PROJECTS,
  normalizeForCompare,
  readRecentProjects,
  removeRecentProject,
  safeLabel,
  validateRecentProjects
} from "../src/main/recentProjects";

async function withTempUserData<T>(run: (userDataPath: string) => Promise<T>): Promise<T> {
  const userDataPath = await mkdtemp(join(tmpdir(), "codebundle-recents-"));
  try {
    return await run(userDataPath);
  } finally {
    await rm(userDataPath, { recursive: true, force: true });
  }
}

async function createProjectDir(userDataPath: string, name: string): Promise<string> {
  const projectPath = join(userDataPath, "projects", name);
  await mkdir(projectPath, { recursive: true });
  return projectPath;
}

describe("recent projects", () => {
  it("returns an empty list when the recent projects file does not exist", async () => {
    await withTempUserData(async (userDataPath) => {
      await expect(readRecentProjects(userDataPath)).resolves.toEqual([]);
    });
  });

  it("adds a project and reads it back", async () => {
    await withTempUserData(async (userDataPath) => {
      const projectPath = await createProjectDir(userDataPath, "app");

      const added = await addRecentProject(userDataPath, projectPath);
      const stored = await readRecentProjects(userDataPath);

      expect(added).toHaveLength(1);
      expect(stored).toEqual(added);
      expect(stored[0]).toMatchObject({
        path: projectPath,
        name: "app"
      });
      expect(stored[0].addedAt).toBe(stored[0].lastOpenedAt);
    });
  });

  it("rejects relative paths", async () => {
    await withTempUserData(async (userDataPath) => {
      await expect(addRecentProject(userDataPath, "relative-project")).resolves.toEqual([]);
      await expect(readRecentProjects(userDataPath)).resolves.toEqual([]);
    });
  });

  it("rejects absolute paths that are not directories", async () => {
    await withTempUserData(async (userDataPath) => {
      const filePath = join(userDataPath, "not-a-directory.txt");
      await writeFile(filePath, "not a directory", "utf8");

      await expect(addRecentProject(userDataPath, filePath)).resolves.toEqual([]);
    });
  });

  it("deduplicates projects by normalized path", async () => {
    await withTempUserData(async (userDataPath) => {
      const projectPath = await createProjectDir(userDataPath, "app");
      const variantPath = join(userDataPath, "projects", "app", "..", basename(projectPath));

      await addRecentProject(userDataPath, projectPath);
      const projects = await addRecentProject(userDataPath, variantPath);

      expect(projects).toHaveLength(1);
      expect(projects[0].path).toBe(projectPath);
    });
  });

  it("moves a reopened project to the front", async () => {
    await withTempUserData(async (userDataPath) => {
      const firstProject = await createProjectDir(userDataPath, "first");
      const secondProject = await createProjectDir(userDataPath, "second");

      await addRecentProject(userDataPath, firstProject);
      await addRecentProject(userDataPath, secondProject);
      const projects = await addRecentProject(userDataPath, firstProject);

      expect(projects.map((project) => project.path)).toEqual([firstProject, secondProject]);
    });
  });

  it("preserves addedAt and updates lastOpenedAt when reopened", async () => {
    await withTempUserData(async (userDataPath) => {
      const nowSpy = vi.spyOn(Date, "now");
      const projectPath = await createProjectDir(userDataPath, "app");

      try {
        nowSpy.mockReturnValue(1_000);
        await addRecentProject(userDataPath, projectPath);

        nowSpy.mockReturnValue(5_000);
        const projects = await addRecentProject(userDataPath, projectPath);

        expect(projects[0].addedAt).toBe(1_000);
        expect(projects[0].lastOpenedAt).toBe(5_000);
      } finally {
        nowSpy.mockRestore();
      }
    });
  });

  it("trims the list to MAX_RECENT_PROJECTS", async () => {
    await withTempUserData(async (userDataPath) => {
      const projectPaths: string[] = [];
      for (let index = 0; index < MAX_RECENT_PROJECTS + 2; index += 1) {
        const projectPath = await createProjectDir(userDataPath, `project-${index}`);
        projectPaths.push(projectPath);
        await addRecentProject(userDataPath, projectPath);
      }

      const projects = await readRecentProjects(userDataPath);

      expect(projects).toHaveLength(MAX_RECENT_PROJECTS);
      expect(projects.map((project) => project.path)).toEqual(projectPaths.slice(2).reverse());
    });
  });

  it("removes a project by path", async () => {
    await withTempUserData(async (userDataPath) => {
      const projectPath = await createProjectDir(userDataPath, "app");
      await addRecentProject(userDataPath, projectPath);

      await expect(removeRecentProject(userDataPath, projectPath)).resolves.toEqual([]);
      await expect(readRecentProjects(userDataPath)).resolves.toEqual([]);
    });
  });

  it("safely ignores removal for a non-existent project path", async () => {
    await withTempUserData(async (userDataPath) => {
      const projectPath = await createProjectDir(userDataPath, "app");
      await addRecentProject(userDataPath, projectPath);

      const projects = await removeRecentProject(userDataPath, join(userDataPath, "missing"));

      expect(projects).toHaveLength(1);
      expect(projects[0].path).toBe(projectPath);
    });
  });

  it("serializes rapid add and remove mutations", async () => {
    await withTempUserData(async (userDataPath) => {
      const oldProject = await createProjectDir(userDataPath, "old");
      const newProject = await createProjectDir(userDataPath, "new");
      await addRecentProject(userDataPath, oldProject);

      await Promise.all([
        addRecentProject(userDataPath, newProject),
        removeRecentProject(userDataPath, oldProject)
      ]);

      const projects = await readRecentProjects(userDataPath);

      expect(projects.map((project) => project.path)).toEqual([newProject]);
    });
  });

  it("returns an empty list for corrupted JSON", async () => {
    await withTempUserData(async (userDataPath) => {
      await writeFile(getRecentProjectsPath(userDataPath), "{not valid json", "utf8");

      await expect(readRecentProjects(userDataPath)).resolves.toEqual([]);
    });
  });

  it("drops invalid stored entries", async () => {
    await withTempUserData(async (userDataPath) => {
      const validPath = join(userDataPath, "stored-valid");
      await writeFile(
        getRecentProjectsPath(userDataPath),
        JSON.stringify([
          { path: validPath, name: " Valid ", addedAt: 1, lastOpenedAt: 2 },
          { path: "relative", name: "Relative", addedAt: 1, lastOpenedAt: 2 },
          { path: validPath, name: "", addedAt: 1, lastOpenedAt: 2 },
          { path: validPath, name: "Bad time", addedAt: "1", lastOpenedAt: 2 },
          null
        ]),
        "utf8"
      );

      await expect(readRecentProjects(userDataPath)).resolves.toEqual([
        { path: validPath, name: "Valid", addedAt: 1, lastOpenedAt: 2 }
      ]);
    });
  });

  it("prunes stale paths when validating recent projects", async () => {
    await withTempUserData(async (userDataPath) => {
      const staleProject = await createProjectDir(userDataPath, "stale");
      const activeProject = await createProjectDir(userDataPath, "active");
      await addRecentProject(userDataPath, staleProject);
      await addRecentProject(userDataPath, activeProject);
      await rm(staleProject, { recursive: true, force: true });

      const projects = await validateRecentProjects(userDataPath);

      expect(projects.map((project) => project.path)).toEqual([activeProject]);
      await expect(readRecentProjects(userDataPath)).resolves.toEqual(projects);
    });
  });

  it("writes the final JSON file through the atomic write path", async () => {
    await withTempUserData(async (userDataPath) => {
      const projectPath = await createProjectDir(userDataPath, "app");

      await addRecentProject(userDataPath, projectPath);

      await expect(readFile(getRecentProjectsPath(userDataPath), "utf8")).resolves.toContain(projectPath);
      await expect(access(`${getRecentProjectsPath(userDataPath)}.tmp`)).rejects.toThrow();
    });
  });

  it("compares paths case-insensitively on Windows", () => {
    expect(normalizeForCompare("C:/Users/Jane/Project", "win32")).toBe(
      normalizeForCompare("c:\\users\\jane\\project", "win32")
    );
  });

  it("uses safe labels for logging instead of full paths", () => {
    expect(safeLabel("/Users/jane/private/app")).toBe("app");
    expect(safeLabel("C:\\Users\\jane\\private\\app")).toBe("app");
    expect(safeLabel("/")).toBe("project");
  });
});
