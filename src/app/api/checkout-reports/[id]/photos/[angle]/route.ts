import { errorResponse } from "@/lib/server/api-error";
import { photoViewKind, storedPhotoFetchTarget, toClientReport } from "@/lib/photo-url";
import { NextResponse } from "next/server";
import {
  getReport,
  patchReportPhotoFlags,
} from "@/lib/server/checkout-repo";
import { assertDriverMayCheckVehicle } from "@/lib/server/driver-fleets";
import { assertVehicleInScope } from "@/lib/server/fleet-scope";
import { assertApprovedUser, assertOfficeAccess } from "@/lib/server/request-auth";
import { AuthError } from "@/lib/server/auth-accounts";
import { PhotoAngle } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function decodeDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Expected a base64 data URL");
  }
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; angle: string }> }
) {
  try {
    const auth = await assertApprovedUser(req);
    const { id, angle } = await params;
    const report = await getReport(auth.orgId, id);
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    const view = photoViewKind(auth.role, auth.name, report.driverName);
    if (view === "deny") throw new AuthError("Sign in required.", 401);
    if (view === "office") await assertVehicleInScope(auth, report.vehicleId);
    if (view === "next-driver") await assertDriverMayCheckVehicle(auth, report.vehicleId);
    const photo = report.photos.find((item) => item.angle === (angle as PhotoAngle));
    if (!photo?.dataUrl) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    if (photo.dataUrl.startsWith("data:")) {
      const { buffer, contentType } = decodeDataUrl(photo.dataUrl);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    const source = storedPhotoFetchTarget(photo.dataUrl, req.url);
    if (!source) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }
    const upstream = await fetch(source);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Could not load stored photo" },
        { status: 502 }
      );
    }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    return errorResponse(err, "Failed to load photo");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; angle: string }> }
) {
  try {
    const auth = await assertOfficeAccess(req);
    const { id, angle } = await params;
    const existing = await getReport(auth.orgId, id);
    if (!existing) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    await assertVehicleInScope(auth, existing.vehicleId);
    const body = (await req.json()) as {
      flaggedDamage?: boolean;
      damageNote?: string;
    };
    if (typeof body.flaggedDamage !== "boolean") {
      return NextResponse.json(
        { error: "flaggedDamage must be true or false" },
        { status: 400 }
      );
    }
    const report = await patchReportPhotoFlags(auth.orgId, id, angle as PhotoAngle, {
      flaggedDamage: body.flaggedDamage,
      damageNote: body.damageNote,
    });
    return NextResponse.json({ report: toClientReport(report) });
  } catch (err) {
    return errorResponse(err, "Failed to update photo flag");
  }
}
