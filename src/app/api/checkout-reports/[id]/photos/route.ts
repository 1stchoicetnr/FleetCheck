import { isUploadAngle } from "@/lib/damage-closeup";
import { mayUpdateCheckout } from "@/lib/checkout-access";
import { toClientReport } from "@/lib/photo-url";
import { type ApiErrorContext, errorResponse } from "@/lib/server/api-error";
import { after, NextResponse } from "next/server";
import { upkeepSoon } from "@/lib/server/checkout-upkeep";
import {
  addReportPhoto,
  addReportPhotos,
  finishReportIfComplete,
} from "@/lib/server/checkout-repo";
import { slackLinkOrigin } from "@/lib/server/auth-http";
import { CheckoutReport } from "@/lib/types";
import { getReport } from "@/lib/server/checkout-repo";
import { isOfficeRequest } from "@/lib/server/office-pin";
import {
  assertCheckoutSubmitter,
  sessionGrantsOffice,
} from "@/lib/server/request-auth";
import { RequestError } from "@/lib/server/api-error";
import { assertPhotoDataUrl } from "@/lib/server/photo-store";
import { PHOTO_ANGLES, PhotoAngle } from "@/lib/types";
import { photoSavedLog } from "@/lib/photo-log";
import { driverMayAddPhotos, PHOTO_WINDOW_CLOSED_MESSAGE } from "@/lib/photo-window";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Once the last required photo lands, record the sent time here on the server
 * and post to Slack. Decided from the photos stored in the database, not the
 * status flag on the upload result, so whichever request lands the last photo
 * finishes the check. Old-app phones never send the "sent" step at all.
 */
