import { NextResponse } from "next/server";
import {
  getReport,
  patchReportPhotoFlags,
  SharedBackendError,
} from "@/lib/server/checkout-repo";
import { assertOfficePin } from "@/lib/server/office-pin";
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
    const { id, angle } = await params;
    const report = await getReport(id);
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
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

    const source = photo.dataUrl.startsWith("http://") || photo.dataUrl.startsWith("https://")
      ? photo.dataUrl
      : new URL(photo.dataUrl, req.url).toString();
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
    const status = err instanceof SharedBackendError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load photo" },
      { status }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; angle: string }> }
) {
  try {
    assertOfficePin(req);
    const { id, angle } = await params;
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
    const report = await patchReportPhotoFlags(id, angle as PhotoAngle, {
      flaggedDamage: body.flaggedDamage,
      damageNote: body.damageNote,
    });
    return NextResponse.json({ report });
  } catch (err) {
    const status =
      (err as { status?: number }).status ||
      (err instanceof SharedBackendError ? err.status : 500);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update photo flag" },
      { status }
    );
  }
}
