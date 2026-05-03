import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { FileTreeNode } from "../lib/types";
import { getNodeSelectionState, type SelectionModel } from "../lib/selection";
import type { TreeIndex } from "../lib/treeUtils";

const ROW_HEIGHT = 32;
const OVERSCAN = 8;
const TREE_HEIGHT = 520;

interface FileTreeProps {
  nodes: FileTreeNode[];
  treeIndex: TreeIndex;
  selection: SelectionModel;
  expandedFolders: Set<string>;
  onToggleExpanded: (path: string) => void;
  onToggleSelection: (node: FileTreeNode) => void;
}

interface VisibleRow {
  node: FileTreeNode;
  depth: number;
}

interface TreeRowProps {
  row: VisibleRow;
  treeIndex: TreeIndex;
  selection: SelectionModel;
  expandedFolders: Set<string>;
  onToggleExpanded: (path: string) => void;
  onToggleSelection: (node: FileTreeNode) => void;
}

export function FileTree({
  nodes,
  treeIndex,
  selection,
  expandedFolders,
  onToggleExpanded,
  onToggleSelection
}: FileTreeProps): JSX.Element {
  const [scrollTop, setScrollTop] = useState(0);
  const rows = useMemo(() => flattenVisibleRows(nodes, expandedFolders), [nodes, expandedFolders]);
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(TREE_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(rows.length, startIndex + visibleCount);
  const visibleRows = rows.slice(startIndex, endIndex);

  if (nodes.length === 0) {
    return <div style={styles.empty}>No files match the current filters.</div>;
  }

  return (
    <div style={styles.tree} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div style={{ ...styles.virtualSpace, height: rows.length * ROW_HEIGHT }}>
        <div style={{ transform: `translateY(${startIndex * ROW_HEIGHT}px)` }}>
          {visibleRows.map((row) => (
            <TreeRow
              key={row.node.path}
              row={row}
              treeIndex={treeIndex}
              selection={selection}
              expandedFolders={expandedFolders}
              onToggleExpanded={onToggleExpanded}
              onToggleSelection={onToggleSelection}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const TreeRow = memo(function TreeRow({
  row,
  treeIndex,
  selection,
  expandedFolders,
  onToggleExpanded,
  onToggleSelection
}: TreeRowProps): JSX.Element {
  const node = row.node;
  const checkboxRef = useRef<HTMLInputElement | null>(null);
  const state = getNodeSelectionState(node, selection, treeIndex);
  const isExpanded = node.type === "directory" && expandedFolders.has(node.path);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = state === "indeterminate";
    }
  }, [state]);

  return (
    <div style={{ ...styles.row, paddingLeft: row.depth * 18 }}>
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
  );
});

function flattenVisibleRows(nodes: FileTreeNode[], expandedFolders: Set<string>): VisibleRow[] {
  const rows: VisibleRow[] = [];

  function visit(node: FileTreeNode): void {
    rows.push({ node, depth: node.depth });
    if (node.type === "directory" && expandedFolders.has(node.path)) {
      for (const child of node.children) {
        visit(child);
      }
    }
  }

  for (const node of nodes) {
    visit(node);
  }

  return rows;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const styles = {
  tree: {
    position: "relative",
    minHeight: 260,
    height: TREE_HEIGHT,
    overflow: "auto",
    border: "1px solid #dfe4ec",
    borderRadius: 6,
    background: "#ffffff"
  },
  virtualSpace: {
    position: "relative",
    minHeight: "100%"
  },
  row: {
    display: "grid",
    gridTemplateColumns: "24px 22px minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 6,
    height: ROW_HEIGHT,
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
