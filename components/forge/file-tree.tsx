"use client";

import React from "react";
import type { FileNode } from "@/app/api/projects/[id]/filetree/route";
import { FileEditorDialog } from "@/components/forge/file-editor-dialog";
import { FilePlus, FolderPlus, RefreshCw, ChevronsUpDown, TerminalSquare } from "lucide-react";
import { TerminalDialog } from "@/components/forge/terminal-dialog";

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
  collapseKey,
  onFileClick,
}: {
  node: FileNode;
  depth: number;
  defaultOpen: boolean;
  collapseKey: number;
  onFileClick: (path: string) => void;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  React.useEffect(() => {
    if (collapseKey > 0) setOpen(false);
  }, [collapseKey]);

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
                collapseKey={collapseKey}
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

export function FileTree({
  projectId,
  projectPath = "",
}: {
  projectId: number;
  projectPath?: string;
}) {
  const [state, setState] = React.useState<State>({ status: "loading" });
  const [selectedFile, setSelectedFile] = React.useState<string | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [collapseKey, setCollapseKey] = React.useState(0);
  const [terminalOpen, setTerminalOpen] = React.useState(false);
  const [createMode, setCreateMode] = React.useState<null | "file" | "folder">(null);
  const [createName, setCreateName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const createInputRef = React.useRef<HTMLInputElement>(null);

  function handleFileClick(path: string) {
    setSelectedFile(path);
    setEditorOpen(true);
  }

  function refreshTree() {
    setRefreshKey((k) => k + 1);
  }

  async function handleCreate() {
    const name = createName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const endpoint =
        createMode === "file"
          ? `/api/projects/${projectId}/file?path=${encodeURIComponent(name)}`
          : `/api/projects/${projectId}/folder?path=${encodeURIComponent(name)}`;
      const res = await fetch(endpoint, { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
      setCreateMode(null);
      setCreateName("");
      refreshTree();
    } catch (err) {
      console.error("Create failed:", err);
    } finally {
      setCreating(false);
    }
  }

  React.useEffect(() => {
    if (createMode && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [createMode]);
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
          padding: "6px 8px 6px 12px",
          borderBottom: "1px solid var(--line)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
          <button
            type="button"
            title="New file"
            onClick={() => { setCreateMode("file"); setCreateName(""); }}
            style={{ padding: 4, borderRadius: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--ink-3)", display: "flex", alignItems: "center" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--panel-2)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-3)"; }}
          >
            <FilePlus size={13} />
          </button>
          <button
            type="button"
            title="New folder"
            onClick={() => { setCreateMode("folder"); setCreateName(""); }}
            style={{ padding: 4, borderRadius: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--ink-3)", display: "flex", alignItems: "center" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--panel-2)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-3)"; }}
          >
            <FolderPlus size={13} />
          </button>
          <button
            type="button"
            title="Refresh"
            onClick={refreshTree}
            style={{ padding: 4, borderRadius: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--ink-3)", display: "flex", alignItems: "center" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--panel-2)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-3)"; }}
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            title="Collapse all"
            onClick={() => setCollapseKey((k) => k + 1)}
            style={{ padding: 4, borderRadius: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--ink-3)", display: "flex", alignItems: "center" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--panel-2)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-3)"; }}
          >
            <ChevronsUpDown size={13} />
          </button>
          <button
            type="button"
            title="Open terminal"
            onClick={() => setTerminalOpen(true)}
            style={{ padding: 4, borderRadius: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--ink-3)", display: "flex", alignItems: "center" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--panel-2)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-3)"; }}
          >
            <TerminalSquare size={13} />
          </button>
        </div>
      </div>

      {/* Inline create input */}
      {createMode && (
        <div
          style={{
            padding: "6px 8px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 12 }}>{createMode === "file" ? "📄" : "📁"}</span>
          <input
            ref={createInputRef}
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
              if (e.key === "Escape") { setCreateMode(null); setCreateName(""); }
            }}
            placeholder={createMode === "file" ? "filename.ext" : "folder-name"}
            style={{
              flex: 1,
              background: "var(--panel-2)",
              border: "1px solid var(--line)",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              color: "var(--ink-1)",
              outline: "none",
              minWidth: 0,
            }}
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !createName.trim()}
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 4,
              background: "var(--accent)",
              color: "white",
              border: "none",
              cursor: creating || !createName.trim() ? "not-allowed" : "pointer",
              opacity: creating || !createName.trim() ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            {creating ? "…" : "✓"}
          </button>
          <button
            type="button"
            onClick={() => { setCreateMode(null); setCreateName(""); }}
            style={{
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 4,
              background: "transparent",
              color: "var(--ink-3)",
              border: "1px solid var(--line)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}

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
              <TreeNode key={node.path} node={node} depth={0} defaultOpen={false} collapseKey={collapseKey} onFileClick={handleFileClick} />
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

      <TerminalDialog
        open={terminalOpen}
        onOpenChange={setTerminalOpen}
        projectId={projectId}
        projectPath={projectPath}
      />
    </div>
  );
}
