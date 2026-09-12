import { NextResponse } from "next/server";
import { checkOfficePin } from "@/lib/server/office-pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { pin?: string };
  if (!checkOfficePin(body.pin || "")) {
    return NextResponse.json({ ok: false, error: "Invalid office PIN" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
