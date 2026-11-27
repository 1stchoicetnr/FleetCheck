import {
  callCostUsd,
  PHOTO_CHECK_MODEL,
  PHOTO_CHECK_PROMPT,
  PHOTO_CHECK_SCHEMA,
  parseVerdict,
  differentUnitAlertMessage,
  differentUnitReading,
  photoCheckAlertMessage,
  photoCheckPlan,
  underCap,
  type PhotoCheckResult,
  type PhotoCheckSettings,
} from "./photo-check.ts";
import { photoAngleLabel } from "./photo-flags.ts";
import { formatUnitLabel } from "./utils.ts";
import type { CheckoutReport, PhotoAngle } from "./types.ts";
import type { SharedOfficeAlert } from "./server/shared-types.ts";

/** Bot photo check core: no network or storage of its own; everything comes in through deps. */

export const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const CALL_TIMEOUT_MS = 25_000;

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

export interface PhotoCheckDeps {
  settings: () => Promise<PhotoCheckSettings>;
  spentThisMonth: () => Promise<number>;
  knownDamage: () => Promise<Array<{ angle: PhotoAngle; sourceReportId?: string; repairedAt?: string }>>;
  imageDataUrl: (stored: string) => Promise<string>;
  token: () => Promise<string | undefined>;
  fetch: FetchLike;
  save: (results: Partial<Record<PhotoAngle, PhotoCheckResult>>) => Promise<void>;
  insertAlert: (alert: SharedOfficeAlert) => Promise<void>;
  now?: () => Date;
}

/** One before/after comparison through AI Gateway. */
export async function compareOnce(
  before: string,
  after: string,
  token: string,
  fetchImpl: FetchLike
): Promise<{ verdict: ReturnType<typeof parseVerdict>; costUsd: number; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await fetchImpl(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: PHOTO_CHECK_MODEL,
        stream: false,
        temperature: 0,
        max_tokens: 450,
        reasoning: { effort: "none" },
        response_format: {
          type: "json_schema",
          json_schema: { name: "photo_check", strict: true, schema: PHOTO_CHECK_SCHEMA },
        },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PHOTO_CHECK_PROMPT },
              { type: "text", text: "Image 1 (BEFORE):" },
              { type: "image_url", image_url: { url: before } },
              { type: "text", text: "Image 2 (AFTER):" },
              { type: "image_url", image_url: { url: after } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      // 401/403 = no credential; 402 = out of AI Gateway credits; 429 = rate/budget limit.
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      return { verdict: parseVerdict(""), costUsd: 0, error: `gateway ${res.status}${detail ? `: ${detail}` : ""}` };
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
    return {
      verdict: parseVerdict(data.choices?.[0]?.message?.content ?? ""),
      costUsd: callCostUsd(data.usage),
    };
  } catch (err) {
    return { verdict: parseVerdict(""), costUsd: 0, error: err instanceof Error ? err.name : "failed" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run the bot photo check on a finished check. Office queue only: a likely
 * change creates one "Found by photo check" alert; no Slack, no Bell.
 * Off unless the owner turned it on; stops at the monthly cap.
 */
export async function runPhotoCheck(
  orgId: string,
  report: CheckoutReport,
  history: CheckoutReport[],
  deps: PhotoCheckDeps
): Promise<{ ran: number; found: PhotoAngle[]; skipped?: string }> {
  const settings = await deps.settings();
  if (!settings.enabled) return { ran: 0, found: [], skipped: "off" };
  let spent = await deps.spentThisMonth();
  if (!underCap(spent, settings)) return { ran: 0, found: [], skipped: "cap" };
  const plan = photoCheckPlan(report, history, await deps.knownDamage());
  if (!plan.length) return { ran: 0, found: [], skipped: "nothing to compare" };
  const token = await deps.token();
  if (!token) return { ran: 0, found: [], skipped: "no gateway credential" };
  const now = (deps.now ?? (() => new Date()))();
  const results: Partial<Record<PhotoAngle, PhotoCheckResult>> = {};
  const seen: Array<{ plate: string; unit: string }> = [];
  let ran = 0;
  for (const item of plan) {
    if (!underCap(spent, settings)) break;
    let before: string;
    let after: string;
    try {
      [before, after] = await Promise.all([deps.imageDataUrl(item.baseline.dataUrl), deps.imageDataUrl(item.after)]);
    } catch {
      continue;
    }
    const out = await compareOnce(before, after, token, deps.fetch);
    ran += 1;
    spent += out.costUsd;
    seen.push({ plate: out.verdict.seenPlate ?? "", unit: out.verdict.seenUnit ?? "" });
    results[item.angle] = {
      changed: out.verdict.changed,
      confidence: out.verdict.confidence,
      summary: out.verdict.summary,
      ...(out.verdict.box ? { box: out.verdict.box } : {}),
      againstReportId: item.baseline.reportId,
      againstKind: item.baseline.kind,
      model: PHOTO_CHECK_MODEL,
      costUsd: out.costUsd,
      at: now.toISOString(),
      ...(out.error ? { error: out.error } : {}),
    };
    // No credential or no credits: stop instead of failing every slot.
    if (out.error && /gateway (401|402|403)/.test(out.error)) break;
  }
  const mismatch = differentUnitReading({ unitNumber: report.unitNumber, plate: report.plate }, seen);
  if (mismatch) {
    for (const angle of Object.keys(results) as PhotoAngle[]) {
      const row = results[angle];
      if (!row) continue;
      const { box: _dropped, ...rest } = row;
      results[angle] = { ...rest, changed: false };
    }
  }
  if (Object.keys(results).length) await deps.save(results);
  if (mismatch) {
    const unit = formatUnitLabel(report.unitNumber, report.plate);
    await deps.insertAlert({
      id: `${report.id}:photo_check`,
      type: "photo_check",
      message: differentUnitAlertMessage(unit, mismatch),
      vehicleId: report.vehicleId,
      vehiclePlate: unit,
      actorName: "Photo check",
      reportId: report.id,
      createdAt: now.toISOString(),
      read: false,
    });
    return { ran, found: [] };
  }
  const found = (Object.entries(results) as Array<[PhotoAngle, PhotoCheckResult]>).filter(([, r]) => r.changed);
  if (found.length) {
    const unit = formatUnitLabel(report.unitNumber, report.plate);
    await deps.insertAlert({
      id: `${report.id}:photo_check`,
      type: "photo_check",
      message: photoCheckAlertMessage(
        unit,
        found.map(([angle, r]) => ({ label: photoAngleLabel(angle), summary: r.summary, confidence: r.confidence }))
      ),
      vehicleId: report.vehicleId,
      vehiclePlate: unit,
      actorName: "Photo check",
      reportId: report.id,
      createdAt: now.toISOString(),
      read: false,
    });
  }
  return { ran, found: found.map(([a]) => a) };
}

