import { errorResponse } from "@/lib/server/api-error";
import { NextResponse } from "next/server";
import { addReportPhoto, addReportPhotos } from "@/lib/server/checkout-repo";
import { getReport } from "@/lib/server/checkout-repo";
import { isOfficeRequest } from "@/lib/server/office-pin";
import { resolveRequestAuth, sessionGrantsOffice } from "@/lib/server/request-auth";
import { RequestError } from "@/lib/server/api-error";
import { assertPhotoDataUrl } from "@/lib/server/photo-store";
import { PHOTO_ANGLES, PhotoAngle } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DRIVER_UPLOAD_WINDOW_MS = 6 * 60 * 60 * 1000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await resolveRequestAuth(req);
    const orgId = auth.orgId;
    const office = sessionGrantsOffice(auth) || (await isOfficeRequest(req));
    const body = (await req.json()) as {
      angle?: PhotoAngle;
      dataUrl?: string;
      capturedAt?: string;
      flaggedDamage?: boolean;
      damageNote?: string;
      photos?: Array<{
        angle?: PhotoAngle;
        dataUrl?: string;
        capturedAt?: string;
        flaggedDamage?: boolean;
        damageNote?: string;
      }>;
    };
    const batch = Array.isArray(body.photos) ? body.photos : null;
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
        const existing = await getReport(orgId, id);
        const created = existing ? Date.parse(existing.createdAt) : NaN;
        if (!existing || !Number.isFinite(created) || Date.now() - created > DRIVER_UPLOAD_WINDOW_MS) {
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
        }))
      );
      return NextResponse.json({ report });
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
      // Driver upload (no PIN): only to a report created in the last few hours.
      const existing = await getReport(orgId, id);
      const created = existing ? Date.parse(existing.createdAt) : NaN;
      if (!body.dataUrl.startsWith("data:") && !body.dataUrl.startsWith("/photo-examples/")) {
        throw new RequestError("Photo must be an image upload", 400);
      }
      if (!existing || !Number.isFinite(created) || Date.now() - created > DRIVER_UPLOAD_WINDOW_MS) {
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
      }
    );
    return NextResponse.json({ report });
  } catch (err) {
    return errorResponse(err, "Failed to save photo");
  }
}
