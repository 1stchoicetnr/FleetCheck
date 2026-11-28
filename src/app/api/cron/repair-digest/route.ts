import { errorResponse } from "@/lib/server/api-error";
import { orgFromSession } from "@/lib/server/org-scope";
import { runRepairDigest } from "@/lib/server/repair-digest-run";
import { slackCronAuth } from "@/lib/server/slack-delivery";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily Rad Cab damage digest.
 *
 * Hobby cron jobs run at most once per day, so 1:00 PM Pacific cannot be one
 * UTC hour all year: it is 20:00 UTC in summer (PDT) and 21:00 UTC in winter
 * (PST). vercel.json registers both. This handler sends only when the
 * Pacific hour is 13, and only when the queue has items. Claimed rows are
 * marked digested before the Slack post, so a retry or the other hour does
 * not post them again.
 *
 * Vercel calls this on the production deployment with
 * `Authorization: Bearer $CRON_SECRET`.
 */
async function run(req: Request) {
  const auth = slackCronAuth(req.headers.get("authorization"), process.env.CRON_SECRET);
  if (auth === "missing") return NextResponse.json({ ok: false }, { status: 503 });
  if (auth === "denied") return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const result = await runRepairDigest(orgFromSession());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message.replace(/https?:\/\/\S+/g, "").slice(0, 180) : "";
    console.log(`[repair-digest] status=error error=${message || "failed"}`);
    return errorResponse(err, "Repair digest failed");
  }
}

export function GET(req: Request) {
  return run(req);
}

export function POST(req: Request) {
  return run(req);
}
