import { NextResponse } from "next/server";
import {
  FEEDBACK_NOTE_MAX,
  FEEDBACK_SCREENSHOT_MAX_CHARS,
  FeedbackPayload,
  FeedbackPhotoStep,
  feedbackDeliveryChannel,
  feedbackSavedMessage,
  isFeedbackType,
  parseImageDataUrl,
} from "@/lib/feedback";
import {
  feedbackMailerConfigured,
  sendFeedbackEmail,
} from "@/lib/server/feedback-mail";
import {
  feedbackSlackWebhook,
  postFeedbackToSlack,
} from "@/lib/server/feedback-slack";
import { generateId } from "@/lib/utils";
import {
  listFeedback,
  markFeedbackDelivered,
  saveFeedback,
  storeFeedbackScreenshot,
} from "@/lib/server/feedback-store";
import { errorResponse } from "@/lib/server/api-error";
import { isOfficeRequest } from "@/lib/server/office-pin";
import { orgFromSession } from "@/lib/server/org-scope";

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

function deliveryChannel() {
  return feedbackDeliveryChannel({
    slackWebhook: feedbackSlackWebhook(),
    resendApiKey: process.env.RESEND_API_KEY,
  });
}

export async function GET(req: Request) {
  try {
    const delivery = deliveryChannel();
    if (await isOfficeRequest(req)) {
      const feedback = await listFeedback(orgFromSession());
      return NextResponse.json(
        { delivery, feedback },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { delivery },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Could not load feedback.");
  }
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
      unitId: optionalString(body.unitId, 80),
      unitNumber: optionalString(body.unitNumber, 40),
      plate: optionalString(body.plate, 40),
      pagePhase: optionalString(body.pagePhase, 40),
      photoStep: parsePhotoStep(body.photoStep),
      pageUrl: optionalString(body.pageUrl, 500),
      userAgent: optionalString(body.userAgent, 400),
      timestamp: optionalString(body.timestamp, 80) || new Date().toISOString(),
      driverName: optionalString(body.driverName, 80),
      userName: optionalString(body.userName, 80),
      userRole: optionalString(body.userRole, 40),
    };

    const planned = deliveryChannel();
    const id = generateId();
    const orgId = orgFromSession();
    const screenshotUrl = await storeFeedbackScreenshot(orgId, id, screenshotDataUrl);
    const saved = await saveFeedback(orgId, payload, screenshotUrl, "office", id);

    if (planned === "slack") {
      try {
        await postFeedbackToSlack({ payload, screenshotUrl });
        await markFeedbackDelivered(orgId, saved.id, "slack").catch((markErr) => {
          console.error("[api] feedback delivery mark failed:", markErr);
        });
        return NextResponse.json({
          ok: true,
          id: saved.id,
          delivered: "slack",
          message: feedbackSavedMessage("slack"),
        });
      } catch (err) {
        console.error("[api] feedback slack failed:", err);
        return NextResponse.json({
          ok: true,
          id: saved.id,
          delivered: "office",
          message: feedbackSavedMessage("office", { slackFailed: true }),
        });
      }
    }

    if (planned === "email" && feedbackMailerConfigured()) {
      try {
        await sendFeedbackEmail({ ...payload, screenshotDataUrl });
        await markFeedbackDelivered(orgId, saved.id, "email").catch((markErr) => {
          console.error("[api] feedback delivery mark failed:", markErr);
        });
        return NextResponse.json({
          ok: true,
          id: saved.id,
          delivered: "email",
          message: feedbackSavedMessage("email"),
        });
      } catch (err) {
        console.error("[api] feedback email failed:", err);
        return NextResponse.json({
          ok: true,
          id: saved.id,
          delivered: "office",
          message:
            "Saved for Office. Email did not send. Set SLACK_WEBHOOK_FEEDBACK to an incoming webhook aimed at a DM with @ashley.",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      id: saved.id,
      delivered: "office",
      message: feedbackSavedMessage("office"),
    });
  } catch (err) {
    return errorResponse(err, "Could not save feedback. Please try again.");
  }
}
