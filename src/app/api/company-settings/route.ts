import { CompanySettingsError, type CompanySettingsPatch } from "@/lib/company-settings";
import { errorResponse } from "@/lib/server/api-error";
import { getPublicCompanySettings, saveCompanySettings } from "@/lib/server/checkout-repo";
import { assertOwnerAccess, orgIdFromRequest } from "@/lib/server/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const settings = await getPublicCompanySettings(await orgIdFromRequest(req));
    return NextResponse.json(
      { settings },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Failed to load settings");
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await assertOwnerAccess(req);
    const body = (await req.json()) as CompanySettingsPatch;
    const settings = await saveCompanySettings(auth.orgId, body);
    return NextResponse.json({ settings });
  } catch (err) {
    if (err instanceof CompanySettingsError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return errorResponse(err, "Failed to save settings");
  }
}
