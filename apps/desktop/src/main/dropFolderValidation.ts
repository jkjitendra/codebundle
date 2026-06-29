import { stat, realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { assertSafeProjectRoot } from "./pathSecurity";

export interface ValidateDroppedFolderSuccess {
  success: true;
  resolvedPath: string;
}

export interface ValidateDroppedFolderFailure {
  success: false;
  resolvedPath?: string;
  error: {
    code:
      | "INVALID_INPUT"
      | "NOT_ABSOLUTE"
      | "NOT_A_DIRECTORY"
      | "DANGEROUS_PATH"
      | "HOME_DIRECTORY"
      | "RESOLVE_FAILED";
    message: string;
  };
}

export type ValidateDroppedFolderResult =
  | ValidateDroppedFolderSuccess
  | ValidateDroppedFolderFailure;

/**
 * Validates a folder path dropped by the user.
 *
 * Security requirements:
 * - Input must be a non-empty string.
 * - Path must be absolute.
 * - Path must resolve to an existing directory.
 * - Path must not be a dangerous system root.
 * - Path must not be a home directory unless the renderer confirms before
 *   scanning.
 * - Resolved symlink targets must not be dangerous system roots or the home
 *   directory unless the renderer confirms before scanning.
 *
 * The renderer never receives a Node.js path resolution API — validation
 * happens entirely in the main process before returning a safe result.
 */
export async function validateDroppedFolder(
  input: unknown
): Promise<ValidateDroppedFolderResult> {
  if (typeof input !== "string" || input.trim().length === 0) {
    return {
      success: false,
      error: {
        code: "INVALID_INPUT",
        message: "Dropped path must be a non-empty string."
      }
    };
  }

  const rawPath = input.trim();

  if (!isAbsolute(rawPath)) {
    return {
      success: false,
      error: {
        code: "NOT_ABSOLUTE",
        message: "Dropped path must be an absolute path."
      }
    };
  }

  // Reject dangerous roots before stat and route home-directory confirmation
  // through the renderer before scanning.
  try {
    assertSafeProjectRoot(rawPath, /* allowHomeDirectory = */ false);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("DANGEROUS_PROJECT_ROOT")) {
      return {
        success: false,
        error: {
          code: "DANGEROUS_PATH",
          message: "Cannot use a system-level directory as a project folder."
        }
      };
    }
    if (message.includes("HOME_DIRECTORY_REQUIRES_CONFIRMATION")) {
      return {
        success: false,
        error: {
          code: "HOME_DIRECTORY",
          message: "Scanning your home directory can include many personal files."
        }
      };
    }
  }

  // Verify it is a directory on disk
  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(rawPath);
  } catch {
    return {
      success: false,
      error: {
        code: "NOT_A_DIRECTORY",
        message: "The dropped path does not exist or cannot be accessed."
      }
    };
  }

  if (!fileStat.isDirectory()) {
    return {
      success: false,
      error: {
        code: "NOT_A_DIRECTORY",
        message: "Dropped item is not a folder. Please drop a folder."
      }
    };
  }

  // Resolve symlinks to get the canonical path
  let resolvedPath: string;
  try {
    resolvedPath = await realpath(rawPath);
  } catch {
    return {
      success: false,
      error: {
        code: "RESOLVE_FAILED",
        message: "Could not resolve the dropped folder path."
      }
    };
  }

  try {
    assertSafeProjectRoot(resolvedPath, /* allowHomeDirectory = */ false);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("DANGEROUS_PROJECT_ROOT")) {
      return {
        success: false,
        error: {
          code: "DANGEROUS_PATH",
          message: "Cannot use a system-level directory as a project folder."
        }
      };
    }
    if (message.includes("HOME_DIRECTORY_REQUIRES_CONFIRMATION")) {
      return {
        success: false,
        resolvedPath,
        error: {
          code: "HOME_DIRECTORY",
          message: "Scanning your home directory can include many personal files."
        }
      };
    }
  }

  return { success: true, resolvedPath };
}
