export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getFeature } from "@/lib/features";
import { listAgentLogsForFeature } from "@/lib/agent/logs";
import {
  streamChatCompletion,
  type LMStudioChatMessage,
} from "@/lib/agent/lm-studio";
import { getEffectiveProviderConfig } from "@/lib/settings";
import { resolveCloudModelConfig } from "@/lib/cloud-settings";
import {
  listChatMessagesForFeature,
  appendChatMessage,
} from "@/lib/feature-chat";

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * GET /api/features/:id/chat
 *
 * Returns persisted chat history for a feature.
 * Response: { messages: ChatMessage[] }
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const featureId = parseId(id);
  if (featureId == null) {
    return NextResponse.json({ error: "Invalid feature id" }, { status: 400 });
  }
  const feature = getFeature(featureId);
  if (!feature) {
    return NextResponse.json({ error: "Feature not found" }, { status: 404 });
  }
  const rows = listChatMessagesForFeature(featureId);
  const messages: ChatMessage[] = rows.map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content,
  }));
  return NextResponse.json({ messages });
}

/**
 * POST /api/features/:id/chat
 *
 * Streams an AI response about the feature as Server-Sent Events.
 *
 * Request body:
 *   { message: string; history?: ChatMessage[] }
 *
 * The system prompt includes the full feature context:
 *   - Title, Description, Acceptance Criteria
 *   - Agent activity logs (all runs)
 *
 * Events emitted:
 *   {"type":"delta","content":string}   — incremental text chunks
 *   {"type":"done"}                     — stream complete
 *   {"type":"error","message":string}   — provider unavailable
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const featureId = parseId(id);
  if (featureId == null) {
    return NextResponse.json({ error: "Invalid feature id" }, { status: 400 });
  }

  const feature = getFeature(featureId);
  if (!feature) {
    return NextResponse.json({ error: "Feature not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message } = (body ?? {}) as {
    message?: unknown;
  };

  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json(
      { error: "Field 'message' is required" },
      { status: 400 },
    );
  }

  // Load full chat history from DB — this is the source of truth.
  const savedHistory = listChatMessagesForFeature(featureId);
  const safeHistory: ChatMessage[] = savedHistory.map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content,
  }));

  // Persist the user message immediately before streaming.
  appendChatMessage(featureId, "user", message.trim());

  // Build feature context block
  const logs = listAgentLogsForFeature(featureId);

  // Cap logs to last 100 entries to avoid overflowing context windows on
  // small local models while still providing meaningful activity history.
  const recentLogs = logs.slice(-100);
  const agentActivityText =
    recentLogs.length > 0
      ? recentLogs
          .map((l) => `[${l.messageType.toUpperCase()}] ${l.message}`)
          .join("\n")
      : "No agent activity recorded yet.";

  const contextBlock = `Below is the complete context for the feature you must answer questions about.

**Feature Title:** ${feature.title}
**Status:** ${feature.status}

**Description:**
${feature.description ?? "(not provided)"}

**Acceptance Criteria:**
${feature.acceptanceCriteria ?? "(not provided)"}

**Agent Activity Log:**
${agentActivityText}`;

  // Brief, direct system prompt. Local models respond more reliably to short
  // system prompts; the heavy lifting is done by injecting context into the
  // user turn or as a synthetic opening exchange.
  const systemPrompt = `You are a helpful assistant. The user will provide you with a software feature's details and ask questions about it. Answer only based on the provided context. Be concise and specific.`;

  let llmMessages: LMStudioChatMessage[];

  if (safeHistory.length === 0) {
    // First message: inject the full context block directly into the user turn
    // so the model is guaranteed to "read" it regardless of system-prompt handling.
    llmMessages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `${contextBlock}\n\n---\n\nMy question: ${message.trim()}`,
      },
    ];
  } else {
    // Subsequent messages: re-inject context as a synthetic opening exchange so
    // it stays visible at the top of the conversation window even as history grows.
    llmMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: contextBlock },
      {
        role: "assistant",
        content:
          "I've reviewed the feature details. I'm ready to help — what would you like to know?",
      },
      ...safeHistory,
      { role: "user", content: message.trim() },
    ];
  }

  const rawConfig = getEffectiveProviderConfig(feature.projectId);
  let { baseUrl, model } = rawConfig;

  // Detect cloud model composite value e.g. "cloud::openai::gpt-4o"
  // — same resolution logic as the orchestrator.
  const cloudMatch = resolveCloudModelConfig(model);
  let cloudApiKey = "";
  if (cloudMatch) {
    baseUrl = cloudMatch.baseUrl;
    model = cloudMatch.model;
    cloudApiKey = cloudMatch.apiKey;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
        );
      };

      let assistantContent = "";
      let hadError = false;

      try {
        for await (const evt of streamChatCompletion({
          baseUrl,
          model,
          messages: llmMessages,
          signal: req.signal,
          apiKey: cloudApiKey || undefined,
        })) {
          if (evt.type === "delta") {
            assistantContent += evt.content;
            send({ type: "delta", content: evt.content });
          } else if (evt.type === "error") {
            hadError = true;
            send({ type: "error", message: evt.message });
            break;
          }
        }
        // Persist the complete assistant response only if no error occurred.
        if (!hadError && assistantContent) {
          appendChatMessage(featureId, "assistant", assistantContent);
        }
        send({ type: "done" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
