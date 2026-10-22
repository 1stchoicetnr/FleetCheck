import { CompanySettingsError, type CompanySettingsPatch } from "@/lib/company-settings";
import { errorResponse } from "@/lib/server/api-error";
import { AuthError } from "@/lib/server/auth-accounts";
import { getPublicCompanySettings, saveCompanySettings } from "@/lib/server/checkout-repo";
import { companyIdsInScope } from "@/lib/server/fleet-scope";
import { assertOwnerAccess, orgIdFromRequest, resolveRequestAuth } from "@/lib/server/request-auth";
import { NextResponse } from "next/server";

const COMPANY_WIDE_KEYS = [
  "fleetTypes",
  "photos",
  "slackWebhook",
  "clearSlackWebhook",
  "cloverCompanyIds",
  "pdfLogoDataUrl",
  "clearPdfLogo",
] as const;

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
    const session = await resolveRequestAuth(req);
    const body = (await req.json()) as CompanySettingsPatch;
    let patch = body;
    let auth = session;
    if (session.role === "manager") {
      const extra = COMPANY_WIDE_KEYS.filter((key) => body[key] !== undefined);
      if (extra.length > 0 || !body.checkoutSlack) {
        throw new AuthError("Company-wide settings stay with the owner.", 403);
      }
      const companies = (await companyIdsInScope(session)) || [];
      const requested = Object.keys(body.checkoutSlack);
      if (requested.length < 1 || requested.some((id) => !companies.includes(id))) {
        throw new AuthError("That fleet is outside your fleets.", 403);
      }
      patch = { checkoutSlack: body.checkoutSlack };
    } else {
      auth = await assertOwnerAccess(req);
    }
    const settings = await saveCompanySettings(auth.orgId, patch);
    return NextResponse.json({ settings });
  } catch (err) {
    if (err instanceof CompanySettingsError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return errorResponse(err, "Failed to save settings");
  }
}
