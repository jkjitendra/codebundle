import type { FileTreeDirectoryNode, FileTreeNode, ScanNode } from "./types";

interface MutableDirectoryNode extends FileTreeDirectoryNode {
  children: FileTreeNode[];
}

export function buildFileTree(nodes: ScanNode[]): FileTreeNode[] {
  const directories = new Map<string, MutableDirectoryNode>();

  for (const node of nodes) {
    if (node.type !== "directory") {
      continue;
    }
    directories.set(node.path, {
      path: node.path,
      name: node.name,
      type: "directory",
      depth: node.path.split("/").length - 1,
      children: [],
      childrenCount: node.childrenCount
    });
  }

  const roots: FileTreeNode[] = [];

  for (const directory of directories.values()) {
    const parentPath = getParentPath(directory.path);
    const parent = parentPath ? directories.get(parentPath) : undefined;
    if (parent) {
      parent.children.push(directory);
    } else {
      roots.push(directory);
    }
  }

  for (const node of nodes) {
    if (node.type !== "file") {
      continue;
    }
    const fileNode: FileTreeNode = {
      path: node.path,
      name: node.name,
      type: "file",
      depth: node.path.split("/").length - 1,
      sizeBytes: node.sizeBytes,
      extension: node.extension
    };
    const parentPath = getParentPath(node.path);
    const parent = parentPath ? directories.get(parentPath) : undefined;
    if (parent) {
      parent.children.push(fileNode);
    } else {
      roots.push(fileNode);
    }
  }

  sortTree(roots);
  return roots;
}

export interface TreeIndex {
  nodeByPath: Map<string, FileTreeNode>;
  parentByPath: Map<string, string | null>;
  childrenByPath: Map<string, string[]>;
  ancestorsByPath: Map<string, string[]>;
  descendantFileCountByFolder: Map<string, number>;
  filePaths: string[];
  directoryPaths: string[];
}

export function buildTreeIndex(nodes: FileTreeNode[]): TreeIndex {
  const nodeByPath = new Map<string, FileTreeNode>();
  const parentByPath = new Map<string, string | null>();
  const childrenByPath = new Map<string, string[]>();
  const ancestorsByPath = new Map<string, string[]>();
  const descendantFileCountByFolder = new Map<string, number>();
  const filePaths: string[] = [];
  const directoryPaths: string[] = [];

  function visit(node: FileTreeNode, parentPath: string | null, ancestors: string[]): number {
    nodeByPath.set(node.path, node);
    parentByPath.set(node.path, parentPath);
    ancestorsByPath.set(node.path, ancestors);

    if (node.type === "file") {
      filePaths.push(node.path);
      return 1;
    }

    directoryPaths.push(node.path);
    childrenByPath.set(
      node.path,
      node.children.map((child) => child.path)
    );
    const nextAncestors = [...ancestors, node.path];
    const fileCount = node.children.reduce((total, child) => total + visit(child, node.path, nextAncestors), 0);
    descendantFileCountByFolder.set(node.path, fileCount);
    return fileCount;
  }

  for (const node of nodes) {
    visit(node, null, []);
  }

  return {
    nodeByPath,
    parentByPath,
    childrenByPath,
    ancestorsByPath,
    descendantFileCountByFolder,
    filePaths,
    directoryPaths
  };
}

export function collectFilePaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];
  walkTree(nodes, (node) => {
    if (node.type === "file") {
      paths.push(node.path);
    }
  });
  return paths;
}

export function collectDirectoryPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];
  walkTree(nodes, (node) => {
    if (node.type === "directory") {
      paths.push(node.path);
    }
  });
  return paths;
}

export function collectExtensions(nodes: FileTreeNode[]): string[] {
  const extensions = new Set<string>();
  walkTree(nodes, (node) => {
    if (node.type === "file" && node.extension) {
      extensions.add(node.extension);
    }
  });
  return [...extensions].sort((left, right) => left.localeCompare(right));
}

export function filterTree(
  nodes: FileTreeNode[],
  options: {
    search: string;
    extension: string;
    showSelectedOnly: boolean;
    isSelected?: (path: string) => boolean;
  }
): FileTreeNode[] {
  const search = options.search.trim().toLowerCase();

  function filterNode(node: FileTreeNode): FileTreeNode | null {
    if (node.type === "file") {
      const matchesSearch = !search || node.path.toLowerCase().includes(search);
      const matchesExtension = !options.extension || node.extension === options.extension;
      const matchesSelected = !options.showSelectedOnly || options.isSelected?.(node.path) === true;
      return matchesSearch && matchesExtension && matchesSelected ? node : null;
    }

    const children = node.children.map(filterNode).filter((child): child is FileTreeNode => child !== null);
    const matchesSearch = !search || node.path.toLowerCase().includes(search);
    const includeDirectory = children.length > 0 || (matchesSearch && !options.extension && !options.showSelectedOnly);
    if (!includeDirectory) {
      return null;
    }
    return { ...node, children };
  }

  return nodes.map(filterNode).filter((node): node is FileTreeNode => node !== null);
}

export function getDescendantFilePaths(node: FileTreeNode): string[] {
  if (node.type === "file") {
    return [node.path];
  }
  return collectFilePaths(node.children);
}

export function getParentPath(path: string): string | null {
  const index = path.lastIndexOf("/");
  return index === -1 ? null : path.slice(0, index);
}

export function walkTree(nodes: FileTreeNode[], visit: (node: FileTreeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if (node.type === "directory") {
      walkTree(node.children, visit);
    }
  }
}

function sortTree(nodes: FileTreeNode[]): void {
  nodes.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "directory" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

  for (const node of nodes) {
    if (node.type === "directory") {
      sortTree(node.children);
    }
  }
}
