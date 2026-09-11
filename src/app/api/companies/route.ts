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
    const status = err instanceof SharedBackendError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load companies" },
      { status }
    );
  }
}
