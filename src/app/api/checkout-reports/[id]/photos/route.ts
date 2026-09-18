import { NextResponse } from "next/server";
import { addReportPhoto, SharedBackendError } from "@/lib/server/checkout-repo";
import { PhotoAngle } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const status = err instanceof SharedBackendError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save photo" },
      { status }
    );
  }
}
