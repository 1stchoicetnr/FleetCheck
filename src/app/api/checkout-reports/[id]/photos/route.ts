import { errorResponse } from "@/lib/server/api-error";
import { NextResponse } from "next/server";
import { addReportPhoto } from "@/lib/server/checkout-repo";
import { getReport } from "@/lib/server/checkout-repo";
import { isOfficeRequest } from "@/lib/server/office-pin";
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
    const body = (await req.json()) as {
      angle?: PhotoAngle;
      dataUrl?: string;
      capturedAt?: string;
      flaggedDamage?: boolean;
      damageNote?: string;
    };
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
    if (!(await isOfficeRequest(req))) {
      // Driver upload (no PIN): only to a report created in the last few hours.
      const existing = await getReport(id);
      const created = existing ? Date.parse(existing.createdAt) : NaN;
      if (!body.dataUrl.startsWith("data:") && !body.dataUrl.startsWith("/photo-examples/")) {
        throw new RequestError("Photo must be an image upload", 400);
      }
      if (!existing || !Number.isFinite(created) || Date.now() - created > DRIVER_UPLOAD_WINDOW_MS) {
        throw new RequestError("This checkout is closed for new photos. Ask the office.", 403);
      }
    }
    const report = await addReportPhoto(
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
