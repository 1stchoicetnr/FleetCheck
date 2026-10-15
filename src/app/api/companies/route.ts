import { errorResponse } from "@/lib/server/api-error";
import { NextResponse } from "next/server";
import { listCompanies, SharedBackendError } from "@/lib/server/checkout-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const companies = await listCompanies();
    return NextResponse.json(
      { companies },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Failed to load companies");
  }
}
