import { activeIssueFlagLabels } from "./inspection-form.ts";
import type { CheckoutInspectionForm } from "./inspection-form.ts";
import { cleanDamageNote, photoAngleLabel } from "./photo-flags.ts";
import { ISSUE_FLAG_ITEMS } from "./inspection-form.ts";
import { flagKey, markKey, noteKey, photoKey } from "./damage-keys.ts";
import type { CheckoutReport, PhotoAngle } from "./types.ts";

/** Bell, Rad Cab office. Damage alerts DM her. */
export const BELL_SLACK_USER = "U098Z6J6W4W";

export interface AlertDamageDetails {
  issueFlags: string[];
  photos: { angle: PhotoAngle; label: string; note?: string }[];
  /** Inspection form damage notes, e.g. "Left side: Dent". */
  notes: string[];
  marks: string[];
}

const SIDES = [
  ["left", "Left side"],
  ["right", "Right side"],
  ["front", "Front"],
  ["rear", "Rear"],
] as const;

type DetailSource = Pick<CheckoutReport, "photos"> & {
  inspectionForm?: CheckoutInspectionForm | null;
};

/**
 * Damage lines for an alert. With `keys`, only those items are listed, so an
 * alert made for new damage does not repeat damage already on an open alert.
 */
export function alertDamageDetails(
  report: DetailSource,
  keys?: readonly string[] | null
): AlertDamageDetails {
  const form = report.inspectionForm ?? undefined;
  const damage = form?.damage ?? {};
  const keep = (key: string) => !keys || keys.includes(key);
  const notes: string[] = [];
  const notedSides = new Set<string>();
  for (const [key, label] of SIDES) {
    const text = cleanDamageNote(damage[key]);
    if (!text) continue;
    notedSides.add(key);
    if (keep(noteKey(key, text))) notes.push(`${label}: ${text}`);
  }
  const issueFlags = keys
    ? ISSUE_FLAG_ITEMS.filter((item) => form?.issueFlags?.[item.id] && keep(flagKey(item.id))).map(
        (item) => item.label
      )
    : activeIssueFlagLabels(form);
  return {
    issueFlags,
    photos: report.photos
      .filter((photo) => photo.flaggedDamage && keep(photoKey(photo.angle, cleanDamageNote(photo.damageNote))))
      .map((photo) => ({
        angle: photo.angle,
        label: photoAngleLabel(photo.angle),
        note: cleanDamageNote(photo.damageNote),
      })),
    notes,
    marks: (damage.marks ?? [])
      .map(String)
      .filter((side) => !keys || (!notedSides.has(side) && keep(markKey(side as (typeof SIDES)[number][0])))),
  };
}

export function hasAlertDetails(details: AlertDamageDetails): boolean {
  return Boolean(
    details.issueFlags.length || details.photos.length || details.notes.length || details.marks.length
  );
}

/** Short comma list for the alert title. */
export function alertDetailParts(details: AlertDamageDetails): string[] {
  return [
    ...details.issueFlags,
    ...details.photos.map((p) => (p.note ? `${p.label} photo (${p.note})` : `${p.label} photo`)),
    ...details.notes,
    ...(details.notes.length === 0 && details.marks.length
      ? [`Marked: ${details.marks.join(", ")}`]
      : []),
  ];
}

export function officeCheckUrl(origin: string, reportId: string): string {
  return `${origin.replace(/\/$/, "")}/office/${encodeURIComponent(reportId)}`;
}

export function repairSlackText(input: {
  unit: string;
  vehicle: string;
  driverName: string;
  alertLines: string[];
  details: AlertDamageDetails;
  checkUrl: string;
  /** Before / after photo lines and the like, above the check link. */
  extraLines?: string[];
}): string {
  const parts = alertDetailParts(input.details);
  return [
    `*Inspekt damage alert* · ${input.unit}`,
    `*Vehicle:* ${input.vehicle}`,
    `*Driver:* ${input.driverName}`,
    ...input.alertLines,
    parts.length ? `*Details:*\n${parts.map((p) => `• ${p}`).join("\n")}` : "*Details:* none entered",
    ...(input.extraLines ?? []),
    `<${input.checkUrl}|Open the check>`,
  ].join("\n");
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

async function slackCall(send: Fetch, token: string, method: string, body: object) {
  const res = await send(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; channel?: { id?: string } };
  return data;
}

/** Repairs channel post plus Bell DM. Bot token first, webhook fallback for the channel. */
export async function sendRepairSlack(input: {
  text: string;
  channelId: string;
  token?: string | null;
  webhookUrl?: string | null;
  dmUserId?: string | null;
  fetchImpl?: Fetch;
}): Promise<{ channel: "bot" | "webhook" | "failed" | "skipped"; dm: "sent" | "failed" | "skipped" }> {
  const send = input.fetchImpl ?? (fetch as unknown as Fetch);
  const token = input.token?.trim();
  let channel: "bot" | "webhook" | "failed" | "skipped" = "skipped";
  let dm: "sent" | "failed" | "skipped" = "skipped";
  if (token) {
    await slackCall(send, token, "conversations.join", { channel: input.channelId }).catch(() => null);
    const posted = await slackCall(send, token, "chat.postMessage", {
      channel: input.channelId,
      text: input.text,
      unfurl_links: false,
    }).catch(() => ({ ok: false, error: "network" }));
    channel = posted.ok ? "bot" : "failed";
    if (!posted.ok) console.error("[alerts] repairs post failed:", posted.error);
  }
  if (channel !== "bot" && input.webhookUrl?.trim()) {
    try {
      const res = await send(input.webhookUrl.trim(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input.text, username: "Inspekt" }),
      });
      channel = res.ok ? "webhook" : "failed";
    } catch {
      channel = "failed";
    }
  }
  if (token && input.dmUserId) {
    try {
      const opened = await slackCall(send, token, "conversations.open", { users: input.dmUserId });
      const id = opened.channel?.id;
      const posted = id
        ? await slackCall(send, token, "chat.postMessage", { channel: id, text: input.text, unfurl_links: false })
        : { ok: false, error: opened.error };
      dm = posted.ok ? "sent" : "failed";
      if (!posted.ok) console.error("[alerts] Bell DM failed:", posted.error);
    } catch {
      dm = "failed";
    }
  }
  return { channel, dm };
}
