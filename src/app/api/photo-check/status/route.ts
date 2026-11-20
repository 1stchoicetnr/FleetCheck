import { errorResponse } from "@/lib/server/api-error";
import { cleanPhotoCheckSettings, PHOTO_CHECK_MODEL } from "@/lib/photo-check";
import { getPublicCompanySettings } from "@/lib/server/checkout-repo";
import { gatewayLikelyConfigured } from "@/lib/server/photo-check-run";
import { photoCheckSpend } from "@/lib/server/photo-check-wire";
import { assertOfficeAccess } from "@/lib/server/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bot photo check: on/off, monthly cap, this month's spend, and whether an AI Gateway credential is present. Never returns the credential. */
export async function GET(req: Request) {
  try {
    const auth = await assertOfficeAccess(req);
    const [settings, usage] = await Promise.all([
      getPublicCompanySettings(auth.orgId),
      photoCheckSpend(auth.orgId).catch(() => ({ spend: 0, calls: 0 })),
    ]);
    return NextResponse.json(
      {
        settings: cleanPhotoCheckSettings(settings.photoCheck),
        spend: Math.round(usage.spend * 10000) / 10000,
        calls: usage.calls,
        gatewayConfigured: gatewayLikelyConfigured(),
        model: PHOTO_CHECK_MODEL,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Failed to load photo check status");
  }
}
