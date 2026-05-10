import { NextRequest, NextResponse } from "next/server";
import { saveCloudProviderConfig } from "@/lib/cloud-settings";
import { CLOUD_PROVIDER_DEFS } from "@/lib/cloud-providers";

type RouteContext = { params: Promise<{ providerId: string }> };

/**
 * DELETE /api/settings/cloud/:providerId
 * Wipes all saved data for a specific cloud provider.
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { providerId } = await ctx.params;

  const valid = CLOUD_PROVIDER_DEFS.some((p) => p.id === providerId);
  if (!valid) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  try {
    saveCloudProviderConfig(providerId, {
      apiKey: "",
      oauthToken: "",
      baseUrl: "",
      region: "",
      secretKey: "",
      enabled: false,
      model: "",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete provider" },
      { status: 500 }
    );
  }
}
