import { orgFromSession } from "@/lib/server/org-scope";
import { pgDb } from "@/lib/server/postgres-store";
import { runDriverTallies } from "@/lib/server/driver-tally-run";
import { slackCronAuth } from "@/lib/server/slack-delivery";
import { NextResponse } from "next/server";
import { runCheckoutUpkeep } from "@/lib/server/checkout-upkeep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function appOrigin(): string | undefined {
  const configured = (process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (/^https?:\/\//.test(configured)) return configured.replace(/\/$/, "");
  return undefined;
}

async function run(req: Request) {
  const auth = slackCronAuth(req.headers.get("authorization"), process.env.CRON_SECRET);
  if (auth === "missing") return NextResponse.json({ ok: false }, { status: 503 });
  if (auth === "denied") return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const orgId = orgFromSession();
    const db = pgDb();
    const { swept, ...counts } = await runCheckoutUpkeep(orgId, appOrigin(), { sweepLimit: 25 });
    let tallies = 0;
    try {
      const tally = await runDriverTallies({
        db,
        orgId,
        token: process.env.SLACK_BOT_TOKEN,
        webhookUrl: process.env.SLACK_WEBHOOK_FEEDBACK,
      });
      tallies = tally.sent;
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/https?:\/\/\S+/g, "").slice(0, 120) : "";
      console.log(`[driver-tally] status=error error=${message || "failed"}`);
    }
    return NextResponse.json({ ok: true, ...counts, swept, tallies });
  } catch (err) {
    const message = err instanceof Error ? err.message.replace(/https?:\/\/\S+/g, "").slice(0, 180) : "";
    console.log(`[slack-delivery] status=error error=${message || "failed"}`);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export function GET(req: Request) {
  return run(req);
}

export function POST(req: Request) {
  return run(req);
}
