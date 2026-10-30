import { mayUpdateCheckout } from "@/lib/checkout-access";
import { toClientReport } from "@/lib/photo-url";
import { errorResponse } from "@/lib/server/api-error";
import { NextResponse } from "next/server";
import {
  addReportPhoto,
  addReportPhotos,
  confirmReportSent,
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Once the last required photo lands, record the sent time here on the server.
 * Before this, sent was only recorded by a second call from the phone. If the
 * driver closed the app or lost signal after the photos finished, the check sat
 * "Complete" with no sent time and Office showed it as Stuck after 30 minutes.
 */
async function finishIfComplete(
  req: Request,
  orgId: string,
  report: CheckoutReport
): Promise<CheckoutReport> {
  if (report.sentAt || report.archivedAt || report.status !== "complete") return report;
  try {
    const sent = await confirmReportSent(orgId, report.id, {
      appOrigin: slackLinkOrigin(req),
      office: false,
    });
    console.log(`[checkout-sent] report=${report.id} result=saved-on-upload`);
    return sent;
  } catch (err) {
    console.log(
      `[checkout-sent] report=${report.id} result=upload-finish-failed ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return report;
  }
}

const DRIVER_UPLOAD_WINDOW_MS = 6 * 60 * 60 * 1000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await assertCheckoutSubmitter(req);
    const orgId = auth.orgId;
    const office = sessionGrantsOffice(auth) || (await isOfficeRequest(req));
    const body = (await req.json()) as {
      angle?: PhotoAngle;
      dataUrl?: string;
      capturedAt?: string;
      flaggedDamage?: boolean;
      damageNote?: string;
      qualityNote?: string;
      photos?: Array<{
        angle?: PhotoAngle;
        dataUrl?: string;
        capturedAt?: string;
        flaggedDamage?: boolean;
        damageNote?: string;
        qualityNote?: string;
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
        if (!PHOTO_ANGLES.some((step) => step.angle === photo.angle)) {
          throw new RequestError("Unknown photo angle", 400);
        }
        assertPhotoDataUrl(photo.dataUrl);
        if (typeof photo.damageNote === "string" && photo.damageNote.length > 2000) {
          throw new RequestError("Damage note is too long", 400);
        }
      }
      if (!office) {
        const created = Date.parse(existing.createdAt);
        if (!Number.isFinite(created) || Date.now() - created > DRIVER_UPLOAD_WINDOW_MS) {
          throw new RequestError("This checkout is closed for new photos. Ask the office.", 403);
        }
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
        }))
      );
      const finished = await finishIfComplete(req, orgId, report);
      return NextResponse.json({ report: toClientReport(finished) });
    }
    if (!body.angle || !body.dataUrl) {
      return NextResponse.json(
        { error: "angle and dataUrl are required" },
        { status: 400 }
      );
    }
    if (!PHOTO_ANGLES.some((step) => step.angle === body.angle)) throw new RequestError("Unknown photo angle", 400);
    assertPhotoDataUrl(body.dataUrl);
    if (typeof body.damageNote === "string" && body.damageNote.length > 2000) {
      throw new RequestError("Damage note is too long", 400);
    }
    if (!office) {
      const created = Date.parse(existing.createdAt);
      if (!body.dataUrl.startsWith("data:") && !body.dataUrl.startsWith("/photo-examples/")) {
        throw new RequestError("Photo must be an image upload", 400);
      }
      if (!Number.isFinite(created) || Date.now() - created > DRIVER_UPLOAD_WINDOW_MS) {
        throw new RequestError("This checkout is closed for new photos. Ask the office.", 403);
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
      }
    );
    const finished = await finishIfComplete(req, orgId, report);
    return NextResponse.json({ report: toClientReport(finished) });
  } catch (err) {
    return errorResponse(err, "Failed to save photo");
  }
}