async function finishIfComplete(
  req: Request,
  orgId: string,
  report: CheckoutReport
): Promise<CheckoutReport> {
  if (report.sentAt || report.archivedAt) return report;
  try {
    const result = await finishReportIfComplete(orgId, report.id, {
      appOrigin: slackLinkOrigin(req),
      source: "upload",
    });
    return result.action === "send" && result.report ? result.report : report;
  } catch (err) {
    console.log(
      `[checkout-sent] report=${report.id} result=upload-finish-failed ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return report;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const started = Date.now();
  const ctx: ApiErrorContext = { route: "photos" };
  try {
    const { id } = await params;
    ctx.reportId = id;
    const auth = await assertCheckoutSubmitter(req);
    ctx.userId = auth.userId;
    ctx.userName = auth.name;
    const orgId = auth.orgId;
    const office = sessionGrantsOffice(auth) || (await isOfficeRequest(req));
    const body = (await req.json()) as {
      angle?: PhotoAngle;
      dataUrl?: string;
      capturedAt?: string;
      flaggedDamage?: boolean;
      damageNote?: string;
      qualityNote?: string;
      qualityOverride?: string;
      qualityOverrideReason?: string;
      knownDamageId?: string;
      knownDamageAnswer?: string;
      knownDamageAnsweredAt?: string;
      damageSpot?: unknown;
      photos?: Array<{
        angle?: PhotoAngle;
        dataUrl?: string;
        capturedAt?: string;
        flaggedDamage?: boolean;
        damageNote?: string;
        qualityNote?: string;
        qualityOverride?: string;
        qualityOverrideReason?: string;
        knownDamageId?: string;
        knownDamageAnswer?: string;
        knownDamageAnsweredAt?: string;
      damageSpot?: unknown;
      }>;
    };
    const batch = Array.isArray(body.photos) ? body.photos : null;
    const existing = await getReport(orgId, id);
    if (!existing) throw new RequestError("Checkout report not found", 404);
    if (
      !mayUpdateCheckout({
        office,
        userId: auth.userId,
        userName: auth.name,
        driverUserId: existing.driverUserId,
        driverName: existing.driverName,
      })
    ) {
      throw new RequestError("You can only add photos to your own check.", 403);
    }
    if (batch) {
      if (batch.length === 0 || batch.length > 8) {
        throw new RequestError("Send 1 to 8 photos at a time", 400);
      }
      for (const photo of batch) {
        if (!photo.angle || !photo.dataUrl) {
          throw new RequestError("Each photo needs an angle and image", 400);
        }
        if (!isUploadAngle(photo.angle)) {
          throw new RequestError("Unknown photo angle", 400);
        }
        assertPhotoDataUrl(photo.dataUrl);
        if (typeof photo.damageNote === "string" && photo.damageNote.length > 2000) {
          throw new RequestError("Damage note is too long", 400);
        }
      }
      if (!office && !driverMayAddPhotos(existing, batch.map((photo) => photo.capturedAt))) {
        throw new RequestError(PHOTO_WINDOW_CLOSED_MESSAGE, 403);
      }
      const report = await addReportPhotos(
        orgId,
        id,
        batch.map((photo) => ({
          angle: photo.angle as PhotoAngle,
          dataUrl: photo.dataUrl as string,
          capturedAt: photo.capturedAt,
          flaggedDamage: photo.flaggedDamage,
          damageNote: photo.damageNote,
          qualityNote: photo.qualityNote,
          qualityOverride: photo.qualityOverride,
          qualityOverrideReason: photo.qualityOverrideReason,
          knownDamageId: photo.knownDamageId,
          knownDamageAnswer: photo.knownDamageAnswer,
          knownDamageAnsweredAt: photo.knownDamageAnsweredAt,
          damageSpot: photo.damageSpot,
        }))
      );
      const finished = await finishIfComplete(req, orgId, report);
      after(() => upkeepSoon(orgId, slackLinkOrigin(req)) ?? undefined);
      console.log(
        photoSavedLog({
          reportId: id,
          userId: auth.userId,
          office,
          photos: batch.map((photo) => ({ angle: String(photo.angle), dataUrl: String(photo.dataUrl) })),
          ms: Date.now() - started,
          stored: finished.photos.filter((photo) => Boolean(photo.dataUrl)).length,
          sent: Boolean(finished.sentAt),
        })
      );
      return NextResponse.json({ report: toClientReport(finished) });
    }
    if (!body.angle || !body.dataUrl) {
      return NextResponse.json(
        { error: "angle and dataUrl are required" },
        { status: 400 }
      );
    }
    if (!isUploadAngle(body.angle)) throw new RequestError("Unknown photo angle", 400);
    assertPhotoDataUrl(body.dataUrl);
    if (typeof body.damageNote === "string" && body.damageNote.length > 2000) {
      throw new RequestError("Damage note is too long", 400);
    }
    if (!office) {
      const created = Date.parse(existing.createdAt);
      if (!body.dataUrl.startsWith("data:") && !body.dataUrl.startsWith("/photo-examples/")) {
        throw new RequestError("Photo must be an image upload", 400);
      }
      if (!Number.isFinite(created) || !driverMayAddPhotos(existing, [body.capturedAt])) {
        throw new RequestError(PHOTO_WINDOW_CLOSED_MESSAGE, 403);
      }
    }
    const report = await addReportPhoto(
      orgId,
      id,
      body.angle,
      body.dataUrl,
      body.capturedAt,
      {
        flaggedDamage: body.flaggedDamage,
        damageNote: body.damageNote,
        qualityNote: body.qualityNote,
        qualityOverride: body.qualityOverride,
        qualityOverrideReason: body.qualityOverrideReason,
        knownDamageId: body.knownDamageId,
        knownDamageAnswer: body.knownDamageAnswer,
        knownDamageAnsweredAt: body.knownDamageAnsweredAt,
        damageSpot: body.damageSpot,
      }
    );
    const finished = await finishIfComplete(req, orgId, report);
    after(() => upkeepSoon(orgId, slackLinkOrigin(req)) ?? undefined);
    console.log(
      photoSavedLog({
        reportId: id,
        userId: auth.userId,
        office,
        photos: [{ angle: String(body.angle), dataUrl: body.dataUrl }],
        ms: Date.now() - started,
        stored: finished.photos.filter((photo) => Boolean(photo.dataUrl)).length,
        sent: Boolean(finished.sentAt),
      })
    );
    return NextResponse.json({ report: toClientReport(finished) });
  } catch (err) {
    return errorResponse(err, "Failed to save photo", ctx);
  }
}
