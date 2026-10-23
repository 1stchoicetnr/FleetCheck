import {
  effectiveCheckoutSlack,
  parseCompanySettings,
  photoStepsForCompany,
  publicCompanySettings,
  slackWebhookOverride,
} from "@/lib/company-settings";
import { RAD_CAB_COMPANY_ID } from "@/lib/company-rules";
import { orgFromSession } from "@/lib/server/org-scope";
import { pgDb, pgGetReport, pgReadCompanySettings } from "@/lib/server/postgres-store";
import { runSlackDeliveries, slackCronAuth, slackWebhooksFromEnv } from "@/lib/server/slack-delivery";
import { NextResponse } from "next/server";

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
    const doc = parseCompanySettings(await pgReadCompanySettings(orgId));
    const settings = publicCompanySettings(doc);
    const requiredRadCabAngles = photoStepsForCompany(settings, RAD_CAB_COMPANY_ID)
      .filter((step) => step.required)
      .map((step) => step.angle);
    const counts = await runSlackDeliveries(pgDb(), {
      orgId,
      getReport: (id) => pgGetReport(orgId, id),
      routes: effectiveCheckoutSlack(doc),
      webhooks: slackWebhooksFromEnv(slackWebhookOverride(doc) || undefined),
      requiredRadCabAngles,
      appOrigin: appOrigin(),
    });
    return NextResponse.json({ ok: true, ...counts });
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
