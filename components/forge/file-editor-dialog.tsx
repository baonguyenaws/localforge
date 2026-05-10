"use client";

import React from "react";
import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; content: string };

type SaveState = "idle" | "saving" | "saved" | "error";

function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    mjs: "javascript", cjs: "javascript", json: "json", html: "html",
    css: "css", scss: "css", md: "markdown", mdx: "markdown",
    py: "python", rb: "ruby", go: "go", rs: "rust", sh: "bash",
    yaml: "yaml", yml: "yaml", toml: "toml", sql: "sql",
  };
  return map[ext] ?? "plaintext";
}

export function FileEditorDialog({
  open,
  onOpenChange,
  projectId,
  filePath,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: number;
  /** Relative path inside the project folder */
  filePath: string | null;
  /** Called after a file is successfully deleted */
  onDeleted?: () => void;
}) {
  const [state, setState] = React.useState<State>({ status: "loading" });
  const [editedContent, setEditedContent] = React.useState("");
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [isDirty, setIsDirty] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // Reset confirm state when dialog closes or file changes
  React.useEffect(() => {
    if (!open) {
      setConfirmDelete(false);
      setDeleting(false);
    }
  }, [open, filePath]);

  // Load file content whenever dialog opens or file changes
  React.useEffect(() => {
    if (!open || !filePath) return;
    let cancelled = false;
    setState({ status: "loading" });
    setIsDirty(false);
    setSaveState("idle");

    fetch(`/api/projects/${projectId}/file?path=${encodeURIComponent(filePath)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data: { content?: string; error?: string }) => {
        if (cancelled) return;
        if (data.error) {
          setState({ status: "error", message: data.error });
        } else {
          const content = data.content ?? "";
          setState({ status: "ok", content });
          setEditedContent(content);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Failed to load file",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [open, projectId, filePath]);

  function handleChange(value: string) {
    setEditedContent(value);
    setIsDirty(
      state.status === "ok" ? value !== state.content : true,
    );
    if (saveState === "saved") setSaveState("idle");
  }

  async function handleDelete() {
    if (!filePath || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/file?path=${encodeURIComponent(filePath)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `Delete failed (${res.status})`);
      onOpenChange(false);
      onDeleted?.();
    } catch (err) {
      console.error("FileEditorDialog delete error:", err);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleSave() {
    if (!filePath || saveState === "saving") return;
    setSaveState("saving");
    try {
      const res = await fetch(
        `/api/projects/${projectId}/file?path=${encodeURIComponent(filePath)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editedContent }),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      setState({ status: "ok", content: editedContent });
      setIsDirty(false);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      console.error("FileEditorDialog save error:", err);
    }
  }

  const filename = filePath ? filePath.split("/").pop() ?? filePath : "";
  const lang = getLanguage(filename);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      labelledBy="file-editor-title"
      className="max-w-6xl"
    >
      <DialogCloseButton onClick={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle id="file-editor-title">
          <span
            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14 }}
          >
            {filePath ?? ""}
          </span>
        </DialogTitle>
        {isDirty && (
          <p className="text-xs text-yellow-500 mt-0.5">Unsaved changes</p>
        )}
      </DialogHeader>

      <DialogBody className="p-0">
        {state.status === "loading" && (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        )}
        {state.status === "error" && (
          <p className="p-6 text-sm text-destructive">{state.message}</p>
        )}
        {state.status === "ok" && (
          <div className="relative flex flex-col" style={{ minHeight: 400 }}>
            {/* Language badge */}
            <div
              style={{
                position: "absolute",
                top: 8,
                right: 12,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: "var(--ink-4)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                pointerEvents: "none",
                zIndex: 1,
              }}
            >
              {lang}
            </div>
            {/* Line numbers + textarea side by side */}
            <EditorWithLineNumbers
              value={editedContent}
              onChange={handleChange}
            />
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        {/* Left side: delete button / confirm prompt */}
        <div className="mr-auto flex items-center gap-2">
          {!confirmDelete ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDelete(true)}
              disabled={state.status !== "ok"}
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              Delete
            </Button>
          ) : (
            <>
              <span className="text-xs text-destructive">
                Delete <strong>{filePath?.split("/").pop()}</strong>? This cannot be undone.
              </span>
              <Button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
            </>
          )}
        </div>

        {saveState === "error" && (
          <span className="text-xs text-destructive">Save failed.</span>
        )}
        {saveState === "saved" && (
          <span className="text-xs text-green-500">Saved.</span>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          Close
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saveState === "saving" || state.status !== "ok"}
        >
          {saveState === "saving" ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── Editor with line numbers ──────────────────────────────────────────────

function EditorWithLineNumbers({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const lineCount = value.split("\n").length;
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const gutterRef = React.useRef<HTMLDivElement>(null);

  // Sync vertical scroll between gutter and textarea
  function handleScroll() {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }

  // Tab key support
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newValue =
        value.substring(0, start) + "  " + value.substring(end);
      onChange(newValue);
      // Restore cursor after React re-render
      requestAnimationFrame(() => {
        el.selectionStart = start + 2;
        el.selectionEnd = start + 2;
      });
    }
  }

  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 13,
        lineHeight: "1.6",
        background: "var(--term-bg)",
        color: "var(--term-ink)",
        borderRadius: 0,
        overflow: "hidden",
        minHeight: 400,
        maxHeight: "calc(100vh - 220px)",
      }}
    >
      {/* Gutter */}
      <div
        ref={gutterRef}
        aria-hidden="true"
        style={{
          overflowY: "hidden",
          flexShrink: 0,
          padding: "12px 0",
          minWidth: 48,
          background: "var(--term-bg)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          textAlign: "right",
          color: "var(--term-dim)",
          fontSize: 12,
          userSelect: "none",
        }}
      >
        {lineNumbers.map((n) => (
          <div
            key={n}
            style={{ paddingRight: 10, paddingLeft: 6, lineHeight: "1.6" }}
          >
            {n}
          </div>
        ))}
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        style={{
          flex: 1,
          resize: "none",
          border: "none",
          outline: "none",
          background: "transparent",
          color: "var(--term-ink)",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          lineHeight: "1.6",
          padding: "12px 16px",
          overflowY: "auto",
          whiteSpace: "pre",
          overflowWrap: "normal",
          overflowX: "auto",
          minHeight: 400,
          maxHeight: "calc(100vh - 220px)",
        }}
      />
    </div>
  );
}
