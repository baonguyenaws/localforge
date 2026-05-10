import "server-only";
import { eq, isNull, and, like } from "drizzle-orm";
import { db } from "./db";
import { settings } from "./db/schema";
import { CLOUD_PROVIDER_DEFS } from "./cloud-providers";

/**
 * Cloud provider API keys are stored in the global settings table under the
 * key pattern `cloud_<providerId>_api_key`, e.g. `cloud_openai_api_key`.
 * Additional fields (baseUrl override, region, secretKey) use similar patterns.
 *
 * This keeps cloud credentials server-side so they are never exposed to the
 * browser beyond the initial save, and survive app restarts.
 */

export type CloudProviderConfig = {
  apiKey: string;
  /** OAuth / subscription access token (for oauth-type providers) */
  oauthToken?: string;
  /** Override base URL (for Azure, etc.) */
  baseUrl?: string;
  /** AWS region (Bedrock) */
  region?: string;
  /** AWS secret access key (Bedrock) */
  secretKey?: string;
  /** Enabled flag */
  enabled: boolean;
  /** Selected default model */
  model: string;
};

/**
 * Well-known OpenAI-compatible base URLs for each provider.
 * If the user hasn't overridden the URL, we use this default.
 */
export const CLOUD_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  mistral: "https://api.mistral.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
  xai: "https://api.x.ai/v1",
  azure_openai: "", // requires user-supplied URL
  bedrock: "", // uses AWS SDK, not HTTP directly
  openrouter: "https://openrouter.ai/api/v1",
  github_copilot: "https://api.githubcopilot.com",
  opencode: "https://api.opencode.ai/v1",
};

function settingKey(providerId: string, field: string): string {
  return `cloud_${providerId}_${field}`;
}

function readGlobal(key: string): string | null {
  const row = db
    .select()
    .from(settings)
    .where(and(eq(settings.key, key), isNull(settings.projectId)))
    .get();
  return row?.value ?? null;
}

function writeGlobal(key: string, value: string): void {
  const existing = db
    .select()
    .from(settings)
    .where(and(eq(settings.key, key), isNull(settings.projectId)))
    .get();
  if (existing) {
    db.update(settings).set({ value }).where(eq(settings.id, existing.id)).run();
  } else {
    db.insert(settings).values({ key, value, projectId: null }).run();
  }
}

function deleteGlobal(key: string): void {
  db.delete(settings)
    .where(and(eq(settings.key, key), isNull(settings.projectId)))
    .run();
}

export function getCloudProviderConfig(
  providerId: string,
): CloudProviderConfig {
  const apiKey = readGlobal(settingKey(providerId, "api_key")) ?? "";
  const oauthToken = readGlobal(settingKey(providerId, "oauth_token")) ?? undefined;
  const baseUrl = readGlobal(settingKey(providerId, "base_url")) ?? undefined;
  const region = readGlobal(settingKey(providerId, "region")) ?? undefined;
  const secretKey = readGlobal(settingKey(providerId, "secret_key")) ?? undefined;
  const enabled = readGlobal(settingKey(providerId, "enabled")) === "true";
  const def = CLOUD_PROVIDER_DEFS.find((p) => p.id === providerId);
  const model =
    readGlobal(settingKey(providerId, "model")) ??
    def?.modelOptions[0] ??
    "";
  return { apiKey, oauthToken, baseUrl, region, secretKey, enabled, model };
}

export function getAllCloudConfigs(): Record<string, CloudProviderConfig> {
  const out: Record<string, CloudProviderConfig> = {};
  for (const def of CLOUD_PROVIDER_DEFS) {
    out[def.id] = getCloudProviderConfig(def.id);
  }
  return out;
}

export type SaveCloudProviderInput = {
  apiKey?: string;
  oauthToken?: string;
  baseUrl?: string;
  region?: string;
  secretKey?: string;
  enabled?: boolean;
  model?: string;
};

export function saveCloudProviderConfig(
  providerId: string,
  input: SaveCloudProviderInput,
): void {
  if (input.apiKey !== undefined) {
    if (input.apiKey) {
      writeGlobal(settingKey(providerId, "api_key"), input.apiKey);
    } else {
      deleteGlobal(settingKey(providerId, "api_key"));
    }
  }
  if (input.oauthToken !== undefined) {
    if (input.oauthToken) {
      writeGlobal(settingKey(providerId, "oauth_token"), input.oauthToken);
    } else {
      deleteGlobal(settingKey(providerId, "oauth_token"));
    }
  }
  if (input.baseUrl !== undefined) {
    if (input.baseUrl) {
      writeGlobal(settingKey(providerId, "base_url"), input.baseUrl);
    } else {
      deleteGlobal(settingKey(providerId, "base_url"));
    }
  }
  if (input.region !== undefined) {
    if (input.region) {
      writeGlobal(settingKey(providerId, "region"), input.region);
    } else {
      deleteGlobal(settingKey(providerId, "region"));
    }
  }
  if (input.secretKey !== undefined) {
    if (input.secretKey) {
      writeGlobal(settingKey(providerId, "secret_key"), input.secretKey);
    } else {
      deleteGlobal(settingKey(providerId, "secret_key"));
    }
  }
  if (input.enabled !== undefined) {
    writeGlobal(settingKey(providerId, "enabled"), input.enabled ? "true" : "false");
  }
  if (input.model !== undefined) {
    if (input.model) {
      writeGlobal(settingKey(providerId, "model"), input.model);
    } else {
      deleteGlobal(settingKey(providerId, "model"));
    }
  }
}

/**
 * Parse a composite cloud model value like `cloud::openai::gpt-4o` and
 * return the provider id and model name.
 */
export function parseCloudModelValue(
  value: string,
): { providerId: string; model: string } | null {
  const parts = value.split("::");
  if (parts.length !== 3 || parts[0] !== "cloud") return null;
  return { providerId: parts[1], model: parts[2] };
}

/**
 * Given a cloud model composite value (`cloud::openai::gpt-4o`), resolve the
 * runtime config needed by the agent runner:
 *   - baseUrl: the API endpoint
 *   - apiKey: from DB
 *   - model: the bare model name
 *   - providerId: e.g. "openai"
 */
export function resolveCloudModelConfig(
  value: string,
): {
  providerId: string;
  model: string;
  baseUrl: string;
  apiKey: string;
} | null {
  const parsed = parseCloudModelValue(value);
  if (!parsed) return null;

  const cfg = getCloudProviderConfig(parsed.providerId);
  const baseUrl =
    cfg.baseUrl ||
    CLOUD_BASE_URLS[parsed.providerId] ||
    "";

  return {
    providerId: parsed.providerId,
    model: parsed.model,
    baseUrl,
    // For OAuth providers, use the oauth token as the bearer key
    apiKey: cfg.oauthToken || cfg.apiKey,
  };
}
