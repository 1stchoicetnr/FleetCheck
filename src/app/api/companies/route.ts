import { errorResponse } from "@/lib/server/api-error";
import { NextResponse } from "next/server";
import { listCompanies } from "@/lib/server/checkout-repo";
import { assertApprovedUser } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await assertApprovedUser(req);
    const companies = await listCompanies(auth.orgId);
    return NextResponse.json(
      { companies },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Failed to load companies");
  }
}
