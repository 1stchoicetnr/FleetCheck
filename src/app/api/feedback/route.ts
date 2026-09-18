import { NextResponse } from "next/server";
import {
  FEEDBACK_NOTE_MAX,
  FEEDBACK_SCREENSHOT_MAX_CHARS,
  FeedbackPayload,
  FeedbackPhotoStep,
  isFeedbackType,
  parseImageDataUrl,
} from "@/lib/feedback";
import {
  feedbackMailerConfigured,
  feedbackToEmail,
  sendFeedbackEmail,
} from "@/lib/server/feedback-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function optionalString(value: unknown, max = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function parsePhotoStep(value: unknown): FeedbackPhotoStep | undefined {
  if (!value || typeof value !== "object") return undefined;
  const step = value as { index?: unknown; total?: unknown; label?: unknown };
  const index = Number(step.index);
  if (!Number.isFinite(index) || index < 1) return undefined;
  const total = Number(step.total);
  return {
    index: Math.round(index),
    total: Number.isFinite(total) && total > 0 ? Math.round(total) : 0,
    label: optionalString(step.label, 120) || "",
  };
}

export async function GET() {
  return NextResponse.json(
    {
      configured: feedbackMailerConfigured(),
      to: feedbackToEmail(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<FeedbackPayload>;
    if (!isFeedbackType(body.type)) {
      return NextResponse.json(
        { ok: false, error: "Pick Bug, Glitch, or Idea." },
        { status: 400 }
      );
    }

    const note = optionalString(body.note, FEEDBACK_NOTE_MAX);
    const screenshotDataUrl = optionalString(
      body.screenshotDataUrl,
      FEEDBACK_SCREENSHOT_MAX_CHARS
    );
    if (body.screenshotDataUrl && !screenshotDataUrl) {
      return NextResponse.json(
        { ok: false, error: "Screenshot is too large. Pick a smaller image." },
        { status: 400 }
      );
    }
    if (screenshotDataUrl && !parseImageDataUrl(screenshotDataUrl)) {
      return NextResponse.json(
        { ok: false, error: "Screenshot must be a JPEG, PNG, WebP, or GIF." },
        { status: 400 }
      );
    }

    const payload: FeedbackPayload = {
      type: body.type,
      note,
      screenshotDataUrl,
      unitId: optionalString(body.unitId, 80),
      unitNumber: optionalString(body.unitNumber, 40),
      plate: optionalString(body.plate, 40),
      pagePhase: optionalString(body.pagePhase, 40),
      photoStep: parsePhotoStep(body.photoStep),
      pageUrl: optionalString(body.pageUrl, 500),
      userAgent: optionalString(body.userAgent, 400),
      timestamp: optionalString(body.timestamp, 80) || new Date().toISOString(),
      driverName: optionalString(body.driverName, 80),
    };

    if (!feedbackMailerConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Feedback email is not wired yet. Set RESEND_API_KEY and a verified FEEDBACK_FROM_EMAIL on Vercel, then redeploy.",
        },
        { status: 503 }
      );
    }

    const result = await sendFeedbackEmail(payload);
    return NextResponse.json({ ok: true, id: result.id });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error ? err.message : "Could not send feedback email.",
      },
      { status: 500 }
    );
  }
}
