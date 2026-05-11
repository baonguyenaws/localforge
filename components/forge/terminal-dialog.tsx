"use client";

import React from "react";
import { X, Terminal } from "lucide-react";

type OutputLine =
  | { type: "cmd"; text: string }
  | { type: "stdout"; text: string }
  | { type: "stderr"; text: string }
  | { type: "info"; text: string };

type TerminalDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  projectPath: string;
};

export function TerminalDialog({
  open,
  onOpenChange,
  projectId,
  projectPath,
}: TerminalDialogProps) {
  const [lines, setLines] = React.useState<OutputLine[]>([
    { type: "info", text: `Working directory: ${projectPath}` },
    { type: "info", text: 'Type a command and press Enter. Type "clear" to reset.' },
  ]);
  const [input, setInput] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [history, setHistory] = React.useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = React.useState(-1);
  const outputRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Scroll to bottom whenever lines change
  React.useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  // Focus input when dialog opens
  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Re-focus input whenever a command finishes running
  React.useEffect(() => {
    if (!running) {
      inputRef.current?.focus();
    }
  }, [running]);

  // Escape to close
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  // Lock body scroll
  React.useEffect(() => {
    if (!open) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = orig; };
  }, [open]);

  async function runCommand() {
    const cmd = input.trim();
    if (!cmd || running) return;

    if (cmd === "clear") {
      setLines([{ type: "info", text: `Working directory: ${projectPath}` }]);
      setInput("");
      setHistory((h) => [cmd, ...h]);
      setHistoryIdx(-1);
      return;
    }

    setHistory((h) => [cmd, ...h]);
    setHistoryIdx(-1);
    setLines((l) => [...l, { type: "cmd", text: cmd }]);
    setInput("");
    setRunning(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/terminal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const data = (await res.json()) as {
        stdout?: string;
        stderr?: string;
        exitCode?: number;
        error?: string;
      };

      if (data.error) {
        setLines((l) => [...l, { type: "stderr", text: data.error! }]);
      } else {
        const out = data.stdout?.trimEnd();
        const err = data.stderr?.trimEnd();
        if (out) setLines((l) => [...l, { type: "stdout", text: out }]);
        if (err) setLines((l) => [...l, { type: "stderr", text: err }]);
        if (!out && !err) {
          setLines((l) => [
            ...l,
            {
              type: "info",
              text: `[exit ${data.exitCode ?? 0}]`,
            },
          ]);
        } else if ((data.exitCode ?? 0) !== 0) {
          setLines((l) => [
            ...l,
            { type: "info", text: `[exit ${data.exitCode}]` },
          ]);
        }
      }
    } catch (err) {
      setLines((l) => [
        ...l,
        {
          type: "stderr",
          text: err instanceof Error ? err.message : "Request failed",
        },
      ]);
    } finally {
      setRunning(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      void runCommand();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = historyIdx + 1;
      if (idx < history.length) {
        setHistoryIdx(idx);
        setInput(history[idx]);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = historyIdx - 1;
      if (idx < 0) {
        setHistoryIdx(-1);
        setInput("");
      } else {
        setHistoryIdx(idx);
        setInput(history[idx]);
      }
    }
  }

  if (!open) return null;

  const FONT = "'JetBrains Mono', 'Fira Code', monospace";

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Terminal window */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Project terminal"
        style={{
          position: "relative",
          zIndex: 10,
          width: "min(1120px, 100%)",
          height: "min(730px, 90vh)",
          display: "flex",
          flexDirection: "column",
          background: "var(--term-bg)",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
          overflow: "hidden",
        }}
      >
        {/* Title bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 14px",
            background: "rgba(255,255,255,0.04)",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Terminal size={13} style={{ color: "var(--term-grn)" }} />
            <span
              style={{
                fontFamily: FONT,
                fontSize: 11,
                color: "var(--term-dim)",
                letterSpacing: "0.04em",
              }}
            >
              terminal
              <span style={{ color: "var(--term-ink)", marginLeft: 6 }}>
                — {projectPath}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--term-dim)",
              display: "flex",
              alignItems: "center",
              padding: 4,
              borderRadius: 4,
            }}
            aria-label="Close terminal"
          >
            <X size={14} />
          </button>
        </div>

        {/* Output area */}
        <div
          ref={outputRef}
          onClick={() => inputRef.current?.focus()}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 16px",
            fontFamily: FONT,
            fontSize: 12.5,
            lineHeight: "1.65",
            cursor: "text",
          }}
        >
          {lines.map((line, i) => {
            if (line.type === "cmd") {
              return (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 2 }}>
                  <span style={{ color: "var(--term-grn)", userSelect: "none", flexShrink: 0 }}>
                    $
                  </span>
                  <span style={{ color: "var(--term-cmd)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {line.text}
                  </span>
                </div>
              );
            }
            if (line.type === "stderr") {
              return (
                <div key={i} style={{ color: "var(--term-red)", whiteSpace: "pre-wrap", wordBreak: "break-all", marginBottom: 2 }}>
                  {line.text}
                </div>
              );
            }
            if (line.type === "info") {
              return (
                <div key={i} style={{ color: "var(--term-dim)", whiteSpace: "pre-wrap", marginBottom: 2, fontStyle: "italic" }}>
                  {line.text}
                </div>
              );
            }
            // stdout
            return (
              <div key={i} style={{ color: "var(--term-ink)", whiteSpace: "pre-wrap", wordBreak: "break-all", marginBottom: 2 }}>
                {line.text}
              </div>
            );
          })}

          {/* Running indicator */}
          {running && (
            <div style={{ color: "var(--term-yel)", fontStyle: "italic" }}>running…</div>
          )}
        </div>

        {/* Input row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            background: "rgba(255,255,255,0.02)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: FONT,
              fontSize: 13,
              color: "var(--term-grn)",
              userSelect: "none",
              flexShrink: 0,
            }}
          >
            $
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={running}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            placeholder={running ? "" : "Enter command…"}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontFamily: FONT,
              fontSize: 12.5,
              color: "var(--term-ink)",
              caretColor: "var(--term-grn)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
