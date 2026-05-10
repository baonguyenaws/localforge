export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getCloudProviderConfig, CLOUD_BASE_URLS } from "@/lib/cloud-settings";
import { CLOUD_PROVIDER_DEFS } from "@/lib/cloud-providers";

/**
 * POST /api/providers/cloud-models
 * Fetch the list of available models from a cloud provider's API.
 * The API key is read from the DB (saved key) or from the request body (unsaved key).
 *
 * Body: { providerId: string; apiKey?: string; baseUrl?: string }
 * Response: { ok: boolean; models: string[]; error?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      providerId: string;
      apiKey?: string;
      baseUrl?: string;
    };

    const { providerId, apiKey: inputApiKey, baseUrl: inputBaseUrl } = body;

    const def = CLOUD_PROVIDER_DEFS.find((p) => p.id === providerId);
    if (!def) {
      return NextResponse.json({ ok: false, error: "Unknown provider", models: [] }, { status: 404 });
    }

    // Get the saved config from DB (for API key lookup when user hasn't typed a new one)
    const savedConfig = getCloudProviderConfig(providerId);
    const apiKey = inputApiKey || savedConfig.apiKey;

    if (!apiKey && def.authType === "apiKey") {
      return NextResponse.json({ ok: false, error: "No API key provided", models: [] }, { status: 400 });
    }

    const baseUrl = inputBaseUrl || savedConfig.baseUrl || CLOUD_BASE_URLS[providerId] || "";

    const models = await fetchModelsForProvider(providerId, apiKey, baseUrl, savedConfig);
    return NextResponse.json({ ok: true, models });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to fetch models", models: [] },
      { status: 500 }
    );
  }
}

async function fetchModelsForProvider(
  providerId: string,
  apiKey: string,
  baseUrl: string,
  savedConfig: Awaited<ReturnType<typeof getCloudProviderConfig>>
): Promise<string[]> {
  switch (providerId) {
    case "openai":
    case "deepseek":
    case "xai":
    case "mistral":
    case "openrouter":
    case "opencode":
      return fetchOpenAICompatibleModels(baseUrl, apiKey);

    case "google":
      return fetchGoogleModels(apiKey);

    case "anthropic":
      // Anthropic doesn't have a public /models endpoint — return hardcoded list
      return fetchAnthropicModels(apiKey);

    case "azure_openai":
      return fetchAzureModels(baseUrl, apiKey);

    case "bedrock":
      // AWS Bedrock requires SDK, skip dynamic fetch
      throw new Error("AWS Bedrock model listing is not supported dynamically");

    default:
      throw new Error(`Dynamic model listing not supported for provider: ${providerId}`);
  }
}

async function fetchOpenAICompatibleModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/models`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    throw new Error(`Provider returned HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  let data: { data?: Array<{ id: string }> };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Provider returned a non-JSON response (the /models endpoint may not be supported)`);
  }
  if (!Array.isArray(data.data)) throw new Error("Unexpected response format from provider");

  return data.data
    .map((m) => m.id)
    .filter(Boolean)
    .sort();
}

async function fetchGoogleModels(apiKey: string): Promise<string[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google API returned HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> };
  if (!Array.isArray(data.models)) throw new Error("Unexpected response format from Google");

  return data.models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .sort();
}

async function fetchAnthropicModels(apiKey: string): Promise<string[]> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API returned HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { data?: Array<{ id: string }> };
  if (!Array.isArray(data.data)) throw new Error("Unexpected response format from Anthropic");

  return data.data.map((m) => m.id).sort();
}

async function fetchAzureModels(baseUrl: string, apiKey: string): Promise<string[]> {
  if (!baseUrl) throw new Error("Azure OpenAI requires a Base URL (resource endpoint)");
  const url = `${baseUrl.replace(/\/$/, "")}/openai/models?api-version=2024-02-01`;
  const res = await fetch(url, {
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Azure returned HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { value?: Array<{ id: string }> };
  if (!Array.isArray(data.value)) throw new Error("Unexpected response format from Azure");

  return data.value.map((m) => m.id).sort();
}
