"use client";

import { forwardRef, useState, useEffect, useCallback, useImperativeHandle } from "react";
import {
  CLOUD_PROVIDER_DEFS,
  type CloudConfig,
} from "@/lib/cloud-providers";

type ServerProviderState = {
  enabled: boolean;
  hasApiKey: boolean;
  hasOauthToken?: boolean;
  baseUrl?: string;
  region?: string;
  hasSecretKey?: boolean;
  model?: string;
};

/** State for dynamic model loading per provider */
type ModelLoadState = {
  status: "idle" | "loading" | "success" | "error";
  models: string[];
  error?: string;
};

/** Providers that support dynamic model listing */
const DYNAMIC_MODEL_PROVIDERS = new Set([
  "openai", "anthropic", "google", "mistral", "deepseek", "xai", "openrouter", "azure_openai",
  // "opencode" excluded: their /v1/models endpoint does not exist
]);

export type CloudSettingsFormHandle = {
  save: () => Promise<{ ok: boolean; error?: string }>;
};

export const CloudSettingsForm = forwardRef<CloudSettingsFormHandle>(function CloudSettingsForm(_, ref) {
  const [config, setConfig] = useState<CloudConfig>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [modelStates, setModelStates] = useState<Record<string, ModelLoadState>>({});

  useImperativeHandle(ref, () => ({
    async save() {
      setSaveError(null);
      try {
        const res = await fetch("/api/settings/cloud", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildPayload()),
        });
        const data = await res.json() as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `Save failed (HTTP ${res.status})` };
        syncLocalStorage(config);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Unexpected error" };
      }
    },
  }));

  // Load existing configs from server on mount
  useEffect(() => {
    fetch("/api/settings/cloud", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { providers?: Record<string, ServerProviderState> }) => {
        if (!data.providers) return;
        const initial: CloudConfig = {};
        for (const [id, p] of Object.entries(data.providers)) {
          initial[id] = {
            enabled: p.enabled,
            apiKey: "",
            baseUrl: p.baseUrl ?? "",
            model: p.model ?? "",
            secretKey: "",
            region: p.region ?? "",
            _hasApiKey: p.hasApiKey,
            _hasOauthToken: p.hasOauthToken,
          } as CloudConfig[string];
        }
        setConfig(initial);
      })
      .catch(() => {/* ignore — use empty state */});
  }, []);

  function getProviderConfig(id: string) {
    return config[id] ?? { enabled: false, apiKey: "", baseUrl: "", model: "", secretKey: "", region: "" };
  }

  function updateProvider(id: string, patch: Partial<CloudConfig[string]>) {
    setSaveError(null);
    setConfig((prev) => ({
      ...prev,
      [id]: { ...getProviderConfig(id), ...patch },
    }));
  }

  /** Fetch available models from the cloud provider API */
  const fetchModels = useCallback(async (providerId: string, apiKey?: string, baseUrl?: string) => {
    if (!DYNAMIC_MODEL_PROVIDERS.has(providerId)) return;

    setModelStates((prev) => ({
      ...prev,
      [providerId]: { status: "loading", models: [] },
    }));

    try {
      const res = await fetch("/api/providers/cloud-models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerId, apiKey: apiKey || undefined, baseUrl: baseUrl || undefined }),
      });
      const data = (await res.json()) as { ok: boolean; models: string[]; error?: string };

      if (data.ok && data.models.length > 0) {
        setModelStates((prev) => ({
          ...prev,
          [providerId]: { status: "success", models: data.models },
        }));
        // Auto-select first model if none selected
        setConfig((prev) => {
          const existing = prev[providerId];
          if (!existing?.model) {
            return { ...prev, [providerId]: { ...(existing ?? { enabled: false, apiKey: "", baseUrl: "", model: "", secretKey: "", region: "" }), model: data.models[0] } };
          }
          return prev;
        });
      } else {
        setModelStates((prev) => ({
          ...prev,
          [providerId]: { status: "error", models: [], error: data.error ?? "No models returned" },
        }));
      }
    } catch (err) {
      setModelStates((prev) => ({
        ...prev,
        [providerId]: {
          status: "error",
          models: [],
          error: err instanceof Error ? err.message : "Failed to fetch models",
        },
      }));
    }
  }, []);

  /** Called when user blurs the API key input */
  function handleApiKeyBlur(providerId: string, apiKey: string, baseUrl?: string) {
    // If user has explicitly cleared the input, do NOT fetch using the saved DB key
    // (empty input = user intends to delete the key)
    if (!apiKey) return;
    fetchModels(providerId, apiKey, baseUrl);
  }

  /** Build the PUT payload for one or all providers */
  const buildPayload = useCallback(
    (overrideConfig?: CloudConfig) => {
      const cfg = overrideConfig ?? config;
      const providers: Record<string, Record<string, unknown>> = {};
      for (const def of CLOUD_PROVIDER_DEFS) {
        const c = (cfg[def.id] ?? { enabled: false, apiKey: "", baseUrl: "", model: "", secretKey: "", region: "" }) as Record<string, unknown>;
        providers[def.id] = {
          enabled: c["enabled"],
          baseUrl: c["baseUrl"] || undefined,
          region: c["region"] || undefined,
          model: c["model"] || undefined,
          ...(c["apiKey"] ? { apiKey: c["apiKey"] } : {}),
          ...(c["secretKey"] ? { secretKey: c["secretKey"] } : {}),
          ...(c["oauthToken"] ? { oauthToken: c["oauthToken"] } : {}),
        };
      }
      return { providers };
    },
    [config]
  );

  /** Sync enabled status to localStorage for UnifiedModelPicker */
  function syncLocalStorage(cfg: CloudConfig) {
    localStorage.setItem("lf_cloud_settings", JSON.stringify(
      Object.fromEntries(
        CLOUD_PROVIDER_DEFS.map((def) => {
          const c = cfg[def.id];
          return [def.id, {
            enabled: c?.enabled ?? false,
            apiKey: (c as Record<string, unknown>)?.["_hasApiKey"] || c?.apiKey ? "set" : "",
            model: c?.model ?? "",
          }];
        })
      )
    ));
  }

  /** Auto-save triggered when toggle is flipped — now just updates local state */
  function handleToggle(providerId: string, newEnabled: boolean) {
    setConfig((prev) => ({
      ...prev,
      [providerId]: { ...getProviderConfig(providerId), enabled: newEnabled },
    }));
  }

  /** Open OAuth popup and wait for token callback */
  function handleOAuthSignIn(providerId: string, oauthUrl: string) {
    // Open provider auth page in new tab
    // In a real implementation this would use a popup + postMessage or a redirect callback.
    // For now we open the page and let the user copy the token back.
    window.open(oauthUrl, "_blank", "noopener,noreferrer");
  }

  /** Delete all saved data for a provider (API key, model, enabled state, etc.) */
  async function handleDeleteProvider(providerId: string) {
    setSaveError(null);
    try {
      const res = await fetch(`/api/settings/cloud/${providerId}`, {
        method: "DELETE",
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setSaveError(data.error ?? `Delete failed (HTTP ${res.status})`);
        return;
      }
      // Reset local state for this provider
      setConfig((prev) => ({
        ...prev,
        [providerId]: {
          enabled: false,
          apiKey: "",
          baseUrl: "",
          model: "",
          secretKey: "",
          region: "",
        } as CloudConfig[string],
      }));
      // Clear model cache for this provider
      setModelStates((prev) => {
        const next = { ...prev };
        delete next[providerId];
        return next;
      });
      // Collapse if expanded
      if (expandedProvider === providerId) setExpandedProvider(null);
      // Sync localStorage with cleared state
      const clearedConfig: CloudConfig = {
        ...config,
        [providerId]: { enabled: false, apiKey: "", baseUrl: "", model: "", secretKey: "", region: "" } as CloudConfig[string],
      };
      syncLocalStorage(clearedConfig);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Delete error");
    }
  }

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const enabledCount = Object.values(config).filter((c) => c.enabled).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="text-xs text-muted-foreground">
          Configure cloud AI providers. Enabled providers can be selected
          per-project as an alternative to your local model server.{" "}
          <span className="font-medium text-foreground">
            {enabledCount} provider{enabledCount !== 1 ? "s" : ""} enabled.
          </span>
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {CLOUD_PROVIDER_DEFS.map((provider) => {
          const cfg = getProviderConfig(provider.id);
          const isExpanded = expandedProvider === provider.id;
          const hasOauthToken = !!(cfg as Record<string, unknown>)["_hasOauthToken"] || !!cfg.oauthToken;
          const hasApiKey = !!(cfg as Record<string, unknown>)["_hasApiKey"] || !!cfg.apiKey;
          const isAuthenticated = provider.authType === "oauth" ? hasOauthToken : hasApiKey;
          const modelState = modelStates[provider.id];
          const dynamicModels = modelState?.status === "success" ? modelState.models : [];
          const availableModels = dynamicModels.length > 0 ? dynamicModels : provider.modelOptions;

          return (
            <div
              key={provider.id}
              className={`rounded-lg border transition-colors ${
                cfg.enabled
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-card"
              } shadow-sm`}
            >
              {/* Header row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-xl" aria-hidden="true">
                  {provider.logo}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {provider.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {provider.description}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isAuthenticated && (
                    <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                      {provider.authType === "oauth" ? "Connected" : "Key saved"}
                    </span>
                  )}
                  {cfg.enabled && (
                    <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                      Active
                    </span>
                  )}
                  {/* Toggle switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={cfg.enabled}
                    onClick={() => handleToggle(provider.id, !cfg.enabled)}
                    className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      cfg.enabled ? "bg-primary" : "bg-muted"
                    }`}
                    title={cfg.enabled ? "Disable provider" : "Enable provider"}
                  >
                    <div
                      className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        cfg.enabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newExpanded = isExpanded ? null : provider.id;
                      setExpandedProvider(newExpanded);
                      // Auto-fetch models when opening if provider has a saved key and no models loaded yet
                      if (newExpanded && DYNAMIC_MODEL_PROVIDERS.has(provider.id) && hasApiKey && !modelStates[provider.id]) {
                        fetchModels(provider.id, cfg.apiKey || undefined, cfg.baseUrl);
                      }
                    }}
                    className="rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground shadow-sm hover:bg-muted/60 transition-colors"
                  >
                    {isExpanded ? "Close" : "Configure"}
                  </button>
                  {/* Delete button — only shown when provider has saved data */}
                  {isAuthenticated && (
                    confirmDelete === provider.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-destructive font-medium">Delete?</span>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDelete(null);
                            handleDeleteProvider(provider.id);
                          }}
                          className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground hover:opacity-90 transition-opacity"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground hover:bg-muted/60 transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(provider.id)}
                        className="rounded-md border border-destructive/40 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                        title="Delete all saved data for this provider"
                      >
                        Delete
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Expanded config panel */}
              {isExpanded && (
                <div className="border-t border-border px-4 pb-4 pt-3 flex flex-col gap-3">

                  {provider.authType === "oauth" ? (
                    /* OAuth / Subscription flow */
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">Subscription</p>
                          <p className="text-xs text-muted-foreground">
                            {hasOauthToken
                              ? "Connected via your subscription account."
                              : "Sign in to link your subscription."}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {hasOauthToken ? (
                            <>
                              <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                                ✓ Signed in
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  updateProvider(provider.id, { oauthToken: "" });
                                  setConfig((prev) => ({
                                    ...prev,
                                    [provider.id]: {
                                      ...getProviderConfig(provider.id),
                                      oauthToken: "",
                                      _hasOauthToken: false,
                                    } as CloudConfig[string],
                                  }));
                                }}
                                className="rounded-md border border-destructive/50 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                Disconnect
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                handleOAuthSignIn(provider.id, provider.oauthUrl ?? provider.docsUrl)
                              }
                              className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 transition-opacity"
                            >
                              {provider.logo} {provider.oauthLabel ?? "Sign in"}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Manual token fallback */}
                      {!hasOauthToken && (
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-foreground">
                            Or paste access token manually
                          </label>
                          <input
                            type="password"
                            value={cfg.oauthToken ?? ""}
                            onChange={(e) =>
                              updateProvider(provider.id, { oauthToken: e.target.value })
                            }
                            placeholder="Paste token from your subscription dashboard…"
                            spellCheck={false}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
                          />
                        </div>
                      )}

                      <a
                        href={provider.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground underline hover:text-foreground self-start"
                      >
                        Manage subscription ↗
                      </a>
                    </div>
                  ) : (
                    /* API Key flow */
                    <>
                      {/* API Key */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-foreground">
                            {provider.id === "bedrock" ? "Access Key ID" : "API Key"}
                          </label>
                          <a
                            href={provider.docsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-muted-foreground underline hover:text-foreground"
                          >
                            Get API key ↗
                          </a>
                        </div>
                        <input
                          type="password"
                          value={cfg.apiKey}
                          onChange={(e) =>
                            updateProvider(provider.id, { apiKey: e.target.value })
                          }
                          onBlur={(e) =>
                            handleApiKeyBlur(provider.id, e.target.value, cfg.baseUrl)
                          }
                          placeholder={
                            hasApiKey
                              ? "••••••••••••  (already saved — type to replace)"
                              : provider.apiKeyPlaceholder
                          }
                          spellCheck={false}
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
                        />
                        {hasApiKey && !cfg.apiKey && (
                          <p className="text-xs text-green-600 dark:text-green-400">
                            API key saved. Leave blank to keep existing key.
                          </p>
                        )}
                      </div>

                      {/* AWS Bedrock secret key */}
                      {provider.id === "bedrock" && (
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-foreground">
                            Secret Access Key
                          </label>
                          <input
                            type="password"
                            value={cfg.secretKey ?? ""}
                            onChange={(e) =>
                              updateProvider(provider.id, {
                                secretKey: e.target.value,
                              })
                            }
                            placeholder="Secret key..."
                            spellCheck={false}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
                          />
                        </div>
                      )}

                      {/* Region for Azure/Bedrock */}
                      {(provider.id === "azure_openai" ||
                        provider.id === "bedrock") && (
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-foreground">
                            {provider.id === "azure_openai"
                              ? "Deployment / Resource Name"
                              : "AWS Region"}
                          </label>
                          <input
                            type="text"
                            value={cfg.region ?? ""}
                            onChange={(e) =>
                              updateProvider(provider.id, {
                                region: e.target.value,
                              })
                            }
                            placeholder={
                              provider.id === "azure_openai"
                                ? "my-resource-name"
                                : "us-east-1"
                            }
                            spellCheck={false}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        </div>
                      )}

                      {/* Custom Base URL (optional) */}
                      {provider.defaultBaseUrl && (
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-foreground">
                            Base URL
                          </label>
                          <input
                            type="text"
                            value={cfg.baseUrl || provider.defaultBaseUrl}
                            onChange={(e) =>
                              updateProvider(provider.id, {
                                baseUrl: e.target.value,
                              })
                            }
                            placeholder={provider.defaultBaseUrl}
                            spellCheck={false}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
                          />
                        </div>
                      )}
                    </>
                  )}

                  {/* Model selector — only shown when API key is verified (fetch success) or already saved in DB */}
                  {(modelState?.status === "success" || modelState?.status === "loading" ||
                    (hasApiKey && !cfg.apiKey)) && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-foreground">
                          Default Model
                        </label>
                        {DYNAMIC_MODEL_PROVIDERS.has(provider.id) && (
                          <button
                            type="button"
                            disabled={modelState?.status === "loading"}
                            onClick={() => fetchModels(provider.id, cfg.apiKey || undefined, cfg.baseUrl)}
                            className="text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {modelState?.status === "loading" ? "Loading…" : "Reload models"}
                          </button>
                        )}
                      </div>

                      {modelState?.status === "loading" ? (
                        <div className="h-9 w-full rounded-md border border-input bg-muted/30 px-3 flex items-center gap-2 text-sm text-muted-foreground">
                          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Loading models from API…
                        </div>
                      ) : (
                        <select
                          value={cfg.model || availableModels[0] || ""}
                          onChange={(e) =>
                            updateProvider(provider.id, { model: e.target.value })
                          }
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {cfg.model && !availableModels.includes(cfg.model) && (
                            <option value={cfg.model}>{cfg.model}</option>
                          )}
                          {availableModels.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      )}

                      {modelState?.status === "success" && dynamicModels.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {dynamicModels.length} models loaded from provider API.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Error: API key invalid */}
                  {modelState?.status === "error" && (
                    <p className="text-xs text-destructive">
                      Could not verify API key: {modelState.error}
                    </p>
                  )}

                  {/* Hint: show when no key verified and no models loaded */}
                  {provider.authType === "apiKey" && !hasApiKey && !cfg.apiKey &&
                    modelState?.status !== "success" && modelState?.status !== "loading" &&
                    modelState?.status !== "error" &&
                    DYNAMIC_MODEL_PROVIDERS.has(provider.id) && (
                    <p className="text-xs text-muted-foreground italic">
                      Enter your API key above and press Tab to load available models.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {saveError && (
        <p className="text-sm text-destructive">{saveError}</p>
      )}
    </div>
  );
});
