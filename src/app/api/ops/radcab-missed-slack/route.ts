import { timingSafeEqual } from "node:crypto";
import { photoStepsForCompany } from "@/lib/company-settings";
import { RAD_CAB_COMPANY_ID } from "@/lib/company-rules";
import { RADCABCR_CHANNEL_ID } from "@/lib/slack-config";
import { getPublicCompanySettings, getReport } from "@/lib/server/checkout-repo";
import {
  clearCheckoutDeliveryWithoutThread,
  listRadCabWindowChecks,
} from "@/lib/server/org-data";
import { FIRST_CHOICE_ORG_ID } from "@/lib/server/org-stamp";
import { pgDb, pgMigrateAndSeed } from "@/lib/server/postgres-store";
import { resendCheckoutSlack, slackBotFromEnv } from "@/lib/server/slack-delivery";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BEARER = "Xnb08opdOosbKccIaItKs9t_cl7D8KOd4YbJiZa9GW4";
const APP_ORIGIN = "https://fleet-check-eight.vercel.app";
const WINDOW_START = "2026-10-20T07:00:00.000Z";
const WINDOW_END = "2026-10-27T07:00:00.000Z";

type WindowCheck = Awaited<ReturnType<typeof listRadCabWindowChecks>>[number];

type Selected = WindowCheck & { key: string };

function authorized(req: Request): boolean {
  const got = Buffer.from(req.headers.get("authorization") || "");
  const wanted = Buffer.from(`Bearer ${BEARER}`);
  if (got.length !== wanted.length) return false;
  return timingSafeEqual(got, wanted);
}

function botReady(): string | null {
  const bot = slackBotFromEnv();
  if (!bot?.token) return "bot token missing";
  if (bot.channelId !== RADCABCR_CHANNEL_ID) return "channel mismatch";
  return null;
}

function cleanError(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/https?:\/\/\S+/g, "").slice(0, 180) || null;
}

function ptDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function ptMinutes(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  return hour * 60 + minute;
}

function unitKey(unit: string): string {
  const digits = unit.replace(/\D/g, "").replace(/^0+/, "");
  return digits || "0";
}

function plateKey(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function hasWord(name: string, word: string): boolean {
  return nameKey(name).split(" ").includes(word);
}

function selectChecks(rows: WindowCheck[]): { selected: Selected[]; nearby: WindowCheck[] } {
  const selected: Selected[] = [];
  const used = new Set<string>();
  const take = (row: WindowCheck, key: string) => {
    if (used.has(row.id)) return;
    used.add(row.id);
    selected.push({ ...row, key });
  };

  const johns = rows.filter(
    (row) =>
      row.companyId === "company-rad-cab" &&
      !row.archived &&
      nameKey(row.driverName).includes("mcdonald") &&
      unitKey(row.unitNumber) === "8"
  );
  for (const row of johns) {
    const day = ptDate(row.completedAt);
    if (day === "2026-10-23" || day === "2026-10-24") take(row, `john-${day}-${row.id.slice(0, 8)}`);
  }

  const toms = rows.filter((row) => {
    return (
      row.companyId === "company-rad-cab" &&
      hasWord(row.driverName, "tom") &&
      unitKey(row.unitNumber) === "8" &&
      ptDate(row.completedAt) === "2026-10-24" &&
      !row.archived
    );
  });
  const tomBeforeKyaw = toms
    .filter((row) => ptMinutes(row.completedAt) < 15 * 60 + 39)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  for (const row of tomBeforeKyaw) take(row, `tom-2026-10-24-${row.id.slice(0, 8)}`);

  const kens = rows.filter((row) => {
    const name = nameKey(row.driverName);
    return (
      row.companyId === "company-rad-cab" &&
      name.includes("taylor") &&
      name.includes("ken") &&
      plateKey(row.plate) === "CNW8934" &&
      ptDate(row.completedAt) === "2026-10-23"
    );
  });
  const kenPick = [...kens].sort(
    (a, b) => Math.abs(ptMinutes(a.completedAt) - (12 * 60 + 44)) - Math.abs(ptMinutes(b.completedAt) - (12 * 60 + 44))
  );
  if (kenPick[0]) take(kenPick[0], `ken-2026-10-23-${kenPick[0].id.slice(0, 8)}`);

  return { selected, nearby: rows.filter((row) => !used.has(row.id)) };
}

function publicRow(row: Selected | WindowCheck) {
  return {
    key: "key" in row ? row.key : undefined,
    id: row.id,
    companyId: row.companyId,
    unit: row.unitNumber,
    plate: row.plate,
    driver: row.driverName,
    completedAt: row.completedAt,
    sentAt: row.sentAt,
    archived: row.archived,
    photoCount: row.photoCount,
    hasSignature: row.hasSignature,
    slackStatus: row.slackStatus,
    slackError: cleanError(row.slackError),
    hasThread: row.hasThread,
    attempts: row.attempts,
  };
}

async function loadSelection() {
  await pgMigrateAndSeed();
  const rows = await listRadCabWindowChecks(pgDb(), {
    orgId: FIRST_CHOICE_ORG_ID,
    companyId: RAD_CAB_COMPANY_ID,
    start: WINDOW_START,
    end: WINDOW_END,
  });
  return selectChecks(rows);
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const blocked = botReady();
  if (blocked) return NextResponse.json({ error: blocked }, { status: 503 });
  const { selected, nearby } = await loadSelection();
  return NextResponse.json({
    selected: selected.map(publicRow),
    nearby: nearby.map(publicRow),
  });
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const blocked = botReady();
  if (blocked) return NextResponse.json({ error: blocked }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { key?: string } | null;
  const key = body?.key?.trim() || "";
  const { selected } = await loadSelection();
  const match = selected.find((row) => row.key === key);
  if (!match) return NextResponse.json({ error: "That check is not one of the missed Rad Cab posts" }, { status: 400 });
  if (match.slackStatus === "sent" && match.hasThread) {
    return NextResponse.json({ ...publicRow(match), result: "already_sent" });
  }
  if (match.slackStatus === "sent") {
    await clearCheckoutDeliveryWithoutThread(pgDb(), FIRST_CHOICE_ORG_ID, match.id);
  }
  const report = await getReport(FIRST_CHOICE_ORG_ID, match.id);
  if (!report || report.companyId !== RAD_CAB_COMPANY_ID) {
    return NextResponse.json({ error: "Checkout report not found" }, { status: 404 });
  }
  const settings = await getPublicCompanySettings(FIRST_CHOICE_ORG_ID);
  const status = await resendCheckoutSlack(pgDb(), report, {
    orgId: FIRST_CHOICE_ORG_ID,
    route: { mode: "every", destination: "radcabcr" },
    webhooks: {},
    appOrigin: APP_ORIGIN,
    photoSteps: photoStepsForCompany(settings, RAD_CAB_COMPANY_ID),
    slackApi: slackBotFromEnv() ?? null,
  });
  const after = await listRadCabWindowChecks(pgDb(), {
    orgId: FIRST_CHOICE_ORG_ID,
    companyId: RAD_CAB_COMPANY_ID,
    start: WINDOW_START,
    end: WINDOW_END,
  });
  const fresh = after.find((row) => row.id === match.id);
  return NextResponse.json({
    ...publicRow({ ...match, ...(fresh || {}), key }),
    result: status,
    slackStatus: fresh?.slackStatus ?? match.slackStatus,
    slackError: cleanError(fresh?.slackError ?? null),
    hasThread: fresh?.hasThread ?? match.hasThread,
  });
}
