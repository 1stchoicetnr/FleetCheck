import {
  FEEDBACK_TO_DEFAULT,
  FeedbackPayload,
  feedbackStepLabel,
  feedbackSubject,
  parseImageDataUrl,
} from "@/lib/feedback";

export function feedbackToEmail(): string {
  return (process.env.FEEDBACK_TO_EMAIL || FEEDBACK_TO_DEFAULT).trim();
}

export function feedbackFromEmail(): string {
  return (
    process.env.FEEDBACK_FROM_EMAIL ||
    "FleetCheck <beth.t@example.com>"
  ).trim();
}

export function feedbackMailerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function row(label: string, value: string | undefined): string {
  const text = value?.trim() ? value.trim() : "—";
  return `<tr><th align="left" style="padding:4px 12px 4px 0;vertical-align:top;color:#4b5563;font-weight:600;">${escapeHtml(label)}</th><td style="padding:4px 0;color:#111827;">${escapeHtml(text)}</td></tr>`;
}

export function formatFeedbackEmail(payload: FeedbackPayload): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = feedbackSubject({
    type: payload.type,
    unitNumber: payload.unitNumber,
    photoStep: payload.photoStep,
    pagePhase: payload.pagePhase,
  });
  const step = feedbackStepLabel(payload.photoStep, payload.pagePhase);
  const note = payload.note?.trim() || "(no note)";
  const lines = [
    `Type: ${payload.type}`,
    `Note: ${note}`,
    `Unit #: ${payload.unitNumber?.trim() || "—"}`,
    `Unit id: ${payload.unitId?.trim() || "—"}`,
    `Plate: ${payload.plate?.trim() || "—"}`,
    `Photo step: ${step || "—"}`,
    `Page: ${payload.pagePhase?.trim() || "—"}`,
    `URL: ${payload.pageUrl?.trim() || "—"}`,
    `Driver: ${payload.driverName?.trim() || "—"}`,
    `Time: ${payload.timestamp?.trim() || "—"}`,
    `User-agent: ${payload.userAgent?.trim() || "—"}`,
    payload.screenshotDataUrl ? "Screenshot: attached" : "Screenshot: none",
  ];
  const html = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.45;">
      <p style="margin:0 0 12px;"><strong>FleetCheck app feedback</strong> (not a vehicle damage/oil report)</p>
      ${payload.note?.trim() ? `<p style="margin:0 0 16px;white-space:pre-wrap;">${escapeHtml(payload.note.trim())}</p>` : "<p style=\"margin:0 0 16px;color:#6b7280;\">(no note)</p>"}
      <table style="border-collapse:collapse;font-size:13px;">
        ${row("Type", payload.type)}
        ${row("Unit #", payload.unitNumber)}
        ${row("Unit id", payload.unitId)}
        ${row("Plate", payload.plate)}
        ${row("Photo step", step)}
        ${row("Page", payload.pagePhase)}
        ${row("URL", payload.pageUrl)}
        ${row("Driver", payload.driverName)}
        ${row("Time", payload.timestamp)}
        ${row("User-agent", payload.userAgent)}
      </table>
    </div>
  `;
  return { subject, text: lines.join("\n"), html };
}

export async function sendFeedbackEmail(
  payload: FeedbackPayload
): Promise<{ id?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Feedback email is not configured. Set RESEND_API_KEY (and a verified FEEDBACK_FROM_EMAIL) on Vercel."
    );
  }

  const { subject, text, html } = formatFeedbackEmail(payload);
  const attachments: Array<{ filename: string; content: string }> = [];
  if (payload.screenshotDataUrl) {
    const parsed = parseImageDataUrl(payload.screenshotDataUrl);
    if (parsed) {
      attachments.push({
        filename: parsed.filename,
        content: parsed.base64,
      });
    }
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: feedbackFromEmail(),
      to: [feedbackToEmail()],
      subject,
      text,
      html,
      attachments: attachments.length ? attachments : undefined,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    error?: { message?: string };
  };
  if (!res.ok) {
    const detail =
      data.error?.message || data.message || `Resend request failed (${res.status})`;
    throw new Error(detail);
  }
  return { id: data.id };
}
