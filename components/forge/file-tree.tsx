"use client";

import React from "react";
import type { FileNode } from "@/app/api/projects/[id]/filetree/route";
import { FileEditorDialog } from "@/components/forge/file-editor-dialog";

// ─── File-type icon helpers ────────────────────────────────────────────────

const EXT_ICONS: Record<string, string> = {
  // JS/TS
  ts: "🟦", tsx: "🟦", js: "🟨", jsx: "🟨", mjs: "🟨", cjs: "🟨",
  // Web
  html: "🌐", css: "🎨", scss: "🎨", sass: "🎨", less: "🎨",
  // Config / data
  json: "📋", yaml: "📋", yml: "📋", toml: "📋", env: "🔑",
  // Docs
  md: "📝", mdx: "📝", txt: "📝",
  // Media
  png: "🖼", jpg: "🖼", jpeg: "🖼", gif: "🖼", svg: "🖼", webp: "🖼",
  ico: "🖼",
  // Code
  py: "🐍", rb: "💎", go: "🐹", rs: "🦀", java: "☕", sh: "🖥",
  // Package
  lock: "🔒",
};

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_ICONS[ext] ?? "📄";
}

// ─── Single tree node ──────────────────────────────────────────────────────

function TreeNode({
  node,
  depth,
  defaultOpen,
  onFileClick,
}: {
  node: FileNode;
  depth: number;
  defaultOpen: boolean;
  onFileClick: (path: string) => void;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  const indent = depth * 12;

  if (node.type === "directory") {
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-1 rounded px-1 py-[2px] text-left text-[12px] hover:bg-[var(--panel-2)] transition-colors"
          style={{ paddingLeft: indent + 4 }}
          title={node.path}
        >
          <span
            className="shrink-0 text-[10px] text-[var(--ink-3)] transition-transform"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}
          >
            ▶
          </span>
          <span className="shrink-0">📁</span>
          <span
            className="truncate font-medium text-[var(--ink-2)]"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {node.name}
          </span>
        </button>
        {open && node.children && node.children.length > 0 && (
          <ul>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                defaultOpen={false}
                onFileClick={onFileClick}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onFileClick(node.path)}
        className="flex w-full items-center gap-1 rounded px-1 py-[2px] text-left text-[12px] text-[var(--ink-2)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] transition-colors cursor-pointer"
        style={{
          paddingLeft: indent + 18,
          fontFamily: "'JetBrains Mono', monospace",
        }}
        title={node.path}
      >
        <span className="shrink-0">{fileIcon(node.name)}</span>
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}

// ─── Main FileTree panel ───────────────────────────────────────────────────

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; tree: FileNode[] };

export function FileTree({ projectId }: { projectId: number }) {
  const [state, setState] = React.useState<State>({ status: "loading" });
  const [selectedFile, setSelectedFile] = React.useState<string | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  function handleFileClick(path: string) {
    setSelectedFile(path);
    setEditorOpen(true);
  }

  function refreshTree() {
    setRefreshKey((k) => k + 1);
  }

  // Refresh the file tree whenever any task status changes (e.g. a task
  // completes and the agent has written new files to the project folder).
  React.useEffect(() => {
    const onRefresh = () => refreshTree();
    window.addEventListener("kanban:refresh", onRefresh);
    window.addEventListener("orchestrator:changed", onRefresh);
    return () => {
      window.removeEventListener("kanban:refresh", onRefresh);
      window.removeEventListener("orchestrator:changed", onRefresh);
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetch(`/api/projects/${projectId}/filetree`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { tree?: FileNode[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) {
          setState({ status: "error", message: data.error });
        } else {
          setState({ status: "ok", tree: data.tree ?? [] });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Failed to load",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  return (
    <div
      className="flex flex-col"
      style={{
        width: 300,
        minWidth: 300,
        maxWidth: 300,
        flexShrink: 0,
        borderRight: "1px solid var(--line)",
        background: "var(--panel)",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 12px 8px",
          borderBottom: "1px solid var(--line)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 13 }}>📂</span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--ink-3)",
            fontWeight: 600,
          }}
        >
          Files
        </span>
      </div>

      {/* Tree content */}
      <div style={{ padding: "6px 4px", flex: 1 }}>
        {state.status === "loading" && (
          <p
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: "var(--ink-4)",
              padding: "8px 10px",
            }}
          >
            Loading…
          </p>
        )}
        {state.status === "error" && (
          <p
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: "var(--bad)",
              padding: "8px 10px",
            }}
          >
            {state.message}
          </p>
        )}
        {state.status === "ok" && state.tree.length === 0 && (
          <p
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: "var(--ink-4)",
              padding: "8px 10px",
            }}
          >
            Empty folder
          </p>
        )}
        {state.status === "ok" && state.tree.length > 0 && (
          <ul className="list-none m-0 p-0 select-none">
            {state.tree.map((node) => (
              <TreeNode key={node.path} node={node} depth={0} defaultOpen={false} onFileClick={handleFileClick} />
            ))}
          </ul>
        )}
      </div>

      <FileEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        projectId={projectId}
        filePath={selectedFile}
        onDeleted={refreshTree}
      />
    </div>
  );
}
