import { useEffect, useRef } from "react";
import type { FileTreeNode } from "../lib/types";
import { getNodeSelectionState } from "../lib/selection";

interface FileTreeProps {
  nodes: FileTreeNode[];
  selectedFiles: Set<string>;
  expandedFolders: Set<string>;
  onToggleExpanded: (path: string) => void;
  onToggleSelection: (node: FileTreeNode) => void;
}

interface TreeRowProps extends Omit<FileTreeProps, "nodes"> {
  node: FileTreeNode;
}

export function FileTree({
  nodes,
  selectedFiles,
  expandedFolders,
  onToggleExpanded,
  onToggleSelection
}: FileTreeProps): JSX.Element {
  if (nodes.length === 0) {
    return <div style={styles.empty}>No files match the current filters.</div>;
  }

  return (
    <div style={styles.tree}>
      {nodes.map((node) => (
        <TreeRow
          key={node.path}
          node={node}
          selectedFiles={selectedFiles}
          expandedFolders={expandedFolders}
          onToggleExpanded={onToggleExpanded}
          onToggleSelection={onToggleSelection}
        />
      ))}
    </div>
  );
}

function TreeRow({
  node,
  selectedFiles,
  expandedFolders,
  onToggleExpanded,
  onToggleSelection
}: TreeRowProps): JSX.Element {
  const checkboxRef = useRef<HTMLInputElement | null>(null);
  const state = getNodeSelectionState(node, selectedFiles);
  const isExpanded = node.type === "directory" && expandedFolders.has(node.path);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = state === "indeterminate";
    }
  }, [state]);

  return (
    <div>
      <div style={{ ...styles.row, paddingLeft: node.depth * 18 }}>
        {node.type === "directory" ? (
          <button type="button" style={styles.expandButton} onClick={() => onToggleExpanded(node.path)}>
            {isExpanded ? "v" : ">"}
          </button>
        ) : (
          <span style={styles.spacer} />
        )}
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={state === "checked"}
          onChange={() => onToggleSelection(node)}
          style={styles.checkbox}
        />
        <span style={node.type === "directory" ? styles.folderName : styles.fileName}>{node.name}</span>
        {node.type === "file" ? <span style={styles.meta}>{formatBytes(node.sizeBytes)}</span> : null}
        {node.type === "directory" ? <span style={styles.meta}>{node.childrenCount} items</span> : null}
      </div>
      {node.type === "directory" && isExpanded
        ? node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              selectedFiles={selectedFiles}
              expandedFolders={expandedFolders}
              onToggleExpanded={onToggleExpanded}
              onToggleSelection={onToggleSelection}
            />
          ))
        : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const styles = {
  tree: {
    display: "grid",
    minHeight: 260,
    maxHeight: 520,
    overflow: "auto",
    border: "1px solid #dfe4ec",
    borderRadius: 6,
    background: "#ffffff"
  },
  row: {
    display: "grid",
    gridTemplateColumns: "24px 22px minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 6,
    minHeight: 32,
    paddingRight: 10,
    borderBottom: "1px solid #f0f3f7",
    color: "#263247",
    fontSize: 13
  },
  expandButton: {
    width: 22,
    height: 22,
    border: "1px solid transparent",
    borderRadius: 4,
    background: "transparent",
    color: "#5e6a7d",
    cursor: "pointer",
    fontSize: 12
  },
  spacer: {
    width: 22,
    height: 22
  },
  checkbox: {
    width: 15,
    height: 15,
    margin: 0
  },
  folderName: {
    overflow: "hidden",
    color: "#162032",
    fontWeight: 700,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  fileName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  meta: {
    color: "#7b8494",
    fontSize: 12
  },
  empty: {
    display: "grid",
    minHeight: 220,
    placeItems: "center",
    border: "1px dashed #b7bfce",
    borderRadius: 6,
    background: "#fbfcfe",
    color: "#6a7485",
    fontSize: 14
  }
} as const;
