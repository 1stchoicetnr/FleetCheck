import { NextResponse } from "next/server";
import { rolloutSlateSnapshot } from "@/lib/server/org-data";
import { orgFromSession } from "@/lib/server/org-scope";
import { openAuthDb } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_KEY = "slate-report-7c2e9a";

export async function GET(req: Request) {
  if (req.headers.get("x-rollout-report") !== REPORT_KEY) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const db = await openAuthDb();
  const snapshot = await rolloutSlateSnapshot(db, orgFromSession());
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
