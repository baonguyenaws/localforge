/**
 * Shared cloud provider definitions and localStorage helpers.
 * Used by both CloudSettingsForm (settings page) and
 * ProjectSettingsDialog (project-level model picker).
 */

export type CloudProviderDef = {
  id: string;
  name: string;
  description: string;
  docsUrl: string;
  logo: string;
  /** "apiKey" = nhập key thủ công | "oauth" = đăng nhập qua OAuth/Subscription */
  authType: "apiKey" | "oauth";
  apiKeyPlaceholder?: string;
  /** Label hiển thị trên nút OAuth */
  oauthLabel?: string;
  /** URL để bắt đầu OAuth flow (nếu authType === "oauth") */
  oauthUrl?: string;
  defaultBaseUrl?: string;
  modelOptions: string[];
};

export const CLOUD_PROVIDER_DEFS: CloudProviderDef[] = [
  {
    id: "opencode",
    name: "OpenCode",
    description: "OpenCode AI — use your API key to access cloud models.",
    docsUrl: "https://opencode.ai",
    logo: "⚡",
    authType: "apiKey",
    apiKeyPlaceholder: "sk-...",
    modelOptions: ["claude-sonnet-4-6", "gpt-4o", "gemini-2.5-pro"],
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, GPT-4 Turbo, GPT-3.5 — industry-standard models from OpenAI.",
    docsUrl: "https://platform.openai.com/api-keys",
    logo: "🟢",
    authType: "apiKey",
    apiKeyPlaceholder: "sk-...",
    modelOptions: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude 3.5, Claude 3 Opus/Sonnet/Haiku — powerful reasoning and coding models.",
    docsUrl: "https://console.anthropic.com/settings/keys",
    logo: "🟠",
    authType: "apiKey",
    apiKeyPlaceholder: "sk-ant-...",
    modelOptions: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-3-5-haiku-latest"],
  },
  {
    id: "google",
    name: "Google Gemini",
    description: "Gemini 1.5 Pro, Gemini Flash — Google's multimodal AI models.",
    docsUrl: "https://aistudio.google.com/app/apikey",
    logo: "🔵",
    authType: "apiKey",
    apiKeyPlaceholder: "AIza...",
    modelOptions: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-1.5-pro"],
  },
  {
    id: "github_copilot",
    name: "GitHub Copilot",
    description: "GitHub Copilot models via your GitHub subscription — GPT-4o, Claude, Gemini và nhiều hơn.",
    docsUrl: "https://github.com/settings/copilot",
    logo: "🐙",
    authType: "oauth",
    oauthLabel: "Sign in with GitHub",
    oauthUrl: "https://github.com/login/oauth/authorize",
    modelOptions: ["gpt-4o", "claude-sonnet-4-5", "gemini-2.5-pro", "o3-mini"],
  },
];

export type CloudConfig = {
  [providerId: string]: {
    enabled: boolean;
    apiKey: string;
    baseUrl: string;
    model: string;
    secretKey?: string;
    region?: string;
    /** OAuth access token (for oauth providers) */
    oauthToken?: string;
  };
};

export function loadCloudSettings(): CloudConfig {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("lf_cloud_settings");
    return raw ? (JSON.parse(raw) as CloudConfig) : {};
  } catch {
    return {};
  }
}

export type EnabledCloudModel = {
  /** e.g. "cloud::openai::gpt-4o" — stable key for storage */
  value: string;
  label: string;
  providerName: string;
  providerLogo: string;
  model: string;
  providerId: string;
};

/**
 * Returns all cloud models the user has enabled (API key / oauth token set + enabled flag).
 * Each item carries a composite `value` = `"cloud::<providerId>::<model>"` so it
 * can be stored as the `model` field in project settings without extra DB columns.
 *
 * `cfg.apiKey` may be empty when loaded from the server (masked). Use the
 * `_hasApiKey` sentinel field set by CloudSettingsForm to detect a saved key.
 */
export function getEnabledCloudModels(config: CloudConfig): EnabledCloudModel[] {
  const out: EnabledCloudModel[] = [];
  for (const def of CLOUD_PROVIDER_DEFS) {
    const cfg = config[def.id] as (CloudConfig[string] & { _hasApiKey?: boolean; _hasOauthToken?: boolean }) | undefined;
    if (!cfg?.enabled) continue;

    // Check auth: apiKey providers need a key, oauth providers need a token
    const hasAuth =
      def.authType === "oauth"
        ? !!(cfg as Record<string, unknown>)["_hasOauthToken"] || !!cfg.oauthToken
        : !!cfg.apiKey || !!(cfg as Record<string, unknown>)["_hasApiKey"];
    if (!hasAuth) continue;

    const activeModel = cfg.model || def.modelOptions[0];
    for (const m of def.modelOptions) {
      out.push({
        value: `cloud::${def.id}::${m}`,
        label: m,
        providerName: def.name,
        providerLogo: def.logo,
        model: m,
        providerId: def.id,
      });
    }
    if (activeModel && !def.modelOptions.includes(activeModel)) {
      out.push({
        value: `cloud::${def.id}::${activeModel}`,
        label: activeModel,
        providerName: def.name,
        providerLogo: def.logo,
        model: activeModel,
        providerId: def.id,
      });
    }
  }
  return out;
}
