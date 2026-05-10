import { NextResponse } from "next/server";
import {
  getAllCloudConfigs,
  saveCloudProviderConfig,
} from "@/lib/cloud-settings";
import { CLOUD_PROVIDER_DEFS } from "@/lib/cloud-providers";

/**
 * GET /api/settings/cloud
 * Returns all cloud provider configs (API keys are masked for security).
 */
export async function GET() {
  try {
    const configs = getAllCloudConfigs();
    // Mask API keys — return only whether one is set, not the value
    const masked = Object.fromEntries(
      Object.entries(configs).map(([id, cfg]) => [
        id,
        {
          enabled: cfg.enabled,
          hasApiKey: !!cfg.apiKey,
          hasOauthToken: !!cfg.oauthToken,
          baseUrl: cfg.baseUrl,
          region: cfg.region,
          hasSecretKey: !!cfg.secretKey,
          model: cfg.model,
        },
      ]),
    );
    return NextResponse.json({ providers: masked });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load cloud settings" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/settings/cloud
 * Saves cloud provider API keys and config to the DB.
 * Body: { providers: { [providerId]: { apiKey, baseUrl, region, secretKey, enabled, model } } }
 */
export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      providers?: Record<
        string,
        {
          apiKey?: string;
          oauthToken?: string;
          baseUrl?: string;
          region?: string;
          secretKey?: string;
          enabled?: boolean;
          model?: string;
        }
      >;
    };

    if (!body.providers || typeof body.providers !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const validIds = new Set(CLOUD_PROVIDER_DEFS.map((p) => p.id));

    for (const [providerId, cfg] of Object.entries(body.providers)) {
      if (!validIds.has(providerId)) continue; // ignore unknown providers
      saveCloudProviderConfig(providerId, {
        apiKey: cfg.apiKey,
        oauthToken: cfg.oauthToken,
        baseUrl: cfg.baseUrl,
        region: cfg.region,
        secretKey: cfg.secretKey,
        enabled: cfg.enabled,
        model: cfg.model,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save cloud settings" },
      { status: 500 },
    );
  }
}
